const router = require('express').Router();
const AuditLog = require('../db/models/AuditLog');
const { authenticate, loadMembership, requirePermission } = require('../middleware/auth');

const auth = [authenticate, loadMembership];

router.get('/', ...auth, requirePermission('audit.view'), async (req, res) => {
  try {
    const { page = 1, limit = 30, resource, action, user_id, from_date, to_date } = req.query;
    const filter = { institute: req.instituteId };
    if (resource) filter.resource = resource;
    if (action)   filter.action   = action;
    if (user_id)  filter.user     = user_id;
    if (from_date || to_date) { filter.createdAt = {}; if (from_date) filter.createdAt.$gte = new Date(from_date); if (to_date) { const e = new Date(to_date); e.setHours(23,59,59,999); filter.createdAt.$lte = e; } }
    const total = await AuditLog.countDocuments(filter);
    const rows  = await AuditLog.find(filter).populate('user','name email').sort({ createdAt: -1 }).skip((+page - 1) * +limit).limit(+limit);
    return res.json({ success: true, data: rows, meta: { total, page: +page, limit: +limit } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.get('/actions', ...auth, requirePermission('audit.view'), async (req, res) => {
  try {
    const [actions, resources] = await Promise.all([
      AuditLog.distinct('action', { institute: req.instituteId }),
      AuditLog.distinct('resource', { institute: req.instituteId }),
    ]);
    return res.json({ success: true, data: { actions, resources } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
