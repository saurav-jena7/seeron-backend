const AuditLog = require('../db/models/AuditLog');

async function logAudit({ userId, instituteId, action, resource, resourceId, oldData, newData, req }) {
  try {
    await AuditLog.create({
      user:      userId  || null,
      institute: instituteId || null,
      action,
      resource,
      resourceId: resourceId || null,
      oldData:    oldData || null,
      newData:    newData || null,
      ipAddress:  req?.ip || null,
      userAgent:  req?.headers?.['user-agent'] || null,
    });
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

module.exports = { logAudit };
