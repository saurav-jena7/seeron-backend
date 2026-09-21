const router = require('express').Router();
const Institute = require('../db/models/Institute');
const Student   = require('../db/models/Student');
const Employee  = require('../db/models/Employee');
const { User }  = require('../db/models/User');
const InstituteMembership = require('../db/models/InstituteMembership');
const { Class } = require('../db/models/Academic');
const Attendance = require('../db/models/Attendance');
const { FeeAssignment, FeePayment } = require('../db/models/Fee');
const { authenticate, loadMembership, requirePermission, requireSuperAdmin } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const auth = [authenticate, loadMembership];

// ── GET /api/institute ────────────────────────────────────────────────────────
router.get('/', authenticate, loadMembership, async (req, res) => {
  try {
    const inst = await Institute.findOne({ _id: req.instituteId, deletedAt: null });
    if (!inst) return res.status(404).json({ success: false, message: 'Institute not found' });
    return res.json({ success: true, data: inst });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ── PUT /api/institute ────────────────────────────────────────────────────────
router.put('/', ...auth, requirePermission('institute.update'), async (req, res) => {
  try {
    const inst = await Institute.findByIdAndUpdate(
      req.instituteId, { $set: req.body }, { new: true, runValidators: true }
    );
    if (!inst) return res.status(404).json({ success: false, message: 'Institute not found' });
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'UPDATE', resource: 'institutes', resourceId: req.instituteId, req });
    return res.json({ success: true, data: inst });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/institute/dashboard-stats ────────────────────────────────────────
router.get('/dashboard-stats', ...auth, async (req, res) => {
  try {
    const iid   = req.instituteId;
    const today = new Date().toISOString().split('T')[0];

    const [totalStudents, totalEmployees, totalTeachers, totalClasses, presentToday] = await Promise.all([
      Student.countDocuments({ institute: iid, deletedAt: null }),
      Employee.countDocuments({ institute: iid, deletedAt: null }),
      Employee.countDocuments({ institute: iid, isTeacher: true, deletedAt: null }),
      Class.countDocuments({ institute: iid, deletedAt: null }),
      Attendance.countDocuments({ date: today, status: 'present' }),
    ]);

    const [assigned, paid] = await Promise.all([
      FeeAssignment.aggregate([
        { $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 'st' } },
        { $match: { 'st.institute': iid } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      FeePayment.aggregate([
        { $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 'st' } },
        { $match: { 'st.institute': iid, status: 'paid', deletedAt: null } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    const pendingFees = (assigned[0]?.total || 0) - (paid[0]?.total || 0);
    return res.json({ success: true, data: { totalStudents, totalEmployees, totalTeachers, totalClasses, presentToday, pendingFees } });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/institute/chart-data — real chart data ──────────────────────────
router.get('/chart-data', ...auth, async (req, res) => {
  try {
    const iid = req.instituteId;

    // 1. Last 7 working days attendance
    const workingDays = [];
    const cursor = new Date();
    while (workingDays.length < 7) {
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) workingDays.unshift(cursor.toISOString().split('T')[0]);
      cursor.setDate(cursor.getDate() - 1);
    }
    const studentIds = await Student.find({ institute: iid, deletedAt: null }).distinct('_id');

    const weeklyAttendance = await Promise.all(workingDays.map(async (date) => {
      const [present, absent, late] = await Promise.all([
        Attendance.countDocuments({ student: { $in: studentIds }, date, status: 'present' }),
        Attendance.countDocuments({ student: { $in: studentIds }, date, status: 'absent' }),
        Attendance.countDocuments({ student: { $in: studentIds }, date, status: 'late' }),
      ]);
      return {
        day:  new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short' }),
        date, present, absent, late,
      };
    }));

    // 2. Last 6 months fee collection
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
    }

    const monthlyFees = await Promise.all(months.map(async (ym) => {
      const start = `${ym}-01`, end = `${ym}-31`;
      const [collResult, pendResult] = await Promise.all([
        FeePayment.aggregate([
          { $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 'st' } },
          { $match: { 'st.institute': iid, status: 'paid', deletedAt: null, paymentDate: { $gte: start, $lte: end } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        FeeAssignment.aggregate([
          { $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 'st' } },
          { $match: { 'st.institute': iid, dueDate: { $gte: start, $lte: end } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
      ]);
      const collected = collResult[0]?.total || 0;
      const assigned  = pendResult[0]?.total || 0;
      return {
        month:     new Date(`${ym}-15`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        collected,
        pending:   Math.max(0, assigned - collected),
      };
    }));

    // 3. Student status breakdown
    const statusBreakdown = await Student.aggregate([
      { $match: { institute: iid, deletedAt: null } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    // 4. Class-wise active student count (top 8 classes)
    const classWise = await Student.aggregate([
      { $match: { institute: iid, deletedAt: null, status: 'active' } },
      { $group: { _id: '$class', count: { $sum: 1 } } },
      { $lookup: { from: 'classes', localField: '_id', foreignField: '_id', as: 'cls' } },
      { $unwind: { path: '$cls', preserveNullAndEmpty: true } },
      { $project: { _id: 0, class: { $ifNull: ['$cls.name', 'Unknown'] }, count: 1, level: { $ifNull: ['$cls.level', 99] } } },
      { $sort: { level: 1 } },
      { $limit: 8 },
    ]);

    // 5. Today's attendance live summary
    const todaySummary = await Attendance.aggregate([
      { $match: { student: { $in: studentIds }, date: new Date().toISOString().split('T')[0] } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    return res.json({
      success: true,
      data: { weeklyAttendance, monthlyFees, studentStatus: statusBreakdown.map(s => ({ name: s._id, value: s.count })), classWise, todaySummary },
    });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ── Super admin: list all institutes ─────────────────────────────────────────
router.get('/all', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const institutes = await Institute.find({ deletedAt: null }).sort({ name: 1 });
    // Attach member count for each institute
    const result = await Promise.all(institutes.map(async (inst) => {
      const memberCount = await InstituteMembership.countDocuments({ institute: inst._id, isActive: true, deletedAt: null });
      const studentCount = await Student.countDocuments({ institute: inst._id, deletedAt: null });
      return { ...inst.toJSON(), memberCount, studentCount };
    }));
    return res.json({ success: true, data: result });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ── Super admin: get one institute by id ─────────────────────────────────────
router.get('/detail/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const inst = await Institute.findById(req.params.id);
    if (!inst) return res.status(404).json({ success: false, message: 'Institute not found' });
    const [memberCount, studentCount, employeeCount] = await Promise.all([
      InstituteMembership.countDocuments({ institute: inst._id, isActive: true, deletedAt: null }),
      Student.countDocuments({ institute: inst._id, deletedAt: null }),
      Employee.countDocuments({ institute: inst._id, deletedAt: null }),
    ]);
    return res.json({ success: true, data: { ...inst.toJSON(), memberCount, studentCount, employeeCount } });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ── Super admin: update institute by id ──────────────────────────────────────
router.put('/detail/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const inst = await Institute.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true, runValidators: true });
    if (!inst) return res.status(404).json({ success: false, message: 'Institute not found' });
    logAudit({ userId: req.user._id, action: 'UPDATE', resource: 'institutes', resourceId: inst._id, req });
    return res.json({ success: true, data: inst });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ── Super admin: create institute ────────────────────────────────────────────
router.post('/create', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const inst = await Institute.create(req.body);
    logAudit({ userId: req.user._id, action: 'CREATE', resource: 'institutes', resourceId: inst._id, newData: req.body, req });
    return res.status(201).json({ success: true, data: inst });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

// ── Super admin: soft-delete institute ───────────────────────────────────────
router.delete('/detail/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const inst = await Institute.findByIdAndUpdate(req.params.id, { deletedAt: new Date() }, { new: true });
    if (!inst) return res.status(404).json({ success: false, message: 'Institute not found' });
    logAudit({ userId: req.user._id, action: 'DELETE', resource: 'institutes', resourceId: inst._id, req });
    return res.json({ success: true, message: 'Institute deleted' });
  } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
