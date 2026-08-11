const Trip = require('../models/Trip');
const AppError = require('../utils/AppError');
const { formatDate, formatCurrency, statusLabel, roleLabel } = require('../utils/helpers');
const {
  canViewAllSales,
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
} = require('../services/salesHubService');

const getScopeUserId = (req, querySellerId) => {
  if (canViewAllSales(req.user)) {
    return querySellerId || null;
  }
  return req.user._id;
};

const index = async (req, res, next) => {
  try {
    const scopeUserId = getScopeUserId(req, req.query.salesEmployeeId);
    const viewAll = canViewAllSales(req.user);

    const [summary, leaderboard, { bookings, totalCount, filters }, trips, salesUsers] = await Promise.all([
      getSalesSummary(parseFilters(req.query), scopeUserId),
      getSellerLeaderboard(parseFilters(req.query), viewAll ? null : scopeUserId),
      listSalesBookings(req.query, scopeUserId),
      Trip.find({ status: 'active' }).sort({ startDate: 1 }).select('name'),
      viewAll ? getSalesUsers() : Promise.resolve([]),
    ]);

    const pagination = buildPagination(filters.page, totalCount);

    res.render('sales/index', {
      title: 'المبيعات',
      summary,
      leaderboard,
      bookings,
      pagination,
      filters,
      trips,
      salesUsers,
      viewAll,
      hasActiveFilters: hasActiveFilters(filters),
      buildQueryString,
      formatDate,
      formatCurrency,
      statusLabel,
      roleLabel,
      operationsHubCss: true,
    });
  } catch (error) {
    next(error);
  }
};

const seller = async (req, res, next) => {
  try {
    const viewAll = canViewAllSales(req.user);
    if (!viewAll && String(req.params.id) !== String(req.user._id)) {
      throw new AppError('ليس لديك صلاحية لعرض بيانات هذا البائع', 403);
    }

    const profile = await getSellerProfile(req.params.id, req.query);
    if (!profile) throw new AppError('البائع غير موجود', 404);

    const pagination = buildPagination(profile.filters.page, profile.totalCount);
    const trips = await Trip.find({ status: 'active' }).sort({ startDate: 1 }).select('name');

    res.render('sales/seller', {
      title: `مبيعات ${profile.seller.name}`,
      profile,
      pagination,
      trips,
      viewAll,
      hasActiveFilters: hasActiveFilters(profile.filters),
      buildQueryString,
      formatDate,
      formatCurrency,
      statusLabel,
      roleLabel,
      operationsHubCss: true,
    });
  } catch (error) {
    next(error);
  }
};

const exportCsv = async (req, res, next) => {
  try {
    const scopeUserId = getScopeUserId(req, req.query.salesEmployeeId);
    const all = req.query.scope === 'all';
    const csv = await exportSalesCsv(req.query, scopeUserId, { all });
    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="sales-${date}.csv"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

module.exports = { index, seller, exportCsv };
