const router    = require('express').Router();
const bcrypt    = require('bcryptjs');
const { User }  = require('../db/models/User');
const InstituteMembership = require('../db/models/InstituteMembership');
const Role      = require('../db/models/Role');
const { authenticate, loadMembership, requirePermission } = require('../middleware/auth');
const { validate }   = require('../middleware/validate');
const { logAudit }   = require('../middleware/audit');

const auth = [authenticate, loadMembership];

// ── GET /api/memberships ──────────────────────────────────────────────────────
router.get('/', ...auth, requirePermission('membership.view'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const filter = { institute: req.instituteId, deletedAt: null };

    const memberships = await InstituteMembership.find(filter)
      .populate('user', 'name email phone isActive avatarUrl')
      .populate('roles', 'name displayName')
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit);

    let filtered = memberships;
    if (search) {
      const re = new RegExp(search, 'i');
      filtered = memberships.filter(m => re.test(m.user?.name) || re.test(m.user?.email));
    }

    const total = await InstituteMembership.countDocuments(filter);
    return res.json({ success: true, data: filtered, meta: { total, page: +page, limit: +limit } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ── POST /api/memberships — create user + add to institute ────────────────────
router.post('/', ...auth, requirePermission('membership.create'),
  validate(['name', 'email', 'password', 'roleIds']),
  async (req, res) => {
    try {
      const { name, email, password, roleIds, phone } = req.body;

      const roles = await Role.find({
        _id: { $in: roleIds },
        $or: [{ institute: null }, { institute: req.instituteId }],
        deletedAt: null,
      });
      if (roles.length !== roleIds.length) {
        return res.status(400).json({ success: false, message: 'One or more invalid roles' });
      }

      let user = await User.findOne({ email: email.toLowerCase().trim() });
      if (!user) {
        user = await User.create({
          name,
          email: email.toLowerCase().trim(),
          passwordHash: bcrypt.hashSync(password, 12),
          phone: phone || null,
        });
      }

      const existing = await InstituteMembership.findOne({
        user: user._id, institute: req.instituteId,
      });
      if (existing && !existing.deletedAt) {
        return res.status(409).json({ success: false, message: 'User is already a member of this institute' });
      }

      const membership = await InstituteMembership.findOneAndUpdate(
        { user: user._id, institute: req.instituteId },
        { $set: { roles: roleIds, isActive: true, deletedAt: null } },
        { upsert: true, new: true }
      ).populate('user', 'name email').populate('roles', 'name displayName');

      logAudit({
        userId: req.user._id, instituteId: req.instituteId,
        action: 'CREATE', resource: 'memberships',
        resourceId: membership._id, newData: { name, email, roles: roleIds }, req,
      });
      return res.status(201).json({ success: true, data: membership });
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ success: false, message: 'Email already registered' });
      return res.status(500).json({ success: false, message: e.message });
    }
  }
);

// ── PUT /api/memberships/:id — update roles + optionally name/password ────────
router.put('/:id', ...auth, requirePermission('membership.update'), async (req, res) => {
  try {
    const { roleIds, extraPermissions, deniedPermissions, isActive, newPassword, userName } = req.body;

    const membership = await InstituteMembership.findOne({
      _id: req.params.id, institute: req.instituteId,
    });
    if (!membership) return res.status(404).json({ success: false, message: 'Membership not found' });

    // Update roles
    if (roleIds !== undefined) {
      const roles = await Role.find({
        _id: { $in: roleIds },
        $or: [{ institute: null }, { institute: req.instituteId }],
        deletedAt: null,
      });
      if (roles.length !== roleIds.length) {
        return res.status(400).json({ success: false, message: 'Invalid roles' });
      }
      membership.roles = roleIds;
    }
    if (extraPermissions !== undefined) membership.extraPermissions = extraPermissions;
    if (deniedPermissions !== undefined) membership.deniedPermissions = deniedPermissions;
    if (isActive         !== undefined) membership.isActive         = isActive;
    await membership.save();

    // Optionally update user name / password
    if (userName || newPassword) {
      const userUpdate = {};
      if (userName && userName.trim()) userUpdate.name = userName.trim();
      if (newPassword) {
        if (newPassword.length < 8) {
          return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
        }
        userUpdate.passwordHash = bcrypt.hashSync(newPassword, 12);
      }
      await User.findByIdAndUpdate(membership.user, userUpdate);
    }

    logAudit({
      userId: req.user._id, instituteId: req.instituteId,
      action: 'UPDATE', resource: 'memberships',
      resourceId: membership._id, req,
    });

    const updated = await InstituteMembership.findById(membership._id)
      .populate('user', 'name email phone')
      .populate('roles', 'name displayName');
    return res.json({ success: true, data: updated });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ── DELETE /api/memberships/:id — soft remove user from institute ─────────────
router.delete('/:id', ...auth, requirePermission('membership.delete'), async (req, res) => {
  try {
    const membership = await InstituteMembership.findOne({
      _id: req.params.id, institute: req.instituteId,
    });
    if (!membership) return res.status(404).json({ success: false, message: 'Membership not found' });
    membership.deletedAt = new Date();
    membership.isActive  = false;
    await membership.save();
    logAudit({
      userId: req.user._id, instituteId: req.instituteId,
      action: 'DELETE', resource: 'memberships',
      resourceId: membership._id, req,
    });
    return res.json({ success: true, message: 'User removed from institute' });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ── GET /api/memberships/my ───────────────────────────────────────────────────
router.get('/my', authenticate, loadMembership, async (req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        membershipId:  req.membership._id,
        roles:         req.membership.roles,
        permissions:   [...(req.effectivePermissions || [])],
      },
    });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
