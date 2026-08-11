const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const Trip = require('../models/Trip');
const Reservation = require('../models/Reservation');
const { paymentMethodLabel, expenseCategoryLabel, statusLabel } = require('../utils/helpers');
const { getAggregatedTripCosts, sumCostSummaries } = require('./tripCostService');

const PAGE_SIZE = 25;

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

const buildFinanceFilters = (query = {}) => {
  const filters = {
    tripId: null,
    fromDate: (query.fromDate || '').trim() || null,
    toDate: (query.toDate || '').trim() || null,
    invoiceStatus: (query.invoiceStatus || '').trim() || null,
    paymentMethod: (query.paymentMethod || '').trim() || null,
    expenseCategory: (query.expenseCategory || '').trim() || null,
    tripStatus: (query.tripStatus || '').trim() || null,
    costStatus: ['configured', 'missing'].includes(query.costStatus) ? query.costStatus : null,
    search: (query.search || '').trim() || null,
    tab: ['invoices', 'payments', 'expenses', 'outstanding'].includes(query.tab) ? query.tab : 'invoices',
    page: Math.max(1, parseInt(query.page, 10) || 1),
  };

  if (query.tripId && mongoose.Types.ObjectId.isValid(query.tripId)) {
    filters.tripId = query.tripId;
  }

  return filters;
};

const hasActiveFilters = (filters) => Boolean(
  filters.tripId
  || filters.fromDate
  || filters.toDate
  || filters.invoiceStatus
  || filters.paymentMethod
  || filters.expenseCategory
  || filters.tripStatus
  || filters.costStatus
  || filters.search
);

const buildTripQuery = (filters) => {
  const query = {};
  if (filters.tripId) query._id = filters.tripId;
  if (filters.tripStatus) query.status = filters.tripStatus;
  return query;
};

const getRelevantTripIds = async (filters, tripSummaries = null) => {
  if (tripSummaries) {
    return tripSummaries.map((s) => s.trip._id);
  }
  const trips = await Trip.find(buildTripQuery(filters)).select('_id');
  return trips.map((t) => t._id);
};

const buildInvoiceMatch = (filters, { outstandingOnly = false } = {}) => {
  const match = {};
  if (filters.tripId) match.tripId = new mongoose.Types.ObjectId(filters.tripId);
  if (filters.invoiceStatus) match.status = filters.invoiceStatus;
  if (outstandingOnly) match.balance = { $gt: 0 };
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
  if (filters.paymentMethod) match.method = filters.paymentMethod;
  const dateRange = buildDateRange(filters.fromDate, filters.toDate);
  if (dateRange) match.paymentDate = dateRange;
  if (filters.search) {
    match.$or = [
      { paymentNumber: new RegExp(filters.search, 'i') },
      { notes: new RegExp(filters.search, 'i') },
      { reference: new RegExp(filters.search, 'i') },
    ];
  }
  return match;
};

const buildExpenseMatch = (filters) => {
  const match = {};
  if (filters.tripId) match.tripId = new mongoose.Types.ObjectId(filters.tripId);
  if (filters.expenseCategory) match.category = filters.expenseCategory;
  const dateRange = buildDateRange(filters.fromDate, filters.toDate);
  if (dateRange) match.expenseDate = dateRange;
  if (filters.search) {
    match.$or = [
      { description: new RegExp(filters.search, 'i') },
      { supplier: new RegExp(filters.search, 'i') },
      { reference: new RegExp(filters.search, 'i') },
    ];
  }
  return match;
};

