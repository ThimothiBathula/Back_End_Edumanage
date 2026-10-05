const prisma = require("../config/prisma");

// 🔐 Remove sensitive fields before storing in audit log
const sanitizeForAudit = (data) => {
  if (!data || typeof data !== 'object') return data;
  const { password, ...safe } = data;
  return safe;
};

/**
 * Creates an Audit Log and performs the actual update or soft delete operation.
 * 
 * @param {Object} params
 * @param {string} params.modelName - Prisma model name (e.g., 'student', 'fee')
 * @param {number} params.entityId - ID of the record being changed
 * @param {string} params.actionType - 'UPDATE' | 'DELETE' | 'CREATE'
 * @param {Object} params.oldData - The original record before change
 * @param {Object} params.newData - The new data to apply
 * @param {Object} params.user - The req.user object making the change
 * @param {string} params.module - Conceptual module name (e.g., 'STUDENT_MODULE')
 */
exports.captureAuditLog = async ({ modelName, entityId, actionType, oldData, newData, user, module }) => {
  const schoolId = user.schoolId;

  // 1. Perform the actual database operation
  let result;
  
  if (actionType === 'DELETE') {
    // Soft Delete
    result = await prisma[modelName].update({
      where: { id: entityId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: user.id
      }
    });
  } else if (actionType === 'UPDATE') {
    result = await prisma[modelName].update({
      where: { id: entityId },
      data: newData
    });
  } else if (actionType === 'CREATE') {
    result = await prisma[modelName].create({
      data: newData
    });
    entityId = result.id;
  }

  // 2. Calculate Expiry (7 Days from now)
  const revokeExpiry = new Date();
  revokeExpiry.setDate(revokeExpiry.getDate() + 7);

  // 3. Store the Audit Log non-blockingly (fire and forget)
  prisma.auditLog.create({
    data: {
      schoolId: schoolId || (result.schoolId),
      module: module,
      actionType: actionType,
      entityId: entityId,
      entityType: modelName,
      // 🔐 Sanitize: never store password hashes in audit log
      oldData: sanitizeForAudit(oldData ? JSON.parse(JSON.stringify(oldData)) : null),
      newData: actionType === 'DELETE' ? null : sanitizeForAudit(JSON.parse(JSON.stringify(result))),
      changedBy: user.id,
      changedByRole: user.role,
      revokeExpiry: revokeExpiry,
      ipAddress: user.ipAddress || 'UNKNOWN',
      userAgent: user.userAgent || 'UNKNOWN'
    }
  }).catch(err => console.error("Non-blocking AuditLog Write Failed:", err));

  return result;
};
