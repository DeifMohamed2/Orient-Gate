document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.finance-tab');
  const panels = document.querySelectorAll('.finance-tab-panel');
  const paymentReservation = document.getElementById('paymentReservation');
  const paymentAmount = document.getElementById('paymentAmount');
  const paymentInvoiceId = document.getElementById('paymentInvoiceId');
  const paymentBalanceHint = document.getElementById('paymentBalanceHint');
  const refundInvoice = document.getElementById('refundInvoice');
  const refundReservation = document.getElementById('refundReservation');
  const refundAmount = document.getElementById('refundAmount');
  const fullRefundCheck = document.getElementById('fullRefundCheck');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.tab;
      tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
      panels.forEach((p) => p.classList.toggle('is-active', p.id === `panel-${id}`));
    });
  });

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
    if (paymentAmount) {
      paymentAmount.max = balance;
    }
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
      document.querySelector('.finance-tab[data-tab="payment"]')?.click();
      if (paymentReservation) {
        paymentReservation.value = resId;
        paymentAmount.dataset.userEdited = '';
        updatePaymentFromReservation();
        paymentReservation.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
});
