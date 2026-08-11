const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const AppError = require('../utils/AppError');

const authenticate = async (req, res, next) => {
  try {
    let token = req.session?.token;

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      if (req.originalUrl.startsWith('/api')) {
        return next(new AppError('غير مصرح - يرجى تسجيل الدخول', 401));
      }
      return res.redirect('/auth/login');
    }

    const decoded = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(decoded.id).select('-password');

    if (!user || !user.isActive) {
      if (req.originalUrl.startsWith('/api')) {
        return next(new AppError('المستخدم غير موجود أو غير نشط', 401));
      }
      req.session.destroy();
      return res.redirect('/auth/login');
    }

    req.user = user;
    res.locals.user = user;
    res.locals.currentUser = user;
    next();
  } catch (error) {
    if (req.originalUrl.startsWith('/api')) {
      return next(new AppError('جلسة غير صالحة', 401));
    }
    req.session.destroy();
    return res.redirect('/auth/login');
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const token = req.session?.token;
    if (!token) return next();
    const decoded = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(decoded.id).select('-password');
    if (user && user.isActive) {
      req.user = user;
      res.locals.user = user;
      res.locals.currentUser = user;
    }
    next();
  } catch {
    next();
  }
};

module.exports = { authenticate, optionalAuth };
