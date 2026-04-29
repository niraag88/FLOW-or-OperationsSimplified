import type { Express } from "express";
import { users, auditLog, storageObjects } from "@shared/schema";
import { db } from "../db";
import { eq, lt, sql } from "drizzle-orm";
import { requireAuth, requireRole, hashPassword, writeAuditLog, objectStorageClient, type AuthenticatedRequest } from "../middleware";
import { businessStorage } from "../businessStorage";
import { sendIfMissingConfirmation } from "../typedConfirmation";
import {
  USER_DELETE_PHRASE,
  RETENTION_PURGE_PHRASE,
} from "../../shared/destructiveActionPhrases";

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

  // POST /api/settings/retention/purge — manual "Run now" for the
  // retention sweep. Requires the typed confirmation phrase. The
  // scheduled background sweep calls the same logic without HTTP and
  // is unaffected.
  app.post('/api/settings/retention/purge', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    if (!sendIfMissingConfirmation(
      res,
      req.body,
      RETENTION_PURGE_PHRASE,
      'retention_purge_confirmation_required',
      'Retention purge',
    )) return;

    try {
      const settings = await businessStorage.getCompanySettings();
      const auditLogRetentionDays = settings?.retentionAuditLogsDays ?? 730;
      const exportRetentionDays = settings?.retentionExportsDays ?? 60;

      // Purge old audit log records
      const auditLogCutoff = new Date();
      auditLogCutoff.setDate(auditLogCutoff.getDate() - auditLogRetentionDays);
      const deletedAuditLogs = await db.delete(auditLog)
        .where(lt(auditLog.timestamp, auditLogCutoff))
        .returning({ id: auditLog.id });

      // Purge old export storage objects (xlsx, csv, pdf)
      const exportCutoff = new Date();
      exportCutoff.setDate(exportCutoff.getDate() - exportRetentionDays);
      const oldExports = await db.select({ key: storageObjects.key })
        .from(storageObjects)
        .where(lt(storageObjects.uploadedAt, exportCutoff));

      let storageFilesDeleted = 0;
      for (const obj of oldExports) {
        // Only purge files under the exports/ prefix to avoid deleting permanent business documents
        const key = obj.key.toLowerCase();
        if (key.startsWith('exports/') && (key.endsWith('.xlsx') || key.endsWith('.csv') || key.endsWith('.pdf'))) {
          try {
            await objectStorageClient.delete(obj.key);
          } catch {
            // If deletion from object storage fails, still remove the tracking record
          }
          await db.delete(storageObjects).where(eq(storageObjects.key, obj.key));
          storageFilesDeleted++;
        }
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: 'retention', targetType: 'retention_purge', action: 'DELETE', details: `Retention purge: ${deletedAuditLogs.length} audit logs (>${auditLogRetentionDays}d), ${storageFilesDeleted} export files (>${exportRetentionDays}d)` });
      res.json({ success: true, auditLogsDeleted: deletedAuditLogs.length, storageFilesDeleted, auditLogRetentionDays, exportRetentionDays });
    } catch (error) {
      console.error('Error running retention purge:', error);
      res.status(500).json({ error: 'Failed to run retention purge' });
    }
  });

  app.get('/api/users', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const allUsers = await db.select({
        id: users.id,
        username: users.username,
        role: users.role,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        active: users.active,
        createdAt: users.createdAt,
        lastLogin: users.lastLogin,
        createdBy: users.createdBy
      }).from(users);

      res.json({ users: allUsers });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  app.post('/api/users', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    try {
      const { username, password, role, firstName, lastName, email, active } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      const [existingUser] = await db.select().from(users).where(eq(users.username, username));
      if (existingUser) {
        return res.status(409).json({ error: 'Username already exists' });
      }

      const hashedPassword = await hashPassword(password);

      const [newUser] = await db.insert(users).values({
        username,
        password: hashedPassword,
        role: role || 'Staff',
        firstName,
        lastName,
        email,
        active: active !== undefined ? active : true,
        createdBy: req.user!.id
      }).returning({
        id: users.id,
        username: users.username,
        role: users.role,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        active: users.active,
        createdAt: users.createdAt,
        createdBy: users.createdBy
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: newUser.id, targetType: 'user', action: 'CREATE', details: `User @${newUser.username} (${newUser.role}) created` });
      res.status(201).json({ user: newUser });
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  app.put('/api/users/:id', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.params.id;
      const { username, role, firstName, lastName, email, active, password } = req.body;

      if (username !== undefined && username !== '') {
        const [existing] = await db.select({ id: users.id })
          .from(users)
          .where(eq(users.username, username));
        if (existing && existing.id !== userId) {
          return res.status(409).json({ error: 'Username already taken' });
        }
      }

      const trimmedPassword = typeof password === 'string' ? password.trim() : undefined;
      if (trimmedPassword) {
        if (trimmedPassword.length < 6) {
          return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }
      }

      const hashedPassword = trimmedPassword ? await hashPassword(trimmedPassword) : undefined;

      const [updatedUser] = await db.update(users)
        .set({
          ...(username !== undefined && username !== '' && { username }),
          ...(role !== undefined && { role }),
          ...(firstName !== undefined && { firstName }),
          ...(lastName !== undefined && { lastName }),
          ...(email !== undefined && { email }),
          ...(active !== undefined && { active }),
          ...(hashedPassword !== undefined && { password: hashedPassword })
        })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          username: users.username,
          role: users.role,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          active: users.active,
          createdAt: users.createdAt,
          lastLogin: users.lastLogin,
          createdBy: users.createdBy
        });

      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: userId, targetType: 'user', action: 'UPDATE', details: `User @${updatedUser.username} updated` });
      res.json({ user: updatedUser });
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  });

  // DELETE /api/users/:id — Admin user-account delete. Requires the typed
  // confirmation phrase. The guard runs BEFORE the self-delete check.
  app.delete('/api/users/:id', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    if (!sendIfMissingConfirmation(
      res,
      req.body,
      USER_DELETE_PHRASE,
      'user_delete_confirmation_required',
      'Delete user account',
    )) return;

    try {
      const userId = req.params.id;

      if (userId === req.user!.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      const [deletedUser] = await db.delete(users)
        .where(eq(users.id, userId))
        .returning({ id: users.id, username: users.username });

      if (!deletedUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: userId, targetType: 'user', action: 'DELETE', details: `User @${deletedUser.username} deleted` });
      res.json({ success: true, deletedUser });
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  });

  app.put('/api/users/:id/password', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.params.id;
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ error: 'Password is required' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }

      const hashedPassword = await hashPassword(password);

      const [updatedUser] = await db.update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          username: users.username,
          role: users.role,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email
        });

      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: userId, targetType: 'user', action: 'UPDATE', details: `Password changed for user @${updatedUser.username}` });
      res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
      console.error('Error changing user password:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  });
}
