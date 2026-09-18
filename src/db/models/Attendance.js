const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  student:   { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  class:     { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  section:   { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
  date:      { type: String, required: true },
  status:    { type: String, enum: ['present','absent','late','excused'], default: 'present' },
  remarks:   String,
  markedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// unique per student per date
attendanceSchema.index({ student: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
