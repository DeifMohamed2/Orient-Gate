const Trip = require('../models/Trip');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const Reservation = require('../models/Reservation');
const { recordPayment } = require('../services/financeService');
const {
  buildFinanceFilters,
  hasActiveFilters,
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
} = require('../services/financeDashboardService');
const {
  formatDate, formatCurrency, formatSar, formatDualSarEgp, statusLabel, paymentMethodLabel, expenseCategoryLabel,
} = require('../utils/helpers');
const AppError = require('../utils/AppError');

const index = async (req, res, next) => {
  try {
    const filters = buildFinanceFilters(req.query);

    const [tripSummaries, ledger, trips] = await Promise.all([
      getTripSummaries(filters),
      getLedger(filters),
      Trip.find().sort({ status: 1, createdAt: -1, startDate: -1 }).select('name startDate status createdAt'),
    ]);

    const [summary, chartData, aging, ledgerTotals] = await Promise.all([
      getEnterpriseFinanceSummary(filters, tripSummaries),
      getFinanceChartData(filters, tripSummaries),
      getOutstandingAging(filters),
      getLedgerTotals(filters, filters.tab),
    ]);

    const pagination = buildPagination(filters.page, ledger.totalCount);
    const matrixTotals = computeTripMatrixTotals(tripSummaries);

    res.render('finance/index', {
      title: 'المركز المالي',
      summary,
      tripSummaries,
      matrixTotals,
      ledger,
      ledgerTotals,
      trips,
      chartData,
      aging,
      filters,
      pagination,
      activeTab: filters.tab,
      hasActiveFilters: hasActiveFilters(filters),
      buildQueryString,
      formatDate,
      formatCurrency,
      formatSar,
      formatDualSarEgp,
      statusLabel,
      paymentMethodLabel,
      expenseCategoryLabel,
    });
  } catch (error) {
    next(error);
  }
};

const exportLedger = async (req, res, next) => {
  try {
    const type = ['invoices', 'payments', 'expenses', 'outstanding', 'profitability'].includes(req.query.type)
      ? req.query.type
      : 'invoices';
    const filters = buildFinanceFilters(req.query);
    const csv = await exportLedgerCsv(filters, type);
    const filename = `finance-${type}-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

const tripFinance = async (req, res, next) => {
  try {
    const trip = await Trip.findById(req.params.tripId);
    if (!trip) throw new AppError('الرحلة غير موجودة', 404);
    res.redirect(`/trips/${trip._id}?tab=finance`);
  } catch (error) {
    next(error);
  }
};

const createPayment = async (req, res, next) => {
  try {
    await recordPayment(req.body, req.user._id);
    req.flash('success', 'تم تسجيل الدفعة بنجاح');
    const redirect = req.body.tripId
      ? `/trips/${req.body.tripId}?tab=finance`
      : '/finance';
    res.redirect(redirect);
  } catch (error) {
    next(error);
  }
};

const createExpense = async (req, res, next) => {
  try {
    await Expense.create({ ...req.body, createdBy: req.user._id });
    const expenseTripId = req.body.tripId;
    req.flash('success', 'تم تسجيل المصروف بنجاح');
    res.redirect(expenseTripId ? `/trips/${expenseTripId}?tab=finance` : '/finance');
  } catch (error) {
    next(error);
  }
};

const createRefund = async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) throw new AppError('مبلغ الاسترداد غير صالح', 400);

    await recordPayment({
      tripId: req.body.tripId,
      reservationId: req.body.reservationId,
      invoiceId: req.body.invoiceId,
      amount: -amount,
      method: req.body.method || 'transfer',
      isRefund: true,
      notes: req.body.notes || 'استرداد',
      paymentDate: req.body.paymentDate,
    }, req.user._id);

    if (req.body.fullRefund === 'true') {
      const invoice = await Invoice.findById(req.body.invoiceId);
      if (invoice) {
        invoice.status = 'refunded';
        await invoice.save();
      }
      const reservation = await Reservation.findById(req.body.reservationId);
      if (reservation) {
        reservation.paymentStatus = 'refunded';
        await reservation.save();
      }
    }

    const redirect = req.body.tripId ? `/trips/${req.body.tripId}?tab=finance` : '/finance';
    req.flash('success', 'تم تسجيل الاسترداد بنجاح');
    res.redirect(redirect);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  index, exportLedger, tripFinance, createPayment, createExpense, createRefund,
};
