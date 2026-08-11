const mongoose = require('mongoose');
const { auditFields, auditTimestamps } = require('../config/schemaHelpers');
const { TRIP_STATUSES } = require('../config/constants');

const costComponentSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: true },
  cost: { type: Number, default: 0 },
  sellingPrice: { type: Number, default: 0 },
}, { _id: false });

const roomTypePricesSchema = new mongoose.Schema({
  single: { type: Number, default: 0 },
  double: { type: Number, default: 0 },
  triple: { type: Number, default: 0 },
  quad: { type: Number, default: 0 },
}, { _id: false });

const vipItemSchema = new mongoose.Schema({
  vipServiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'VipService' },
  name: { type: String, trim: true },
  cost: { type: Number, default: 0 },
  sellingPrice: { type: Number, default: 0 },
}, { _id: false });

const pricingSchema = new mongoose.Schema({
  // Primary sale prices: full package per star tier x room type
  starRoomPrices: {
    economy: roomTypePricesSchema,
    '3': roomTypePricesSchema,
    '4': roomTypePricesSchema,
    '5': roomTypePricesSchema,
  },
  // Amount subtracted when customer already has the service
  deductions: {
    flight: { type: Number, default: 0 },
    visa: { type: Number, default: 0 },
    transport: { type: Number, default: 0 },
    haramainTrain: { type: Number, default: 0 },
  },
  // Fixed EGP discount off adult package price per child category
  childDiscounts: {
    childWithBed: { type: Number, default: 0 },
    childWithoutBed: { type: Number, default: 0 },
    infant: { type: Number, default: 0 },
  },
  // Legacy percent discounts — fallback when childDiscounts not set
  childPercents: {
    childWithBed: { type: Number, default: 25 },
    childWithoutBed: { type: Number, default: 40 },
    infant: { type: Number, default: 50 },
  },
  // Cost components for reporting / profit tracking only
  flight: costComponentSchema,
  hotel: costComponentSchema,
  visa: costComponentSchema,
  transport: costComponentSchema,
  haramainTrain: costComponentSchema,
  insurance: costComponentSchema,
  tours: costComponentSchema,
  taxes: costComponentSchema,
  serviceFees: costComponentSchema,
  guideFees: costComponentSchema,
  other: costComponentSchema,
  agencyProfit: { type: Number, default: 0 },
  vipItems: [vipItemSchema],
  vipPackagePrice: { type: Number, default: 0 },
  // Legacy fields kept for back-compat
  adultPrice: { type: Number, default: 0 },
  childWithBedPrice: { type: Number, default: 0 },
  childWithoutBedPrice: { type: Number, default: 0 },
  infantPrice: { type: Number, default: 0 },
  singleSupplement: { type: Number, default: 0 },
  roomPrices: {
    double: { type: Number, default: 0 },
    triple: { type: Number, default: 0 },
    quad: { type: Number, default: 0 },
  },
  starPrices: {
    economy: { type: Number, default: 0 },
    '3': { type: Number, default: 0 },
    '4': { type: Number, default: 0 },
    '5': { type: Number, default: 0 },
  },
  packagePrice: { type: Number, default: 0 },
}, { _id: false });

const tripCostsSchema = new mongoose.Schema({
  sarToEgpRate: { type: Number, default: 0 },
  flightTicketCostEgp: { type: Number, default: 0 },
  visaSaudiAgentSar: { type: Number, default: 0 },
  visaEgyptPortalEgp: { type: Number, default: 0 },
  supervisorDailyRateSar: { type: Number, default: 0 },
  assistantDailyRateSar: { type: Number, default: 0 },
  // Per-hotel nightly room cost (SAR) keyed by hotelId
  hotelNightCosts: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Legacy star-tier costs — fallback for old trips
  starRoomNightCosts: {
    economy: roomTypePricesSchema,
    '3': roomTypePricesSchema,
    '4': roomTypePricesSchema,
    '5': roomTypePricesSchema,
  },
}, { _id: false });

const flightLegSchema = new mongoose.Schema({
  airline: String,
  departureAirport: String,
  arrivalAirport: String,
  flightNumber: String,
  departureTime: String,
  arrivalTime: String,
  departureDate: Date,
}, { _id: false });

const tripSchema = new mongoose.Schema({
  name: { type: String, required: true },
  country: { type: String, default: 'المملكة العربية السعودية' },
  cities: [{ type: String }],
  durationDays: { type: Number, required: true },
  durationNights: { type: Number, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  // Structured flight legs (preferred)
  outboundFlight: flightLegSchema,
  returnFlight: flightLegSchema,
  travelRoute: String,
  gatheringTime: String,
  gatheringLocation: String,
  // Legacy flat fields (kept for back-compat / arrival notices)
  airline: String,
  flightNumbers: [String],
  arrivalTime: String,
  departureTime: String,
  departureAirport: String,
  arrivalAirport: String,
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supervisor', index: true },
  assistantSupervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supervisor', index: true },
  supervisorTripFee: { type: Number, default: 0 },
  assistantTripFee: { type: Number, default: 0 },
  guide: String,
  guidePhone: String,
  guidePhoneSa: String,
  baggageNotes: String,
  importantNotices: String,
  status: { type: String, enum: TRIP_STATUSES, default: 'active' },
  maxCapacity: { type: Number, default: 0 },
  flightSeats: {
    total: { type: Number, default: 0 },
    reserved: { type: Number, default: 0 },
  },
  pricing: pricingSchema,
  costs: tripCostsSchema,
  notes: String,
  ...auditFields,
}, auditTimestamps);

tripSchema.virtual('remainingSeats').get(function () {
  return Math.max(0, (this.flightSeats?.total || 0) - (this.flightSeats?.reserved || 0));
});

tripSchema.virtual('seatsSoldPercent').get(function () {
  const total = this.flightSeats?.total || 0;
  if (!total) return 0;
  return Math.round(((this.flightSeats?.reserved || 0) / total) * 100);
});

tripSchema.set('toJSON', { virtuals: true });
tripSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Trip', tripSchema);
