document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.users-table-row').forEach((row) => {
    const href = row.dataset.href;
    if (!href) return;
    row.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      window.location.href = href;
    });
  });
});
