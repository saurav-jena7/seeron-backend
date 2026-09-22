require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { User } = require('../db/models/User');
const Institute = require('../db/models/Institute');
const Permission = require('../db/models/Permission');
const Role = require('../db/models/Role');
const InstituteMembership = require('../db/models/InstituteMembership');
const Employee = require('../db/models/Employee');
const { AcademicYear, Class, Section, Subject } = require('../db/models/Academic');
const Student = require('../db/models/Student');
const { FeeCategory } = require('../db/models/Fee');

const hash = (p) => bcrypt.hashSync(p, 12);

// ─────────────────────────────────────────────────────────────────────────────
//  GRANULAR PERMISSIONS
// ─────────────────────────────────────────────────────────────────────────────
const PERMISSION_DEFS = [
  // institute
  { name: 'institute.view',          resource: 'institute',  action: 'view',       module: 'institute', description: 'View institute details' },
  { name: 'institute.update',        resource: 'institute',  action: 'update',     module: 'institute', description: 'Update institute settings' },
  // users
  { name: 'user.view',               resource: 'user',       action: 'view',       module: 'users',     description: 'View users' },
  { name: 'user.create',             resource: 'user',       action: 'create',     module: 'users',     description: 'Create users' },
  { name: 'user.update',             resource: 'user',       action: 'update',     module: 'users',     description: 'Update users' },
  { name: 'user.delete',             resource: 'user',       action: 'delete',     module: 'users',     description: 'Delete users' },
  // rbac
  { name: 'role.view',               resource: 'role',       action: 'view',       module: 'rbac',      description: 'View roles' },
  { name: 'role.create',             resource: 'role',       action: 'create',     module: 'rbac',      description: 'Create roles' },
  { name: 'role.update',             resource: 'role',       action: 'update',     module: 'rbac',      description: 'Update roles & assign permissions' },
  { name: 'role.delete',             resource: 'role',       action: 'delete',     module: 'rbac',      description: 'Delete roles' },
  { name: 'permission.view',         resource: 'permission', action: 'view',       module: 'rbac',      description: 'View all permissions' },
  { name: 'membership.view',         resource: 'membership', action: 'view',       module: 'rbac',      description: 'View memberships' },
  { name: 'membership.create',       resource: 'membership', action: 'create',     module: 'rbac',      description: 'Add users to institute' },
  { name: 'membership.update',       resource: 'membership', action: 'update',     module: 'rbac',      description: 'Change user roles' },
  { name: 'membership.delete',       resource: 'membership', action: 'delete',     module: 'rbac',      description: 'Remove from institute' },
  // students
  { name: 'student.view',            resource: 'student',    action: 'view',       module: 'students',  description: 'View students' },
  { name: 'student.view_all',        resource: 'student',    action: 'view_all',   module: 'students',  description: 'View all students across classes' },
  { name: 'student.create',          resource: 'student',    action: 'create',     module: 'students',  description: 'Admit students' },
  { name: 'student.update',          resource: 'student',    action: 'update',     module: 'students',  description: 'Update student records' },
  { name: 'student.delete',          resource: 'student',    action: 'delete',     module: 'students',  description: 'Delete students' },
  // employees / hr
  { name: 'employee.view',           resource: 'employee',   action: 'view',       module: 'hr',        description: 'View employees' },
  { name: 'employee.create',         resource: 'employee',   action: 'create',     module: 'hr',        description: 'Add employees' },
  { name: 'employee.update',         resource: 'employee',   action: 'update',     module: 'hr',        description: 'Update employees' },
  { name: 'employee.delete',         resource: 'employee',   action: 'delete',     module: 'hr',        description: 'Delete employees' },
  // hr operations
  { name: 'hr.view',                 resource: 'hr',         action: 'view',       module: 'hr',        description: 'View HR dashboard' },
  { name: 'hr.leave.view',           resource: 'hr',         action: 'leave.view', module: 'hr',        description: 'View leave requests' },
  { name: 'hr.leave.approve',        resource: 'hr',         action: 'leave.approve', module: 'hr',     description: 'Approve/reject leave' },
  { name: 'hr.leave.create',         resource: 'hr',         action: 'leave.create',  module: 'hr',     description: 'Submit leave request' },
  // academics
  { name: 'academic.view',           resource: 'academic',   action: 'view',       module: 'academics', description: 'View academic structure' },
  { name: 'academic.create',         resource: 'academic',   action: 'create',     module: 'academics', description: 'Create classes/subjects/timetable' },
  { name: 'academic.update',         resource: 'academic',   action: 'update',     module: 'academics', description: 'Update academic records' },
  { name: 'academic.delete',         resource: 'academic',   action: 'delete',     module: 'academics', description: 'Delete academic records' },
  // attendance
  { name: 'attendance.view',         resource: 'attendance', action: 'view',       module: 'academics', description: 'View attendance' },
  { name: 'attendance.create',       resource: 'attendance', action: 'create',     module: 'academics', description: 'Mark attendance' },
  { name: 'attendance.update',       resource: 'attendance', action: 'update',     module: 'academics', description: 'Correct attendance' },
  // assignments
  { name: 'assignment.view',         resource: 'assignment', action: 'view',       module: 'academics', description: 'View assignments' },
  { name: 'assignment.create',       resource: 'assignment', action: 'create',     module: 'academics', description: 'Create assignments' },
  { name: 'assignment.update',       resource: 'assignment', action: 'update',     module: 'academics', description: 'Update assignments' },
  { name: 'assignment.delete',       resource: 'assignment', action: 'delete',     module: 'academics', description: 'Delete assignments' },
  // exams
  { name: 'exam.view',               resource: 'exam',       action: 'view',       module: 'academics', description: 'View exams' },
  { name: 'exam.create',             resource: 'exam',       action: 'create',     module: 'academics', description: 'Create exams' },
  { name: 'exam.update',             resource: 'exam',       action: 'update',     module: 'academics', description: 'Update exams' },
  { name: 'exam.delete',             resource: 'exam',       action: 'delete',     module: 'academics', description: 'Delete exams' },
  { name: 'exam.marks.create',       resource: 'exam',       action: 'marks.create', module: 'academics', description: 'Enter exam marks' },
  { name: 'exam.marks.update',       resource: 'exam',       action: 'marks.update', module: 'academics', description: 'Update exam marks' },
  // fees / finance
  { name: 'fee.view',                resource: 'fee',        action: 'view',       module: 'finance',   description: 'View fees' },
  { name: 'fee.create',              resource: 'fee',        action: 'create',     module: 'finance',   description: 'Create fee categories/assignments' },
  { name: 'fee.update',              resource: 'fee',        action: 'update',     module: 'finance',   description: 'Update fee records' },
  { name: 'fee.delete',              resource: 'fee',        action: 'delete',     module: 'finance',   description: 'Delete fee records' },
  { name: 'fee.collect',             resource: 'fee',        action: 'collect',    module: 'finance',   description: 'Collect fee payments' },
  { name: 'fee.refund',              resource: 'fee',        action: 'refund',     module: 'finance',   description: 'Process refunds' },
  { name: 'finance.view',            resource: 'finance',    action: 'view',       module: 'finance',   description: 'View finance dashboard' },
  { name: 'finance.reports.view',    resource: 'finance',    action: 'reports.view', module: 'finance', description: 'View financial reports' },
  // notices
  { name: 'notice.view',             resource: 'notice',     action: 'view',       module: 'notices',   description: 'View notices' },
  { name: 'notice.create',           resource: 'notice',     action: 'create',     module: 'notices',   description: 'Publish notices' },
  { name: 'notice.update',           resource: 'notice',     action: 'update',     module: 'notices',   description: 'Edit notices' },
  { name: 'notice.delete',           resource: 'notice',     action: 'delete',     module: 'notices',   description: 'Delete notices' },
  // audit
  { name: 'audit.view',              resource: 'audit',      action: 'view',       module: 'admin',     description: 'View audit logs' },
  // library
  { name: 'library.book.view',       resource: 'library',    action: 'book.view',  module: 'library',   description: 'View books' },
  { name: 'library.book.create',     resource: 'library',    action: 'book.create', module: 'library',  description: 'Add books' },
  { name: 'library.book.update',     resource: 'library',    action: 'book.update', module: 'library',  description: 'Update books' },
  { name: 'library.book.delete',     resource: 'library',    action: 'book.delete', module: 'library',  description: 'Remove books' },
  { name: 'library.issue.create',    resource: 'library',    action: 'issue.create', module: 'library', description: 'Issue books' },
  { name: 'library.return.create',   resource: 'library',    action: 'return.create', module: 'library', description: 'Process returns' },
  // hostel
  { name: 'hostel.view',             resource: 'hostel',     action: 'view',       module: 'hostel',    description: 'View hostel' },
  { name: 'hostel.room.create',      resource: 'hostel',     action: 'room.create', module: 'hostel',   description: 'Add rooms' },
  { name: 'hostel.room.update',      resource: 'hostel',     action: 'room.update', module: 'hostel',   description: 'Update rooms' },
  { name: 'hostel.allocation.create',resource: 'hostel',     action: 'allocation.create', module: 'hostel', description: 'Allocate students to rooms' },
  // transport
  { name: 'transport.vehicle.view',  resource: 'transport',  action: 'vehicle.view', module: 'transport', description: 'View vehicles' },
  { name: 'transport.vehicle.create',resource: 'transport',  action: 'vehicle.create', module: 'transport', description: 'Add vehicles' },
  { name: 'transport.vehicle.update',resource: 'transport',  action: 'vehicle.update', module: 'transport', description: 'Update vehicles' },
  { name: 'transport.driver.create', resource: 'transport',  action: 'driver.create', module: 'transport', description: 'Add drivers' },
  { name: 'transport.route.create',  resource: 'transport',  action: 'route.create', module: 'transport',  description: 'Create routes' },
  // reports
  { name: 'report.academic.view',    resource: 'report',     action: 'academic.view', module: 'reports', description: 'View academic reports' },
  { name: 'report.finance.view',     resource: 'report',     action: 'finance.view',  module: 'reports', description: 'View finance reports' },
  { name: 'report.hr.view',          resource: 'report',     action: 'hr.view',       module: 'reports', description: 'View HR reports' },
  { name: 'report.attendance.view',  resource: 'report',     action: 'attendance.view', module: 'reports', description: 'View attendance reports' },
];

