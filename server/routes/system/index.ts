import type { Express } from "express";
import { registerHealthRoutes } from "./health";
import { registerStorageUploadRoutes } from "./storage-uploads";
import { registerStorageDownloadRoutes } from "./storage-downloads";
import { registerAuditRecycleRoutes } from "./audit-recycle";
import { registerBackupRoutes } from "./backups";
import { registerRestoreRoutes } from "./restore";
import { registerFactoryResetRoutes } from "./factory-reset";
import { registerBooksRoutes } from "./books";

export function registerSystemRoutes(app: Express) {
  registerHealthRoutes(app);
  registerStorageUploadRoutes(app);
  registerStorageDownloadRoutes(app);
  registerAuditRecycleRoutes(app);
  registerBackupRoutes(app);
  registerRestoreRoutes(app);
  registerFactoryResetRoutes(app);
  registerBooksRoutes(app);
}
