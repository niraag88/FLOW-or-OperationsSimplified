
import { AuditLog } from "@/api/entities";

export const logAuditAction = async (entityType: any, entityId: any, action: any, userEmail: any, changes = {}, metadata = {}) => {
  try {
    await AuditLog.create({
      entity_type: entityType,
      entity_id: entityId,
      action,
      user_email: userEmail,
      changes,
      metadata,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("Error logging audit action:", error);
  }
};

export const logStatusChange = async (entityType: any, entityId: any, userEmail: any, oldStatus: any, newStatus: any, additionalChanges = {}) => {
  const changes = {
    status: {
      from: oldStatus,
      to: newStatus
    },
    ...additionalChanges
  };

  await logAuditAction(entityType, entityId, 'status_change', userEmail, changes);
};

export const logQuantityChange = async (entityType: any, entityId: any, userEmail: any, productId: any, oldQty: any, newQty: any, reason: any) => {
  const changes = {
    product_id: productId,
    quantity: {
      from: oldQty,
      to: newQty,
      difference: newQty - oldQty
    },
    reason
  };

  await logAuditAction(entityType, entityId, 'quantity_adjustment', userEmail, changes);
};
