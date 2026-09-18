require('dotenv').config();
const mongoose = require('mongoose');
mongoose.plugin(require('./src/db/plugins/toJSON'));

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const { User } = require('./src/db/models/User');
  const Institute = require('./src/db/models/Institute');
  const Role = require('./src/db/models/Role');
  const InstituteMembership = require('./src/db/models/InstituteMembership');

  // 1. Set isSuperAdmin = true
  const u = await User.findOneAndUpdate(
    { email: 'admin@seeron.com' },
    { isSuperAdmin: true },
    { new: true }
  );
  console.log('✅ isSuperAdmin set:', u.isSuperAdmin, 'for', u.email);

  // 2. Give super admin an INSTITUTE_ADMIN membership on every institute
  //    so they can access institute-scoped API endpoints
  const institutes = await Institute.find({ deletedAt: null });
  const adminRole = await Role.findOne({ name: 'INSTITUTE_ADMIN', institute: null });

  for (const inst of institutes) {
    await InstituteMembership.findOneAndUpdate(
      { user: u._id, institute: inst._id },
      { $set: { roles: adminRole ? [adminRole._id] : [], isActive: true, deletedAt: null } },
      { upsert: true, new: true }
    );
    console.log('✅ Membership ensured for institute:', inst.name);
  }

  await mongoose.disconnect();
  console.log('Done. Please re-login as admin@seeron.com');
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
