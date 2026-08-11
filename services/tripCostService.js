const Trip = require('../models/Trip');
const Hotel = require('../models/Hotel');
const Reservation = require('../models/Reservation');
const Expense = require('../models/Expense');
const { ROOM_TYPE_CAPACITY } = require('../config/constants');
const { getAgencySettings } = require('./arrivalNoticeService');
const {
  inferPackageStarsFromReservation,
  getPackageHotels,
} = require('./hotelPackageService');

const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const convertToEgp = (amount, currency, rate) => {
  const value = num(amount);
  if (!value) return 0;
  if (currency === 'SAR') return Math.round(value * num(rate, 1));
  return Math.round(value);
};

const sarToEgp = (amountSar, rate) => Math.round(num(amountSar) * num(rate, 1));

const resolveExchangeRate = async (trip) => {
  if (trip?.costs?.sarToEgpRate > 0) return trip.costs.sarToEgpRate;
  const settings = await getAgencySettings();
  return num(settings.sarToEgpRate, 13.5);
};

const getHotelNightsByCity = (hotels = []) => {
  const meccaHotel = hotels.find((h) => h.city === 'mecca');
  const medinaHotel = hotels.find((h) => h.city === 'medina');
  return {
    meccaNights: num(meccaHotel?.nights),
    medinaNights: num(medinaHotel?.nights),
    meccaHotel,
    medinaHotel,
  };
};

const getLegacyRoomNightCost = (costs, hotelStars, roomType) => {
  const tier = costs?.starRoomNightCosts?.[hotelStars];
  if (!tier) return 0;
  return num(tier[roomType]);
};

const getHotelRoomNightCost = (costs, hotelId, roomType, hotelStars) => {
  const keyed = costs?.hotelNightCosts || {};
  const id = String(hotelId);
  const tier = keyed[id] || keyed[hotelId];
  if (tier && num(tier[roomType]) > 0) return num(tier[roomType]);
  return getLegacyRoomNightCost(costs, hotelStars, roomType);
};

const getHotelStayCostEgp = (costs, hotel, roomType, rate) => {
  if (!hotel) return 0;
  const capacity = ROOM_TYPE_CAPACITY[roomType] || 1;
  const roomNightCost = getHotelRoomNightCost(costs, hotel._id, roomType, hotel.stars);
  if (!roomNightCost) return 0;

  const perPersonPerNightSar = roomNightCost / capacity;
  const staySar = perPersonPerNightSar * num(hotel.nights);
  return sarToEgp(staySar, rate);
};

const getMemberAccommodationCostEgp = (costs, hotels, roomType, rate) => {
  let mecca = 0;
  let medina = 0;

  for (const hotel of hotels) {
    const portion = getHotelStayCostEgp(costs, hotel, roomType, rate);
    if (hotel.city === 'mecca') mecca += portion;
    else if (hotel.city === 'medina') medina += portion;
  }

  return { mecca, medina, total: mecca + medina };
};

const getMemberVisaCostEgp = (costs, rate, includeVisa = true) => {
  if (!includeVisa) return 0;
  const portal = num(costs?.visaEgyptPortalEgp);
  const agentSar = num(costs?.visaSaudiAgentSar);
  return portal + sarToEgp(agentSar, rate);
};

const getMemberFlightCostEgp = (costs, includeFlight = true) => {
  if (!includeFlight) return 0;
  return num(costs?.flightTicketCostEgp);
};

const getMemberCostBreakdown = (member, trip, hotels, rate) => {
  const costs = trip.costs || {};
  const toggles = member.serviceToggles || {};
  const roomType = member.roomType || 'double';

  const visa = getMemberVisaCostEgp(costs, rate, toggles.visa !== false);
  const flight = getMemberFlightCostEgp(costs, toggles.flight !== false);
  const accommodation = getMemberAccommodationCostEgp(costs, hotels, roomType, rate);

  const total = visa + flight + accommodation.total;
  return {
    visa,
    flight,
    accommodationMecca: accommodation.mecca,
    accommodationMedina: accommodation.medina,
    accommodationTotal: accommodation.total,
    total,
    roomType,
  };
};

