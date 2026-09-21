const router = require('express').Router();
const Employee = require('../db/models/Employee');
const { authenticate, loadMembership, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { logAudit } = require('../middleware/audit');
const { softDelete } = require('../middleware/softDelete');

const auth = [authenticate, loadMembership];

router.get('/',               ...auth, requirePermission('employee.view'),   async (req, res) => {
  try {
    const { page = 1, limit = 20, search, department, is_teacher } = req.query;
    const filter = { institute: req.instituteId, deletedAt: null };
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { employeeCode: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
    if (department) filter.department = department;
    if (is_teacher !== undefined) filter.isTeacher = is_teacher === 'true' || is_teacher === '1';
    const total = await Employee.countDocuments(filter);
    const rows  = await Employee.find(filter).sort({ createdAt: -1 })
      .skip((+page - 1) * +limit).limit(+limit);
    return res.json({ success: true, data: rows, meta: { total, page: +page, limit: +limit } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.get('/teachers/list', ...auth, requirePermission('employee.view'), async (req, res) => {
  try {
    const iid = req.instituteId;

    // Source 1: Employees explicitly marked as teachers
    const employeeTeachers = await Employee.find({ institute: iid, isTeacher: true, deletedAt: null })
      .sort({ name: 1 });

    // Source 2: Members with TEACHER role who don't have an Employee record yet
    const InstituteMembership = require('../db/models/InstituteMembership');
    const Role = require('../db/models/Role');
    const { User } = require('../db/models/User');

    const teacherRole = await Role.findOne({ name: 'TEACHER', institute: null });
    if (teacherRole) {
      const teacherMemberships = await InstituteMembership.find({
        institute: iid,
        roles: teacherRole._id,
        isActive: true,
        deletedAt: null,
      }).populate('user', 'name email phone');

      // Find memberships whose user does NOT already have an Employee record
      const existingUserIds = new Set(employeeTeachers.map(e => String(e.user)));

      for (const m of teacherMemberships) {
        if (!m.user) continue;
        if (existingUserIds.has(String(m.user._id))) continue; // already in employees list

        // Create a virtual teacher entry — use membership createdAt as joining date fallback
        employeeTeachers.push({
          id:              m.user._id,
          _id:             m.user._id,
          name:            m.user.name,
          email:           m.user.email,
          phone:           m.user.phone,
          employeeCode:    null,
          employee_code:   null,
          designation:     'Teacher',
          department:      null,
          // Use membership creation date as the joining date
          // Both camelCase and snake_case so frontend can pick either
          joiningDate:     m.createdAt ? m.createdAt.toISOString().split('T')[0] : null,
          joining_date:    m.createdAt ? m.createdAt.toISOString().split('T')[0] : null,
          created_at:      m.createdAt ? m.createdAt.toISOString() : null,
          isTeacher:       true,
          is_teacher:      true,
          institute:       iid,
          _fromMembership: true,
        });
      }
    }

    // Sort all by name
    employeeTeachers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return res.json({ success: true, data: employeeTeachers });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// GET /api/employees/deleted — soft-deleted employees
router.get('/deleted', ...auth, requirePermission('employee.delete'), async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const filter = { institute: req.instituteId, deletedAt: { $ne: null } };
    if (search) filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { employeeCode: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
    const total = await Employee.countDocuments(filter);
    const rows  = await Employee.find(filter)
      .sort({ deletedAt: -1 }).skip((+page - 1) * +limit).limit(+limit);
    return res.json({ success: true, data: rows, meta: { total, page: +page, limit: +limit } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// POST /api/employees/:id/restore — restore soft-deleted employee
router.post('/:id/restore', ...auth, requirePermission('employee.delete'), async (req, res) => {
  try {
    const emp = await Employee.findOne({ _id: req.params.id, institute: req.instituteId, deletedAt: { $ne: null } });
    if (!emp) return res.status(404).json({ success: false, message: 'Deleted employee not found' });
    emp.deletedAt = null;
    await emp.save();
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'RESTORE', resource: 'employees', resourceId: emp._id, req });
    return res.json({ success: true, message: 'Employee restored', data: emp });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// PATCH /api/employees/:id/toggle-status — activate or deactivate (isActive flag)
router.patch('/:id/toggle-status', ...auth, requirePermission('employee.update'), async (req, res) => {
  try {
    const emp = await Employee.findOne({ _id: req.params.id, institute: req.instituteId, deletedAt: null });
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });
    // isActive may not exist on older docs — default to true if undefined
    emp.isActive = emp.isActive === false ? true : false;
    await emp.save();
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'UPDATE', resource: 'employees', resourceId: emp._id, newData: { isActive: emp.isActive }, req });
    return res.json({ success: true, message: `Employee ${emp.isActive ? 'activated' : 'deactivated'}`, data: emp });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.get('/:id',            ...auth, requirePermission('employee.view'),   async (req, res) => {
  try {
    const emp = await Employee.findOne({ _id: req.params.id, institute: req.instituteId, deletedAt: null });
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });
    return res.json({ success: true, data: emp });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.post('/',              ...auth, requirePermission('employee.create'),  validate(['name']), async (req, res) => {
  try {
    const emp = await Employee.create({ ...req.body, institute: req.instituteId });
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'CREATE', resource: 'employees', resourceId: emp._id, newData: req.body, req });
    return res.status(201).json({ success: true, data: emp });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.put('/:id',            ...auth, requirePermission('employee.update'),  async (req, res) => {
  try {
    const emp = await Employee.findOneAndUpdate(
      { _id: req.params.id, institute: req.instituteId, deletedAt: null },
      { $set: req.body }, { new: true, runValidators: true }
    );
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'UPDATE', resource: 'employees', resourceId: emp._id, req });
    return res.json({ success: true, data: emp });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/:id',         ...auth, requirePermission('employee.delete'),  async (req, res) => {
  try {
    const emp = await Employee.findOne({ _id: req.params.id, institute: req.instituteId, deletedAt: null });
    if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });
    await softDelete(Employee, req.params.id);
    logAudit({ userId: req.user._id, instituteId: req.instituteId, action: 'DELETE', resource: 'employees', resourceId: req.params.id, req });
    return res.json({ success: true, message: 'Employee deleted' });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
