import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import multer from "multer";
import { registerRoutes } from "./routes";
import { initializeAdminUser } from "./adminInit";
import { setupVite, serveStatic, log } from "./vite";
import { MAX_UPLOAD_ERROR_MESSAGE } from "./middleware";

const app = express();
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
}));
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
  // Initialize admin user if needed
  await initializeAdminUser();
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT') {
        if (!res.headersSent) {
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
  });
})();
