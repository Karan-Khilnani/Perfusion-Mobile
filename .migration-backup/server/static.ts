import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  
  if (!fs.existsSync(distPath)) {
    console.error(`Build directory not found: ${distPath}`);
    console.error("Make sure to build the client first with 'npm run build'");
    
    app.use("*", (_req, res) => {
      res.status(503).json({ 
        error: "Application not built", 
        message: "The application is still being deployed. Please try again in a moment." 
      });
    });
    return;
  }

  const indexPath = path.resolve(distPath, "index.html");
  if (!fs.existsSync(indexPath)) {
    console.error(`index.html not found in build directory: ${distPath}`);
    
    app.use("*", (_req, res) => {
      res.status(503).json({ 
        error: "Build incomplete", 
        message: "The application build is incomplete. Please try again in a moment." 
      });
    });
    return;
  }

  app.use(express.static(distPath, {
    maxAge: "1d",
    etag: true,
  }));

  app.use("*", (_req, res) => {
    res.sendFile(indexPath);
  });
  
  console.log(`Serving static files from: ${distPath}`);
}
