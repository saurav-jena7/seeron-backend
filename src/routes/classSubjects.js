/**
 * ClassSubject routes
 *
 * Relationship: Institute → Subjects → Teachers → Class → ClassSubjects → Section → ClassTeacher + SubjectTeachers
 *
 * Endpoints:
 *   GET    /api/class-subjects?class_id=          list subjects assigned to a class
 *   POST   /api/class-subjects                    assign a subject to a class (with optional default teacher)
 *   PUT    /api/class-subjects/:id                update the default teacher for a class-subject
 *   DELETE /api/class-subjects/:id                remove subject from class
 *
 *   GET    /api/class-subjects/:id/eligible-teachers   teachers eligible for this subject (isTeacher=true)
 *
 *   — Section-level subject-teacher assignment —
 *   GET    /api/class-subjects/section/:sectionId/teachers          list subject-teacher map for a section
 *   PUT    /api/class-subjects/section/:sectionId/teachers          set/update subject-teacher assignments for section
 *   DELETE /api/class-subjects/section/:sectionId/teachers/:csId    remove a subject-teacher from section
 */

const router = require('express').Router();
const { ClassSubject, Section, Class, Subject } = require('../db/models/Academic');
const Employee = require('../db/models/Employee');
const { authenticate, loadMembership, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { logAudit } = require('../middleware/audit');

const auth = [authenticate, loadMembership];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Verify the class belongs to the current institute */
async function assertClassOwnership(classId, instituteId) {
  const cls = await Class.findOne({ _id: classId, institute: instituteId, deletedAt: null });
  return cls;
}

/** Verify a teacher is a marked teacher in the current institute */
async function assertTeacherEligibility(teacherId, instituteId) {
  return Employee.findOne({ _id: teacherId, institute: instituteId, isTeacher: true, deletedAt: null });
}

// ── GET /api/class-subjects?class_id=xxx ─────────────────────────────────────
router.get('/', ...auth, requirePermission('academic.view'), async (req, res) => {
  try {
    const { class_id } = req.query;
    if (!class_id) return res.status(400).json({ success: false, message: 'class_id query param required' });

    if (!await assertClassOwnership(class_id, req.instituteId)) {
      return res.status(404).json({ success: false, message: 'Class not found in this institute' });
    }

    const rows = await ClassSubject.find({ class: class_id, deletedAt: null })
      .populate('subject', 'name code type')
      .populate('teacher', 'name employeeCode designation')
      .sort({ createdAt: 1 });

    return res.json({ success: true, data: rows });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ── POST /api/class-subjects — assign subject to class ───────────────────────
router.post('/', ...auth, requirePermission('academic.create'),
  validate(['class_id', 'subject_id']),
  async (req, res) => {
    try {
      const { class_id, subject_id, teacher_id } = req.body;

      // 1. Class must belong to institute
      const cls = await assertClassOwnership(class_id, req.instituteId);
      if (!cls) return res.status(404).json({ success: false, message: 'Class not found in this institute' });

      // 2. Subject must belong to institute
      const subj = await Subject.findOne({ _id: subject_id, institute: req.instituteId, deletedAt: null });
      if (!subj) return res.status(404).json({ success: false, message: 'Subject not found in this institute' });

      // 3. Teacher (if provided) must be a teacher in this institute
      if (teacher_id) {
        const teacher = await assertTeacherEligibility(teacher_id, req.instituteId);
        if (!teacher) return res.status(400).json({ success: false, message: 'Teacher not found or not eligible (must be marked as teacher)' });
      }

      // 4. Prevent duplicate class-subject assignment
      const existing = await ClassSubject.findOne({ class: class_id, subject: subject_id, deletedAt: null });
      if (existing) return res.status(409).json({ success: false, message: 'Subject already assigned to this class' });

      const cs = await ClassSubject.create({
        class: class_id,
        subject: subject_id,
        teacher: teacher_id || null,
      });

      await cs.populate([
        { path: 'subject', select: 'name code type' },
        { path: 'teacher', select: 'name employeeCode' },
      ]);

      logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'CREATE', resource: 'class_subjects', resourceId: cs._id, newData: req.body, req });
      return res.status(201).json({ success: true, data: cs });
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ success: false, message: 'Subject already assigned to this class' });
      return res.status(500).json({ success: false, message: e.message });
    }
  });

