const mongoose = require('mongoose');
const { auditFields, auditTimestamps } = require('../config/schemaHelpers');

const agencySettingsSchema = new mongoose.Schema({
  singletonKey: { type: String, default: 'default', unique: true },
  agentName: { type: String, default: 'معاد الماسية' },
  agencyNameAr: { type: String, default: 'أورينت جيت للسياحة' },
  agencyNameEn: { type: String, default: 'Orient Gate' },
  logoUrl: String,
  defaultArrivalPort: { type: String, default: 'مطار جدة' },
  defaultDeparturePort: { type: String, default: 'مطار جدة' },
  defaultTransportMode: { type: String, default: 'باص' },
  defaultVisaSaudiAgentSar: { type: Number, default: 460 },
  defaultVisaEgyptPortalEgp: { type: Number, default: 3000 },
  sarToEgpRate: { type: Number, default: 13.5 },
  defaultDeductionFlightEgp: { type: Number, default: 5500 },
  defaultDeductionVisaEgp: { type: Number, default: 1500 },
  defaultDeductionTransportEgp: { type: Number, default: 1000 },
  defaultDeductionHaramainTrainEgp: { type: Number, default: 500 },
  ...auditFields,
}, auditTimestamps);

module.exports = mongoose.model('AgencySettings', agencySettingsSchema);
