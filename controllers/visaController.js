const Reservation = require('../models/Reservation');
const Trip = require('../models/Trip');
const AppError = require('../utils/AppError');
const { formatDate, statusLabel } = require('../utils/helpers');
const {
  listVisaRecords,
  buildPagination,
  hasVisaActiveFilters,
  buildVisaQueryString,
  exportVisaCsv,
  VISA_STATUSES,
} = require('../services/operationsHubService');

const index = async (req, res, next) => {
  try {
    const { items, totalCount, filters, statusCounts } = await listVisaRecords(req.query);
    const pagination = buildPagination(filters.page, totalCount);
    const trips = await Trip.find({ status: 'active' }).sort({ startDate: 1 });

    res.render('visa/index', {
      title: 'التأشيرات',
      visaRecords: items,
      trips,
      statusCounts,
      pagination,
      filters,
      hasActiveFilters: hasVisaActiveFilters(filters),
      buildQueryString: buildVisaQueryString,
      visaStatuses: VISA_STATUSES,
      formatDate,
      statusLabel,
      operationsHubCss: true,
    });
  } catch (error) {
    next(error);
  }
};

const exportCsv = async (req, res, next) => {
  try {
    const all = req.query.scope === 'all';
    const csv = await exportVisaCsv(req.query, { all });
    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="visas-${date}.csv"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const reservation = await Reservation.findById(req.params.reservationId);
    if (!reservation) throw new AppError('الحجز غير موجود', 404);
    const member = reservation.members.id(req.params.memberId);
    if (!member) throw new AppError('المعتمر غير موجود', 404);
    member.visaStatus = req.body.visaStatus;
    reservation.updatedBy = req.user._id;
    await reservation.save();
    req.flash('success', 'تم تحديث حالة التأشيرة');
    const tripId = req.body.tripId || reservation.tripId;
    const returnTo = req.body.returnTo || (tripId ? `/trips/${tripId}?tab=operations&ops=visa` : '/visa');
    res.redirect(returnTo);
  } catch (error) {
    next(error);
  }
};

module.exports = { index, updateStatus, exportCsv };
