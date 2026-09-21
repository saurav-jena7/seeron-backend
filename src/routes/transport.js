/**
 * Transport Routes — Vehicle, Driver, Route & Stop management
 * Permissions: transport.vehicle.view / transport.vehicle.create / transport.vehicle.update / transport.driver.create / transport.route.create
 */
const router   = require('express').Router();
const mongoose = require('mongoose');
const { authenticate, loadMembership, requirePermission } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

const auth = [authenticate, loadMembership];

// ── Helper: get instituteId for both regular users and super admin ─────────────
function getInstId(req) {
  return getInstId(req) ||
    req.headers['x-institute-id'] ||
    req.query.institute_id ||
    req.body?.institute_id;
}

// ── Vehicle model ──────────────────────────────────────────────────────────────
const vehicleSchema = new mongoose.Schema({
  institute:     { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  vehicle_number:{ type: String, required: true },
  type:          { type: String, enum: ['bus', 'van', 'auto', 'car', 'other'], default: 'bus' },
  capacity:      { type: Number, default: 40 },
  make:          String,
  model:         String,
  year:          Number,
  fuel_type:     { type: String, enum: ['diesel', 'petrol', 'cng', 'electric'], default: 'diesel' },
  status:        { type: String, enum: ['active', 'maintenance', 'inactive'], default: 'active' },
  driver:        { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
  deletedAt:     { type: Date, default: null },
}, { timestamps: true });

// ── Driver model ───────────────────────────────────────────────────────────────
const driverSchema = new mongoose.Schema({
  institute:    { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  name:         { type: String, required: true },
  phone:        { type: String, required: true },
  license_no:   String,
  license_expiry: String,
  address:      String,
  status:       { type: String, enum: ['active', 'inactive'], default: 'active' },
  deletedAt:    { type: Date, default: null },
}, { timestamps: true });

// ── Route model ────────────────────────────────────────────────────────────────
const routeSchema = new mongoose.Schema({
  institute:    { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  name:         { type: String, required: true },
  description:  String,
  vehicle:      { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle' },
  driver:       { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
  start_point:  String,
  end_point:    String,
  distance_km:  Number,
  fare:         Number,
  stops:        [{ name: String, time: String, order: Number }],
  status:       { type: String, enum: ['active', 'inactive'], default: 'active' },
  deletedAt:    { type: Date, default: null },
}, { timestamps: true });

// ── Student-Route Allocation ───────────────────────────────────────────────────
const transportAllocationSchema = new mongoose.Schema({
  institute:    { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  student:      { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  route:        { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true },
  stop_name:    String,
  academic_year:{ type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
  status:       { type: String, enum: ['active', 'inactive'], default: 'active' },
  deletedAt:    { type: Date, default: null },
}, { timestamps: true });

const Vehicle             = mongoose.models.Vehicle             || mongoose.model('Vehicle',             vehicleSchema);
const Driver              = mongoose.models.Driver              || mongoose.model('Driver',              driverSchema);
const Route               = mongoose.models.Route               || mongoose.model('Route',               routeSchema);
const TransportAllocation = mongoose.models.TransportAllocation || mongoose.model('TransportAllocation', transportAllocationSchema);

// ─────────────────────────────────────────────────────────────────────────────
//  VEHICLES
// ─────────────────────────────────────────────────────────────────────────────
router.get('/vehicles', ...auth, requirePermission('transport.vehicle.view'), async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { institute: getInstId(req), deletedAt: null };
    if (status) filter.status = status;
    const vehicles = await Vehicle.find(filter).populate('driver', 'name phone').sort({ vehicle_number: 1 });
    return res.json({ success: true, data: vehicles });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.post('/vehicles', ...auth, requirePermission('transport.vehicle.create'), async (req, res) => {
  try {
    const { vehicle_number, type, capacity, make, model, year, fuel_type } = req.body;
    if (!vehicle_number) return res.status(400).json({ success: false, message: 'Vehicle number required' });
    const vehicle = await Vehicle.create({ institute: getInstId(req), vehicle_number, type: type || 'bus', capacity: capacity || 40, make, model, year, fuel_type: fuel_type || 'diesel' });
    logAudit({ userId: req.user._id, instituteId: getInstId(req), action: 'CREATE', resource: 'vehicles', resourceId: vehicle._id, req });
    return res.status(201).json({ success: true, data: vehicle });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.put('/vehicles/:id', ...auth, requirePermission('transport.vehicle.update'), async (req, res) => {
  try {
    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: req.params.id, institute: getInstId(req), deletedAt: null },
      { $set: req.body }, { new: true, runValidators: false }
    );
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
    return res.json({ success: true, data: vehicle });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/vehicles/:id', ...auth, requirePermission('transport.vehicle.update'), async (req, res) => {
  try {
    await Vehicle.findByIdAndUpdate(req.params.id, { deletedAt: new Date() }, { runValidators: false });
    return res.json({ success: true, message: 'Vehicle deleted' });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  DRIVERS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/drivers', ...auth, requirePermission('transport.vehicle.view'), async (req, res) => {
  try {
    const drivers = await Driver.find({ institute: getInstId(req), deletedAt: null }).sort({ name: 1 });
    return res.json({ success: true, data: drivers });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.post('/drivers', ...auth, requirePermission('transport.driver.create'), async (req, res) => {
  try {
    const { name, phone, license_no, license_expiry, address } = req.body;
    if (!name || !phone) return res.status(400).json({ success: false, message: 'Name and phone required' });
    const driver = await Driver.create({ institute: getInstId(req), name, phone, license_no, license_expiry, address });
    logAudit({ userId: req.user._id, instituteId: getInstId(req), action: 'CREATE', resource: 'drivers', resourceId: driver._id, req });
    return res.status(201).json({ success: true, data: driver });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.put('/drivers/:id', ...auth, requirePermission('transport.driver.create'), async (req, res) => {
  try {
    const driver = await Driver.findOneAndUpdate(
      { _id: req.params.id, institute: getInstId(req), deletedAt: null },
      { $set: req.body }, { new: true, runValidators: false }
    );
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found' });
    return res.json({ success: true, data: driver });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  ROUTES
// ─────────────────────────────────────────────────────────────────────────────
router.get('/routes', ...auth, requirePermission('transport.vehicle.view'), async (req, res) => {
  try {
    const routes = await Route.find({ institute: getInstId(req), deletedAt: null })
      .populate('vehicle', 'vehicle_number type capacity')
      .populate('driver',  'name phone')
      .sort({ name: 1 });
    return res.json({ success: true, data: routes });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.post('/routes', ...auth, requirePermission('transport.route.create'), async (req, res) => {
  try {
    const { name, description, vehicle_id, driver_id, start_point, end_point, distance_km, fare, stops } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Route name required' });
    const route = await Route.create({
      institute: getInstId(req), name, description,
      vehicle: vehicle_id || null, driver: driver_id || null,
      start_point, end_point, distance_km, fare, stops: stops || [],
    });
    logAudit({ userId: req.user._id, instituteId: getInstId(req), action: 'CREATE', resource: 'routes', resourceId: route._id, req });
    return res.status(201).json({ success: true, data: route });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.put('/routes/:id', ...auth, requirePermission('transport.route.create'), async (req, res) => {
  try {
    const route = await Route.findOneAndUpdate(
      { _id: req.params.id, institute: getInstId(req), deletedAt: null },
      { $set: req.body }, { new: true, runValidators: false }
    );
    if (!route) return res.status(404).json({ success: false, message: 'Route not found' });
    return res.json({ success: true, data: route });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/routes/:id', ...auth, requirePermission('transport.route.create'), async (req, res) => {
  try {
    await Route.findByIdAndUpdate(req.params.id, { deletedAt: new Date() }, { runValidators: false });
    return res.json({ success: true, message: 'Route deleted' });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  STUDENT ALLOCATIONS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/allocations', ...auth, requirePermission('transport.vehicle.view'), async (req, res) => {
  try {
    const { route_id } = req.query;
    const filter = { institute: getInstId(req), deletedAt: null };
    if (route_id) filter.route = route_id;
    const allocs = await TransportAllocation.find(filter)
      .populate('student', 'name admissionNo phone class')
      .populate('route',   'name start_point end_point')
      .sort({ createdAt: -1 });
    return res.json({ success: true, data: allocs });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

router.post('/allocations', ...auth, requirePermission('transport.vehicle.create'), async (req, res) => {
  try {
    const { student_id, route_id, stop_name, academic_year_id } = req.body;
    if (!student_id || !route_id) return res.status(400).json({ success: false, message: 'student_id and route_id required' });
    const alloc = await TransportAllocation.create({
      institute: getInstId(req), student: student_id, route: route_id,
      stop_name: stop_name || null, academic_year: academic_year_id || null,
    });
    logAudit({ userId: req.user._id, instituteId: getInstId(req), action: 'CREATE', resource: 'transport_allocations', resourceId: alloc._id, req });
    return res.status(201).json({ success: true, data: alloc });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
//  STATS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', ...auth, requirePermission('transport.vehicle.view'), async (req, res) => {
  try {
    const iid = getInstId(req);
    const [totalVehicles, activeVehicles, totalDrivers, totalRoutes, totalAllocations] = await Promise.all([
      Vehicle.countDocuments({ institute: iid, deletedAt: null }),
      Vehicle.countDocuments({ institute: iid, status: 'active', deletedAt: null }),
      Driver.countDocuments({ institute: iid, deletedAt: null }),
      Route.countDocuments({ institute: iid, deletedAt: null }),
      TransportAllocation.countDocuments({ institute: iid, status: 'active', deletedAt: null }),
    ]);
    return res.json({ success: true, data: { totalVehicles, activeVehicles, totalDrivers, totalRoutes, totalAllocations } });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;

