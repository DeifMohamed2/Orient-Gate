const jwt = require('jsonwebtoken');
const User = require('../models/User');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { getHomePath } = require('../utils/helpers');

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
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
      return res.render('auth/login', {
        title: 'تسجيل الدخول',
        layout: 'layouts/auth',
        error: error.message,
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
  res.render('auth/login', { title: 'تسجيل الدخول', layout: 'layouts/auth', error: null });
};

module.exports = { login, logout, showLogin };
