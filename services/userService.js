const User = require('../models/User');
const { ASSIGNABLE_ROLES } = require('../config/constants');
const { roleLabel } = require('../utils/helpers');
const AppError = require('../utils/AppError');

const PAGE_SIZE = 25;
const EXPORT_LIMIT = 5000;
const ROLE_LIST = ASSIGNABLE_ROLES;

const csvEscape = (val) => {
  const str = val == null ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const formatCsvDate = (d) => (d ? new Date(d).toISOString().split('T')[0] : '');
const boolCsv = (v) => (v ? 'نعم' : 'لا');

const parseFilters = (query) => ({
  search: (query.search || '').trim(),
  role: query.role || '',
  status: query.status || '',
  page: Math.max(1, parseInt(query.page, 10) || 1),
});

const buildUserFilter = (filters) => {
  const match = {};
  if (filters.role && ROLE_LIST.includes(filters.role)) match.role = filters.role;
  if (filters.status === 'active') match.isActive = true;
  if (filters.status === 'inactive') match.isActive = false;
  if (filters.search) {
    match.$or = [
      { name: new RegExp(filters.search, 'i') },
      { email: new RegExp(filters.search, 'i') },
      { phone: new RegExp(filters.search, 'i') },
    ];
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
  filters.search || filters.role || filters.status
);

const buildQueryString = (filters, overrides = {}) => {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.search) params.set('search', merged.search);
  if (merged.role) params.set('role', merged.role);
  if (merged.status) params.set('status', merged.status);
  if (merged.page && merged.page > 1) params.set('page', String(merged.page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

const getRoleCounts = async (baseMatch = {}) => {
  const rows = await User.aggregate([
    { $match: baseMatch },
    { $group: { _id: '$role', count: { $sum: 1 } } },
  ]);
  const counts = {};
  ROLE_LIST.forEach((r) => { counts[r] = 0; });
  rows.forEach((r) => { counts[r._id] = r.count; });
  return counts;
};

const getUserStats = async (filters) => {
  const match = buildUserFilter(filters);
  const [total, active, inactive, roleCounts] = await Promise.all([
    User.countDocuments(match),
    User.countDocuments({ ...match, isActive: true }),
    User.countDocuments({ ...match, isActive: false }),
    getRoleCounts(match),
  ]);
  return { total, active, inactive, roleCounts };
};

const listUsers = async (rawQuery) => {
  const filters = parseFilters(rawQuery);
  const match = buildUserFilter(filters);
  const skip = (filters.page - 1) * PAGE_SIZE;

  const [users, totalCount] = await Promise.all([
    User.find(match)
      .select('-password')
      .sort({ isActive: -1, createdAt: -1 })
      .skip(skip)
      .limit(PAGE_SIZE),
    User.countDocuments(match),
  ]);

  return { users, totalCount, filters };
};

const exportUsersCsv = async (rawQuery, { all = false } = {}) => {
  const filters = all ? parseFilters({}) : parseFilters(rawQuery);
  const match = all ? {} : buildUserFilter(filters);

  const users = await User.find(match)
    .select('-password')
    .sort({ isActive: -1, createdAt: -1 })
    .limit(EXPORT_LIMIT);

  const headers = [
    'الاسم', 'البريد', 'الهاتف', 'الدور', 'نشط',
    'آخر دخول', 'تاريخ الإنشاء', 'تاريخ التحديث',
  ];

  const rows = users.map((u) => [
    u.name,
    u.email,
    u.phone || '',
    roleLabel(u.role),
    boolCsv(u.isActive),
    formatCsvDate(u.lastLogin),
    formatCsvDate(u.createdAt),
    formatCsvDate(u.updatedAt),
  ]);

  const bom = '\uFEFF';
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((row) => lines.push(row.map(csvEscape).join(',')));
  return bom + lines.join('\n');
};

const parseUserBody = (body) => {
  if (!ASSIGNABLE_ROLES.includes(body.role)) {
    throw new AppError('الدور المحدد غير مسموح', 400);
  }
  const data = {
    name: body.name,
    email: body.email,
    role: body.role,
    phone: body.phone || undefined,
    isActive: body.isActive === 'true' || body.isActive === true,
  };
  if (body.password) data.password = body.password;
  return data;
};

module.exports = {
  PAGE_SIZE,
  ROLE_LIST,
  parseFilters,
  listUsers,
  getUserStats,
  buildPagination,
  hasActiveFilters,
  buildQueryString,
  exportUsersCsv,
  parseUserBody,
};
