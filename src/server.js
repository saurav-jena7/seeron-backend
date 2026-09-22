require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Apply toJSON plugin globally — every model serialises _id→id and camelCase→snake_case
mongoose.plugin(require('./db/plugins/toJSON'));

const app = express();

// ── Connect MongoDB ────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => { console.error('❌ MongoDB connection error:', err.message); process.exit(1); });

// ── Security ───────────────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ───────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-institute-id'],
  exposedHeaders: ['x-institute-id'],
}));

// ── Body parser ────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Request logging ────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ── Rate limiting (disabled in development) ───────────────────────────────────
if (process.env.NODE_ENV !== 'development') {
  app.use('/api/', rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later' },
  }));
}

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Seeron API is running',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

// ── API Routes ─────────────────────────────────────────────────────────────────
// Auth
app.use('/api/auth',        require('./routes/auth'));

// Institute (includes /all and /create for super admin)
app.use('/api/institute',   require('./routes/institute'));

// RBAC — order matters: specific paths before parameterised ones
app.use('/api/permissions', require('./routes/permissions'));
app.use('/api/memberships', require('./routes/memberships'));
app.use('/api/roles',       require('./routes/roles'));

// Core institute modules
app.use('/api/employees',     require('./routes/employees'));
app.use('/api/academics',     require('./routes/academics'));
app.use('/api/class-subjects',require('./routes/classSubjects'));
app.use('/api/students',      require('./routes/students'));
app.use('/api/fees',          require('./routes/fees'));
app.use('/api/attendance',    require('./routes/attendance'));
app.use('/api/notices',       require('./routes/notices'));
app.use('/api/audit',         require('./routes/audit'));

// Student self-service portal
app.use('/api/portal',      require('./routes/portal'));

// Library
app.use('/api/library',   require('./routes/library'));

// Hostel
app.use('/api/hostel',    require('./routes/hostel'));

// Transport
app.use('/api/transport', require('./routes/transport'));

// Reports
app.use('/api/reports',   require('./routes/reports'));

// ── 404 ────────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ───────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀  Seeron API      →  http://localhost:${PORT}`);
  console.log(`    Health check   →  http://localhost:${PORT}/health`);
  console.log(`    Environment    →  ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
