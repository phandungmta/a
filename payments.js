const core = window.VolleyballAppState;
const store = window.VolleyballRemoteStore;

const $ = (selector) => document.querySelector(selector);

let state = core.defaultState();
let syncInfo = {
  remoteEnabled: false,
  source: 'default',
  notice: '',
  tone: 'warn',
  meta: null
};
let toastTimer = null;
let isSaving = false;

function nowLocalDateTime() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function money(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('vi-VN');
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function playerName(id) {
  return state.players.find(player => player.id === id)?.name || 'Người không còn trong danh sách mặc định';
}

function getSelectablePlayers() {
  return state.players.filter(player => player.active !== false);
}

function getAllPlayerIds() {
  const ids = new Set(state.players.map(player => player.id));
  state.sets.forEach(item => (item.loserIds || []).forEach(id => ids.add(id)));
  state.payments.forEach(payment => payment.playerId && ids.add(payment.playerId));
  return Array.from(ids);
}

function calculateRows() {
  return getAllPlayerIds()
    .map(id => {
      const losses = state.sets.reduce((sum, item) => sum + ((item.loserIds || []).includes(id) ? 1 : 0), 0);
      const due = state.sets.reduce((sum, item) => sum + ((item.loserIds || []).includes(id) ? Number(item.stake || 0) : 0), 0);
      const paid = state.payments
        .filter(payment => payment.playerId === id)
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const remaining = due - paid;
      return { id, name: playerName(id), losses, due, paid, remaining };
    })
    .filter(row => row.due > 0 || row.paid > 0 || state.players.some(player => player.id === row.id))
    .sort((a, b) => b.remaining - a.remaining || b.due - a.due || a.name.localeCompare(b.name, 'vi'));
}

function renderSyncBanner() {
  const banner = $('#syncBanner');
  if (!banner) return;

  if (isSaving) {
    banner.className = 'sync-banner busy';
    banner.textContent = 'Đang lưu online...';
    return;
  }

  if (syncInfo.tone === 'busy' && syncInfo.notice) {
    banner.className = 'sync-banner busy';
    banner.textContent = syncInfo.notice;
    return;
  }

  if (syncInfo.tone === 'warn' && syncInfo.notice) {
    banner.className = 'sync-banner warn';
    banner.textContent = syncInfo.notice;
    return;
  }

  if (syncInfo.tone === 'ok' && syncInfo.notice) {
    banner.className = 'sync-banner ok';
    banner.textContent = syncInfo.notice;
    return;
  }

  banner.className = syncInfo.remoteEnabled ? 'sync-banner ok' : 'sync-banner';
  banner.textContent = syncInfo.remoteEnabled
    ? `Đang dùng lưu trữ online chung${syncInfo.meta?.updatedAt ? ` · Đồng bộ gần nhất: ${formatDateTime(syncInfo.meta.updatedAt)}` : ''}`
    : 'Ứng dụng đang hiển thị dữ liệu cục bộ trên máy này.';
}

function render() {
  renderSyncBanner();
  renderPlayerOptions();

  const rows = calculateRows();
  const totalDue = rows.reduce((sum, row) => sum + row.due, 0);
  const totalPaid = rows.reduce((sum, row) => sum + row.paid, 0);
  const totalRemaining = totalDue - totalPaid;
  const needPayCount = rows.filter(row => row.remaining > 0).length;
  const overPaid = rows.reduce((sum, row) => sum + Math.max(0, -row.remaining), 0);

  $('#paymentSummaryGrid').innerHTML = `
    <article class="stat-card"><p>Tổng phải đóng</p><strong>${money(totalDue)}</strong></article>
    <article class="stat-card"><p>Đã đóng</p><strong>${money(totalPaid)}</strong></article>
    <article class="stat-card"><p>Còn lại</p><strong>${money(totalRemaining)}</strong></article>
    <article class="stat-card"><p>Người còn nợ</p><strong>${needPayCount}</strong></article>
    <article class="stat-card"><p>Đóng dư</p><strong>${money(overPaid)}</strong></article>
  `;

  renderPaymentTable(rows);
  renderPaymentHistory();
  $('#btnClearPayments').disabled = isSaving;
}

function renderPlayerOptions() {
  const select = $('#paymentPlayer');
  const current = select.value;
  const rows = calculateRows();
  const options = rows.length ? rows : getSelectablePlayers().map(player => ({ id: player.id, name: player.name, remaining: 0 }));

  select.innerHTML = '<option value="">-- Chọn người --</option>' + options.map(row => `
    <option value="${escapeHtml(row.id)}">${escapeHtml(row.name)}${row.remaining > 0 ? ` - còn ${money(row.remaining)}` : ''}</option>
  `).join('');

  if (options.some(row => row.id === current)) {
    select.value = current;
  }

  select.disabled = isSaving;
  $('#paymentAmount').disabled = isSaving;
  $('#paymentAt').disabled = isSaving;
  $('#paymentNote').disabled = isSaving;
  $('#paymentForm button[type="submit"]').disabled = isSaving;
}

function renderPaymentTable(rows) {
  const root = $('#paymentTable');

  if (!rows.length) {
    root.innerHTML = '<h2>Bảng tiền đã đóng / còn lại</h2><div class="empty-panel">Chưa có người chơi hoặc dữ liệu thua séc. Hãy quay lại trang nhập séc để thêm dữ liệu.</div>';
    return;
  }

  root.innerHTML = `
    <div class="section-heading">
      <div>
        <h2>Bảng tiền đã đóng / còn lại</h2>
        <p>Tiền phải đóng được tính từ toàn bộ séc thua. Tiền đã đóng được cộng từ các khoản ghi ở trang này.</p>
      </div>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Người chơi</th>
            <th>Số séc thua</th>
            <th>Phải đóng</th>
            <th>Đã đóng</th>
            <th>Còn lại</th>
            <th>Trạng thái</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td><strong>${escapeHtml(row.name)}</strong></td>
              <td>${row.losses}</td>
              <td>${money(row.due)}</td>
              <td>${money(row.paid)}</td>
              <td><strong>${money(row.remaining)}</strong></td>
              <td>${statusBadge(row)}</td>
              <td>${row.remaining > 0 ? `<button class="btn small fill-payment" type="button" data-player-id="${escapeHtml(row.id)}" data-amount="${row.remaining}" ${isSaving ? 'disabled' : ''}>Ghi còn lại</button>` : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  root.querySelectorAll('.fill-payment').forEach(button => {
    button.addEventListener('click', () => fillRemainingPayment(button.dataset.playerId, Number(button.dataset.amount || 0)));
  });
}

function statusBadge(row) {
  if (row.remaining > 0) return '<span class="badge warning">Còn nợ</span>';
  if (row.remaining < 0) return '<span class="badge danger">Đóng dư</span>';
  if (row.due > 0) return '<span class="badge">Đã đủ</span>';
  return '-';
}

function renderPaymentHistory() {
  const root = $('#paymentHistory');
  const payments = state.payments.slice().sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || ''));

  if (!payments.length) {
    root.innerHTML = '<h2>Lịch sử đã đóng</h2><div class="empty-panel">Chưa ghi khoản đã đóng nào.</div>';
    return;
  }

  root.innerHTML = `
    <div class="section-heading">
      <div>
        <h2>Lịch sử đã đóng</h2>
        <p>Mỗi dòng là một lần ghi tiền đã đóng. Có thể xóa nhầm và nhập lại.</p>
      </div>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Thời gian đóng</th>
            <th>Người chơi</th>
            <th>Số tiền / điểm</th>
            <th>Ghi chú</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          ${payments.map(payment => `
            <tr>
              <td>${formatDateTime(payment.paidAt) || '-'}</td>
              <td><strong>${escapeHtml(playerName(payment.playerId))}</strong></td>
              <td>${money(payment.amount)}</td>
              <td>${escapeHtml(payment.note || '')}</td>
              <td><button class="btn small danger-light delete-payment" type="button" data-payment-id="${escapeHtml(payment.id)}" ${isSaving ? 'disabled' : ''}>Xóa</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  root.querySelectorAll('.delete-payment').forEach(button => {
    button.addEventListener('click', () => deletePayment(button.dataset.paymentId));
  });
}

function fillRemainingPayment(playerId, amount) {
  if (isSaving) return;
  $('#paymentPlayer').value = playerId;
  $('#paymentAmount').value = Math.max(0, amount);
  $('#paymentAt').value = nowLocalDateTime();
  $('#paymentAmount').focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function commitSharedMutation(mutator, options = {}) {
  if (isSaving) return false;

  const nextState = core.cloneState(state);
  mutator(nextState);
  core.syncDefaultPlayers(nextState);
  store.saveUiState(nextState);
  isSaving = true;
  render();

  try {
    const result = await store.saveSharedState(nextState);
    state = result.state;
    syncInfo = {
      ...result.sync,
      tone: 'ok',
      notice: options.savedNotice || 'Đã lưu online'
    };
    if (typeof options.afterSuccess === 'function') {
      options.afterSuccess();
    }
    store.saveUiState(state);
    render();
    if (options.successMessage) {
      showToast(options.successMessage);
    } else if (syncInfo.notice) {
      showToast(syncInfo.notice);
    }
    return true;
  } catch (error) {
    syncInfo = {
      ...syncInfo,
      tone: 'warn',
      notice: error instanceof Error ? error.message : 'Không lưu được dữ liệu online.'
    };
    render();
    showToast(options.errorMessage || syncInfo.notice);
    return false;
  } finally {
    isSaving = false;
    render();
  }
}

async function addPayment(event) {
  event.preventDefault();
  if (isSaving) return;

  const playerId = $('#paymentPlayer').value;
  const amount = Number($('#paymentAmount').value || 0);
  const localPaidAt = $('#paymentAt').value;
  const note = $('#paymentNote').value.trim();

  if (!playerId) {
    showToast('Hãy chọn người đã đóng.');
    return;
  }

  if (amount <= 0) {
    showToast('Số tiền / điểm đã đóng phải lớn hơn 0.');
    return;
  }

  const paidAt = localPaidAt ? new Date(localPaidAt).toISOString() : new Date().toISOString();
  const success = await commitSharedMutation((draftState) => {
    draftState.payments.push({
      id: core.uid(),
      playerId,
      amount,
      note,
      paidAt,
      createdAt: new Date().toISOString()
    });
  }, {
    successMessage: 'Đã lưu khoản đã đóng.',
    errorMessage: 'Không lưu được khoản đã đóng.'
  });

  if (success) {
    $('#paymentAmount').value = '';
    $('#paymentNote').value = '';
    $('#paymentAt').value = nowLocalDateTime();
  }
}

async function deletePayment(paymentId) {
  if (isSaving) return;
  if (!confirm('Xóa khoản đã đóng này?')) return;

  await commitSharedMutation((draftState) => {
    draftState.payments = draftState.payments.filter(payment => payment.id !== paymentId);
  }, {
    successMessage: 'Đã xóa khoản đã đóng.',
    errorMessage: 'Không xóa được khoản đã đóng.'
  });
}

async function clearPayments() {
  if (isSaving) return;

  if (!state.payments.length) {
    showToast('Chưa có lịch sử đã đóng để xóa.');
    return;
  }

  if (!confirm('Xóa toàn bộ lịch sử tiền đã đóng? Dữ liệu séc thua vẫn được giữ nguyên.')) return;

  await commitSharedMutation((draftState) => {
    draftState.payments = [];
  }, {
    successMessage: 'Đã xóa toàn bộ lịch sử đã đóng.',
    errorMessage: 'Không xóa được lịch sử đã đóng.'
  });
}

async function init() {
  $('#paymentAt').value = nowLocalDateTime();
  $('#paymentForm').addEventListener('submit', addPayment);
  $('#btnClearPayments').addEventListener('click', clearPayments);

  const cached = store.readCachedAppState();
  state = cached.state;
  syncInfo = cached.sync;
  render();

  const initial = await store.loadAppState();
  state = initial.state;
  syncInfo = initial.sync;
  render();

  if (syncInfo.notice && syncInfo.tone !== 'busy') {
    showToast(syncInfo.notice);
  }
}

init();
