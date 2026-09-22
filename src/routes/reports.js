/**
 * Reports Routes — aggregated data for Academic, Attendance, Finance, HR reports
 * All routes: GET only, read-only aggregations from existing collections
 */
const router   = require('express').Router();
const mongoose = require('mongoose');
const { authenticate, loadMembership, requirePermission } = require('../middleware/auth');

const auth = [authenticate, loadMembership];

function getInstId(req) {
  return req.instituteId ||
    req.headers['x-institute-id'] ||
    req.query.institute_id;
}

// ─────────────────────────────────────────────────────────────────────────────
//  ACADEMIC REPORTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/reports/academic/students-by-class
// Returns count of students grouped by class
router.get('/academic/students-by-class', ...auth, requirePermission('report.academic.view'), async (req, res) => {
  try {
    const Student = mongoose.model('Student');
    const data = await Student.aggregate([
      { $match: { institute: new mongoose.Types.ObjectId(getInstId(req)), deletedAt: null } },
      { $group: { _id: '$class', count: { $sum: 1 } } },
      { $lookup: { from: 'classes', localField: '_id', foreignField: '_id', as: 'cls' } },
      { $unwind: { path: '$cls', preserveNullAndEmpty: true } },
      { $project: { class: { $ifNull: ['$cls.name', 'Unassigned'] }, count: 1, _id: 0 } },
      { $sort: { class: 1 } },
    ]);
    return res.json({ success: true, data });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/reports/academic/subjects-by-class
// Count of class-subject assignments per class
router.get('/academic/subjects-by-class', ...auth, requirePermission('report.academic.view'), async (req, res) => {
  try {
    const { ClassSubject, Class } = require('../db/models/Academic');
    const classes = await Class.find({ institute: getInstId(req), deletedAt: null }).select('name').sort('name');
    const data = await Promise.all(classes.map(async cls => {
      const count = await ClassSubject.countDocuments({ class: cls._id, deletedAt: null });
      return { class: cls.name, subjects: count };
    }));
    return res.json({ success: true, data });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/reports/academic/teacher-load
// How many class-subjects each teacher is assigned to
router.get('/academic/teacher-load', ...auth, requirePermission('report.academic.view'), async (req, res) => {
  try {
    const { ClassSubject } = require('../db/models/Academic');
    const Employee = require('../db/models/Employee');
    const data = await ClassSubject.aggregate([
      { $match: { deletedAt: null, teacher: { $ne: null } } },
      { $group: { _id: '$teacher', subjects: { $sum: 1 } } },
      { $lookup: { from: 'employees', localField: '_id', foreignField: '_id', as: 'emp' } },
      { $unwind: { path: '$emp', preserveNullAndEmpty: true } },
      { $match: { 'emp.institute': new mongoose.Types.ObjectId(getInstId(req)) } },
      { $project: { teacher: { $ifNull: ['$emp.name', 'Unknown'] }, subjects: 1, _id: 0 } },
      { $sort: { subjects: -1 } },
    ]);
    return res.json({ success: true, data });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  ATTENDANCE REPORTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/reports/attendance/summary?month=&year=
// Overall attendance rate by status for a given month
router.get('/attendance/summary', ...auth, requirePermission('report.attendance.view'), async (req, res) => {
  try {
    const Attendance = mongoose.model('Attendance');
    const { month, year } = req.query;
    const now = new Date();
    const m = parseInt(month) || now.getMonth() + 1;
    const y = parseInt(year)  || now.getFullYear();

    const startDate = `${y}-${String(m).padStart(2,'0')}-01`;
    const endDate   = `${y}-${String(m).padStart(2,'0')}-31`;

    const iid = new mongoose.Types.ObjectId(getInstId(req));
    const data = await Attendance.aggregate([
      { $match: { institute: iid, date: { $gte: startDate, $lte: endDate }, deletedAt: null } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { status: '$_id', count: 1, _id: 0 } },
    ]);
    return res.json({ success: true, data });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/reports/attendance/class-wise?month=&year=
// Attendance percentage per class
router.get('/attendance/class-wise', ...auth, requirePermission('report.attendance.view'), async (req, res) => {
  try {
    const Attendance = mongoose.model('Attendance');
    const { month, year } = req.query;
    const now = new Date();
    const m = parseInt(month) || now.getMonth() + 1;
    const y = parseInt(year)  || now.getFullYear();
    const startDate = `${y}-${String(m).padStart(2,'0')}-01`;
    const endDate   = `${y}-${String(m).padStart(2,'0')}-31`;

    const iid = new mongoose.Types.ObjectId(getInstId(req));
    const data = await Attendance.aggregate([
      { $match: { institute: iid, date: { $gte: startDate, $lte: endDate }, deletedAt: null } },
      { $group: {
        _id: { class: '$class', status: '$status' },
        count: { $sum: 1 }
      }},
      { $lookup: { from: 'classes', localField: '_id.class', foreignField: '_id', as: 'cls' } },
      { $unwind: { path: '$cls', preserveNullAndEmpty: true } },
      { $group: {
        _id: { class: '$cls.name', classId: '$_id.class' },
        total:   { $sum: '$count' },
        present: { $sum: { $cond: [{ $eq: ['$_id.status', 'present'] }, '$count', 0] } },
      }},
      { $project: {
        class: { $ifNull: ['$_id.class', 'Unknown'] }, total: 1, present: 1,
        percentage: { $cond: ['$total', { $round: [{ $multiply: [{ $divide: ['$present', '$total'] }, 100] }, 1] }, 0] },
        _id: 0,
      }},
      { $sort: { class: 1 } },
    ]);
    return res.json({ success: true, data });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/reports/attendance/low-attendance?threshold=75&month=&year=
router.get('/attendance/low-attendance', ...auth, requirePermission('report.attendance.view'), async (req, res) => {
  try {
    const Attendance = mongoose.model('Attendance');
    const Student    = mongoose.model('Student');
    const { month, year, threshold = 75 } = req.query;
    const now = new Date();
    const m = parseInt(month) || now.getMonth() + 1;
    const y = parseInt(year)  || now.getFullYear();
    const startDate = `${y}-${String(m).padStart(2,'0')}-01`;
    const endDate   = `${y}-${String(m).padStart(2,'0')}-31`;

    const iid = new mongoose.Types.ObjectId(getInstId(req));
    const data = await Attendance.aggregate([
      { $match: { institute: iid, date: { $gte: startDate, $lte: endDate }, deletedAt: null } },
      { $group: {
        _id: '$student',
        total:   { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
      }},
      { $project: {
        percentage: { $cond: ['$total', { $round: [{ $multiply: [{ $divide: ['$present', '$total'] }, 100] }, 1] }, 0] },
        total: 1, present: 1,
      }},
      { $match: { percentage: { $lt: parseInt(threshold) } } },
      { $lookup: { from: 'students', localField: '_id', foreignField: '_id', as: 'student' } },
      { $unwind: '$student' },
      { $project: {
        name: '$student.name', admissionNo: '$student.admissionNo',
        total: 1, present: 1, percentage: 1, _id: 0
      }},
      { $sort: { percentage: 1 } },
      { $limit: 50 },
    ]);
    return res.json({ success: true, data });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  FINANCE REPORTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/reports/finance/collection-by-category
router.get('/finance/collection-by-category', ...auth, requirePermission('report.finance.view'), async (req, res) => {
  try {
    const FeePayment  = mongoose.model('FeePayment');
    const iid = new mongoose.Types.ObjectId(getInstId(req));
    const data = await FeePayment.aggregate([
      { $match: { institute: iid, status: 'paid', deletedAt: null } },
      { $group: { _id: '$feeCategory', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $lookup: { from: 'feecategories', localField: '_id', foreignField: '_id', as: 'cat' } },
      { $unwind: { path: '$cat', preserveNullAndEmpty: true } },
      { $project: { category: { $ifNull: ['$cat.name', 'Unknown'] }, total: 1, count: 1, _id: 0 } },
      { $sort: { total: -1 } },
    ]);
    return res.json({ success: true, data });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/reports/finance/monthly-revenue?year=
router.get('/finance/monthly-revenue', ...auth, requirePermission('report.finance.view'), async (req, res) => {
  try {
    const FeePayment = mongoose.model('FeePayment');
    const iid = new mongoose.Types.ObjectId(getInstId(req));
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const data = await FeePayment.aggregate([
      { $match: {
        institute: iid, status: 'paid', deletedAt: null,
        paymentDate: { $regex: `^${year}-` }
      }},
      { $group: {
        _id: { $substr: ['$paymentDate', 5, 2] },
        revenue: { $sum: '$amount' }, count: { $sum: 1 },
      }},
      { $project: { month: { $arrayElemAt: [MONTHS, { $subtract: [{ $toInt: '$_id' }, 1] }] }, revenue: 1, count: 1, _id: 0 } },
      { $sort: { _id: 1 } },
    ]);
    return res.json({ success: true, data });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/reports/finance/payment-methods
router.get('/finance/payment-methods', ...auth, requirePermission('report.finance.view'), async (req, res) => {
  try {
    const FeePayment = mongoose.model('FeePayment');
    const iid = new mongoose.Types.ObjectId(getInstId(req));
    const data = await FeePayment.aggregate([
      { $match: { institute: iid, status: 'paid', deletedAt: null } },
      { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $project: { method: { $ifNull: ['$_id', 'Unknown'] }, total: 1, count: 1, _id: 0 } },
      { $sort: { total: -1 } },
    ]);
    return res.json({ success: true, data });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  HR REPORTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/reports/hr/employees-by-department
router.get('/hr/employees-by-department', ...auth, requirePermission('report.hr.view'), async (req, res) => {
  try {
    const Employee = require('../db/models/Employee');
    const data = await Employee.aggregate([
      { $match: { institute: new mongoose.Types.ObjectId(getInstId(req)), deletedAt: null } },
      { $group: { _id: '$department', count: { $sum: 1 } } },
      { $project: { department: { $ifNull: ['$_id', 'General'] }, count: 1, _id: 0 } },
      { $sort: { count: -1 } },
    ]);
    return res.json({ success: true, data });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/reports/hr/summary
router.get('/hr/summary', ...auth, requirePermission('report.hr.view'), async (req, res) => {
  try {
    const Employee = require('../db/models/Employee');
    const iid = getInstId(req);
    const [total, teachers, active] = await Promise.all([
      Employee.countDocuments({ institute: iid, deletedAt: null }),
      Employee.countDocuments({ institute: iid, isTeacher: true, deletedAt: null }),
      Employee.countDocuments({ institute: iid, isActive: true, deletedAt: null }),
    ]);
    return res.json({ success: true, data: { total, teachers, active, inactive: total - active } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
