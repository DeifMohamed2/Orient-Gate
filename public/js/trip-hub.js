/**
 * Trip Hub — overview charts, finance forms, accommodation assign
 */
document.addEventListener('DOMContentLoaded', () => {
  const chartDataEl = document.getElementById('tripHubChartData');
  if (chartDataEl && typeof ApexCharts !== 'undefined') {
    let chartData = {};
    try {
      chartData = JSON.parse(chartDataEl.textContent || '{}');
    } catch (e) { /* ignore */ }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const primary = isDark ? '#2ec4a0' : '#0d9488';
    const accent = isDark ? '#d4af37' : '#14b8a6';
    const danger = isDark ? '#f87171' : '#dc2626';
    const warning = isDark ? '#fbbf24' : '#f59e0b';
    const labelColor = isDark ? '#94a3b8' : '#64748b';

    const radialOpts = (el, series, labels, color) => {
      if (!el) return;
      const c = new ApexCharts(el, {
        chart: { type: 'radialBar', height: 220, fontFamily: 'Cairo' },
        series: [series],
        labels: [labels],
        colors: [color],
        plotOptions: {
          radialBar: {
            hollow: { size: '58%' },
            dataLabels: {
              name: { fontSize: '13px', color: labelColor },
              value: { fontSize: '20px', fontWeight: 700 },
            },
          },
        },
      });
      c.render();
    };

    radialOpts(
      document.getElementById('tripHubSeatChart'),
      chartData.seatPercent || 0,
      'المقاعد',
      primary
    );
    radialOpts(
      document.getElementById('tripHubRoomChart'),
      chartData.roomPercent || 0,
      'الأسرة',
      accent
    );

    const payEl = document.getElementById('tripHubPaymentChart');
    if (payEl && chartData.paymentBreakdown) {
      const pb = chartData.paymentBreakdown;
      const paySeries = [pb.unpaid, pb.partial, pb.paid, pb.refunded].filter((v) => v > 0);
      if (!paySeries.length) {
        payEl.innerHTML = '<div class="chart-empty"><span>لا توجد حجوزات</span></div>';
      } else {
        const c = new ApexCharts(payEl, {
          chart: { type: 'donut', height: 220, fontFamily: 'Cairo' },
          series: paySeries,
          labels: ['غير مدفوع', 'جزئي', 'مدفوع', 'مسترد'].filter((_, i) => [pb.unpaid, pb.partial, pb.paid, pb.refunded][i] > 0),
          colors: [danger, warning, primary, labelColor],
          legend: { position: 'bottom', fontSize: '11px' },
          dataLabels: { enabled: false },
        });
        c.render();
      }
    }

    const revEl = document.getElementById('tripHubRevenueChart');
    if (revEl && chartData.revenue) {
      const r = chartData.revenue;
      const categories = ['الإيرادات', 'المحصل', 'المستحق', 'المصروفات'];
      const values = [r.gross, r.collected, r.outstanding, r.expenses];
      const barColors = [primary, primary, warning, labelColor];

      if (!r.hasPaidBookings && r.projectedTripCosts > 0) {
        categories.push('تكاليف رحلة متوقعة');
        values.push(r.projectedTripCosts);
        barColors.push(danger);
      } else if (r.hasPaidBookings) {
        categories.push('صافي الربح');
        values.push(r.netProfit);
        barColors.push(r.netProfit >= 0 ? primary : danger);
      }

      const c = new ApexCharts(revEl, {
        chart: { type: 'bar', height: 260, fontFamily: 'Cairo', toolbar: { show: false } },
        series: [{ name: 'ج.م.', data: values }],
        xaxis: {
          categories,
          labels: { style: { fontSize: '11px', colors: labelColor } },
        },
        colors: barColors,
        plotOptions: {
          bar: {
            borderRadius: 6,
            columnWidth: '55%',
            distributed: true,
            colors: {
              ranges: [{ from: -999999999, to: -0.01, color: danger }],
            },
          },
        },
        dataLabels: { enabled: false },
        legend: { show: false },
        yaxis: { labels: { formatter: (v) => Math.round(v).toLocaleString('ar-EG') } },
        tooltip: {
          y: { formatter: (v) => `${Math.round(v).toLocaleString('ar-EG')} ج.م.` },
        },
      });
      c.render();
    }
  }

  // Finance action panels
  const financePanels = {
    payment: document.getElementById('financePanelPayment'),
    expense: document.getElementById('financePanelExpense'),
    refund: document.getElementById('financePanelRefund'),
  };

  const hideFinancePanels = () => {
    Object.values(financePanels).forEach((p) => p?.classList.add('d-none'));
    document.querySelectorAll('[data-finance-action]').forEach((btn) => btn.classList.remove('active'));
  };

  document.querySelectorAll('[data-finance-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.financeAction;
      const panel = financePanels[key];
      if (!panel) return;
      const isOpen = !panel.classList.contains('d-none');
      hideFinancePanels();
      if (!isOpen) {
        panel.classList.remove('d-none');
        btn.classList.add('active');
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  });

  const paymentReservation = document.getElementById('paymentReservation');
  const paymentAmount = document.getElementById('paymentAmount');
  const paymentInvoiceId = document.getElementById('paymentInvoiceId');
  const paymentBalanceHint = document.getElementById('paymentBalanceHint');
  const refundInvoice = document.getElementById('refundInvoice');
  const refundReservation = document.getElementById('refundReservation');
  const refundAmount = document.getElementById('refundAmount');
  const fullRefundCheck = document.getElementById('fullRefundCheck');

  const updatePaymentFromReservation = () => {
    const opt = paymentReservation?.selectedOptions?.[0];
    if (!opt || !opt.value) {
      if (paymentBalanceHint) paymentBalanceHint.textContent = '';
      if (paymentInvoiceId) paymentInvoiceId.value = '';
      return;
    }
    const balance = Number(opt.dataset.balance || 0);
    const total = Number(opt.dataset.total || 0);
    const paid = Number(opt.dataset.paid || 0);
    if (paymentInvoiceId) paymentInvoiceId.value = opt.dataset.invoice || '';
    if (paymentBalanceHint) {
      paymentBalanceHint.innerHTML = `الإجمالي: <strong>${total.toLocaleString('ar-EG')}</strong> ج.م. • المدفوع: <strong>${paid.toLocaleString('ar-EG')}</strong> • المتبقي: <strong class="text-danger">${balance.toLocaleString('ar-EG')}</strong> ج.م.`;
    }
    if (paymentAmount && balance > 0 && !paymentAmount.dataset.userEdited) {
      paymentAmount.value = balance;
    }
    if (paymentAmount) paymentAmount.max = balance;
  };

  paymentReservation?.addEventListener('change', () => {
    if (paymentAmount) paymentAmount.dataset.userEdited = '';
    updatePaymentFromReservation();
  });

  paymentAmount?.addEventListener('input', () => {
    paymentAmount.dataset.userEdited = '1';
  });

  document.querySelectorAll('.finance-quick-pay').forEach((btn) => {
    btn.addEventListener('click', () => {
      const resId = btn.dataset.reservation;
      const paymentBtn = document.querySelector('[data-finance-action="payment"]');
      paymentBtn?.click();
      if (paymentReservation) {
        paymentReservation.value = resId;
        paymentAmount.dataset.userEdited = '';
        updatePaymentFromReservation();
      }
    });
  });

  const syncRefundReservation = () => {
    const opt = refundInvoice?.selectedOptions?.[0];
    if (!opt || !refundReservation) return;
    const resId = opt.dataset.reservation;
    if (resId) refundReservation.value = resId;
    if (fullRefundCheck?.checked && refundAmount) {
      refundAmount.value = opt.dataset.paid || '';
    }
  };

  refundInvoice?.addEventListener('change', syncRefundReservation);
  fullRefundCheck?.addEventListener('change', syncRefundReservation);
  syncRefundReservation();

  document.querySelectorAll('.finance-form.needs-validation').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!form.checkValidity()) {
        e.preventDefault();
        e.stopPropagation();
      }
      form.classList.add('was-validated');
    });
  });

  // Manual accommodation assign
  const assignForm = document.getElementById('manualAssignForm');
  if (assignForm) {
    assignForm.addEventListener('submit', () => {
      const m = document.getElementById('manualMemberSelect');
      const r = document.getElementById('manualRoomSelect');
      if (m?.selectedOptions[0]) {
        document.getElementById('manualReservationId').value = m.selectedOptions[0].dataset.reservation || '';
      }
      if (r?.selectedOptions[0]) {
        document.getElementById('manualHotelId').value = r.selectedOptions[0].dataset.hotel || '';
      }
    });
  }

  initAccommodationBoard();
});