const getReservationHotelStars = async (reservation, hotels) => {
  if (reservation.packageStars) return reservation.packageStars;
  return inferPackageStarsFromReservation(reservation, hotels);
};

const getReservationPackageHotels = async (reservation, tripId, allHotels) => {
  const packageStars = await inferPackageStarsFromReservation(reservation, allHotels);
  if (!packageStars) return allHotels;
  const filtered = allHotels.filter((h) => h.stars === packageStars);
  if (filtered.length) return filtered;
  return await getPackageHotels(tripId, packageStars);
};

const getReservationCost = async (reservation, trip, hotels, rate) => {
  const packageHotels = await getReservationPackageHotels(reservation, trip._id, hotels);
  const hotelStars = await getReservationHotelStars(reservation, packageHotels);
  const memberBreakdowns = [];
  let membersTotal = 0;

  for (const member of reservation.members || []) {
    const breakdown = getMemberCostBreakdown(member, trip, packageHotels, rate);
    memberBreakdowns.push({ name: member.name, ...breakdown });
    membersTotal += breakdown.total;
  }

  let vipCost = 0;
  for (const item of reservation.selectedVipItems || []) {
    vipCost += num(item.cost);
  }

  return {
    hotelStars,
    packageStars: hotelStars,
    memberBreakdowns,
    membersTotal,
    vipCost,
    total: membersTotal + vipCost,
  };
};

const getTripLevelCostsEgp = (trip, rate) => {
  const costs = trip.costs || {};
  const days = num(trip.durationDays, 1);
  let supervisorSar = 0;
  let assistantSar = 0;

  if (trip.supervisorId && num(costs.supervisorDailyRateSar) > 0) {
    supervisorSar = num(costs.supervisorDailyRateSar) * days;
  }
  if (trip.assistantSupervisorId && num(costs.assistantDailyRateSar) > 0) {
    assistantSar = num(costs.assistantDailyRateSar) * days;
  }

  const supervisor = sarToEgp(supervisorSar, rate);
  const assistant = sarToEgp(assistantSar, rate);

  return {
    supervisor,
    assistant,
    total: supervisor + assistant,
    supervisorSar,
    assistantSar,
    totalSar: supervisorSar + assistantSar,
  };
};

/** Unit cost per pilgrim (EGP) — mirrors trip-form preview (visa + flight + quad hotel stay). */
const getUnitCostBreakdown = (trip, hotels = [], rate) => {
  const costs = trip.costs || {};
  const visaSar = num(costs.visaSaudiAgentSar);
  const visaEgpPortal = num(costs.visaEgyptPortalEgp);
  const visaAgentEgp = sarToEgp(visaSar, rate);
  const visa = visaEgpPortal + visaAgentEgp;
  const flight = num(costs.flightTicketCostEgp);

  const roomType = 'quad';
  const accommodation = getMemberAccommodationCostEgp(costs, hotels, roomType, rate);

  return {
    visa,
    visaSar,
    visaEgpPortal,
    visaAgentEgp,
    flight,
    accommodation: accommodation.total,
    accommodationMecca: accommodation.mecca,
    accommodationMedina: accommodation.medina,
    total: visa + flight + accommodation.total,
  };
};

const emptyRoomTypeBucket = () => ({
  count: 0,
  visa: 0,
  flight: 0,
  accommodation: 0,
  total: 0,
});

const createEmptyByRoomType = () => ({
  single: emptyRoomTypeBucket(),
  double: emptyRoomTypeBucket(),
  triple: emptyRoomTypeBucket(),
  quad: emptyRoomTypeBucket(),
});

const mergeByRoomType = (target, source) => {
  const out = target || createEmptyByRoomType();
  const src = source || {};
  ['single', 'double', 'triple', 'quad'].forEach((rt) => {
    const s = src[rt] || emptyRoomTypeBucket();
    out[rt].count += s.count || 0;
    out[rt].visa += s.visa || 0;
    out[rt].flight += s.flight || 0;
    out[rt].accommodation += s.accommodation || 0;
    out[rt].total += s.total || 0;
  });
  return out;
};

