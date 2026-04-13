
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
