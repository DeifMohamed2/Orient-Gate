const mongoose = require('mongoose');
const { auditFields, auditTimestamps } = require('../config/schemaHelpers');

const expenseSchema = new mongoose.Schema({
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', index: true },
  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', index: true },
  category: {
    type: String,
    enum: ['hotel', 'flight', 'visa', 'transport', 'guide', 'insurance', 'other'],
    default: 'other',
  },
  supplier: String,
  description: String,
  amount: { type: Number, required: true },
  expenseDate: { type: Date, default: Date.now },
  reference: String,
  notes: String,
  ...auditFields,
}, auditTimestamps);

module.exports = mongoose.model('Expense', expenseSchema);
