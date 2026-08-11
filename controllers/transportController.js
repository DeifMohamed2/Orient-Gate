const Reservation = require('../models/Reservation');
const Trip = require('../models/Trip');
const AppError = require('../utils/AppError');
const { formatDate, statusLabel } = require('../utils/helpers');
const {
  listTransportRecords,
  buildPagination,
  hasTransportActiveFilters,
  buildTransportQueryString,
  exportTransportCsv,
  TRANSPORT_STATUSES,
} = require('../services/operationsHubService');

const index = async (req, res, next) => {
  try {
    const { items, totalCount, filters, statusCounts, groups } = await listTransportRecords(req.query);
    const pagination = buildPagination(filters.page, totalCount);
    const trips = await Trip.find({ status: 'active' }).sort({ startDate: 1 });

    res.render('transport/index', {
      title: 'النقل',
      transportRecords: items,
      trips,
      groups,
      statusCounts,
      pagination,
      filters,
      hasActiveFilters: hasTransportActiveFilters(filters),
      buildQueryString: buildTransportQueryString,
      transportStatuses: TRANSPORT_STATUSES,
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
    const csv = await exportTransportCsv(req.query, { all });
    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="transport-${date}.csv"`);
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
    member.transportStatus = req.body.transportStatus;
    if (req.body.transportGroup !== undefined) member.transportGroup = req.body.transportGroup;
    reservation.updatedBy = req.user._id;
    await reservation.save();
    req.flash('success', 'تم تحديث تسكين النقل');
    const tripId = req.body.tripId || reservation.tripId;
    const returnTo = req.body.returnTo || (tripId ? `/trips/${tripId}?tab=operations&ops=transport` : '/transport');
    res.redirect(returnTo);
  } catch (error) {
    next(error);
  }
};

module.exports = { index, updateStatus, exportCsv };
