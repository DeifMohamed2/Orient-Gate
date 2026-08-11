const mongoose = require('mongoose');
const { auditFields, auditTimestamps } = require('../config/schemaHelpers');
const { PAYMENT_STATUSES } = require('../config/constants');

const installmentSchema = new mongoose.Schema({
  dueDate: Date,
  amount: Number,
  paid: { type: Boolean, default: false },
  paidDate: Date,
}, { _id: true });

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, unique: true, index: true },
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
  reservationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation', index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  customerName: String,
  issueDate: { type: Date, default: Date.now },
  dueDate: Date,
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  status: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid' },
  installments: [installmentSchema],
  notes: String,
  ...auditFields,
}, auditTimestamps);

module.exports = mongoose.model('Invoice', invoiceSchema);
