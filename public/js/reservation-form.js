document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('reservationForm');
  const membersContainer = document.getElementById('membersContainer');
  const addMemberBtn = document.getElementById('addMemberBtn');
  const previewBtn = document.getElementById('previewBtn');
  const pricingPreview = document.getElementById('pricingPreview');
  const discountInput = document.getElementById('discountInput');
  const paidInput = document.getElementById('paidInput');
  const paidInputFeedback = document.getElementById('paidInputFeedback');
  const paidInputHint = document.getElementById('paidInputHint');
  const financeAlert = document.getElementById('financeAlert');
  const financeAlertText = document.getElementById('financeAlertText');
  const financeDueLine = document.getElementById('financeDueLine');
  const financeDueValue = document.getElementById('financeDueValue');
  const primaryCustomerName = form?.querySelector('[name="primaryCustomerName"]');
  const primaryPhoneInput = form?.querySelector('[name="primaryPhone"]');
  const tripSelect = document.getElementById('tripSelect');
  const groupTypeSelect = document.getElementById('groupTypeSelect');
  const brokerSelectWrap = document.getElementById('brokerSelectWrap');
  const brokerSelect = document.getElementById('brokerSelect');
  const newBrokerWrap = document.getElementById('newBrokerWrap');
  const newBrokerPhoneWrap = document.getElementById('newBrokerPhoneWrap');
  const newBrokerNameInput = document.getElementById('newBrokerName');
  const newBrokerPhoneInput = document.getElementById('newBrokerPhone');
  const primaryCustomerWrap = document.getElementById('primaryCustomerWrap');
  const primaryPhoneWrap = document.getElementById('primaryPhoneWrap');
  const primaryCustomerIdInput = document.getElementById('primaryCustomerIdInput');
  const vipAddonsEmpty = document.getElementById('vipAddonsEmpty');
  const vipCatalogCards = document.getElementById('vipCatalogCards');
  const vipAssignmentSummary = document.getElementById('vipAssignmentSummary');
  const vipAssignmentList = document.getElementById('vipAssignmentList');
  const vipAddonsHint = document.getElementById('vipAddonsHint');
  const vipAddonsSection = document.getElementById('vipAddonsSection');
  const packageStarsSelect = document.getElementById('packageStarsSelect');
  const packagePricingHint = document.getElementById('packagePricingHint');
  const accommodationSection = document.getElementById('accommodationSection');

  if (!form) return;

  const DRAFT_KEY = 'og_reservation_draft';
  let isRestoringDraft = false;
  let previewRequestId = 0;
  let lastPricing = null;
  let previewFailed = false;
  let tripPackages = [];
  let starRoomPrices = {};
  let tripDeductions = {};
  let tripVipItems = [];

  const PACKAGE_STAR_LABELS = {
    economy: 'اقتصادي',
    '3': '3 نجوم',
    '4': '4 نجوم',
    '5': '5 نجوم',
  };

  const DEDUCTION_SERVICES = [
    { key: 'flight', label: 'تذكرة طيران', icon: 'fa-plane' },
    { key: 'visa', label: 'تأشيرة', icon: 'fa-passport' },
    { key: 'transport', label: 'انتقالات', icon: 'fa-bus' },
    { key: 'haramainTrain', label: 'قطار الحرمين', icon: 'fa-train' },
  ];

  const HIDDEN_MEMBER_SERVICES = ['insurance', 'tours'];

  const TYPE_LABELS = {
    adult: 'بالغ',
    child_bed: 'طفل مع سرير',
    child_no_bed: 'طفل بدون سرير',
    infant: 'رضيع',
  };

  const ROOM_LABELS = { single: 'فردي', double: 'دبل', triple: 'ثلاثي', quad: 'رباعي' };
  const ROOM_CAPACITY = { single: 1, double: 2, triple: 3, quad: 4 };
  const CITY_LABELS = { mecca: 'مكة', medina: 'المدينة' };

  const usesBed = (type) => type !== 'child_no_bed' && type !== 'infant';

  const fmt = (n) => (n || 0).toLocaleString('ar-EG');

  const parseMoneyInput = (value) => {
    if (value == null || value === '') return 0;
    const num = Number(String(value).replace(/,/g, '').trim());
    return Number.isFinite(num) ? num : 0;
  };

  const setFieldValidity = (input, message) => {
    if (!input) return;
    input.setCustomValidity(message || '');
    input.classList.toggle('is-invalid', Boolean(message));
  };

  const updateFinanceDueDisplay = (total = 0) => {
    if (!financeDueLine || !financeDueValue) return;
    if (total > 0) {
      financeDueLine.hidden = false;
      financeDueValue.textContent = `${fmt(total)} ج.م.`;
      if (paidInput) paidInput.max = String(total);
    } else {
      financeDueLine.hidden = true;
      paidInput?.removeAttribute('max');
    }
  };

  const updateFinanceAlert = (paidMsg, discountMsg) => {
    const message = paidMsg || discountMsg;
    if (!financeAlert || !financeAlertText) return;
    if (message) {
      financeAlertText.textContent = message;
      financeAlert.classList.remove('d-none');
    } else {
      financeAlert.classList.add('d-none');
      financeAlertText.textContent = '';
    }
  };

  const validateFinancialFields = () => {
    const discount = parseMoneyInput(discountInput?.value);
    const paid = parseMoneyInput(paidInput?.value);
    const subtotal = lastPricing?.subtotal || 0;
    const total = lastPricing?.total || 0;

    let discountMsg = '';
    if (discount < 0) discountMsg = 'الخصم لا يمكن أن يكون سالباً';
    else if (subtotal > 0 && discount > subtotal) {
      discountMsg = `الخصم لا يمكن أن يتجاوز المجموع الفرعي (${fmt(subtotal)} ج.م.)`;
    }

    let paidMsg = '';
    if (paid < 0) paidMsg = 'المبلغ المدفوع لا يمكن أن يكون سالباً';
    else if (!lastPricing && paid > 0) paidMsg = 'حدّث ملخص السعر قبل إدخال مبلغ مدفوع';
    else if (total > 0 && paid > total) {
      paidMsg = `المبلغ المدفوع يتجاوز الإجمالي (${fmt(total)} ج.م.)`;
      if (paidInputFeedback) paidInputFeedback.textContent = paidMsg;
    } else if (paidInputFeedback) {
      paidInputFeedback.textContent = 'المبلغ المدفوع يتجاوز الإجمالي';
    }

    setFieldValidity(discountInput, discountMsg);
    setFieldValidity(paidInput, paidMsg);
    updateFinanceAlert(paidMsg, discountMsg);
    if (paidInputHint) {
      paidInputHint.classList.toggle('text-danger', Boolean(paidMsg));
    }

    return !discountMsg && !paidMsg;
  };

  const applyPaidQuickAction = (action) => {
    if (!paidInput) return;
    const total = lastPricing?.total || 0;
    if (action === 'full' && total <= 0) {
      window.OGToast?.error('حدّث ملخص السعر أولاً لمعرفة الإجمالي');
      runPreview();
      return;
    }
    paidInput.value = action === 'full' ? String(total) : '0';
    validateFinancialFields();
    if (lastPricing) renderPricingSummary(lastPricing, collectFormData());
    debouncedSaveDraft();
  };

  const debounce = (fn, ms = 300) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  };

  const buildPackageSelectOptions = (selectedStars) => {
    if (!tripPackages.length) return '<option value="">لا توجد باقات — أضف باقات للرحلة</option>';
    return tripPackages.map((pkg) => {
      const sel = selectedStars && pkg.stars === selectedStars ? ' selected' : '';
      const label = pkg.summary || pkg.label || PACKAGE_STAR_LABELS[pkg.stars] || pkg.stars;
      return `<option value="${pkg.stars}"${sel}>${pkg.label} — ${label}</option>`;
    }).join('');
  };

  const getSelectedPackageStars = () => packageStarsSelect?.value || '';

  const getRoomPrice = (stars, roomType) => {
    const tier = starRoomPrices?.[stars];
    if (!tier) return 0;
    return Number(tier[roomType]) || 0;
  };

  const buildRoomTypeOptions = (stars, selectedType) => {
    const types = ['quad', 'triple', 'double', 'single'];
    return types.map((rt) => {
      const price = getRoomPrice(stars, rt);
      const priceLabel = price > 0 ? ` — ${fmt(price)} ج.م.` : '';
      const sel = rt === selectedType ? ' selected' : '';
      return `<option value="${rt}"${sel}>${ROOM_LABELS[rt]}${priceLabel}</option>`;
    }).join('');
  };

  const updatePackagePricingHint = () => {
    if (!packagePricingHint || !packageStarsSelect) return;
    const stars = getSelectedPackageStars();
    if (!stars) {
      packagePricingHint.textContent = '';
      return;
    }
    const starLabel = PACKAGE_STAR_LABELS[stars] || stars;
    const prices = ['single', 'double', 'triple', 'quad']
      .map((rt) => {
        const p = getRoomPrice(stars, rt);
        return p > 0 ? `${ROOM_LABELS[rt]}: ${fmt(p)} ج.م.` : null;
      })
      .filter(Boolean);
    packagePricingHint.innerHTML = prices.length
      ? `<strong>باقة ${starLabel}:</strong> ${prices.join(' · ')}`
      : `باقة ${starLabel} — اختر نوع الغرفة لكل معتمر لعرض السعر في الملخص`;
  };

  const refreshMemberRoomTypeSelects = () => {
    const stars = getSelectedPackageStars();
    membersContainer?.querySelectorAll('.member-room-type').forEach((sel) => {
      const current = sel.value;
      sel.innerHTML = buildRoomTypeOptions(stars, current);
    });
  };

  const getMemberRowHtml = (index) => {
    const stars = getSelectedPackageStars() || tripPackages[0]?.stars;
    return `
    <div class="member-block" data-member-index="${index}">
      <div class="member-row member-row--extended" data-member-index="${index}">
        <div class="member-row-num">${index + 1}</div>
        <div class="member-row-field member-row-field--name">
          <input class="form-control member-name" name="members[${index}][name]" placeholder="الاسم" required>
        </div>
        <div class="member-row-field">
          <select class="form-select form-select-sm member-type" name="members[${index}][type]">
            <option value="adult">بالغ</option>
            <option value="child_bed">طفل سرير</option>
            <option value="child_no_bed">طفل بدون</option>
            <option value="infant">رضيع</option>
          </select>
        </div>
        <div class="member-row-field">
          <select class="form-select form-select-sm member-gender" name="members[${index}][gender]">
            <option value="male">ذكر</option>
            <option value="female">أنثى</option>
          </select>
        </div>
        <div class="member-row-field">
          <input class="form-control form-control-sm member-passport" name="members[${index}][passport]" placeholder="جواز">
        </div>
        <div class="member-row-field">
          <select class="form-select form-select-sm member-room-type" name="members[${index}][roomType]" required>
            ${buildRoomTypeOptions(stars, 'quad')}
          </select>
        </div>
        <div class="member-row-field member-row-field--link">
          <input type="hidden" name="members[${index}][roomGroupId]" class="member-room-group" value="room-${index}">
          <input type="hidden" name="members[${index}][linkedManually]" class="member-linked" value="false">
          <div class="room-assignment-control">
            <select class="form-select form-select-sm member-room-target" aria-label="تخصيص الغرفة"></select>
            <span class="room-capacity-pill"></span>
          </div>
        </div>
        <div class="member-row-actions">
          <button type="button" class="btn btn-icon btn-icon--danger member-remove-btn"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>
      ${buildMemberServicesHtml(index)}
      ${buildMemberVipHtml(index)}
    </div>
  `;
  };

  const buildMemberVipHtml = (index) => {
    if (!tripVipItems.length) return '';
    const items = tripVipItems.map((item, j) => `
      <div class="member-vip-item" data-vip-key="${item.vipServiceId || item.name}">
        <label class="service-chip vip-addon-chip member-vip-chip">
          <input type="checkbox" name="members[${index}][vipAddons][${j}][selected]" value="true" class="member-vip-toggle">
          <input type="hidden" name="members[${index}][vipAddons][${j}][vipServiceId]" value="${item.vipServiceId || ''}">
          <input type="hidden" name="members[${index}][vipAddons][${j}][name]" value="${item.name || ''}">
          <span><i class="fa-solid fa-gem"></i> ${item.name} <span class="member-vip-price">+${fmt(item.sellingPrice || 0)}</span></span>
        </label>
        <select class="form-select form-select-sm member-vip-scope" name="members[${index}][vipAddons][${j}][scope]" disabled aria-label="نطاق الخدمة">
          <option value="member">شخصي</option>
          <option value="room_group">للغرفة</option>
        </select>
      </div>`).join('');
    return `
      <div class="member-vip-row">
        <span class="member-services-label"><i class="fa-solid fa-star text-warning"></i> VIP:</span>
        <div class="member-vip-items">${items}</div>
      </div>`;
  };

  const buildMemberServicesHtml = (index) => {
    const chips = DEDUCTION_SERVICES.map((svc) => {
      const amount = Number(tripDeductions[svc.key]) || 0;
      const badge = amount > 0 ? `<span class="member-service-deduction-badge">− ${fmt(amount)} ج.م.</span>` : '';
      return `
        <label class="service-chip member-service-chip">
          <input type="hidden" name="members[${index}][serviceToggles][${svc.key}]" value="false">
          <input type="checkbox" name="members[${index}][serviceToggles][${svc.key}]" value="true" checked
            class="member-service-toggle" data-service="${svc.key}">
          <span><i class="fa-solid ${svc.icon}"></i> ${svc.label}${badge}</span>
        </label>`;
    }).join('');
    const hidden = HIDDEN_MEMBER_SERVICES.map((key) =>
      `<input type="hidden" name="members[${index}][serviceToggles][${key}]" value="true" class="member-service-hidden" data-service="${key}">`
    ).join('');
    return `
      <div class="member-services-row">
        <span class="member-services-label">الخدمات:</span>
        <div class="member-service-chips service-chips">${chips}${hidden}</div>
      </div>`;
  };

  const updateMemberServiceBadges = (block) => {
    if (!block) return;
    block.querySelectorAll('.member-service-chip').forEach((chip) => {
      const input = chip.querySelector('.member-service-toggle');
      const badge = chip.querySelector('.member-service-deduction-badge');
      if (!input || !badge) return;
      badge.classList.toggle('d-none', input.checked);
    });
  };

  const refreshAllMemberServiceBadges = () => {
    membersContainer?.querySelectorAll('.member-block').forEach(updateMemberServiceBadges);
  };

  const wireMemberServiceToggles = (block) => {
    block?.querySelectorAll('.member-service-toggle').forEach((el) => {
      el.addEventListener('change', () => {
        updateMemberServiceBadges(block);
        debouncedPreview();
        debouncedSaveDraft();
      });
    });
  };

  const wrapMemberRowsInBlocks = () => {
    if (!membersContainer) return;
    membersContainer.querySelectorAll('.member-row').forEach((row) => {
      if (row.closest('.member-block')) return;
      const index = Number(row.dataset.memberIndex) || 0;
      const block = document.createElement('div');
      block.className = 'member-block';
      block.dataset.memberIndex = index;
      row.parentNode.insertBefore(block, row);
      block.appendChild(row);
      block.insertAdjacentHTML('beforeend', buildMemberServicesHtml(index));
      block.insertAdjacentHTML('beforeend', buildMemberVipHtml(index));
      wireMemberServiceToggles(block);
      wireMemberVipToggles(block);
      updateMemberServiceBadges(block);
      updateMemberVipScopes(block);
    });
  };

  const refreshMemberServicesRows = () => {
    membersContainer?.querySelectorAll('.member-block').forEach((block, index) => {
      const oldRow = block.querySelector('.member-services-row');
      if (oldRow) oldRow.remove();
      block.insertAdjacentHTML('beforeend', buildMemberServicesHtml(index));
      wireMemberServiceToggles(block);
      updateMemberServiceBadges(block);
    });
  };

  const refreshAllMemberVipRows = () => {
    membersContainer?.querySelectorAll('.member-block').forEach((block, index) => {
      const oldRow = block.querySelector('.member-vip-row');
      if (oldRow) oldRow.remove();
      const html = buildMemberVipHtml(index);
      if (html) block.insertAdjacentHTML('beforeend', html);
      wireMemberVipToggles(block);
      updateMemberVipScopes(block);
    });
    updateVipAssignmentSummary();
  };

  const getRoomGroupSizeForRow = (row) => {
    if (!row || !membersContainer) return 1;
    const gid = row.querySelector('.member-room-group')?.value;
    if (!gid) return 1;
    return [...membersContainer.querySelectorAll('.member-row')].filter(
      (r) => r.querySelector('.member-room-group')?.value === gid,
    ).length;
  };

  const updateMemberVipScopes = (block) => {
    if (!block) return;
    const row = block.querySelector('.member-row');
    const groupSize = getRoomGroupSizeForRow(row);
    block.querySelectorAll('.member-vip-item').forEach((item) => {
      const toggle = item.querySelector('.member-vip-toggle');
      const scopeSel = item.querySelector('.member-vip-scope');
      if (!toggle || !scopeSel) return;
      const roomOpt = scopeSel.querySelector('option[value="room_group"]');
      if (roomOpt) {
        roomOpt.disabled = groupSize <= 1;
        if (groupSize <= 1 && scopeSel.value === 'room_group') {
          scopeSel.value = 'member';
        }
      }
      scopeSel.disabled = !toggle.checked;
      scopeSel.classList.toggle('member-vip-scope--room-shared', toggle.checked && scopeSel.value === 'room_group');
    });
  };

  const refreshAllMemberVipScopes = () => {
    membersContainer?.querySelectorAll('.member-block').forEach(updateMemberVipScopes);
  };

  const wireMemberVipToggles = (block) => {
    block?.querySelectorAll('.member-vip-toggle').forEach((el) => {
      el.addEventListener('change', () => {
        updateMemberVipScopes(block);
        updateVipAssignmentSummary();
        debouncedPreview();
        debouncedSaveDraft();
      });
    });
    block?.querySelectorAll('.member-vip-scope').forEach((el) => {
      el.addEventListener('change', () => {
        updateMemberVipScopes(block);
        updateVipAssignmentSummary();
        debouncedPreview();
        debouncedSaveDraft();
      });
    });
  };

  const collectVipSelectionsFromForm = () => {
    const selections = [];
    membersContainer?.querySelectorAll('.member-block').forEach((block, memberIndex) => {
      const row = block.querySelector('.member-row');
      const roomGroupId = row?.querySelector('.member-room-group')?.value || '';
      block.querySelectorAll('.member-vip-item').forEach((item) => {
        const toggle = item.querySelector('.member-vip-toggle');
        if (!toggle?.checked) return;
        const scopeSel = item.querySelector('.member-vip-scope');
        selections.push({
          vipServiceId: item.querySelector('[name$="[vipServiceId]"]')?.value || undefined,
          name: item.querySelector('[name$="[name]"]')?.value || '',
          scope: scopeSel?.value === 'room_group' ? 'room_group' : 'member',
          memberIndex,
          roomGroupId,
          memberName: row?.querySelector('.member-name')?.value?.trim() || `معتمر ${memberIndex + 1}`,
          sellingPrice: Number(tripVipItems.find((v) =>
            String(v.vipServiceId) === String(item.querySelector('[name$="[vipServiceId]"]')?.value)
            || v.name === item.querySelector('[name$="[name]"]')?.value,
          )?.sellingPrice) || 0,
        });
      });
    });
    return selections;
  };

  const updateVipAssignmentSummary = () => {
    if (!vipAssignmentSummary || !vipAssignmentList) return;
    const selections = collectVipSelectionsFromForm();
    const chargedRoomGroups = new Set();

    if (!selections.length) {
      vipAssignmentSummary.classList.add('d-none');
      vipAssignmentList.innerHTML = '';
      return;
    }

    const lines = [];
    selections.forEach((sel) => {
      if (sel.scope === 'room_group') {
        const key = `${sel.roomGroupId}:${sel.vipServiceId || sel.name}`;
        if (chargedRoomGroups.has(key)) return;
        chargedRoomGroups.add(key);
        const groupNames = [...membersContainer.querySelectorAll('.member-row')]
          .filter((r) => r.querySelector('.member-room-group')?.value === sel.roomGroupId)
          .map((r) => r.querySelector('.member-name')?.value?.trim())
          .filter(Boolean);
        lines.push({
          name: sel.name,
          scope: 'room_group',
          scopeLabel: `للغرفة (${groupNames.join('، ') || 'مجموعة'})`,
          price: sel.sellingPrice,
        });
      } else {
        lines.push({
          name: sel.name,
          scope: 'member',
          scopeLabel: sel.memberName,
          price: sel.sellingPrice,
        });
      }
    });

    vipAssignmentList.innerHTML = lines.map((line) => `
      <li class="vip-assignment-summary__item">
        <span class="vip-assignment-summary__item-label">
          <i class="fa-solid fa-gem text-warning"></i>
          <span>${line.name}</span>
          <span class="vip-assignment-summary__scope vip-assignment-summary__scope--${line.scope === 'room_group' ? 'room' : 'member'}">${line.scopeLabel}</span>
        </span>
        <span class="fw-semibold">+${fmt(line.price)} ج.م.</span>
      </li>`).join('');
    vipAssignmentSummary.classList.remove('d-none');
  };

  const renderVipCatalog = (items = []) => {
    tripVipItems = items;
    if (!vipCatalogCards) return;

    if (!items.length) {
      vipCatalogCards.innerHTML = '';
      if (vipAddonsEmpty) vipAddonsEmpty.classList.remove('d-none');
      if (vipAddonsHint) vipAddonsHint.classList.add('d-none');
      if (vipAddonsSection) vipAddonsSection.classList.add('d-none');
      refreshAllMemberVipRows();
      return;
    }

    if (vipAddonsEmpty) vipAddonsEmpty.classList.add('d-none');
    if (vipAddonsHint) vipAddonsHint.classList.remove('d-none');
    if (vipAddonsSection) vipAddonsSection.classList.remove('d-none');

    vipCatalogCards.innerHTML = items.map((item) => `
      <div class="vip-catalog-card">
        <div class="vip-catalog-card__icon"><i class="fa-solid fa-gem"></i></div>
        <div>
          <div class="vip-catalog-card__name">${item.name}</div>
          <div class="vip-catalog-card__price">+${fmt(item.sellingPrice || 0)} ج.م.</div>
          <div class="vip-catalog-card__scope">شخصي أو للغرفة المرتبطة</div>
        </div>
      </div>`).join('');

    refreshAllMemberVipRows();
  };

  const getMembersState = () => {
    const blocks = membersContainer?.querySelectorAll('.member-block') || [];
    return [...blocks].map((block, index) => {
      const row = block.querySelector('.member-row');
      return {
        index,
        row,
        block,
        roomGroupId: row?.querySelector('.member-room-group')?.value || `room-${index}`,
        roomType: row?.querySelector('.member-room-type')?.value || 'quad',
        memberType: row?.querySelector('.member-type')?.value || 'adult',
        name: row?.querySelector('.member-name')?.value?.trim() || '',
      };
    });
  };

  const buildRoomGroupsState = (members = getMembersState()) => {
    const map = new Map();
    members.forEach((m) => {
      if (!map.has(m.roomGroupId)) {
        map.set(m.roomGroupId, { id: m.roomGroupId, memberIndices: [], leaderIndex: m.index });
      }
      const g = map.get(m.roomGroupId);
      g.memberIndices.push(m.index);
      if (m.index < g.leaderIndex) g.leaderIndex = m.index;
    });
    const groups = [...map.values()].sort((a, b) => a.leaderIndex - b.leaderIndex);
    groups.forEach((g, i) => {
      g.displayNum = i + 1;
      const leader = members.find((m) => m.index === g.leaderIndex);
      g.roomType = leader?.roomType || 'quad';
      g.capacity = ROOM_CAPACITY[g.roomType] || 4;
      g.bedsUsed = g.memberIndices.reduce((sum, idx) => {
        const member = members.find((x) => x.index === idx);
        return sum + (member && usesBed(member.memberType) ? 1 : 0);
      }, 0);
      g.memberCount = g.memberIndices.length;
      g.leaderName = leader?.name || '';
      g.isFull = g.bedsUsed >= g.capacity;
    });
    return groups;
  };

  const canMemberJoinGroup = (group, memberIndex, memberType, members) => {
    const alreadyIn = group.memberIndices.includes(memberIndex);
    let beds = group.bedsUsed;
    if (!alreadyIn && usesBed(memberType)) beds += 1;
    return beds <= group.capacity;
  };

  const updateRoomCapacityUI = (members = getMembersState(), groups = buildRoomGroupsState(members)) => {
    members.forEach((m) => {
      const pill = m.row.querySelector('.room-capacity-pill');
      const group = groups.find((g) => g.id === m.roomGroupId);
      if (!pill) return;
      if (!group) {
        pill.classList.add('d-none');
        return;
      }
      const isLeader = group.leaderIndex === m.index;
      pill.textContent = `${ROOM_LABELS[group.roomType]} · ${group.bedsUsed}/${group.capacity}`;
      pill.classList.toggle('room-capacity-pill--full', group.isFull);
      pill.classList.toggle('room-capacity-pill--leader', isLeader);
      pill.classList.remove('d-none');
    });
  };

  const refreshRoomTargetSelects = () => {
    const members = getMembersState();
    const groups = buildRoomGroupsState(members);

    members.forEach((m) => {
      const select = m.row.querySelector('.member-room-target');
      if (!select) return;
      const currentGid = m.roomGroupId;
      let html = '';
      groups.forEach((g) => {
        const canJoin = canMemberJoinGroup(g, m.index, m.memberType, members);
        const isCurrent = g.id === currentGid;
        const disabled = !canJoin && !isCurrent;
        const leaderLabel = g.leaderName || `معتمر ${g.leaderIndex + 1}`;
        const label = `غرفة ${g.displayNum} · ${ROOM_LABELS[g.roomType]} · ${g.bedsUsed}/${g.capacity} — ${leaderLabel}`;
        html += `<option value="${g.id}"${isCurrent ? ' selected' : ''}${disabled ? ' disabled' : ''}>${label}</option>`;
      });
      html += '<option value="__new__">+ غرفة جديدة مستقلة</option>';
      select.innerHTML = html;
      if (groups.some((g) => g.id === currentGid)) {
        select.value = currentGid;
      }
    });

    updateRoomCapacityUI(members, groups);
  };

  const validateRoomCapacities = () => {
    const groups = buildRoomGroupsState();
    const errors = [];
    groups.forEach((g) => {
      if (g.bedsUsed > g.capacity) {
        errors.push(
          `غرفة ${g.displayNum} (${ROOM_LABELS[g.roomType]}): ${g.bedsUsed} أسرة تتجاوز الحد الأقصى ${g.capacity}`,
        );
      }
    });
    return errors;
  };

  const syncRoomGroupLinkageFromHidden = () => {
    const rows = membersContainer?.querySelectorAll('.member-row') || [];
    const members = getMembersState();
    const groups = buildRoomGroupsState(members);

    rows.forEach((row) => {
      const index = Number(row.dataset.memberIndex);
      const gid = row.querySelector('.member-room-group')?.value;
      const group = groups.find((g) => g.id === gid);
      const linkedInput = row.querySelector('.member-linked');
      const roomSelect = row.querySelector('.member-room-type');
      if (!group) return;

      const isLeader = group.leaderIndex === index;
      if (linkedInput) linkedInput.value = isLeader ? 'false' : 'true';
      if (roomSelect && !isLeader) {
        const leaderMember = members.find((m) => m.index === group.leaderIndex);
        const leaderType = leaderMember?.row?.querySelector('.member-room-type')?.value;
        if (leaderType) roomSelect.value = leaderType;
      }
    });

    refreshRoomTargetSelects();
    updateLinkVisualState();
    refreshAllMemberVipScopes();
  };

  const applyRoomAssignmentsFromTargets = () => {
    const rows = membersContainer?.querySelectorAll('.member-row') || [];
    rows.forEach((row) => {
      const target = row.querySelector('.member-room-target');
      const groupInput = row.querySelector('.member-room-group');
      const linkedInput = row.querySelector('.member-linked');
      if (!groupInput) return;

      if (target?.value === '__new__') {
        groupInput.value = `room-${Date.now()}-${row.dataset.memberIndex || 0}`;
        if (linkedInput) linkedInput.value = 'false';
      } else if (target?.value) {
        groupInput.value = target.value;
      }
    });

    syncRoomGroupLinkageFromHidden();
  };

  const applyRoomAssignments = () => {
    if (isRestoringDraft) {
      refreshRoomTargetSelects();
      syncRoomGroupLinkageFromHidden();
      return;
    }
    applyRoomAssignmentsFromTargets();
  };

  const handleLeaderRoomTypeChange = (row, newType) => {
    const index = Number(row.dataset.memberIndex);
    const members = getMembersState();
    const groups = buildRoomGroupsState(members);
    const myGroup = groups.find((g) => g.leaderIndex === index);
    if (!myGroup) return true;

    const newCap = ROOM_CAPACITY[newType] || 4;
    if (myGroup.bedsUsed > newCap) {
      window.OGToast?.error(
        `لا يمكن تغيير نوع الغرفة — المجموعة تضم ${myGroup.bedsUsed} أسرة و${ROOM_LABELS[newType]} يقبل ${newCap} فقط`,
      );
      const roomSelect = row.querySelector('.member-room-type');
      if (roomSelect) roomSelect.value = myGroup.roomType;
      return false;
    }
    applyRoomAssignments();
    return true;
  };

  const syncRoomTypeForSubmit = (row, roomSelect, linked, index) => {
    if (!row || !roomSelect) return;
    let hidden = row.querySelector('.member-room-type-submit');
    if (linked) {
      if (!hidden) {
        hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.className = 'member-room-type-submit';
        row.appendChild(hidden);
      }
      hidden.name = `members[${index}][roomType]`;
      hidden.value = roomSelect.value;
      roomSelect.removeAttribute('name');
      roomSelect.disabled = true;
    } else {
      hidden?.remove();
      roomSelect.name = `members[${index}][roomType]`;
      roomSelect.disabled = false;
    }
  };

  const updateLinkVisualState = () => {
    membersContainer?.querySelectorAll('.member-block').forEach((block, index) => {
      const row = block.querySelector('.member-row');
      if (!row) return;
      const linked = row.querySelector('.member-linked')?.value === 'true';
      const roomSelect = row.querySelector('.member-room-type');
      block.classList.toggle('member-block--room-linked', linked);
      if (roomSelect) {
        roomSelect.classList.toggle('room-type-synced', linked);
        syncRoomTypeForSubmit(row, roomSelect, linked, index);
      }
    });
  };

  const reindexMembers = () => {
    const blocks = membersContainer.querySelectorAll('.member-block');
    blocks.forEach((block, index) => {
      block.dataset.memberIndex = index;
      const row = block.querySelector('.member-row');
      if (!row) return;
      row.dataset.memberIndex = index;
      row.querySelector('.member-row-num').textContent = index + 1;

      const fields = [
        'name', 'type', 'gender', 'passport', 'nationality',
        'roomType', 'roomGroupId', 'linkedManually',
      ];
      fields.forEach((field) => {
        const el = row.querySelector(`[name$="[${field}]"]`);
        if (el) el.name = `members[${index}][${field}]`;
      });
      const hiddenRoomType = row.querySelector('.member-room-type-submit');
      if (hiddenRoomType) hiddenRoomType.name = `members[${index}][roomType]`;
      const roomSelect = row.querySelector('.member-room-type');
      if (roomSelect?.name) roomSelect.name = `members[${index}][roomType]`;

      block.querySelectorAll('[name*="serviceToggles"]').forEach((el) => {
        const match = el.name.match(/\[serviceToggles\]\[([^\]]+)\]/);
        if (match) el.name = `members[${index}][serviceToggles][${match[1]}]`;
      });

      block.querySelectorAll('[name*="vipAddons"]').forEach((el) => {
        const match = el.name.match(/\[vipAddons\]\[(\d+)\]/);
        if (match) el.name = el.name.replace(/members\[\d+\]/, `members[${index}]`);
      });

      const removeBtn = row.querySelector('.member-remove-btn');
      if (removeBtn) {
        removeBtn.disabled = blocks.length <= 1;
      }
    });
    refreshRoomTargetSelects();
    if (!isRestoringDraft) {
      applyRoomAssignmentsFromTargets();
    }
    refreshAllMemberServiceBadges();
  };

  const loadTripPackages = async (tripId) => {
    if (!tripId) {
      tripPackages = [];
      if (packageStarsSelect) {
        packageStarsSelect.innerHTML = '<option value="">اختر الرحلة أولاً</option>';
        packageStarsSelect.disabled = true;
      }
      if (accommodationSection) accommodationSection.classList.add('d-none');
      return;
    }

    try {
      const res = await fetch(`/trips/${tripId}/hotels-json`);
      if (!res.ok) {
        await window.OGToast?.apiError(res, 'تعذر تحميل باقات الإقامة');
        tripPackages = [];
        starRoomPrices = {};
        tripDeductions = {};
      } else {
        const json = await res.json();
        tripPackages = json.success ? json.packages || [] : [];
        starRoomPrices = json.starRoomPrices || {};
        tripDeductions = json.deductions || {};
      }
    } catch {
      tripPackages = [];
      starRoomPrices = {};
      tripDeductions = {};
    }

    if (packageStarsSelect) {
      packageStarsSelect.disabled = false;
      const prev = packageStarsSelect.value;
      packageStarsSelect.innerHTML = buildPackageSelectOptions(prev);
      if (prev && [...packageStarsSelect.options].some((o) => o.value === prev)) {
        packageStarsSelect.value = prev;
      } else if (tripPackages[0]) {
        packageStarsSelect.value = tripPackages[0].stars;
      }
    }

    if (accommodationSection) {
      accommodationSection.classList.toggle('d-none', tripPackages.length === 0);
    }

    updatePackagePricingHint();
    refreshMemberRoomTypeSelects();
    refreshMemberServicesRows();
    refreshAllMemberServiceBadges();
  };

  const readMemberServiceToggles = (block) => {
    const toggles = {};
    block?.querySelectorAll('.member-service-toggle').forEach((el) => {
      toggles[el.dataset.service] = el.checked;
    });
    block?.querySelectorAll('.member-service-hidden').forEach((el) => {
      toggles[el.dataset.service] = true;
    });
    return toggles;
  };

  const readMemberFromRow = (row) => ({
    name: row.querySelector('.member-name')?.value?.trim() || '',
    type: row.querySelector('.member-type')?.value || 'adult',
    gender: row.querySelector('.member-gender')?.value || 'male',
    passport: row.querySelector('.member-passport')?.value?.trim() || row.querySelector('[name$="[passport]"]')?.value?.trim() || '',
    nationality: row.querySelector('[name$="[nationality]"]')?.value?.trim() || 'مصري',
    roomType: row.querySelector('.member-room-type')?.value || 'quad',
    roomGroupId: row.querySelector('.member-room-group')?.value || '',
    linkedManually: row.querySelector('.member-linked')?.value === 'true',
  });

  const readMemberVipFromBlock = (block) => {
    const vip = [];
    block?.querySelectorAll('.member-vip-item').forEach((item, j) => {
      const toggle = item.querySelector('.member-vip-toggle');
      const scopeSel = item.querySelector('.member-vip-scope');
      vip.push({
        selected: toggle?.checked || false,
        scope: scopeSel?.value || 'member',
        vipServiceId: item.querySelector('[name$="[vipServiceId]"]')?.value || '',
        name: item.querySelector('[name$="[name]"]')?.value || '',
      });
    });
    return vip;
  };

  const applyMemberVipToBlock = (block, vipList = []) => {
    if (!block || !vipList.length) return;
    block.querySelectorAll('.member-vip-item').forEach((item, j) => {
      const saved = vipList[j];
      if (!saved) return;
      const toggle = item.querySelector('.member-vip-toggle');
      const scopeSel = item.querySelector('.member-vip-scope');
      if (toggle) toggle.checked = saved.selected === true || saved.selected === 'true';
      if (scopeSel && saved.scope) scopeSel.value = saved.scope;
    });
    updateMemberVipScopes(block);
  };

  const collectFormData = () => {
    applyRoomAssignments();
    const data = {
      tripId: form.tripId.value,
      packageStars: packageStarsSelect?.value || '',
      discount: parseMoneyInput(discountInput?.value),
      serviceToggles: { insurance: true, tours: true },
      members: [],
    };
    membersContainer.querySelectorAll('.member-block').forEach((block) => {
      const row = block.querySelector('.member-row');
      const member = readMemberFromRow(row);
      member.serviceToggles = readMemberServiceToggles(block);
      member.vipAddons = readMemberVipFromBlock(block);
      data.members.push(member);
    });
    return data;
  };

  const renderVipAddons = (items = []) => {
    renderVipCatalog(items);
  };

  const loadVipItemsForTrip = async (tripId) => {
    if (!tripId) { renderVipCatalog([]); return; }
    try {
      const res = await fetch(`/trips/${tripId}/vip-items`);
      if (!res.ok) {
        await window.OGToast?.apiError(res, 'تعذر تحميل خدمات VIP');
        renderVipCatalog([]);
        return;
      }
      const json = await res.json();
      if (json.success) {
        renderVipCatalog(json.vipItems || []);
        updateVipAssignmentSummary();
        debouncedPreview();
      } else {
        window.OGToast?.error(json.message || 'تعذر تحميل خدمات VIP');
        renderVipCatalog([]);
      }
    } catch {
      renderVipCatalog([]);
    }
  };

  const renderPricingSummary = (pricing, formData) => {
    const paid = parseMoneyInput(paidInput?.value);
    const total = pricing.total || 0;
    const paidExceeds = total > 0 && paid > total;
    const balance = paidExceeds ? paid - total : Math.max(0, total - paid);
    updateFinanceDueDisplay(total);
    validateFinancialFields();
    const memberCount = formData.members.length;
    const serviceDeductions = pricing.serviceDeductions || [];
    const hasServiceDeductions = serviceDeductions.length > 0;

    let rowsHtml = '';
    (pricing.breakdown || []).forEach((b, i) => {
      const displayName = b.name?.trim() || `معتمر ${i + 1}`;
      const typeLabel = TYPE_LABELS[b.type] || b.type || 'بالغ';
      const roomLabel = ROOM_LABELS[b.roomType] || b.roomType || '';
      const amount = hasServiceDeductions ? (b.base ?? b.final) : b.final;
      rowsHtml += `
        <div class="pricing-summary-row">
          <div class="pricing-summary-member">
            <span class="pricing-summary-name">${displayName}</span>
            <span class="pricing-summary-type">${typeLabel}${roomLabel ? ' — ' + roomLabel : ''}</span>
          </div>
          <span class="pricing-summary-amount">${fmt(amount)} ج.م.</span>
        </div>`;
    });

    serviceDeductions.forEach((d) => {
      rowsHtml += `
        <div class="pricing-summary-row pricing-summary-row--deduction">
          <div class="pricing-summary-member">
            <span class="pricing-summary-name">− ${d.label}</span>
          </div>
          <span class="pricing-summary-amount pricing-summary-amount--deduction">− ${fmt(d.amount)} ج.م.</span>
        </div>`;
    });

    (pricing.vipAddons || []).forEach((addon) => {
      const scopeText = addon.scope === 'room_group'
        ? `للغرفة (${addon.memberName || `${addon.groupSize || ''} معتمرين`})`
        : addon.memberName || 'شخصي';
      rowsHtml += `
        <div class="pricing-summary-row pricing-summary-row--addon">
          <div class="pricing-summary-member">
            <span class="pricing-summary-name">+ ${addon.name}</span>
            <span class="pricing-summary-type">${scopeText}</span>
          </div>
          <span class="pricing-summary-amount">+ ${fmt(addon.sellingPrice)} ج.م.</span>
        </div>`;
    });

    pricingPreview.innerHTML = `
      <div class="pricing-summary-card">
        <div class="pricing-summary-header">
          <span><i class="fa-solid fa-receipt me-2"></i>ملخص السعر</span>
          <span class="pricing-summary-badge">${memberCount} معتمر${memberCount > 1 ? 'ين' : ''}</span>
        </div>
        <div class="pricing-summary-body">${rowsHtml || '<p class="text-muted mb-0 small">لا يوجد معتمرين</p>'}</div>
        <div class="pricing-summary-totals">
          <div class="pricing-summary-total-row"><span>المجموع الفرعي</span><span>${fmt(pricing.subtotal)} ج.م.</span></div>
          ${pricing.discount > 0 ? `<div class="pricing-summary-total-row"><span>الخصم</span><span class="text-danger">− ${fmt(pricing.discount)} ج.م.</span></div>` : ''}
          <div class="pricing-summary-total-row pricing-summary-total-row--grand"><span>الإجمالي</span><span>${fmt(pricing.total)} ج.م.</span></div>
          ${paidExceeds ? `
          <div class="pricing-summary-alert pricing-summary-alert--danger">
            <i class="fa-solid fa-circle-exclamation"></i>
            <span>المبلغ المدفوع يتجاوز الإجمالي بـ ${fmt(balance)} ج.م.</span>
          </div>` : ''}
          <div class="pricing-summary-total-row"><span>المدفوع</span><span class="${paidExceeds ? 'text-danger' : ''}">${fmt(paid)} ج.م.</span></div>
          <div class="pricing-summary-total-row pricing-summary-total-row--balance${paidExceeds ? ' pricing-summary-total-row--error' : ''}">
            <span>${paidExceeds ? 'تجاوز الدفع' : 'المتبقي'}</span>
            <span>${paidExceeds ? `${fmt(balance)} ج.م.` : `${fmt(Math.max(0, total - paid))} ج.م.`}</span>
          </div>
        </div>
      </div>`;
  };

  const renderPreviewLoading = () => {
    pricingPreview.innerHTML = '<div class="pricing-summary-card pricing-summary-card--loading"><p class="text-muted mb-0 small">جاري حساب السعر...</p></div>';
  };

  const renderPreviewError = () => {
    pricingPreview.innerHTML = '<div class="pricing-summary-card pricing-summary-card--error"><p class="mb-2">تعذر حساب السعر. تحقق من البيانات.</p><button type="button" class="btn btn-outline-primary btn-sm" id="retryPreviewBtn">إعادة المحاولة</button></div>';
    document.getElementById('retryPreviewBtn')?.addEventListener('click', runPreview);
  };

  const renderPreviewPlaceholder = () => {
    pricingPreview.innerHTML = '<div class="pricing-summary-card pricing-summary-card--empty"><i class="fa-solid fa-calculator"></i><p class="mb-0">اختر الرحلة لعرض ملخص السعر</p></div>';
    updateFinanceDueDisplay(0);
    validateFinancialFields();
  };

  const runPreview = async () => {
    if (!pricingPreview) return;
    if (!form.tripId?.value) {
      lastPricing = null;
      previewFailed = false;
      renderPreviewPlaceholder();
      return;
    }

    const requestId = ++previewRequestId;
    renderPreviewLoading();

    try {
      const data = collectFormData();
      const res = await fetch('/reservations/preview-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        await window.OGToast?.apiError(res, 'تعذر حساب السعر');
        if (requestId !== previewRequestId) return;
        previewFailed = true;
        lastPricing = null;
        renderPreviewError();
        return;
      }
      const json = await res.json();
      if (requestId !== previewRequestId) return;

      if (json.success) {
        lastPricing = json.pricing;
        previewFailed = false;
        renderPricingSummary(json.pricing, data);
      } else {
        previewFailed = true;
        lastPricing = null;
        renderPreviewError();
      }
    } catch {
      if (requestId !== previewRequestId) return;
      previewFailed = true;
      lastPricing = null;
      renderPreviewError();
    }
  };

  const debouncedPreview = debounce(runPreview, 300);
  const debouncedSaveDraft = debounce(saveDraft, 400);

  const toggleBrokerFields = () => {
    const isBroker = groupTypeSelect?.value === 'broker';
    const hasExistingBroker = Boolean(brokerSelect?.value);
    const requireNewBroker = isBroker && !hasExistingBroker;

    brokerSelectWrap?.classList.toggle('d-none', !isBroker);
    newBrokerWrap?.classList.toggle('d-none', !isBroker);
    newBrokerPhoneWrap?.classList.toggle('d-none', !isBroker);
    primaryCustomerWrap?.classList.toggle('d-none', isBroker);
    primaryPhoneWrap?.classList.toggle('d-none', isBroker);

    if (newBrokerNameInput) {
      newBrokerNameInput.required = requireNewBroker;
      newBrokerNameInput.setCustomValidity('');
    }
    if (newBrokerPhoneInput) {
      newBrokerPhoneInput.required = requireNewBroker;
      newBrokerPhoneInput.setCustomValidity('');
      if (requireNewBroker) {
        newBrokerPhoneInput.setAttribute('pattern', '01[0-9]{9}');
      } else {
        newBrokerPhoneInput.removeAttribute('pattern');
      }
    }

    document.getElementById('newBrokerNameRequired')?.classList.toggle('d-none', !requireNewBroker);
    document.getElementById('newBrokerPhoneRequired')?.classList.toggle('d-none', !requireNewBroker);

    if (primaryCustomerName) {
      primaryCustomerName.required = !isBroker;
      primaryCustomerName.setCustomValidity('');
    }
    if (primaryPhoneInput) {
      primaryPhoneInput.required = !isBroker;
      primaryPhoneInput.setCustomValidity('');
      if (isBroker) {
        primaryPhoneInput.removeAttribute('pattern');
      } else {
        primaryPhoneInput.setAttribute('pattern', '01[0-9]{9}');
      }
    }
  };

  const validateForm = () => {
    applyRoomAssignments();
    let valid = form.checkValidity();
    const financialOk = validateFinancialFields();
    if (!financialOk) valid = false;
    if (!form.tripId?.value) valid = false;
    if (!packageStarsSelect?.value) valid = false;

    if (groupTypeSelect?.value === 'broker') {
      const hasExistingBroker = Boolean(brokerSelect?.value);
      const newName = newBrokerNameInput?.value?.trim();
      const newPhone = newBrokerPhoneInput?.value?.trim();
      if (!hasExistingBroker && (!newName || !newPhone)) valid = false;
      if (!hasExistingBroker && newPhone && !/^01[0-9]{9}$/.test(newPhone)) valid = false;
    }

    const roomErrors = validateRoomCapacities();
    if (roomErrors.length) valid = false;

    return valid;
  };

  const showValidationToast = () => {
    if (!form.tripId?.value) {
      window.OGToast?.error('يرجى اختيار الرحلة');
      return;
    }
    if (!packageStarsSelect?.value) {
      window.OGToast?.error('يرجى اختيار باقة الإقامة');
      return;
    }
    const roomErrors = validateRoomCapacities();
    if (roomErrors.length) {
      window.OGToast?.error(roomErrors[0]);
      return;
    }
    if (groupTypeSelect?.value === 'broker') {
      const hasExistingBroker = Boolean(brokerSelect?.value);
      if (!hasExistingBroker) {
        const newName = newBrokerNameInput?.value?.trim();
        const newPhone = newBrokerPhoneInput?.value?.trim();
        if (!newName) {
          window.OGToast?.error('يرجى إدخال اسم السمسار');
          return;
        }
        if (!newPhone) {
          window.OGToast?.error('يرجى إدخال هاتف السمسار');
          return;
        }
        if (!/^01[0-9]{9}$/.test(newPhone)) {
          window.OGToast?.error('رقم هاتف السمسار غير صالح (11 رقم يبدأ بـ 01)');
          return;
        }
      }
    }
    if (discountInput?.validationMessage || paidInput?.validationMessage) {
      if (paidInput?.validationMessage) {
        window.OGToast?.error(paidInput.validationMessage);
      } else {
        window.OGToast?.error(discountInput?.validationMessage || 'تحقق من الخصم أو المبلغ المدفوع');
      }
      return;
    }
    window.OGToast?.error('يرجى إكمال جميع الحقول المطلوبة');
  };

  const setSubmitLoading = (loading) => {
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('is-loading', loading);
    if (loading) {
      if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> جاري الحفظ...';
    } else if (btn.dataset.originalHtml) {
      btn.innerHTML = btn.dataset.originalHtml;
    }
  };

  const normalizeMembersArray = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'object') {
      return Object.keys(raw)
        .filter((k) => /^\d+$/.test(k))
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => raw[k]);
    }
    return [];
  };

  const fillMemberBlockFromData = (block, m) => {
    const row = block?.querySelector('.member-row');
    if (!row || !m) return;
    const setVal = (sel, val) => {
      const el = row.querySelector(sel);
      if (el && val != null && val !== '') el.value = val;
    };
    setVal('.member-name', m.name);
    setVal('.member-type', m.type);
    setVal('.member-gender', m.gender);
    setVal('.member-passport', m.passport);
    setVal('.member-room-type', m.roomType);
    setVal('.member-room-group', m.roomGroupId);
    const linkedInput = row.querySelector('.member-linked');
    if (linkedInput) {
      const linked = m.linked === true || m.linked === 'true' || m.linkedManually === true || m.linkedManually === 'true';
      linkedInput.value = linked ? 'true' : 'false';
    }
    if (m.serviceToggles) {
      block.querySelectorAll('.member-service-toggle').forEach((el) => {
        const key = el.dataset.service;
        if (key && m.serviceToggles[key] != null) el.checked = m.serviceToggles[key] === true || m.serviceToggles[key] === 'true';
      });
    }
    if (m.vipAddons) applyMemberVipToBlock(block, normalizeMembersArray(m.vipAddons));
  };

  const restoreFromDraftData = async (data) => {
    if (!data) return;
    isRestoringDraft = true;
    try {
      if (data.tripId && tripSelect) {
        tripSelect.value = data.tripId;
        await loadTripPackages(data.tripId);
        await loadVipItemsForTrip(data.tripId);
      }
      if (data.packageStars && packageStarsSelect) packageStarsSelect.value = data.packageStars;
      if (data.groupType && groupTypeSelect) {
        groupTypeSelect.value = data.groupType === 'friends' ? 'family' : data.groupType;
      }
      if (data.brokerId && brokerSelect) brokerSelect.value = data.brokerId;
      const newBrokerNameEl = document.getElementById('newBrokerName');
      const newBrokerPhoneEl = document.getElementById('newBrokerPhone');
      if (newBrokerNameEl && data.newBrokerName) newBrokerNameEl.value = data.newBrokerName;
      if (newBrokerPhoneEl && data.newBrokerPhone) newBrokerPhoneEl.value = data.newBrokerPhone;
      if (primaryCustomerName) {
        primaryCustomerName.value = data.primaryCustomerName || '';
        primaryCustomerName.dataset.userEdited = data.primaryCustomerUserEdited ? '1' : '0';
      }
      if (primaryCustomerIdInput && data.primaryCustomerId) {
        primaryCustomerIdInput.value = data.primaryCustomerId;
      }
      if (form.primaryPhone) form.primaryPhone.value = data.primaryPhone || '';
      if (form.notes) form.notes.value = data.notes || '';
      if (discountInput) discountInput.value = data.discount || '0';
      if (paidInput) paidInput.value = data.paidAmount || '0';

      toggleBrokerFields();

      const members = normalizeMembersArray(data.members);
      if (members.length) {
        const blocks = membersContainer.querySelectorAll('.member-block');
        for (let i = blocks.length - 1; i >= 1; i -= 1) blocks[i]?.remove();
        for (let i = 1; i < members.length; i += 1) {
          const wrapper = document.createElement('div');
          wrapper.innerHTML = getMemberRowHtml(i);
          const block = wrapper.firstElementChild;
          membersContainer.appendChild(block);
          wireMemberServiceToggles(block);
          wireMemberVipToggles(block);
          updateMemberServiceBadges(block);
          updateMemberVipScopes(block);
        }
        reindexMembers();
        members.forEach((m, i) => {
          const block = membersContainer.querySelectorAll('.member-block')[i];
          fillMemberBlockFromData(block, m);
        });
        refreshRoomTargetSelects();
        syncRoomGroupLinkageFromHidden();
        refreshAllMemberServiceBadges();
        updateVipAssignmentSummary();
      }

      updatePackagePricingHint();
      refreshMemberRoomTypeSelects();
    } finally {
      isRestoringDraft = false;
      saveDraft();
      runPreview();
    }
  };

  const loadStoredDraft = () => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const isUsableReservationDraft = (data) => {
    if (!data || typeof data !== 'object') return false;
    if (data.tripId || data.packageStars) return true;
    if (Array.isArray(data.members) && data.members.length) return true;
    if (data.members && typeof data.members === 'object' && Object.keys(data.members).length) return true;
    return false;
  };

  const resolveActionUrl = (url) => {
    if (!url) return window.location.href;
    try {
      return new URL(url, window.location.origin).href;
    } catch {
      return url;
    }
  };

  const initDraftRestore = async () => {
    const banner = document.getElementById('draftRestoreBanner');
    const sessionEl = document.getElementById('reservationSessionDraft');

    if (sessionEl?.textContent?.trim()) {
      try {
        const body = JSON.parse(sessionEl.textContent);
        if (isUsableReservationDraft(body)) {
          if (banner) {
            banner.classList.remove('d-none');
            const msg = banner.querySelector('span');
            if (msg) msg.innerHTML = '<i class="fa-solid fa-cloud-arrow-down me-2"></i>تم استعادة البيانات بعد فشل الحفظ — راجع ثم أعد المحاولة';
          }
          await restoreFromDraftData(body);
          return;
        }
      } catch { /* ignore */ }
    }

    const draft = loadStoredDraft();
    if (!draft?.members?.length) return;

    if (banner) banner.classList.remove('d-none');
    await restoreFromDraftData(draft);
  };

  const scrollToFirstInvalid = () => {
    const first = form.querySelector(':invalid');
    if (first) {
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      first.focus();
    }
  };

  function collectDraftState() {
    return {
      savedAt: Date.now(),
      tripId: form.tripId?.value || '',
      packageStars: packageStarsSelect?.value || '',
      groupType: groupTypeSelect?.value || 'family',
      brokerId: brokerSelect?.value || '',
      newBrokerName: document.getElementById('newBrokerName')?.value || '',
      newBrokerPhone: document.getElementById('newBrokerPhone')?.value || '',
      primaryCustomerName: form.primaryCustomerName?.value || '',
      primaryCustomerId: primaryCustomerIdInput?.value || '',
      primaryPhone: form.primaryPhone?.value || '',
      primaryCustomerUserEdited: primaryCustomerName?.dataset?.userEdited === '1',
      members: [],
      discount: discountInput?.value || '0',
      paidAmount: paidInput?.value || '0',
      notes: form.notes?.value || '',
    };
  }

  function saveDraft() {
    if (isRestoringDraft) return;
    const draft = collectDraftState();
    membersContainer?.querySelectorAll('.member-block').forEach((block) => {
      const row = block.querySelector('.member-row');
      draft.members.push({
        name: row.querySelector('.member-name')?.value || '',
        type: row.querySelector('.member-type')?.value || 'adult',
        gender: row.querySelector('.member-gender')?.value || 'male',
        passport: row.querySelector('.member-passport')?.value || '',
        roomType: row.querySelector('.member-room-type')?.value || 'quad',
        roomGroupId: row.querySelector('.member-room-group')?.value || '',
        linked: row.querySelector('.member-linked')?.value === 'true',
        vipAddons: readMemberVipFromBlock(block),
        serviceToggles: readMemberServiceToggles(block),
      });
    });
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
  }

  const clearDraft = () => {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    document.getElementById('draftRestoreBanner')?.classList.add('d-none');
  };

  if (addMemberBtn && membersContainer) {
    addMemberBtn.addEventListener('click', () => {
      const index = membersContainer.querySelectorAll('.member-block').length;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = getMemberRowHtml(index);
      const block = wrapper.firstElementChild;
      membersContainer.appendChild(block);
      wireMemberServiceToggles(block);
      updateMemberServiceBadges(block);
      wireMemberVipToggles(block);
      updateMemberVipScopes(block);
      reindexMembers();
      debouncedPreview();
      debouncedSaveDraft();
    });
  }

  membersContainer?.addEventListener('click', (e) => {
    const btn = e.target.closest('.member-remove-btn');
    if (!btn || btn.disabled) return;
    btn.closest('.member-block')?.remove();
    reindexMembers();
    debouncedPreview();
    debouncedSaveDraft();
  });

  membersContainer?.addEventListener('input', (e) => {
    const row = e.target.closest('.member-row');
    if (e.target.matches('.member-name, .member-passport')) {
      if (e.target.matches('.member-name')) {
        refreshRoomTargetSelects();
      }
      if (e.target.matches('.member-name') && row?.dataset.memberIndex === '0') {
        if (primaryCustomerName && primaryCustomerName.dataset.userEdited !== '1') {
          primaryCustomerName.value = e.target.value.trim();
        }
      }
      debouncedPreview();
      debouncedSaveDraft();
    }
  });

  membersContainer?.addEventListener('change', (e) => {
    const row = e.target.closest('.member-row');
    if (e.target.matches('.member-type, .member-gender, .member-room-type, .member-room-target')) {
      if (e.target.matches('.member-room-target')) {
        applyRoomAssignmentsFromTargets();
      } else if (e.target.matches('.member-room-type')) {
        if (!handleLeaderRoomTypeChange(row, e.target.value)) return;
      } else if (e.target.matches('.member-type')) {
        applyRoomAssignments();
      }
      debouncedPreview();
      debouncedSaveDraft();
    }
  });

  form.querySelectorAll('.service-toggle').forEach((el) => {
    el.addEventListener('change', () => { debouncedPreview(); debouncedSaveDraft(); });
  });

  packageStarsSelect?.addEventListener('change', () => {
    updatePackagePricingHint();
    refreshMemberRoomTypeSelects();
    debouncedPreview();
    debouncedSaveDraft();
  });

  tripSelect?.addEventListener('change', async () => {
    await loadTripPackages(tripSelect.value);
    loadVipItemsForTrip(tripSelect.value);
    debouncedPreview();
    debouncedSaveDraft();
  });

  groupTypeSelect?.addEventListener('change', () => {
    toggleBrokerFields();
    debouncedSaveDraft();
  });

  brokerSelect?.addEventListener('change', () => {
    toggleBrokerFields();
    debouncedSaveDraft();
  });

  newBrokerNameInput?.addEventListener('input', () => {
    toggleBrokerFields();
  });
  newBrokerPhoneInput?.addEventListener('input', () => {
    toggleBrokerFields();
  });

  document.querySelectorAll('.finance-quick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyPaidQuickAction(btn.dataset.paidAction);
    });
  });

  discountInput?.addEventListener('input', () => {
    validateFinancialFields();
    if (lastPricing) renderPricingSummary(lastPricing, collectFormData());
    debouncedPreview();
    debouncedSaveDraft();
  });

  paidInput?.addEventListener('input', () => {
    validateFinancialFields();
    if (lastPricing) renderPricingSummary(lastPricing, collectFormData());
    debouncedSaveDraft();
  });

  paidInput?.addEventListener('blur', () => {
    validateFinancialFields();
  });

  previewBtn?.addEventListener('click', runPreview);

  primaryCustomerName?.addEventListener('input', () => {
    primaryCustomerName.dataset.userEdited = '1';
    debouncedSaveDraft();
  });

  const buildUrlEncodedBody = (formEl) => {
    reindexMembers();
    applyRoomAssignments();
    const params = new URLSearchParams();
    new FormData(formEl).forEach((value, key) => {
      params.append(key, String(value));
    });
    return params;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.dataset.submitting === '1') return;

    form.classList.add('was-validated');
    applyRoomAssignments();

    if (!validateForm()) {
      scrollToFirstInvalid();
      showValidationToast();
      return;
    }

    form.dataset.submitting = '1';
    setSubmitLoading(true);
    saveDraft();

    try {
      const res = await fetch(form.action || '/reservations', {
        method: 'POST',
        body: buildUrlEncodedBody(form),
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json',
        },
        redirect: 'manual',
      });

      if (res.status === 302 || res.status === 301) {
        const location = res.headers.get('Location') || '';
        if (/\/reservations\/[a-f0-9]{24}$/i.test(location)) {
          clearDraft();
        }
        window.location.href = resolveActionUrl(location);
        return;
      }

      if (res.ok) {
        const contentType = (res.headers.get('Content-Type') || '').toLowerCase();
        if (contentType.includes('application/json')) {
          const json = await res.json();
          if (json.redirectUrl) {
            clearDraft();
            window.location.href = resolveActionUrl(json.redirectUrl);
            return;
          }
        }
        const finalUrl = res.url || '';
        if (/\/reservations\/[a-f0-9]{24}$/i.test(finalUrl)) {
          clearDraft();
        }
        window.location.href = finalUrl || window.location.href;
        return;
      }

      const handled = await window.OGToast?.fromResponse?.(
        res,
        'تعذر إنشاء الحجز — راجع البيانات'
      );
      if (!handled) {
        window.OGToast?.error('تعذر إنشاء الحجز — راجع البيانات');
      }
      form.dataset.submitting = '0';
      setSubmitLoading(false);
    } catch {
      window.OGToast?.error('تعذر الاتصال بالخادم — تحقق من الشبكة وحاول مرة أخرى');
      form.dataset.submitting = '0';
      setSubmitLoading(false);
    }
  });

  document.getElementById('discardDraftBtn')?.addEventListener('click', () => {
    clearDraft();
    window.OGToast?.info('تم مسح المسودة المحلية');
  });

  form.addEventListener('input', () => {
    if (!isRestoringDraft) debouncedSaveDraft();
  });
  form.addEventListener('change', () => {
    if (!isRestoringDraft) debouncedSaveDraft();
  });

  toggleBrokerFields();
  wrapMemberRowsInBlocks();
  reindexMembers();

  const hasServerDraft = document.getElementById('reservationSessionDraft');
  const hasLocalDraft = loadStoredDraft();

  if (hasServerDraft || hasLocalDraft?.members?.length) {
    initDraftRestore();
  } else if (tripSelect?.value) {
    loadTripPackages(tripSelect.value).then(() => {
      updatePackagePricingHint();
      refreshMemberRoomTypeSelects();
      loadVipItemsForTrip(tripSelect.value);
      runPreview();
    });
  } else if (packageStarsSelect && tripPackages.length) {
    updatePackagePricingHint();
    refreshMemberRoomTypeSelects();
    renderPreviewPlaceholder();
  } else {
    renderPreviewPlaceholder();
  }
});
