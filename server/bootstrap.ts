/**
 * Server bootstrap (Task #321).
 *
 * Originally lived inside `server/index.ts` as the top-level body.
 * It was extracted into this module so that `server/index.ts` can run
 * `validateConfigOrExit()` BEFORE any side-effect imports (notably
 * `./db`, which throws on missing DATABASE_URL the moment it's
 * imported). ESM hoists static imports, so a top-level
 * `validateConfigOrExit()` call in index.ts cannot pre-empt them. By
 * importing this file dynamically from index.ts after validation, we
 * guarantee the validator's clear, aggregated error message wins
 * instead of a cryptic db.ts throw.
 */

import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import multer from "multer";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { initializeAdminUser } from "./adminInit";
import { setupVite, serveStatic, log } from "./vite";
import { MAX_UPLOAD_ERROR_MESSAGE, startAuditSpoolReplayTimer } from "./middleware";
import { pool } from "./db";
import { startBackupScheduler } from "./scheduler";

const app = express();
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

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

// Initialize admin user if needed
await initializeAdminUser();

const server = await registerRoutes(app);

app.use(async (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT') {
      // Parity with the raw-body overflow path in PUT /api/storage/upload/:token:
      // when multer aborts an oversized multipart body, consume the signed
      // token so it doesn't sit in the DB until the periodic cleanup runs.
      // Awaited so the deletion commits in the same response cycle.
      const uploadMatch =
        req.method === 'PUT' &&
        /^\/api\/storage\/upload\/([A-Za-z0-9]+)$/.exec(req.path);
      if (uploadMatch) {
        const token = uploadMatch[1];
        try {
          await pool.query('DELETE FROM signed_tokens WHERE token = $1', [token]);
        } catch (delErr) {
          console.error('Failed to consume signed token after multer reject:', delErr);
        }
      }
      if (!res.headersSent) {
        // Match the raw-body overflow contract: signal connection termination
        // so the client doesn't try to keep reusing the socket after a 413.
        res.set('Connection', 'close');
        return res.status(413).json({ error: MAX_UPLOAD_ERROR_MESSAGE });
      }
      return next(err);
    }
    if (!res.headersSent) {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  if (!res.headersSent) {
    res.status(status).json({ message });
  }
  console.error(err);
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
  startBackupScheduler();
  // Task #375: drain any audit rows that the async path spooled to
  // disk during a previous DB outage. Re-runs every 60s.
  startAuditSpoolReplayTimer();
});
