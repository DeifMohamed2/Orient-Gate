const mongoose = require('mongoose');
const { auditFields, auditTimestamps } = require('../config/schemaHelpers');

const supervisorSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phoneEg: String,
  phoneSa: String,
  email: String,
  nationalId: String,
  notes: String,
  defaultTripFee: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  ...auditFields,
}, auditTimestamps);

supervisorSchema.index({ name: 'text', phoneEg: 'text', phoneSa: 'text', email: 'text' });

module.exports = mongoose.model('Supervisor', supervisorSchema);
