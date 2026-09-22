const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, RefreshToken } = require('../db/models/User');
const InstituteMembership = require('../db/models/InstituteMembership');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { logAudit } = require('../middleware/audit');

function generateTokens(userId) {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
  return { accessToken, refreshToken };
}

/** Builds the full auth context for a user (memberships + permissions) */
async function buildAuthContext(user) {
  const memberships = await InstituteMembership.find({
    user: user._id,
    isActive: true,
    deletedAt: null,
  })
    .populate('institute', 'name type logo_url')
    .populate({
      path: 'roles',
      populate: { path: 'permissions', select: 'name resource action module' },
    })
    .populate('extraPermissions', 'name resource action module')
    .populate('deniedPermissions', 'name resource action module');

  // Build per-membership permission sets
  const membershipData = memberships.map((m) => {
    const permSet = new Set();
    for (const role of m.roles || []) {
      for (const perm of role.permissions || []) permSet.add(perm.name);
    }
    for (const perm of m.extraPermissions || []) permSet.add(perm.name);
    for (const perm of m.deniedPermissions || []) permSet.delete(perm.name);

    return {
      membershipId: m._id,
      institute: m.institute,
      roles: (m.roles || []).map((r) => ({ id: r._id, name: r.name, displayName: r.displayName || r.display_name || r.name })),
      permissions: [...permSet],
    };
  });

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      isSuperAdmin: user.isSuperAdmin,
    },
    memberships: membershipData,
    // Convenience: first membership (or null for super admin with no membership)
    currentInstitute: membershipData[0]?.institute || null,
    currentMembershipId: membershipData[0]?.membershipId || null,
    currentRoles: membershipData[0]?.roles || [],
    currentPermissions: membershipData[0]?.permissions || (user.isSuperAdmin ? ['*'] : []),
  };
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', validate(['email', 'password']), async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim(), deletedAt: null });

    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    const { accessToken, refreshToken } = generateTokens(user._id.toString());
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshToken.create({ user: user._id, token: refreshToken, expiresAt });

    const authContext = await buildAuthContext(user);
    const instituteId = authContext.currentInstitute?._id || null;

    logAudit({ userId: user._id, instituteId, action: 'LOGIN', resource: 'auth', req });

    return res.json({ success: true, data: { accessToken, refreshToken, ...authContext } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
router.post('/refresh', validate(['refreshToken']), async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const stored = await RefreshToken.findOne({ token: refreshToken, user: decoded.userId });
    if (!stored || stored.expiresAt < new Date()) {
      return res.status(401).json({ success: false, message: 'Refresh token invalid or expired' });
    }

    const user = await User.findOne({ _id: decoded.userId, isActive: true, deletedAt: null });
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    await RefreshToken.deleteOne({ token: refreshToken });
    const { accessToken, refreshToken: newRefresh } = generateTokens(user._id.toString());
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshToken.create({ user: user._id, token: newRefresh, expiresAt });

    const authContext = await buildAuthContext(user);
    return res.json({ success: true, data: { accessToken, refreshToken: newRefresh, ...authContext } });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', authenticate, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) await RefreshToken.deleteOne({ token: refreshToken });
    logAudit({ userId: req.user._id, action: 'LOGOUT', resource: 'auth', req });
    return res.json({ success: true, message: 'Logged out' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res) => {
  try {
    const authContext = await buildAuthContext(req.user);
    return res.json({ success: true, data: authContext });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/auth/change-password ─────────────────────────────────────────────
router.put('/change-password', authenticate, validate(['currentPassword', 'newPassword']), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }
    user.passwordHash  = bcrypt.hashSync(newPassword, 12);
    user.plainPassword = newPassword;   // keep plainPassword in sync for admin visibility
    await user.save();
    logAudit({ userId: user._id, action: 'UPDATE', resource: 'users', resourceId: user._id, req });
    return res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
