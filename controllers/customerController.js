const Customer = require('../models/Customer');
const AppError = require('../utils/AppError');
const { formatDate, formatCurrency, genderLabel, statusLabel, paymentMethodLabel } = require('../utils/helpers');
const {
  listCustomers,
  getCustomerStats,
  buildPagination,
  hasActiveFilters,
  buildQueryString,
  exportCustomersCsv,
  getCustomerProfile,
  parseCustomerBody,
} = require('../services/customerService');

const index = async (req, res, next) => {
  try {
    const [{ items, totalCount, filters }, stats] = await Promise.all([
      listCustomers(req.query),
      getCustomerStats(req.query),
    ]);
    const pagination = buildPagination(filters.page, totalCount);

    res.render('customers/index', {
      title: 'العملاء',
      customers: items,
      stats,
      pagination,
      filters,
      hasActiveFilters: hasActiveFilters(filters),
      buildQueryString,
      formatDate,
      genderLabel,
      customersCss: true,
    });
  } catch (error) {
    next(error);
  }
};

const exportCsv = async (req, res, next) => {
  try {
    const all = req.query.scope === 'all';
    const csv = await exportCustomersCsv(req.query, { all });
    const date = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="customers-${date}.csv"`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

const show = async (req, res, next) => {
  try {
    const profile = await getCustomerProfile(req.params.id);
    if (!profile) throw new AppError('العميل غير موجود', 404);

    res.render('customers/show', {
      title: profile.customer.name,
      profile,
      activeTab: req.query.tab || 'overview',
      formatDate,
      formatCurrency,
      genderLabel,
      statusLabel,
      paymentMethodLabel,
      buildQueryString,
      customersCss: true,
    });
  } catch (error) {
    next(error);
  }
};

const newForm = (req, res) => {
  res.render('customers/new', {
    title: 'عميل جديد',
    customer: {},
    customersCss: true,
  });
};

const create = async (req, res, next) => {
  try {
    const data = parseCustomerBody(req.body);
    const customer = await Customer.create({
      ...data,
      createdBy: req.user._id,
    });
    req.flash('success', 'تم إضافة العميل بنجاح');
    res.redirect(`/customers/${customer._id}`);
  } catch (error) {
    next(error);
  }
};

const editForm = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) throw new AppError('العميل غير موجود', 404);
    res.render('customers/edit', {
      title: 'تعديل العميل',
      customer,
      customersCss: true,
    });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const data = parseCustomerBody(req.body);
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { ...data, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );
    if (!customer) throw new AppError('العميل غير موجود', 404);
    req.flash('success', 'تم تحديث بيانات العميل');
    res.redirect(`/customers/${customer._id}`);
  } catch (error) {
    next(error);
  }
};

const search = async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json([]);
    }
    const customers = await Customer.find({
      $or: [
        { name: new RegExp(q, 'i') },
        { passport: new RegExp(q, 'i') },
        { phones: new RegExp(q, 'i') },
      ],
    })
      .limit(15)
      .select('name passport gender nationality phones')
      .lean();

    res.json(customers.map((c) => ({
      id: c._id,
      name: c.name,
      passport: c.passport,
      gender: c.gender,
      nationality: c.nationality,
      phone: (c.phones && c.phones[0]) || '',
      label: c.passport ? `${c.name} — ${c.passport}` : c.name,
    })));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  index, show, newForm, create, editForm, update, exportCsv, search,
};
