const Joi = require('joi');
const { ROOM_TYPES, GROUP_TYPES, CUSTOMER_TYPES, TRIP_STATUSES, HOTEL_STARS, CITIES } = require('../config/constants');
const { optionalNumber, flexibleCostMap } = require('./joiHelpers');

const loginSchema = Joi.object({
  identifier: Joi.string().trim().min(3).required().messages({
    'any.required': 'البريد الإلكتروني أو رقم الهاتف مطلوب',
    'string.empty': 'البريد الإلكتروني أو رقم الهاتف مطلوب',
    'string.min': 'البريد الإلكتروني أو رقم الهاتف مطلوب',
  }),
  password: Joi.string().required().messages({ 'any.required': 'كلمة المرور مطلوبة' }),
});

const tripRoomSchema = Joi.object({
  type: Joi.string().valid(...ROOM_TYPES).required(),
  count: Joi.number().integer().min(1).max(100).required(),
  floor: Joi.string().allow('', null),
  view: Joi.string().allow('', null),
});

const tripHotelSchema = Joi.object({
  name: Joi.string().allow('', null),
  city: Joi.string().valid(...CITIES),
  stars: Joi.string().valid(...HOTEL_STARS),
  checkInDate: Joi.date().allow(null),
  checkOutDate: Joi.date().allow(null),
  nights: Joi.number().integer().min(0),
  address: Joi.string().allow('', null),
  phone: Joi.string().allow('', null),
  notes: Joi.string().allow('', null),
  rooms: Joi.alternatives().try(
    Joi.array().items(tripRoomSchema),
    Joi.object().pattern(Joi.string(), tripRoomSchema),
  ),
});

const flightLegSchema = Joi.object({
  airline: Joi.string().allow('', null),
  departureAirport: Joi.string().allow('', null),
  arrivalAirport: Joi.string().allow('', null),
  flightNumber: Joi.string().allow('', null),
  departureTime: Joi.string().allow('', null),
  arrivalTime: Joi.string().allow('', null),
  departureDate: Joi.date().allow(null),
});

const tripSchema = Joi.object({
  name: Joi.string().required(),
  country: Joi.string().allow('', null),
  cities: Joi.array().items(Joi.string()),
  durationDays: Joi.number().integer().min(1).required(),
  durationNights: Joi.number().integer().min(0).required(),
  startDate: Joi.date().required(),
  endDate: Joi.date().required(),
  outboundFlight: flightLegSchema,
  returnFlight: flightLegSchema,
  travelRoute: Joi.string().allow('', null),
  gatheringTime: Joi.string().allow('', null),
  gatheringLocation: Joi.string().allow('', null),
  airline: Joi.string().allow('', null),
  flightNumbers: Joi.array().items(Joi.string()),
  arrivalTime: Joi.string().allow('', null),
  departureTime: Joi.string().allow('', null),
  departureAirport: Joi.string().allow('', null),
  arrivalAirport: Joi.string().allow('', null),
  guide: Joi.string().allow('', null),
  guidePhone: Joi.string().allow('', null),
  guidePhoneSa: Joi.string().allow('', null),
  supervisorId: Joi.string().allow('', null),
  assistantSupervisorId: Joi.string().allow('', null, '__new__'),
  newSupervisorName: Joi.string().allow('', null),
  newSupervisorPhoneEg: Joi.string().allow('', null),
  newSupervisorPhoneSa: Joi.string().allow('', null),
  newAssistantSupervisorName: Joi.string().allow('', null),
  newAssistantSupervisorPhoneEg: Joi.string().allow('', null),
  newAssistantSupervisorPhoneSa: Joi.string().allow('', null),
  baggageNotes: Joi.string().allow('', null),
  importantNotices: Joi.string().allow('', null),
  status: Joi.string().valid(...TRIP_STATUSES),
  maxCapacity: Joi.number().integer().min(0),
  flightSeats: Joi.object({
    total: Joi.number().integer().min(0),
    reserved: Joi.number().integer().min(0),
  }),
  pricing: Joi.object().unknown(true),
  notes: Joi.string().allow('', null),
  hotels: Joi.alternatives().try(
    Joi.array().items(tripHotelSchema),
    Joi.object().pattern(Joi.string(), tripHotelSchema),
  ),
  costs: Joi.object({
    sarToEgpRate: optionalNumber,
    flightTicketCostEgp: optionalNumber,
    visaSaudiAgentSar: optionalNumber,
    visaEgyptPortalEgp: optionalNumber,
    supervisorDailyRateSar: optionalNumber,
    assistantDailyRateSar: optionalNumber,
    hotelNightCosts: flexibleCostMap,
    starRoomNightCosts: flexibleCostMap,
  }).unknown(true).allow(null).default({}),
});

