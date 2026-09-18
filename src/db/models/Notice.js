const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema({
  institute:   { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  title:       { type: String, required: true },
  content:     { type: String, required: true },
  audience:    { type: String, enum: ['all','students','teachers','parents'], default: 'all' },
  publishedAt: { type: Date, default: Date.now },
  expiresAt:   Date,
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt:   { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Notice', noticeSchema);
