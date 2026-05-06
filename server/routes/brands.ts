import type { Express } from "express";
import { ZodError } from 'zod';
import { brands as brandsTable, recycleBin } from "@shared/schema";
import { insertBrandSchema } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, writeAuditLog, type AuthenticatedRequest } from "../middleware";
import { logger } from "../logger";

export function registerBrandRoutes(app: Express) {
  app.get('/api/brands', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const result = await businessStorage.getBrands();
      res.json(result);
    } catch (error) {
      logger.error('Error fetching brands:', error);
      res.status(500).json({ error: 'Failed to fetch brands' });
    }
  });

  app.post('/api/brands', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const validatedData = insertBrandSchema.parse(req.body);
      const brand = await businessStorage.createBrand(validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(brand.id), targetType: 'brand', action: 'CREATE', details: `Brand '${brand.name}' created` });
      res.status(201).json(brand);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      const isObj = typeof error === 'object' && error !== null;
      const causeObj = isObj && 'cause' in error && typeof (error as { cause: unknown }).cause === 'object' && (error as { cause: unknown }).cause !== null ? (error as { cause: Record<string, unknown> }).cause : null;
      const errCode = (isObj && 'code' in error ? String((error as { code: unknown }).code) : '') || (causeObj && 'code' in causeObj ? String(causeObj.code) : '');
      if (errCode === '23505') {
        return res.status(409).json({ error: 'A brand with that name already exists.' });
      }
      logger.error('Error creating brand:', error);
      res.status(500).json({ error: 'Failed to create brand' });
    }
  });

  app.put('/api/brands/:id', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const validatedData = insertBrandSchema.partial().parse(req.body);
      const brand = await businessStorage.updateBrand(brandId, validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(brandId), targetType: 'brand', action: 'UPDATE', details: `Brand '${brand.name}' updated` });
      res.json(brand);
    } catch (error) {
      logger.error('Error updating brand:', error);
      res.status(500).json({ error: 'Failed to update brand' });
    }
  });

  app.get('/api/brands/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const brandId = parseInt(req.params.id);
      if (isNaN(brandId)) return res.status(400).json({ error: 'Invalid ID' });
      const brand = await businessStorage.getBrandById(brandId);
      if (!brand) return res.status(404).json({ error: 'Brand not found' });
      res.json(brand);
    } catch (error) {
      logger.error('Error fetching brand:', error);
      res.status(500).json({ error: 'Failed to fetch brand' });
    }
  });

  app.delete('/api/brands/:id', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const brandId = parseInt(req.params.id);
      if (isNaN(brandId)) return res.status(400).json({ error: 'Invalid ID' });
      const [brandToDelete] = await db.select().from(brandsTable).where(eq(brandsTable.id, brandId));
      if (!brandToDelete) return res.status(404).json({ error: 'Brand not found' });

      // Task #365 (RF-2): the recycle-bin insert and the live delete
      // run in a single transaction. If the live delete raises a FK
      // error (e.g. brand still attached to a product or PO) the
      // transaction rolls back the recycle-bin row, leaving the
      // database exactly as it was — no orphan "deleted" entry.
      try {
        await db.transaction(async (tx) => {
          await tx.insert(recycleBin).values({
            documentType: 'Brand',
            documentId: String(brandId),
            documentNumber: brandToDelete.name,
            documentData: JSON.stringify({ header: brandToDelete, items: [] }),
            deletedBy: req.user?.username || 'unknown',
            deletedDate: new Date(),
            reason: 'Deleted from UI',
            originalStatus: brandToDelete.isActive ? 'Active' : 'Inactive',
            canRestore: true,
          });
          await tx.delete(brandsTable).where(eq(brandsTable.id, brandId));
        });
      } catch (deleteErr: unknown) {
        const isObj = typeof deleteErr === 'object' && deleteErr !== null;
        const causeObj = isObj && 'cause' in deleteErr && typeof (deleteErr as { cause: unknown }).cause === 'object' && (deleteErr as { cause: unknown }).cause !== null ? (deleteErr as { cause: Record<string, unknown> }).cause : null;
        const errCode = (isObj && 'code' in deleteErr ? String((deleteErr as { code: unknown }).code) : '') || (causeObj && 'code' in causeObj ? String(causeObj.code) : '');
        const errMsg = isObj && 'message' in deleteErr ? String((deleteErr as { message: unknown }).message) : '';
        if (errCode === '23503' || errMsg.includes('foreign key') || errMsg.includes('violates foreign key')) {
          return res.status(400).json({ error: 'Cannot delete brand — it is referenced by one or more products or purchase orders. Remove or reassign those records first.' });
        }
        throw deleteErr;
      }
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(brandId), targetType: 'brand', action: 'DELETE', details: `Brand '${brandToDelete.name}' moved to recycle bin` });
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting brand:', error);
      res.status(500).json({ error: 'Failed to delete brand' });
    }
  });
}