const getFinanceSummary = async (filters) => {
  const invoiceMatch = buildInvoiceMatch(filters);
  const paymentMatch = buildPaymentMatch(filters);
  const expenseMatch = buildExpenseMatch(filters);

  const [invoiceAgg, expenseAgg, paymentCount, unpaidCount, partialCount] = await Promise.all([
    Invoice.aggregate([
      { $match: invoiceMatch },
      {
        $group: {
          _id: null,
          grossRevenue: { $sum: '$total' },
          collected: { $sum: '$paid' },
          outstanding: { $sum: '$balance' },
          invoiceCount: { $sum: 1 },
        },
      },
    ]),
    Expense.aggregate([
      { $match: expenseMatch },
      { $group: { _id: null, totalExpenses: { $sum: '$amount' }, expenseCount: { $sum: 1 } } },
    ]),
    Payment.countDocuments(paymentMatch),
    Invoice.countDocuments({ ...invoiceMatch, status: 'unpaid' }),
    Invoice.countDocuments({ ...invoiceMatch, status: 'partial' }),
  ]);

  const inv = invoiceAgg[0] || {};
  const exp = expenseAgg[0] || {};
  const collected = inv.collected || 0;
  const totalExpenses = exp.totalExpenses || 0;

  return {
    grossRevenue: inv.grossRevenue || 0,
    collected,
    outstanding: inv.outstanding || 0,
    totalExpenses,
    netProfit: collected - totalExpenses,
    invoiceCount: inv.invoiceCount || 0,
    paymentCount,
    expenseCount: exp.expenseCount || 0,
    unpaidCount,
    partialCount,
    pendingCount: unpaidCount + partialCount,
  };
};

const getEnterpriseFinanceSummary = async (filters, tripSummaries = null) => {
  const base = await getFinanceSummary(filters);
  const tripIds = await getRelevantTripIds(filters, tripSummaries);
  const costMap = await getAggregatedTripCosts(tripIds);
  const costTotals = sumCostSummaries(costMap);

  const operationalExpenses = base.totalExpenses;
  const passengerCosts = costTotals.passengerCostsCommitted;
  const passengerCostsRealized = costTotals.passengerCostsRealized;
  const tripLevelCosts = costTotals.tripLevelCosts;
  const tripCosts = costTotals.tripCostsCommitted;
  const totalCosts = costTotals.totalCostsCommitted;
  // Realized total uses invoice operational expenses + realized trip costs
  const totalCostsRealized = costTotals.tripCostsRealized + operationalExpenses;
  const cashProfit = base.collected - operationalExpenses;
  const trueProfit = base.collected - totalCosts;
  const trueProfitRealized = base.collected - totalCostsRealized;
  const collectionRate = base.grossRevenue > 0
    ? Math.round((base.collected / base.grossRevenue) * 100)
    : 0;
  const marginPercent = base.collected > 0
    ? Math.round((trueProfit / base.collected) * 100)
    : 0;
  const grossMarginOnBooked = base.grossRevenue - totalCosts;
  const grossMarginPercentOnBooked = base.grossRevenue > 0
    ? Math.round((grossMarginOnBooked / base.grossRevenue) * 100)
    : 0;

  const uniqueRates = [...new Set(costTotals.exchangeRates.filter(Boolean))];
  const primaryRate = uniqueRates.length === 1
    ? uniqueRates[0]
    : (uniqueRates[0] || null);

  // Prefer unit cost from first configured trip in map
  let unitCostPerPilgrim = null;
  for (const cs of Object.values(costMap)) {
    if (cs?.unitCostPerPilgrim?.total > 0) {
      unitCostPerPilgrim = cs.unitCostPerPilgrim;
      break;
    }
  }

  return {
    ...base,
    collectionRate,
    operationalExpenses,
    passengerCosts,
    passengerCostsRealized,
    tripLevelCosts,
    tripLevelCostsSar: costTotals.tripLevelCostsSar,
    supervisorSar: costTotals.supervisorSar,
    assistantSar: costTotals.assistantSar,
    tripCosts,
    tripCostsRealized: costTotals.tripCostsRealized,
    totalCosts,
    totalCostsRealized,
    cashProfit,
    trueProfit,
    trueProfitRealized,
    marginPercent,
    grossMarginOnBooked,
    grossMarginPercentOnBooked,
    totalPassengers: costTotals.passengersCommitted,
    passengersRealized: costTotals.passengersRealized,
    costPerPassenger: costTotals.passengersCommitted
      ? Math.round(passengerCosts / costTotals.passengersCommitted)
      : (unitCostPerPilgrim?.total || 0),
    exchangeRate: primaryRate,
    exchangeRates: uniqueRates,
    unitCostPerPilgrim,
    costBreakdown: {
      visa: costTotals.visa,
      flight: costTotals.flight,
      accommodationMecca: costTotals.accommodationMecca,
      accommodationMedina: costTotals.accommodationMedina,
      supervisor: costTotals.supervisor,
      assistant: costTotals.assistant,
      supervisorSar: costTotals.supervisorSar,
      assistantSar: costTotals.assistantSar,
      tripLevelCostsSar: costTotals.tripLevelCostsSar,
      visaSar: costTotals.visaSar,
      visaEgpPortal: costTotals.visaEgpPortal,
      visaAgentEgp: costTotals.visaAgentEgp,
      operationalExpenses,
    },
    netProfit: trueProfit,
  };
};

