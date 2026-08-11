const AppError = require('../utils/AppError');

const authorize = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('غير مصرح', 401));
    }

    if (permissions.length === 0) return next();

    const hasAccess = permissions.some((perm) => req.user.hasPermission(perm));
    if (!hasAccess) {
      return next(new AppError('ليس لديك صلاحية للوصول إلى هذا المورد', 403));
    }
    next();
  };
};

module.exports = { authorize };
