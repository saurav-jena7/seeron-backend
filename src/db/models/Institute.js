const mongoose = require('mongoose');

const instituteSchema = new mongoose.Schema({
  name:             { type: String, required: true },
  address:          String,
  phone:            String,
  email:            String,
  website:          String,
  logo_url:         String,
  established_year: Number,
  type:             { type: String, enum: ['school','college','institute','university'], default: 'school' },
  deletedAt:        { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Institute', instituteSchema);
