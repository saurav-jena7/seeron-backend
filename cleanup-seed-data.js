/**
 * cleanup-seed-data.js
 * Removes all auto-generated seed/dummy data from MongoDB.
 * Keeps: real users added by admins, the institute itself, roles, permissions.
 * Removes: seeded students (student1-30@seeron.com), seeded teachers (teacher2-11@seeron.com),
 *          seeded staff (staff12-16@seeron.com), attendance records, fee records from seed.
 *
 * Run: node cleanup-seed-data.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
mongoose.plugin(require('./src/db/plugins/toJSON'));

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  console.log('✅ Connected to MongoDB');

  const { User }      = require('./src/db/models/User');
  const Student       = require('./src/db/models/Student');
  const Employee      = require('./src/db/models/Employee');
  const Attendance    = require('./src/db/models/Attendance');
  const InstituteMembership = require('./src/db/models/InstituteMembership');
  const { FeeAssignment, FeePayment } = require('./src/db/models/Fee');

  // ── 1. Find seeded users by email pattern ──────────────────────────────────
  // Seeded patterns: student1@seeron.com ... student50@seeron.com
  //                  teacher2@seeron.com ... teacher16@seeron.com
  //                  staff12@seeron.com ... staff20@seeron.com
  const seedEmailPatterns = [
    /^student\d+@seeron\.com$/,
    /^teacher\d+@seeron\.com$/,
    /^staff\d+@seeron\.com$/,
  ];

  const allUsers = await User.find({ isSuperAdmin: false });
  const seedUsers = allUsers.filter(u =>
    seedEmailPatterns.some(pattern => pattern.test(u.email))
  );
  const seedUserIds = seedUsers.map(u => u._id);
  const seedEmails  = seedUsers.map(u => u.email);

  if (seedUsers.length === 0) {
    console.log('ℹ️  No seeded dummy users found — nothing to clean up.');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`Found ${seedUsers.length} seeded users to remove:`, seedEmails.slice(0, 5).join(', ') + (seedEmails.length > 5 ? '...' : ''));

  // ── 2. Find students linked to these seeded users ──────────────────────────
  const seedStudents = await Student.find({ user: { $in: seedUserIds } });
  const seedStudentIds = seedStudents.map(s => s._id);
  console.log(`Found ${seedStudents.length} seeded students`);

  // ── 3. Find employees linked to these seeded users ─────────────────────────
  const seedEmployees = await Employee.find({ user: { $in: seedUserIds } });
  console.log(`Found ${seedEmployees.length} seeded employees`);

  // ── 4. Delete attendance records for seeded students ──────────────────────
  if (seedStudentIds.length > 0) {
    const attDel = await Attendance.deleteMany({ student: { $in: seedStudentIds } });
    console.log(`✅ Deleted ${attDel.deletedCount} attendance records`);

    // Delete fee assignments and payments for seeded students
    const faD = await FeeAssignment.deleteMany({ student: { $in: seedStudentIds } });
    const fpD = await FeePayment.deleteMany({ student: { $in: seedStudentIds } });
    console.log(`✅ Deleted ${faD.deletedCount} fee assignments, ${fpD.deletedCount} fee payments`);

    // Soft-delete students
    const stD = await Student.updateMany({ user: { $in: seedUserIds } }, { deletedAt: new Date() });
    console.log(`✅ Soft-deleted ${stD.modifiedCount} students`);
  }

  // ── 5. Soft-delete employees ───────────────────────────────────────────────
  if (seedEmployees.length > 0) {
    const empD = await Employee.updateMany({ user: { $in: seedUserIds } }, { deletedAt: new Date() });
    console.log(`✅ Soft-deleted ${empD.modifiedCount} employees`);
  }

  // ── 6. Remove memberships for seeded users ─────────────────────────────────
  const memD = await InstituteMembership.updateMany(
    { user: { $in: seedUserIds } },
    { deletedAt: new Date(), isActive: false }
  );
  console.log(`✅ Removed ${memD.modifiedCount} institute memberships`);

  // ── 7. Delete the seeded User accounts ────────────────────────────────────
  const userD = await User.deleteMany({ _id: { $in: seedUserIds } });
  console.log(`✅ Deleted ${userD.deletedCount} seeded user accounts`);

  console.log('\n✅ Cleanup complete!');
  console.log('The following accounts were kept (real users):');
  const remaining = await User.find({ isSuperAdmin: false }).select('name email');
  remaining.forEach(u => console.log(' •', u.name, '—', u.email));

  await mongoose.disconnect();
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
