
import { AuditLog } from "@/api/entities";

export const logAuditAction = async (entityType, entityId, action, userEmail, changes = {}, metadata = {}) => {
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
  } catch (error) {
    console.error("Error logging audit action:", error);
  }
};

export const logStatusChange = async (entityType, entityId, userEmail, oldStatus, newStatus, additionalChanges = {}) => {
  const changes = {
    status: {
      from: oldStatus,
      to: newStatus
    },
    ...additionalChanges
  };

  await logAuditAction(entityType, entityId, 'status_change', userEmail, changes);
};

export const logQuantityChange = async (entityType, entityId, userEmail, productId, oldQty, newQty, reason) => {
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
