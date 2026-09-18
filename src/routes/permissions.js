const router = require('express').Router();
const Permission = require('../db/models/Permission');
const { authenticate, loadMembership, requirePermission, requireSuperAdmin } = require('../middleware/auth');

const auth = [authenticate, loadMembership];

// GET /api/permissions — list all (any authenticated member with permission.view)
router.get('/', ...auth, requirePermission('permission.view'), async (req, res) => {
  try {
    const { module } = req.query;
    const filter = module ? { module } : {};
    const perms = await Permission.find(filter).sort({ module: 1, name: 1 });
    // Group by module for UI convenience
    const grouped = perms.reduce((acc, p) => {
      if (!acc[p.module]) acc[p.module] = [];
      acc[p.module].push(p);
      return acc;
    }, {});
    return res.json({ success: true, data: perms, grouped });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/permissions/modules — distinct module names
router.get('/modules', ...auth, requirePermission('permission.view'), async (req, res) => {
  try {
    const modules = await Permission.distinct('module');
    return res.json({ success: true, data: modules });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
