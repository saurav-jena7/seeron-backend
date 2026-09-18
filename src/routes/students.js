const router = require('express').Router();
const Student = require('../db/models/Student');
const { authenticate, loadMembership, requirePermission, hasPermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { logAudit } = require('../middleware/audit');
const { softDelete } = require('../middleware/softDelete');
const InstituteMembership = require('../db/models/InstituteMembership');

const auth = [authenticate, loadMembership];

// GET /api/students
router.get('/', ...auth, requirePermission('student.view'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search, class_id, section_id, status } = req.query;
    const filter = { institute: req.instituteId, deletedAt: null };
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { admissionNo: { $regex: search, $options: 'i' } },
      { rollNo: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
    if (class_id)   filter.class   = class_id;
    if (section_id) filter.section = section_id;
    if (status)     filter.status  = status;

    // Teachers only see students in their assigned classes
    if (!hasPermission(req, 'student.view_all')) {
      const memberRoles = req.membership?.roles?.map(r => r.name) || [];
      if (memberRoles.includes('TEACHER') && req.user.employeeRef) {
        filter['class'] = { $in: req.user.assignedClasses || [] };
      }
    }

    const total = await Student.countDocuments(filter);
    const rows  = await Student.find(filter)
      .populate('class','name').populate('section','name')
      .sort({ createdAt: -1 }).skip((+page - 1) * +limit).limit(+limit);
    return res.json({ success: true, data: rows, meta: { total, page: +page, limit: +limit } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/students/deleted — soft-deleted students (restore candidates)
router.get('/deleted', ...auth, requirePermission('student.delete'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const filter = { institute: req.instituteId, deletedAt: { $ne: null } };
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { admissionNo: { $regex: search, $options: 'i' } },
    ];
    const total = await Student.countDocuments(filter);
    const rows  = await Student.find(filter)
      .populate('class', 'name').populate('section', 'name')
      .sort({ deletedAt: -1 }).skip((+page - 1) * +limit).limit(+limit);
    return res.json({ success: true, data: rows, meta: { total, page: +page, limit: +limit } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/students/:id/restore — restore a soft-deleted student
router.post('/:id/restore', ...auth, requirePermission('student.delete'), async (req, res) => {
  try {
    const student = await Student.findOne({ _id: req.params.id, institute: req.instituteId, deletedAt: { $ne: null } });
    if (!student) return res.status(404).json({ success: false, message: 'Deleted student not found' });
    student.deletedAt = null;
    await student.save();
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'RESTORE', resource: 'students', resourceId: student._id, req });
    return res.json({ success: true, message: 'Student restored', data: student });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/students/me  — student accesses own record
router.get('/me', authenticate, async (req, res) => {
  try {
    const membership = await InstituteMembership.findOne({ user: req.user._id, isActive: true, deletedAt: null });
    if (!membership) return res.status(404).json({ success: false, message: 'No institute membership' });
    const student = await Student.findOne({ user: req.user._id, institute: membership.institute, deletedAt: null })
      .populate('class','name').populate('section','name').populate('academicYear','name');
    if (!student) return res.status(404).json({ success: false, message: 'Student record not found' });
    return res.json({ success: true, data: student });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/students/:id
router.get('/:id', ...auth, requirePermission('student.view'), async (req, res) => {
  try {
    const student = await Student.findOne({ _id: req.params.id, institute: req.instituteId, deletedAt: null })
      .populate('class','name').populate('section','name').populate('academicYear','name');
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    return res.json({ success: true, data: student });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/students
router.post('/', ...auth, requirePermission('student.create'), validate(['name']), async (req, res) => {
  try {
    const student = await Student.create({ ...req.body, institute: req.instituteId });
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'CREATE', resource: 'students', resourceId: student._id, newData: req.body, req });
    return res.status(201).json({ success: true, data: student });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// PUT /api/students/:id
router.put('/:id', ...auth, requirePermission('student.update'), async (req, res) => {
  try {
    const student = await Student.findOneAndUpdate(
      { _id: req.params.id, institute: req.instituteId, deletedAt: null },
      { $set: req.body }, { new: true, runValidators: true }
    );
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'UPDATE', resource: 'students', resourceId: req.params.id, req });
    return res.json({ success: true, data: student });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// DELETE /api/students/:id (soft)
router.delete('/:id', ...auth, requirePermission('student.delete'), async (req, res) => {
  try {
    const student = await Student.findOne({ _id: req.params.id, institute: req.instituteId, deletedAt: null });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    await softDelete(Student, req.params.id);
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'DELETE', resource: 'students', resourceId: req.params.id, req });
    return res.json({ success: true, message: 'Student deleted' });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
