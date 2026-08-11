const mongoose = require('mongoose');
const Reservation = require('../models/Reservation');
const User = require('../models/User');
const Trip = require('../models/Trip');
const { ROLES } = require('../config/constants');
const { roleLabel } = require('../utils/helpers');

const PAGE_SIZE = 25;
const EXPORT_LIMIT = 5000;
const SALES_ROLES = [ROLES.SALES, ROLES.MANAGER, ROLES.ADMIN];

const csvEscape = (val) => {
  const str = val == null ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const formatCsvDate = (d) => (d ? new Date(d).toISOString().split('T')[0] : '');

const canViewAllSales = (user) => {
  if (!user) return false;
  if ([ROLES.ADMIN, ROLES.MANAGER, ROLES.OPERATIONS].includes(user.role)) return true;
  return user.hasPermission('users:manage') || user.hasPermission('finance:manage');
};

const canAssignSalesEmployee = (user) => canViewAllSales(user);

const parseFilters = (query) => ({
  search: (query.search || '').trim(),
  tripId: query.tripId || '',
  salesEmployeeId: query.salesEmployeeId || '',
  status: query.status || 'active',
  fromDate: query.fromDate || '',
  toDate: query.toDate || '',
  page: Math.max(1, parseInt(query.page, 10) || 1),
  tab: query.tab || 'overview',
});

const buildReservationMatch = (filters, { scopeUserId } = {}) => {
  const match = {};

  if (filters.status === 'all') {
    // no status filter
  } else if (filters.status) {
    match.status = filters.status;
  } else {
    match.status = 'active';
  }

  if (filters.tripId && mongoose.Types.ObjectId.isValid(filters.tripId)) {
    match.tripId = new mongoose.Types.ObjectId(filters.tripId);
  }

  if (scopeUserId) {
    match.salesEmployee = new mongoose.Types.ObjectId(String(scopeUserId));
  } else if (filters.salesEmployeeId && mongoose.Types.ObjectId.isValid(filters.salesEmployeeId)) {
    match.salesEmployee = new mongoose.Types.ObjectId(filters.salesEmployeeId);
  }

  if (filters.fromDate || filters.toDate) {
    match.bookingDate = {};
    if (filters.fromDate) match.bookingDate.$gte = new Date(filters.fromDate);
    if (filters.toDate) {
      const to = new Date(filters.toDate);
      to.setHours(23, 59, 59, 999);
      match.bookingDate.$lte = to;
    }
  }

  return match;
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

const hasActiveFilters = (filters) => Boolean(
  filters.search
  || filters.tripId
  || filters.salesEmployeeId
  || filters.fromDate
  || filters.toDate
  || (filters.status && filters.status !== 'active')
);

const buildQueryString = (filters, overrides = {}) => {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.tab && merged.tab !== 'overview') params.set('tab', merged.tab);
  if (merged.search) params.set('search', merged.search);
  if (merged.tripId) params.set('tripId', merged.tripId);
  if (merged.salesEmployeeId) params.set('salesEmployeeId', merged.salesEmployeeId);
  if (merged.status && merged.status !== 'active') params.set('status', merged.status);
  if (merged.fromDate) params.set('fromDate', merged.fromDate);
  if (merged.toDate) params.set('toDate', merged.toDate);
  if (merged.page && merged.page > 1) params.set('page', String(merged.page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

const getSalesUsers = async () => User.find({
  role: { $in: SALES_ROLES },
  isActive: true,
}).select('name email role').sort({ name: 1 });

const getSellerLeaderboard = async (filters, scopeUserId) => {
  const match = buildReservationMatch(filters, { scopeUserId });
  match.salesEmployee = { $exists: true, $ne: null };
  if (scopeUserId) {
    match.salesEmployee = new mongoose.Types.ObjectId(String(scopeUserId));
  }

  const rows = await Reservation.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$salesEmployee',
        bookingCount: { $sum: 1 },
        totalRevenue: { $sum: { $ifNull: ['$pricingSnapshot.total', 0] } },
        collected: { $sum: { $ifNull: ['$pricingSnapshot.paid', 0] } },
        pilgrimCount: { $sum: { $size: { $ifNull: ['$members', []] } } },
        customers: { $addToSet: '$primaryCustomerId' },
        lastBooking: { $max: '$bookingDate' },
      },
    },
    {
      $project: {
        bookingCount: 1,
        totalRevenue: 1,
        collected: 1,
        outstanding: { $subtract: ['$totalRevenue', '$collected'] },
        pilgrimCount: 1,
        clientCount: { $size: '$customers' },
        lastBooking: 1,
      },
    },
    { $sort: { totalRevenue: -1 } },
  ]);

  const userIds = rows.map((r) => r._id).filter(Boolean);
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select('name email role phone')
    : [];
  const userMap = Object.fromEntries(users.map((u) => [String(u._id), u]));

  return rows.map((r) => ({
    seller: userMap[String(r._id)] || { name: 'غير معروف', _id: r._id },
    ...r,
  }));
};