// ─────────────────────────────────────────────────────────────────────────────
//  ROLE DEFINITIONS  (name → which permission names they get)
// ─────────────────────────────────────────────────────────────────────────────
const ROLE_DEFS = [
  {
    name: 'INSTITUTE_ADMIN', displayName: 'Institute Admin', isSystem: true,
    perms: ['institute.view','institute.update','user.view','user.create','user.update','user.delete',
      'role.view','role.create','role.update','role.delete','permission.view',
      'membership.view','membership.create','membership.update','membership.delete',
      'student.view','student.view_all','student.create','student.update','student.delete',
      'employee.view','employee.create','employee.update','employee.delete',
      'academic.view','academic.create','academic.update','academic.delete',
      'attendance.view','attendance.create','attendance.update',
      'fee.view','fee.create','fee.update','fee.delete','fee.collect','fee.refund',
      'finance.view','finance.reports.view','notice.view','notice.create','notice.update','notice.delete',
      'library.book.view','library.book.create','library.book.update','library.book.delete',
      'library.issue.create','library.return.create',
      'hostel.view','hostel.room.create','hostel.room.update','hostel.allocation.create',
      'transport.vehicle.view','transport.vehicle.create','transport.vehicle.update',
      'transport.driver.create','transport.route.create',
      'hr.view','hr.leave.view','hr.leave.approve',
      'audit.view','report.academic.view','report.finance.view','report.hr.view','report.attendance.view'],
  },
  {
    name: 'PRINCIPAL', displayName: 'Principal', isSystem: true,
    perms: ['institute.view',
      'student.view','student.view_all','student.create','student.update','student.delete',
      'employee.view','academic.view','academic.create','academic.update','academic.delete',
      'attendance.view','attendance.create','attendance.update',
      'exam.view','exam.create','exam.update','assignment.view',
      'fee.view','finance.view','notice.view','notice.create','notice.update','notice.delete',
      'report.academic.view','report.attendance.view','report.finance.view','audit.view'],
  },
  {
    name: 'TEACHER', displayName: 'Teacher', isSystem: true,
    perms: ['student.view','academic.view','attendance.view','attendance.create','attendance.update',
      'assignment.view','assignment.create','assignment.update','assignment.delete',
      'exam.view','exam.marks.create','exam.marks.update','notice.view'],
  },
  {
    name: 'ACCOUNTANT', displayName: 'Accountant', isSystem: true,
    perms: ['student.view','academic.view',
      'fee.view','fee.create','fee.update','fee.collect','fee.refund',
      'finance.view','report.finance.view'],
  },
  {
    name: 'CFO', displayName: 'CFO', isSystem: true,
    perms: ['finance.view','finance.reports.view','academic.view',
      'fee.view','fee.create','fee.update','fee.collect','fee.refund',
      'report.finance.view','student.view','audit.view'],
  },
  {
    name: 'HR_MANAGER', displayName: 'HR Manager', isSystem: true,
    perms: ['employee.view','employee.create','employee.update','employee.delete',
      'membership.create','membership.view',
      'hr.view','hr.leave.view','hr.leave.approve','attendance.view',
      'student.view','report.hr.view'],
  },
  {
    name: 'LIBRARIAN', displayName: 'Librarian', isSystem: true,
    perms: ['library.book.view','library.book.create','library.book.update','library.book.delete',
      'library.issue.create','library.return.create','student.view'],
  },
  {
    name: 'HOSTEL_WARDEN', displayName: 'Hostel Warden', isSystem: true,
    perms: ['hostel.view','hostel.room.create','hostel.room.update','hostel.allocation.create','student.view'],
  },
  {
    name: 'TRANSPORT_ADMIN', displayName: 'Transport Admin', isSystem: true,
    perms: ['transport.vehicle.view','transport.vehicle.create','transport.vehicle.update',
      'transport.driver.create','transport.route.create','student.view'],
  },
  {
    name: 'EMPLOYEE', displayName: 'Employee', isSystem: true,
    perms: ['attendance.view','hr.leave.create'],
  },
  {
    name: 'STUDENT', displayName: 'Student', isSystem: true,
    perms: ['student.view','academic.view','attendance.view','fee.view',
      'assignment.view','exam.view','notice.view'],
  },
  {
    name: 'PARENT', displayName: 'Parent', isSystem: true,
    perms: ['student.view','attendance.view','fee.view','assignment.view','exam.view','notice.view'],
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB connected');

  // ── 1. Permissions ──────────────────────────────────────────────────────────
  const permMap = {};
  for (const p of PERMISSION_DEFS) {
    const perm = await Permission.findOneAndUpdate(
      { name: p.name },
      { $setOnInsert: p },
      { upsert: true, new: true }
    );
    permMap[p.name] = perm._id;
  }
  console.log(`✅ ${PERMISSION_DEFS.length} permissions seeded`);

  // ── 2. Roles ────────────────────────────────────────────────────────────────
  const roleMap = {};
  for (const r of ROLE_DEFS) {
    const permIds = r.perms.map(p => permMap[p]).filter(Boolean);
    const role = await Role.findOneAndUpdate(
      { name: r.name, institute: null },
      { $set: { displayName: r.displayName, isSystem: r.isSystem, permissions: permIds } },
      { upsert: true, new: true }
    );
    roleMap[r.name] = role._id;
  }
  console.log(`✅ ${ROLE_DEFS.length} roles seeded`);

  // ── 3. Institute ────────────────────────────────────────────────────────────
  let institute = await Institute.findOne({ name: 'Seeron Academy' });
  if (!institute) {
    institute = await Institute.create({
      name: 'Seeron Academy', address: '123 Education Lane, Knowledge City',
      phone: '+1-555-0100', email: 'info@seeronacademy.edu',
      website: 'https://seeronacademy.edu', established_year: 2010, type: 'school',
    });
  }
  console.log('✅ Institute seeded');

  // ── 4. Users ────────────────────────────────────────────────────────────────
  async function ensureUser(data) {
    let user = await User.findOne({ email: data.email });
    if (!user) user = await User.create({ name: data.name, email: data.email, passwordHash: hash(data.password), phone: data.phone || null, isSuperAdmin: data.isSuperAdmin || false });
    return user;
  }

  async function ensureMembership(userId, instituteId, roleNames) {
    const roles = roleNames.map(n => roleMap[n]).filter(Boolean);
    await InstituteMembership.findOneAndUpdate(
      { user: userId, institute: instituteId },
      { $set: { roles, isActive: true, deletedAt: null } },
      { upsert: true, new: true }
    );
  }

  // Super Admin — no membership needed (isSuperAdmin = true bypasses all membership checks)
  // But we also give them an INSTITUTE_ADMIN membership on every institute
  // so institute-scoped API calls work when they select an institute
  const superAdmin = await ensureUser({
    name: 'Super Admin',
    email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@seeron.com',
    password: process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123',
    isSuperAdmin: true,
  });
  // Ensure isSuperAdmin is set even if user already existed without it
  await User.findByIdAndUpdate(superAdmin._id, { isSuperAdmin: true });

  // Ensure Super Admin has INSTITUTE_ADMIN membership on all institutes
  const instAdminRole = await Role.findOne({ name: 'INSTITUTE_ADMIN', institute: null });
  if (instAdminRole) {
    await InstituteMembership.findOneAndUpdate(
      { user: superAdmin._id, institute: institute._id },
      { $set: { roles: [instAdminRole._id], isActive: true, deletedAt: null } },
      { upsert: true, new: true }
    );
  }
  console.log('✅ Super admin membership ensured');

  // Institute Admin
  const instAdmin = await ensureUser({ name: 'Institute Admin', email: 'iadmin@seeron.com', password: 'Admin@123' });
  await ensureMembership(instAdmin._id, institute._id, ['INSTITUTE_ADMIN']);

  // Principal
  const principal = await ensureUser({ name: 'Dr. Principal', email: 'principal@seeron.com', password: 'Admin@123' });
  await ensureMembership(principal._id, institute._id, ['PRINCIPAL']);

  // Teacher
  const teacherUser = await ensureUser({ name: 'John Smith', email: 'john.smith@seeron.com', password: 'Teacher@123', phone: '+1-555-0100' });
  await ensureMembership(teacherUser._id, institute._id, ['TEACHER']);

  // Accountant
  const accountant = await ensureUser({ name: 'Jane Accounts', email: 'accountant@seeron.com', password: 'Admin@123' });
  await ensureMembership(accountant._id, institute._id, ['ACCOUNTANT']);

  // HR Manager
  const hrManager = await ensureUser({ name: 'HR Manager', email: 'hr@seeron.com', password: 'Admin@123' });
  await ensureMembership(hrManager._id, institute._id, ['HR_MANAGER']);

  // Librarian
  const librarian = await ensureUser({ name: 'Sam Librarian', email: 'librarian@seeron.com', password: 'Admin@123' });
  await ensureMembership(librarian._id, institute._id, ['LIBRARIAN']);

  // Hostel Warden
  const hostelWarden = await ensureUser({ name: 'Hostel Warden', email: 'hostelwarden@seeron.com', password: 'Admin@123' });
  await ensureMembership(hostelWarden._id, institute._id, ['HOSTEL_WARDEN']);

  // Transport Admin
  const transportAdmin = await ensureUser({ name: 'Transport Admin', email: 'transport@seeron.com', password: 'Admin@123' });
  await ensureMembership(transportAdmin._id, institute._id, ['TRANSPORT_ADMIN']);

  // Student
  const studentUser = await ensureUser({ name: 'Alice Johnson', email: 'alice@seeron.com', password: 'Student@123', phone: '+1-555-0200' });
  await ensureMembership(studentUser._id, institute._id, ['STUDENT']);

  console.log('✅ Users & memberships seeded');

  // ── 5. Academic Year ────────────────────────────────────────────────────────
  let ay = await AcademicYear.findOne({ institute: institute._id, name: '2025-2026' });
  if (!ay) ay = await AcademicYear.create({ institute: institute._id, name: '2025-2026', startDate: '2025-04-01', endDate: '2026-03-31', isCurrent: true });

  // ── 6. Classes ──────────────────────────────────────────────────────────────
  const classMap = {};
  for (let i = 1; i <= 12; i++) {
    const cname = `Class ${i}`;
    let cls = await Class.findOne({ institute: institute._id, name: cname });
    if (!cls) cls = await Class.create({ institute: institute._id, name: cname, level: i });
    classMap[cname] = cls._id;
  }

  // ── 7. Sections ─────────────────────────────────────────────────────────────
  const class10Id = classMap['Class 10'];
  let sectionA = await Section.findOne({ class: class10Id, name: 'A' });
  if (!sectionA) sectionA = await Section.create({ class: class10Id, name: 'A', capacity: 40 });

  // ── 8. Subjects ─────────────────────────────────────────────────────────────
  for (const s of [
    { name: 'Mathematics', code: 'MATH', type: 'theory' }, { name: 'Science', code: 'SCI', type: 'theory' },
    { name: 'English', code: 'ENG', type: 'theory' }, { name: 'Computer Science', code: 'CS', type: 'theory' },
    { name: 'Physics', code: 'PHY', type: 'theory' }, { name: 'Chemistry', code: 'CHEM', type: 'theory' },
  ]) {
    if (!await Subject.findOne({ institute: institute._id, name: s.name }))
      await Subject.create({ institute: institute._id, ...s });
  }

  // ── 9. Employee ─────────────────────────────────────────────────────────────
  if (!await Employee.findOne({ email: 'john.smith@seeron.com' })) {
    await Employee.create({
      institute: institute._id, user: teacherUser._id, employeeCode: 'EMP001',
      name: 'John Smith', designation: 'Senior Teacher', department: 'Science',
      gender: 'male', joiningDate: '2020-06-01', phone: '+1-555-0100',
      email: 'john.smith@seeron.com', isTeacher: true,
    });
  }

  // ── 10. Student ─────────────────────────────────────────────────────────────
  if (!await Student.findOne({ email: 'alice@seeron.com' })) {
    await Student.create({
      institute: institute._id, user: studentUser._id,
      admissionNo: 'ADM2025001', rollNo: '01', name: 'Alice Johnson',
      gender: 'female', dob: '2009-05-15', phone: '+1-555-0200',
      email: 'alice@seeron.com', class: class10Id, section: sectionA._id,
      academicYear: ay._id, admissionDate: '2025-04-01', status: 'active',
    });
  }

  // ── 11. Fee Categories ───────────────────────────────────────────────────────
  for (const fc of [
    { name: 'Tuition Fee', description: 'Monthly tuition fee', amount: 5000, frequency: 'monthly' },
    { name: 'Admission Fee', description: 'One-time admission fee', amount: 10000, frequency: 'one_time' },
  ]) {
    if (!await FeeCategory.findOne({ institute: institute._id, name: fc.name }))
      await FeeCategory.create({ institute: institute._id, ...fc });
  }

  console.log('✅ Academic data seeded');
  console.log('\n─────────────────────────────────────────────────────────');
  console.log('Super Admin    → admin@seeron.com           / Admin@123');
  console.log('Inst Admin     → iadmin@seeron.com          / Admin@123');
  console.log('Principal      → principal@seeron.com       / Admin@123');
  console.log('Teacher        → john.smith@seeron.com      / Teacher@123');
  console.log('Accountant     → accountant@seeron.com      / Admin@123');
  console.log('HR Manager     → hr@seeron.com              / Admin@123');
  console.log('Librarian      → librarian@seeron.com       / Admin@123');
  console.log('Hostel Warden  → hostelwarden@seeron.com    / Admin@123');
  console.log('Transport Admin→ transport@seeron.com       / Admin@123');
  console.log('Student        → alice@seeron.com           / Student@123');
  console.log('─────────────────────────────────────────────────────────\n');

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
