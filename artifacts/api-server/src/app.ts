import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import { setupAuth } from "./auth";
import { logger } from "./lib/logger";
import healthRouter from "./routes/health";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({
  origin: true,
  credentials: true,
}));

// Parse JSON with rawBody capture for webhook verification
declare module "http" {
  interface IncomingMessage {
    rawBody?: Buffer;
  }
}

app.use(
  express.json({
    limit: "10mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));

// Serve uploaded files
const uploadsReportsDir = path.join(process.cwd(), "uploads", "reports");
const uploadsDocsDir = path.join(process.cwd(), "uploads", "documents");
const uploadsPrescriptionsDir = path.join(process.cwd(), "uploads", "prescriptions");
const uploadsPhotosDir = path.join(process.cwd(), "uploads", "consultant-photos");
const uploadsSignaturesDir = path.join(process.cwd(), "uploads", "consultant-signatures");
fs.mkdirSync(uploadsReportsDir, { recursive: true });
fs.mkdirSync(uploadsDocsDir, { recursive: true });
fs.mkdirSync(uploadsPrescriptionsDir, { recursive: true });
fs.mkdirSync(uploadsPhotosDir, { recursive: true });
fs.mkdirSync(uploadsSignaturesDir, { recursive: true });
app.use("/api/uploads/reports", express.static(uploadsReportsDir));
app.use("/api/uploads/documents", express.static(uploadsDocsDir));
app.use("/api/uploads/prescriptions", express.static(uploadsPrescriptionsDir));
app.use("/api/uploads/consultant-photos", express.static(uploadsPhotosDir));
app.use("/api/uploads/consultant-signatures", express.static(uploadsSignaturesDir));

// Setup session-based auth
await setupAuth(app);

// Health check endpoint (mounted before registerRoutes)
app.use("/api", healthRouter);

export default app;
