const router = require('express').Router();
const Attendance = require('../db/models/Attendance');
const Student = require('../db/models/Student');
const { authenticate, loadMembership, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { logAudit } = require('../middleware/audit');

const auth = [authenticate, loadMembership];

router.get('/', ...auth, requirePermission('attendance.view'), async (req, res) => {
  try {
    const { date, class_id, section_id, student_id, from_date, to_date } = req.query;
    const filter = {};
    if (date) filter.date = date;
    if (from_date || to_date) { filter.date = {}; if (from_date) filter.date.$gte = from_date; if (to_date) filter.date.$lte = to_date; }
    if (class_id)   filter.class   = class_id;
    if (section_id) filter.section = section_id;
    if (student_id) filter.student = student_id;
    const rows = await Attendance.find(filter)
      .populate({ path: 'student', select: 'name admissionNo rollNo institute', match: { institute: req.instituteId } })
      .populate('class','name').populate('section','name').populate('markedBy','name')
      .sort({ date: -1 });
    return res.json({ success: true, data: rows.filter(r => r.student !== null) });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.post('/bulk', ...auth, requirePermission('attendance.create'), validate(['date','records']), async (req, res) => {
  try {
    const { date, class_id, section_id, records } = req.body;
    if (!Array.isArray(records) || records.length === 0) return res.status(400).json({ success: false, message: 'records must be a non-empty array' });
    const ops = records.map(r => ({
      updateOne: {
        filter: { student: r.student_id, date },
        update: { $set: { student: r.student_id, class: class_id || null, section: section_id || null, date, status: r.status || 'present', remarks: r.remarks || null, markedBy: req.user._id } },
        upsert: true,
      },
    }));
    await Attendance.bulkWrite(ops);
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'CREATE', resource: 'attendance', newData: { date, count: records.length }, req });
    return res.json({ success: true, message: `Attendance saved for ${records.length} students` });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.post('/', ...auth, requirePermission('attendance.create'), validate(['student_id','date','status']), async (req, res) => {
  try {
    const { student_id, class_id, section_id, date, status, remarks } = req.body;
    await Attendance.findOneAndUpdate(
      { student: student_id, date },
      { $set: { student: student_id, class: class_id || null, section: section_id || null, date, status, remarks: remarks || null, markedBy: req.user._id } },
      { upsert: true, new: true }
    );
    return res.status(201).json({ success: true, message: 'Attendance recorded' });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.get('/report/:studentId', ...auth, requirePermission('attendance.view'), async (req, res) => {
  try {
    const { month, year } = req.query;
    const filter = { student: req.params.studentId };
    if (month && year) filter.date = { $gte: `${year}-${String(month).padStart(2,'0')}-01`, $lte: `${year}-${String(month).padStart(2,'0')}-31` };
    else if (year) filter.date = { $gte: `${year}-01-01`, $lte: `${year}-12-31` };
    const records = await Attendance.find(filter).sort({ date: 1 });
    const summary = records.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
    const total = records.length, present = summary.present || 0;
    return res.json({ success: true, data: { records, summary, total, presentDays: present, attendancePercentage: total > 0 ? ((present / total) * 100).toFixed(2) : '0.00' } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.get('/today-summary', ...auth, requirePermission('attendance.view'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const studentIds = await Student.find({ institute: req.instituteId, deletedAt: null }).distinct('_id');
    const summary = await Attendance.aggregate([
      { $match: { date: today, student: { $in: studentIds } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return res.json({ success: true, data: { date: today, summary } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
