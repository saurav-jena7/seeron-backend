const mongoose = require('mongoose');

const feeCategorySchema = new mongoose.Schema({
  institute:   { type: mongoose.Schema.Types.ObjectId, ref: 'Institute', required: true },
  name:        { type: String, required: true },
  description: String,
  amount:      { type: Number, required: true, default: 0 },
  frequency:   { type: String, enum: ['monthly','quarterly','annually','one_time'], default: 'monthly' },
  deletedAt:   { type: Date, default: null },
}, { timestamps: true });

const feeAssignmentSchema = new mongoose.Schema({
  student:     { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  feeCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeCategory', required: true },
  academicYear:{ type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
  amount:      { type: Number, required: true },
  dueDate:     String,
}, { timestamps: true });

const feePaymentSchema = new mongoose.Schema({
  student:       { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  feeCategory:   { type: mongoose.Schema.Types.ObjectId, ref: 'FeeCategory' },
  academicYear:  { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
  amount:        { type: Number, required: true },
  paymentDate:   { type: String, required: true },
  paymentMethod: { type: String, enum: ['cash','bank','online','cheque'], default: 'cash' },
  transactionRef:String,
  status:        { type: String, enum: ['paid','pending','failed','refunded'], default: 'paid' },
  remarks:       String,
  collectedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt:     { type: Date, default: null },
}, { timestamps: true });

const FeeCategory   = mongoose.model('FeeCategory',   feeCategorySchema);
const FeeAssignment = mongoose.model('FeeAssignment', feeAssignmentSchema);
const FeePayment    = mongoose.model('FeePayment',    feePaymentSchema);

module.exports = { FeeCategory, FeeAssignment, FeePayment };
