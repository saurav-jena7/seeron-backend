const mongoose = require('mongoose');

/**
 * A Permission represents a single granular action on a resource.
 * Format: "resource.action"  e.g. "student.view", "fee.collect"
 *
 * Permissions are platform-level (not per-institute).
 * Institutes assign role↔permission mappings.
 */
const permissionSchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true, trim: true }, // e.g. "student.view"
  resource:    { type: String, required: true, trim: true },               // e.g. "student"
  action:      { type: String, required: true, trim: true },               // e.g. "view"
  description: { type: String, default: '' },
  module:      { type: String, required: true, trim: true },               // e.g. "academics", "finance"
}, { timestamps: true });

permissionSchema.index({ resource: 1, action: 1 }, { unique: true });

module.exports = mongoose.model('Permission', permissionSchema);
