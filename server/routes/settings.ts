import type { Express } from "express";
import { requireAuth, writeAuditLog, type AuthenticatedRequest } from "../middleware";
import { businessStorage } from "../businessStorage";

export function registerSettingsRoutes(app: Express) {
  app.get('/api/company-settings', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const settings = await businessStorage.getCompanySettings();
      res.json(settings || {});
    } catch (error) {
      console.error('Error fetching company settings:', error);
      res.status(500).json({ error: 'Failed to fetch company settings' });
    }
  });

  app.put('/api/company-settings', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const settings = await businessStorage.updateCompanySettings({
        ...req.body,
        updatedBy: req.user!.id
      });
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: 'company', targetType: 'company_settings', action: 'UPDATE', details: 'Company settings updated' });
      res.json(settings);
    } catch (error) {
      console.error('Error updating company settings:', error);
      res.status(500).json({ error: 'Failed to update company settings' });
    }
  });

  app.get('/api/settings/retention', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const settings = await businessStorage.getCompanySettings();
      res.json({
        retention_exports_days: settings?.retentionExportsDays ?? 60,
        retention_audit_logs_days: settings?.retentionAuditLogsDays ?? 730,
        lifecycle_cold_storage_after_days: settings?.retentionColdStorageDays ?? 30,
      });
    } catch (error) {
      console.error('Error fetching retention settings:', error);
      res.status(500).json({ error: 'Failed to fetch retention settings' });
    }
  });

  app.post('/api/settings/retention', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const { retention_exports_days, retention_audit_logs_days, lifecycle_cold_storage_after_days } = req.body;
      await businessStorage.updateCompanySettings({
        retentionExportsDays: parseInt(retention_exports_days) || 60,
        retentionAuditLogsDays: parseInt(retention_audit_logs_days) || 730,
        retentionColdStorageDays: parseInt(lifecycle_cold_storage_after_days) || 30,
        updatedBy: req.user!.id,
      });
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: 'company', targetType: 'company_settings', action: 'UPDATE', details: 'Retention settings updated' });
      res.json({ success: true });
    } catch (error) {
      console.error('Error saving retention settings:', error);
      res.status(500).json({ error: 'Failed to save retention settings' });
    }
  });
}
