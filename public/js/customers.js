document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.customers-table-row').forEach((row) => {
    const href = row.dataset.href;
    if (!href) return;

    row.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      window.location.href = href;
    });
  });

  const printBtn = document.getElementById('customerPrintBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => window.print());
  }

  const filterForm = document.getElementById('customersFilterForm');
  if (filterForm) {
    filterForm.querySelectorAll('select').forEach((sel) => {
      sel.addEventListener('change', () => {
        if (sel.name === 'sort') return;
      });
    });
  }
});
