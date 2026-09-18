const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  institute:  { type: mongoose.Schema.Types.ObjectId, ref: 'Institute' },
  action:     { type: String, required: true },   // CREATE | UPDATE | DELETE | LOGIN | LOGOUT
  resource:   { type: String, required: true },   // model name
  resourceId: String,
  oldData:    mongoose.Schema.Types.Mixed,
  newData:    mongoose.Schema.Types.Mixed,
  ipAddress:  String,
  userAgent:  String,
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);
