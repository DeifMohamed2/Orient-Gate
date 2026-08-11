/**
 * Normalize indexed form fields (e.g. members[0][name]) into arrays for Joi validation.
 */
const normalizeIndexedArray = (body, fieldName) => {
  const raw = body[fieldName];
  if (!raw) return body;
  if (Array.isArray(raw)) return body;

  if (typeof raw === 'object') {
    const keys = Object.keys(raw)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b));
    body[fieldName] = keys.map((k) => raw[k]);
  }

  return body;
};

/** HTML forms may send duplicate keys (hidden false + checkbox true) as arrays. */
const coerceFormBoolean = (value, defaultVal = false) => {
  let v = value;
  if (Array.isArray(v)) v = v[v.length - 1];
  if (v === 'true' || v === true) return true;
  if (v === 'false' || v === false) return false;
  if (v == null || v === '') return defaultVal;
  return Boolean(v);
};

const normalizeServiceTogglesObject = (raw) => {
  if (!raw || typeof raw !== 'object') return raw;
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key] = coerceFormBoolean(value);
  }
  return out;
};

const normalizeMemberFormValues = (member) => {
  if (!member || typeof member !== 'object') return member;
  if (member.serviceToggles) {
    member.serviceToggles = normalizeServiceTogglesObject(member.serviceToggles);
  }
  if (member.linkedManually != null) {
    member.linkedManually = coerceFormBoolean(member.linkedManually);
  }
  return member;
};

const normalizeReservationBody = (body) => {
  normalizeIndexedArray(body, 'members');
  if (Array.isArray(body.members)) {
    body.members = body.members.map(normalizeMemberFormValues);
  }
  if (body.serviceToggles) {
    body.serviceToggles = normalizeServiceTogglesObject(body.serviceToggles);
  }
  if (body.accommodations && !Array.isArray(body.accommodations)) {
    normalizeIndexedArray(body, 'accommodations');
  }
  return body;
};

module.exports = {
  normalizeIndexedArray,
  normalizeReservationBody,
  coerceFormBoolean,
  normalizeServiceTogglesObject,
};
