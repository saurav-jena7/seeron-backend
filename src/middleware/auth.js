const jwt = require('jsonwebtoken');
const { User } = require('../db/models/User');
const InstituteMembership = require('../db/models/InstituteMembership');

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 1 — Authenticate: verify JWT, load user
// ─────────────────────────────────────────────────────────────────────────────
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ _id: decoded.userId, isActive: true, deletedAt: null });

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }

    req.user = user;

    // Super admin bypass — no membership needed
    if (user.isSuperAdmin) {
      req.isSuperAdmin = true;
      req.effectivePermissions = new Set(['*']); // wildcard
      return next();
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 2 — Load membership: resolve institute from param/header, load roles+perms
//  Attaches req.membership, req.effectivePermissions, req.instituteId
// ─────────────────────────────────────────────────────────────────────────────
async function loadMembership(req, res, next) {
  // Super admins skip membership checks
  if (req.isSuperAdmin) return next();

  // Institute ID from: header > route param > query
  const instituteId =
    req.headers['x-institute-id'] ||
    req.params.instituteId ||
    req.query.institute_id ||
    req.body?.institute_id;

  if (!instituteId) {
    return res.status(400).json({ success: false, message: 'Institute context required (x-institute-id header)' });
  }

  try {
    const membership = await InstituteMembership.findOne({
      user: req.user._id,
      institute: instituteId,
      isActive: true,
      deletedAt: null,
    }).populate({
      path: 'roles',
      populate: { path: 'permissions', select: 'name resource action module' },
    }).populate('extraPermissions', 'name resource action')
      .populate('deniedPermissions', 'name resource action');

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this institute',
      });
    }

    // Build effective permission set = union(role perms) + extra - denied
    const permSet = new Set();
    for (const role of membership.roles) {
      for (const perm of role.permissions || []) {
        permSet.add(perm.name);
      }
    }
    for (const perm of membership.extraPermissions || []) {
      permSet.add(perm.name);
    }
    for (const perm of membership.deniedPermissions || []) {
      permSet.delete(perm.name);
    }

    req.membership      = membership;
    req.instituteId     = instituteId;
    req.effectivePermissions = permSet;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  STEP 3 — Permission check middleware factory
//  Usage: requirePermission('student.view')
// ─────────────────────────────────────────────────────────────────────────────
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    // Super admin has wildcard access
    if (req.isSuperAdmin || req.effectivePermissions?.has('*')) {
      return next();
    }
    if (!req.effectivePermissions?.has(permission)) {
      return res.status(403).json({
        success: false,
        message: `Permission denied: '${permission}' required`,
      });
    }
    next();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  SUPER ADMIN only routes
// ─────────────────────────────────────────────────────────────────────────────
function requireSuperAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
  if (!req.isSuperAdmin) {
    return res.status(403).json({ success: false, message: 'Super admin access required' });
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: check permission programmatically (not as middleware)
// ─────────────────────────────────────────────────────────────────────────────
function hasPermission(req, permission) {
  if (req.isSuperAdmin) return true;
  return req.effectivePermissions?.has(permission) ?? false;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Legacy authorize() — kept for backward compat, checks role names
//  Prefer requirePermission() for new routes
// ─────────────────────────────────────────────────────────────────────────────
function authorize(...roleNames) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated' });
    if (req.isSuperAdmin) return next();
    const memberRoleNames = (req.membership?.roles || []).map(r => r.name.toUpperCase());
    const allowed = roleNames.map(r => r.toUpperCase());
    if (!memberRoleNames.some(r => allowed.includes(r))) {
      return res.status(403).json({ success: false, message: 'Insufficient role' });
    }
    next();
  };
}

module.exports = {
  authenticate,
  loadMembership,
  requirePermission,
  requireSuperAdmin,
  hasPermission,
  authorize,
};
