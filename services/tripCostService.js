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
  let supervisor = 0;
  let assistant = 0;

  if (trip.supervisorId && num(costs.supervisorDailyRateSar) > 0) {
    supervisor = sarToEgp(num(costs.supervisorDailyRateSar) * days, rate);
  }
  if (trip.assistantSupervisorId && num(costs.assistantDailyRateSar) > 0) {
    assistant = sarToEgp(num(costs.assistantDailyRateSar) * days, rate);
  }

  return {
    supervisor,
    assistant,
    total: supervisor + assistant,
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
  const paidReservations = reservations.filter((r) => r.paymentStatus === 'paid');
  const collectedRevenue = paidReservations.reduce(
    (sum, r) => sum + num(r.pricingSnapshot?.paid),
    0
  );
  const grossRevenue = paidReservations.reduce(
    (sum, r) => sum + num(r.pricingSnapshot?.total),
    0
  );

  let passengerCosts = 0;
  let visaTotal = 0;
  let flightTotal = 0;
  let meccaTotal = 0;
  let medinaTotal = 0;
  let paidPassengers = 0;

  for (const reservation of paidReservations) {
    const cost = await getReservationCost(reservation, trip, hotels, rate);
    passengerCosts += cost.total;
    paidPassengers += (reservation.members || []).length;
    for (const m of cost.memberBreakdowns) {
      visaTotal += m.visa;
      flightTotal += m.flight;
      meccaTotal += m.accommodationMecca;
      medinaTotal += m.accommodationMedina;
    }
  }

  const tripLevel = getTripLevelCostsEgp(trip, rate);
  const operationalExpenses = expenses.reduce((sum, e) => sum + num(e.amount), 0);
  const tripCosts = passengerCosts + tripLevel.total;
  const totalCosts = tripCosts + operationalExpenses;
  const hasPaidBookings = paidReservations.length > 0;
  const netProfit = hasPaidBookings ? collectedRevenue - totalCosts : 0;
  const profitPercent = hasPaidBookings && collectedRevenue > 0
    ? Math.round((netProfit / collectedRevenue) * 100)
    : 0;

  return {
    exchangeRate: rate,
    costsConfigured: hasCostsConfigured(trip),
    collectedRevenue,
    grossRevenue,
    outstanding: grossRevenue - collectedRevenue,
    paidReservationCount: paidReservations.length,
    paidPassengers,
    hasPaidBookings,
    projectedTripCosts: tripLevel.total,
    breakdown: {
      visa: visaTotal,
      flight: flightTotal,
      accommodationMecca: meccaTotal,
      accommodationMedina: medinaTotal,
      passengerCosts,
      supervisor: tripLevel.supervisor,
      assistant: tripLevel.assistant,
      tripLevelCosts: tripLevel.total,
      operationalExpenses,
      tripCosts,
    },
    tripCosts,
    totalCosts,
    netProfit,
    profitPercent,
    costPerPaidPassenger: paidPassengers ? Math.round(passengerCosts / paidPassengers) : 0,
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
    tripLevelCosts: 0,
    tripCosts: 0,
    operationalExpenses: 0,
    totalCosts: 0,
    visa: 0,
    flight: 0,
    accommodationMecca: 0,
    accommodationMedina: 0,
    supervisor: 0,
    assistant: 0,
    collectedRevenue: 0,
    netProfit: 0,
  };

  Object.values(costMap).forEach((cs) => {
    if (!cs) return;
    totals.passengerCosts += cs.breakdown?.passengerCosts || 0;
    totals.tripLevelCosts += cs.breakdown?.tripLevelCosts || 0;
    totals.tripCosts += cs.tripCosts || 0;
    totals.operationalExpenses += cs.breakdown?.operationalExpenses || 0;
    totals.totalCosts += cs.totalCosts || 0;
    totals.visa += cs.breakdown?.visa || 0;
    totals.flight += cs.breakdown?.flight || 0;
    totals.accommodationMecca += cs.breakdown?.accommodationMecca || 0;
    totals.accommodationMedina += cs.breakdown?.accommodationMedina || 0;
    totals.supervisor += cs.breakdown?.supervisor || 0;
    totals.assistant += cs.breakdown?.assistant || 0;
    totals.collectedRevenue += cs.collectedRevenue || 0;
    totals.netProfit += cs.netProfit || 0;
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
  getTripCostSummary,
  computeTripCostSummary,
  getAggregatedTripCosts,
  sumCostSummaries,
  hasCostsConfigured,
  getDefaultCostsFromSettings,
  getDefaultDeductionsFromSettings,
  getHotelRoomNightCost,
  getHotelStayCostEgp,
};
