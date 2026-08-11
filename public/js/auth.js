// Auth page helpers
document.addEventListener('DOMContentLoaded', () => {
  const loginErrorEl = document.getElementById('ogLoginError');
  if (loginErrorEl && window.OGToast) {
    try {
      const message = JSON.parse(loginErrorEl.textContent || '');
      if (message) window.OGToast.error(message, { title: 'تعذر الدخول' });
    } catch { /* ignore */ }
  }
});

document.querySelectorAll('.auth-field input').forEach((el) => {
  el.addEventListener('focus', () => el.parentElement.classList.add('focused'));
  el.addEventListener('blur', () => el.parentElement.classList.remove('focused'));
});
