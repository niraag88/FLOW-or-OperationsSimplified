import type { Express } from "express";
import { ZodError } from 'zod';
import { brands as brandsTable, recycleBin } from "@shared/schema";
import { insertBrandSchema } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, writeAuditLog, type AuthenticatedRequest } from "../middleware";

export function registerBrandRoutes(app: Express) {
  app.get('/api/brands', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const result = await businessStorage.getBrands();
      res.json(result);
    } catch (error) {
      console.error('Error fetching brands:', error);
      res.status(500).json({ error: 'Failed to fetch brands' });
    }
  });

  app.post('/api/brands', requireAuth(), async (req: AuthenticatedRequest, res) => {
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
      console.error('Error creating brand:', error);
      res.status(500).json({ error: 'Failed to create brand' });
    }
  });

  app.put('/api/brands/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const validatedData = insertBrandSchema.partial().parse(req.body);
      const brand = await businessStorage.updateBrand(brandId, validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(brandId), targetType: 'brand', action: 'UPDATE', details: `Brand '${brand.name}' updated` });
      res.json(brand);
    } catch (error) {
      console.error('Error updating brand:', error);
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
      console.error('Error fetching brand:', error);
      res.status(500).json({ error: 'Failed to fetch brand' });
    }
  });

  app.delete('/api/brands/:id', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const brandId = parseInt(req.params.id);
      const [brandToDelete] = await db.select().from(brandsTable).where(eq(brandsTable.id, brandId));
      if (!brandToDelete) return res.status(404).json({ error: 'Brand not found' });

      await db.insert(recycleBin).values({
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
      await businessStorage.deleteBrand(brandId);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(brandId), targetType: 'brand', action: 'DELETE', details: `Brand '${brandToDelete.name}' moved to recycle bin` });
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting brand:', error);
      res.status(500).json({ error: 'Failed to delete brand' });
    }
  });
}
