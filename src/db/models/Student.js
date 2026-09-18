const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  institute:     { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  admissionNo:   String,
  rollNo:        String,
  name:          { type: String, required: true },
  gender:        String,
  dob:           String,
  bloodGroup:    String,
  phone:         String,
  email:         String,
  address:       String,
  parentName:    String,
  parentPhone:   String,
  parentEmail:   String,
  class:         { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  section:       { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
  academicYear:  { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
  admissionDate: String,
  status:        { type: String, enum: ['active','inactive','graduated','transferred'], default: 'active' },
  deletedAt:     { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
