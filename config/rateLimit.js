const rateLimit = require('express-rate-limit');
const env = require('./env');

const STATIC_PATH_PREFIXES = ['/css/', '/js/', '/img/', '/images/', '/favicon.ico'];

const isStaticAsset = (req) => STATIC_PATH_PREFIXES.some((prefix) => req.path.startsWith(prefix));

const rateLimitHandler = (req, res) => {
  const message = 'تم تجاوز عدد الطلبات المسموح — يرجى المحاولة بعد قليل';
  if (req.session) req.flash('error', message);
  if (req.method === 'GET') {
    return res.status(429).render('errors/error', {
      title: 'خطأ',
      message,
      statusCode: 429,
      layout: false,
    });
  }
  return res.redirect(req.get('Referer') || '/dashboard');
};

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.nodeEnv === 'production' ? 3000 : 10000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => env.nodeEnv !== 'production' || isStaticAsset(req),
  handler: rateLimitHandler,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => env.nodeEnv !== 'production',
  handler: rateLimitHandler,
});

module.exports = {
  generalLimiter,
  loginLimiter,
};
