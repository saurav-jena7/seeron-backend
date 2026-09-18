const router = require('express').Router();
const { FeeCategory, FeeAssignment, FeePayment } = require('../db/models/Fee');
const Student = require('../db/models/Student');
const { authenticate, loadMembership, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { logAudit } = require('../middleware/audit');
const { softDelete } = require('../middleware/softDelete');

const auth = [authenticate, loadMembership];

// ── FEE CATEGORIES ─────────────────────────────────────────────────────────────
router.get('/categories',           ...auth, requirePermission('fee.view'),     async (req, res) => {
  try { return res.json({ success: true, data: await FeeCategory.find({ institute: req.instituteId, deletedAt: null }).sort({ name: 1 }) }); }
  catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.post('/categories',          ...auth, requirePermission('fee.create'),   validate(['name','amount']), async (req, res) => {
  try {
    const cat = await FeeCategory.create({ institute: req.instituteId, ...req.body });
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'CREATE', resource: 'fee_categories', resourceId: cat._id, req });
    return res.status(201).json({ success: true, data: cat });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.put('/categories/:id',       ...auth, requirePermission('fee.update'),   async (req, res) => {
  try {
    const cat = await FeeCategory.findOneAndUpdate({ _id: req.params.id, institute: req.instituteId, deletedAt: null }, { $set: req.body }, { new: true });
    if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });
    return res.json({ success: true, data: cat });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.delete('/categories/:id',    ...auth, requirePermission('fee.delete'),   async (req, res) => {
  try { await softDelete(FeeCategory, req.params.id); return res.json({ success: true, message: 'Deleted' }); }
  catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ── FEE ASSIGNMENTS ────────────────────────────────────────────────────────────
router.get('/assignments',          ...auth, requirePermission('fee.view'),     async (req, res) => {
  try {
    const filter = {};
    if (req.query.student_id) filter.student = req.query.student_id;
    const rows = await FeeAssignment.find(filter)
      .populate('feeCategory','name frequency').populate('student','name admissionNo').sort({ dueDate: 1 });
    return res.json({ success: true, data: rows });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.post('/assignments',         ...auth, requirePermission('fee.create'),   validate(['student_id','fee_category_id','amount']), async (req, res) => {
  try {
    const { student_id, fee_category_id, academic_year_id, amount, due_date } = req.body;
    const asgn = await FeeAssignment.create({ student: student_id, feeCategory: fee_category_id, academicYear: academic_year_id || null, amount, dueDate: due_date || null });
    return res.status(201).json({ success: true, data: asgn });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ── FEE PAYMENTS ───────────────────────────────────────────────────────────────
router.get('/payments',             ...auth, requirePermission('fee.view'),     async (req, res) => {
  try {
    const { page = 1, limit = 20, student_id, status, from_date, to_date } = req.query;
    const filter = { deletedAt: null };
    if (student_id) filter.student = student_id;
    if (status)     filter.status  = status;
    if (from_date || to_date) { filter.paymentDate = {}; if (from_date) filter.paymentDate.$gte = from_date; if (to_date) filter.paymentDate.$lte = to_date; }
    const total = await FeePayment.countDocuments(filter);
    const rows  = await FeePayment.find(filter)
      .populate({ path: 'student', select: 'name admissionNo institute', match: { institute: req.instituteId } })
      .populate('feeCategory','name').populate('collectedBy','name')
      .sort({ paymentDate: -1 }).skip((+page - 1) * +limit).limit(+limit);
    return res.json({ success: true, data: rows.filter(r => r.student !== null), meta: { total, page: +page, limit: +limit } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// fee.collect is the specific permission for collecting payments
router.post('/payments',            ...auth, requirePermission('fee.collect'),  validate(['student_id','amount','payment_date']), async (req, res) => {
  try {
    const { student_id, fee_category_id, academic_year_id, amount, payment_date, payment_method, transaction_ref, remarks } = req.body;
    const payment = await FeePayment.create({
      student: student_id, feeCategory: fee_category_id || null, academicYear: academic_year_id || null,
      amount, paymentDate: payment_date, paymentMethod: payment_method || 'cash',
      transactionRef: transaction_ref || null, remarks: remarks || null,
      collectedBy: req.user._id, status: 'paid',
    });
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'CREATE', resource: 'fee_payments', resourceId: payment._id, req });
    return res.status(201).json({ success: true, data: payment });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.delete('/payments/:id',      ...auth, requirePermission('fee.delete'),   async (req, res) => {
  try { await softDelete(FeePayment, req.params.id); return res.json({ success: true, message: 'Deleted' }); }
  catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ── FEE SUMMARY ────────────────────────────────────────────────────────────────
router.get('/summary/:studentId',   ...auth, requirePermission('fee.view'),     async (req, res) => {
  try {
    const student = await Student.findOne({ _id: req.params.studentId, institute: req.instituteId });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    const [assignAgg, paidAgg, payments] = await Promise.all([
      FeeAssignment.aggregate([{ $match: { student: student._id } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      FeePayment.aggregate([{ $match: { student: student._id, status: 'paid', deletedAt: null } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      FeePayment.find({ student: student._id, deletedAt: null }).populate('feeCategory','name').sort({ paymentDate: -1 }),
    ]);
    const totalAssigned = assignAgg[0]?.total || 0;
    const totalPaid     = paidAgg[0]?.total   || 0;
    return res.json({ success: true, data: { student: { id: student._id, name: student.name, admissionNo: student.admissionNo }, totalAssigned, totalPaid, balance: totalAssigned - totalPaid, payments } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
