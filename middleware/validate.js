const AppError = require('../utils/AppError');
const { formatJoiErrors } = require('../utils/validationMessages');

const validate = (schema, property = 'body', options = {}) => {
  return (req, res, next) => {
    const context = typeof options.getContext === 'function'
      ? options.getContext(req)
      : (req.validationContext || {});

    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: !options.keepUnknown,
      context,
      convert: true,
    });

    if (error) {
      const validationMessages = formatJoiErrors(error);

      if (property === 'body' && /\/trips(\/|$)/.test(req.originalUrl)) {
        req.session.tripFormDraft = {
          body: req.body,
          mode: req.method === 'PUT' ? 'edit' : 'create',
          tripId: req.params?.id || null,
          savedAt: Date.now(),
        };
      }

      if (options.collectFieldErrors) {
        const fieldErrors = {};
        error.details.forEach((d, i) => {
          const key = d.path.length ? d.path.join('.') : (d.context?.key || 'form');
          if (!fieldErrors[key]) fieldErrors[key] = validationMessages[i] || d.message;
        });
        req.validationFieldErrors = fieldErrors;
        return next(new AppError('يرجى تصحيح الأخطاء في النموذج', 422, {
          validationMessages,
        }));
      }

      const summary = validationMessages.length === 1
        ? validationMessages[0]
        : 'يرجى مراجعة البيانات المدخلة في النموذج';

      return next(new AppError(summary, 400, { validationMessages }));
    }

    if (!options.keepUnknown) req[property] = value;
    next();
  };
};

module.exports = { validate };
