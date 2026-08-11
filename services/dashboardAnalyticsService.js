const mongoose = require('mongoose');
const Trip = require('../models/Trip');
const Reservation = require('../models/Reservation');
const Room = require('../models/Room');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const Hotel = require('../models/Hotel');
const { getSeatStats } = require('./seatInventoryService');
const { buildRoomOccupancyStats } = require('../utils/roomStats');
const { getTripProfitability } = require('./financeService');

const buildDateRange = (fromDate, toDate) => {
  if (!fromDate && !toDate) return null;
  const range = {};
  if (fromDate) {
    const start = new Date(fromDate);
    start.setHours(0, 0, 0, 0);
    range.$gte = start;
  }
  if (toDate) {
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return range;
};

const buildDashboardFilters = (query = {}) => {
  const filters = {
    search: (query.search || '').trim() || null,
    tripId: null,
    paymentStatus: (query.paymentStatus || '').trim() || null,
    tripStatus: (query.tripStatus || '').trim() || null,
    fromDate: (query.fromDate || '').trim() || null,
    toDate: (query.toDate || '').trim() || null,
  };
  if (query.tripId && mongoose.Types.ObjectId.isValid(query.tripId)) {
    filters.tripId = query.tripId;
  }
  return filters;
};

const hasActiveFilters = (filters) => Boolean(
  filters.search
  || filters.tripId
  || filters.paymentStatus
  || filters.tripStatus
  || filters.fromDate
  || filters.toDate
);

const buildReservationMatch = (filters) => {
  const match = { status: 'active' };
  if (filters.tripId) match.tripId = new mongoose.Types.ObjectId(filters.tripId);
  if (filters.paymentStatus) match.paymentStatus = filters.paymentStatus;
  const dateRange = buildDateRange(filters.fromDate, filters.toDate);
  if (dateRange) match.bookingDate = dateRange;
  if (filters.search) {
    match.$or = [
      { primaryCustomerName: new RegExp(filters.search, 'i') },
      { primaryPhone: new RegExp(filters.search, 'i') },
      { reservationNumber: new RegExp(filters.search, 'i') },
    ];
  }
  return match;
};

const buildInvoiceMatch = (filters) => {
  const match = {};
  if (filters.tripId) match.tripId = new mongoose.Types.ObjectId(filters.tripId);
  const dateRange = buildDateRange(filters.fromDate, filters.toDate);
  if (dateRange) match.issueDate = dateRange;
  if (filters.search) {
    match.$or = [
      { invoiceNumber: new RegExp(filters.search, 'i') },
      { customerName: new RegExp(filters.search, 'i') },
    ];
  }
  return match;
};

const buildPaymentMatch = (filters) => {
  const match = {};
  if (filters.tripId) match.tripId = new mongoose.Types.ObjectId(filters.tripId);
  const dateRange = buildDateRange(filters.fromDate, filters.toDate);
  if (dateRange) match.paymentDate = dateRange;
  return match;
};

const buildExpenseMatch = (filters) => {
  const match = {};
  if (filters.tripId) match.tripId = new mongoose.Types.ObjectId(filters.tripId);
  const dateRange = buildDateRange(filters.fromDate, filters.toDate);
  if (dateRange) match.expenseDate = dateRange;
  return match;
};

const buildTripFilter = (filters) => {
  const match = {};
  if (filters.tripStatus) match.status = filters.tripStatus;
  if (filters.tripId) match._id = new mongoose.Types.ObjectId(filters.tripId);
  if (filters.search) {
    match.$or = [
      { name: new RegExp(filters.search, 'i') },
      { airline: new RegExp(filters.search, 'i') },
      { guide: new RegExp(filters.search, 'i') },
      { cities: new RegExp(filters.search, 'i') },
    ];
  }
  return match;
};

const getDashboardKpis = async (filters, today) => {
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);

  const reservationMatch = buildReservationMatch(filters);
  const invoiceMatch = buildInvoiceMatch(filters);
  const expenseMatch = buildExpenseMatch(filters);
  const tripFilter = buildTripFilter(filters);

  const openTripFilter = {
    status: 'active',
    endDate: { $gte: today },
    ...tripFilter,
  };
  if (tripFilter._id) openTripFilter._id = tripFilter._id;

  const [
    activeTrips,
    upcomingTrips,
    todayReservations,
    monthReservations,
    lastMonthReservations,
    totalPassengersAgg,
    unpaidInvoices,
    invoiceAgg,
    expenseAgg,
    rooms,
    allTripsForSeats,
  ] = await Promise.all([
    Trip.countDocuments({ status: 'active', ...tripFilter }),
    Trip.countDocuments({ status: 'active', startDate: { $gte: today }, ...tripFilter }),
    Reservation.countDocuments({ bookingDate: { $gte: today, $lt: tomorrow }, status: 'active' }),
    Reservation.countDocuments({ bookingDate: { $gte: monthStart }, status: 'active' }),
    Reservation.countDocuments({ bookingDate: { $gte: lastMonthStart, $lte: lastMonthEnd }, status: 'active' }),
    Reservation.aggregate([
      { $match: reservationMatch },
      { $project: { count: { $size: '$members' } } },
      { $group: { _id: null, total: { $sum: '$count' } } },
    ]),
    Invoice.countDocuments({ status: { $in: ['unpaid', 'partial'] }, ...invoiceMatch }),
    Invoice.aggregate([
      { $match: invoiceMatch },
      {
        $group: {
          _id: null,
          grossRevenue: { $sum: '$total' },
          collected: { $sum: '$paid' },
          outstanding: { $sum: '$balance' },
        },
      },
    ]),
    Expense.aggregate([
      { $match: expenseMatch },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Room.find(),
    Trip.find({ status: 'active', ...tripFilter }),
  ]);

  const inv = invoiceAgg[0] || {};
  const totalExpenses = expenseAgg[0]?.total || 0;
  const collected = inv.collected || 0;
  const roomStats = buildRoomOccupancyStats(rooms);
  const occupancyPercent = roomStats.percent;

  let totalSeats = 0;
  let reservedSeats = 0;
  allTripsForSeats.forEach((trip) => {
    const s = getSeatStats(trip);
    totalSeats += s.total || 0;
    reservedSeats += s.reserved || 0;
  });
  const seatFillPercent = totalSeats ? Math.round((reservedSeats / totalSeats) * 100) : 0;

  const reservationTrend = monthReservations - lastMonthReservations;

  return {
    activeTrips,
    upcomingTrips,
    todayReservations,
    monthReservations,
    reservationTrend,
    totalPassengers: totalPassengersAgg[0]?.total || 0,
    totalRevenue: inv.grossRevenue || 0,
    collectedRevenue: collected,
    outstanding: inv.outstanding || 0,
    netProfit: collected - totalExpenses,
    unpaidInvoices,
    totalExpenses,
    occupancyPercent,
    seatFillPercent,
    openTripFilter,
    tripFilter,
  };
};

const getChartSeries = async (filters) => {
  const reservationMatch = buildReservationMatch(filters);
  const invoiceMatch = buildInvoiceMatch(filters);
  const paymentMatch = buildPaymentMatch(filters);
  const expenseMatch = buildExpenseMatch(filters);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eightWeeksAgo = new Date(today);
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

  const [
    monthlySales,
    monthlyExpenses,
    monthlyInvoices,
    paymentMethods,
    reservationStatuses,
    weeklyBookings,
    outstandingInvoices,
    openTrips,
  ] = await Promise.all([
    Reservation.aggregate([
      { $match: reservationMatch },
      {
        $group: {
          _id: { year: { $year: '$bookingDate' }, month: { $month: '$bookingDate' } },
          total: { $sum: '$pricingSnapshot.total' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 },
    ]),
    Expense.aggregate([
      { $match: expenseMatch },
      {
        $group: {
          _id: { year: { $year: '$expenseDate' }, month: { $month: '$expenseDate' } },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 },
    ]),
    Invoice.aggregate([
      { $match: invoiceMatch },
      {
        $group: {
          _id: { year: { $year: '$issueDate' }, month: { $month: '$issueDate' } },
          invoiced: { $sum: '$total' },
          collected: { $sum: '$paid' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
      { $limit: 12 },
    ]),
    Payment.aggregate([
      { $match: paymentMatch },
      { $group: { _id: '$method', count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]),
    Reservation.aggregate([
      { $match: reservationMatch },
      { $group: { _id: '$paymentStatus', count: { $sum: 1 } } },
    ]),
    Reservation.aggregate([
      { $match: { ...reservationMatch, bookingDate: { $gte: eightWeeksAgo } } },
      {
        $group: {
          _id: { year: { $year: '$bookingDate' }, week: { $isoWeek: '$bookingDate' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.week': 1 } },
      { $limit: 8 },
    ]),
    Invoice.find({ balance: { $gt: 0 }, ...invoiceMatch }).select('balance issueDate'),
    Trip.find({ status: 'active', endDate: { $gte: today } }).sort({ startDate: 1 }),
  ]);

  const revenueExpenseChart = monthlySales.map((s) => {
    const exp = monthlyExpenses.find(
      (e) => e._id.year === s._id.year && e._id.month === s._id.month
    );
    return {
      month: s._id.month,
      year: s._id.year,
      revenue: s.total,
      expenses: exp?.total || 0,
    };
  });

  const collectionRateChart = monthlyInvoices.map((m) => ({
    month: m._id.month,
    year: m._id.year,
    rate: m.invoiced > 0 ? Math.round((m.collected / m.invoiced) * 100) : 0,
    invoiced: m.invoiced,
    collected: m.collected,
  }));

  const tripProfitability = await Promise.all(
    openTrips.slice(0, 10).map(async (trip) => {
      const p = await getTripProfitability(trip._id);
      return { name: trip.name, netProfit: p.netProfit, collected: p.collectedRevenue };
    })
  );
  tripProfitability.sort((a, b) => b.netProfit - a.netProfit);

  const capacityOverview = openTrips.slice(0, 8).map((trip) => {
    const s = getSeatStats(trip);
    return { name: trip.name, percentSold: s.percentSold || 0, remaining: s.remaining };
  });

  const agingBuckets = { '0-7': 0, '8-30': 0, '31-60': 0, '60+': 0 };
  outstandingInvoices.forEach((inv) => {
    const days = Math.floor((today - new Date(inv.issueDate)) / (1000 * 60 * 60 * 24));
    const amt = inv.balance || 0;
    if (days <= 7) agingBuckets['0-7'] += amt;
    else if (days <= 30) agingBuckets['8-30'] += amt;
    else if (days <= 60) agingBuckets['31-60'] += amt;
    else agingBuckets['60+'] += amt;
  });

  return {
    monthlySales,
    revenueExpenseChart,
    collectionRateChart,
    paymentMethods,
    reservationStatuses,
    weeklyBookings,
    tripProfitability: tripProfitability.slice(0, 6),
    capacityOverview,
    outstandingAging: [
      { label: '0-7 أيام', amount: agingBuckets['0-7'] },
      { label: '8-30 يوم', amount: agingBuckets['8-30'] },
      { label: '31-60 يوم', amount: agingBuckets['31-60'] },
      { label: '60+ يوم', amount: agingBuckets['60+'] },
    ],
  };
};

const buildTripCards = async (trips, { trackSeats = false } = {}) => {
  const seatAlerts = [];
  let totalSeats = 0;
  let reservedSeats = 0;

  const cards = await Promise.all(
    trips.map(async (trip) => {
      const hotelCount = await Hotel.countDocuments({ tripId: trip._id });
      const profitability = await getTripProfitability(trip._id);
      const seatStats = getSeatStats(trip);
      if (trackSeats) {
        totalSeats += seatStats.total || 0;
        reservedSeats += seatStats.reserved || 0;
        if (seatStats.isLow || seatStats.isOverbooked) {
          seatAlerts.push({ trip, seatStats });
        }
      }
      return { trip, hotelCount, profitability, seatStats };
    })
  );

  return { cards, seatAlerts, totalSeats, reservedSeats };
};

const getActivityPanels = async (filters, today) => {
  const reservationMatch = buildReservationMatch(filters);
  const paymentMatch = buildPaymentMatch(filters);
  const invoiceMatch = buildInvoiceMatch(filters);
  const weekAhead = new Date(today);
  weekAhead.setDate(weekAhead.getDate() + 14);

  const tripFilter = buildTripFilter(filters);

  const [
    recentPayments,
    upcomingDepartures,
    recentReservations,
    pendingInvoices,
    allTrips,
    paymentStats,
    reservationStats,
  ] = await Promise.all([
    Payment.find(paymentMatch).sort({ paymentDate: -1 }).limit(10),
    Trip.find({
      status: 'active',
      startDate: { $gte: today, $lte: weekAhead },
      ...tripFilter,
    }).sort({ startDate: 1 }).limit(8),
    Reservation.find(reservationMatch)
      .populate('tripId', 'name')
      .sort({ bookingDate: -1 })
      .limit(10)
      .select('reservationNumber primaryCustomerName bookingDate paymentStatus pricingSnapshot tripId'),
    Invoice.find({ balance: { $gt: 0 }, ...invoiceMatch })
      .populate('tripId', 'name')
      .sort({ balance: -1 })
      .limit(8)
      .select('invoiceNumber customerName balance total paid status issueDate tripId'),
    Trip.find(tripFilter).sort({ status: 1, createdAt: -1, startDate: -1 }),
    Payment.aggregate([
      { $match: paymentMatch },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Reservation.aggregate([
      { $match: reservationMatch },
      {
        $group: {
          _id: '$paymentStatus',
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const { cards: tripCards } = await buildTripCards(allTrips);
  const topTrips = [...tripCards]
    .sort((a, b) => b.profitability.collectedRevenue - a.profitability.collectedRevenue)
    .slice(0, 6);

  const openTripsList = tripCards
    .filter(({ trip }) => trip.status === 'active' && new Date(trip.endDate) >= today)
    .slice(0, 6);

  const paymentSummary = {
    total: paymentStats[0]?.total || 0,
    count: paymentStats[0]?.count || 0,
    recentTotal: recentPayments.reduce((s, p) => s + (p.amount || 0), 0),
  };

  const reservationSummary = {
    total: recentReservations.length,
    unpaid: reservationStats.find((r) => r._id === 'unpaid')?.count || 0,
    partial: reservationStats.find((r) => r._id === 'partial')?.count || 0,
    paid: reservationStats.find((r) => r._id === 'paid')?.count || 0,
  };

  const invoiceSummary = {
    count: pendingInvoices.length,
    totalOutstanding: pendingInvoices.reduce((s, i) => s + (i.balance || 0), 0),
  };

  return {
    recentPayments,
    upcomingDepartures,
    recentReservations,
    pendingInvoices,
    topTrips,
    openTripsList,
    paymentSummary,
    reservationSummary,
    invoiceSummary,
  };
};

const getDashboardData = async (query = {}) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const filters = buildDashboardFilters(query);

  const kpiData = await getDashboardKpis(filters, today);
  const charts = await getChartSeries(filters);
  const activity = await getActivityPanels(filters, today);

  const [allTrips, openTrips] = await Promise.all([
    Trip.find(kpiData.tripFilter).sort({ status: 1, createdAt: -1, startDate: -1 }),
    Trip.find(kpiData.openTripFilter).sort({ createdAt: -1, startDate: 1 }),
  ]);

  const { cards: tripCards, seatAlerts } = await buildTripCards(allTrips, { trackSeats: true });
  const { cards: openTripCards } = await buildTripCards(openTrips);

  const departureAlerts = openTrips
    .filter((t) => {
      const days = Math.ceil((new Date(t.startDate) - today) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 7;
    })
    .map((trip) => ({ trip, daysUntil: Math.ceil((new Date(trip.startDate) - today) / (1000 * 60 * 60 * 24)) }));

  return {
    kpis: {
      activeTrips: kpiData.activeTrips,
      upcomingTrips: kpiData.upcomingTrips,
      todayReservations: kpiData.todayReservations,
      monthReservations: kpiData.monthReservations,
      reservationTrend: kpiData.reservationTrend,
      totalPassengers: kpiData.totalPassengers,
      totalRevenue: kpiData.totalRevenue,
      collectedRevenue: kpiData.collectedRevenue,
      outstanding: kpiData.outstanding,
      netProfit: kpiData.netProfit,
      unpaidInvoices: kpiData.unpaidInvoices,
      totalExpenses: kpiData.totalExpenses,
      occupancyPercent: kpiData.occupancyPercent,
      seatFillPercent: kpiData.seatFillPercent,
    },
    tripCards,
    openTripCards,
    topTrips: activity.topTrips,
    seatAlerts,
    departureAlerts,
    recentPayments: activity.recentPayments,
    upcomingDepartures: activity.upcomingDepartures,
    recentReservations: activity.recentReservations,
    pendingInvoices: activity.pendingInvoices,
    openTripsList: activity.openTripsList,
    paymentSummary: activity.paymentSummary,
    reservationSummary: activity.reservationSummary,
    invoiceSummary: activity.invoiceSummary,
    monthlySales: charts.monthlySales,
    revenueExpenseChart: charts.revenueExpenseChart,
    paymentMethods: charts.paymentMethods,
    reservationStatuses: charts.reservationStatuses,
    collectionRateChart: charts.collectionRateChart,
    weeklyBookings: charts.weeklyBookings,
    tripProfitability: charts.tripProfitability,
    capacityOverview: charts.capacityOverview,
    outstandingAging: charts.outstandingAging,
    filters,
    hasActiveFilters: hasActiveFilters(filters),
  };
};

const buildQueryString = (filters, overrides = {}) => {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.search) params.set('search', merged.search);
  if (merged.tripId) params.set('tripId', merged.tripId);
  if (merged.paymentStatus) params.set('paymentStatus', merged.paymentStatus);
  if (merged.tripStatus) params.set('tripStatus', merged.tripStatus);
  if (merged.fromDate) params.set('fromDate', merged.fromDate);
  if (merged.toDate) params.set('toDate', merged.toDate);
  const str = params.toString();
  return str ? `?${str}` : '';
};

module.exports = {
  buildDashboardFilters,
  hasActiveFilters,
  buildQueryString,
  buildDateRange,
  getDashboardData,
  buildTripCards,
  buildTripFilter,
};
