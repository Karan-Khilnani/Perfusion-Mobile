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
