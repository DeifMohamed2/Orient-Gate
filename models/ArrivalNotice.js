const mongoose = require('mongoose');
const { auditFields, auditTimestamps } = require('../config/schemaHelpers');

const movementSchema = new mongoose.Schema({
  description: String,
  from: String,
  to: String,
  time: String,
  date: Date,
}, { _id: true });

const arrivalNoticeSchema = new mongoose.Schema({
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, unique: true, index: true },
  noticeNumber: { type: Number, required: true },
  arrivalPort: String,
  arrivalTransportMode: String,
  arrivalFlightNumber: String,
  arrivalDate: Date,
  arrivalTime: String,
  arrivalAirline: String,
  departurePort: String,
  departureTransportMode: String,
  departureFlightNumber: String,
  departureDate: Date,
  departureTime: String,
  departureAirline: String,
  groupNumbers: String,
  pilgrimCount: { type: Number, default: 0 },
  busCount: { type: Number, default: 0 },
  makkahHotelName: String,
  makkahCheckIn: Date,
  makkahCheckOut: Date,
  medinaHotelName: String,
  medinaCheckIn: Date,
  medinaCheckOut: Date,
  movements: [movementSchema],
  status: { type: String, enum: ['draft', 'issued'], default: 'draft' },
  issuedAt: Date,
  notes: String,
  ...auditFields,
}, auditTimestamps);

module.exports = mongoose.model('ArrivalNotice', arrivalNoticeSchema);
