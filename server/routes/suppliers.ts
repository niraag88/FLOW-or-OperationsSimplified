import type { Express } from "express";
import { ZodError } from 'zod';
import { suppliers, recycleBin } from "@shared/schema";
import { insertSupplierSchema } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { businessStorage } from "../businessStorage";
import { requireAuth, writeAuditLog, type AuthenticatedRequest } from "../middleware";

export function registerSupplierRoutes(app: Express) {
  app.get('/api/suppliers', requireAuth(), async (req: AuthenticatedRequest, res) => {
    try {
      const result = await businessStorage.getSuppliers();
      res.json(result);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      res.status(500).json({ error: 'Failed to fetch suppliers' });
    }
  });

  app.post('/api/suppliers', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const validatedData = insertSupplierSchema.parse(req.body);
      const supplier = await businessStorage.createSupplier(validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(supplier.id), targetType: 'supplier', action: 'CREATE', details: `Supplier '${supplier.name}' created` });
      res.status(201).json(supplier);
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('Error creating supplier:', error);
      res.status(500).json({ error: 'Failed to create supplier' });
    }
  });

  app.put('/api/suppliers/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const supplierId = parseInt(req.params.id);
      const validatedData = insertSupplierSchema.partial().parse(req.body);
      const supplier = await businessStorage.updateSupplier(supplierId, validatedData);
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(supplierId), targetType: 'supplier', action: 'UPDATE', details: `Supplier '${supplier.name}' updated` });
      res.json(supplier);
    } catch (error) {
      console.error('Error updating supplier:', error);
      res.status(500).json({ error: 'Failed to update supplier' });
    }
  });

  app.delete('/api/suppliers/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const supplierId = parseInt(req.params.id);
      if (isNaN(supplierId)) return res.status(400).json({ error: 'Invalid ID' });
      const [supplierToDelete] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId));
      if (!supplierToDelete) return res.status(404).json({ error: 'Supplier not found' });

      // Task #365 (RF-2): the recycle-bin insert and the live delete
      // run in a single transaction. If the live delete raises a FK
      // error (supplier still attached to a PO or GRN — supplier has
      // the highest FK density of the three master-data entities) the
      // transaction rolls back the recycle-bin row, so the list view
      // never shows a "deleted" entry that is still alive.
      try {
        await db.transaction(async (tx) => {
          await tx.insert(recycleBin).values({
            documentType: 'Supplier',
            documentId: String(supplierId),
            documentNumber: supplierToDelete.name,
            documentData: JSON.stringify({ header: supplierToDelete, items: [] }),
            deletedBy: req.user?.username || 'unknown',
            deletedDate: new Date(),
            reason: 'Deleted from UI',
            originalStatus: supplierToDelete.isActive ? 'Active' : 'Inactive',
            canRestore: true,
          });
          await tx.delete(suppliers).where(eq(suppliers.id, supplierId));
        });
      } catch (deleteErr: unknown) {
        const isObj = typeof deleteErr === 'object' && deleteErr !== null;
        const causeObj = isObj && 'cause' in deleteErr && typeof (deleteErr as { cause: unknown }).cause === 'object' && (deleteErr as { cause: unknown }).cause !== null ? (deleteErr as { cause: Record<string, unknown> }).cause : null;
        const errCode = (isObj && 'code' in deleteErr ? String((deleteErr as { code: unknown }).code) : '') || (causeObj && 'code' in causeObj ? String(causeObj.code) : '');
        const errMsg = isObj && 'message' in deleteErr ? String((deleteErr as { message: unknown }).message) : '';
        if (errCode === '23503' || errMsg.includes('foreign key') || errMsg.includes('violates foreign key')) {
          return res.status(400).json({ error: 'Cannot delete supplier — it is referenced by one or more purchase orders or goods receipts. Delete or reassign those documents first.' });
        }
        throw deleteErr;
      }
      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(supplierId), targetType: 'supplier', action: 'DELETE', details: `Supplier '${supplierToDelete.name}' moved to recycle bin` });
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting supplier:', error);
      res.status(500).json({ error: 'Failed to delete supplier' });
    }
  });
}
