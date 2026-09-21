const router = require('express').Router();
const Role = require('../db/models/Role');
const Permission = require('../db/models/Permission');
const { User } = require('../db/models/User');
const InstituteMembership = require('../db/models/InstituteMembership');
const { authenticate, loadMembership, requirePermission, requireSuperAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { logAudit } = require('../middleware/audit');
const { softDelete } = require('../middleware/softDelete');

const auth = [authenticate, loadMembership];

// GET /api/roles — list roles available to this institute (system + institute-specific)
router.get('/', ...auth, requirePermission('role.view'), async (req, res) => {
  try {
    // SUPER_ADMIN is a platform-level flag (User.isSuperAdmin), never assignable as a role
    const roles = await Role.find({
      $or: [{ institute: null }, { institute: req.instituteId }],
      name: { $nin: ['SUPER_ADMIN'] },
      deletedAt: null,
    }).populate('permissions', 'name resource action module description').sort({ name: 1 });
    return res.json({ success: true, data: roles });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/roles/:id
router.get('/:id', ...auth, requirePermission('role.view'), async (req, res) => {
  try {
    const role = await Role.findById(req.params.id).populate('permissions', 'name resource action module description');
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    return res.json({ success: true, data: role });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/roles — create a custom role for this institute
router.post('/', ...auth, requirePermission('role.create'), validate(['name', 'displayName']), async (req, res) => {
  try {
    const { name, displayName, description, permissions: permIds } = req.body;
    // Validate permissions exist
    if (permIds?.length) {
      const count = await Permission.countDocuments({ _id: { $in: permIds } });
      if (count !== permIds.length) return res.status(400).json({ success: false, message: 'Some permissions are invalid' });
    }
    const role = await Role.create({
      name: name.toUpperCase().replace(/\s+/g, '_'),
      displayName, description: description || '',
      institute: req.instituteId,
      permissions: permIds || [],
      isSystem: false,
    });
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'CREATE', resource: 'roles', resourceId: role._id, newData: { name, displayName }, req });
    return res.status(201).json({ success: true, data: await role.populate('permissions', 'name resource action module') });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ success: false, message: 'Role name already exists' });
    return res.status(500).json({ success: false, message: e.message });
  }
});

// PUT /api/roles/:id — update permissions on a role (cannot modify system roles' names)
router.put('/:id', ...auth, requirePermission('role.update'), async (req, res) => {
  try {
    const role = await Role.findOne({ _id: req.params.id, $or: [{ institute: null }, { institute: req.instituteId }], deletedAt: null });
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    if (role.isSystem && req.body.name) return res.status(403).json({ success: false, message: 'Cannot rename system roles' });

    const { displayName, description, permissions: permIds } = req.body;
    if (permIds?.length) {
      const count = await Permission.countDocuments({ _id: { $in: permIds } });
      if (count !== permIds.length) return res.status(400).json({ success: false, message: 'Some permissions are invalid' });
    }
    if (displayName) role.displayName = displayName;
    if (description !== undefined) role.description = description;
    if (permIds !== undefined) role.permissions = permIds;
    await role.save();
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'UPDATE', resource: 'roles', resourceId: role._id, req });
    return res.json({ success: true, data: await role.populate('permissions', 'name resource action module') });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/roles/:id (soft — only non-system institute-specific roles)
router.delete('/:id', ...auth, requirePermission('role.delete'), async (req, res) => {
  try {
    const role = await Role.findOne({ _id: req.params.id, institute: req.instituteId, deletedAt: null });
    if (!role) return res.status(404).json({ success: false, message: 'Role not found or not deletable' });
    if (role.isSystem) return res.status(403).json({ success: false, message: 'Cannot delete system roles' });
    await softDelete(Role, req.params.id);
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'DELETE', resource: 'roles', resourceId: req.params.id, req });
    return res.json({ success: true, message: 'Role deleted' });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ── USERS LIST (for roles page) ───────────────────────────────────────────────
router.get('/users/list', ...auth, requirePermission('membership.view'), async (req, res) => {
  try {
    const { page = 1, limit = 20, role_name } = req.query;
    const membershipFilter = { institute: req.instituteId, isActive: true, deletedAt: null };
    if (role_name) {
      const role = await Role.findOne({ name: role_name.toUpperCase(), $or: [{ institute: null }, { institute: req.instituteId }] });
      if (role) membershipFilter.roles = role._id;
    }
    const total = await InstituteMembership.countDocuments(membershipFilter);
    const memberships = await InstituteMembership.find(membershipFilter)
      .populate('user', 'name email phone isActive createdAt')
      .populate('roles', 'name displayName')
      .skip((+page - 1) * +limit).limit(+limit);
    return res.json({ success: true, data: memberships, meta: { total, page: +page, limit: +limit } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// PUT /api/roles/users/:userId/toggle-status
router.put('/users/:userId/toggle-status', ...auth, requirePermission('membership.update'), async (req, res) => {
  try {
    const membership = await InstituteMembership.findOne({ user: req.params.userId, institute: req.instituteId });
    if (!membership) return res.status(404).json({ success: false, message: 'Membership not found' });
    membership.isActive = !membership.isActive;
    await membership.save();
    return res.json({ success: true, message: `User ${membership.isActive ? 'activated' : 'deactivated'}` });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
