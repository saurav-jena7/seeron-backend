const router = require('express').Router();
const { AcademicYear, Class, Section, Subject, Timetable } = require('../db/models/Academic');
const { authenticate, loadMembership, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { logAudit } = require('../middleware/audit');
const { softDelete } = require('../middleware/softDelete');

const auth = [authenticate, loadMembership];

// ── ACADEMIC YEARS ─────────────────────────────────────────────────────────────
router.get('/years',          ...auth, requirePermission('academic.view'),   async (req, res) => {
  try {
    return res.json({ success: true, data: await AcademicYear.find({ institute: req.instituteId, deletedAt: null }).sort({ startDate: -1 }) });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.post('/years',         ...auth, requirePermission('academic.create'), validate(['name','start_date','end_date']), async (req, res) => {
  try {
    const { name, start_date, end_date, is_current } = req.body;
    if (is_current) await AcademicYear.updateMany({ institute: req.instituteId }, { isCurrent: false });
    const y = await AcademicYear.create({ institute: req.instituteId, name, startDate: start_date, endDate: end_date, isCurrent: !!is_current });
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'CREATE', resource: 'academic_years', resourceId: y._id, req });
    return res.status(201).json({ success: true, data: y });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.put('/years/:id',      ...auth, requirePermission('academic.update'), async (req, res) => {
  try {
    const { name, start_date, end_date, is_current } = req.body;
    if (is_current) await AcademicYear.updateMany({ institute: req.instituteId }, { isCurrent: false });
    const y = await AcademicYear.findByIdAndUpdate(req.params.id, { name, startDate: start_date, endDate: end_date, isCurrent: !!is_current }, { new: true });
    return res.json({ success: true, data: y });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.delete('/years/:id',   ...auth, requirePermission('academic.delete'), async (req, res) => {
  try { await softDelete(AcademicYear, req.params.id); return res.json({ success: true, message: 'Deleted' }); }
  catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ── CLASSES ────────────────────────────────────────────────────────────────────
router.get('/classes',        ...auth, requirePermission('academic.view'),   async (req, res) => {
  try {
    return res.json({ success: true, data: await Class.find({ institute: req.instituteId, deletedAt: null }).sort({ level: 1 }) });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.post('/classes',       ...auth, requirePermission('academic.create'), validate(['name']), async (req, res) => {
  try {
    const cls = await Class.create({ institute: req.instituteId, name: req.body.name, level: req.body.level });
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'CREATE', resource: 'classes', resourceId: cls._id, req });
    return res.status(201).json({ success: true, data: cls });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.put('/classes/:id',    ...auth, requirePermission('academic.update'), async (req, res) => {
  try {
    const cls = await Class.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    return res.json({ success: true, data: cls });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.delete('/classes/:id', ...auth, requirePermission('academic.delete'), async (req, res) => {
  try { await softDelete(Class, req.params.id); return res.json({ success: true, message: 'Deleted' }); }
  catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ── SECTIONS ───────────────────────────────────────────────────────────────────
router.get('/sections',       ...auth, requirePermission('academic.view'),   async (req, res) => {
  try {
    const { class_id } = req.query;
    const filter = { deletedAt: null };
    if (class_id) filter.class = class_id;
    const rows = await Section.find(filter).populate('class','name level institute').populate('teacher','name');
    const filtered = rows.filter(s => s.class && String(s.class.institute) === String(req.instituteId));
    return res.json({ success: true, data: filtered });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.post('/sections',      ...auth, requirePermission('academic.create'), validate(['class_id','name']), async (req, res) => {
  try {
    const { class_id, name, capacity, teacher_id } = req.body;
    const s = await Section.create({ class: class_id, name, capacity: capacity || 40, teacher: teacher_id || null });
    return res.status(201).json({ success: true, data: s });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.put('/sections/:id',   ...auth, requirePermission('academic.update'), async (req, res) => {
  try {
    const s = await Section.findByIdAndUpdate(req.params.id, { name: req.body.name, capacity: req.body.capacity, teacher: req.body.teacher_id || null }, { new: true });
    return res.json({ success: true, data: s });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.delete('/sections/:id',...auth, requirePermission('academic.delete'), async (req, res) => {
  try { await softDelete(Section, req.params.id); return res.json({ success: true, message: 'Deleted' }); }
  catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ── SUBJECTS ───────────────────────────────────────────────────────────────────
router.get('/subjects',       ...auth, requirePermission('academic.view'),   async (req, res) => {
  try {
    return res.json({ success: true, data: await Subject.find({ institute: req.instituteId, deletedAt: null }).sort({ name: 1 }) });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.post('/subjects',      ...auth, requirePermission('academic.create'), validate(['name']), async (req, res) => {
  try {
    const s = await Subject.create({ institute: req.instituteId, ...req.body });
    return res.status(201).json({ success: true, data: s });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.put('/subjects/:id',   ...auth, requirePermission('academic.update'), async (req, res) => {
  try {
    const s = await Subject.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
    return res.json({ success: true, data: s });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.delete('/subjects/:id',...auth, requirePermission('academic.delete'), async (req, res) => {
  try { await softDelete(Subject, req.params.id); return res.json({ success: true, message: 'Deleted' }); }
  catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ── TIMETABLE ──────────────────────────────────────────────────────────────────
router.get('/timetable',      ...auth, requirePermission('academic.view'),   async (req, res) => {
  try {
    const { class_id, section_id } = req.query;
    const filter = { deletedAt: null };
    if (class_id)   filter.class   = class_id;
    if (section_id) filter.section = section_id;
    const rows = await Timetable.find(filter)
      .populate('subject','name').populate('teacher','name')
      .populate('class','name').populate('section','name')
      .sort({ dayOfWeek: 1, startTime: 1 });
    return res.json({ success: true, data: rows });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.post('/timetable',     ...auth, requirePermission('academic.create'), validate(['class_id','subject_id','day_of_week','start_time','end_time']), async (req, res) => {
  try {
    const { class_id, section_id, subject_id, teacher_id, day_of_week, start_time, end_time, room } = req.body;
    const entry = await Timetable.create({ class: class_id, section: section_id || null, subject: subject_id, teacher: teacher_id || null, dayOfWeek: day_of_week, startTime: start_time, endTime: end_time, room: room || null });
    return res.status(201).json({ success: true, data: entry });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
router.delete('/timetable/:id',...auth,requirePermission('academic.delete'), async (req, res) => {
  try { await softDelete(Timetable, req.params.id); return res.json({ success: true, message: 'Deleted' }); }
  catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
