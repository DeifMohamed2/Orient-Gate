const mongoose = require('mongoose');
const Broker = require('../models/Broker');
const Reservation = require('../models/Reservation');
const Trip = require('../models/Trip');

const PAGE_SIZE = 25;

const parseFilters = (query) => ({
  search: (query.search || '').trim(),
  active: query.active || '',
  page: Math.max(1, parseInt(query.page, 10) || 1),
});

const buildBrokerFilter = (filters) => {
  const match = {};
  if (filters.search) {
    match.$or = [
      { name: new RegExp(filters.search, 'i') },
      { company: new RegExp(filters.search, 'i') },
      { phones: new RegExp(filters.search, 'i') },
      { email: new RegExp(filters.search, 'i') },
    ];
  }
  if (filters.active === 'true') match.isActive = true;
  if (filters.active === 'false') match.isActive = false;
  return match;
};

const parseBrokerBody = (body) => {
  const phones = (body.phones || '')
    .split(/[,،]/)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    name: (body.name || '').trim(),
    phones,
    email: (body.email || '').trim() || undefined,
    company: (body.company || '').trim() || undefined,
    notes: (body.notes || '').trim() || undefined,
    isActive: body.isActive === 'true' || body.isActive === true,
  };
};

const listBrokers = async (query) => {
  const filters = parseFilters(query);
  const match = buildBrokerFilter(filters);
  const totalCount = await Broker.countDocuments(match);
  const items = await Broker.find(match)
    .sort({ name: 1 })
    .skip((filters.page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  const brokerIds = items.map((b) => b._id);
  const statsMap = await getBrokerStatsMap(brokerIds);

  const enriched = items.map((b) => ({
    ...b,
    stats: statsMap.get(String(b._id)) || {
      reservationCount: 0,
      clientCount: 0,
      totalRevenue: 0,
      totalPaid: 0,
    },
  }));

  return { items: enriched, totalCount, filters };
};

const getBrokerStatsMap = async (brokerIds) => {
  if (!brokerIds.length) return new Map();

  const objectIds = brokerIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const rows = await Reservation.aggregate([
    { $match: { brokerId: { $in: objectIds }, status: { $ne: 'cancelled' } } },
    {
      $group: {
        _id: '$brokerId',
        reservationCount: { $sum: 1 },
        totalRevenue: { $sum: '$pricingSnapshot.total' },
        totalPaid: { $sum: '$pricingSnapshot.paid' },
        customerIds: {
          $addToSet: {
            $setUnion: [
              { $cond: [{ $ifNull: ['$primaryCustomerId', false] }, ['$primaryCustomerId'], []] },
              { $ifNull: ['$members.customerId', []] },
            ],
          },
        },
      },
    },
  ]);

  const map = new Map();
  for (const row of rows) {
    const allCustomers = (row.customerIds || []).flat();
    map.set(String(row._id), {
      reservationCount: row.reservationCount,
      clientCount: new Set(allCustomers.map(String)).size,
      totalRevenue: row.totalRevenue || 0,
      totalPaid: row.totalPaid || 0,
    });
  }
  return map;
};

const getBrokerStats = async () => {
  const total = await Broker.countDocuments();
  const active = await Broker.countDocuments({ isActive: true });
  const withReservations = await Reservation.distinct('brokerId', { brokerId: { $ne: null } });
  return {
    total,
    active,
    withReservations: withReservations.length,
  };
};

const getBrokerProfile = async (brokerId) => {
  const broker = await Broker.findById(brokerId).lean();
  if (!broker) return null;

  const reservations = await Reservation.find({ brokerId, status: { $ne: 'cancelled' } })
    .populate('tripId', 'name startDate endDate')
    .sort({ bookingDate: -1 })
    .lean();

  const customerVisitMap = new Map();
  let totalRevenue = 0;
  let totalPaid = 0;
  let totalBalance = 0;

  for (const r of reservations) {
    totalRevenue += r.pricingSnapshot?.total || 0;
    totalPaid += r.pricingSnapshot?.paid || 0;
    totalBalance += r.pricingSnapshot?.balance || 0;

    const ids = new Set();
    if (r.primaryCustomerId) ids.add(String(r.primaryCustomerId));
    (r.members || []).forEach((m) => {
      if (m.customerId) ids.add(String(m.customerId));
    });
    ids.forEach((cid) => {
      customerVisitMap.set(cid, (customerVisitMap.get(cid) || 0) + 1);
    });
  }

  const repeatClients = [...customerVisitMap.entries()].filter(([, count]) => count >= 2).length;
  const uniqueClients = customerVisitMap.size;

  const tripStats = await Reservation.aggregate([
    { $match: { brokerId: new mongoose.Types.ObjectId(String(brokerId)), status: { $ne: 'cancelled' } } },
    {
      $group: {
        _id: '$tripId',
        reservationCount: { $sum: 1 },
        revenue: { $sum: '$pricingSnapshot.total' },
        memberCount: { $sum: { $size: { $ifNull: ['$members', []] } } },
      },
    },
    { $sort: { reservationCount: -1 } },
  ]);

  const tripIds = tripStats.map((t) => t._id).filter(Boolean);
  const trips = await Trip.find({ _id: { $in: tripIds } }).select('name startDate endDate').lean();
  const tripMap = new Map(trips.map((t) => [String(t._id), t]));

  const tripsBreakdown = tripStats.map((t) => ({
    trip: tripMap.get(String(t._id)),
    reservationCount: t.reservationCount,
    memberCount: t.memberCount,
    revenue: t.revenue,
  }));

  return {
    broker,
    reservations,
    stats: {
      reservationCount: reservations.length,
      uniqueClients,
      repeatClients,
      totalRevenue,
      totalPaid,
      totalBalance,
    },
    tripsBreakdown,
  };
};

const searchBrokers = async (q, limit = 15) => {
  const search = (q || '').trim();
  if (!search) {
    return Broker.find({ isActive: true }).sort({ name: 1 }).limit(limit).select('name phones company').lean();
  }
  return Broker.find({
    isActive: true,
    $or: [
      { name: new RegExp(search, 'i') },
      { company: new RegExp(search, 'i') },
      { phones: new RegExp(search, 'i') },
    ],
  })
    .sort({ name: 1 })
    .limit(limit)
    .select('name phones company')
    .lean();
};

const findOrCreateBroker = async ({ brokerId, name, phone }, userId) => {
  if (brokerId) {
    const existing = await Broker.findById(brokerId);
    if (existing) return existing;
  }
  const trimmedName = (name || '').trim();
  if (!trimmedName) return null;

  const phoneNorm = (phone || '').trim();
  if (phoneNorm) {
    const byPhone = await Broker.findOne({ phones: phoneNorm });
    if (byPhone) return byPhone;
  }

  const byName = await Broker.findOne({ name: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (byName) return byName;

  return Broker.create({
    name: trimmedName,
    phones: phoneNorm ? [phoneNorm] : [],
    createdBy: userId,
  });
};

const buildPagination = (page, totalCount) => {
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  return {
    page,
    totalPages,
    totalCount,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
};

const buildQueryString = (filters, overrides = {}) => {
  const params = new URLSearchParams();
  const merged = { ...filters, ...overrides };
  Object.entries(merged).forEach(([k, v]) => {
    if (v && k !== 'page') params.set(k, v);
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

module.exports = {
  listBrokers,
  getBrokerStats,
  getBrokerProfile,
  searchBrokers,
  findOrCreateBroker,
  parseBrokerBody,
  buildPagination,
  buildQueryString,
  PAGE_SIZE,
};
