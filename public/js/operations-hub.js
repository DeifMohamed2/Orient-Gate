document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.ops-inline-form').forEach((form) => {
    form.addEventListener('submit', (e) => {
      const btn = form.querySelector('button[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      }
    });
  });
});
