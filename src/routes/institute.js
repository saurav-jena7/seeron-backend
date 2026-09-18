const router = require('express').Router();
const Institute = require('../db/models/Institute');
const Student = require('../db/models/Student');
const Employee = require('../db/models/Employee');
const { Class } = require('../db/models/Academic');
const Attendance = require('../db/models/Attendance');
const { FeeAssignment, FeePayment } = require('../db/models/Fee');
const { authenticate, loadMembership, requirePermission, requireSuperAdmin } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const auth = [authenticate, loadMembership];

// GET /api/institute
router.get('/', authenticate, loadMembership, async (req, res) => {
  try {
    const inst = await Institute.findOne({ _id: req.instituteId, deletedAt: null });
    if (!inst) return res.status(404).json({ success: false, message: 'Institute not found' });
    return res.json({ success: true, data: inst });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// PUT /api/institute
router.put('/', ...auth, requirePermission('institute.update'), async (req, res) => {
  try {
    const inst = await Institute.findByIdAndUpdate(req.instituteId, { $set: req.body }, { new: true, runValidators: true });
    if (!inst) return res.status(404).json({ success: false, message: 'Institute not found' });
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'UPDATE', resource: 'institutes', resourceId: req.instituteId, req });
    return res.json({ success: true, data: inst });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/institute/dashboard-stats
router.get('/dashboard-stats', ...auth, async (req, res) => {
  try {
    const iid = req.instituteId;
    const today = new Date().toISOString().split('T')[0];
    const [totalStudents, totalEmployees, totalTeachers, totalClasses, presentToday] = await Promise.all([
      Student.countDocuments({ institute: iid, deletedAt: null }),
      Employee.countDocuments({ institute: iid, deletedAt: null }),
      Employee.countDocuments({ institute: iid, isTeacher: true, deletedAt: null }),
      Class.countDocuments({ institute: iid, deletedAt: null }),
      Attendance.countDocuments({ date: today, status: 'present' }),
    ]);
    const assigned = await FeeAssignment.aggregate([
      { $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 'st' } },
      { $match: { 'st.institute': iid } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const paid = await FeePayment.aggregate([
      { $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 'st' } },
      { $match: { 'st.institute': iid, status: 'paid', deletedAt: null } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const pendingFees = (assigned[0]?.total || 0) - (paid[0]?.total || 0);
    return res.json({ success: true, data: { totalStudents, totalEmployees, totalTeachers, totalClasses, presentToday, pendingFees } });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ── Super admin: list all institutes ─────────────────────────────────────────
router.get('/all', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const institutes = await Institute.find({ deletedAt: null }).sort({ name: 1 });
    return res.json({ success: true, data: institutes });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

router.post('/create', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const inst = await Institute.create(req.body);
    logAudit({ userId: req.user._id, action: 'CREATE', resource: 'institutes', resourceId: inst._id, newData: req.body, req });
    return res.status(201).json({ success: true, data: inst });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