const accumulatePassengerCosts = async (reservationList, trip, hotels, rate) => {
  let membersTotal = 0;
  let vipCosts = 0;
  let visaTotal = 0;
  let flightTotal = 0;
  let meccaTotal = 0;
  let medinaTotal = 0;
  let passengers = 0;
  const byRoomType = createEmptyByRoomType();
  const memberLines = [];

  for (const reservation of reservationList) {
    const cost = await getReservationCost(reservation, trip, hotels, rate);
    membersTotal += cost.membersTotal;
    vipCosts += cost.vipCost;
    passengers += (reservation.members || []).length;

    for (const m of cost.memberBreakdowns) {
      visaTotal += m.visa;
      flightTotal += m.flight;
      meccaTotal += m.accommodationMecca;
      medinaTotal += m.accommodationMedina;

      const roomType = ['single', 'double', 'triple', 'quad'].includes(m.roomType)
        ? m.roomType
        : 'double';
      const bucket = byRoomType[roomType];
      bucket.count += 1;
      bucket.visa += m.visa;
      bucket.flight += m.flight;
      bucket.accommodation += m.accommodationTotal;
      bucket.total += m.total;

      memberLines.push({
        reservationId: reservation._id,
        reservationNumber: reservation.reservationNumber || '',
        name: m.name || '—',
        roomType,
        visa: m.visa,
        flight: m.flight,
        accommodationMecca: m.accommodationMecca,
        accommodationMedina: m.accommodationMedina,
        accommodation: m.accommodationTotal,
        total: m.total,
      });
    }
  }

  // passengerCosts = actual member costs + VIP (VIP shown separately in UI)
  const passengerCosts = membersTotal + vipCosts;

  return {
    passengerCosts,
    membersTotal,
    vipCosts,
    visa: visaTotal,
    flight: flightTotal,
    accommodationMecca: meccaTotal,
    accommodationMedina: medinaTotal,
    passengers,
    byRoomType,
    memberLines,
  };
};

const hasHotelNightCosts = (costs) => {
  const keyed = costs?.hotelNightCosts || {};
  return Object.values(keyed).some((tier) =>
    Object.values(tier || {}).some((v) => num(v) > 0)
  );
};

const hasCostsConfigured = (trip) => {
  const c = trip?.costs || {};
  return (
    num(c.flightTicketCostEgp) > 0
    || num(c.visaEgyptPortalEgp) > 0
    || num(c.visaSaudiAgentSar) > 0
    || num(c.supervisorDailyRateSar) > 0
    || hasHotelNightCosts(c)
    || Object.values(c.starRoomNightCosts || {}).some((tier) =>
      Object.values(tier || {}).some((v) => num(v) > 0)
    )
  );
};

