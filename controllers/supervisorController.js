const Supervisor = require('../models/Supervisor');
const AppError = require('../utils/AppError');
const { formatDate, formatCurrency, statusLabel } = require('../utils/helpers');
const {
  listSupervisors,
  getSupervisorStats,
  getSupervisorProfile,
  searchSupervisors,
  parseSupervisorBody,
  buildPagination,
  buildQueryString,
} = require('../services/supervisorService');

const index = async (req, res, next) => {
  try {
    const [{ items, totalCount, filters }, stats] = await Promise.all([
      listSupervisors(req.query),
      getSupervisorStats(),
    ]);
    const pagination = buildPagination(filters.page, totalCount);

    res.render('supervisors/index', {
      title: 'المشرفين',
      supervisors: items,
      stats,
      pagination,
      filters,
      buildQueryString,
      formatDate,
      formatCurrency,
    });
  } catch (error) {
    next(error);
  }
};

const show = async (req, res, next) => {
  try {
    const profile = await getSupervisorProfile(req.params.id);
    if (!profile) throw new AppError('المشرف غير موجود', 404);

    res.render('supervisors/show', {
      title: profile.supervisor.name,
      profile,
      formatDate,
      formatCurrency,
      statusLabel,
    });
  } catch (error) {
    next(error);
  }
};

const newForm = (req, res) => {
  res.render('supervisors/new', {
    title: 'مشرف جديد',
    supervisor: {},
  });
};

const create = async (req, res, next) => {
  try {
    const data = parseSupervisorBody(req.body);
    const supervisor = await Supervisor.create({
      ...data,
      createdBy: req.user._id,
    });
    req.flash('success', 'تم إضافة المشرف بنجاح');
    res.redirect(`/supervisors/${supervisor._id}`);
  } catch (error) {
    next(error);
  }
};

const editForm = async (req, res, next) => {
  try {
    const supervisor = await Supervisor.findById(req.params.id);
    if (!supervisor) throw new AppError('المشرف غير موجود', 404);
    res.render('supervisors/edit', {
      title: 'تعديل المشرف',
      supervisor,
    });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const data = parseSupervisorBody(req.body);
    const supervisor = await Supervisor.findByIdAndUpdate(
      req.params.id,
      { ...data, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );
    if (!supervisor) throw new AppError('المشرف غير موجود', 404);
    req.flash('success', 'تم تحديث بيانات المشرف');
    res.redirect(`/supervisors/${supervisor._id}`);
  } catch (error) {
    next(error);
  }
};

const search = async (req, res, next) => {
  try {
    const items = await searchSupervisors(req.query.q, 20);
    res.json(items.map((s) => ({
      id: s._id,
      name: s.name,
      phoneEg: s.phoneEg,
      phoneSa: s.phoneSa,
      defaultTripFee: s.defaultTripFee || 0,
      label: s.name,
    })));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  index, show, newForm, create, editForm, update, search,
};
