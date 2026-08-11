/**
 * Dashboard charts — theme-aware ApexCharts
 */
(function () {
  const charts = [];
  let chartData = {};

  function getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function themeColors() {
    const isDark = getTheme() === 'dark';
    return {
      primary: isDark ? '#2ec4a0' : '#0d9488',
      accent: isDark ? '#d4af37' : '#14b8a6',
      danger: isDark ? '#f87171' : '#dc2626',
      grid: isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.06)',
      label: isDark ? '#94a3b8' : '#64748b',
      isDark,
    };
  }

  function destroyCharts() {
    charts.forEach((c) => { try { c.destroy(); } catch (e) { /* ignore */ } });
    charts.length = 0;
  }

  function showEmpty(el, msg) {
    if (!el) return;
    el.innerHTML = '<div class="chart-empty"><i class="fa-solid fa-chart-simple"></i><span>' + msg + '</span></div>';
  }

  function readChartData() {
    const el = document.getElementById('dashboardChartData');
    if (!el) return null;
    const raw = (el.textContent || el.innerText || '').trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error('Chart data parse error', e);
      return null;
    }
  }

  function initCharts() {
    if (typeof ApexCharts === 'undefined') return;
    chartData = readChartData();
    if (!chartData) return;

    const { primary, accent, danger, grid, label, isDark } = themeColors();
    const noData = { text: 'لا توجد بيانات', align: 'center', verticalAlign: 'middle', style: { color: label, fontFamily: 'Cairo' } };
    const base = {
      chart: { fontFamily: 'Cairo', background: 'transparent', toolbar: { show: false }, animations: { enabled: true, speed: 600 } },
      theme: { mode: isDark ? 'dark' : 'light' },
      grid: { borderColor: grid, strokeDashArray: 4 },
      xaxis: { labels: { style: { colors: label, fontSize: '11px' } } },
      yaxis: { labels: { style: { colors: label, fontSize: '11px' } } },
      dataLabels: { enabled: false },
      noData,
    };

    const salesEl = document.querySelector('#salesChart');
    if (salesEl) {
      salesEl.innerHTML = '';
      const sales = chartData.monthlySales || [];
      if (!sales.length) { showEmpty(salesEl, 'لا توجد مبيعات في الفترة'); }
      else {
        const c = new ApexCharts(salesEl, {
        ...base,
        chart: { ...base.chart, type: 'area', height: 300 },
        series: [{ name: 'المبيعات', data: sales.map((s) => s.total || 0) }],
        xaxis: { ...base.xaxis, categories: sales.map((s) => `${s._id.month}/${s._id.year}`) },
        colors: [primary],
        fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: isDark ? 0.35 : 0.45, opacityTo: 0.02 } },
        stroke: { curve: 'smooth', width: 3 },
        tooltip: { theme: isDark ? 'dark' : 'light' },
        });
        c.render();
        charts.push(c);
      }
    }

    const revExpEl = document.querySelector('#revenueExpenseChart');
    if (revExpEl) {
      revExpEl.innerHTML = '';
      const data = chartData.revenueExpenseChart || [];
      if (!data.length) { showEmpty(revExpEl, 'لا توجد بيانات'); }
      else {
        const c = new ApexCharts(revExpEl, {
          ...base,
          chart: { ...base.chart, type: 'bar', height: 300 },
          series: [
            { name: 'إيرادات', data: data.map((d) => d.revenue || 0) },
            { name: 'مصروفات', data: data.map((d) => d.expenses || 0) },
          ],
          xaxis: { ...base.xaxis, categories: data.map((d) => `${d.month}/${d.year}`) },
          colors: [primary, danger],
          plotOptions: { bar: { borderRadius: 6, columnWidth: '50%' } },
          legend: { position: 'top', labels: { colors: label } },
        });
        c.render();
        charts.push(c);
      }
    }

    const payEl = document.querySelector('#paymentMethodChart');
    if (payEl) {
      payEl.innerHTML = '';
      const methods = chartData.paymentMethods || [];
      const labels = { cash: 'نقدي', bank: 'بنك', card: 'بطاقة', transfer: 'تحويل', other: 'أخرى' };
      if (!methods.length) { showEmpty(payEl, 'لا توجد مدفوعات'); }
      else {
        const c = new ApexCharts(payEl, {
          ...base,
          chart: { ...base.chart, type: 'donut', height: 260 },
          series: methods.map((m) => m.total || 0),
          labels: methods.map((m) => labels[m._id] || m._id || '—'),
          colors: [primary, accent, '#38bdf8', '#fbbf24', '#a78bfa'],
          legend: { position: 'bottom', labels: { colors: label } },
          plotOptions: { pie: { donut: { size: '62%' } } },
        });
        c.render();
        charts.push(c);
      }
    }

    const statusEl = document.querySelector('#reservationStatusChart');
    if (statusEl) {
      statusEl.innerHTML = '';
      const statuses = chartData.reservationStatuses || [];
      const labels = { unpaid: 'غير مدفوع', partial: 'جزئي', paid: 'مدفوع', refunded: 'مسترد' };
      if (!statuses.length) { showEmpty(statusEl, 'لا توجد حجوزات'); }
      else {
        const c = new ApexCharts(statusEl, {
          ...base,
          chart: { ...base.chart, type: 'donut', height: 260 },
          series: statuses.map((s) => s.count || 0),
          labels: statuses.map((s) => labels[s._id] || s._id),
          colors: [danger, '#fbbf24', primary, '#94a3b8'],
          legend: { position: 'bottom', labels: { colors: label } },
          plotOptions: { pie: { donut: { size: '62%' } } },
        });
        c.render();
        charts.push(c);
      }
    }

    const occEl = document.querySelector('#occupancyChart');
    if (occEl) {
      occEl.innerHTML = '';
      const roomPct = chartData.occupancyPercent || 0;
      const seatPct = chartData.seatFillPercent || 0;
      const c = new ApexCharts(occEl, {
        ...base,
        chart: { ...base.chart, type: 'radialBar', height: 260 },
        series: [roomPct, seatPct],
        labels: ['إشغال الأسرة', 'إشغال المقاعد'],
        colors: [primary, accent],
        plotOptions: {
          radialBar: {
            hollow: { size: '42%' },
            track: { background: isDark ? '#1c2433' : '#f1f5f4' },
            dataLabels: {
              name: { color: label, fontSize: '12px' },
              value: { color: label, fontSize: '16px', fontWeight: 700 },
            },
          },
        },
        legend: { show: true, position: 'bottom', labels: { colors: label } },
      });
      c.render();
      charts.push(c);
    }

    const collectionEl = document.querySelector('#collectionRateChart');
    if (collectionEl) {
      collectionEl.innerHTML = '';
      const data = chartData.collectionRateChart || [];
      if (!data.length) { showEmpty(collectionEl, 'لا توجد بيانات'); }
      else {
        const c = new ApexCharts(collectionEl, {
          ...base,
          chart: { ...base.chart, type: 'line', height: 260 },
          series: [{ name: 'معدل التحصيل %', data: data.map((d) => d.rate || 0) }],
          xaxis: { ...base.xaxis, categories: data.map((d) => `${d.month}/${d.year}`) },
          colors: [accent],
          stroke: { curve: 'smooth', width: 3 },
          yaxis: { ...base.yaxis, max: 100, labels: { formatter: (v) => `${v}%`, style: { colors: label, fontSize: '11px' } } },
        });
        c.render();
        charts.push(c);
      }
    }

    const profitEl = document.querySelector('#tripProfitChart');
    if (profitEl) {
      profitEl.innerHTML = '';
      const data = chartData.tripProfitability || [];
      if (!data.length) { showEmpty(profitEl, 'لا توجد بيانات'); }
      else {
        const c = new ApexCharts(profitEl, {
          ...base,
          chart: { ...base.chart, type: 'bar', height: 260 },
          series: [{ name: 'صافي الربح', data: data.map((d) => d.netProfit || 0) }],
          xaxis: { ...base.xaxis, categories: data.map((d) => d.name) },
          colors: [primary],
          plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '60%' } },
        });
        c.render();
        charts.push(c);
      }
    }

    const weeklyEl = document.querySelector('#weeklyBookingsChart');
    if (weeklyEl) {
      weeklyEl.innerHTML = '';
      const data = chartData.weeklyBookings || [];
      if (!data.length) { showEmpty(weeklyEl, 'لا توجد حجوزات'); }
      else {
        const c = new ApexCharts(weeklyEl, {
          ...base,
          chart: { ...base.chart, type: 'bar', height: 260 },
          series: [{ name: 'حجوزات', data: data.map((d) => d.count || 0) }],
          xaxis: { ...base.xaxis, categories: data.map((d) => `أسبوع ${d._id.week}`) },
          colors: [primary],
          plotOptions: { bar: { borderRadius: 6, columnWidth: '55%' } },
        });
        c.render();
        charts.push(c);
      }
    }

    const capacityEl = document.querySelector('#capacityChart');
    if (capacityEl) {
      capacityEl.innerHTML = '';
      const data = chartData.capacityOverview || [];
      if (!data.length) { showEmpty(capacityEl, 'لا توجد رحلات مفتوحة'); }
      else {
        const c = new ApexCharts(capacityEl, {
          ...base,
          chart: { ...base.chart, type: 'bar', height: 260 },
          series: [{ name: '% مباع', data: data.map((d) => d.percentSold || 0) }],
          xaxis: { ...base.xaxis, categories: data.map((d) => d.name) },
          colors: [accent],
          plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '55%' } },
          yaxis: { ...base.yaxis, max: 100 },
        });
        c.render();
        charts.push(c);
      }
    }

    const agingEl = document.querySelector('#outstandingAgingChart');
    if (agingEl) {
      agingEl.innerHTML = '';
      const data = chartData.outstandingAging || [];
      const hasData = data.some((d) => d.amount > 0);
      if (!hasData) { showEmpty(agingEl, 'لا توجد مستحقات'); }
      else {
        const c = new ApexCharts(agingEl, {
          ...base,
          chart: { ...base.chart, type: 'bar', height: 260 },
          series: [{ name: 'المبلغ', data: data.map((d) => d.amount || 0) }],
          xaxis: { ...base.xaxis, categories: data.map((d) => d.label) },
          colors: [danger],
          plotOptions: { bar: { borderRadius: 6, columnWidth: '50%' } },
        });
        c.render();
        charts.push(c);
      }
    }
  }

  function bootCharts(retries) {
    retries = retries || 0;
    if (!readChartData()) {
      if (retries < 60) setTimeout(() => bootCharts(retries + 1), 50);
      return;
    }
    destroyCharts();
    initCharts();
  }

  function onReady() {
    if (!document.querySelector('#salesChart')) return;
    bootCharts();
    document.querySelectorAll('form[action="/session/theme"]').forEach((form) => {
      form.addEventListener('submit', () => sessionStorage.setItem('og_reinit_charts', '1'));
    });
    if (sessionStorage.getItem('og_reinit_charts')) {
      sessionStorage.removeItem('og_reinit_charts');
      setTimeout(bootCharts, 150);
    }
  }

  if (document.readyState === 'complete') onReady();
  else window.addEventListener('load', onReady);
})();