const computeTripCostSummary = async (trip, hotels, reservations, expenses, rate) => {
  const activeReservations = reservations.filter((r) => r.status !== 'cancelled');
  const paidReservations = activeReservations.filter((r) => r.paymentStatus === 'paid');

  // Revenue: all active bookings (invoice-aligned for hub) + paid-only for legacy fields
  const bookedGrossRevenue = activeReservations.reduce(
    (sum, r) => sum + num(r.pricingSnapshot?.total),
    0
  );
  const bookedCollected = activeReservations.reduce(
    (sum, r) => sum + num(r.pricingSnapshot?.paid),
    0
  );
  const collectedRevenue = paidReservations.reduce(
    (sum, r) => sum + num(r.pricingSnapshot?.paid),
    0
  );
  const paidGrossRevenue = paidReservations.reduce(
    (sum, r) => sum + num(r.pricingSnapshot?.total),
    0
  );

  const [committed, realized] = await Promise.all([
    accumulatePassengerCosts(activeReservations, trip, hotels, rate),
    accumulatePassengerCosts(paidReservations, trip, hotels, rate),
  ]);

  const tripLevel = getTripLevelCostsEgp(trip, rate);
  const operationalExpenses = expenses.reduce((sum, e) => sum + num(e.amount), 0);
  const unitCost = getUnitCostBreakdown(trip, hotels, rate);

  const passengerCostsCommitted = committed.passengerCosts;
  const passengerCostsRealized = realized.passengerCosts;
  const tripCostsCommitted = passengerCostsCommitted + tripLevel.total;
  const tripCostsRealized = passengerCostsRealized + tripLevel.total;
  const totalCostsCommitted = tripCostsCommitted + operationalExpenses;
  const totalCostsRealized = tripCostsRealized + operationalExpenses;

  const hasPaidBookings = paidReservations.length > 0;
  const hasCommittedBookings = activeReservations.length > 0;

  // Primary profit: collected (all invoices paid amounts) vs committed costs
  // Prefer bookedCollected when available (active reservations); hub overrides with invoice collected
  const netProfitCommitted = bookedCollected - totalCostsCommitted;
  const netProfitRealized = hasPaidBookings
    ? collectedRevenue - totalCostsRealized
    : 0;
  const profitPercentCommitted = bookedCollected > 0
    ? Math.round((netProfitCommitted / bookedCollected) * 100)
    : 0;
  const profitPercentRealized = hasPaidBookings && collectedRevenue > 0
    ? Math.round((netProfitRealized / collectedRevenue) * 100)
    : 0;

  const grossMarginOnBooked = bookedGrossRevenue - totalCostsCommitted;
  const grossMarginPercentOnBooked = bookedGrossRevenue > 0
    ? Math.round((grossMarginOnBooked / bookedGrossRevenue) * 100)
    : 0;

  const costs = trip.costs || {};

  return {
    exchangeRate: rate,
    costsConfigured: hasCostsConfigured(trip),
    // Revenue (legacy paid-only + booked)
    collectedRevenue,
    grossRevenue: paidGrossRevenue,
    bookedGrossRevenue,
    bookedCollected,
    outstanding: bookedGrossRevenue - bookedCollected,
    paidReservationCount: paidReservations.length,
    paidPassengers: realized.passengers,
    hasPaidBookings,
    hasCommittedBookings,
    projectedTripCosts: tripLevel.total,
    passengerCount: {
      committed: committed.passengers,
      realized: realized.passengers,
    },
    // Quad reference for trip-form preview only — not finance "per pilgrim"
    unitCostPerPilgrim: unitCost,
    byRoomType: committed.byRoomType,
    byRoomTypeRealized: realized.byRoomType,
    vipCosts: committed.vipCosts,
    vipCostsRealized: realized.vipCosts,
    membersTotal: committed.membersTotal,
    memberLines: committed.memberLines,
    breakdown: {
      // Committed (primary) passenger breakdown
      visa: committed.visa,
      flight: committed.flight,
      accommodationMecca: committed.accommodationMecca,
      accommodationMedina: committed.accommodationMedina,
      passengerCosts: passengerCostsCommitted,
      passengerCostsCommitted,
      passengerCostsRealized,
      membersTotal: committed.membersTotal,
      vipCosts: committed.vipCosts,
      // Realized breakdown
      visaRealized: realized.visa,
      flightRealized: realized.flight,
      accommodationMeccaRealized: realized.accommodationMecca,
      accommodationMedinaRealized: realized.accommodationMedina,
      // Trip-level
      supervisor: tripLevel.supervisor,
      assistant: tripLevel.assistant,
      tripLevelCosts: tripLevel.total,
      operationalExpenses,
      tripCosts: tripCostsCommitted,
      // SAR originals for dual display
      supervisorSar: tripLevel.supervisorSar,
      assistantSar: tripLevel.assistantSar,
      tripLevelCostsSar: tripLevel.totalSar,
      visaSar: num(costs.visaSaudiAgentSar),
      visaEgpPortal: num(costs.visaEgyptPortalEgp),
      visaAgentEgp: unitCost.visaAgentEgp,
    },
    // Primary = committed
    tripCosts: tripCostsCommitted,
    tripCostsCommitted,
    tripCostsRealized,
    totalCosts: totalCostsCommitted,
    totalCostsCommitted,
    totalCostsRealized,
    passengerCosts: passengerCostsCommitted,
    passengerCostsCommitted,
    passengerCostsRealized,
    netProfit: netProfitCommitted,
    netProfitCommitted,
    netProfitRealized,
    profitPercent: profitPercentCommitted,
    profitPercentCommitted,
    profitPercentRealized,
    grossMarginOnBooked,
    grossMarginPercentOnBooked,
  };
};

