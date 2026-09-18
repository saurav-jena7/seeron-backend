const mongoose = require('mongoose');

// ── Academic Year ──────────────────────────────────────────────────────────────
const academicYearSchema = new mongoose.Schema({
  institute: { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  name:      { type: String, required: true },
  startDate: { type: String, required: true },
  endDate:   { type: String, required: true },
  isCurrent: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

// ── Class ──────────────────────────────────────────────────────────────────────
const classSchema = new mongoose.Schema({
  institute: { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  name:      { type: String, required: true },
  level:     Number,
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

// ── Section ────────────────────────────────────────────────────────────────────
const sectionSchema = new mongoose.Schema({
  class:    { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  name:     { type: String, required: true },
  capacity: { type: Number, default: 40 },
  // Class teacher for this section
  teacher:  { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  // Subject teachers: [{ classSubject: ObjectId, teacher: ObjectId }]
  // Each entry maps a ClassSubject (class+subject pair) to the teacher handling it in THIS section
  subjectTeachers: [{
    classSubject: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSubject' },
    teacher:      { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  }],
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

// ── Subject ────────────────────────────────────────────────────────────────────
const subjectSchema = new mongoose.Schema({
  institute: { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  name:      { type: String, required: true },
  code:      String,
  type:      { type: String, enum: ['theory','practical','elective'], default: 'theory' },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

// ── Timetable ──────────────────────────────────────────────────────────────────
const timetableSchema = new mongoose.Schema({
  class:     { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  section:   { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
  subject:   { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  teacher:   { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  dayOfWeek: { type: Number, required: true, min: 1, max: 7 },
  startTime: { type: String, required: true },
  endTime:   { type: String, required: true },
  room:      String,
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

// ── ClassSubject ───────────────────────────────────────────────────────────────
// Represents a Subject assigned to a Class, with an optional default teacher.
// Uniqueness: one subject per class (prevent duplicates).
const classSubjectSchema = new mongoose.Schema({
  class:       { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  subject:     { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  // Default teacher for this subject in this class (can be overridden per section)
  teacher:     { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  deletedAt:   { type: Date, default: null },
}, { timestamps: true });

// Prevent duplicate class-subject pairs
classSubjectSchema.index({ class: 1, subject: 1 }, { unique: true });

const AcademicYear  = mongoose.model('AcademicYear', academicYearSchema);
const Class         = mongoose.model('Class', classSchema);
const Section       = mongoose.model('Section', sectionSchema);
const Subject       = mongoose.model('Subject', subjectSchema);
const Timetable     = mongoose.model('Timetable', timetableSchema);
const ClassSubject  = mongoose.model('ClassSubject', classSubjectSchema);

module.exports = { AcademicYear, Class, Section, Subject, Timetable, ClassSubject };
