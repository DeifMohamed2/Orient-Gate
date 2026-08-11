const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Reservation = require('../models/Reservation');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Trip = require('../models/Trip');
const { genderLabel } = require('../utils/helpers');

const PAGE_SIZE = 25;
const EXPORT_LIMIT = 5000;
const PASSPORT_WARN_MONTHS = 6;

const parseFilters = (query) => ({
  search: (query.search || '').trim(),
  vip: query.vip || '',
  blacklisted: query.blacklisted || '',
  gender: query.gender || '',
  nationality: (query.nationality || '').trim(),
  hasReservations: query.hasReservations || '',
  sort: query.sort || 'newest',
  page: Math.max(1, parseInt(query.page, 10) || 1),
});

const buildCustomerFilter = (filters) => {
  const match = {};
  if (filters.search) {
    match.$or = [
      { name: new RegExp(filters.search, 'i') },
      { passport: new RegExp(filters.search, 'i') },
      { phones: new RegExp(filters.search, 'i') },
      { email: new RegExp(filters.search, 'i') },
    ];
  }
  if (filters.vip === 'true') match.isVip = true;
  if (filters.blacklisted === 'true') match.isBlacklisted = true;
  if (filters.gender) match.gender = filters.gender;
  if (filters.nationality) match.nationality = new RegExp(filters.nationality, 'i');
  return match;
};

const buildSort = (sort) => {
  switch (sort) {
    case 'name': return { name: 1 };
    case 'loyalty': return { loyaltyPoints: -1, name: 1 };
    default: return { createdAt: -1 };
  }
};

const getCustomerIdsWithReservations = async () => {
  const rows = await Reservation.aggregate([
    {
      $project: {
        ids: {
          $setUnion: [
            { $cond: [{ $ifNull: ['$primaryCustomerId', false] }, ['$primaryCustomerId'], []] },
            { $ifNull: ['$members.customerId', []] },
          ],
        },
      },
    },
    { $unwind: '$ids' },
    { $group: { _id: '$ids' } },
  ]);
  return rows.map((r) => r._id);
};

const getReservationStatsMap = async (customerIds) => {
  if (!customerIds.length) return new Map();

  const objectIds = customerIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const rows = await Reservation.aggregate([
    {
      $match: {
        $or: [
          { primaryCustomerId: { $in: objectIds } },
          { 'members.customerId': { $in: objectIds } },
        ],
      },
    },
    {
      $addFields: {
        involvedCustomers: {
          $setUnion: [
            { $cond: [{ $ifNull: ['$primaryCustomerId', false] }, ['$primaryCustomerId'], []] },
            { $ifNull: ['$members.customerId', []] },
          ],
        },
      },
    },
    { $unwind: '$involvedCustomers' },
    { $match: { involvedCustomers: { $in: objectIds } } },
    { $sort: { bookingDate: -1 } },
    {
      $group: {
        _id: '$involvedCustomers',
        count: { $sum: 1 },
        lastBooking: { $first: '$bookingDate' },
        lastTripId: { $first: '$tripId' },
      },
    },
  ]);

  const tripIds = [...new Set(rows.map((r) => r.lastTripId).filter(Boolean))];
  const trips = tripIds.length
    ? await Trip.find({ _id: { $in: tripIds } }).select('name').lean()
    : [];
  const tripMap = Object.fromEntries(trips.map((t) => [String(t._id), t.name]));

  const map = new Map();
  rows.forEach((r) => {
    map.set(String(r._id), {
      reservationCount: r.count,
      lastBooking: r.lastBooking,
      lastTripName: tripMap[String(r.lastTripId)] || '',
    });
  });
  return map;
};

const getFinanceStatsMap = async (customerIds) => {
  if (!customerIds.length) return new Map();

  const objectIds = customerIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const invoiceRows = await Invoice.aggregate([
    { $match: { customerId: { $in: objectIds } } },
    {
      $group: {
        _id: '$customerId',
        totalInvoiced: { $sum: '$total' },
        totalPaid: { $sum: '$paid' },
        outstanding: { $sum: '$balance' },
      },
    },
  ]);

  const map = new Map();
  invoiceRows.forEach((r) => {
    map.set(String(r._id), {
      totalInvoiced: r.totalInvoiced || 0,
      totalPaid: r.totalPaid || 0,
      outstanding: r.outstanding || 0,
    });
  });
  return map;
};

