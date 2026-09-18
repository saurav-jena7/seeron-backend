const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  institute:      { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  employeeCode:   String,
  name:           { type: String, required: true },
  designation:    String,
  department:     String,
  gender:         String,
  dob:            String,
  joiningDate:    String,
  phone:          String,
  email:          String,
  address:        String,
  salary:         Number,
  employmentType: { type: String, enum: ['full_time','part_time','contract'], default: 'full_time' },
  isTeacher:      { type: Boolean, default: false },
  isActive:       { type: Boolean, default: true },   // Active/Inactive status
  deletedAt:      { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Employee', employeeSchema);
