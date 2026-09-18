const mongoose = require('mongoose');

/**
 * InstituteMembership — links a User to an Institute with one or more Roles.
 *
 * A user can belong to multiple institutes (different memberships).
 * Within each membership, a user can have multiple roles.
 * Effective permissions = union of all permissions from all roles in the membership.
 *
 * Additional per-user overrides can be added via extraPermissions / deniedPermissions.
 */
const instituteMembershipSchema = new mongoose.Schema({
  user:               { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  institute:          { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  roles:              [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
  // Per-user permission overrides (union with role permissions)
  extraPermissions:   [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
  // Per-user explicit denials (subtract from effective permissions)
  deniedPermissions:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
  isActive:           { type: Boolean, default: true },
  deletedAt:          { type: Date, default: null },
}, { timestamps: true });

instituteMembershipSchema.index({ user: 1, institute: 1 }, { unique: true });

module.exports = mongoose.model('InstituteMembership', instituteMembershipSchema);