const attachCustomerMeta = async (customers) => {
  const ids = customers.map((c) => c._id);
  const [resStats, finStats] = await Promise.all([
    getReservationStatsMap(ids),
    getFinanceStatsMap(ids),
  ]);

  return customers.map((c) => {
    const res = resStats.get(String(c._id)) || {};
    const fin = finStats.get(String(c._id)) || {};
    return {
      ...c.toObject ? c.toObject() : c,
      reservationCount: res.reservationCount || 0,
      lastBooking: res.lastBooking || null,
      lastTripName: res.lastTripName || '',
      totalInvoiced: fin.totalInvoiced || 0,
      totalPaid: fin.totalPaid || 0,
      outstanding: fin.outstanding || 0,
      passportExpiringSoon: isPassportExpiringSoon(c.passportExpiry),
    };
  });
};

const isPassportExpiringSoon = (passportExpiry) => {
  if (!passportExpiry) return false;
  const warnDate = new Date();
  warnDate.setMonth(warnDate.getMonth() + PASSPORT_WARN_MONTHS);
  return new Date(passportExpiry) <= warnDate;
};

const applyHasReservationsFilter = async (match, filters) => {
  if (filters.hasReservations !== 'true') return match;
  const ids = await getCustomerIdsWithReservations();
  return { ...match, _id: { $in: ids } };
};

const listCustomers = async (rawQuery) => {
  const filters = parseFilters(rawQuery);
  let match = buildCustomerFilter(filters);
  match = await applyHasReservationsFilter(match, filters);

  const skip = (filters.page - 1) * PAGE_SIZE;
  const [customers, totalCount] = await Promise.all([
    Customer.find(match).sort(buildSort(filters.sort)).skip(skip).limit(PAGE_SIZE),
    Customer.countDocuments(match),
  ]);

  const items = await attachCustomerMeta(customers);
  return { items, totalCount, filters };
};

const getCustomerStats = async (rawQuery) => {
  const filters = parseFilters(rawQuery);
  const baseMatch = buildCustomerFilter(filters);
  const withResMatch = await applyHasReservationsFilter(baseMatch, filters);

  const [total, vip, blacklisted, withReservationsIds] = await Promise.all([
    Customer.countDocuments(withResMatch),
    Customer.countDocuments({ ...withResMatch, isVip: true }),
    Customer.countDocuments({ ...withResMatch, isBlacklisted: true }),
    getCustomerIdsWithReservations(),
  ]);

  const withReservations = withReservationsIds.length
    ? await Customer.countDocuments({ ...withResMatch, _id: { $in: withReservationsIds } })
    : 0;

  return { total, vip, blacklisted, withReservations };
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
  || filters.vip === 'true'
  || filters.blacklisted === 'true'
  || filters.gender
  || filters.nationality
  || filters.hasReservations === 'true'
  || (filters.sort && filters.sort !== 'newest')
);

