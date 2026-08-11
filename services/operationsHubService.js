const mongoose = require('mongoose');
const Reservation = require('../models/Reservation');
const Trip = require('../models/Trip');
const {
  flattenVisaRecords,
  flattenTransportRecords,
  buildVisaStatusCounts,
  buildTransportStatusCounts,
} = require('./tripHubService');
const { genderLabel, statusLabel } = require('../utils/helpers');

const PAGE_SIZE = 25;
const EXPORT_LIMIT = 5000;

const VISA_STATUSES = ['pending', 'submitted', 'approved', 'rejected', 'issued'];
const TRANSPORT_STATUSES = ['pending', 'assigned', 'confirmed'];

const csvEscape = (val) => {
  const str = val == null ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const formatCsvDate = (d) => (d ? new Date(d).toISOString().split('T')[0] : '');

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

const parseBaseFilters = (query) => ({
  tripId: query.tripId || '',
  search: (query.search || '').trim(),
  page: Math.max(1, parseInt(query.page, 10) || 1),
});

const parseVisaFilters = (query) => ({
  ...parseBaseFilters(query),
  visaStatus: query.visaStatus || '',
});

const parseTransportFilters = (query) => ({
  ...parseBaseFilters(query),
  transportStatus: query.transportStatus || '',
  transportGroup: (query.transportGroup || '').trim(),
});

const buildReservationQuery = (filters) => {
  const match = { status: 'active' };
  if (filters.tripId && mongoose.Types.ObjectId.isValid(filters.tripId)) {
    match.tripId = filters.tripId;
  }
  return match;
};

const filterRecordsBySearch = (records, search) => {
  if (!search) return records;
  const q = search.toLowerCase();
  return records.filter(({ reservation, member, trip }) =>
    (member.name || '').toLowerCase().includes(q)
    || (member.passport || '').toLowerCase().includes(q)
    || (reservation.reservationNumber || '').toLowerCase().includes(q)
    || (reservation.primaryCustomerName || '').toLowerCase().includes(q)
    || (reservation.primaryPhone || '').includes(q)
    || (trip?.name || '').toLowerCase().includes(q)
    || (member.transportGroup || '').toLowerCase().includes(q));
};

const paginateRecords = (records, page) => {
  const totalCount = records.length;
  const skip = (page - 1) * PAGE_SIZE;
  return {
    items: records.slice(skip, skip + PAGE_SIZE),
    totalCount,
  };
};

const fetchActiveReservations = async (filters) => {
  return Reservation.find(buildReservationQuery(filters))
    .populate('tripId', 'name startDate endDate status')
    .populate('members.customerId', 'name passport')
    .sort({ bookingDate: -1 })
    .limit(500);
};

const listVisaRecords = async (rawQuery) => {
  const filters = parseVisaFilters(rawQuery);
  const reservations = await fetchActiveReservations(filters);
  let records = flattenVisaRecords(reservations, filters.visaStatus);
  records = filterRecordsBySearch(records, filters.search);
  const { items, totalCount } = paginateRecords(records, filters.page);
  const statusCounts = buildVisaStatusCounts(reservations);
  return { items, totalCount, filters, statusCounts };
};

const listTransportRecords = async (rawQuery) => {
  const filters = parseTransportFilters(rawQuery);
  const reservations = await fetchActiveReservations(filters);
  let records = flattenTransportRecords(reservations, filters.transportStatus);
  if (filters.transportGroup) {
    const g = filters.transportGroup.toLowerCase();
    records = records.filter((r) => (r.member.transportGroup || '').toLowerCase().includes(g));
  }
  records = filterRecordsBySearch(records, filters.search);
  const groups = [...new Set(
    flattenTransportRecords(reservations, '')
      .map((r) => r.member.transportGroup)
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'ar'));
  const { items, totalCount } = paginateRecords(records, filters.page);
  const statusCounts = buildTransportStatusCounts(reservations);
  return { items, totalCount, filters, statusCounts, groups };
};

const hasVisaActiveFilters = (filters) => Boolean(
  filters.search || filters.tripId || filters.visaStatus
);

const hasTransportActiveFilters = (filters) => Boolean(
  filters.search || filters.tripId || filters.transportStatus || filters.transportGroup
);

const buildVisaQueryString = (filters, overrides = {}) => {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.search) params.set('search', merged.search);
  if (merged.tripId) params.set('tripId', merged.tripId);
  if (merged.visaStatus) params.set('visaStatus', merged.visaStatus);
  if (merged.page && merged.page > 1) params.set('page', String(merged.page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

const buildTransportQueryString = (filters, overrides = {}) => {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.search) params.set('search', merged.search);
  if (merged.tripId) params.set('tripId', merged.tripId);
  if (merged.transportStatus) params.set('transportStatus', merged.transportStatus);
  if (merged.transportGroup) params.set('transportGroup', merged.transportGroup);
  if (merged.page && merged.page > 1) params.set('page', String(merged.page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

const exportVisaCsv = async (rawQuery, { all = false } = {}) => {
  const filters = parseVisaFilters(rawQuery);
  const reservations = await fetchActiveReservations(all ? { tripId: '' } : filters);
  let records = flattenVisaRecords(reservations, all ? '' : filters.visaStatus);
  if (!all) records = filterRecordsBySearch(records, filters.search);
  records = records.slice(0, EXPORT_LIMIT);

  const headers = [
    'المعتمر', 'الجواز', 'الجنسية', 'الجنس', 'الفئة',
    'رقم الحجز', 'العميل الرئيسي', 'الهاتف', 'الرحلة', 'تاريخ الرحلة', 'حالة التأشيرة',
  ];
  const rows = records.map(({ reservation, member, trip }) => [
    member.name || '',
    member.passport || '',
    member.nationality || '',
    genderLabel(member.gender),
    statusLabel(member.type),
    reservation.reservationNumber || '',
    reservation.primaryCustomerName || '',
    reservation.primaryPhone || '',
    trip?.name || '',
    formatCsvDate(trip?.startDate),
    statusLabel(member.visaStatus || 'pending'),
  ]);

  const bom = '\uFEFF';
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((row) => lines.push(row.map(csvEscape).join(',')));
  return bom + lines.join('\n');
};

const exportTransportCsv = async (rawQuery, { all = false } = {}) => {
  const filters = parseTransportFilters(rawQuery);
  const reservations = await fetchActiveReservations(all ? { tripId: '' } : filters);
  let records = flattenTransportRecords(reservations, all ? '' : filters.transportStatus);
  if (!all && filters.transportGroup) {
    const g = filters.transportGroup.toLowerCase();
    records = records.filter((r) => (r.member.transportGroup || '').toLowerCase().includes(g));
  }
  if (!all) records = filterRecordsBySearch(records, filters.search);
  records = records.slice(0, EXPORT_LIMIT);

  const headers = [
    'المعتمر', 'الجواز', 'الجنسية', 'الجنس', 'الفئة',
    'رقم الحجز', 'العميل الرئيسي', 'الهاتف', 'الرحلة', 'تاريخ الرحلة',
    'المجموعة', 'حالة النقل',
  ];
  const rows = records.map(({ reservation, member, trip }) => [
    member.name || '',
    member.passport || '',
    member.nationality || '',
    genderLabel(member.gender),
    statusLabel(member.type),
    reservation.reservationNumber || '',
    reservation.primaryCustomerName || '',
    reservation.primaryPhone || '',
    trip?.name || '',
    formatCsvDate(trip?.startDate),
    member.transportGroup || '',
    statusLabel(member.transportStatus || 'pending'),
  ]);

  const bom = '\uFEFF';
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((row) => lines.push(row.map(csvEscape).join(',')));
  return bom + lines.join('\n');
};

const getVisaStats = (statusCounts, totalCount) => ({
  total: totalCount,
  pending: statusCounts.pending || 0,
  submitted: statusCounts.submitted || 0,
  approved: statusCounts.approved || 0,
  rejected: statusCounts.rejected || 0,
  issued: statusCounts.issued || 0,
});

const getTransportStats = (statusCounts, totalCount, groups) => ({
  total: totalCount,
  pending: statusCounts.pending || 0,
  assigned: statusCounts.assigned || 0,
  confirmed: statusCounts.confirmed || 0,
  groups: groups?.length || 0,
});

module.exports = {
  PAGE_SIZE,
  VISA_STATUSES,
  TRANSPORT_STATUSES,
  listVisaRecords,
  listTransportRecords,
  buildPagination,
  hasVisaActiveFilters,
  hasTransportActiveFilters,
  buildVisaQueryString,
  buildTransportQueryString,
  exportVisaCsv,
  exportTransportCsv,
  getVisaStats,
  getTransportStats,
};
