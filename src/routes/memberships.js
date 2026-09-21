const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { User } = require('../db/models/User');
const InstituteMembership = require('../db/models/InstituteMembership');
const Role    = require('../db/models/Role');
const { authenticate, loadMembership, requirePermission } = require('../middleware/auth');
const { validate }  = require('../middleware/validate');
const { logAudit }  = require('../middleware/audit');

const auth = [authenticate, loadMembership];

// Populate fields returned to the client — include plainPassword for admin visibility
const USER_FIELDS = 'name email phone isActive plainPassword isSuperAdmin';

// ── GET /api/memberships ──────────────────────────────────────────────────────
router.get('/', ...auth, requirePermission('membership.view'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const filter = { institute: req.instituteId, deletedAt: null };

    const memberships = await InstituteMembership.find(filter)
      .populate('user', USER_FIELDS)
      .populate('roles', 'name displayName')
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit);

    let filtered = memberships.filter(m => !m.user?.isSuperAdmin); // hide super admin
    if (search) {
      const re = new RegExp(search, 'i');
      filtered = filtered.filter(m => re.test(m.user?.name) || re.test(m.user?.email));
    }

    const total = filtered.length;
    return res.json({ success: true, data: filtered, meta: { total, page: +page, limit: +limit } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ── POST /api/memberships — create user + add to institute ────────────────────
router.post('/', ...auth, requirePermission('membership.create'),
  validate(['name', 'email', 'password', 'roleIds']),
  async (req, res) => {
    try {
      const { name, email, password, roleIds, phone } = req.body;

      // Validate roles
      const roles = await Role.find({
        _id: { $in: roleIds },
        $or: [{ institute: null }, { institute: req.instituteId }],
        deletedAt: null,
      });
      if (roles.length !== roleIds.length) {
        return res.status(400).json({ success: false, message: 'One or more invalid roles' });
      }

      // Create or find user — store plainPassword for admin to view/share
      let user = await User.findOne({ email: email.toLowerCase().trim() });
      if (!user) {
        user = await User.create({
          name,
          email:         email.toLowerCase().trim(),
          passwordHash:  bcrypt.hashSync(password, 12),
          plainPassword: password,   // stored so admin can view/share credentials
          phone:         phone || null,
        });
      }

      // Check existing membership
      const existing = await InstituteMembership.findOne({ user: user._id, institute: req.instituteId });
      if (existing && !existing.deletedAt) {
        return res.status(409).json({ success: false, message: 'User is already a member of this institute' });
      }

      const membership = await InstituteMembership.findOneAndUpdate(
        { user: user._id, institute: req.instituteId },
        { $set: { roles: roleIds, isActive: true, deletedAt: null } },
        { upsert: true, new: true }
      ).populate('user', USER_FIELDS).populate('roles', 'name displayName');

      // Auto-create Employee record if user has TEACHER role and doesn't have one yet
      const Employee = require('../db/models/Employee');
      const hasTeacherRole = roles.some(r => r.name === 'TEACHER');
      if (hasTeacherRole) {
        const existingEmp = await Employee.findOne({ user: user._id, institute: req.instituteId });
        if (!existingEmp) {
          await Employee.create({
            institute:  req.instituteId,
            user:       user._id,
            name:       user.name,
            email:      user.email,
            phone:      user.phone || null,
            isTeacher:  true,
            isActive:   true,
            designation: 'Teacher',
          });
        }
      }

      logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'CREATE', resource: 'memberships', resourceId: membership._id, newData: { name, email }, req });
      return res.status(201).json({ success: true, data: membership });
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ success: false, message: 'Email already registered' });
      return res.status(500).json({ success: false, message: e.message });
    }
  }
);

// ── PUT /api/memberships/:id — update roles / status / name / password ────────
router.put('/:id', ...auth, requirePermission('membership.update'), async (req, res) => {
  try {
    const { roleIds, extraPermissions, deniedPermissions, isActive, newPassword, userName } = req.body;

    // Find by ID — no institute filter to avoid 404/500 for valid cross-institute edge cases
    const membership = await InstituteMembership.findById(req.params.id);
    if (!membership) return res.status(404).json({ success: false, message: 'Membership not found' });

    // Verify ownership
    if (!req.isSuperAdmin && String(membership.institute) !== String(req.instituteId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Build $set object — only include fields that are actually changing
    const updates = {};

    // ── Roles ─────────────────────────────────────────────────────────────────
    if (roleIds !== undefined && roleIds !== null) {
      if (!Array.isArray(roleIds) || roleIds.length === 0) {
        return res.status(400).json({ success: false, message: 'At least one role is required' });
      }
      const roles = await Role.find({
        _id: { $in: roleIds },
        $or: [{ institute: null }, { institute: membership.institute }],
        deletedAt: null,
      });
      if (roles.length !== roleIds.length) {
        return res.status(400).json({ success: false, message: 'One or more invalid roles' });
      }
      updates.roles = roleIds;
    }

    // ── Active status ──────────────────────────────────────────────────────────
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    if (extraPermissions !== undefined) updates.extraPermissions = extraPermissions;
    if (deniedPermissions !== undefined) updates.deniedPermissions = deniedPermissions;

    // Use findByIdAndUpdate with $set — bypasses Mongoose required-field validation
    // since we are only updating specific fields, not the whole document
    if (Object.keys(updates).length > 0) {
      await InstituteMembership.findByIdAndUpdate(req.params.id, { $set: updates }, { runValidators: false });
    }

    // ── User name / password ───────────────────────────────────────────────────
    if (userName || newPassword) {
      const userUpdate = {};
      if (userName && userName.trim()) userUpdate.name = userName.trim();
      if (newPassword) {
        if (newPassword.length < 8) {
          return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
        }
        userUpdate.passwordHash  = bcrypt.hashSync(newPassword, 12);
        userUpdate.plainPassword = newPassword;
      }
      await User.findByIdAndUpdate(membership.user, { $set: userUpdate }, { runValidators: false });
    }

    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'UPDATE', resource: 'memberships', resourceId: membership._id, req });

    const updated = await InstituteMembership.findById(membership._id)
      .populate('user', USER_FIELDS)
      .populate('roles', 'name displayName');
    return res.json({ success: true, data: updated });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ── DELETE /api/memberships/:id — soft remove ─────────────────────────────────
router.delete('/:id', ...auth, requirePermission('membership.delete'), async (req, res) => {
  try {
    const membership = await InstituteMembership.findById(req.params.id);
    if (!membership) return res.status(404).json({ success: false, message: 'Membership not found' });
    if (!req.isSuperAdmin && String(membership.institute) !== String(req.instituteId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    // Use $set to bypass required-field validation
    await InstituteMembership.findByIdAndUpdate(
      req.params.id,
      { $set: { deletedAt: new Date(), isActive: false } },
      { runValidators: false }
    );
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'DELETE', resource: 'memberships', resourceId: membership._id, req });
    return res.json({ success: true, message: 'User removed from institute' });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ── GET /api/memberships/my ───────────────────────────────────────────────────
router.get('/my', authenticate, loadMembership, async (req, res) => {
  try {
    return res.json({ success: true, data: {
      membershipId: req.membership._id,
      roles:        req.membership.roles,
      permissions:  [...(req.effectivePermissions || [])],
    }});
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
