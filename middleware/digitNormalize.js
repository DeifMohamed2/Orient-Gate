const { deepNormalizeDigits } = require('../utils/digitNormalize');

/**
 * Normalize Arabic/Persian digits in parsed request bodies (forms + JSON).
 */
const digitNormalizeBody = (req, res, next) => {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    req.body = deepNormalizeDigits(req.body);
  }
  next();
};

module.exports = digitNormalizeBody;