function initAccommodationBoard() {
  const board = document.getElementById('accommodationBoard');
  if (!board) return;

  const searchInput = document.getElementById('accSearch');
  const noResults = document.getElementById('accNoResults');
  const hotelsWrap = document.getElementById('accHotels');
  let statusFilter = '';
  let typeFilter = '';

  const filterRooms = () => {
    const q = (searchInput?.value || '').trim().toLowerCase();
    let totalVisible = 0;

    board.querySelectorAll('.acc-hotel').forEach((hotelEl) => {
      let hotelVisible = 0;
      hotelEl.querySelectorAll('.acc-room-card').forEach((card) => {
        const text = (card.getAttribute('data-search') || '').toLowerCase();
        const status = card.getAttribute('data-status') || '';
        const type = card.getAttribute('data-type') || '';
        const matchSearch = !q || text.includes(q);
        const matchStatus = !statusFilter || status === statusFilter;
        const matchType = !typeFilter || type === typeFilter;
        const show = matchSearch && matchStatus && matchType;
        card.classList.toggle('is-hidden', !show);
        if (show) hotelVisible++;
      });
      hotelEl.classList.toggle('is-hidden', hotelVisible === 0);
      totalVisible += hotelVisible;
    });

    if (noResults) noResults.hidden = totalVisible > 0;
    if (hotelsWrap) hotelsWrap.hidden = totalVisible === 0 && board.querySelectorAll('.acc-hotel').length > 0;
  };

  let searchTimer;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(filterRooms, 150);
  });

  board.querySelectorAll('.acc-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const filterType = chip.dataset.accFilter;
      const value = chip.dataset.value || '';
      board.querySelectorAll(`.acc-chip[data-acc-filter="${filterType}"]`).forEach((c) => {
        c.classList.toggle('is-active', c === chip);
      });
      if (filterType === 'status') statusFilter = value;
      if (filterType === 'type') typeFilter = value;
      filterRooms();
    });
  });

  document.getElementById('accExpandAll')?.addEventListener('click', () => {
    board.querySelectorAll('.acc-hotel').forEach((el) => { el.open = true; });
  });

  document.getElementById('accCollapseAll')?.addEventListener('click', () => {
    board.querySelectorAll('.acc-hotel').forEach((el) => { el.open = false; });
  });

  const addForms = document.getElementById('accAddForms');
  document.getElementById('accToggleForms')?.addEventListener('click', () => {
    if (addForms) {
      addForms.open = !addForms.open;
      addForms.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}