const getTripSummaries = async (filters) => {
  const invoiceMatch = filters.tripId
    ? { tripId: new mongoose.Types.ObjectId(filters.tripId) }
    : {};
  const expenseMatch = filters.tripId
    ? { tripId: new mongoose.Types.ObjectId(filters.tripId) }
    : {};

  const dateRange = buildDateRange(filters.fromDate, filters.toDate);
  if (dateRange) {
    invoiceMatch.issueDate = dateRange;
    expenseMatch.expenseDate = dateRange;
  }

  const tripQuery = buildTripQuery(filters);

  const [invoiceByTrip, expenseByTrip, trips, reservationStats] = await Promise.all([
    Invoice.aggregate([
      { $match: invoiceMatch },
      {
        $group: {
          _id: '$tripId',
          grossRevenue: { $sum: '$total' },
          collected: { $sum: '$paid' },
          outstanding: { $sum: '$balance' },
          invoiceCount: { $sum: 1 },
        },
      },
    ]),
    Expense.aggregate([
      { $match: expenseMatch },
      { $group: { _id: '$tripId', totalExpenses: { $sum: '$amount' } } },
    ]),
    Trip.find(tripQuery)
      .sort({ status: 1, createdAt: -1, startDate: -1 })
      .select('name startDate status createdAt costs'),
    Reservation.aggregate([
      { $match: { status: 'active', ...(filters.tripId ? { tripId: new mongoose.Types.ObjectId(filters.tripId) } : {}) } },
      {
        $group: {
          _id: { tripId: '$tripId', paymentStatus: '$paymentStatus' },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const invMap = Object.fromEntries(invoiceByTrip.map((r) => [String(r._id), r]));
  const expMap = Object.fromEntries(expenseByTrip.map((r) => [String(r._id), r]));

  const resStatsMap = {};
  reservationStats.forEach((r) => {
    const tripId = String(r._id.tripId);
    if (!resStatsMap[tripId]) {
      resStatsMap[tripId] = { total: 0, paid: 0, partial: 0, unpaid: 0 };
    }
    const status = r._id.paymentStatus;
    resStatsMap[tripId][status] = (resStatsMap[tripId][status] || 0) + r.count;
    resStatsMap[tripId].total += r.count;
  });

  const candidateTrips = trips.filter((trip) => {
    const inv = invMap[String(trip._id)] || {};
    const exp = expMap[String(trip._id)] || {};
    const stats = resStatsMap[String(trip._id)] || {};
    return (
      (inv.grossRevenue || 0) > 0
      || (exp.totalExpenses || 0) > 0
      || (inv.invoiceCount || 0) > 0
      || (stats.total || 0) > 0
    );
  });

  const costMap = await getAggregatedTripCosts(candidateTrips.map((t) => t._id));

  const summaries = candidateTrips.map((trip) => {
    const inv = invMap[String(trip._id)] || {};
    const exp = expMap[String(trip._id)] || {};
    const collected = inv.collected || 0;
    const grossRevenue = inv.grossRevenue || 0;
    const operationalExpenses = exp.totalExpenses || 0;
    const cs = costMap[String(trip._id)] || {};
    const breakdown = cs.breakdown || {};
    const passengerCosts = cs.passengerCostsCommitted ?? breakdown.passengerCosts ?? 0;
    const passengerCostsRealized = cs.passengerCostsRealized ?? 0;
    const tripLevelCosts = breakdown.tripLevelCosts || 0;
    const tripCosts = cs.tripCostsCommitted ?? cs.tripCosts ?? 0;
    const totalCosts = cs.totalCostsCommitted ?? cs.totalCosts ?? (tripCosts + operationalExpenses);
    const totalCostsRealized = cs.totalCostsRealized ?? (passengerCostsRealized + tripLevelCosts + operationalExpenses);
    const trueProfit = collected - totalCosts;
    const trueProfitRealized = collected - totalCostsRealized;
    const marginPercent = collected > 0 ? Math.round((trueProfit / collected) * 100) : 0;
    const grossMarginOnBooked = grossRevenue - totalCosts;
    const grossMarginPercentOnBooked = grossRevenue > 0
      ? Math.round((grossMarginOnBooked / grossRevenue) * 100)
      : 0;
    const stats = resStatsMap[String(trip._id)] || { total: 0, paid: 0, partial: 0, unpaid: 0 };
    const passengersCommitted = cs.passengerCount?.committed || 0;

    return {
      trip,
      grossRevenue,
      collected,
      outstanding: inv.outstanding || 0,
      operationalExpenses,
      passengerCosts,
      passengerCostsRealized,
      tripLevelCosts,
      tripLevelCostsSar: breakdown.tripLevelCostsSar || 0,
      supervisorSar: breakdown.supervisorSar || 0,
      assistantSar: breakdown.assistantSar || 0,
      tripCosts,
      tripCostsRealized: cs.tripCostsRealized || 0,
      totalCosts,
      totalCostsRealized,
      totalExpenses: operationalExpenses,
      netProfit: trueProfit,
      trueProfit,
      trueProfitRealized,
      cashProfit: collected - operationalExpenses,
      marginPercent,
      grossMarginOnBooked,
      grossMarginPercentOnBooked,
      invoiceCount: inv.invoiceCount || 0,
      reservationCount: stats.total,
      reservationStats: stats,
      passengersCommitted,
      passengersRealized: cs.passengerCount?.realized || 0,
      costPerPassenger: passengersCommitted
        ? Math.round(passengerCosts / passengersCommitted)
        : (cs.unitCostPerPilgrim?.total || 0),
      exchangeRate: cs.exchangeRate || null,
      unitCostPerPilgrim: cs.unitCostPerPilgrim || null,
      costsConfigured: cs.costsConfigured || false,
      hasPaidBookings: cs.hasPaidBookings || false,
      projectedTripCosts: cs.projectedTripCosts || 0,
      breakdown: {
        visa: breakdown.visa || 0,
        flight: breakdown.flight || 0,
        accommodationMecca: breakdown.accommodationMecca || 0,
        accommodationMedina: breakdown.accommodationMedina || 0,
        supervisor: breakdown.supervisor || 0,
        assistant: breakdown.assistant || 0,
        supervisorSar: breakdown.supervisorSar || 0,
        assistantSar: breakdown.assistantSar || 0,
        tripLevelCostsSar: breakdown.tripLevelCostsSar || 0,
        visaSar: breakdown.visaSar || 0,
        visaEgpPortal: breakdown.visaEgpPortal || 0,
        visaAgentEgp: breakdown.visaAgentEgp || 0,
        passengerCosts,
        passengerCostsRealized,
        tripLevelCosts,
        operationalExpenses,
      },
    };
  });

  const filtered = summaries.filter((s) => {
    if (filters.costStatus === 'configured') return s.costsConfigured;
    if (filters.costStatus === 'missing') return !s.costsConfigured;
    return true;
  });

  return filtered.sort((a, b) => {
    if (a.trip.status !== b.trip.status) {
      return a.trip.status === 'active' ? -1 : 1;
    }
    const aCreated = a.trip.createdAt ? new Date(a.trip.createdAt).getTime() : 0;
    const bCreated = b.trip.createdAt ? new Date(b.trip.createdAt).getTime() : 0;
    if (aCreated !== bCreated) return bCreated - aCreated;
    return new Date(b.trip.startDate) - new Date(a.trip.startDate);
  });
};

const getOutstandingAging = async (filters) => {
  const match = buildInvoiceMatch(filters, { outstandingOnly: true });
  const invoices = await Invoice.find(match).select('balance issueDate').lean();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buckets = [
    { key: '0-30', label: '0–30 يوم', min: 0, max: 30, amount: 0, count: 0 },
    { key: '31-60', label: '31–60 يوم', min: 31, max: 60, amount: 0, count: 0 },
    { key: '61-90', label: '61–90 يوم', min: 61, max: 90, amount: 0, count: 0 },
    { key: '90+', label: '90+ يوم', min: 91, max: Infinity, amount: 0, count: 0 },
  ];

  invoices.forEach((inv) => {
    const days = Math.floor((today - new Date(inv.issueDate)) / (1000 * 60 * 60 * 24));
    const amt = inv.balance || 0;
    const bucket = buckets.find((b) => days >= b.min && days <= b.max);
    if (bucket) {
      bucket.amount += amt;
      bucket.count += 1;
    }
  });

  const totalAmount = buckets.reduce((sum, b) => sum + b.amount, 0);
  const totalCount = buckets.reduce((sum, b) => sum + b.count, 0);

  return { buckets, totalAmount, totalCount };
};

const getFinanceChartData = async (filters, tripSummaries = []) => {
  const invoiceMatch = buildInvoiceMatch(filters);
  const expenseMatch = buildExpenseMatch(filters);

  const [monthlyInvoices, monthlyExpenses, tripIds] = await Promise.all([
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
    getRelevantTripIds(filters, tripSummaries.length ? tripSummaries : null),
  ]);

  const costMap = await getAggregatedTripCosts(tripIds);
  const costTotals = sumCostSummaries(costMap);

  const revenueVsCostsChart = monthlyInvoices.map((m) => {
    const exp = monthlyExpenses.find(
      (e) => e._id.year === m._id.year && e._id.month === m._id.month
    );
    return {
      month: m._id.month,
      year: m._id.year,
      revenue: m.invoiced,
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

  const tripProfitability = tripSummaries
    .map((s) => ({
      name: s.trip.name,
      netProfit: s.trueProfit,
      collected: s.collected,
      grossRevenue: s.grossRevenue,
    }))
    .sort((a, b) => b.netProfit - a.netProfit)
    .slice(0, 8);

  const costBreakdownChart = [
    { label: 'تأشيرة', amount: costTotals.visa },
    { label: 'طيران', amount: costTotals.flight },
    { label: 'سكن مكة', amount: costTotals.accommodationMecca },
    { label: 'سكن المدينة', amount: costTotals.accommodationMedina },
    { label: 'مشرفين', amount: costTotals.supervisor + costTotals.assistant },
    { label: 'مصروفات', amount: costTotals.operationalExpenses },
  ].filter((d) => d.amount > 0);

  const aging = await getOutstandingAging(filters);

  return {
    revenueVsCostsChart,
    collectionRateChart,
    tripProfitability,
    costBreakdownChart,
    outstandingAging: aging.buckets.map((b) => ({
      label: b.label,
      amount: b.amount,
      count: b.count,
    })),
  };
};

const getLedgerTotals = async (filters, tab) => {
  if (tab === 'payments') {
    const match = buildPaymentMatch(filters);
    const agg = await Payment.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    return { total: agg[0]?.total || 0, count: agg[0]?.count || 0 };
  }
  if (tab === 'expenses') {
    const match = buildExpenseMatch(filters);
    const agg = await Expense.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    return { total: agg[0]?.total || 0, count: agg[0]?.count || 0 };
  }
  const outstandingOnly = tab === 'outstanding';
  const match = buildInvoiceMatch(filters, { outstandingOnly });
  const agg = await Invoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: '$total' },
        paid: { $sum: '$paid' },
        balance: { $sum: '$balance' },
        count: { $sum: 1 },
      },
    },
  ]);
  const row = agg[0] || {};
  return {
    total: row.total || 0,
    paid: row.paid || 0,
    balance: row.balance || 0,
    count: row.count || 0,
  };
};

const computeTripMatrixTotals = (tripSummaries) => tripSummaries.reduce((acc, s) => ({
  grossRevenue: acc.grossRevenue + (s.grossRevenue || 0),
  collected: acc.collected + (s.collected || 0),
  outstanding: acc.outstanding + (s.outstanding || 0),
  passengerCosts: acc.passengerCosts + (s.passengerCosts || 0),
  passengerCostsRealized: acc.passengerCostsRealized + (s.passengerCostsRealized || 0),
  tripLevelCosts: acc.tripLevelCosts + (s.tripLevelCosts || 0),
  tripLevelCostsSar: acc.tripLevelCostsSar + (s.tripLevelCostsSar || 0),
  tripCosts: acc.tripCosts + (s.tripCosts || 0),
  operationalExpenses: acc.operationalExpenses + (s.operationalExpenses || 0),
  totalCosts: acc.totalCosts + (s.totalCosts || 0),
  trueProfit: acc.trueProfit + (s.trueProfit || 0),
  reservationCount: acc.reservationCount + (s.reservationCount || 0),
  passengersCommitted: acc.passengersCommitted + (s.passengersCommitted || 0),
}), {
  grossRevenue: 0,
  collected: 0,
  outstanding: 0,
  passengerCosts: 0,
  passengerCostsRealized: 0,
  tripLevelCosts: 0,
  tripLevelCostsSar: 0,
  tripCosts: 0,
  operationalExpenses: 0,
  totalCosts: 0,
  trueProfit: 0,
  reservationCount: 0,
  passengersCommitted: 0,
});

const getLedger = async (filters) => {
  const skip = (filters.page - 1) * PAGE_SIZE;
  const tab = filters.tab;

  if (tab === 'payments') {
    const match = buildPaymentMatch(filters);
    const [items, totalCount] = await Promise.all([
      Payment.find(match)
        .populate('tripId', 'name')
        .populate('reservationId', 'reservationNumber primaryCustomerName')
        .sort({ paymentDate: -1 })
        .skip(skip)
        .limit(PAGE_SIZE),
      Payment.countDocuments(match),
    ]);
    return { items, totalCount, type: 'payments' };
  }

  if (tab === 'expenses') {
    const match = buildExpenseMatch(filters);
    const [items, totalCount] = await Promise.all([
      Expense.find(match)
        .populate('tripId', 'name')
        .sort({ expenseDate: -1 })
        .skip(skip)
        .limit(PAGE_SIZE),
      Expense.countDocuments(match),
    ]);
    return { items, totalCount, type: 'expenses' };
  }

  const outstandingOnly = tab === 'outstanding';
  const match = buildInvoiceMatch(filters, { outstandingOnly });
  const sort = outstandingOnly ? { balance: -1 } : { issueDate: -1 };

  const [items, totalCount] = await Promise.all([
    Invoice.find(match)
      .populate('tripId', 'name startDate')
      .populate('reservationId', 'reservationNumber primaryCustomerName')
      .sort(sort)
      .skip(skip)
      .limit(PAGE_SIZE),
    Invoice.countDocuments(match),
  ]);

  return { items, totalCount, type: outstandingOnly ? 'outstanding' : 'invoices' };
};

const csvEscape = (val) => {
  const str = val == null ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const formatCsvDate = (d) => (d ? new Date(d).toISOString().split('T')[0] : '');

const exportLedgerCsv = async (filters, type) => {
  const exportFilters = { ...filters, page: 1 };
  const rows = [];
  let headers = [];

  if (type === 'payments') {
    const match = buildPaymentMatch(exportFilters);
    const items = await Payment.find(match)
      .populate('tripId', 'name')
      .populate('reservationId', 'reservationNumber')
      .sort({ paymentDate: -1 })
      .limit(5000);
    headers = ['التاريخ', 'رقم الدفعة', 'الرحلة', 'رقم الحجز', 'المبلغ', 'الطريقة', 'ملاحظات'];
    items.forEach((p) => {
      rows.push([
        formatCsvDate(p.paymentDate),
        p.paymentNumber,
        p.tripId?.name || '',
        p.reservationId?.reservationNumber || '',
        p.amount,
        paymentMethodLabel(p.method),
        p.notes || '',
      ]);
    });
  } else if (type === 'expenses') {
    const match = buildExpenseMatch(exportFilters);
    const items = await Expense.find(match).populate('tripId', 'name').sort({ expenseDate: -1 }).limit(5000);
    headers = ['التاريخ', 'الرحلة', 'الفئة', 'الوصف', 'المورد', 'المبلغ', 'مرجع'];
    items.forEach((e) => {
      rows.push([
        formatCsvDate(e.expenseDate),
        e.tripId?.name || '',
        expenseCategoryLabel(e.category),
        e.description || '',
        e.supplier || '',
        e.amount,
        e.reference || '',
      ]);
    });
  } else if (type === 'profitability') {
    const summaries = await getTripSummaries(exportFilters);
    headers = [
      'الرحلة', 'الحالة', 'إيرادات محجوزة', 'محصل', 'مستحق',
      'تكلفة معتمرين', 'تكلفة تشغيل', 'مصروفات', 'إجمالي التكلفة',
      'صافي الربح', 'هامش %', 'حجوزات', 'تكلفة مُدخلة',
    ];
    summaries.forEach((s) => {
      rows.push([
        s.trip.name,
        statusLabel(s.trip.status),
        s.grossRevenue,
        s.collected,
        s.outstanding,
        s.passengerCosts,
        s.tripLevelCosts,
        s.operationalExpenses,
        s.totalCosts,
        s.trueProfit,
        s.marginPercent,
        s.reservationCount,
        s.costsConfigured ? 'نعم' : 'لا',
      ]);
    });
  } else {
    const outstandingOnly = type === 'outstanding';
    const match = buildInvoiceMatch(exportFilters, { outstandingOnly });
    const items = await Invoice.find(match)
      .populate('tripId', 'name')
      .populate('reservationId', 'reservationNumber')
      .sort(outstandingOnly ? { balance: -1 } : { issueDate: -1 })
      .limit(5000);
    headers = ['رقم الفاتورة', 'التاريخ', 'الرحلة', 'العميل', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة', 'رقم الحجز'];
    items.forEach((i) => {
      rows.push([
        i.invoiceNumber,
        formatCsvDate(i.issueDate),
        i.tripId?.name || '',
        i.customerName || '',
        i.total,
        i.paid,
        i.balance,
        statusLabel(i.status),
        i.reservationId?.reservationNumber || '',
      ]);
    });
  }

  const bom = '\uFEFF';
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((row) => lines.push(row.map(csvEscape).join(',')));
  return bom + lines.join('\n');
};

const buildPagination = (page, totalCount) => {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  return {
    page,
    totalPages,
    totalCount,
    pageSize: PAGE_SIZE,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
};

const buildQueryString = (filters, overrides = {}) => {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.tripId) params.set('tripId', merged.tripId);
  if (merged.fromDate) params.set('fromDate', merged.fromDate);
  if (merged.toDate) params.set('toDate', merged.toDate);
  if (merged.invoiceStatus) params.set('invoiceStatus', merged.invoiceStatus);
  if (merged.paymentMethod) params.set('paymentMethod', merged.paymentMethod);
  if (merged.expenseCategory) params.set('expenseCategory', merged.expenseCategory);
  if (merged.tripStatus) params.set('tripStatus', merged.tripStatus);
  if (merged.costStatus) params.set('costStatus', merged.costStatus);
  if (merged.search) params.set('search', merged.search);
  if (merged.type) params.set('type', merged.type);
  if (merged.tab && merged.tab !== 'invoices') params.set('tab', merged.tab);
  if (merged.page && merged.page > 1) params.set('page', String(merged.page));
  const str = params.toString();
  return str ? `?${str}` : '';
};

module.exports = {
  PAGE_SIZE,
  buildFinanceFilters,
  hasActiveFilters,
  getFinanceSummary,
  getEnterpriseFinanceSummary,
  getTripSummaries,
  getLedger,
  getLedgerTotals,
  getOutstandingAging,
  getFinanceChartData,
  computeTripMatrixTotals,
  exportLedgerCsv,
  buildPagination,
  buildQueryString,
};
