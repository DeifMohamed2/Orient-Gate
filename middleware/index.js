const { authenticate, optionalAuth } = require('./auth');
const { authorize } = require('./rbac');
const { validate } = require('./validate');
const audit = require('./audit');
const errorHandler = require('./error');

module.exports = {
  authenticate,
  optionalAuth,
  authorize,
  validate,
  audit,
  errorHandler,
};