// ── PUT /api/class-subjects/:id — update default teacher ────────────────────
router.put('/:id', ...auth, requirePermission('academic.update'), async (req, res) => {
  try {
    const { teacher_id } = req.body;
    const cs = await ClassSubject.findOne({ _id: req.params.id, deletedAt: null })
      .populate('class', 'institute');

    if (!cs) return res.status(404).json({ success: false, message: 'Class-subject assignment not found' });
    if (String(cs.class.institute) !== String(req.instituteId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Validate teacher eligibility
    if (teacher_id) {
      const teacher = await assertTeacherEligibility(teacher_id, req.instituteId);
      if (!teacher) return res.status(400).json({ success: false, message: 'Teacher not found or not eligible' });
    }

    cs.teacher = teacher_id || null;
    await cs.save();

    await cs.populate([
      { path: 'subject', select: 'name code type' },
      { path: 'teacher', select: 'name employeeCode' },
      { path: 'class',   select: 'name' },
    ]);

    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'UPDATE', resource: 'class_subjects', resourceId: cs._id, req });
    return res.json({ success: true, data: cs });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ── DELETE /api/class-subjects/:id — remove subject from class (soft) ────────
router.delete('/:id', ...auth, requirePermission('academic.delete'), async (req, res) => {
  try {
    const cs = await ClassSubject.findOne({ _id: req.params.id, deletedAt: null })
      .populate('class', 'institute');

    if (!cs) return res.status(404).json({ success: false, message: 'Assignment not found' });
    if (String(cs.class.institute) !== String(req.instituteId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    cs.deletedAt = new Date();
    await cs.save();

    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'DELETE', resource: 'class_subjects', resourceId: cs._id, req });
    return res.json({ success: true, message: 'Subject removed from class' });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ── GET /api/class-subjects/:id/eligible-teachers ────────────────────────────
router.get('/:id/eligible-teachers', ...auth, requirePermission('academic.view'), async (req, res) => {
  try {
    const cs = await ClassSubject.findOne({ _id: req.params.id, deletedAt: null })
      .populate('class', 'institute');

    if (!cs || String(cs.class.institute) !== String(req.instituteId)) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    const teachers = await Employee.find({
      institute: req.instituteId,
      isTeacher: true,
      deletedAt: null,
    }).select('name employeeCode designation department').sort({ name: 1 });

    return res.json({ success: true, data: teachers });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  SECTION-LEVEL SUBJECT-TEACHER ASSIGNMENTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/class-subjects/section/:sectionId/teachers
router.get('/section/:sectionId/teachers', ...auth, requirePermission('academic.view'), async (req, res) => {
  try {
    const section = await Section.findOne({ _id: req.params.sectionId, deletedAt: null })
      .populate('teacher', 'name employeeCode')
      .populate({
        path: 'subjectTeachers.classSubject',
        populate: { path: 'subject', select: 'name code' },
      })
      .populate('subjectTeachers.teacher', 'name employeeCode');

    if (!section) return res.status(404).json({ success: false, message: 'Section not found' });

    // Verify section belongs to institute via its class
    const cls = await Class.findOne({ _id: section.class, institute: req.instituteId, deletedAt: null });
    if (!cls) return res.status(403).json({ success: false, message: 'Access denied' });

    return res.json({ success: true, data: section });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// PUT /api/class-subjects/section/:sectionId/teachers
// Body: { assignments: [{ class_subject_id, teacher_id }] }
// Also accepts: { class_teacher_id } to set/update the class teacher
router.put('/section/:sectionId/teachers', ...auth, requirePermission('academic.update'),
  async (req, res) => {
    try {
      const { assignments, class_teacher_id } = req.body;

      const section = await Section.findOne({ _id: req.params.sectionId, deletedAt: null });
      if (!section) return res.status(404).json({ success: false, message: 'Section not found' });

      // Verify section belongs to institute
      const cls = await Class.findOne({ _id: section.class, institute: req.instituteId, deletedAt: null });
      if (!cls) return res.status(403).json({ success: false, message: 'Access denied' });

      // Update class teacher if provided
      if (class_teacher_id !== undefined) {
        if (class_teacher_id) {
          const ct = await assertTeacherEligibility(class_teacher_id, req.instituteId);
          if (!ct) return res.status(400).json({ success: false, message: 'Class teacher not found or not eligible' });
        }
        section.teacher = class_teacher_id || null;
      }

      // Update subject-teacher assignments
      if (Array.isArray(assignments)) {
        const validated = [];
        for (const a of assignments) {
          // ClassSubject must belong to this section's class
          const cs = await ClassSubject.findOne({ _id: a.class_subject_id, class: section.class, deletedAt: null });
          if (!cs) return res.status(400).json({ success: false, message: `ClassSubject ${a.class_subject_id} not found or does not belong to this class` });

          // Teacher must be eligible
          const teacher = await assertTeacherEligibility(a.teacher_id, req.instituteId);
          if (!teacher) return res.status(400).json({ success: false, message: `Teacher ${a.teacher_id} not found or not eligible` });

          // Check for duplicate classSubject in the same request
          if (validated.some(v => String(v.classSubject) === String(cs._id))) {
            return res.status(400).json({ success: false, message: `Duplicate assignment for subject in section` });
          }

          validated.push({ classSubject: cs._id, teacher: teacher._id });
        }

        // Merge: keep existing entries not in this update, replace those that are
        const incomingCsIds = validated.map(v => String(v.classSubject));
        const kept = section.subjectTeachers.filter(st => !incomingCsIds.includes(String(st.classSubject)));
        section.subjectTeachers = [...kept, ...validated];
      }

      await section.save();
      await section.populate([
        { path: 'teacher', select: 'name employeeCode' },
        {
          path: 'subjectTeachers.classSubject',
          populate: { path: 'subject', select: 'name code' },
        },
        { path: 'subjectTeachers.teacher', select: 'name employeeCode' },
      ]);

      logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'UPDATE', resource: 'section_teachers', resourceId: section._id, req });
      return res.json({ success: true, data: section });
    } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
  });

// DELETE /api/class-subjects/section/:sectionId/teachers/:csId — remove one subject-teacher
router.delete('/section/:sectionId/teachers/:csId', ...auth, requirePermission('academic.update'), async (req, res) => {
  try {
    const section = await Section.findOne({ _id: req.params.sectionId, deletedAt: null });
    if (!section) return res.status(404).json({ success: false, message: 'Section not found' });

    const cls = await Class.findOne({ _id: section.class, institute: req.instituteId, deletedAt: null });
    if (!cls) return res.status(403).json({ success: false, message: 'Access denied' });

    const before = section.subjectTeachers.length;
    section.subjectTeachers = section.subjectTeachers.filter(st => String(st.classSubject) !== req.params.csId);

    if (section.subjectTeachers.length === before) {
      return res.status(404).json({ success: false, message: 'Subject-teacher assignment not found in this section' });
    }

    await section.save();
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'DELETE', resource: 'section_teachers', resourceId: section._id, req });
    return res.json({ success: true, message: 'Subject-teacher removed from section' });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
