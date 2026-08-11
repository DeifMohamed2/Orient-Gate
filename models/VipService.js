const mongoose = require('mongoose');
const { auditFields, auditTimestamps } = require('../config/schemaHelpers');

const vipServiceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  defaultCost: { type: Number, default: 0 },
  defaultSellingPrice: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  ...auditFields,
}, auditTimestamps);

module.exports = mongoose.model('VipService', vipServiceSchema);
