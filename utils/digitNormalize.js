/**
 * Normalize Arabic / Persian / full-width digits to ASCII 0-9.
 * Also maps Arabic decimal (٫) to . and strips Arabic thousands separator (٬).
 */
const ARABIC_INDIC_ZERO = 0x0660;
const EXT_ARABIC_INDIC_ZERO = 0x06f0;
const FULLWIDTH_ZERO = 0xff10;

const normalizeDigits = (value) => {
  if (value == null) return value;
  if (typeof value !== 'string') return value;

  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
      out += String(code - ARABIC_INDIC_ZERO);
    } else if (code >= EXT_ARABIC_INDIC_ZERO && code <= EXT_ARABIC_INDIC_ZERO + 9) {
      out += String(code - EXT_ARABIC_INDIC_ZERO);
    } else if (code >= FULLWIDTH_ZERO && code <= FULLWIDTH_ZERO + 9) {
      out += String(code - FULLWIDTH_ZERO);
    } else if (code === 0x066b) {
      out += '.';
    } else if (code === 0x066c) {
      // Arabic thousands separator — omit for plain numeric fields
    } else {
      out += value[i];
    }
  }
  return out;
};

const deepNormalizeDigits = (input) => {
  if (input == null) return input;
  if (typeof input === 'string') return normalizeDigits(input);
  if (Array.isArray(input)) return input.map(deepNormalizeDigits);
  if (typeof input === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(input)) {
      out[key] = deepNormalizeDigits(val);
    }
    return out;
  }
  return input;
};

module.exports = {
  normalizeDigits,
  deepNormalizeDigits,
};
