const mongoose = require('mongoose');

/**
 * Role — platform-level or institute-level role template.
 * Permissions are stored as an array of Permission ObjectIds.
 * A Role can be a built-in system role (isSystem=true) or a
 * custom role created by an Institute Admin.
 */
const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  displayName: { type: String, required: true },
  description: { type: String, default: '' },
  // null = platform-level role (SUPER_ADMIN); ObjectId = institute-specific custom role
  institute:   { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', default: null },
  permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
  isSystem:    { type: Boolean, default: false }, // system roles cannot be deleted
  deletedAt:   { type: Date, default: null },
}, { timestamps: true });

// Name must be unique within a scope (platform or per-institute)
roleSchema.index({ name: 1, institute: 1 }, { unique: true });

module.exports = mongoose.model('Role', roleSchema);
