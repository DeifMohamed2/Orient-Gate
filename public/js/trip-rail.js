/**
 * Horizontal trip rail — scroll-snap, drag, progress, keyboard
 */
(function () {
  function getCards(rail) {
    return [...rail.querySelectorAll('.trip-card:not([hidden])')];
  }

  function getActiveCardIndex(rail) {
    const cards = getCards(rail);
    if (!cards.length) return { cards, idx: 0 };

    const railRect = rail.getBoundingClientRect();
    let idx = 0;
    let minDist = Infinity;

    cards.forEach((card, i) => {
      const dist = Math.abs(card.getBoundingClientRect().left - railRect.left);
      if (dist < minDist) {
        minDist = dist;
        idx = i;
      }
    });

    return { cards, idx };
  }

  function scrollToCard(rail, card) {
    if (!card) return;
    const delta = card.getBoundingClientRect().left - rail.getBoundingClientRect().left;
    if (Math.abs(delta) < 2) return;
    rail.scrollBy({ left: delta, behavior: 'smooth' });
  }

  function scrollRail(rail, direction, wrap) {
    const { cards, idx } = getActiveCardIndex(rail);
    if (!cards.length) return;

    const newIdx = direction === 'next'
      ? Math.min(idx + 1, cards.length - 1)
      : Math.max(idx - 1, 0);

    if (newIdx === idx) return;
    scrollToCard(rail, cards[newIdx]);
    if (wrap) setTimeout(() => updateRailNav(wrap), 400);
  }

  function updateRailNav(wrap) {
    const rail = wrap.querySelector('.trip-rail');
    const prev = wrap.querySelector('.trip-rail-nav--prev');
    const next = wrap.querySelector('.trip-rail-nav--next');
    const fadeStart = wrap.querySelector('.trip-rail-fade--start');
    const fadeEnd = wrap.querySelector('.trip-rail-fade--end');
    const progress = wrap.querySelector('.trip-rail-progress-bar');
    if (!rail) return;

    const { cards, idx } = getActiveCardIndex(rail);
    const atStart = idx <= 0;
    const atEnd = idx >= cards.length - 1;

    if (prev) prev.disabled = atStart;
    if (next) next.disabled = atEnd;
    if (fadeStart) fadeStart.classList.toggle('is-hidden', atStart);
    if (fadeEnd) fadeEnd.classList.toggle('is-hidden', atEnd);

    if (progress) {
      const pct = cards.length > 1 ? Math.round((idx / (cards.length - 1)) * 100) : 100;
      progress.style.width = `${pct}%`;
    }

    const dots = wrap.querySelector('.trip-rail-dots');
    if (dots) {
      dots.querySelectorAll('.trip-rail-dot').forEach((dot, i) => {
        dot.classList.toggle('is-active', i === idx);
      });
    }
  }

  function initDragScroll(rail) {
    let isDown = false;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    const DRAG_THRESHOLD = 8;

    const releasePointer = (e) => {
      if (e.pointerId && rail.releasePointerCapture) {
        try { rail.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
    };

    const onDown = (e) => {
      if (e.target.closest('a, button')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      isDown = true;
      isDragging = false;
      startX = e.pageX || e.clientX;
      startY = e.pageY || e.clientY;
      scrollLeft = rail.scrollLeft;
    };

    const onUp = (e) => {
      if (!isDown && !isDragging) return;
      isDown = false;
      isDragging = false;
      rail.classList.remove('is-dragging');
      releasePointer(e);
    };

    const onMove = (e) => {
      if (!isDown) return;

      const x = e.pageX || e.clientX;
      const y = e.pageY || e.clientY;
      const dx = x - startX;
      const dy = y - startY;

      if (!isDragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        if (Math.abs(dy) >= Math.abs(dx)) {
          isDown = false;
          return;
        }
        isDragging = true;
        rail.classList.add('is-dragging');
        if (e.pointerId && rail.setPointerCapture) {
          try { rail.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }
      }

      e.preventDefault();
      rail.scrollLeft = scrollLeft - dx;
    };

    rail.addEventListener('pointerdown', onDown);
    rail.addEventListener('pointerup', onUp);
    rail.addEventListener('pointercancel', onUp);
    rail.addEventListener('pointerleave', onUp);
    rail.addEventListener('pointermove', onMove);
  }

  function initKeyboard(rail, wrap) {
    rail.setAttribute('tabindex', '0');
    rail.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); scrollRail(rail, 'prev', wrap); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); scrollRail(rail, 'next', wrap); }
      if (e.key === 'Home') {
        e.preventDefault();
        const cards = getCards(rail);
        if (cards[0]) scrollToCard(rail, cards[0]);
      }
      if (e.key === 'End') {
        e.preventDefault();
        const cards = getCards(rail);
        if (cards.length) scrollToCard(rail, cards[cards.length - 1]);
      }
      setTimeout(() => updateRailNav(wrap), 400);
    });
  }

  function buildDots(wrap, rail) {
    const cards = getCards(rail);
    if (cards.length <= 1) {
      const existing = wrap.querySelector('.trip-rail-dots');
      if (existing) existing.remove();
      return;
    }

    let dots = wrap.querySelector('.trip-rail-dots');
    if (!dots) {
      dots = document.createElement('div');
      dots.className = 'trip-rail-dots';
      wrap.appendChild(dots);
    }

    if (dots.children.length !== cards.length) {
      dots.innerHTML = '';
      cards.forEach((card, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'trip-rail-dot' + (i === 0 ? ' is-active' : '');
        dot.setAttribute('aria-label', `بطاقة ${i + 1}`);
        dot.addEventListener('click', (e) => {
          e.preventDefault();
          scrollToCard(rail, card);
          setTimeout(() => updateRailNav(wrap), 400);
        });
        dots.appendChild(dot);
      });
    }
  }

  function initRail() {
    document.querySelectorAll('.trip-rail-wrap').forEach((wrap) => {
      const rail = wrap.querySelector('.trip-rail');
      const prev = wrap.querySelector('.trip-rail-nav--prev');
      const next = wrap.querySelector('.trip-rail-nav--next');
      if (!rail) return;

      if (prev) {
        prev.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          scrollRail(rail, 'prev', wrap);
        });
      }
      if (next) {
        next.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          scrollRail(rail, 'next', wrap);
        });
      }

      initDragScroll(rail);
      initKeyboard(rail, wrap);
      buildDots(wrap, rail);

      rail.addEventListener('scroll', () => updateRailNav(wrap), { passive: true });
      window.addEventListener('resize', () => updateRailNav(wrap));
      requestAnimationFrame(() => updateRailNav(wrap));
    });
  }

  function filterCards(query) {
    const q = (query || '').trim().toLowerCase();

    document.querySelectorAll('.trip-rail-wrap').forEach((wrap) => {
      const rail = wrap.querySelector('.trip-rail');
      if (!rail) return;
      let visible = 0;
      rail.querySelectorAll('.trip-card').forEach((card) => {
        const name = (card.dataset.tripName || '').toLowerCase();
        const show = !q || name.includes(q);
        card.hidden = !show;
        if (show) visible++;
      });
      const empty = wrap.querySelector('.trip-rail-filter-empty');
      if (empty) empty.hidden = visible > 0;
      buildDots(wrap, rail);
      updateRailNav(wrap);
    });

    const grid = document.getElementById('tripsGridView');
    if (grid) {
      let visible = 0;
      grid.querySelectorAll('.trip-card').forEach((card) => {
        const name = (card.dataset.tripName || '').toLowerCase();
        const show = !q || name.includes(q);
        card.hidden = !show;
        if (show) visible++;
      });
      const gridEmpty = document.getElementById('tripsGridFilterEmpty');
      if (gridEmpty) gridEmpty.hidden = visible > 0;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initRail();

    const searchInput = document.getElementById('tripsClientSearch');
    if (searchInput) {
      let timer;
      searchInput.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => filterCards(searchInput.value), 200);
      });
    }
  });

  window.tripRailFilter = filterCards;
})();
