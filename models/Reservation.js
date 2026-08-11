const mongoose = require('mongoose');
const { auditFields, auditTimestamps } = require('../config/schemaHelpers');
const { CUSTOMER_TYPES, GROUP_TYPES, PAYMENT_STATUSES } = require('../config/constants');

const memberSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  type: { type: String, enum: CUSTOMER_TYPES, default: 'adult' },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
  hotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel' },
  meccaHotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel' },
  medinaHotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel' },
  meccaRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
  medinaRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
  roomType: String,
  roomGroupId: String,
  linkedManually: { type: Boolean, default: false },
  name: String,
  gender: String,
  passport: String,
  nationality: String,
  birthDate: Date,
  serviceToggles: {
    flight: { type: Boolean, default: true },
    visa: { type: Boolean, default: true },
    transport: { type: Boolean, default: true },
    haramainTrain: { type: Boolean, default: true },
    insurance: { type: Boolean, default: true },
    tours: { type: Boolean, default: true },
  },
  price: { type: Number, default: 0 },
  visaStatus: {
    type: String,
    enum: ['pending', 'submitted', 'approved', 'rejected', 'issued'],
    default: 'pending',
  },
  transportStatus: {
    type: String,
    enum: ['pending', 'assigned', 'confirmed'],
    default: 'pending',
  },
  transportGroup: String,
}, { _id: true });

const selectedVipItemSchema = new mongoose.Schema({
  vipServiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'VipService' },
  name: String,
  cost: { type: Number, default: 0 },
  sellingPrice: { type: Number, default: 0 },
  scope: { type: String, enum: ['member', 'room_group'], default: 'member' },
  memberIndex: Number,
  roomGroupId: String,
  memberName: String,
  groupSize: Number,
}, { _id: false });

const accommodationSchema = new mongoose.Schema({
  city: String,
  hotelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel' },
  hotelName: String,
  checkInDate: Date,
  checkOutDate: Date,
  nights: Number,
  roomType: String,
  roomCount: Number,
}, { _id: false });

const reservationSchema = new mongoose.Schema({
  reservationNumber: { type: String, unique: true, index: true },
  tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true, index: true },
  salesEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  bookingDate: { type: Date, default: Date.now },
  groupType: { type: String, enum: GROUP_TYPES, default: 'solo' },
  brokerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Broker', index: true },
  primaryCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  primaryCustomerName: String,
  primaryPhone: String,
  members: [memberSchema],
  accommodations: [accommodationSchema],
  roomPreference: {
    smoking: Boolean,
    nonSmoking: Boolean,
    nearElevator: Boolean,
    highFloor: Boolean,
  },
  serviceToggles: {
    flight: { type: Boolean, default: true },
    visa: { type: Boolean, default: true },
    transport: { type: Boolean, default: true },
    haramainTrain: { type: Boolean, default: true },
    insurance: { type: Boolean, default: true },
    tours: { type: Boolean, default: true },
  },
  chosenRoomType: String,
  packageStars: String,
  selectedVipItems: [selectedVipItemSchema],
  pricingSnapshot: {
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    breakdown: mongoose.Schema.Types.Mixed,
    exchangeRateUsed: { type: Number },
  },
  paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid' },
  status: { type: String, enum: ['active', 'cancelled', 'completed'], default: 'active' },
  notes: String,
  bookingOfficer: String,
  ...auditFields,
}, auditTimestamps);

reservationSchema.virtual('passengerCount').get(function () {
  return (this.members || []).length;
});

reservationSchema.set('toJSON', { virtuals: true });
reservationSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Reservation', reservationSchema);
