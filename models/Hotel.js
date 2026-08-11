const mongoose = require('mongoose');
const { auditFields, auditTimestamps } = require('../config/schemaHelpers');
const { HOTEL_STARS, CITIES } = require('../config/constants');

const hotelSchema = new mongoose.Schema({
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
  name: { type: String, required: true },
  stars: { type: String, enum: HOTEL_STARS, default: '4' },
  city: { type: String, enum: CITIES, required: true },
  checkInDate: Date,
  checkOutDate: Date,
  nights: { type: Number, default: 0 },
  address: String,
  phone: String,
  notes: String,
  ...auditFields,
}, auditTimestamps);

module.exports = mongoose.model('Hotel', hotelSchema);
