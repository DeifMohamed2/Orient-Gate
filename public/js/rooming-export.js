document.addEventListener('DOMContentLoaded', () => {
  const printBtn = document.getElementById('roomingPrintBtn');
  const backBtn = document.getElementById('roomingBackBtn');

  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      if (window.history.length > 1) {
        e.preventDefault();
        window.history.back();
      }
    });
  }

  if (document.body.dataset.autoPrint === '1') {
    setTimeout(() => window.print(), 500);
  }
});
