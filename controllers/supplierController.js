const Supplier = require('../models/Supplier');
const AppError = require('../utils/AppError');

const index = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.search) filter.name = new RegExp(req.query.search, 'i');
    const suppliers = await Supplier.find(filter).sort({ name: 1 });
    res.render('suppliers/index', { title: 'الموردين', suppliers, filters: req.query });
  } catch (error) {
    next(error);
  }
};

const newForm = (req, res) => {
  res.render('suppliers/new', { title: 'مورد جديد', supplier: {} });
};

const create = async (req, res, next) => {
  try {
    const supplier = await Supplier.create({ ...req.body, createdBy: req.user._id });
    res.redirect('/suppliers');
  } catch (error) {
    next(error);
  }
};

const editForm = async (req, res, next) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) throw new AppError('المورد غير موجود', 404);
    res.render('suppliers/edit', { title: 'تعديل المورد', supplier });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      { ...req.body, isActive: req.body.isActive === 'true' || req.body.isActive === true, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );
    if (!supplier) throw new AppError('المورد غير موجود', 404);
    res.redirect('/suppliers');
  } catch (error) {
    next(error);
  }
};

module.exports = { index, newForm, create, editForm, update };
