// Auth page helpers
document.addEventListener('DOMContentLoaded', () => {
  const loginErrorEl = document.getElementById('ogLoginError');
  if (loginErrorEl && window.OGToast) {
    try {
      const message = JSON.parse(loginErrorEl.textContent || '');
      if (message) window.OGToast.error(message, { title: 'تعذر الدخول' });
    } catch { /* ignore */ }
  }

  const form = document.getElementById('authLoginForm');
  const submitBtn = document.getElementById('authSubmitBtn');
  if (!form || !submitBtn) return;

  let submitting = false;

  const setLoading = (loading) => {
    submitting = loading;
    submitBtn.disabled = loading;
    submitBtn.classList.toggle('is-loading', loading);
    submitBtn.setAttribute('aria-busy', loading ? 'true' : 'false');
    const label = submitBtn.querySelector('.auth-submit__label');
    const loadingEl = submitBtn.querySelector('.auth-submit__loading');
    if (label) label.hidden = loading;
    if (loadingEl) loadingEl.hidden = !loading;
  };

  form.addEventListener('submit', (e) => {
    if (submitting) {
      e.preventDefault();
      return;
    }
    if (!form.checkValidity()) return;
    setLoading(true);
  });
});

document.querySelectorAll('.auth-field input').forEach((el) => {
  el.addEventListener('focus', () => el.parentElement.classList.add('focused'));
  el.addEventListener('blur', () => el.parentElement.classList.remove('focused'));
});
