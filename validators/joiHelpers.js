const Joi = require('joi');

/** Accepts numbers, empty strings, and null — coerces to 0 when empty. */
const optionalNumber = Joi.number()
  .min(0)
  .allow(null, '')
  .empty(['', null])
  .default(0);

const ROOM_COST_KEYS = ['single', 'double', 'triple', 'quad'];

/** qs may parse numeric keys as arrays — normalize to { "0": {...}, ... }. */
const normalizeKeyedMap = (value) => {
  if (value == null || value === '') return {};
  if (Array.isArray(value)) {
    const obj = {};
    value.forEach((item, i) => {
      if (item != null && typeof item === 'object' && !Array.isArray(item)) {
        obj[String(i)] = item;
      }
    });
    return obj;
  }
  if (typeof value === 'object') return value;
  return {};
};

const roomCostTierSchema = Joi.object(
  ROOM_COST_KEYS.reduce((acc, key) => {
    acc[key] = optionalNumber;
    return acc;
  }, {})
).unknown(true);

/** Hotel night costs / star room maps from HTML forms (array or object keys). */
const flexibleCostMap = Joi.custom((value, helpers) => {
  const normalized = normalizeKeyedMap(value);
  const { error, value: validated } = Joi.object()
    .pattern(Joi.string(), roomCostTierSchema)
    .validate(normalized, { convert: true, abortEarly: false });
  if (error) {
    return helpers.error('any.invalid');
  }
  return validated;
}, 'flexible cost map').default({});

/** Accepts objects; tolerates empty arrays/strings from malformed forms. */
const flexibleObject = Joi.alternatives()
  .try(
    Joi.object().unknown(true),
    Joi.array().items(Joi.object().unknown(true)).custom((arr) => normalizeKeyedMap(arr), 'array to object'),
    Joi.string().valid('').empty('').default({}),
  )
  .default({});

module.exports = { optionalNumber, flexibleObject, flexibleCostMap, normalizeKeyedMap };