const buildQueryString = (filters, overrides = {}) => {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.search) params.set('search', merged.search);
  if (merged.vip === 'true') params.set('vip', 'true');
  if (merged.blacklisted === 'true') params.set('blacklisted', 'true');
  if (merged.gender) params.set('gender', merged.gender);
  if (merged.nationality) params.set('nationality', merged.nationality);
  if (merged.hasReservations === 'true') params.set('hasReservations', 'true');
  if (merged.sort && merged.sort !== 'newest') params.set('sort', merged.sort);
  if (merged.page && merged.page > 1) params.set('page', String(merged.page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

const csvEscape = (val) => {
  const str = val == null ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const formatCsvDate = (d) => (d ? new Date(d).toISOString().split('T')[0] : '');
const boolCsv = (v) => (v ? 'نعم' : 'لا');

const exportCustomersCsv = async (rawQuery, { all = false } = {}) => {
  const filters = parseFilters(rawQuery);
  let match = buildCustomerFilter(filters);
  if (!all) match = await applyHasReservationsFilter(match, filters);

  const customers = await Customer.find(match)
    .sort(buildSort(filters.sort))
    .limit(EXPORT_LIMIT);

  const enriched = await attachCustomerMeta(customers);
  const headers = [
    'الاسم', 'الجواز', 'انتهاء الجواز', 'الجنسية', 'الجنس', 'تاريخ الميلاد',
    'الهواتف', 'البريد', 'جهة الطوارئ', 'هاتف الطوارئ',
    'VIP', 'قائمة سوداء', 'نقاط الولاء', 'موافقة تسويق',
    'ملاحظات', 'ملاحظات طبية',
    'عدد الحجوزات', 'آخر حجز', 'آخر رحلة',
    'إجمالي الفواتير', 'المدفوع', 'المتبقي',
    'تاريخ التسجيل',
  ];

  const rows = enriched.map((c) => [
    c.name,
    c.passport || '',
    formatCsvDate(c.passportExpiry),
    c.nationality || '',
    genderLabel(c.gender),
    formatCsvDate(c.birthDate),
    (c.phones || []).join(' / '),
    c.email || '',
    c.emergencyContact?.name || '',
    c.emergencyContact?.phone || '',
    boolCsv(c.isVip),
    boolCsv(c.isBlacklisted),
    c.loyaltyPoints || 0,
    boolCsv(c.marketingConsent),
    c.notes || '',
    c.medicalNotes || '',
    c.reservationCount || 0,
    formatCsvDate(c.lastBooking),
    c.lastTripName || '',
    c.totalInvoiced || 0,
    c.totalPaid || 0,
    c.outstanding || 0,
    formatCsvDate(c.createdAt),
  ]);

  const bom = '\uFEFF';
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((row) => lines.push(row.map(csvEscape).join(',')));
  return bom + lines.join('\n');
};

const getReservationRole = (reservation, customerId) => {
  const id = String(customerId);
  if (reservation.primaryCustomerId && String(reservation.primaryCustomerId) === id) return 'primary';
  const isMember = (reservation.members || []).some((m) => m.customerId && String(m.customerId) === id);
  return isMember ? 'member' : 'other';
};

const getCustomerProfile = async (customerId) => {
  const customer = await Customer.findById(customerId)
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name');
  if (!customer) return null;

  const objectId = new mongoose.Types.ObjectId(String(customerId));
  const [reservations, invoices, payments] = await Promise.all([
    Reservation.find({
      $or: [
        { primaryCustomerId: objectId },
        { 'members.customerId': objectId },
      ],
    })
      .populate('tripId', 'name startDate endDate status')
      .sort({ bookingDate: -1 }),
    Invoice.find({ customerId: objectId })
      .populate('tripId', 'name')
      .populate('reservationId', 'reservationNumber')
      .sort({ issueDate: -1 }),
    Payment.find({ customerId: objectId })
      .populate('tripId', 'name')
      .populate('reservationId', 'reservationNumber')
      .populate('invoiceId', 'invoiceNumber')
      .sort({ paymentDate: -1 }),
  ]);

  const reservationRows = reservations.map((r) => ({
    reservation: r,
    role: getReservationRole(r, customerId),
  }));

  const finance = {
    totalInvoiced: invoices.reduce((s, i) => s + (i.total || 0), 0),
    totalPaid: invoices.reduce((s, i) => s + (i.paid || 0), 0),
    outstanding: invoices.reduce((s, i) => s + (i.balance || 0), 0),
    paymentTotal: payments.filter((p) => !p.isRefund).reduce((s, p) => s + (p.amount || 0), 0),
  };

  return {
    customer,
    reservationRows,
    invoices,
    payments,
    finance,
    passportExpiringSoon: isPassportExpiringSoon(customer.passportExpiry),
  };
};

const parseCustomerBody = (body) => {
  const phones = body.phones
    ? body.phones.split(',').map((p) => p.trim()).filter(Boolean)
    : [];

  const parseDate = (val) => (val ? new Date(val) : undefined);

  return {
    name: body.name,
    passport: body.passport || undefined,
    passportExpiry: parseDate(body.passportExpiry),
    nationality: body.nationality || undefined,
    gender: body.gender || 'male',
    birthDate: parseDate(body.birthDate),
    phones,
    email: body.email || undefined,
    emergencyContact: {
      name: body.emergencyContactName || undefined,
      phone: body.emergencyContactPhone || undefined,
    },
    notes: body.notes || undefined,
    medicalNotes: body.medicalNotes || undefined,
    isVip: body.isVip === 'true' || body.isVip === true,
    isBlacklisted: body.isBlacklisted === 'true' || body.isBlacklisted === true,
    marketingConsent: body.marketingConsent === 'true' || body.marketingConsent === true,
    loyaltyPoints: body.loyaltyPoints != null && body.loyaltyPoints !== ''
      ? Number(body.loyaltyPoints)
      : undefined,
  };
};

module.exports = {
  PAGE_SIZE,
  parseFilters,
  buildCustomerFilter,
  listCustomers,
  getCustomerStats,
  buildPagination,
  hasActiveFilters,
  buildQueryString,
  exportCustomersCsv,
  getCustomerProfile,
  parseCustomerBody,
  isPassportExpiringSoon,
};
