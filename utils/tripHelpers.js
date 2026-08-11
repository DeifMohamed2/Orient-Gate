const { ROOM_TYPE_CAPACITY, HOTEL_STARS, ROOM_TYPES } = require('../config/constants');
const { validatePackageHotels } = require('../services/hotelPackageService');

const COMPONENT_KEYS = [
  'flight', 'hotel', 'visa', 'transport', 'haramainTrain',
  'insurance', 'tours', 'taxes', 'serviceFees', 'guideFees', 'other',
];

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeStarRoomPrices = (raw = {}) => {
  const normalized = {};
  for (const tier of HOTEL_STARS) {
    normalized[tier] = {};
    for (const rt of ROOM_TYPES) {
      normalized[tier][rt] = num(raw?.[tier]?.[rt]);
    }
  }
  return normalized;
};

const normalizeVipItems = (raw, legacyVipPackagePrice = 0) => {
  let items = raw;
  if (items && !Array.isArray(items)) {
    items = Object.values(items);
  }
  if (!Array.isArray(items)) items = [];

  const normalized = items
    .map((item) => ({
      vipServiceId: item?.vipServiceId || undefined,
      name: (item?.name || '').trim(),
      cost: num(item?.cost),
      sellingPrice: num(item?.sellingPrice),
    }))
    .filter((item) => item.name);

  if (!normalized.length && num(legacyVipPackagePrice) > 0) {
    return [{
      name: 'باقة VIP',
      cost: 0,
      sellingPrice: num(legacyVipPackagePrice),
    }];
  }

  return normalized;
};

const normalizePricing = (pricing = {}) => {
  const normalized = { ...pricing };

  normalized.starRoomPrices = normalizeStarRoomPrices(normalized.starRoomPrices);

  normalized.deductions = {
    flight: num(normalized.deductions?.flight),
    visa: num(normalized.deductions?.visa),
    transport: num(normalized.deductions?.transport),
    haramainTrain: num(normalized.deductions?.haramainTrain),
  };

  normalized.childDiscounts = {
    childWithBed: num(normalized.childDiscounts?.childWithBed),
    childWithoutBed: num(normalized.childDiscounts?.childWithoutBed),
    infant: num(normalized.childDiscounts?.infant),
  };

  normalized.childPercents = {
    childWithBed: num(normalized.childPercents?.childWithBed, 25),
    childWithoutBed: num(normalized.childPercents?.childWithoutBed, 40),
    infant: num(normalized.childPercents?.infant, 50),
  };

  for (const key of COMPONENT_KEYS) {
    if (normalized[key]) {
      normalized[key] = {
        enabled: normalized[key].enabled === true || normalized[key].enabled === 'true',
        cost: num(normalized[key].cost),
        sellingPrice: num(normalized[key].sellingPrice),
      };
    } else {
      normalized[key] = { enabled: true, cost: 0, sellingPrice: 0 };
    }
  }

  normalized.agencyProfit = num(normalized.agencyProfit);
  normalized.vipPackagePrice = num(normalized.vipPackagePrice);
  normalized.vipItems = normalizeVipItems(normalized.vipItems, normalized.vipPackagePrice);

  // Legacy fields — keep for back-compat
  normalized.adultPrice = num(normalized.adultPrice);
  normalized.childWithBedPrice = num(normalized.childWithBedPrice);
  normalized.childWithoutBedPrice = num(normalized.childWithoutBedPrice);
  normalized.infantPrice = num(normalized.infantPrice);
  normalized.singleSupplement = num(normalized.singleSupplement);
  normalized.packagePrice = num(normalized.packagePrice);
  normalized.roomPrices = {
    double: num(normalized.roomPrices?.double),
    triple: num(normalized.roomPrices?.triple),
    quad: num(normalized.roomPrices?.quad),
  };
  normalized.starPrices = {
    economy: num(normalized.starPrices?.economy),
    '3': num(normalized.starPrices?.['3']),
    '4': num(normalized.starPrices?.['4']),
    '5': num(normalized.starPrices?.['5']),
  };

  return normalized;
};

const parseHotelsPayload = (body) => {
  const raw = body.hotels;
  if (!raw) return [];

  const list = Array.isArray(raw) ? raw : Object.values(raw);
  return list
    .filter((h) => h && (h.name || h.city))
    .map((hotel) => ({
      name: hotel.name || '',
      city: hotel.city || 'mecca',
      stars: hotel.stars || '4',
      checkInDate: hotel.checkInDate || null,
      checkOutDate: hotel.checkOutDate || null,
      nights: num(hotel.nights),
      address: hotel.address || '',
      phone: hotel.phone || '',
      notes: hotel.notes || '',
    }));
};

const validateHotelsPayload = (hotels = []) => validatePackageHotels(hotels);