const getTripCostSummary = async (tripId) => {
  const trip = await Trip.findById(tripId).lean();
  if (!trip) return null;

  const hotels = await Hotel.find({ tripId }).lean();
  const reservations = await Reservation.find({ tripId, status: 'active' }).lean();
  const expenses = await Expense.find({ tripId }).lean();
  const rate = await resolveExchangeRate(trip);

  return computeTripCostSummary(trip, hotels, reservations, expenses, rate);
};

const groupByTripId = (items, key = 'tripId') => {
  const map = {};
  for (const item of items) {
    const id = String(item[key]);
    if (!map[id]) map[id] = [];
    map[id].push(item);
  }
  return map;
};

const getAggregatedTripCosts = async (tripIds = []) => {
  if (!tripIds.length) return {};

  const objectIds = tripIds.map((id) => (
    typeof id === 'string' ? id : String(id)
  ));

  const trips = await Trip.find({ _id: { $in: objectIds } }).lean();
  if (!trips.length) return {};

  const tripObjectIds = trips.map((t) => t._id);
  const [hotels, reservations, expenses] = await Promise.all([
    Hotel.find({ tripId: { $in: tripObjectIds } }).lean(),
    Reservation.find({ tripId: { $in: tripObjectIds }, status: 'active' }).lean(),
    Expense.find({ tripId: { $in: tripObjectIds } }).lean(),
  ]);

  const hotelsByTrip = groupByTripId(hotels);
  const reservationsByTrip = groupByTripId(reservations);
  const expensesByTrip = groupByTripId(expenses);

  const result = {};
  await Promise.all(trips.map(async (trip) => {
    const id = String(trip._id);
    const rate = await resolveExchangeRate(trip);
    result[id] = await computeTripCostSummary(
      trip,
      hotelsByTrip[id] || [],
      reservationsByTrip[id] || [],
      expensesByTrip[id] || [],
      rate
    );
  }));

  return result;
};

