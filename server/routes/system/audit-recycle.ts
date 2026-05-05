import type { Express } from "express";
import { auditLog, recycleBin, products, brands, suppliers, customers } from "@shared/schema";
import { db } from "../../db";
import { eq, desc } from "drizzle-orm";
import {
  requireAuth,
  writeAuditLog,
  writeAuditLogSync,
  type AuthenticatedRequest,
} from "../../middleware";
import { sendIfMissingConfirmation } from "../../typedConfirmation";
import { RECYCLE_BIN_PERMANENT_DELETE_PHRASE } from "../../../shared/destructiveActionPhrases";
import { logger } from "../../logger";

export function registerAuditRecycleRoutes(app: Express) {
  app.get('/api/audit-logs', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const logs = await db.select().from(auditLog).orderBy(desc(auditLog.timestamp)).limit(500);
      res.json(logs);
    } catch (error) {
      logger.error('Error fetching audit logs:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  });

  // POST /api/audit-logs intentionally not exposed: audit log records are
  // written server-side from each action handler via writeAuditLog(), so the
  // log can never be forged through the HTTP layer (Task #319).

  app.get('/api/recycle-bin', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    try {
      const items = await db.select().from(recycleBin).orderBy(desc(recycleBin.deletedDate));
      const mapped = items.map(item => ({
        id: item.id,
        document_type: item.documentType,
        document_id: item.documentId,
        document_number: item.documentNumber,
        deleted_by: item.deletedBy,
        deleted_date: item.deletedDate,
        reason: item.reason,
        original_status: item.originalStatus,
        can_restore: item.canRestore,
        created_at: item.createdAt,
      }));
      res.json(mapped);
    } catch (error) {
      logger.error('Error fetching recycle bin:', error);
      res.status(500).json({ error: 'Failed to fetch recycle bin' });
    }
  });

  // POST /api/recycle-bin intentionally not exposed: each entity DELETE
  // handler (invoices, delivery orders, quotations, purchase orders, etc.)
  // writes its own recycle-bin row server-side. Accepting forged
  // recycle-bin payloads from a client would let any logged-in user inject
  // bogus recovery rows referencing documents they never owned (Task #319).

  // DELETE /api/recycle-bin/:id — permanent delete. Requires the typed
  // confirmation phrase in the body.
  app.delete('/api/recycle-bin/:id', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    if (!sendIfMissingConfirmation(
      res,
      req.body,
      RECYCLE_BIN_PERMANENT_DELETE_PHRASE,
      'recycle_bin_permanent_delete_confirmation_required',
      'Permanently delete from recycle bin',
    )) return;

    try {
      const id = parseInt(req.params.id);
      // Task #375: wrap the destructive delete and its audit row in a
      // single transaction so the audit trail can never silently drop
      // a permanent-delete event. If the audit insert fails, the
      // recycle-bin row is preserved.
      const rbItem = await db.transaction(async (tx) => {
        const [item] = await tx.select({ documentType: recycleBin.documentType, documentNumber: recycleBin.documentNumber }).from(recycleBin).where(eq(recycleBin.id, id));
        await tx.delete(recycleBin).where(eq(recycleBin.id, id));
        await writeAuditLogSync(tx, { actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'recycle_bin', action: 'DELETE', details: `Permanently deleted ${item?.documentType} #${item?.documentNumber}` });
        return item;
      });
      res.json({ success: true, message: 'Permanently deleted from recycle bin' });
    } catch (error) {
      logger.error('Error permanently deleting from recycle bin:', error);
      res.status(500).json({ error: 'Failed to permanently delete' });
    }
  });

  app.post('/api/recycle-bin/:id/restore', requireAuth(['Admin', 'Manager']), async (req: AuthenticatedRequest, res) => {
    const RACE_LOST = '__bin_race_lost__';
    const UNKNOWN_TYPE = '__bin_unknown_type__';
    try {
      const id = parseInt(req.params.id);

      // Pre-check (no lock) so a true 404 stays a 404. Anyone who
      // gets past this point but then finds the row gone after
      // acquiring FOR UPDATE lost the race to a concurrent restore
      // and gets a clean 409.
      const [exists] = await db.select({ id: recycleBin.id }).from(recycleBin).where(eq(recycleBin.id, id));
      if (!exists) {
        return res.status(404).json({ error: 'Recycle bin item not found' });
      }

      const { invoices: invTable, deliveryOrders: doTable, quotations: quoteTable, purchaseOrders: poTable, invoiceLineItems: invItems, deliveryOrderItems: doItems, quotationItems: quoteItems, purchaseOrderItems: poItems } = await import('@shared/schema');

      let auditDocType = '';
      let auditDocNumber = '';

      await db.transaction(async (tx) => {
        // Lock the bin row inside the tx so two simultaneous restore
        // clicks for the same id can't both pass the existence check
        // and both insert duplicate-numbered documents.
        const [item] = await tx.select().from(recycleBin)
          .where(eq(recycleBin.id, id))
          .for('update');
        if (!item) {
          // Row existed at pre-check; now it's gone. A concurrent
          // restore committed first while we waited on the lock.
          throw Object.assign(new Error(RACE_LOST), { sentinel: RACE_LOST });
        }

        if (!['Invoice', 'DeliveryOrder', 'Quotation', 'PurchaseOrder', 'Product', 'Brand', 'Supplier', 'Customer'].includes(item.documentType)) {
          throw Object.assign(new Error(UNKNOWN_TYPE), { sentinel: UNKNOWN_TYPE, documentType: item.documentType });
        }

        const { header, items: lineItems = [] } = JSON.parse(item.documentData);
        auditDocType = item.documentType;
        auditDocNumber = item.documentNumber;

        if (item.documentType === 'Invoice') {
          const { id: _id, createdAt: _ca, ...headerData } = header;
          const [restored] = await tx.insert(invTable).values(headerData).returning();
          for (const li of lineItems) {
            const { id: _lid, createdAt: _lca, invoiceId: _inv, ...liData } = li;
            await tx.insert(invItems).values({ ...liData, invoiceId: restored.id });
          }
        } else if (item.documentType === 'DeliveryOrder') {
          const { id: _id, createdAt: _ca, ...headerData } = header;
          const [restored] = await tx.insert(doTable).values(headerData).returning();
          for (const li of lineItems) {
            const { id: _lid, createdAt: _lca, doId: _did, ...liData } = li;
            await tx.insert(doItems).values({ ...liData, doId: restored.id });
          }
        } else if (item.documentType === 'Quotation') {
          const { id: _id, createdAt: _ca, updatedAt: _ua, customerName: _cn, ...headerData } = header;
          const [restored] = await tx.insert(quoteTable).values({
            ...headerData,
            quoteDate: headerData.quoteDate ? new Date(headerData.quoteDate) : new Date(),
            validUntil: headerData.validUntil ? new Date(headerData.validUntil) : new Date(),
            referenceDate: headerData.referenceDate ? new Date(headerData.referenceDate) : null,
          }).returning();
          for (const li of lineItems) {
            const { id: _lid, createdAt: _lca, quoteId: _qid, ...liData } = li;
            await tx.insert(quoteItems).values({ ...liData, quoteId: restored.id });
          }
        } else if (item.documentType === 'PurchaseOrder') {
          const { id: _id, createdAt: _ca, updatedAt: _ua, supplierName: _sn, ...headerData } = header;
          const [restored] = await tx.insert(poTable).values({
            ...headerData,
            orderDate: headerData.orderDate ? new Date(headerData.orderDate) : new Date(),
            expectedDelivery: headerData.expectedDelivery ? new Date(headerData.expectedDelivery) : null,
          }).returning();
          for (const li of lineItems) {
            const { id: _lid, createdAt: _lca, poId: _pid, ...liData } = li;
            await tx.insert(poItems).values({ ...liData, poId: restored.id });
          }
        } else if (item.documentType === 'Product') {
          const { id: _id, createdAt: _ca, updatedAt: _ua, ...productData } = header;
          if (productData.sku) {
            const [existing] = await tx.select({ id: products.id })
              .from(products)
              .where(eq(products.sku, productData.sku));
            if (existing) {
              throw Object.assign(new Error(`A product with SKU "${productData.sku}" already exists. Rename the existing product's SKU first, then retry.`), { code: 'SKU_CONFLICT' });
            }
          }
          await tx.insert(products).values({ ...productData, isActive: true });
        } else if (item.documentType === 'Brand') {
          const { id: _id, createdAt: _ca, ...brandData } = header;
          await tx.insert(brands).values({ ...brandData });
        } else if (item.documentType === 'Supplier') {
          const { id: _id, createdAt: _ca, ...supplierData } = header;
          await tx.insert(suppliers).values({ ...supplierData });
        } else if (item.documentType === 'Customer') {
          const { id: _id, createdAt: _ca, ...customerData } = header;
          await tx.insert(customers).values({ ...customerData });
        }
        await tx.delete(recycleBin).where(eq(recycleBin.id, id));
      });

      writeAuditLog({ actor: req.user!.id, actorName: req.user?.username || String(req.user!.id), targetId: String(id), targetType: 'recycle_bin', action: 'UPDATE', details: `Restored ${auditDocType} #${auditDocNumber} from recycle bin` });
      res.json({ success: true, message: `${auditDocNumber} has been restored successfully` });
    } catch (error: unknown) {
      const e = error as { sentinel?: string; documentType?: string; code?: string; constraint?: string; message?: string };
      if (e?.sentinel === RACE_LOST) {
        return res.status(409).json({ error: 'Recycle bin item is being restored by another request. Refresh to see the restored document.' });
      }
      if (e?.sentinel === UNKNOWN_TYPE) {
        return res.status(400).json({ error: `Unknown document type: ${e.documentType}` });
      }
      logger.error('Error restoring document:', error);
      if (e?.code === 'SKU_CONFLICT') {
        return res.status(409).json({ error: e.message });
      }
      if (e?.code === '23505' && e?.constraint?.includes('sku')) {
        return res.status(409).json({ error: `SKU conflict: a product with that SKU already exists.` });
      }
      res.status(500).json({ error: 'Failed to restore document' });
    }
  });
}
