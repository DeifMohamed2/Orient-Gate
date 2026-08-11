const mongoose = require('mongoose');
const { auditFields, auditTimestamps } = require('../config/schemaHelpers');

const brokerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phones: [String],
  email: String,
  company: String,
  notes: String,
  isActive: { type: Boolean, default: true },
  ...auditFields,
}, auditTimestamps);

brokerSchema.index({ name: 'text', company: 'text', phones: 'text' });

module.exports = mongoose.model('Broker', brokerSchema);