const sumCostSummaries = (costMap = {}) => {
  const totals = {
    passengerCosts: 0,
    passengerCostsCommitted: 0,
    passengerCostsRealized: 0,
    membersTotal: 0,
    vipCosts: 0,
    tripLevelCosts: 0,
    tripLevelCostsSar: 0,
    tripCosts: 0,
    tripCostsCommitted: 0,
    tripCostsRealized: 0,
    operationalExpenses: 0,
    totalCosts: 0,
    totalCostsCommitted: 0,
    totalCostsRealized: 0,
    visa: 0,
    flight: 0,
    accommodationMecca: 0,
    accommodationMedina: 0,
    supervisor: 0,
    assistant: 0,
    supervisorSar: 0,
    assistantSar: 0,
    collectedRevenue: 0,
    netProfit: 0,
    netProfitCommitted: 0,
    netProfitRealized: 0,
    passengersCommitted: 0,
    passengersRealized: 0,
    visaSar: 0,
    visaEgpPortal: 0,
    visaAgentEgp: 0,
    exchangeRates: [],
    byRoomType: createEmptyByRoomType(),
  };

  Object.values(costMap).forEach((cs) => {
    if (!cs) return;
    const b = cs.breakdown || {};
    totals.passengerCosts += b.passengerCostsCommitted ?? b.passengerCosts ?? 0;
    totals.passengerCostsCommitted += b.passengerCostsCommitted ?? b.passengerCosts ?? 0;
    totals.passengerCostsRealized += b.passengerCostsRealized || 0;
    totals.membersTotal += cs.membersTotal || b.membersTotal || 0;
    totals.vipCosts += cs.vipCosts || b.vipCosts || 0;
    totals.tripLevelCosts += b.tripLevelCosts || 0;
    totals.tripLevelCostsSar += b.tripLevelCostsSar || 0;
    totals.tripCosts += cs.tripCostsCommitted ?? cs.tripCosts ?? 0;
    totals.tripCostsCommitted += cs.tripCostsCommitted ?? cs.tripCosts ?? 0;
    totals.tripCostsRealized += cs.tripCostsRealized || 0;
    totals.operationalExpenses += b.operationalExpenses || 0;
    totals.totalCosts += cs.totalCostsCommitted ?? cs.totalCosts ?? 0;
    totals.totalCostsCommitted += cs.totalCostsCommitted ?? cs.totalCosts ?? 0;
    totals.totalCostsRealized += cs.totalCostsRealized || 0;
    totals.visa += b.visa || 0;
    totals.flight += b.flight || 0;
    totals.accommodationMecca += b.accommodationMecca || 0;
    totals.accommodationMedina += b.accommodationMedina || 0;
    totals.supervisor += b.supervisor || 0;
    totals.assistant += b.assistant || 0;
    totals.supervisorSar += b.supervisorSar || 0;
    totals.assistantSar += b.assistantSar || 0;
    totals.collectedRevenue += cs.collectedRevenue || 0;
    totals.netProfit += cs.netProfitCommitted ?? cs.netProfit ?? 0;
    totals.netProfitCommitted += cs.netProfitCommitted ?? cs.netProfit ?? 0;
    totals.netProfitRealized += cs.netProfitRealized || 0;
    totals.passengersCommitted += cs.passengerCount?.committed || 0;
    totals.passengersRealized += cs.passengerCount?.realized || 0;
    if (cs.exchangeRate) totals.exchangeRates.push(cs.exchangeRate);
    if (b.visaSar) totals.visaSar = b.visaSar;
    if (b.visaEgpPortal) totals.visaEgpPortal = b.visaEgpPortal;
    if (b.visaAgentEgp) totals.visaAgentEgp = b.visaAgentEgp;
    mergeByRoomType(totals.byRoomType, cs.byRoomType);
  });

  return totals;
};

const getDefaultCostsFromSettings = async () => {
  const settings = await getAgencySettings();
  return {
    sarToEgpRate: num(settings.sarToEgpRate, 13.5),
    visaSaudiAgentSar: num(settings.defaultVisaSaudiAgentSar, 460),
    visaEgyptPortalEgp: num(settings.defaultVisaEgyptPortalEgp, 3000),
    flightTicketCostEgp: 0,
    supervisorDailyRateSar: 0,
    assistantDailyRateSar: 0,
    hotelNightCosts: {},
    starRoomNightCosts: {},
  };
};

const getDefaultDeductionsFromSettings = async () => {
  const settings = await getAgencySettings();
  return {
    flight: num(settings.defaultDeductionFlightEgp, 5500),
    visa: num(settings.defaultDeductionVisaEgp, 1500),
    transport: num(settings.defaultDeductionTransportEgp, 1000),
    haramainTrain: num(settings.defaultDeductionHaramainTrainEgp, 500),
  };
};

module.exports = {
  convertToEgp,
  sarToEgp,
  resolveExchangeRate,
  getHotelNightsByCity,
  getMemberCostBreakdown,
  getReservationCost,
  getTripLevelCostsEgp,
  getUnitCostBreakdown,
  getTripCostSummary,
  computeTripCostSummary,
  getAggregatedTripCosts,
  sumCostSummaries,
  createEmptyByRoomType,
  mergeByRoomType,
  hasCostsConfigured,
  getDefaultCostsFromSettings,
  getDefaultDeductionsFromSettings,
  getHotelRoomNightCost,
  getHotelStayCostEgp,
};
