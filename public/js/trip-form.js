(function () {
  'use strict';

  const form = document.getElementById('tripBuilderForm');
  if (!form) return;

  const packagesContainer = document.getElementById('packagesContainer');
  const packageTemplate = document.getElementById('packageBlockTemplate');
  const hotelTemplate = document.getElementById('hotelBlockTemplate');
  const hotelCostsContainer = document.getElementById('hotelCostsContainer');
  const hotelCostTemplate = document.getElementById('hotelCostBlockTemplate');
  const hotelCostsEmptyHint = document.getElementById('hotelCostsEmptyHint');
  const previewEl = document.getElementById('packagePricePreview');
  const addPackageBtn = document.getElementById('addPackageBtn');

  const STAR_TIERS = ['economy', '3', '4', '5'];
  const STAR_LABELS = { economy: 'اقتصادي', '3': '3 نجوم', '4': '4 نجوم', '5': '5 نجوم' };
  const ROOM_TYPES = ['single', 'double', 'triple', 'quad'];
  const ROOM_LABELS = { single: 'فردي', double: 'دبل', triple: 'ثلاثي', quad: 'رباعي' };
  const CITY_LABELS = { mecca: 'مكة المكرمة', medina: 'المدينة المنورة' };

  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const parseLocalDate = (value) => {
    if (!value) return null;
    const parts = value.split('-').map(Number);
    if (parts.length !== 3) return null;
    const [y, m, d] = parts;
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  };

  const updateHotelNightsForBlock = (block) => {
    if (!block || block.classList.contains('hotel-block-readonly')) return;

    const checkInInput = block.querySelector('.hotel-checkin') || block.querySelector('[name*="[checkInDate]"]');
    const checkOutInput = block.querySelector('.hotel-checkout') || block.querySelector('[name*="[checkOutDate]"]');
    const nightsInput = block.querySelector('.hotel-nights') || block.querySelector('[name*="[nights]"]');
    if (!checkInInput || !checkOutInput || !nightsInput) return;

    const checkIn = parseLocalDate(checkInInput.value);
    const checkOut = parseLocalDate(checkOutInput.value);
    if (!checkIn || !checkOut) return;

    if (checkOut < checkIn) {
      checkOutInput.setCustomValidity('تاريخ الخروج يجب أن يكون بعد تاريخ الدخول أو مساوياً له');
      return;
    }
    checkOutInput.setCustomValidity('');

    const nights = Math.round((checkOut - checkIn) / (1000 * 60 * 60 * 24));
    nightsInput.value = String(nights);
    syncHotelCostBlocks();
  };

  const updateAllHotelNights = () => {
    if (!packagesContainer) return;
    packagesContainer.querySelectorAll('.hotel-block:not(.hotel-block-readonly)').forEach(updateHotelNightsForBlock);
  };

  const getEditableHotelBlocks = () => {
    if (!packagesContainer) return [];
    return Array.from(packagesContainer.querySelectorAll('.hotel-block:not(.hotel-block-readonly)'));
  };

  const syncPackageStarsToHotels = (packageBlock) => {
    const stars = packageBlock?.querySelector('.package-stars')?.value || '4';
    packageBlock?.querySelectorAll('.hotel-stars-sync').forEach((input) => {
      input.value = stars;
    });
  };

  const syncAllPackageStars = () => {
    packagesContainer?.querySelectorAll('.hotel-package-block:not(.hotel-package-block--readonly)').forEach(syncPackageStarsToHotels);
  };

  const formatCurrency = (amount) => {
    if (!amount || amount <= 0) return null;
    return new Intl.NumberFormat('ar-EG', {
      style: 'decimal',
      maximumFractionDigits: 0,
    }).format(amount) + ' ج.م.';
  };

  const updatePackagePreview = () => {
    if (!previewEl) return;

    const discounts = getChildDiscounts();
    let html = '<table class="table table-sm preview-matrix-table mb-0"><thead><tr><th>الفئة</th>';
    ROOM_TYPES.forEach((rt) => { html += `<th>${ROOM_LABELS[rt]}</th>`; });
    html += '</tr></thead><tbody>';

    STAR_TIERS.forEach((star) => {
      html += `<tr><td class="star-tier-label">${STAR_LABELS[star]}</td>`;
      ROOM_TYPES.forEach((rt) => {
        const adult = getStarRoomPrice(star, rt);
        if (adult > 0) {
          const childBed = Math.max(0, adult - discounts.childWithBed);
          const childNoBed = Math.max(0, adult - discounts.childWithoutBed);
          const infant = Math.max(0, adult - discounts.infant);
          html += `<td><span class="preview-adult">${formatCurrency(adult)}</span>`;
          if (discounts.childWithBed > 0) {
            html += `<span class="preview-child-line">طفل سرير: ${formatCurrency(childBed)}</span>`;
          }
          if (discounts.childWithoutBed > 0) {
            html += `<span class="preview-child-line">طفل بدون: ${formatCurrency(childNoBed)}</span>`;
          }
          if (discounts.infant > 0) {
            html += `<span class="preview-child-line">رضيع: ${formatCurrency(infant)}</span>`;
          }
          html += '</td>';
        } else {
          html += '<td><span class="preview-empty">—</span></td>';
        }
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    previewEl.innerHTML = html;
  };

  const reindexHotels = () => {
    syncAllPackageStars();
    const blocks = getEditableHotelBlocks();
    blocks.forEach((block, hi) => {
      block.dataset.hotelIndex = String(hi);
      const title = block.querySelector('.hotel-block-title');
      if (title) title.textContent = 'فندق ' + (hi + 1);

      const starsInput = block.querySelector('.hotel-stars-sync');
      const nameInput = block.querySelector('.hotel-name') || block.querySelector('[name*="[name]"]');
      const citySelect = block.querySelector('.hotel-city') || block.querySelector('[name*="[city]"]');
      const nightsInput = block.querySelector('.hotel-nights') || block.querySelector('[name*="[nights]"]');
      const checkInInput = block.querySelector('.hotel-checkin') || block.querySelector('[name*="[checkInDate]"]');
      const checkOutInput = block.querySelector('.hotel-checkout') || block.querySelector('[name*="[checkOutDate]"]');

      if (starsInput) starsInput.name = `hotels[${hi}][stars]`;
      if (nameInput) nameInput.name = `hotels[${hi}][name]`;
      if (citySelect) citySelect.name = `hotels[${hi}][city]`;
      if (nightsInput) nightsInput.name = `hotels[${hi}][nights]`;
      if (checkInInput) checkInInput.name = `hotels[${hi}][checkInDate]`;
      if (checkOutInput) checkOutInput.name = `hotels[${hi}][checkOutDate]`;
    });

    packagesContainer?.querySelectorAll('.hotel-package-block:not(.hotel-package-block--readonly)').forEach((pkg, pi) => {
      pkg.dataset.packageIndex = String(pi);
      const pkgTitle = pkg.querySelector('.hotel-package-title');
      const stars = pkg.querySelector('.package-stars')?.value || '4';
      const starLabel = STAR_LABELS[stars] || stars;
      if (pkgTitle) pkgTitle.textContent = `باقة ${starLabel}`;
    });

    syncHotelCostBlocks();
  };

  const getHotelBlockMeta = (block) => {
    const name = block.querySelector('.hotel-name')?.value
      || block.querySelector('[name*="[name]"]')?.value || '';
    const city = block.querySelector('.hotel-city')?.value
      || block.querySelector('[name*="[city]"]')?.value || 'mecca';
    const stars = block.querySelector('.hotel-stars-sync')?.value
      || block.closest('.hotel-package-block')?.querySelector('.package-stars')?.value
      || block.querySelector('[name*="[stars]"]')?.value || '4';
    const nights = num(
      block.querySelector('.hotel-nights')?.value
      || block.querySelector('[name*="[nights]"]')?.value
    );
    const cityLabel = CITY_LABELS[city] || city;
    const starLabel = STAR_LABELS[stars] || (stars === 'economy' ? 'اقتصادي' : `${stars} نجوم`);
    const title = name.trim() || `${cityLabel} — ${starLabel}`;
    return { city, nights, cityLabel, title };
  };

  const setCostBlockMeta = (costBlock, meta, costKey) => {
    costBlock.dataset.costKey = costKey;
    const title = costBlock.querySelector('.hotel-cost-title');
    const cityBadge = costBlock.querySelector('.hotel-cost-city');
    const nightsEl = costBlock.querySelector('.hotel-cost-nights');
    if (title) title.textContent = meta.title;
    if (cityBadge) cityBadge.textContent = meta.cityLabel;
    if (nightsEl) nightsEl.textContent = `${meta.nights || 0} ليلة`;
    costBlock.querySelectorAll('.hotel-cost-room-input').forEach((input) => {
      const room = input.dataset.room;
      input.name = `costs[hotelNightCosts][${costKey}][${room}]`;
    });
  };

  const syncHotelCostBlocks = () => {
    if (!hotelCostsContainer || !packagesContainer) return;

    const editableBlocks = getEditableHotelBlocks();

    const slotBlocks = new Map();
    hotelCostsContainer.querySelectorAll('.hotel-cost-block[data-hotel-slot]').forEach((el) => {
      slotBlocks.set(el.dataset.hotelSlot, el);
    });

    editableBlocks.forEach((block, index) => {
      const slot = String(index);
      const isEditMode = form.dataset.editMode === '1';
      const costKey = isEditMode ? `new-${index}` : String(index);
      let costBlock = slotBlocks.get(slot);

      if (!costBlock && hotelCostTemplate) {
        const frag = hotelCostTemplate.content.cloneNode(true);
        costBlock = frag.querySelector('.hotel-cost-block');
        costBlock.dataset.hotelSlot = slot;
        hotelCostsContainer.appendChild(frag);
        slotBlocks.set(slot, costBlock);
      }

      if (costBlock) {
        costBlock.dataset.hotelSlot = slot;
        setCostBlockMeta(costBlock, getHotelBlockMeta(block), costKey);
      }
    });

    hotelCostsContainer.querySelectorAll('.hotel-cost-block[data-hotel-slot]').forEach((el) => {
      const slot = Number(el.dataset.hotelSlot);
      if (slot >= editableBlocks.length) el.remove();
    });

    if (hotelCostsEmptyHint) {
      const total = hotelCostsContainer.querySelectorAll('.hotel-cost-block').length;
      hotelCostsEmptyHint.style.display = total ? 'none' : '';
    }
  };

  const addHotelToPackage = (packageBlock, city = 'mecca') => {
    if (!hotelTemplate || !packageBlock) return;
    const hotelsWrap = packageBlock.querySelector('.package-hotels');
    if (!hotelsWrap) return;
    const block = hotelTemplate.content.cloneNode(true);
    const hotelBlock = block.querySelector('.hotel-block');
    const citySelect = hotelBlock?.querySelector('.hotel-city');
    if (citySelect) citySelect.value = city;
    hotelsWrap.appendChild(block);
    syncPackageStarsToHotels(packageBlock);
    reindexHotels();
    updateCostPreview();
  };

  const addPackageBlock = (stars = '5') => {
    if (!packageTemplate || !packagesContainer) return;
    const frag = packageTemplate.content.cloneNode(true);
    const packageBlock = frag.querySelector('.hotel-package-block');
    const starsSelect = packageBlock?.querySelector('.package-stars');
    if (starsSelect) starsSelect.value = stars;
    packagesContainer.appendChild(frag);
    addHotelToPackage(packageBlock, 'mecca');
    addHotelToPackage(packageBlock, 'medina');
  };

  if (addPackageBtn) {
    addPackageBtn.addEventListener('click', () => addPackageBlock('4'));
  }

  if (packagesContainer) {
    packagesContainer.addEventListener('click', (e) => {
      const removePackageBtn = e.target.closest('.remove-package-btn');
      if (removePackageBtn) {
        const pkg = removePackageBtn.closest('.hotel-package-block');
        if (pkg && !pkg.classList.contains('hotel-package-block--readonly')) {
          pkg.remove();
          reindexHotels();
          updateCostPreview();
        }
        return;
      }

      const addHotelBtn = e.target.closest('.add-hotel-to-package-btn');
      if (addHotelBtn) {
        const pkg = addHotelBtn.closest('.hotel-package-block');
        if (pkg) addHotelToPackage(pkg, 'mecca');
        return;
      }

      const removeHotelBtn = e.target.closest('.remove-hotel-btn');
      if (removeHotelBtn) {
        const block = removeHotelBtn.closest('.hotel-block');
        if (block && !block.classList.contains('hotel-block-readonly')) {
          block.remove();
          reindexHotels();
          updateCostPreview();
        }
      }
    });

    packagesContainer.addEventListener('change', (e) => {
      if (e.target.classList.contains('package-stars')) {
        const pkg = e.target.closest('.hotel-package-block');
        syncPackageStarsToHotels(pkg);
        reindexHotels();
      }
    });

    packagesContainer.addEventListener('input', (e) => {
      if (
        e.target.matches('.hotel-name, .hotel-city, .hotel-nights')
        || e.target.name?.includes('[name]')
        || e.target.name?.includes('[city]')
        || e.target.name?.includes('[nights]')
      ) {
        syncHotelCostBlocks();
        updateCostPreview();
      }
    });

    packagesContainer.addEventListener('change', (e) => {
      if (
        e.target.classList.contains('hotel-checkin')
        || e.target.classList.contains('hotel-checkout')
        || e.target.name?.includes('[checkInDate]')
        || e.target.name?.includes('[checkOutDate]')
      ) {
        const block = e.target.closest('.hotel-block');
        if (block) {
          updateHotelNightsForBlock(block);
          updateCostPreview();
        }
      }
    });
  }

  const getStarRoomPrice = (star, room) => {
    const input = form.querySelector(`[name="pricing[starRoomPrices][${star}][${room}]"]`);
    return input ? num(input.value) : 0;
  };

  const getChildDiscounts = () => ({
    childWithBed: num(form.querySelector('[name="pricing[childDiscounts][childWithBed]"]')?.value),
    childWithoutBed: num(form.querySelector('[name="pricing[childDiscounts][childWithoutBed]"]')?.value),
    infant: num(form.querySelector('[name="pricing[childDiscounts][infant]"]')?.value),
  });

  form.addEventListener('input', (e) => {
    if (
      e.target.classList.contains('star-room-price') ||
      e.target.classList.contains('child-discount-input')
    ) {
      updatePackagePreview();
    }
  });

  reindexHotels();
  syncHotelCostBlocks();
  updatePackagePreview();

  const tripStartDate = document.getElementById('tripStartDate');
  const tripEndDate = document.getElementById('tripEndDate');
  const durationDaysInput = document.getElementById('tripDurationDays');
  const durationNightsInput = document.getElementById('tripDurationNights');
  const outboundDepDateInput = form.querySelector('[name="outboundFlight[departureDate]"]');
  const returnDepDateInput = form.querySelector('[name="returnFlight[departureDate]"]');

  const updateDurationFromDates = () => {
    const start = parseLocalDate(tripStartDate?.value);
    const end = parseLocalDate(tripEndDate?.value);

    if (!start || !end) return;

    if (end < start) {
      tripEndDate?.setCustomValidity('تاريخ النهاية يجب أن يكون بعد تاريخ البداية أو مساوياً له');
      return;
    }
    tripEndDate?.setCustomValidity('');

    const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
    const days = diffDays + 1;
    const nights = diffDays;

    if (durationDaysInput) durationDaysInput.value = String(days);
    if (durationNightsInput) durationNightsInput.value = String(nights);

    if (outboundDepDateInput && tripStartDate?.value) {
      outboundDepDateInput.value = tripStartDate.value;
    }
    if (returnDepDateInput && tripEndDate?.value) {
      returnDepDateInput.value = tripEndDate.value;
    }
  };

  if (tripStartDate) {
    tripStartDate.addEventListener('change', updateDurationFromDates);
  }
  if (tripEndDate) {
    tripEndDate.addEventListener('change', updateDurationFromDates);
  }

  if (tripStartDate?.value && tripEndDate?.value) {
    const start = parseLocalDate(tripStartDate.value);
    const end = parseLocalDate(tripEndDate.value);
    const needsDuration = !durationDaysInput?.value || !durationNightsInput?.value;
    if (start && end && end >= start && needsDuration) {
      updateDurationFromDates();
    }
  }

  const supervisorSelect = document.getElementById('supervisorSelect');
  const assistantSupervisorSelect = document.getElementById('assistantSupervisorSelect');
  const assistantDailyRateWrap = document.getElementById('assistantDailyRateWrap');
  const newSupervisorWrap = document.getElementById('newSupervisorWrap');
  const newAssistantSupervisorWrap = document.getElementById('newAssistantSupervisorWrap');

  const hasAssistantSupervisor = () => !!assistantSupervisorSelect?.value;

  const toggleAssistantCostFields = () => {
    const rateInput = document.getElementById('assistantDailyRateSar');
    const show = hasAssistantSupervisor();
    assistantDailyRateWrap?.classList.toggle('d-none', !show);
    if (!show && rateInput) {
      rateInput.value = '';
    }
  };
  const toggleNewSupervisorFields = () => {
    const showNew = !supervisorSelect?.value;
    newSupervisorWrap?.classList.toggle('d-none', !showNew);
  };

  const toggleNewAssistantFields = () => {
    const showNew = assistantSupervisorSelect?.value === '__new__';
    newAssistantSupervisorWrap?.classList.toggle('d-none', !showNew);
    if (assistantSupervisorSelect?.value && assistantSupervisorSelect.value !== '__new__') {
      newAssistantSupervisorWrap?.classList.add('d-none');
    }
  };

  const validateSupervisorPair = () => {
    const mainId = supervisorSelect?.value;
    const assistId = assistantSupervisorSelect?.value;
    if (mainId && assistId && mainId === assistId) {
      assistantSupervisorSelect.value = '';
      toggleNewAssistantFields();
    }
  };

  if (supervisorSelect) {
    supervisorSelect.addEventListener('change', () => {
      toggleNewSupervisorFields();
      validateSupervisorPair();
    });
    toggleNewSupervisorFields();
  }

  if (assistantSupervisorSelect) {
    assistantSupervisorSelect.addEventListener('change', () => {
      const val = assistantSupervisorSelect.value;
      if (val && val !== '__new__') {
        newAssistantSupervisorWrap?.classList.add('d-none');
      } else if (val === '__new__') {
        newAssistantSupervisorWrap?.classList.remove('d-none');
      } else {
        newAssistantSupervisorWrap?.classList.add('d-none');
      }
      validateSupervisorPair();
      toggleAssistantCostFields();
      updateCostPreview();
    });
    toggleAssistantCostFields();
  }

  form.addEventListener('submit', (e) => {
    const mainId = supervisorSelect?.value;
    const assistId = assistantSupervisorSelect?.value;
    const newMainName = document.getElementById('newSupervisorName')?.value?.trim();
    if (!mainId && !newMainName) {
      // supervisor optional
    }
    if (mainId && assistId && mainId === assistId) {
      e.preventDefault();
      alert('لا يمكن أن يكون المشرف ومساعده نفس الشخص');
      return;
    }
    saveDraftSync();
  });

  const vipItemsBody = document.getElementById('vipItemsBody');
  const addVipItemBtn = document.getElementById('addVipItemBtn');
  const addVipFromCatalogBtn = document.getElementById('addVipFromCatalogBtn');
  const vipCatalogSelect = document.getElementById('vipCatalogSelect');

  const renumberVipRows = () => {
    if (!vipItemsBody) return;
    vipItemsBody.querySelectorAll('.vip-item-row').forEach((row, i) => {
      row.dataset.index = String(i);
      row.querySelectorAll('input').forEach((input) => {
        const name = input.getAttribute('name');
        if (name) {
          input.setAttribute('name', name.replace(/pricing\[vipItems\]\[\d+\]/, `pricing[vipItems][${i}]`));
        }
      });
    });
  };

  const addVipRow = (data = {}) => {
    if (!vipItemsBody) return;
    const i = vipItemsBody.querySelectorAll('.vip-item-row').length;
    const tr = document.createElement('tr');
    tr.className = 'vip-item-row';
    tr.dataset.index = String(i);
    tr.innerHTML = `
      <td>
        <input type="hidden" name="pricing[vipItems][${i}][vipServiceId]" value="${data.vipServiceId || ''}">
        <input type="text" class="form-control form-control-sm vip-item-name" name="pricing[vipItems][${i}][name]" value="${data.name || ''}" placeholder="مثال: لموزين" list="vipCatalogList" required>
      </td>
      <td><input type="number" class="form-control form-control-sm" name="pricing[vipItems][${i}][cost]" min="0" value="${data.cost || 0}"></td>
      <td><input type="number" class="form-control form-control-sm" name="pricing[vipItems][${i}][sellingPrice]" min="0" value="${data.sellingPrice || 0}"></td>
      <td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger remove-vip-item" title="حذف"><i class="fa-solid fa-trash"></i></button></td>
    `;
    vipItemsBody.appendChild(tr);
    renumberVipRows();
  };

  if (addVipItemBtn) {
    addVipItemBtn.addEventListener('click', () => addVipRow());
  }

  if (addVipFromCatalogBtn && vipCatalogSelect) {
    addVipFromCatalogBtn.addEventListener('click', () => {
      const opt = vipCatalogSelect.options[vipCatalogSelect.selectedIndex];
      if (!opt || !opt.value) return;
      addVipRow({
        vipServiceId: opt.value,
        name: opt.dataset.name || opt.textContent,
        cost: num(opt.dataset.cost),
        sellingPrice: num(opt.dataset.selling),
      });
      vipCatalogSelect.value = '';
    });
  }

  if (vipItemsBody) {
    vipItemsBody.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.remove-vip-item');
      if (removeBtn) {
        removeBtn.closest('.vip-item-row')?.remove();
        renumberVipRows();
      }
    });

    vipItemsBody.addEventListener('change', (e) => {
      if (!e.target.classList.contains('vip-item-name')) return;
      const row = e.target.closest('.vip-item-row');
      if (!row) return;
      const datalist = document.getElementById('vipCatalogList');
      if (!datalist) return;
      const match = Array.from(datalist.options).find((opt) => opt.value === e.target.value.trim());
      if (!match) return;
      const idInput = row.querySelector('[name$="[vipServiceId]"]');
      const costInput = row.querySelector('[name$="[cost]"]');
      const sellingInput = row.querySelector('[name$="[sellingPrice]"]');
      if (idInput) idInput.value = match.dataset.id || '';
      if (costInput && !num(costInput.value)) costInput.value = match.dataset.cost || 0;
      if (sellingInput && !num(sellingInput.value)) sellingInput.value = match.dataset.selling || 0;
    });
  }

  const ROOM_CAPACITY = { single: 1, double: 2, triple: 3, quad: 4 };
  const costPreviewBody = document.getElementById('costPreviewBody');
  const visaCostTotalValue = document.getElementById('visaCostTotalValue');
  const costDurationDaysDisplay = document.getElementById('costDurationDaysDisplay');
  const supervisorTotalSarDisplay = document.getElementById('supervisorTotalSarDisplay');
  const supervisorDailyRateSar = document.getElementById('supervisorDailyRateSar');
  const assistantDailyRateSar = document.getElementById('assistantDailyRateSar');
  const costSarToEgpRate = document.getElementById('costSarToEgpRate');

  const getHotelNightsFromForm = () => {
    let mecca = 0;
    let medina = 0;
    document.querySelectorAll('.hotel-block').forEach((block) => {
      const city = block.querySelector('[name*="[city]"]')?.value;
      const nights = num(block.querySelector('[name*="[nights]"]')?.value);
      if (city === 'mecca') mecca = Math.max(mecca, nights);
      if (city === 'medina') medina = Math.max(medina, nights);
    });
    return { mecca, medina };
  };

  const getCostNightRateForBlock = (costBlock, room) => {
    const input = costBlock.querySelector(`[data-room="${room}"]`);
    return input ? num(input.value) : 0;
  };

  const formatEgp = (amount) => {
    if (!amount || amount <= 0) return '—';
    return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(amount) + ' ج.م.';
  };

  const updateCostPreview = () => {
    const rate = num(costSarToEgpRate?.value, 13.5);
    const days = num(durationDaysInput?.value, 1);
    if (costDurationDaysDisplay) costDurationDaysDisplay.value = days || '—';

    const supDaily = num(supervisorDailyRateSar?.value);
    const assistDaily = hasAssistantSupervisor() ? num(assistantDailyRateSar?.value) : 0;
    const supTotalSar = (supDaily + assistDaily) * days;
    if (supervisorTotalSarDisplay) {
      supervisorTotalSarDisplay.value = supTotalSar > 0 ? supTotalSar.toLocaleString('ar-EG') : '—';
    }

    if (!costPreviewBody) return;

    const visaSar = num(form.querySelector('[name="costs[visaSaudiAgentSar]"]')?.value);
    const visaEgpPortal = num(form.querySelector('[name="costs[visaEgyptPortalEgp]"]')?.value);
    const visaAgentEgp = Math.round(visaSar * rate);
    const visaTotalEgp = Math.round(visaEgpPortal + visaAgentEgp);
    const flightEgp = num(form.querySelector('[name="costs[flightTicketCostEgp]"]')?.value);

    if (visaCostTotalValue) {
      visaCostTotalValue.textContent = visaTotalEgp > 0 ? formatEgp(visaTotalEgp) : '—';
    }

    const hotelItems = [];
    let accommodationTotal = 0;

    if (hotelCostsContainer) {
      hotelCostsContainer.querySelectorAll('.hotel-cost-block').forEach((costBlock) => {
        const roomNight = getCostNightRateForBlock(costBlock, 'quad');
        if (!roomNight) return;
        const title = costBlock.querySelector('.hotel-cost-title')?.textContent?.trim() || 'فندق';
        const cityBadge = costBlock.querySelector('.hotel-cost-city')?.textContent?.trim() || '';
        const nightsText = costBlock.querySelector('.hotel-cost-nights')?.textContent || '0';
        const nights = num(nightsText.replace(/[^\d]/g, ''));
        const perPersonNightSar = roomNight / ROOM_CAPACITY.quad;
        const stayEgp = Math.round((perPersonNightSar * nights) * rate);
        accommodationTotal += stayEgp;
        hotelItems.push({
          title,
          city: cityBadge,
          nights,
          perPersonNightSar,
          stayEgp,
        });
      });
    }

    const supervisorEgp = supTotalSar > 0 ? Math.round(supTotalSar * rate) : 0;
    const passengerSubtotal = visaTotalEgp + flightEgp + accommodationTotal;
    const hasAnyData = passengerSubtotal > 0 || supervisorEgp > 0;

    if (!hasAnyData) {
      costPreviewBody.innerHTML = `
        <div class="cost-preview-empty">
          <i class="fa-solid fa-calculator"></i>
          <p>أدخل التكاليف لعرض المعاينة</p>
        </div>`;
      return;
    }

    let html = '';

    if (visaTotalEgp > 0 || flightEgp > 0) {
      html += '<div class="cost-preview-section">';
      html += '<div class="cost-preview-section-head"><i class="fa-solid fa-user"></i> لكل معتمر</div>';
      html += '<div class="cost-preview-rows">';
      if (visaTotalEgp > 0) {
        html += `<div class="cost-preview-row">
          <span class="cost-preview-row-label"><i class="fa-solid fa-passport"></i> تأشيرة</span>
          <span class="cost-preview-row-value">${formatEgp(visaTotalEgp)}</span>
        </div>`;
        if (visaEgpPortal > 0 || visaAgentEgp > 0) {
          html += '<div class="cost-preview-row-detail">';
          if (visaEgpPortal > 0) html += `<span>بوابة العمرة: ${formatEgp(visaEgpPortal)}</span>`;
          if (visaAgentEgp > 0) html += `<span>الوكيل السعودي: ${formatEgp(visaAgentEgp)}</span>`;
          html += '</div>';
        }
      }
      if (flightEgp > 0) {
        html += `<div class="cost-preview-row">
          <span class="cost-preview-row-label"><i class="fa-solid fa-plane"></i> طيران</span>
          <span class="cost-preview-row-value">${formatEgp(flightEgp)}</span>
        </div>`;
      }
      html += '</div></div>';
    }

    if (hotelItems.length) {
      html += '<div class="cost-preview-section">';
      html += '<div class="cost-preview-section-head"><i class="fa-solid fa-hotel"></i> سكن</div>';
      html += '<div class="cost-preview-hotels">';
      hotelItems.forEach((h) => {
        html += `<div class="cost-preview-hotel-card">
          <div class="cost-preview-hotel-top">
            <span class="cost-preview-hotel-name">${h.title}</span>
            ${h.city ? `<span class="cost-preview-hotel-city">${h.city}</span>` : ''}
          </div>
          <div class="cost-preview-hotel-meta">
            <span><i class="fa-solid fa-bed"></i> رباعي</span>
            <span><i class="fa-solid fa-moon"></i> ${h.nights} ليلة</span>
            <span><i class="fa-solid fa-coins"></i> ${h.perPersonNightSar.toFixed(0)} ر.س/ليلة/شخص</span>
          </div>
          <div class="cost-preview-hotel-total">${formatEgp(h.stayEgp)}</div>
        </div>`;
      });
      html += '</div>';
      html += `<div class="cost-preview-subtotal">
        <span>مجموع السكن</span>
        <strong>${formatEgp(accommodationTotal)}</strong>
      </div>`;
      html += '</div>';
    }

    if (supervisorEgp > 0) {
      html += '<div class="cost-preview-section cost-preview-section-trip">';
      html += '<div class="cost-preview-section-head"><i class="fa-solid fa-user-tie"></i> مستوى الرحلة</div>';
      html += `<div class="cost-preview-row">
        <span class="cost-preview-row-label">بدل مشرفين (${days} يوم)</span>
        <span class="cost-preview-row-value">${formatEgp(supervisorEgp)}</span>
      </div>`;
      html += '</div>';
    }

    html += '<div class="cost-preview-footer">';
    if (passengerSubtotal > 0) {
      html += `<div class="cost-preview-footer-row">
        <span>تكلفة المعتمر</span>
        <strong class="cost-preview-passenger-total">${formatEgp(passengerSubtotal)}</strong>
      </div>`;
    }
    if (supervisorEgp > 0) {
      html += `<div class="cost-preview-footer-row cost-preview-footer-muted">
        <span>+ بدل مشرفين (مرة واحدة)</span>
        <span>${formatEgp(supervisorEgp)}</span>
      </div>`;
    }
    html += '</div>';

    costPreviewBody.innerHTML = html;
  };

  form.addEventListener('input', (e) => {
    if (
      e.target.classList.contains('cost-night-input')
      || e.target.classList.contains('cost-input')
      || e.target.name?.startsWith('costs[')
      || e.target.classList.contains('hotel-nights')
      || e.target.name?.includes('[nights]')
    ) {
      updateCostPreview();
    }
  });

  if (durationDaysInput) {
    durationDaysInput.addEventListener('input', updateCostPreview);
  }
  updateAllHotelNights();
  toggleAssistantCostFields();
  updateCostPreview();

  // --- Draft persistence (localStorage) ---
  const DRAFT_KEY_PREFIX = 'og_trip_form_draft';
  let isRestoringDraft = false;

  const getDraftKey = () => {
    const isEdit = form.dataset.editMode === '1';
    const tripId = form.dataset.tripId;
    return isEdit && tripId ? `${DRAFT_KEY_PREFIX}_edit_${tripId}` : `${DRAFT_KEY_PREFIX}_new`;
  };

  const debounce = (fn, ms = 400) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  };

  const collectFormEntries = () => {
    const entries = [];
    form.querySelectorAll('input, select, textarea').forEach((el) => {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') {
        entries.push([el.name, el.checked ? (el.value || 'on') : '']);
      } else if (el.type === 'radio') {
        if (el.checked) entries.push([el.name, el.value]);
      } else {
        entries.push([el.name, el.value]);
      }
    });
    return entries;
  };

  const collectPackageMeta = () => {
    const meta = [];
    packagesContainer?.querySelectorAll('.hotel-package-block:not(.hotel-package-block--readonly)').forEach((pkg) => {
      meta.push({
        stars: pkg.querySelector('.package-stars')?.value || '4',
        hotelCount: pkg.querySelectorAll('.hotel-block:not(.hotel-block-readonly)').length,
      });
    });
    return meta;
  };

  const collectDraftState = () => ({
    savedAt: Date.now(),
    editMode: form.dataset.editMode === '1',
    tripId: form.dataset.tripId || null,
    packageMeta: collectPackageMeta(),
    vipCount: vipItemsBody?.querySelectorAll('.vip-item-row').length || 0,
    entries: collectFormEntries(),
  });

  const saveDraftSync = () => {
    if (isRestoringDraft) return;
    try {
      localStorage.setItem(getDraftKey(), JSON.stringify(collectDraftState()));
    } catch { /* ignore quota */ }
  };

  const debouncedSaveDraft = debounce(saveDraftSync, 400);

  const clearDraft = () => {
    try { localStorage.removeItem(getDraftKey()); } catch { /* ignore */ }
    document.getElementById('tripDraftRestoreBanner')?.classList.add('d-none');
  };

  const applyFormEntries = (entries) => {
    const radioNames = new Set();
    entries.forEach(([name, value]) => {
      const fields = form.querySelectorAll(`[name="${name.replace(/"/g, '\\"')}"]`);
      if (!fields.length) return;
      fields.forEach((el) => {
        if (el.type === 'radio') {
          radioNames.add(name);
          el.checked = el.value === value;
        } else if (el.type === 'checkbox') {
          el.checked = !!value;
        } else {
          el.value = value;
        }
      });
    });
  };

  const rebuildPackagesFromMeta = (packageMeta) => {
    if (!packagesContainer) return;
    packagesContainer.querySelectorAll('.hotel-package-block:not(.hotel-package-block--readonly)').forEach((el) => el.remove());
    const meta = packageMeta?.length ? packageMeta : [{ stars: '4', hotelCount: 2 }];
    meta.forEach(({ stars, hotelCount }) => {
      addPackageBlock(stars);
      const pkg = packagesContainer.querySelector('.hotel-package-block:not(.hotel-package-block--readonly):last-child');
      if (!pkg) return;
      const hotelsWrap = pkg.querySelector('.package-hotels');
      let count = hotelsWrap?.querySelectorAll('.hotel-block:not(.hotel-block-readonly)').length || 0;
      while (count < hotelCount) {
        addHotelToPackage(pkg, 'mecca');
        count += 1;
      }
      while (count > hotelCount) {
        hotelsWrap?.querySelector('.hotel-block:not(.hotel-block-readonly):last-child')?.remove();
        count -= 1;
      }
    });
    reindexHotels();
  };

  const rebuildVipRows = (count) => {
    if (!vipItemsBody) return;
    vipItemsBody.innerHTML = '';
    for (let i = 0; i < count; i += 1) addVipRow();
  };

  const restoreDraft = (draft) => {
    if (!draft?.entries?.length) return;
    isRestoringDraft = true;
    try {
      rebuildPackagesFromMeta(draft.packageMeta);
      if (draft.vipCount > 0) rebuildVipRows(draft.vipCount);
      applyFormEntries(draft.entries);
      toggleNewSupervisorFields();
      if (assistantSupervisorSelect) {
        const val = assistantSupervisorSelect.value;
        if (val === '__new__') {
          newAssistantSupervisorWrap?.classList.remove('d-none');
        } else {
          newAssistantSupervisorWrap?.classList.add('d-none');
        }
      }
      toggleAssistantCostFields();
      syncHotelCostBlocks();
      updatePackagePreview();
      updateAllHotelNights();
      updateCostPreview();
    } finally {
      isRestoringDraft = false;
    }
  };

  const loadStoredDraft = () => {
    try {
      const raw = localStorage.getItem(getDraftKey());
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const initDraftRestore = () => {
    const banner = document.getElementById('tripDraftRestoreBanner');
    const draft = loadStoredDraft();
    if (!draft?.entries?.length) return;

    const serverRestored = document.querySelector('.alert.alert-warning');
    if (serverRestored) {
      saveDraftSync();
      return;
    }

    banner?.classList.remove('d-none');
    document.getElementById('restoreTripDraftBtn')?.addEventListener('click', () => {
      restoreDraft(draft);
      banner?.classList.add('d-none');
    });
    document.getElementById('discardTripDraftBtn')?.addEventListener('click', () => {
      clearDraft();
    });
  };

  form.addEventListener('input', () => { if (!isRestoringDraft) debouncedSaveDraft(); });
  form.addEventListener('change', () => { if (!isRestoringDraft) debouncedSaveDraft(); });

  form.querySelector('a.btn-outline-primary[href]')?.addEventListener('click', clearDraft);

  initDraftRestore();
})();
