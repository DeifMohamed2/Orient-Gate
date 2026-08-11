const mongoose = require('mongoose');
const { auditFields, auditTimestamps } = require('../config/schemaHelpers');
const { ROOM_TYPES, ROOM_STATUSES } = require('../config/constants');

const occupantSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  reservationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation' },
  memberId: mongoose.Schema.Types.ObjectId,
  name: String,
  gender: String,
  type: String,
}, { _id: false });

const roomSchema = new mongoose.Schema({
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
  hotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true, index: true },
  roomNumber: { type: String, required: true },
  type: { type: String, enum: ROOM_TYPES, required: true },
  capacity: { type: Number, required: true },
  floor: String,
  view: String,
  price: { type: Number, default: 0 },
  status: { type: String, enum: ROOM_STATUSES, default: 'available' },
  occupants: [occupantSchema],
  reservationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation' },
  genderPool: { type: String, enum: ['male', 'female', 'mixed', 'family'], default: 'mixed' },
  isLocked: { type: Boolean, default: false },
  notes: String,
  ...auditFields,
}, auditTimestamps);

roomSchema.virtual('bedsUsed').get(function () {
  return (this.occupants || []).filter((o) => o.type !== 'child_no_bed' && o.type !== 'infant').length;
});

roomSchema.virtual('availableBeds').get(function () {
  return Math.max(0, this.capacity - this.bedsUsed);
});

roomSchema.set('toJSON', { virtuals: true });
roomSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Room', roomSchema);
