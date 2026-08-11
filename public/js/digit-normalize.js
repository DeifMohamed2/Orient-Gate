/**
 * Auto-convert Arabic/Persian/full-width digits to Western (0-9) in form fields.
 */
(function () {
  const ARABIC_INDIC_ZERO = 0x0660;
  const EXT_ARABIC_INDIC_ZERO = 0x06f0;
  const FULLWIDTH_ZERO = 0xff10;

  const normalizeDigits = (value) => {
    if (value == null || typeof value !== 'string') return value;
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
        // skip thousands separator
      } else {
        out += value[i];
      }
    }
    return out;
  };

  const SKIP_INPUT_TYPES = new Set([
    'checkbox', 'radio', 'file', 'hidden', 'color', 'range',
    'submit', 'button', 'reset', 'image', 'password',
  ]);

  const shouldNormalize = (el) => {
    if (!el || el.disabled) return false;
    if (el.dataset.noDigitNormalize === 'true') return false;
    const tag = el.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false;
    if (tag === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (SKIP_INPUT_TYPES.has(type)) return false;
    }
    return true;
  };

  const mapCursor = (str, index) => {
    if (index == null || index < 0) return index;
    return normalizeDigits(str.slice(0, index)).length;
  };

  const normalizeField = (el) => {
    if (!shouldNormalize(el)) return false;
    const before = el.value;
    const after = normalizeDigits(before);
    if (before === after) return false;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    el.value = after;

    if (typeof start === 'number' && typeof end === 'number') {
      try {
        el.setSelectionRange(mapCursor(before, start), mapCursor(before, end));
      } catch { /* ignore for unsupported types */ }
    }
    return true;
  };

  const normalizeForm = (form) => {
    if (!form || form.tagName !== 'FORM') return;
    form.querySelectorAll('input, textarea').forEach((el) => normalizeField(el));
  };

  document.addEventListener('input', (e) => {
    normalizeField(e.target);
  }, true);

  document.addEventListener('paste', (e) => {
    const el = e.target;
    if (!shouldNormalize(el)) return;
    requestAnimationFrame(() => normalizeField(el));
  }, true);

  document.addEventListener('submit', (e) => {
    normalizeForm(e.target);
  }, true);

  window.OGDigits = {
    normalize: normalizeDigits,
    normalizeField,
    normalizeForm,
  };
})();
