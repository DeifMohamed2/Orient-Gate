const ArrivalNotice = require('../models/ArrivalNotice');
const Trip = require('../models/Trip');
const AppError = require('../utils/AppError');
const { formatDate } = require('../utils/helpers');
const { arrivalNoticeSchema } = require('../validators/schemas');
const {
  listNotices,
  getHubStats,
  buildPagination,
  hasActiveFilters,
  buildQueryString,
  getOrCreateForTrip,
  refreshFromTrip,
  updateNotice,
  issueNotice,
  getNoticePrintData,
  getAgencySettings,
  resolveTripSource,
  buildFieldSources,
  hasTripDataChanged,
  validateNoticeData,
  validateNoticeCompleteness,
  parseNoticeBody,
  SOURCE_LABELS,
} = require('../services/arrivalNoticeService');

const renderEditForm = async (res, {
  notice,
  settings,
  tripSource,
  errors = {},
  formBody = null,
}) => {
  const displayNotice = formBody
    ? { ...notice.toObject(), ...parseNoticeBody(formBody), _id: notice._id, noticeNumber: notice.noticeNumber, status: notice.status, issuedAt: notice.issuedAt, tripId: notice.tripId }
    : notice;

  const fieldSources = buildFieldSources(displayNotice, tripSource);
  const completeness = validateNoticeCompleteness(displayNotice, tripSource);
  const tripDataChanged = hasTripDataChanged(displayNotice, tripSource);

  res.render('arrival-notices/edit', {
    title: `إشعار الوصول #${notice.noticeNumber}`,
    notice: displayNotice,
    settings,
    tripSource,
    fieldSources,
    sourceLabels: SOURCE_LABELS,
    completeness,
    tripDataChanged,
    errors,
    formatDate,
    arrivalNoticeCss: true,
  });
};

const index = async (req, res, next) => {
  try {
    const { notices, totalCount, filters } = await listNotices(req.query);
    const pagination = buildPagination(filters.page, totalCount);
    const stats = await getHubStats();
    const trips = await Trip.find({ status: 'active' }).sort({ startDate: 1 });
    const settings = await getAgencySettings();

    res.render('arrival-notices/index', {
      title: 'إشعارات الوصول',
      notices,
      trips,
      stats,
      settings,
      pagination,
      filters,
      hasActiveFilters: hasActiveFilters(filters),
      buildQueryString,
      formatDate,
      operationsHubCss: true,
      arrivalNoticeCss: true,
    });
  } catch (error) {
    next(error);
  }
};

const forTrip = async (req, res, next) => {
  try {
    const notice = await getOrCreateForTrip(req.params.tripId, req.user._id);
    if (!notice) throw new AppError('الرحلة غير موجودة', 404);
    res.redirect(`/arrival-notices/${notice._id}/edit`);
  } catch (error) {
    next(error);
  }
};

const editForm = async (req, res, next) => {
  try {
    const notice = await ArrivalNotice.findById(req.params.id).populate('tripId', 'name startDate endDate airline');
    if (!notice) throw new AppError('إشعار الوصول غير موجود', 404);
    const [settings, tripSource] = await Promise.all([
      getAgencySettings(),
      resolveTripSource(notice.tripId._id || notice.tripId),
    ]);

    await renderEditForm(res, { notice, settings, tripSource });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const notice = await ArrivalNotice.findById(req.params.id).populate('tripId', 'name startDate endDate airline');
    if (!notice) throw new AppError('إشعار الوصول غير موجود', 404);

    const tripSource = await resolveTripSource(notice.tripId._id || notice.tripId);
    const settings = await getAgencySettings();
    const parsed = parseNoticeBody(req.body);

    const joiResult = arrivalNoticeSchema.validate(req.body, {
      abortEarly: false,
      context: {
        hasMakkah: tripSource?.itinerary?.hasMakkah ?? true,
        hasMedina: tripSource?.itinerary?.hasMedina ?? true,
      },
    });

    const fieldErrors = {};
    if (joiResult.error) {
      joiResult.error.details.forEach((d) => {
        const key = d.path.length ? d.path[0] : 'form';
        if (!fieldErrors[key]) fieldErrors[key] = d.message;
      });
    }

    const serviceValidation = validateNoticeData(parsed, tripSource);
    const errors = { ...fieldErrors, ...serviceValidation.errors };

    if (Object.keys(errors).length > 0) {
      return renderEditForm(res, {
        notice,
        settings,
        tripSource,
        errors,
        formBody: req.body,
      });
    }

    const updated = await updateNotice(req.params.id, req.body, req.user._id);
    req.flash('success', 'تم حفظ إشعار الوصول');
    res.redirect(`/arrival-notices/${updated._id}/edit`);
  } catch (error) {
    next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const notice = await refreshFromTrip(req.params.id, req.user._id);
    if (!notice) throw new AppError('إشعار الوصول غير موجود', 404);
    req.flash('success', 'تم تحديث البيانات من الرحلة');
    res.redirect(`/arrival-notices/${notice._id}/edit`);
  } catch (error) {
    next(error);
  }
};

const issue = async (req, res, next) => {
  try {
    const notice = await ArrivalNotice.findById(req.params.id).populate('tripId', 'name startDate endDate airline');
    if (!notice) throw new AppError('إشعار الوصول غير موجود', 404);

    const tripSource = await resolveTripSource(notice.tripId._id || notice.tripId);
    const validation = validateNoticeData(notice.toObject(), tripSource, { strict: true });

    if (!validation.valid) {
      const settings = await getAgencySettings();
      return renderEditForm(res, {
        notice,
        settings,
        tripSource,
        errors: validation.errors,
      });
    }

    await issueNotice(req.params.id, req.user._id);
    req.flash('success', 'تم إصدار إشعار الوصول');
    res.redirect(`/arrival-notices/${notice._id}/edit`);
  } catch (error) {
    next(error);
  }
};

const printView = async (req, res, next) => {
  try {
    const data = await getNoticePrintData(req.params.id);
    if (!data) throw new AppError('إشعار الوصول غير موجود', 404);
    const autoPrint = req.query.print === '1';

    res.render('arrival-notices/print', {
      layout: false,
      ...data,
      autoPrint,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  index,
  forTrip,
  editForm,
  update,
  refresh,
  issue,
  printView,
};
