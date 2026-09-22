/**
 * One-time migration: sync all role permissions in the live DB to match seed.js definitions.
 * Safely updates INSTITUTE_ADMIN, CFO, HR_MANAGER (and any other role) without touching user data.
 * Run: node fix-role-permissions.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

// ── Inline the updated role definitions ──────────────────────────────────────
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
    name: 'CFO',
    perms: [
      'finance.view','finance.reports.view',
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
      'student.view','report.hr.view',
    ],
  },
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const permSchema  = new mongoose.Schema({ name: String }, { collection: 'permissions' });
  const roleSchema  = new mongoose.Schema({
    name: String, permissions: [mongoose.Schema.Types.ObjectId],
    institute: { type: mongoose.Schema.Types.ObjectId, default: null },
    deletedAt: { type: Date, default: null },
  }, { collection: 'roles' });

  const Permission = mongoose.models.Permission || mongoose.model('Permission', permSchema);
  const Role       = mongoose.models.Role       || mongoose.model('Role',       roleSchema);

  // Build a name→_id map for all permissions in DB
  const allPerms = await Permission.find({});
  const permMap  = Object.fromEntries(allPerms.map(p => [p.name, p._id]));

  let totalUpdated = 0;

  for (const def of ROLE_UPDATES) {
    const role = await Role.findOne({ name: def.name, institute: null, deletedAt: null });
    if (!role) {
      console.log(`  SKIP  ${def.name} — not found in DB (run seed.js first)`);
      continue;
    }

    const newPermIds = def.perms
      .map(p => permMap[p])
      .filter(Boolean);

    const missing = def.perms.filter(p => !permMap[p]);
    if (missing.length > 0) {
      console.log(`  WARN  ${def.name}: these permissions don't exist in DB yet — ${missing.join(', ')}`);
    }

    const before = role.permissions.length;
    role.permissions = newPermIds;
    await role.save();
    const after = role.permissions.length;

    console.log(`  OK    ${def.name}: ${before} → ${after} permissions`);
    totalUpdated++;
  }

  console.log(`\nDone — ${totalUpdated}/${ROLE_UPDATES.length} roles updated.`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err.message); process.exit(1); });
