const User = require('../models/User');
const { ROLES } = require('../config/constants');
const AppError = require('../utils/AppError');
const { formatDate, roleLabel } = require('../utils/helpers');
const {
  listUsers,
  getUserStats,
  buildPagination,
  hasActiveFilters,
  buildQueryString,
  exportUsersCsv,
  parseUserBody,
  parseFilters,
  ROLE_LIST,
} = require('../services/userService');

const index = async (req, res, next) => {
  try {
    const [{ users, totalCount, filters }, stats] = await Promise.all([
      listUsers(req.query),
      getUserStats(parseFilters(req.query)),
    ]);
    const pagination = buildPagination(filters.page, totalCount);

    res.render('users/index', {
      title: 'المستخدمين',
      users,
      stats,
      pagination,
      filters,
      hasActiveFilters: hasActiveFilters(filters),
      buildQueryString,
      roles: ROLES,
      roleList: ROLE_LIST,
      formatDate,
      roleLabel,
      operationsHubCss: true,
    });
  } catch (error) {
    next(error);
  }
};

const exportCsv = async (req, res, next) => {
  try {
    const all = req.query.scope === 'all';
    const csv = await exportUsersCsv(req.query, { all });
    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="users-${date}.csv"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

const newForm = (req, res) => {
  res.render('users/new', {
    title: 'مستخدم جديد',
    formUser: {},
    roles: ROLES,
    roleList: ROLE_LIST,
    roleLabel,
    operationsHubCss: true,
  });
};

const create = async (req, res, next) => {
  try {
    const data = parseUserBody(req.body);
    if (!data.password) throw new AppError('كلمة المرور مطلوبة', 400);
    const user = await User.create({ ...data, isActive: true, createdBy: req.user._id });
    req.flash('success', 'تم إنشاء المستخدم بنجاح');
    res.redirect(`/users/${user._id}/edit`);
  } catch (error) {
    next(error);
  }
};

const editForm = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) throw new AppError('المستخدم غير موجود', 404);
    res.render('users/edit', {
      title: 'تعديل المستخدم',
      formUser: user,
      roles: ROLES,
      roleList: ROLE_LIST,
      roleLabel,
      formatDate,
      operationsHubCss: true,
    });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const data = parseUserBody(req.body);
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { ...data, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );
    if (!user) throw new AppError('المستخدم غير موجود', 404);
    req.flash('success', 'تم تحديث المستخدم');
    res.redirect('/users');
  } catch (error) {
    next(error);
  }
};

module.exports = { index, newForm, create, editForm, update, exportCsv };
