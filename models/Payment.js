const mongoose = require('mongoose');
const { auditFields, auditTimestamps } = require('../config/schemaHelpers');

const paymentSchema = new mongoose.Schema({
  paymentNumber: { type: String, unique: true, index: true },
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', index: true },
  reservationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation', index: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  amount: { type: Number, required: true },
  method: { type: String, enum: ['cash', 'bank', 'card', 'transfer', 'other'], default: 'cash' },
  exchangeRateSarToEgp: { type: Number },
  reference: String,
  paymentDate: { type: Date, default: Date.now },
  notes: String,
  isRefund: { type: Boolean, default: false },
  ...auditFields,
}, auditTimestamps);

module.exports = mongoose.model('Payment', paymentSchema);
