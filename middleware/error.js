const AppError = require('../utils/AppError');
const { wantsJsonResponse, getSafeRedirectUrl } = require('../utils/http');

const USER_MESSAGES = {
  400: 'تعذر إتمام العملية — يرجى مراجعة البيانات',
  401: 'يجب تسجيل الدخول للمتابعة',
  403: 'لا تملك صلاحية لهذا الإجراء',
  404: 'الصفحة المطلوبة غير موجودة',
  409: 'تعارض في البيانات — يرجى المحاولة مرة أخرى',
  422: 'يرجى تصحيح الأخطاء في النموذج',
  500: 'حدث خطأ في الخادم — يرجى المحاولة لاحقاً',
};

const ASSET_404_RE = /\.(ico|png|jpe?g|gif|svg|webp|css|js|map|woff2?|ttf|eot|txt|webmanifest)$/i;

const isAssetLikeRequest = (req) => {
  const path = req.path || '';
  return path === '/favicon.ico'
    || path === '/robots.txt'
    || path === '/apple-touch-icon.png'
    || path === '/apple-touch-icon-precomposed.png'
    || ASSET_404_RE.test(path);
};

/** Session/flash may be missing when the store (MongoDB) fails before connect-flash runs. */
const safeFlash = (req, type, message) => {
  if (typeof req.flash === 'function') {
    req.flash(type, message);
  }
};

const flashErrorMessages = (req, err, message) => {
  // Never queue 404s into flash — browsers poll favicon/assets and spam toasts on the next page.
  if (err.statusCode === 404) return;

  const validationMessages = err.details?.validationMessages;
  if (validationMessages?.length) {
    validationMessages.forEach((m) => safeFlash(req, 'error', m));
    return;
  }
  safeFlash(req, 'error', message);
};

const renderErrorPage = (res, statusCode, message) => {
  return res.status(statusCode).render('errors/error', {
    title: 'خطأ',
    message,
    statusCode,
    layout: false,
  });
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

  if (res.headersSent) {
    return next(err);
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

    // Quiet 404 for browsers probing missing favicons/static files — no HTML error page, no flash.
    if (statusCode === 404 && isAssetLikeRequest(req)) {
      return res.status(404).end();
    }

    if (req.session && req.method !== 'GET' && /\/trips(\/|$)/.test(req.originalUrl) && req.body && Object.keys(req.body).length) {
      req.session.tripFormDraft = {
        body: req.body,
        mode: req.method === 'PUT' ? 'edit' : 'create',
        tripId: req.params?.id || null,
        savedAt: Date.now(),
      };
    }

    if (req.session && req.method === 'POST' && /\/reservations(\/|$)/.test(req.originalUrl) && req.body && Object.keys(req.body).length > 0) {
      req.session.reservationFormDraft = {
        body: req.body,
        savedAt: Date.now(),
      };
    }

    if (req.method === 'GET') {
      return renderErrorPage(res, statusCode, userMessage);
    }

    return res.redirect(getSafeRedirectUrl(req));
  }

  safeFlash(req, 'error', USER_MESSAGES[500]);

  if (req.method === 'GET') {
    return renderErrorPage(res, 500, USER_MESSAGES[500]);
  }

  return res.redirect(getSafeRedirectUrl(req));
};

module.exports = errorHandler;
