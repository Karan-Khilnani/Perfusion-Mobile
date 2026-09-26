import app from "./app";
import { logger } from "./lib/logger";
import { createServer } from "http";
import { registerRoutes } from "./routes/routes";
import { seedDatabase } from "./seed";
import { startConsultationScheduler } from "./services/consultation-scheduler";
import { verifyMobileCallPush } from "./services/mobile-call-push";

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
    await pool.query(`ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS call_type varchar(10) NOT NULL DEFAULT 'video'`);
    await pool.query(`ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS session_generation varchar NOT NULL DEFAULT gen_random_uuid()`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS call_sessions_generation_idx ON call_sessions(session_generation)`);
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
    await pool.query(`ALTER TABLE mobile_push_tokens ADD COLUMN IF NOT EXISTS token_type varchar(20) NOT NULL DEFAULT 'EXPO'`);
    await pool.query(`ALTER TABLE mobile_push_tokens ADD COLUMN IF NOT EXISTS device_id varchar(120)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS mobile_callback_devices (
      user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      device_name varchar(100) NOT NULL,
      phone_number varchar(25) NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
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

    // Case File normalized records. Legacy booking URL/advisory fields are intentionally
    // retained; these tables provide durable metadata for all new Case File activity.
    await pool.query(`CREATE TABLE IF NOT EXISTS case_file_profiles (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      patient_user_id varchar NOT NULL UNIQUE,
      allergies text,
      comorbidities text,
      baseline_medications text,
      baseline_parameters text,
      past_admissions text,
      emergency_contact text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS case_file_summaries (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id varchar NOT NULL UNIQUE,
      allergies text,
      comorbidities text,
      presenting_complaint text,
      present_illness text,
      working_diagnosis text,
      clinical_history text,
      submitted_by_user_id varchar,
      submitted_at timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now()
    )`);
    await pool.query(`ALTER TABLE case_file_summaries ADD COLUMN IF NOT EXISTS present_illness text`);
    await pool.query(`CREATE TABLE IF NOT EXISTS case_file_messages (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id varchar NOT NULL,
      sender_user_id varchar NOT NULL,
      sender_role varchar(30) NOT NULL,
      kind varchar(40) NOT NULL DEFAULT 'text',
      body text,
      created_at timestamptz DEFAULT now()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS case_file_messages_booking_created_idx ON case_file_messages(booking_id, created_at)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS case_file_attachments (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id varchar NOT NULL,
      message_id varchar,
      uploader_user_id varchar NOT NULL,
      uploader_role varchar(30) NOT NULL,
      original_filename varchar(255),
      mime_type varchar(150),
      byte_size integer,
      object_path text,
      legacy_url text,
      source varchar(40) NOT NULL DEFAULT 'document',
      category varchar(40) NOT NULL DEFAULT 'uncategorized',
      created_at timestamptz DEFAULT now()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS case_file_attachments_booking_created_idx ON case_file_attachments(booking_id, created_at)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS case_file_vitals (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id varchar NOT NULL,
      recorded_by_user_id varchar NOT NULL,
      observed_at timestamptz NOT NULL,
      systolic_bp integer,
      diastolic_bp integer,
      heart_rate integer,
      respiratory_rate integer,
      intake double precision,
      output double precision,
      hourly_urine_output double precision,
      gcs integer,
      created_at timestamptz DEFAULT now()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS case_file_vitals_booking_observed_idx ON case_file_vitals(booking_id, observed_at)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS case_file_advisories (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      booking_id varchar NOT NULL,
      author_user_id varchar NOT NULL,
      narrative text NOT NULL,
      attachment_ids text[],
      authored_at timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS case_file_advisories_booking_authored_idx ON case_file_advisories(booking_id, authored_at)`);
    // Old writes derived the complaint from the generic summary. Keep that text as a
    // legacy clinical summary, but stop presenting the duplicate as a verified complaint.
    await pool.query(`
      UPDATE case_file_summaries s
      SET presenting_complaint = NULL
      FROM bookings b
      WHERE s.booking_id = b.id
        AND b.booking_type = 'consultation'
        AND s.presenting_complaint IS NOT NULL
        AND s.presenting_complaint = b.clinical_summary
    `);
    // Safe, repeatable legacy backfill for encounter summaries and URL attachments.
    await pool.query(`
      INSERT INTO case_file_summaries (booking_id, allergies, presenting_complaint, present_illness, working_diagnosis, clinical_history, submitted_by_user_id)
      SELECT b.id, CASE WHEN COALESCE(b.patient_allergy_not_specified, true) THEN NULL ELSE b.patient_allergies END,
        NULL, NULL, b.provisional_diagnosis, b.clinical_summary, b.user_id
      FROM bookings b
      WHERE b.booking_type = 'consultation'
      ON CONFLICT (booking_id) DO UPDATE SET
        allergies = EXCLUDED.allergies,
        working_diagnosis = EXCLUDED.working_diagnosis,
        clinical_history = COALESCE(EXCLUDED.clinical_history, case_file_summaries.clinical_history),
        submitted_by_user_id = EXCLUDED.submitted_by_user_id,
        submitted_at = COALESCE(case_file_summaries.submitted_at, EXCLUDED.submitted_at)
      WHERE NOT EXISTS (
        SELECT 1 FROM bookings b2
        WHERE b2.id = case_file_summaries.booking_id
          AND (b2.status IN ('completed', 'cancelled') OR b2.prescription_approved_at IS NOT NULL)
      )
    `);
    await pool.query(`
      INSERT INTO case_file_attachments (id, booking_id, uploader_user_id, uploader_role, legacy_url, source, category)
      SELECT md5('legacy-document:' || b.id || ':' || u.url), b.id, b.user_id, 'care_seeker', u.url, 'legacy_document', 'uncategorized'
      FROM bookings b CROSS JOIN LATERAL unnest(COALESCE(b.document_urls, ARRAY[]::text[])) AS u(url)
      WHERE u.url IS NOT NULL AND u.url <> '' AND u.url <> 'undefined'
      ON CONFLICT (id) DO NOTHING
    `);
    await pool.query(`
      INSERT INTO case_file_attachments (id, booking_id, uploader_user_id, uploader_role, legacy_url, source, category)
      SELECT md5('legacy-report:' || b.id || ':' || u.url), b.id, COALESCE(b.provider_id, b.user_id), CASE WHEN b.provider_id IS NULL THEN 'care_seeker' ELSE 'provider' END, u.url, 'legacy_report', 'general'
      FROM bookings b CROSS JOIN LATERAL (VALUES (b.report_url), (b.processed_report_url)) AS u(url)
      WHERE b.booking_type = 'consultation' AND u.url IS NOT NULL AND u.url <> ''
      ON CONFLICT (id) DO NOTHING
    `);
    await pool.query(`
      DELETE FROM case_file_messages
      WHERE id IN (
        SELECT md5('clinical-advisory-reference:' || id) FROM case_file_advisories
        WHERE id = md5('legacy-advisory:' || booking_id)
      )
    `);
    await pool.query(`DELETE FROM case_file_advisories WHERE id LIKE 'legacy-advisory:%'`);
    await pool.query(`
      INSERT INTO case_file_advisories (id, booking_id, author_user_id, narrative, authored_at)
      SELECT md5('legacy-advisory:' || b.id), b.id, COALESCE(b.prescription_approved_by_user_id, (SELECT p.user_id FROM providers p WHERE p.id = b.provider_id)),
        concat_ws(E'\\n\\n', NULLIF(b.prescription_diagnosis, ''), NULLIF(b.prescription_advice, ''), NULLIF(b.prescription_physician_notes, ''), NULLIF(b.prescription_medications, '')),
        COALESCE(b.prescription_approved_at, b.prescription_generated_at, b.created_at)
      FROM bookings b
      WHERE b.booking_type = 'consultation'
        AND b.prescription_approved_at IS NOT NULL
        AND COALESCE(b.prescription_approved_by_user_id, (SELECT p.user_id FROM providers p WHERE p.id = b.provider_id)) IS NOT NULL
        AND concat_ws(E'\\n\\n', NULLIF(b.prescription_diagnosis, ''), NULLIF(b.prescription_advice, ''), NULLIF(b.prescription_physician_notes, ''), NULLIF(b.prescription_medications, '')) <> ''
      ON CONFLICT (id) DO NOTHING
    `);
    await pool.query(`
      INSERT INTO case_file_advisories (id, booking_id, author_user_id, narrative, authored_at, attachment_ids)
      SELECT md5('legacy-review:' || r.id), r.booking_id, COALESCE(r.approved_by_user_id, (SELECT p.user_id FROM providers p WHERE p.id = b.provider_id)), concat_ws(E'\\n\\n', NULLIF(r.diagnosis, ''), NULLIF(r.advice, ''), NULLIF(r.physician_notes, ''), NULLIF(r.medications, '')), r.approved_at,
        CASE WHEN r.pdf_url IS NOT NULL THEN ARRAY[r.pdf_url] ELSE ARRAY[]::text[] END
      FROM prescription_reviews r JOIN bookings b ON b.id = r.booking_id
      WHERE r.approved_at IS NOT NULL
        AND COALESCE(r.approved_by_user_id, (SELECT p.user_id FROM providers p WHERE p.id = b.provider_id)) IS NOT NULL
        AND concat_ws(E'\\n\\n', NULLIF(r.diagnosis, ''), NULLIF(r.advice, ''), NULLIF(r.physician_notes, ''), NULLIF(r.medications, '')) <> ''
      ON CONFLICT (id) DO NOTHING
    `);
    await pool.query(`
      INSERT INTO case_file_attachments (id, booking_id, uploader_user_id, uploader_role, legacy_url, source, category)
      SELECT md5('legacy-treatment:' || b.id || ':' || u.url), b.id, b.user_id, 'care_seeker', u.url, 'legacy_treatment_chart', 'treatment_chart'
      FROM bookings b CROSS JOIN LATERAL unnest(COALESCE(b.treatment_chart_urls, ARRAY[]::text[])) AS u(url)
      WHERE u.url IS NOT NULL AND u.url <> '' AND u.url <> 'undefined'
      ON CONFLICT (id) DO NOTHING
    `);
    await pool.query(`
      INSERT INTO case_file_messages (id, booking_id, sender_user_id, sender_role, kind, body, created_at)
      SELECT md5('clinical-advisory-reference:' || a.id), a.booking_id, a.author_user_id, 'provider',
        'clinical_advisory_reference',
        json_build_object('advisoryId', a.id, 'narrative', a.narrative)::text,
        a.authored_at
      FROM case_file_advisories a
      WHERE NOT EXISTS (
        SELECT 1 FROM case_file_messages m
        WHERE m.id = md5('clinical-advisory-reference:' || a.id)
      )
    `);
    await pool.query(`
      INSERT INTO case_file_messages (id, booking_id, sender_user_id, sender_role, kind, created_at)
      SELECT md5('legacy-attachment-message:' || a.id), a.booking_id, a.uploader_user_id, a.uploader_role,
        'attachment', COALESCE(b.created_at, a.created_at, now())
      FROM case_file_attachments a
      JOIN bookings b ON b.id = a.booking_id
      WHERE a.message_id IS NULL AND a.source LIKE 'legacy_%'
      ON CONFLICT (id) DO NOTHING
    `);
    await pool.query(`
      UPDATE case_file_attachments a
      SET message_id = md5('legacy-attachment-message:' || a.id)
      WHERE a.message_id IS NULL AND a.source LIKE 'legacy_%'
        AND EXISTS (
          SELECT 1 FROM case_file_messages m
          WHERE m.id = md5('legacy-attachment-message:' || a.id)
        )
    `);

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
        void verifyMobileCallPush();
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
