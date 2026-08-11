const Broker = require('../models/Broker');
const AppError = require('../utils/AppError');
const { formatDate, formatCurrency, statusLabel } = require('../utils/helpers');
const {
  listBrokers,
  getBrokerStats,
  getBrokerProfile,
  searchBrokers,
  parseBrokerBody,
  buildPagination,
  buildQueryString,
} = require('../services/brokerService');

const index = async (req, res, next) => {
  try {
    const [{ items, totalCount, filters }, stats] = await Promise.all([
      listBrokers(req.query),
      getBrokerStats(),
    ]);
    const pagination = buildPagination(filters.page, totalCount);

    res.render('brokers/index', {
      title: 'السماسرة',
      brokers: items,
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
    const profile = await getBrokerProfile(req.params.id);
    if (!profile) throw new AppError('السمسار غير موجود', 404);

    res.render('brokers/show', {
      title: profile.broker.name,
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
  res.render('brokers/new', {
    title: 'سمسار جديد',
    broker: {},
  });
};

const create = async (req, res, next) => {
  try {
    const data = parseBrokerBody(req.body);
    const broker = await Broker.create({
      ...data,
      createdBy: req.user._id,
    });
    req.flash('success', 'تم إضافة السمسار بنجاح');
    res.redirect(`/brokers/${broker._id}`);
  } catch (error) {
    next(error);
  }
};

const editForm = async (req, res, next) => {
  try {
    const broker = await Broker.findById(req.params.id);
    if (!broker) throw new AppError('السمسار غير موجود', 404);
    res.render('brokers/edit', {
      title: 'تعديل السمسار',
      broker,
    });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const data = parseBrokerBody(req.body);
    const broker = await Broker.findByIdAndUpdate(
      req.params.id,
      { ...data, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );
    if (!broker) throw new AppError('السمسار غير موجود', 404);
    req.flash('success', 'تم تحديث بيانات السمسار');
    res.redirect(`/brokers/${broker._id}`);
  } catch (error) {
    next(error);
  }
};

const search = async (req, res, next) => {
  try {
    const items = await searchBrokers(req.query.q, 20);
    res.json(items.map((b) => ({
      id: b._id,
      name: b.name,
      company: b.company,
      phones: b.phones,
      label: b.company ? `${b.name} — ${b.company}` : b.name,
    })));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  index, show, newForm, create, editForm, update, search,
};
