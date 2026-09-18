/**
 * Student Self-Service Portal — all routes require student to be authenticated.
 * Students can only see their OWN data (enforced at resource level, not just permission).
 */
const router = require('express').Router();
const Student = require('../db/models/Student');
const Attendance = require('../db/models/Attendance');
const { FeeAssignment, FeePayment } = require('../db/models/Fee');
const { Timetable } = require('../db/models/Academic');
const Notice = require('../db/models/Notice');
const InstituteMembership = require('../db/models/InstituteMembership');
const { authenticate } = require('../middleware/auth');

async function getMyContext(userId) {
  const membership = await InstituteMembership.findOne({ user: userId, isActive: true, deletedAt: null })
    .populate('roles','name');
  if (!membership) return { membership: null, student: null };
  const isStudent = membership.roles.some(r => r.name === 'STUDENT');
  if (!isStudent) return { membership, student: null, notStudent: true };
  const student = await Student.findOne({ user: userId, institute: membership.institute, deletedAt: null })
    .populate('class','name').populate('section','name').populate('academicYear','name');
  return { membership, student, instituteId: membership.institute };
}

router.get('/profile', authenticate, async (req, res) => {
  try {
    const { student } = await getMyContext(req.user._id);
    if (!student) return res.status(404).json({ success: false, message: 'Student record not found' });
    return res.json({ success: true, data: student });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.get('/attendance', authenticate, async (req, res) => {
  try {
    const { student } = await getMyContext(req.user._id);
    if (!student) return res.status(404).json({ success: false, message: 'Student record not found' });
    const { month, year } = req.query;
    const filter = { student: student._id };
    if (month && year) filter.date = { $gte: `${year}-${String(month).padStart(2,'0')}-01`, $lte: `${year}-${String(month).padStart(2,'0')}-31` };
    const records = await Attendance.find(filter).sort({ date: -1 });
    const summary = records.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
    const total = records.length, present = summary.present || 0;
    return res.json({ success: true, data: { records, summary, total, attendancePercentage: total > 0 ? ((present / total) * 100).toFixed(2) : '0.00' } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.get('/fees', authenticate, async (req, res) => {
  try {
    const { student } = await getMyContext(req.user._id);
    if (!student) return res.status(404).json({ success: false, message: 'Student record not found' });
    const [assignAgg, paidAgg, payments] = await Promise.all([
      FeeAssignment.aggregate([{ $match: { student: student._id } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      FeePayment.aggregate([{ $match: { student: student._id, status: 'paid', deletedAt: null } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      FeePayment.find({ student: student._id, deletedAt: null }).populate('feeCategory','name').sort({ paymentDate: -1 }),
    ]);
    const totalAssigned = assignAgg[0]?.total || 0, totalPaid = paidAgg[0]?.total || 0;
    return res.json({ success: true, data: { totalAssigned, totalPaid, balance: totalAssigned - totalPaid, payments } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.get('/timetable', authenticate, async (req, res) => {
  try {
    const { student } = await getMyContext(req.user._id);
    if (!student) return res.status(404).json({ success: false, message: 'Student record not found' });
    const filter = { class: student.class?._id, deletedAt: null };
    if (student.section?._id) filter.$or = [{ section: student.section._id }, { section: null }];
    const rows = await Timetable.find(filter).populate('subject','name').populate('teacher','name').sort({ dayOfWeek: 1, startTime: 1 });
    return res.json({ success: true, data: rows });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.get('/notices', authenticate, async (req, res) => {
  try {
    const { membership } = await getMyContext(req.user._id);
    if (!membership) return res.status(404).json({ success: false, message: 'No membership found' });
    const notices = await Notice.find({
      institute: membership.institute, deletedAt: null,
      $and: [
        { $or: [{ audience: 'all' }, { audience: 'students' }] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
      ],
    }).populate('createdBy','name').sort({ createdAt: -1 }).limit(50);
    return res.json({ success: true, data: notices });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