const getSalesSummary = async (filters, scopeUserId) => {
  const match = buildReservationMatch(filters, { scopeUserId });
  match.salesEmployee = { $exists: true, $ne: null };
  if (scopeUserId) {
    match.salesEmployee = new mongoose.Types.ObjectId(String(scopeUserId));
  }

  const [agg] = await Reservation.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        bookingCount: { $sum: 1 },
        totalRevenue: { $sum: { $ifNull: ['$pricingSnapshot.total', 0] } },
        collected: { $sum: { $ifNull: ['$pricingSnapshot.paid', 0] } },
        pilgrimCount: { $sum: { $size: { $ifNull: ['$members', []] } } },
        customers: { $addToSet: '$primaryCustomerId' },
        sellers: { $addToSet: '$salesEmployee' },
      },
    },
    {
      $project: {
        bookingCount: 1,
        totalRevenue: 1,
        collected: 1,
        outstanding: { $subtract: ['$totalRevenue', '$collected'] },
        pilgrimCount: 1,
        clientCount: { $size: '$customers' },
        sellerCount: { $size: '$sellers' },
      },
    },
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayMatch = { ...match, bookingDate: { $gte: today, $lt: tomorrow } };
  const todayBookings = await Reservation.countDocuments(todayMatch);

  return {
    bookingCount: agg?.bookingCount || 0,
    totalRevenue: agg?.totalRevenue || 0,
    collected: agg?.collected || 0,
    outstanding: agg?.outstanding || 0,
    pilgrimCount: agg?.pilgrimCount || 0,
    clientCount: agg?.clientCount || 0,
    sellerCount: agg?.sellerCount || 0,
    todayBookings,
  };
};

const listSalesBookings = async (rawQuery, scopeUserId) => {
  const filters = parseFilters(rawQuery);
  const match = buildReservationMatch(filters, { scopeUserId });
  match.salesEmployee = { $exists: true, $ne: null };
  if (scopeUserId) {
    match.salesEmployee = new mongoose.Types.ObjectId(String(scopeUserId));
  }

  const query = { ...match };
  if (filters.search) {
    query.$or = [
      { primaryCustomerName: new RegExp(filters.search, 'i') },
      { primaryPhone: new RegExp(filters.search, 'i') },
      { reservationNumber: new RegExp(filters.search, 'i') },
    ];
  }

  const skip = (filters.page - 1) * PAGE_SIZE;
  const [bookings, totalCount] = await Promise.all([
    Reservation.find(query)
      .populate('tripId', 'name startDate')
      .populate('salesEmployee', 'name email role')
      .sort({ bookingDate: -1 })
      .skip(skip)
      .limit(PAGE_SIZE),
    Reservation.countDocuments(query),
  ]);

  return { bookings, totalCount, filters };
};

const getSellerProfile = async (sellerId, rawQuery) => {
  const seller = await User.findById(sellerId).select('-password');
  if (!seller) return null;

  const filters = parseFilters(rawQuery);
  const scopeUserId = seller._id;
  const [leaderboard, summary, { bookings, totalCount }] = await Promise.all([
    getSellerLeaderboard(filters, scopeUserId),
    getSalesSummary(filters, scopeUserId),
    listSalesBookings({ ...rawQuery, page: rawQuery.page || 1 }, scopeUserId),
  ]);

  return {
    seller,
    stats: summary,
    leaderboard,
    bookings,
    totalCount,
    filters,
  };
};

const exportSalesCsv = async (rawQuery, scopeUserId, { all = false } = {}) => {
  const filters = all ? parseFilters({ status: 'active' }) : parseFilters(rawQuery);
  const match = buildReservationMatch(filters, { scopeUserId });
  match.salesEmployee = { $exists: true, $ne: null };
  if (scopeUserId) {
    match.salesEmployee = new mongoose.Types.ObjectId(String(scopeUserId));
  }

  const bookings = await Reservation.find(match)
    .populate('tripId', 'name')
    .populate('salesEmployee', 'name')
    .sort({ bookingDate: -1 })
    .limit(EXPORT_LIMIT);

  const headers = [
    'رقم الحجز', 'تاريخ الحجز', 'مسؤول المبيعات', 'العميل', 'الهاتف',
    'الرحلة', 'المعتمرين', 'الإجمالي', 'المدفوع', 'المتبقي', 'حالة الدفع', 'حالة الحجز',
  ];

  const statusLabels = {
    unpaid: 'غير مدفوع', partial: 'جزئي', paid: 'مدفوع', refunded: 'مسترد',
    active: 'نشط', cancelled: 'ملغي', completed: 'مكتمل',
  };

  const rows = bookings.map((r) => [
    r.reservationNumber,
    formatCsvDate(r.bookingDate),
    r.salesEmployee?.name || '',
    r.primaryCustomerName || '',
    r.primaryPhone || '',
    r.tripId?.name || '',
    (r.members || []).length,
    r.pricingSnapshot?.total || 0,
    r.pricingSnapshot?.paid || 0,
    Math.max(0, (r.pricingSnapshot?.total || 0) - (r.pricingSnapshot?.paid || 0)),
    statusLabels[r.paymentStatus] || r.paymentStatus,
    statusLabels[r.status] || r.status,
  ]);

  const bom = '\uFEFF';
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((row) => lines.push(row.map(csvEscape).join(',')));
  return bom + lines.join('\n');
};

module.exports = {
  PAGE_SIZE,
  SALES_ROLES,
  canViewAllSales,
  canAssignSalesEmployee,
  parseFilters,
  buildQueryString,
  buildPagination,
  hasActiveFilters,
  getSalesUsers,
  getSellerLeaderboard,
  getSalesSummary,
  listSalesBookings,
  getSellerProfile,
  exportSalesCsv,
};
