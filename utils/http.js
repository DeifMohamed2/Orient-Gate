/**
 * Detect whether the client expects a JSON error/success payload.
 * HTML form posts must never receive raw JSON in the browser.
 */
const JSON_ENDPOINT_RE = /\/(hotels-json|preview-pricing|vip-items|search)(\?|$)/;

const isHtmlFormSubmission = (req) => {
  const method = req.method;
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') return false;
  const ct = (req.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  return ct === 'application/x-www-form-urlencoded' || ct === 'multipart/form-data';
};

const wantsJsonResponse = (req) => {
  if (req.originalUrl.startsWith('/api/')) return true;
  if (JSON_ENDPOINT_RE.test(req.originalUrl)) return true;
  if (req.get('X-Requested-With') === 'XMLHttpRequest') return true;
  if (req.is('application/json')) return true;
  const accept = (req.get('Accept') || '').toLowerCase();
  if (accept.includes('application/json') && !accept.includes('text/html')) return true;
  if (isHtmlFormSubmission(req)) return false;
  return false;
};

const { getHomePath } = require('./helpers');

const getSafeRedirectUrl = (req) => {
  const referer = req.get('Referer');
  const host = req.get('host');
  if (referer && host && referer.includes(host)) {
    try {
      const url = new URL(referer);
      return url.pathname + url.search;
    } catch {
      /* ignore invalid referer */
    }
  }
  const path = req.originalUrl.split('?')[0];
  if (path.includes('/trips')) return '/trips/new';
  if (path.includes('/reservations')) return '/reservations/new';
  if (path.includes('/customers')) return '/customers';
  if (path.includes('/supervisors')) return '/supervisors';
  if (path.includes('/brokers')) return '/brokers';
  if (req.user) return getHomePath(req.user);
  return '/dashboard';
};

module.exports = { wantsJsonResponse, isHtmlFormSubmission, getSafeRedirectUrl };
