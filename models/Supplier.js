const mongoose = require('mongoose');
const { auditFields, auditTimestamps } = require('../config/schemaHelpers');

const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: {
    type: String,
    enum: ['hotel', 'flight', 'visa', 'transport', 'guide', 'insurance', 'other'],
    default: 'other',
  },
  contactName: String,
  phone: String,
  email: String,
  address: String,
  notes: String,
  isActive: { type: Boolean, default: true },
  ...auditFields,
}, auditTimestamps);

module.exports = mongoose.model('Supplier', supplierSchema);
