/**
 * Sync all role permissions from seed definitions to live DB.
 * Run: node fix-role-permissions.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const ROLE_UPDATES = [
  {
    name: 'INSTITUTE_ADMIN',
    perms: [
      'institute.view','institute.update','user.view','user.create','user.update','user.delete',
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
      'audit.view','report.academic.view','report.finance.view','report.hr.view','report.attendance.view',
    ],
  },
  {
    name: 'PRINCIPAL',
    perms: [
      'institute.view',
      'student.view','student.view_all','student.create','student.update','student.delete',
      'employee.view','academic.view','academic.create','academic.update','academic.delete',
      'attendance.view','attendance.create','attendance.update',
      'exam.view','exam.create','exam.update','assignment.view',
      'fee.view','finance.view','notice.view','notice.create','notice.update','notice.delete',
      'report.academic.view','report.attendance.view','report.finance.view','audit.view',
    ],
  },
  {
    name: 'ACCOUNTANT',
    perms: [
      'student.view','academic.view',
      'fee.view','fee.create','fee.update','fee.collect','fee.refund',
      'finance.view','report.finance.view',
    ],
  },
  {
    name: 'CFO',
    perms: [
      'finance.view','finance.reports.view','academic.view',
      'fee.view','fee.create','fee.update','fee.collect','fee.refund',
      'report.finance.view','student.view','audit.view',
    ],
  },
  {
    name: 'HR_MANAGER',
    perms: [
      'employee.view','employee.create','employee.update','employee.delete',
      'membership.create','membership.view',
      'hr.view','hr.leave.view','hr.leave.approve','attendance.view',
      'student.view','academic.view','report.hr.view',
    ],
  },
  {
    name: 'TEACHER',
    perms: [
      'student.view','academic.view','attendance.view','attendance.create','attendance.update',
      'assignment.view','assignment.create','assignment.update','assignment.delete',
      'exam.view','exam.marks.create','exam.marks.update','notice.view',
    ],
  },
  {
    name: 'LIBRARIAN',
    perms: [
      'library.book.view','library.book.create','library.book.update','library.book.delete',
      'library.issue.create','library.return.create','student.view','academic.view',
    ],
  },
  {
    name: 'HOSTEL_WARDEN',
    perms: [
      'hostel.view','hostel.room.create','hostel.room.update','hostel.allocation.create',
      'student.view','academic.view',
    ],
  },
  {
    name: 'TRANSPORT_ADMIN',
    perms: [
      'transport.vehicle.view','transport.vehicle.create','transport.vehicle.update',
      'transport.driver.create','transport.route.create','student.view','academic.view',
    ],
  },
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected\n');

  const Permission = require('./src/db/models/Permission');
  const Role       = require('./src/db/models/Role');

  const allPerms = await Permission.find({});
  const permMap  = Object.fromEntries(allPerms.map(p => [p.name, p._id]));

  for (const def of ROLE_UPDATES) {
    const role = await Role.findOne({ name: def.name, institute: null, deletedAt: null });
    if (!role) { console.log(`SKIP ${def.name} — not found`); continue; }

    const missing = def.perms.filter(p => !permMap[p]);
    if (missing.length) console.log(`  WARN ${def.name} missing in DB: ${missing.join(', ')}`);

    const before = role.permissions.length;
    role.permissions = def.perms.map(p => permMap[p]).filter(Boolean);
    await role.save();
    console.log(`  OK  ${def.name}: ${before} -> ${role.permissions.length} perms`);
  }

  console.log('\nDone.');
  await mongoose.disconnect();
}

run().catch(e => { console.error(e.message); process.exit(1); });
