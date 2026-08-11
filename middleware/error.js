const AppError = require('../utils/AppError');
const { wantsJsonResponse, getSafeRedirectUrl } = require('../utils/http');

const USER_MESSAGES = {
  400: 'تعذر إتمام العملية — يرجى مراجعة البيانات',
  401: 'يجب تسجيل الدخول للمتابعة',
  403: 'لا تملك صلاحية لهذا الإجراء',
  404: 'العنصر المطلوب غير موجود',
  409: 'تعارض في البيانات — يرجى المحاولة مرة أخرى',
  422: 'يرجى تصحيح الأخطاء في النموذج',
  500: 'حدث خطأ في الخادم — يرجى المحاولة لاحقاً',
};

const flashErrorMessages = (req, err, message) => {
  const validationMessages = err.details?.validationMessages;
  if (validationMessages?.length) {
    validationMessages.forEach((m) => req.flash('error', m));
    return;
  }
  req.flash('error', message);
};

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const isAppError = err instanceof AppError;
  const userMessage = isAppError && err.message
    ? err.message
    : (USER_MESSAGES[statusCode] || USER_MESSAGES[500]);

  if (!isAppError) {
    console.error(err);
  }

  if (wantsJsonResponse(req)) {
    const payload = {
      success: false,
      message: userMessage,
    };
    if (err.details?.validationMessages?.length) {
      payload.errors = err.details.validationMessages;
    }
    return res.status(statusCode).json(payload);
  }

  if (isAppError) {
    flashErrorMessages(req, err, userMessage);

    if (req.method !== 'GET' && /\/trips(\/|$)/.test(req.originalUrl) && req.body && Object.keys(req.body).length) {
      req.session.tripFormDraft = {
        body: req.body,
        mode: req.method === 'PUT' ? 'edit' : 'create',
        tripId: req.params?.id || null,
        savedAt: Date.now(),
      };
    }

    if (req.method === 'POST' && /\/reservations(\/|$)/.test(req.originalUrl) && req.body && Object.keys(req.body).length > 0) {
      req.session.reservationFormDraft = {
        body: req.body,
        savedAt: Date.now(),
      };
    }

    if (req.method === 'GET') {
      return res.status(statusCode).render('errors/error', {
        title: 'خطأ',
        message: userMessage,
        statusCode,
        layout: false,
      });
    }

    return res.redirect(getSafeRedirectUrl(req));
  }

  req.flash('error', USER_MESSAGES[500]);

  if (req.method === 'GET') {
    return res.status(500).render('errors/error', {
      title: 'خطأ',
      message: USER_MESSAGES[500],
      statusCode: 500,
      layout: false,
    });
  }

  return res.redirect(getSafeRedirectUrl(req));
};

module.exports = errorHandler;
