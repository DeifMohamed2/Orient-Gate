/**
 * Dashboard hub — date presets, trips view toggle, activity panel search
 */
document.addEventListener('DOMContentLoaded', () => {
  const formatDateInput = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const setDateRange = (fromInput, toInput, start, end) => {
    if (fromInput) fromInput.value = start ? formatDateInput(start) : '';
    if (toInput) toInput.value = end ? formatDateInput(end) : '';
  };

  document.querySelectorAll('.dash-date-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-preset');
      const fromInput = document.getElementById('dashFromDate');
      const toInput = document.getElementById('dashToDate');
      const now = new Date();

      if (preset === 'this-month') {
        setDateRange(fromInput, toInput,
          new Date(now.getFullYear(), now.getMonth(), 1),
          new Date(now.getFullYear(), now.getMonth() + 1, 0));
      } else if (preset === 'last-month') {
        setDateRange(fromInput, toInput,
          new Date(now.getFullYear(), now.getMonth() - 1, 1),
          new Date(now.getFullYear(), now.getMonth(), 0));
      } else if (preset === 'clear') {
        setDateRange(fromInput, toInput, null, null);
      }
    });
  });

  const viewToggle = document.getElementById('tripsViewToggle');
  const railView = document.getElementById('tripsRailView');
  const gridView = document.getElementById('tripsGridView');

  if (viewToggle && railView && gridView) {
    const showGrid = () => {
      railView.hidden = true;
      gridView.hidden = false;
      viewToggle.dataset.view = 'grid';
      viewToggle.innerHTML = '<i class="fa-solid fa-bars-staggered"></i>';
      viewToggle.title = 'عرض منزلق';
    };

    const showRail = () => {
      railView.hidden = false;
      gridView.hidden = true;
      viewToggle.dataset.view = 'rail';
      viewToggle.innerHTML = '<i class="fa-solid fa-grip"></i>';
      viewToggle.title = 'عرض شبكي';
    };

    viewToggle.addEventListener('click', () => {
      if (viewToggle.dataset.view === 'grid') showRail();
      else showGrid();
    });
  }

  document.querySelectorAll('.dash-panel-search').forEach((input) => {
    const section = input.closest('.dash-activity-section');
    if (!section) return;

    let noResults = section.querySelector('.dash-activity-no-results');
    if (!noResults) {
      noResults = document.createElement('li');
      noResults.className = 'dash-activity-no-results';
      noResults.textContent = 'لا توجد نتائج مطابقة';
      const list = section.querySelector('.dash-activity-list');
      if (list) list.appendChild(noResults);
    }

    const filterItems = () => {
      const q = (input.value || '').trim().toLowerCase();
      const items = section.querySelectorAll('.dash-activity-item');
      let visible = 0;

      items.forEach((item) => {
        const text = (item.getAttribute('data-search') || item.textContent || '').toLowerCase();
        const show = !q || text.includes(q);
        item.classList.toggle('is-hidden', !show);
        if (show) visible++;
      });

      if (noResults) {
        noResults.classList.toggle('is-visible', q.length > 0 && visible === 0);
      }
    };

    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(filterItems, 150);
    });
  });
});
