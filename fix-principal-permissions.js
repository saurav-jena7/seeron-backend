/**
 * One-time fix: add missing student.create, student.delete, academic.delete
 * permissions to the PRINCIPAL role in the live database.
 * Run once: node fix-principal-permissions.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const Permission = mongoose.model('Permission', new mongoose.Schema({
    name: String, resource: String, action: String, module: String, description: String,
  }, { collection: 'permissions' }));

  const Role = mongoose.model('Role', new mongoose.Schema({
    name: String, displayName: String, isSystem: Boolean,
    institute: { type: mongoose.Schema.Types.ObjectId, default: null },
    permissions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permission' }],
    deletedAt: { type: Date, default: null },
  }, { collection: 'roles' }));

  // Find PRINCIPAL role (system role, institute: null)
  const principalRole = await Role.findOne({ name: 'PRINCIPAL', institute: null, deletedAt: null });
  if (!principalRole) {
    console.log('PRINCIPAL role not found — run seed first');
    process.exit(1);
  }

  // Permissions to add
  const toAdd = ['student.create', 'student.delete', 'academic.delete'];
  const perms = await Permission.find({ name: { $in: toAdd } });

  if (perms.length === 0) {
    console.log('Permissions not found in DB — run seed first');
    process.exit(1);
  }

  const existingIds = new Set(principalRole.permissions.map(id => String(id)));
  let added = 0;
  for (const perm of perms) {
    if (!existingIds.has(String(perm._id))) {
      principalRole.permissions.push(perm._id);
      added++;
      console.log(`  + Added: ${perm.name}`);
    } else {
      console.log(`  = Already has: ${perm.name}`);
    }
  }

  if (added > 0) {
    await principalRole.save();
    console.log(`\nPRINCIPAL role updated with ${added} new permission(s)`);
  } else {
    console.log('\nPRINCIPAL role already has all required permissions');
  }

  await mongoose.disconnect();
  console.log('Done.');
}

fix().catch(err => { console.error(err); process.exit(1); });
