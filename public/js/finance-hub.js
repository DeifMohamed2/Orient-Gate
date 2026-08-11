/**
 * Finance hub — filters, trip matrix, sortable table
 */
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('financeFilterForm');
  if (!form) return;

  const fromInput = document.getElementById('financeFromDate');
  const toInput = document.getElementById('financeToDate');
  const tabInput = document.getElementById('financeActiveTab');

  const formatDateInput = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const setDateRange = (start, end) => {
    if (fromInput) fromInput.value = start ? formatDateInput(start) : '';
    if (toInput) toInput.value = end ? formatDateInput(end) : '';
  };

  document.querySelectorAll('.finance-date-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-preset');
      const now = new Date();

      if (preset === 'this-month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        setDateRange(start, end);
      } else if (preset === 'last-month') {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        setDateRange(start, end);
      } else if (preset === 'clear') {
        setDateRange(null, null);
      }
    });
  });

  document.querySelectorAll('.finance-ledger-tabs .nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      const url = new URL(link.href, window.location.origin);
      const tab = url.searchParams.get('tab') || 'invoices';
      if (tabInput) tabInput.value = tab;
    });
  });

  form.addEventListener('submit', () => {
    const activeTabLink = document.querySelector('.finance-ledger-tabs .nav-link.active');
    if (activeTabLink && tabInput) {
      const url = new URL(activeTabLink.href, window.location.origin);
      tabInput.value = url.searchParams.get('tab') || tabInput.value || 'invoices';
    }
  });

  // Trip matrix expand/collapse
  document.querySelectorAll('.finance-trip-matrix-row').forEach((row) => {
    const toggle = () => {
      const idx = row.getAttribute('data-trip-idx');
      const detail = document.querySelector(`tr.finance-trip-detail-row[data-detail-for="${idx}"]`);
      if (!detail) return;
      const isOpen = !detail.classList.contains('d-none');
      detail.classList.toggle('d-none', isOpen);
      row.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      row.classList.toggle('finance-trip-matrix-row--open', !isOpen);
    };
    row.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      toggle();
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });

  // Sortable trip matrix
  const matrixTable = document.getElementById('financeTripMatrixTable');
  if (matrixTable) {
    const tbody = matrixTable.querySelector('tbody');
    const headers = matrixTable.querySelectorAll('th.finance-sortable');
    let sortKey = null;
    let sortDir = 1;

    const getRowPairs = () => {
      const pairs = [];
      const rows = Array.from(tbody.querySelectorAll('tr.finance-trip-matrix-row'));
      rows.forEach((row) => {
        const idx = row.getAttribute('data-trip-idx');
        const detail = tbody.querySelector(`tr.finance-trip-detail-row[data-detail-for="${idx}"]`);
        pairs.push({ row, detail });
      });
      return pairs;
    };

    headers.forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort');
        if (!key) return;

        if (sortKey === key) sortDir *= -1;
        else { sortKey = key; sortDir = 1; }

        headers.forEach((h) => h.classList.remove('finance-sortable--asc', 'finance-sortable--desc'));
        th.classList.add(sortDir > 0 ? 'finance-sortable--asc' : 'finance-sortable--desc');

        const pairs = getRowPairs();
        const colIdx = Array.from(th.parentNode.children).indexOf(th);

        pairs.sort((a, b) => {
          let aVal;
          let bVal;
          if (key === 'name') {
            aVal = a.row.querySelector('td')?.textContent?.trim() || '';
            bVal = b.row.querySelector('td')?.textContent?.trim() || '';
            return sortDir * aVal.localeCompare(bVal, 'ar');
          }
          const aCell = a.row.children[colIdx];
          const bCell = b.row.children[colIdx];
          aVal = parseFloat(aCell?.getAttribute('data-value') || aCell?.dataset?.value || 0);
          bVal = parseFloat(bCell?.getAttribute('data-value') || bCell?.dataset?.value || 0);
          return sortDir * (aVal - bVal);
        });

        pairs.forEach(({ row, detail }) => {
          tbody.appendChild(row);
          if (detail) tbody.appendChild(detail);
        });
      });
    });
  }
});
