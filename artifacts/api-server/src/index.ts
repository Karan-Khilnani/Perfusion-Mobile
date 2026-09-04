import app from "./app";
import { logger } from "./lib/logger";
import { createServer } from "http";
import { registerRoutes } from "./routes/routes";
import { seedDatabase } from "./seed";
import { startConsultationScheduler } from "./services/consultation-scheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);

async function startServer() {
  try {
    // Seed database (ensures admin account exists)
    await seedDatabase();

    // Incremental schema migrations (idempotent — safe to run every startup)
    const { getPool } = await import("./db");
    const pool = getPool();
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reminder_fired_at timestamptz`);
    await pool.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS contact_phone varchar(20)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS mobile_push_tokens (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar NOT NULL,
      token text NOT NULL,
      platform varchar(10) NOT NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS mobile_push_tokens_token_idx ON mobile_push_tokens(token)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS mobile_push_tokens_user_idx ON mobile_push_tokens(user_id)`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS callback_phone varchar(20)`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS callback_ward_name varchar(100)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS seeker_ward_contacts (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar NOT NULL,
      ward_name varchar(100) NOT NULL,
      phone_number varchar(20) NOT NULL,
      created_at timestamptz DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS call_logs (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id varchar NOT NULL,
      initiator_user_id varchar NOT NULL,
      caller_role varchar(20) NOT NULL,
      caller_phone_masked varchar(30),
      callee_phone_masked varchar(30),
      exotel_call_sid varchar(255),
      status varchar(50) NOT NULL DEFAULT 'initiated',
      duration_seconds integer,
      created_at timestamptz DEFAULT now()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS call_logs_booking_idx ON call_logs(booking_id)`);
    await pool.query(`ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS caller_phone_masked varchar(30)`);
    await pool.query(`ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS callee_phone_masked varchar(30)`);
    await pool.query(`ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS duration_seconds integer`);
    // Post-prescription feature toggle columns
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS post_rx_expires_at timestamptz`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS post_rx_video_enabled boolean NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS post_rx_calls_enabled boolean NOT NULL DEFAULT false`);
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS post_rx_uploads_enabled boolean NOT NULL DEFAULT false`);
    // Review summaries — additional prescriptions within the 24h post-rx window
    await pool.query(`CREATE TABLE IF NOT EXISTS prescription_reviews (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id varchar NOT NULL,
      provider_id varchar NOT NULL,
      review_number integer NOT NULL,
      diagnosis text,
      medications text,
      physician_notes text,
      follow_up varchar(255),
      advice text,
      approved_at timestamptz NOT NULL DEFAULT now(),
      approved_by_user_id varchar,
      approver_ip varchar(100),
      pdf_url varchar(500),
      trail_pdf_url varchar(500),
      created_at timestamptz DEFAULT now()
    )`);
    await pool.query(`ALTER TABLE prescription_reviews ADD COLUMN IF NOT EXISTS trail_pdf_url varchar(500)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS prescription_reviews_booking_idx ON prescription_reviews(booking_id)`);
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = current_schema()
            AND indexname = 'prescription_reviews_booking_review_unique'
        ) THEN
          WITH ranked AS (
            SELECT
              id,
              booking_id,
              ROW_NUMBER() OVER (
                PARTITION BY booking_id
                ORDER BY approved_at ASC, created_at ASC, id ASC
              )::integer AS new_review_number
            FROM prescription_reviews
          ),
          affected_bookings AS (
            SELECT DISTINCT ranked.booking_id
            FROM ranked
            JOIN prescription_reviews AS existing ON existing.id = ranked.id
            WHERE existing.review_number IS DISTINCT FROM ranked.new_review_number
          )
          UPDATE prescription_reviews AS review
          SET
            review_number = ranked.new_review_number,
            trail_pdf_url = CASE
              WHEN affected_bookings.booking_id IS NOT NULL THEN NULL
              ELSE review.trail_pdf_url
            END
          FROM ranked
          LEFT JOIN affected_bookings ON affected_bookings.booking_id = ranked.booking_id
          WHERE review.id = ranked.id
            AND (
              review.review_number IS DISTINCT FROM ranked.new_review_number
              OR affected_bookings.booking_id IS NOT NULL
            );
        END IF;
      END $$;
    `);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS prescription_reviews_booking_review_unique ON prescription_reviews(booking_id, review_number)`);

    // User agreements table (click-wrap)
    await pool.query(`CREATE TABLE IF NOT EXISTS user_agreements (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id varchar NOT NULL REFERENCES users(id),
      unique_ref varchar(120) NOT NULL,
      agreement_version varchar(20) NOT NULL DEFAULT 'v2.1',
      party_name varchar(255) NOT NULL,
      organization_name varchar(255),
      email varchar(255) NOT NULL,
      phone varchar(30),
      role varchar(30) NOT NULL,
      provider_type varchar(30),
      ip_address varchar(100),
      user_agent text,
      pdf_url varchar(500),
      signed_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz DEFAULT now()
    )`);
    // Backfill columns for pre-existing installations (idempotent)
    await pool.query(`ALTER TABLE user_agreements ADD COLUMN IF NOT EXISTS unique_ref varchar(120)`);
    await pool.query(`ALTER TABLE user_agreements ADD COLUMN IF NOT EXISTS provider_type varchar(30)`);
    // Backfill unique_ref for legacy rows (PK guarantees uniqueness), then enforce NOT NULL.
    await pool.query(
      `UPDATE user_agreements SET unique_ref = 'PHPL-AGR-LEGACY-' || id WHERE unique_ref IS NULL`
    );
    await pool.query(`ALTER TABLE user_agreements ALTER COLUMN unique_ref SET NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS user_agreements_user_idx ON user_agreements(user_id)`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS user_agreements_unique_ref_idx ON user_agreements(unique_ref)`);
    // Hard idempotency: one signed agreement per (user, version). Dedupe any
    // legacy duplicates (keep earliest) before adding the unique index.
    await pool.query(`
      DELETE FROM user_agreements ua
      WHERE ua.id NOT IN (
        SELECT DISTINCT ON (user_id, agreement_version) id
        FROM user_agreements
        ORDER BY user_id, agreement_version, signed_at ASC, id ASC
      )
    `);
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS user_agreements_user_version_unique ON user_agreements(user_id, agreement_version)`
    );
    // Retrofit the FK to users(id) for tables created before it was added.
    // NOT VALID avoids a blocking scan; validation is best-effort so a legacy
    // orphan row cannot crash startup.
    try {
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE table_name = 'user_agreements' AND constraint_type = 'FOREIGN KEY'
          ) THEN
            ALTER TABLE user_agreements
              ADD CONSTRAINT user_agreements_user_id_fkey
              FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
          END IF;
        END $$;
      `);
      await pool.query(`ALTER TABLE user_agreements VALIDATE CONSTRAINT user_agreements_user_id_fkey`);
    } catch (fkErr) {
      logger.warn({ err: fkErr }, "user_agreements FK retrofit/validation skipped");
    }

    // Register all routes
    await registerRoutes(httpServer, app);

    // Start consultation reminder scheduler
    startConsultationScheduler();

    // Error handler
    app.use((err: any, _req: any, res: any, _next: any) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      logger.error({ err }, message);
      res.status(status).json({ message });
    });

    httpServer.listen(
      {
        port,
        host: "0.0.0.0",
      },
      () => {
        logger.info({ port }, "Server listening");
      },
    );

    httpServer.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        logger.error({ port }, "Port already in use");
      } else {
        logger.error({ err: error }, "Server error");
      }
      process.exit(1);
    });

  } catch (error) {
    logger.error({ err: error }, "Failed to start server");
    process.exit(1);
  }
}

startServer();
