/**
 * Finance hub charts — ApexCharts
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
      warning: isDark ? '#fbbf24' : '#d97706',
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
    const el = document.getElementById('financeChartData');
    if (!el) return null;
    const raw = (el.textContent || el.innerText || '').trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error('Finance chart data parse error', e);
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

    const revCostsEl = document.querySelector('#financeRevenueCostsChart');
    if (revCostsEl) {
      revCostsEl.innerHTML = '';
      const data = chartData.revenueVsCostsChart || [];
      if (!data.length) showEmpty(revCostsEl, 'لا توجد بيانات في الفترة');
      else {
        const c = new ApexCharts(revCostsEl, {
          ...base,
          chart: { ...base.chart, type: 'bar', height: 280 },
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

    const collectionEl = document.querySelector('#financeCollectionChart');
    if (collectionEl) {
      collectionEl.innerHTML = '';
      const data = chartData.collectionRateChart || [];
      if (!data.length) showEmpty(collectionEl, 'لا توجد بيانات');
      else {
        const c = new ApexCharts(collectionEl, {
          ...base,
          chart: { ...base.chart, type: 'area', height: 280 },
          series: [{ name: 'معدل التحصيل %', data: data.map((d) => d.rate || 0) }],
          xaxis: { ...base.xaxis, categories: data.map((d) => `${d.month}/${d.year}`) },
          colors: [accent],
          fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: isDark ? 0.35 : 0.45, opacityTo: 0.02 } },
          stroke: { curve: 'smooth', width: 3 },
          yaxis: { ...base.yaxis, max: 100, labels: { formatter: (v) => `${v}%`, style: { colors: label, fontSize: '11px' } } },
        });
        c.render();
        charts.push(c);
      }
    }

    const profitEl = document.querySelector('#financeTripProfitChart');
    if (profitEl) {
      profitEl.innerHTML = '';
      const data = chartData.tripProfitability || [];
      if (!data.length) showEmpty(profitEl, 'لا توجد رحلات');
      else {
        const c = new ApexCharts(profitEl, {
          ...base,
          chart: { ...base.chart, type: 'bar', height: 280 },
          series: [{ name: 'صافي الربح', data: data.map((d) => d.netProfit || 0) }],
          xaxis: { ...base.xaxis, categories: data.map((d) => d.name) },
          colors: [primary],
          plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: '60%' } },
        });
        c.render();
        charts.push(c);
      }
    }

    const costEl = document.querySelector('#financeCostBreakdownChart');
    if (costEl) {
      costEl.innerHTML = '';
      const data = chartData.costBreakdownChart || [];
      if (!data.length) showEmpty(costEl, 'لا توجد تكاليف');
      else {
        const c = new ApexCharts(costEl, {
          ...base,
          chart: { ...base.chart, type: 'donut', height: 280 },
          series: data.map((d) => d.amount || 0),
          labels: data.map((d) => d.label),
          colors: [primary, accent, '#38bdf8', '#fbbf24', '#a78bfa', danger],
          legend: { position: 'bottom', labels: { colors: label } },
          plotOptions: { pie: { donut: { size: '62%' } } },
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
    if (!document.getElementById('financeChartData')) return;
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
