import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { initializeAdminUser } from "./adminInit";
import { setupVite, serveStatic, log } from "./vite";
import { pool } from "./db";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
  // Run idempotent startup migrations
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS storage_objects (
        key TEXT PRIMARY KEY,
        size_bytes BIGINT NOT NULL DEFAULT 0,
        uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    // Upgrade existing INTEGER column to BIGINT if needed
    await pool.query(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'storage_objects'
            AND column_name = 'size_bytes'
            AND data_type = 'integer'
        ) THEN
          ALTER TABLE storage_objects ALTER COLUMN size_bytes TYPE BIGINT;
        END IF;
      END $$
    `);
  } catch (err) {
    console.error('Startup migration failed (storage_objects):', err);
  }

  // Initialize admin user if needed
  await initializeAdminUser();
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
