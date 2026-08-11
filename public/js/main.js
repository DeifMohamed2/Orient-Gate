(function () {
  const shell = document.getElementById('appShell');
  const toggle = document.getElementById('sidebarToggle');
  const collapseToggle = document.getElementById('sidebarCollapseToggle');
  const reopenTab = document.getElementById('sidebarReopenTab');
  const sidebar = document.getElementById('appSidebar');
  if (!shell || !sidebar) return;

  const COLLAPSE_KEY = 'og_sidebar_collapsed';
  const DESKTOP_MQ = window.matchMedia('(min-width: 993px)');

  function isDesktop() { return DESKTOP_MQ.matches; }

  function setCollapsed(collapsed) {
    shell.classList.toggle('sidebar-collapsed', collapsed);
    if (collapseToggle) {
      collapseToggle.classList.toggle('is-collapsed', collapsed);
      collapseToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      collapseToggle.title = collapsed ? 'إظهار القائمة' : 'إخفاء القائمة';
      const icon = collapseToggle.querySelector('i');
      if (icon) {
        icon.className = collapsed ? 'fa-solid fa-bars' : 'fa-solid fa-bars';
      }
    }
    if (isDesktop()) {
      try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch (_) {}
    }
  }

  function expandSidebar() {
    shell.classList.remove('sidebar-collapsed', 'sidebar-open');
    setCollapsed(false);
  }

  function applyStoredCollapse() {
    if (!isDesktop()) {
      shell.classList.remove('sidebar-collapsed');
      return;
    }
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1'); } catch (_) { setCollapsed(false); }
  }

  applyStoredCollapse();

  if (collapseToggle) {
    collapseToggle.addEventListener('click', () => {
      if (!isDesktop()) return;
      setCollapsed(!shell.classList.contains('sidebar-collapsed'));
    });
  }

  if (reopenTab) {
    reopenTab.addEventListener('click', () => expandSidebar());
  }

  DESKTOP_MQ.addEventListener('change', () => {
    if (isDesktop()) {
      applyStoredCollapse();
      shell.classList.remove('sidebar-open');
    } else {
      shell.classList.remove('sidebar-collapsed');
    }
  });

  if (toggle) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      shell.classList.toggle('sidebar-open');
    });
    document.addEventListener('click', (e) => {
      if (!shell.classList.contains('sidebar-open') || isDesktop()) return;
      if (!sidebar.contains(e.target) && !toggle.contains(e.target)) {
        shell.classList.remove('sidebar-open');
      }
    });
  }
})();
