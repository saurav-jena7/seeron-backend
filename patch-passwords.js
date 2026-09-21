require('dotenv').config();
const mongoose = require('mongoose');
mongoose.plugin(require('./src/db/plugins/toJSON'));

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const { User } = require('./src/db/models/User');

  // Known seeded users with their passwords
  const known = [
    { email: 'iadmin@seeron.com',       password: 'Admin@123'   },
    { email: 'principal@seeron.com',    password: 'Admin@123'   },
    { email: 'john.smith@seeron.com',   password: 'Teacher@123' },
    { email: 'accountant@seeron.com',   password: 'Admin@123'   },
    { email: 'hr@seeron.com',           password: 'Admin@123'   },
    { email: 'librarian@seeron.com',    password: 'Admin@123'   },
    { email: 'hostelwarden@seeron.com', password: 'Admin@123'   },
    { email: 'transport@seeron.com',    password: 'Admin@123'   },
    { email: 'alice@seeron.com',        password: 'Student@123' },
  ];

  let updated = 0;
  for (const u of known) {
    const r = await User.updateOne({ email: u.email }, { plainPassword: u.password });
    if (r.modifiedCount) { console.log('✅ Patched:', u.email); updated++; }
  }

  // Any remaining users without plainPassword — set default
  const remaining = await User.countDocuments({ plainPassword: null, isSuperAdmin: false });
  if (remaining > 0) {
    await User.updateMany({ plainPassword: null, isSuperAdmin: false }, { plainPassword: 'Admin@123' });
    console.log('✅ Patched', remaining, 'remaining users with default Admin@123');
    updated += remaining;
  }

  console.log('\nTotal patched:', updated);
  await mongoose.disconnect();
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
