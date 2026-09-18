const mongoose = require('mongoose');

/**
 * User — platform-level identity only.
 * Authorization context is determined via InstituteMembership → Roles → Permissions.
 * The `isSuperAdmin` flag is the ONLY way to get platform-wide access.
 * It is set ONLY via the seed script / direct DB operation, never via API.
 */
const userSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  phone:        String,
  avatarUrl:    String,
  isSuperAdmin: { type: Boolean, default: false }, // platform-level bypass — never set via API
  isActive:     { type: Boolean, default: true },
  deletedAt:    { type: Date, default: null },
}, { timestamps: true });

const refreshTokenSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token:     { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

module.exports = { User, RefreshToken };
