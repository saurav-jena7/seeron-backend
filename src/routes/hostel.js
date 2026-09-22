/**
 * Hostel Routes — Hostel, Room & Allocation management
 * Permissions: hostel.view / hostel.room.create / hostel.room.update / hostel.allocation.create
 */
const router    = require('express').Router();
const mongoose  = require('mongoose');
const { authenticate, loadMembership, requirePermission } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const auth = [authenticate, loadMembership];

// ── Helper: get instituteId for both regular users and super admin ─────────────
function getInstId(req) {
  return req.instituteId ||
    req.headers['x-institute-id'] ||
    req.query.institute_id ||
    req.body?.institute_id;
}

// ── Hostel model ───────────────────────────────────────────────────────────────
const hostelSchema = new mongoose.Schema({
  institute:   { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  name:        { type: String, required: true },
  type:        { type: String, enum: ['boys', 'girls', 'co-ed'], default: 'boys' },
  address:     String,
  capacity:    { type: Number, default: 0 },
  warden:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt:   { type: Date, default: null },
}, { timestamps: true });

// ── Room model ─────────────────────────────────────────────────────────────────
const roomSchema = new mongoose.Schema({
  hostel:       { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel', required: true },
  institute:    { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  room_number:  { type: String, required: true },
  floor:        { type: Number, default: 0 },
  capacity:     { type: Number, default: 2 },
  occupied:     { type: Number, default: 0 },
  room_type:    { type: String, enum: ['single', 'double', 'triple', 'dormitory'], default: 'double' },
  status:       { type: String, enum: ['available', 'full', 'maintenance'], default: 'available' },
  deletedAt:    { type: Date, default: null },
}, { timestamps: true });

// ── Allocation model ───────────────────────────────────────────────────────────
const allocationSchema = new mongoose.Schema({
  institute:    { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  hostel:       { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel', required: true },
  room:         { type: mongoose.Schema.Types.ObjectId, ref: 'Room',   required: true },
  student:      { type: mongoose.Schema.Types.ObjectId, ref: 'Student',required: true },
  check_in:     { type: String, required: true },
  check_out:    { type: String },
  status:       { type: String, enum: ['active', 'vacated'], default: 'active' },
  deletedAt:    { type: Date, default: null },
}, { timestamps: true });

const Hostel     = mongoose.models.Hostel     || mongoose.model('Hostel',     hostelSchema);
const Room       = mongoose.models.Room       || mongoose.model('Room',       roomSchema);
const Allocation = mongoose.models.Allocation || mongoose.model('Allocation', allocationSchema);

// ─────────────────────────────────────────────────────────────────────────────
//  HOSTELS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/hostels', ...auth, requirePermission('hostel.view'), async (req, res) => {
  try {
    const hostels = await Hostel.find({ institute: getInstId(req), deletedAt: null }).sort({ name: 1 });
    // Attach room counts
    const result = await Promise.all(hostels.map(async h => {
      const totalRooms = await Room.countDocuments({ hostel: h._id, deletedAt: null });
      const occupiedRooms = await Room.countDocuments({ hostel: h._id, status: 'full', deletedAt: null });
      return { ...h.toJSON(), totalRooms, occupiedRooms };
    }));
    return res.json({ success: true, data: result });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.post('/hostels', ...auth, requirePermission('hostel.room.create'), async (req, res) => {
  try {
    const { name, type, address, capacity } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
    const hostel = await Hostel.create({ institute: getInstId(req), name, type: type || 'boys', address, capacity: capacity || 0 });
    logAudit({ userId: req.user._id, instituteId: getInstId(req), action: 'CREATE', resource: 'hostels', resourceId: hostel._id, req });
    return res.status(201).json({ success: true, data: hostel });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.put('/hostels/:id', ...auth, requirePermission('hostel.room.update'), async (req, res) => {
  try {
    const hostel = await Hostel.findOneAndUpdate(
      { _id: req.params.id, institute: getInstId(req), deletedAt: null },
      { $set: req.body }, { new: true, runValidators: false }
    );
    if (!hostel) return res.status(404).json({ success: false, message: 'Hostel not found' });
    return res.json({ success: true, data: hostel });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/hostels/:id', ...auth, requirePermission('hostel.room.update'), async (req, res) => {
  try {
    await Hostel.findByIdAndUpdate(req.params.id, { deletedAt: new Date() }, { runValidators: false });
    return res.json({ success: true, message: 'Hostel deleted' });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  ROOMS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/rooms', ...auth, requirePermission('hostel.view'), async (req, res) => {
  try {
    const { hostel_id, status } = req.query;
    const filter = { institute: getInstId(req), deletedAt: null };
    if (hostel_id) filter.hostel = hostel_id;
    if (status)    filter.status = status;
    const rooms = await Room.find(filter).populate('hostel', 'name type').sort({ room_number: 1 });
    return res.json({ success: true, data: rooms });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.post('/rooms', ...auth, requirePermission('hostel.room.create'), async (req, res) => {
  try {
    const { hostel_id, room_number, floor, capacity, room_type } = req.body;
    if (!hostel_id || !room_number) return res.status(400).json({ success: false, message: 'Hostel and room number required' });
    const room = await Room.create({
      hostel: hostel_id, institute: getInstId(req),
      room_number, floor: floor || 0,
      capacity: capacity || 2, room_type: room_type || 'double',
    });
    logAudit({ userId: req.user._id, instituteId: getInstId(req), action: 'CREATE', resource: 'hostel_rooms', resourceId: room._id, req });
    return res.status(201).json({ success: true, data: room });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.put('/rooms/:id', ...auth, requirePermission('hostel.room.update'), async (req, res) => {
  try {
    const room = await Room.findOneAndUpdate(
      { _id: req.params.id, institute: getInstId(req), deletedAt: null },
      { $set: req.body }, { new: true, runValidators: false }
    );
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    return res.json({ success: true, data: room });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  ALLOCATIONS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/allocations', ...auth, requirePermission('hostel.view'), async (req, res) => {
  try {
    const { hostel_id, room_id, status } = req.query;
    const filter = { institute: getInstId(req), deletedAt: null };
    if (hostel_id) filter.hostel  = hostel_id;
    if (room_id)   filter.room    = room_id;
    if (status)    filter.status  = status;
    const allocs = await Allocation.find(filter)
      .populate('student', 'name admissionNo phone email')
      .populate('hostel',  'name')
      .populate('room',    'room_number floor')
      .sort({ createdAt: -1 });
    return res.json({ success: true, data: allocs });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.post('/allocations', ...auth, requirePermission('hostel.allocation.create'), async (req, res) => {
  try {
    const { hostel_id, room_id, student_id, check_in } = req.body;
    if (!hostel_id || !room_id || !student_id || !check_in) {
      return res.status(400).json({ success: false, message: 'hostel_id, room_id, student_id, check_in required' });
    }
    // Check room capacity
    const room = await Room.findById(room_id);
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (room.occupied >= room.capacity) return res.status(400).json({ success: false, message: 'Room is full' });

    const alloc = await Allocation.create({
      institute: getInstId(req), hostel: hostel_id, room: room_id,
      student: student_id, check_in, status: 'active',
    });
    // Update room occupancy
    await Room.findByIdAndUpdate(room_id, {
      $inc: { occupied: 1 },
      $set: { status: room.occupied + 1 >= room.capacity ? 'full' : 'available' },
    }, { runValidators: false });

    logAudit({ userId: req.user._id, instituteId: getInstId(req), action: 'CREATE', resource: 'hostel_allocations', resourceId: alloc._id, req });
    return res.status(201).json({ success: true, data: alloc });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.put('/allocations/:id/vacate', ...auth, requirePermission('hostel.allocation.create'), async (req, res) => {
  try {
    const alloc = await Allocation.findByIdAndUpdate(
      req.params.id, { $set: { status: 'vacated', check_out: req.body.check_out || new Date().toISOString().split('T')[0] } }, { new: true, runValidators: false }
    );
    if (!alloc) return res.status(404).json({ success: false, message: 'Allocation not found' });
    // Free up room
    const room = await Room.findById(alloc.room);
    if (room) {
      const newOccupied = Math.max(0, room.occupied - 1);
      await Room.findByIdAndUpdate(alloc.room, { $set: { occupied: newOccupied, status: newOccupied < room.capacity ? 'available' : 'full' } }, { runValidators: false });
    }
    return res.json({ success: true, data: alloc });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  STATS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', ...auth, requirePermission('hostel.view'), async (req, res) => {
  try {
    const iid = getInstId(req);
    const [totalHostels, totalRooms, totalBeds, occupiedBeds, activeAllocs] = await Promise.all([
      Hostel.countDocuments({ institute: iid, deletedAt: null }),
      Room.countDocuments({ institute: iid, deletedAt: null }),
      Room.aggregate([{ $match: { institute: iid, deletedAt: null } }, { $group: { _id: null, total: { $sum: '$capacity' } } }]),
      Room.aggregate([{ $match: { institute: iid, deletedAt: null } }, { $group: { _id: null, total: { $sum: '$occupied' } } }]),
      Allocation.countDocuments({ institute: iid, status: 'active', deletedAt: null }),
    ]);
    return res.json({ success: true, data: {
      totalHostels, totalRooms,
      totalBeds:    totalBeds[0]?.total    || 0,
      occupiedBeds: occupiedBeds[0]?.total || 0,
      activeAllocs,
    }});
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;

