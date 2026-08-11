const mongoose = require('mongoose');
const { auditFields, auditTimestamps } = require('../config/schemaHelpers');

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  passport: String,
  passportExpiry: Date,
  nationality: String,
  gender: { type: String, enum: ['male', 'female'], default: 'male' },
  birthDate: Date,
  phones: [String],
  email: String,
  emergencyContact: {
    name: String,
    phone: String,
  },
  notes: String,
  medicalNotes: String,
  isVip: { type: Boolean, default: false },
  isBlacklisted: { type: Boolean, default: false },
  loyaltyPoints: { type: Number, default: 0 },
  marketingConsent: { type: Boolean, default: false },
  ...auditFields,
}, auditTimestamps);

module.exports = mongoose.model('Customer', customerSchema);