const hotelSchema = Joi.object({
  tripId: Joi.string().required(),
  name: Joi.string().required(),
  stars: Joi.string().valid(...HOTEL_STARS),
  city: Joi.string().valid(...CITIES).required(),
  checkInDate: Joi.date().allow(null),
  checkOutDate: Joi.date().allow(null),
  nights: Joi.number().integer().min(0),
  address: Joi.string().allow('', null),
  phone: Joi.string().allow('', null),
  notes: Joi.string().allow('', null),
});

const roomBatchSchema = Joi.object({
  tripId: Joi.string().required(),
  hotelId: Joi.string().required(),
  type: Joi.string().valid(...ROOM_TYPES).required(),
  count: Joi.number().integer().min(1).max(100).required(),
  price: Joi.number().min(0),
  floor: Joi.string().allow('', null),
  view: Joi.string().allow('', null),
  startNumber: Joi.number().integer().min(1).default(1),
});

const memberSchema = Joi.object({
  customerId: Joi.string().allow('', null),
  name: Joi.string().required(),
  type: Joi.string().valid(...CUSTOMER_TYPES).default('adult'),
  gender: Joi.string().valid('male', 'female').default('male'),
  passport: Joi.string().allow('', null),
  nationality: Joi.string().allow('', null),
  birthDate: Joi.date().allow(null),
  hotelId: Joi.string().allow('', null),
  roomType: Joi.string().valid(...ROOM_TYPES).required(),
  roomGroupId: Joi.string().allow('', null),
  linkedManually: Joi.boolean(),
  serviceToggles: Joi.object({
    flight: Joi.boolean(),
    visa: Joi.boolean(),
    transport: Joi.boolean(),
    haramainTrain: Joi.boolean(),
    insurance: Joi.boolean(),
    tours: Joi.boolean(),
  }),
});

const reservationSchema = Joi.object({
  tripId: Joi.string().required(),
  groupType: Joi.string().valid(...GROUP_TYPES).default('solo'),
  brokerId: Joi.string().allow('', null),
  brokerName: Joi.string().allow('', null),
  newBrokerName: Joi.string().allow('', null),
  brokerPhone: Joi.string().allow('', null),
  newBrokerPhone: Joi.string().allow('', null),
  primaryCustomerName: Joi.when('groupType', {
    is: 'broker',
    then: Joi.string().allow('', null),
    otherwise: Joi.string().required(),
  }),
  primaryCustomerId: Joi.string().allow('', null),
  primaryPhone: Joi.when('groupType', {
    is: 'broker',
    then: Joi.string().allow('', null),
    otherwise: Joi.string().required(),
  }),
  packageStars: Joi.string().valid(...HOTEL_STARS).required(),
  hotelId: Joi.string().allow('', null),
  chosenRoomType: Joi.string().valid(...ROOM_TYPES),
  members: Joi.array().items(memberSchema).min(1).required(),
  accommodations: Joi.array().items(Joi.object({
    city: Joi.string(),
    hotelId: Joi.string(),
    hotelName: Joi.string(),
    checkInDate: Joi.date().allow(null),
    checkOutDate: Joi.date().allow(null),
    nights: Joi.number().integer().min(0),
    roomType: Joi.string(),
    roomCount: Joi.number().integer().min(0),
  })),
  serviceToggles: Joi.object({
    flight: Joi.boolean(),
    visa: Joi.boolean(),
    transport: Joi.boolean(),
    haramainTrain: Joi.boolean(),
    insurance: Joi.boolean(),
    tours: Joi.boolean(),
  }),
  paymentStatus: Joi.string().valid('unpaid', 'partial', 'paid', 'refunded'),
  paidAmount: Joi.number().min(0).default(0),
  discount: Joi.number().min(0).default(0),
  notes: Joi.string().allow('', null),
  bookingOfficer: Joi.string().allow('', null),
});

const paymentSchema = Joi.object({
  tripId: Joi.string().required(),
  reservationId: Joi.string().allow(null),
  invoiceId: Joi.string().allow(null),
  amount: Joi.number().min(0).required(),
  method: Joi.string().valid('cash', 'bank', 'card', 'transfer', 'other'),
  reference: Joi.string().allow('', null),
  notes: Joi.string().allow('', null),
  paymentDate: Joi.date(),
});

const expenseSchema = Joi.object({
  tripId: Joi.string().required(),
  category: Joi.string().valid('hotel', 'flight', 'visa', 'transport', 'guide', 'insurance', 'other'),
  supplier: Joi.string().allow('', null),
  description: Joi.string().allow('', null),
  amount: Joi.number().min(0).required(),
  expenseDate: Joi.date(),
  reference: Joi.string().allow('', null),
  notes: Joi.string().allow('', null),
});

const movementSchema = Joi.object({
  description: Joi.string().allow('', null),
  from: Joi.string().allow('', null),
  to: Joi.string().allow('', null),
  time: Joi.string().allow('', null),
  date: Joi.alternatives().try(Joi.date(), Joi.string().allow('', null)),
});

