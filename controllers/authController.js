const jwt = require('jsonwebtoken');
const User = require('../models/User');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { getHomePath } = require('../utils/helpers');

const phoneDigits = (value) => String(value || '').replace(/\D/g, '');

/** Build phone variants so 010… / 10… / +20… all match stored numbers */
const phoneMatchValues = (raw) => {
  const digits = phoneDigits(raw);
  const values = new Set();
  if (!digits) return [];

  values.add(digits);
  if (raw && String(raw).trim()) values.add(String(raw).trim());

  let local = digits;
  if (local.startsWith('20') && local.length >= 12) local = `0${local.slice(2)}`;
  if (!local.startsWith('0') && local.length === 10) local = `0${local}`;

  values.add(local);
  if (local.startsWith('0')) {
    values.add(local.slice(1));
    values.add(`20${local.slice(1)}`);
    values.add(`+20${local.slice(1)}`);
  }

  return [...values].filter(Boolean);
};

const findUserByIdentifier = async (identifier) => {
  const login = String(identifier || '').trim();
  if (!login) return null;

  if (login.includes('@')) {
    return User.findOne({ email: login.toLowerCase() }).select('+password');
  }

  const phones = phoneMatchValues(login);
  if (!phones.length) return null;

  return User.findOne({ phone: { $in: phones } }).select('+password');
};

const renderLogin = (res, { error = null, identifier = '' } = {}) => {
  res.render('auth/login', {
    title: 'تسجيل الدخول',
    layout: 'layouts/auth',
    error,
    identifier,
  });
};

const login = async (req, res, next) => {
  try {
    const identifier = (req.body.identifier || req.body.email || '').trim();
    const { password } = req.body;

    const user = await findUserByIdentifier(identifier);
    if (!user || !user.isActive) {
      throw new AppError('بيانات الدخول غير صحيحة', 401);
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) throw new AppError('بيانات الدخول غير صحيحة', 401);

    const token = jwt.sign({ id: user._id, role: user.role }, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn,
    });

    req.session.token = token;
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    res.redirect(getHomePath(user));
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401) {
      return renderLogin(res, {
        error: error.message,
        identifier: (req.body.identifier || req.body.email || '').trim(),
      });
    }
    next(error);
  }
};

const logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
};

const showLogin = async (req, res) => {
  if (req.session?.token) {
    try {
      const decoded = jwt.verify(req.session.token, env.jwtSecret);
      const user = await User.findById(decoded.id).select('-password');
      if (user && user.isActive) return res.redirect(getHomePath(user));
    } catch {
      /* invalid session */
    }
  }
  renderLogin(res);
};

module.exports = { login, logout, showLogin };
