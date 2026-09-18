const router = require('express').Router();
const Notice = require('../db/models/Notice');
const { authenticate, loadMembership, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { logAudit } = require('../middleware/audit');
const { softDelete } = require('../middleware/softDelete');

const auth = [authenticate, loadMembership];

router.get('/', ...auth, async (req, res) => {
  try {
    const { audience } = req.query;
    const filter = { institute: req.instituteId, deletedAt: null };
    if (audience) filter.$or = [{ audience }, { audience: 'all' }];
    const rows = await Notice.find(filter).populate('createdBy','name').sort({ createdAt: -1 });
    return res.json({ success: true, data: rows });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', ...auth, requirePermission('notice.create'), validate(['title','content']), async (req, res) => {
  try {
    const { title, content, audience, published_at, expires_at } = req.body;
    const notice = await Notice.create({ institute: req.instituteId, title, content, audience: audience || 'all', publishedAt: published_at ? new Date(published_at) : new Date(), expiresAt: expires_at ? new Date(expires_at) : null, createdBy: req.user._id });
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'CREATE', resource: 'notices', resourceId: notice._id, req });
    return res.status(201).json({ success: true, data: notice });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.put('/:id', ...auth, requirePermission('notice.update'), async (req, res) => {
  try {
    const { title, content, audience, expires_at } = req.body;
    const notice = await Notice.findOneAndUpdate({ _id: req.params.id, institute: req.instituteId, deletedAt: null }, { $set: { title, content, audience, expiresAt: expires_at ? new Date(expires_at) : null } }, { new: true });
    if (!notice) return res.status(404).json({ success: false, message: 'Notice not found' });
    return res.json({ success: true, data: notice });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id', ...auth, requirePermission('notice.delete'), async (req, res) => {
  try { await softDelete(Notice, req.params.id); return res.json({ success: true, message: 'Notice deleted' }); }
  catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
