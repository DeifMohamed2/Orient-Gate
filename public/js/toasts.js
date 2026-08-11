/**
 * Orient Gate — global toast notifications (top-right, RTL)
 */
(function () {
  const MAX_TOASTS = 5;
  const DURATION = {
    success: 5000,
    info: 5000,
    warning: 6000,
    error: 9000,
  };

  const META = {
    success: { title: 'تم بنجاح', icon: 'fa-circle-check' },
    error: { title: 'تعذر الإتمام', icon: 'fa-circle-xmark' },
    warning: { title: 'تنبيه', icon: 'fa-triangle-exclamation' },
    info: { title: 'معلومة', icon: 'fa-circle-info' },
  };

  const TYPE_MAP = {
    danger: 'error',
    error: 'error',
    success: 'success',
    warning: 'warning',
    info: 'info',
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getHost() {
    let host = document.getElementById('ogToastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'ogToastHost';
      host.className = 'og-toast-host';
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    return host;
  }

  function normalizeType(type) {
    const mapped = TYPE_MAP[String(type || 'info').toLowerCase()] || String(type || 'info').toLowerCase();
    return META[mapped] ? mapped : 'info';
  }

  function dismissToast(el) {
    if (!el || el.classList.contains('is-leaving')) return;
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  function notify(type, message, options) {
    const opts = options || {};
    const kind = normalizeType(type);
    const text = String(message || '').trim();
    if (!text) return null;

    const host = getHost();
    const meta = META[kind];
    const duration = opts.duration != null ? opts.duration : DURATION[kind];
    const showTitle = opts.title !== false;

    while (host.children.length >= MAX_TOASTS) {
      dismissToast(host.firstElementChild);
    }

    const el = document.createElement('div');
    el.className = `og-toast og-toast--${kind}`;
    el.setAttribute('role', 'alert');

    const titleHtml = showTitle
      ? `<div class="og-toast__title">${escapeHtml(opts.title || meta.title)}</div>`
      : '';

    el.innerHTML = `
      <span class="og-toast__icon" aria-hidden="true"><i class="fa-solid ${meta.icon}"></i></span>
      <div class="og-toast__body">
        ${titleHtml}
        <div class="og-toast__message">${escapeHtml(text)}</div>
      </div>
      <button type="button" class="og-toast__close" aria-label="إغلاق"><i class="fa-solid fa-xmark"></i></button>
      <div class="og-toast__progress" aria-hidden="true"><span class="og-toast__progress-fill"></span></div>
    `;

    const closeBtn = el.querySelector('.og-toast__close');
    const progressFill = el.querySelector('.og-toast__progress-fill');

    closeBtn.addEventListener('click', () => dismissToast(el));

    let timeoutId;
    const scheduleDismiss = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => dismissToast(el), duration);
    };

    if (duration > 0 && progressFill) {
      progressFill.style.animation = `og-toast-progress ${duration}ms linear forwards`;
      const styleId = 'og-toast-progress-style';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = '@keyframes og-toast-progress { from { transform: scaleX(1); } to { transform: scaleX(0); } }';
        document.head.appendChild(style);
      }
      scheduleDismiss();
      el.addEventListener('mouseenter', () => {
        el.classList.add('is-paused');
        clearTimeout(timeoutId);
        progressFill.style.animationPlayState = 'paused';
      });
      el.addEventListener('mouseleave', () => {
        el.classList.remove('is-paused');
        progressFill.style.animationPlayState = 'running';
        scheduleDismiss();
      });
    }

    host.prepend(el);
    return el;
  }

  notify.success = (msg, opts) => notify('success', msg, opts);
  notify.error = (msg, opts) => notify('error', msg, opts);
  notify.warning = (msg, opts) => notify('warning', msg, opts);
  notify.info = (msg, opts) => notify('info', msg, opts);

  notify.apiError = async (response, fallbackMessage) => {
    const fallback = fallbackMessage || 'تعذر إتمام العملية';
    try {
      const json = await response.json();
      if (json.errors?.length) {
        json.errors.forEach((m) => notify.error(m));
        return;
      }
      notify.error(json.message || fallback);
    } catch {
      notify.error(fallback);
    }
  };

  notify.fromResponse = async (response, fallbackMessage) => {
    if (response.ok) return true;
    await notify.apiError(response, fallbackMessage);
    return false;
  };

  function bootstrapFlash() {
    const dataEl = document.getElementById('ogFlashData');
    if (!dataEl) return;
    try {
      const data = JSON.parse(dataEl.textContent || '{}');
      (data.success || []).forEach((m) => notify.success(m));
      (data.error || []).forEach((m) => notify.error(m));
      (data.warning || []).forEach((m) => notify.warning(m));
      (data.info || []).forEach((m) => notify.info(m));
    } catch (e) {
      console.warn('[Orient Gate] Could not parse flash messages', e);
    }
  }

  window.OGToast = notify;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapFlash);
  } else {
    bootstrapFlash();
  }
})();
