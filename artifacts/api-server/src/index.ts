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