const parseOptionalDate = (v) => {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const normalizeFlightLeg = (raw = {}) => ({
  airline: (raw.airline || '').trim() || undefined,
  departureAirport: (raw.departureAirport || '').trim() || undefined,
  arrivalAirport: (raw.arrivalAirport || '').trim() || undefined,
  flightNumber: (raw.flightNumber || '').trim() || undefined,
  departureTime: (raw.departureTime || '').trim() || undefined,
  arrivalTime: (raw.arrivalTime || '').trim() || undefined,
  departureDate: parseOptionalDate(raw.departureDate),
});

const resolveFlightLegs = (trip = {}) => {
  const outbound = trip.outboundFlight || {};
  const returnLeg = trip.returnFlight || {};
  const legacyOutboundNumber = trip.flightNumbers?.[0] || '';
  const legacyReturnNumber = trip.flightNumbers?.[1] || '';

  return {
    outbound: {
      airline: trip.airline || outbound.airline || '',
      departureAirport: outbound.departureAirport || trip.departureAirport || '',
      arrivalAirport: outbound.arrivalAirport || trip.arrivalAirport || '',
      flightNumber: outbound.flightNumber || legacyOutboundNumber,
      departureTime: outbound.departureTime || '',
      arrivalTime: outbound.arrivalTime || trip.arrivalTime || '',
      departureDate: outbound.departureDate || trip.startDate || null,
    },
    return: {
      airline: trip.airline || returnLeg.airline || '',
      departureAirport: returnLeg.departureAirport || trip.arrivalAirport || '',
      arrivalAirport: returnLeg.arrivalAirport || trip.departureAirport || '',
      flightNumber: returnLeg.flightNumber || legacyReturnNumber,
      departureTime: returnLeg.departureTime || trip.departureTime || '',
      arrivalTime: returnLeg.arrivalTime || '',
      departureDate: returnLeg.departureDate || trip.endDate || null,
    },
  };
};

const syncAirlineToLegs = (payload) => {
  const airline = (payload.airline || '').trim() || undefined;
  payload.airline = airline;
  if (payload.outboundFlight) payload.outboundFlight.airline = airline;
  if (payload.returnFlight) payload.returnFlight.airline = airline;
  return payload;
};

const syncLegacyFlightFields = (payload) => {
  const outbound = payload.outboundFlight || {};
  const returnLeg = payload.returnFlight || {};
  payload.airline = (payload.airline || '').trim() || outbound.airline || returnLeg.airline || undefined;
  payload.flightNumbers = [
    outbound.flightNumber || '',
    returnLeg.flightNumber || '',
  ];
  payload.departureAirport = outbound.departureAirport || undefined;
  payload.arrivalAirport = outbound.arrivalAirport || undefined;
  payload.arrivalTime = outbound.arrivalTime || undefined;
  payload.departureTime = returnLeg.departureTime || undefined;
  return payload;
};

const normalizeHotelNightCosts = (raw = {}) => {
  if (!raw || typeof raw !== 'object') return {};
  const normalized = {};
  for (const [key, tier] of Object.entries(raw)) {
    if (!tier || typeof tier !== 'object') continue;
    normalized[String(key)] = {
      single: num(tier.single),
      double: num(tier.double),
      triple: num(tier.triple),
      quad: num(tier.quad),
    };
  }
  return normalized;
};

const isObjectIdKey = (key) => /^[a-f\d]{24}$/i.test(String(key));

const remapHotelNightCostsToIds = (hotelNightCosts = {}, hotels = []) => {
  const input = normalizeHotelNightCosts(hotelNightCosts);
  const result = {};

  for (const [key, prices] of Object.entries(input)) {
    if (isObjectIdKey(key)) {
      result[key] = prices;
    }
  }

  hotels.forEach((hotel, index) => {
    const id = String(hotel._id);
    const byIndex = input[String(index)];
    const byNewKey = input[`new-${index}`];
    const bySlot = input[`slot-${index}`];
    const merged = byIndex || byNewKey || bySlot;
    if (merged) {
      result[id] = merged;
    } else if (!result[id] && input[id]) {
      result[id] = input[id];
    }
  });

  return result;
};

const normalizeTripCosts = (raw = {}) => ({
  sarToEgpRate: num(raw.sarToEgpRate),
  flightTicketCostEgp: num(raw.flightTicketCostEgp),
  visaSaudiAgentSar: num(raw.visaSaudiAgentSar),
  visaEgyptPortalEgp: num(raw.visaEgyptPortalEgp),
  supervisorDailyRateSar: num(raw.supervisorDailyRateSar),
  assistantDailyRateSar: num(raw.assistantDailyRateSar),
  hotelNightCosts: normalizeHotelNightCosts(raw.hotelNightCosts),
  starRoomNightCosts: normalizeStarRoomPrices(raw.starRoomNightCosts),
});

const DEDUCTION_KEYS = ['flight', 'visa', 'transport', 'haramainTrain'];

const allDeductionsZero = (deductions = {}) =>
  DEDUCTION_KEYS.every((k) => !num(deductions[k]));

const buildTripFromFormBody = (body = {}) => {
  const hotels = parseHotelsPayload(body);
  return {
    name: body.name || '',
    country: body.country || '',
    startDate: body.startDate || null,
    endDate: body.endDate || null,
    durationDays: num(body.durationDays),
    durationNights: num(body.durationNights),
    travelRoute: body.travelRoute || '',
    gatheringTime: body.gatheringTime || '',
    gatheringLocation: body.gatheringLocation || '',
    guide: body.guide || '',
    guidePhone: body.guidePhone || '',
    guidePhoneSa: body.guidePhoneSa || '',
    airline: body.airline || '',
    baggageNotes: body.baggageNotes || '',
    importantNotices: body.importantNotices || '',
    notes: body.notes || '',
    status: body.status || 'active',
    maxCapacity: num(body.maxCapacity || body.flightSeats?.total),
    supervisorId: body.supervisorId || '',
    assistantSupervisorId: body.assistantSupervisorId || '',
    outboundFlight: body.outboundFlight || {},
    returnFlight: body.returnFlight || {},
    pricing: normalizePricing(body.pricing),
    costs: normalizeTripCosts(body.costs),
  };
};

const consumeSessionFormDraft = (req, expectedMode, tripId = null) => {
  const draft = req.session?.tripFormDraft;
  if (!draft || draft.mode !== expectedMode) return null;
  if (expectedMode === 'edit' && tripId && String(draft.tripId) !== String(tripId)) return null;
  delete req.session.tripFormDraft;
  return draft.body;
};

const normalizeTripPayload = (body, existingTrip = null) => {
  const payload = { ...body };
  payload.pricing = normalizePricing(body.pricing);
  payload.durationDays = num(body.durationDays);
  payload.durationNights = num(body.durationNights);

  payload.outboundFlight = normalizeFlightLeg(body.outboundFlight);
  payload.returnFlight = normalizeFlightLeg(body.returnFlight);
  payload.airline = (body.airline || '').trim() || undefined;
  syncAirlineToLegs(payload);
  payload.travelRoute = (body.travelRoute || '').trim() || undefined;
  payload.gatheringTime = (body.gatheringTime || '').trim() || undefined;
  payload.gatheringLocation = (body.gatheringLocation || '').trim() || undefined;
  payload.guidePhone = (body.guidePhone || '').trim() || undefined;
  payload.guidePhoneSa = (body.guidePhoneSa || '').trim() || undefined;
  payload.baggageNotes = (body.baggageNotes || '').trim() || undefined;
  payload.importantNotices = (body.importantNotices || '').trim() || undefined;

  payload.costs = normalizeTripCosts(body.costs);

  syncLegacyFlightFields(payload);

  const seatTotal = num(body.maxCapacity || body.flightSeats?.total, 0);
  payload.maxCapacity = seatTotal;
  payload.flightSeats = {
    total: seatTotal,
    reserved: num(existingTrip?.flightSeats?.reserved || body.flightSeats?.reserved),
  };

  if (existingTrip?.pricing?.deductions && allDeductionsZero(payload.pricing.deductions)) {
    payload.pricing.deductions = { ...existingTrip.pricing.deductions };
  }

  delete payload.hotels;
  return payload;
};

const buildRoomsForHotel = (tripId, hotelId, rooms, userId) => {
  const docs = [];
  let roomSeq = 1;
  for (const cfg of rooms) {
    const capacity = ROOM_TYPE_CAPACITY[cfg.type] || 1;
    for (let i = 0; i < cfg.count; i++) {
      docs.push({
        tripId,
        hotelId,
        roomNumber: String(roomSeq++),
        type: cfg.type,
        capacity,
        price: 0,
        floor: cfg.floor,
        view: cfg.view,
        status: 'available',
        createdBy: userId,
      });
    }
  }
  return docs;
};

module.exports = {
  normalizePricing,
  normalizeTripPayload,
  parseHotelsPayload,
  validateHotelsPayload,
  allDeductionsZero,
  buildRoomsForHotel,
  normalizeStarRoomPrices,
  normalizeTripCosts,
  normalizeHotelNightCosts,
  remapHotelNightCostsToIds,
  normalizeVipItems,
  normalizeFlightLeg,
  resolveFlightLegs,
  syncLegacyFlightFields,
  syncAirlineToLegs,
  buildTripFromFormBody,
  consumeSessionFormDraft,
  COMPONENT_KEYS,
};
