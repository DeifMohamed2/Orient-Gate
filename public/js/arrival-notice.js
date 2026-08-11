(function () {
  const body = document.body;
  const printBtn = document.getElementById('arrivalPrintBtn');
  const backBtn = document.getElementById('arrivalBackBtn');
  const addBtn = document.getElementById('addMovementRow');
  const tbody = document.getElementById('movementsBody');
  const form = document.getElementById('arrivalNoticeForm');

  if (printBtn) {
    printBtn.addEventListener('click', () => window.print());
  }

  if (backBtn && body.dataset.backUrl) {
    backBtn.href = body.dataset.backUrl;
  }

  if (body.dataset.autoPrint === '1') {
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 400);
    });
  }

  function renumberRows() {
    if (!tbody) return;
    tbody.querySelectorAll('.movement-row').forEach((row, i) => {
      row.dataset.index = String(i);
      const num = row.querySelector('.movement-num');
      if (num) num.textContent = String(i + 1);
      row.querySelectorAll('input').forEach((input) => {
        const name = input.getAttribute('name');
        if (name) {
          input.setAttribute('name', name.replace(/movements\[\d+\]/, `movements[${i}]`));
        }
      });
    });
  }

  function bindRemoveButtons() {
    if (!tbody) return;
    tbody.querySelectorAll('.remove-movement').forEach((btn) => {
      btn.onclick = () => {
        const rows = tbody.querySelectorAll('.movement-row');
        if (rows.length <= 1) return;
        btn.closest('.movement-row')?.remove();
        renumberRows();
      };
    });
  }

  if (addBtn && tbody) {
    addBtn.addEventListener('click', () => {
      const i = tbody.querySelectorAll('.movement-row').length;
      const tr = document.createElement('tr');
      tr.className = 'movement-row';
      tr.dataset.index = String(i);
      tr.innerHTML = `
        <td class="text-center movement-num">${i + 1}</td>
        <td><input class="form-control form-control-sm" name="movements[${i}][description]" placeholder="استقبال" required></td>
        <td><input class="form-control form-control-sm" name="movements[${i}][from]" required></td>
        <td><input class="form-control form-control-sm" name="movements[${i}][to]" required></td>
        <td><input class="form-control form-control-sm" name="movements[${i}][time]"></td>
        <td><input type="date" class="form-control form-control-sm" name="movements[${i}][date]" required></td>
        <td class="text-center"><button type="button" class="btn btn-sm btn-outline-danger remove-movement" title="حذف"><i class="fa-solid fa-times"></i></button></td>
      `;
      tbody.appendChild(tr);
      bindRemoveButtons();
    });
    bindRemoveButtons();
  }

  if (form) {
    const arrivalDate = form.querySelector('[name="arrivalDate"]');
    const departureDate = form.querySelector('[name="departureDate"]');
    const makkahIn = form.querySelector('[name="makkahCheckIn"]');
    const makkahOut = form.querySelector('[name="makkahCheckOut"]');
    const medinaIn = form.querySelector('[name="medinaCheckIn"]');
    const medinaOut = form.querySelector('[name="medinaCheckOut"]');

    const syncMin = (from, to) => {
      if (!from || !to) return;
      const apply = () => {
        if (from.value) to.min = from.value;
        else to.removeAttribute('min');
      };
      from.addEventListener('change', apply);
      apply();
    };

    syncMin(arrivalDate, departureDate);
    syncMin(makkahIn, makkahOut);
    syncMin(medinaIn, medinaOut);

    form.addEventListener('submit', (e) => {
      if (arrivalDate?.value && departureDate?.value && departureDate.value < arrivalDate.value) {
        e.preventDefault();
        departureDate.classList.add('is-invalid');
        departureDate.focus();
        return;
      }
      if (makkahIn?.value && makkahOut?.value && makkahOut.value < makkahIn.value) {
        e.preventDefault();
        makkahOut.classList.add('is-invalid');
        makkahOut.focus();
        return;
      }
      if (medinaIn?.value && medinaOut?.value && medinaOut.value < medinaIn.value) {
        e.preventDefault();
        medinaOut.classList.add('is-invalid');
        medinaOut.focus();
      }
    });
  }
})();