const arrivalNoticeBaseFields = {
  arrivalPort: Joi.string().required().messages({ 'any.required': 'منفذ الوصول مطلوب', 'string.empty': 'منفذ الوصول مطلوب' }),
  arrivalTransportMode: Joi.string().allow('', null),
  arrivalFlightNumber: Joi.string().required().messages({ 'any.required': 'رقم رحلة الوصول مطلوب', 'string.empty': 'رقم رحلة الوصول مطلوب' }),
  arrivalDate: Joi.alternatives().try(Joi.date(), Joi.string()).required().messages({ 'any.required': 'تاريخ الوصول مطلوب' }),
  arrivalTime: Joi.string().allow('', null),
  arrivalAirline: Joi.string().required().messages({ 'any.required': 'خطوط الوصول مطلوبة', 'string.empty': 'خطوط الوصول مطلوبة' }),
  departurePort: Joi.string().required().messages({ 'any.required': 'منفذ المغادرة مطلوب', 'string.empty': 'منفذ المغادرة مطلوب' }),
  departureTransportMode: Joi.string().allow('', null),
  departureFlightNumber: Joi.string().required().messages({ 'any.required': 'رقم رحلة المغادرة مطلوب', 'string.empty': 'رقم رحلة المغادرة مطلوب' }),
  departureDate: Joi.alternatives().try(Joi.date(), Joi.string()).required().messages({ 'any.required': 'تاريخ المغادرة مطلوب' }),
  departureTime: Joi.string().allow('', null),
  departureAirline: Joi.string().required().messages({ 'any.required': 'خطوط المغادرة مطلوبة', 'string.empty': 'خطوط المغادرة مطلوبة' }),
  groupNumbers: Joi.string().allow('', null),
  pilgrimCount: Joi.number().integer().min(1).required().messages({ 'number.min': 'عدد المعتمرين يجب أن يكون 1 على الأقل', 'any.required': 'عدد المعتمرين مطلوب' }),
  busCount: Joi.number().integer().min(0),
  makkahHotelName: Joi.when('$hasMakkah', {
    is: true,
    then: Joi.string().required().messages({ 'any.required': 'فندق مكة مطلوب', 'string.empty': 'فندق مكة مطلوب' }),
    otherwise: Joi.string().allow('', null),
  }),
  makkahCheckIn: Joi.when('$hasMakkah', {
    is: true,
    then: Joi.alternatives().try(Joi.date(), Joi.string()).required().messages({ 'any.required': 'تاريخ دخول مكة مطلوب' }),
    otherwise: Joi.alternatives().try(Joi.date(), Joi.string()).allow('', null),
  }),
  makkahCheckOut: Joi.when('$hasMakkah', {
    is: true,
    then: Joi.alternatives().try(Joi.date(), Joi.string()).required().messages({ 'any.required': 'تاريخ خروج مكة مطلوب' }),
    otherwise: Joi.alternatives().try(Joi.date(), Joi.string()).allow('', null),
  }),
  medinaHotelName: Joi.when('$hasMedina', {
    is: true,
    then: Joi.string().required().messages({ 'any.required': 'فندق المدينة مطلوب', 'string.empty': 'فندق المدينة مطلوب' }),
    otherwise: Joi.string().allow('', null),
  }),
  medinaCheckIn: Joi.when('$hasMedina', {
    is: true,
    then: Joi.alternatives().try(Joi.date(), Joi.string()).required().messages({ 'any.required': 'تاريخ دخول المدينة مطلوب' }),
    otherwise: Joi.alternatives().try(Joi.date(), Joi.string()).allow('', null),
  }),
  medinaCheckOut: Joi.when('$hasMedina', {
    is: true,
    then: Joi.alternatives().try(Joi.date(), Joi.string()).required().messages({ 'any.required': 'تاريخ خروج المدينة مطلوب' }),
    otherwise: Joi.alternatives().try(Joi.date(), Joi.string()).allow('', null),
  }),
  movements: Joi.alternatives().try(
    Joi.array().items(movementSchema),
    Joi.object().pattern(Joi.string(), movementSchema),
  ),
  notes: Joi.string().allow('', null),
};

const arrivalNoticeSchema = Joi.object(arrivalNoticeBaseFields);
const arrivalNoticeIssueSchema = arrivalNoticeSchema;

const supervisorSchema = Joi.object({
  name: Joi.string().required(),
  phoneEg: Joi.string().allow('', null),
  phoneSa: Joi.string().allow('', null),
  email: Joi.string().allow('', null),
  nationalId: Joi.string().allow('', null),
  notes: Joi.string().allow('', null),
  defaultTripFee: optionalNumber,
  isActive: Joi.boolean(),
});

module.exports = {
  loginSchema,
  tripSchema,
  hotelSchema,
  roomBatchSchema,
  reservationSchema,
  paymentSchema,
  expenseSchema,
  arrivalNoticeSchema,
  arrivalNoticeIssueSchema,
  supervisorSchema,
};
