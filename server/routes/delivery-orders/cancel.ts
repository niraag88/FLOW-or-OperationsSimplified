import type { Express } from "express";
import { deliveryOrders, stockMovements } from "@shared/schema";
import { db } from "../../db";
import { and, eq } from "drizzle-orm";
import { requireAuth, writeAuditLogSync, updateProductStock, type AuthenticatedRequest } from "../../middleware";

export function registerDeliveryOrderCancelRoutes(app: Express) {
  // PATCH /api/delivery-orders/:id/cancel
  // Cancellation is strictly all-or-nothing for inventory: the DO's net
  // stock effect (including any edits made while delivered, which add their
  // own stock_movements rows) is reversed exactly once per product, then the
  // DO flips to `cancelled`. Submitted DOs cancel without stock movement.
  // Draft DOs must be deleted, not cancelled.
  app.patch('/api/delivery-orders/:id/cancel', requireAuth(['Admin', 'Manager', 'Staff']), async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      // Reject partial-reversal payloads before touching anything.
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'productIdsToReverse')) {
        return res.status(400).json({
          error: 'partial_stock_reversal_not_allowed',
          message: 'Delivery order cancellation is all-or-nothing. To keep some items with the customer, restore stock now and record a separate sale or write-off for those items.',
        });
      }

      const [doRecord] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));
      if (!doRecord) return res.status(404).json({ error: 'Delivery order not found' });

      if (doRecord.status === 'cancelled') {
        return res.status(409).json({ error: 'Delivery order is already cancelled' });
      }
      if (doRecord.status === 'draft') {
        return res.status(400).json({ error: 'Draft delivery orders should be deleted, not cancelled' });
      }

      let stockReversed = false;
      const ALREADY_CANCELLED = '__do_already_cancelled__';

      try {
        await db.transaction(async (tx) => {
          // Lock the DO row so concurrent cancellations cannot both post
          // reversals.
          const [locked] = await tx.select({
            id: deliveryOrders.id,
            status: deliveryOrders.status,
          }).from(deliveryOrders).where(eq(deliveryOrders.id, id)).for('update');
          if (!locked || locked.status === 'cancelled') {
            // Another concurrent cancel beat us to it — bail and let the
            // outer handler return 409 instead of a misleading 200.
            throw new Error(ALREADY_CANCELLED);
          }

          if (locked.status === 'delivered') {
            // Aggregate the existing stock_movements for this DO by productId.
            // This naturally captures both the original delivery movement and
            // any subsequent edit-time adjustment movements, so a delivered DO
            // that was edited mid-flight reverses the *net* effect.
            const doMovements = await tx.select().from(stockMovements)
              .where(and(
                eq(stockMovements.referenceType, 'delivery_order'),
                eq(stockMovements.referenceId, id),
              ));

            const netByProduct = new Map<number, number>();
            for (const m of doMovements) {
              netByProduct.set(m.productId, (netByProduct.get(m.productId) ?? 0) + m.quantity);
            }

            for (const [productId, net] of netByProduct.entries()) {
              if (net === 0) continue;
              await updateProductStock(
                productId,
                -net,
                'delivery_order_cancellation',
                id,
                'delivery_order',
                0,
                `Stock reversed — DO #${doRecord.orderNumber} cancelled`,
                req.user!.id,
                tx,
              );
              stockReversed = true;
            }
          }

          await tx.update(deliveryOrders).set({ status: 'cancelled' }).where(eq(deliveryOrders.id, id));

          // Task #375: audit row writes inside the same transaction so an
          // audit-DB hiccup also rolls back the cancellation and any
          // stock reversal — see the matching note on the invoice cancel
          // route and the comment block in server/middleware.ts.
          await writeAuditLogSync(tx, {
            actor: req.user!.id,
            actorName: req.user?.username || String(req.user!.id),
            targetId: String(id),
            targetType: 'delivery_order',
            action: 'UPDATE',
            details: stockReversed
              ? `DO #${doRecord.orderNumber} cancelled — full stock reversed`
              : `DO #${doRecord.orderNumber} cancelled — no stock to reverse`,
          });
        });
      } catch (txError) {
        if (txError instanceof Error && txError.message === ALREADY_CANCELLED) {
          return res.status(409).json({ error: 'Delivery order is already cancelled' });
        }
        throw txError;
      }

      const [updated] = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, id));

      res.json({ ...updated, do_number: updated.orderNumber });
    } catch (error) {
      console.error('Error cancelling delivery order:', error);
      res.status(500).json({ error: 'Failed to cancel delivery order' });
    }
  });
}
