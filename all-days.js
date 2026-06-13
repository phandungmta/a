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

function getAllDates() {
  return Array.from(new Set(state.sets.map(item => item.date).filter(Boolean)))
    .sort((a, b) => b.localeCompare(a));
}

function getAllPlayerIds() {
  const ids = new Set(state.players.map(player => player.id));
  state.sets.forEach(item => (item.loserIds || []).forEach(id => ids.add(id)));
  state.payments.forEach(payment => payment.playerId && ids.add(payment.playerId));
  return Array.from(ids);
}

function calculatePlayerSummary(sets) {
  return getAllPlayerIds().map(id => {
    const losses = sets.reduce((sum, item) => sum + ((item.loserIds || []).includes(id) ? 1 : 0), 0);
    const amount = sets.reduce((sum, item) => sum + ((item.loserIds || []).includes(id) ? Number(item.stake || 0) : 0), 0);
    const lossDates = new Set(sets.filter(item => (item.loserIds || []).includes(id)).map(item => item.date));
    const paid = state.payments
      .filter(payment => payment.playerId === id)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const remaining = amount - paid;
    return { id, name: playerName(id), losses, amount, paid, remaining, days: lossDates.size };
  }).filter(row => row.losses > 0 || state.players.some(player => player.id === row.id));
}

function calculateDaySummary(date) {
  const sets = state.sets
    .filter(item => item.date === date)
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  const totalSets = sets.length;
  const totalLoseTurns = sets.reduce((sum, item) => sum + (item.loserIds || []).length, 0);
  const totalAmount = sets.reduce((sum, item) => sum + (item.loserIds || []).length * Number(item.stake || 0), 0);
  const totalEdits = sets.reduce((sum, item) => sum + Number(item.editCount || 0), 0);
  const sortedUpdateTimes = sets
    .map(item => item.updatedAt)
    .filter(Boolean)
    .sort();
  const lastUpdatedAt = sortedUpdateTimes.length ? sortedUpdateTimes[sortedUpdateTimes.length - 1] : '';
  const topLoser = calculatePlayerSummary(sets).sort((a, b) => b.losses - a.losses || a.name.localeCompare(b.name, 'vi'))[0];
  return { date, totalSets, totalLoseTurns, totalAmount, totalEdits, lastUpdatedAt, topLoser };
}

function renderSyncBanner() {
  const banner = $('#syncBanner');
  if (!banner) return;

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

  const dates = getAllDates();
  const totalSets = state.sets.length;
  const totalLoseTurns = state.sets.reduce((sum, item) => sum + (item.loserIds || []).length, 0);
  const totalAmount = state.sets.reduce((sum, item) => sum + (item.loserIds || []).length * Number(item.stake || 0), 0);
  const totalPaid = state.payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalRemaining = totalAmount - totalPaid;
  const rows = calculatePlayerSummary(state.sets).sort((a, b) => b.losses - a.losses || b.amount - a.amount || a.name.localeCompare(b.name, 'vi'));
  const maxLoser = rows[0];

  $('#allSummaryGrid').innerHTML = `
    <article class="stat-card"><p>Tổng số ngày</p><strong>${dates.length}</strong></article>
    <article class="stat-card"><p>Tổng số séc</p><strong>${totalSets}</strong></article>
    <article class="stat-card"><p>Tổng lượt thua</p><strong>${totalLoseTurns}</strong></article>
    <article class="stat-card"><p>Tổng tiền / điểm</p><strong>${money(totalAmount)}</strong></article>
    <article class="stat-card"><p>Đã đóng</p><strong>${money(totalPaid)}</strong></article>
    <article class="stat-card"><p>Còn lại</p><strong>${money(totalRemaining)}</strong></article>
  `;

  renderPlayersAllSummary(rows, maxLoser);
  renderDaysSummary(dates);
}

function renderPlayersAllSummary(rows, maxLoser) {
  const root = $('#playersAllSummary');

  if (!state.players.length && !state.sets.length) {
    root.innerHTML = '<h2>Tổng hợp theo người</h2><div class="empty-panel">Chưa có dữ liệu. Quay lại trang nhập séc để thêm người thua.</div>';
    return;
  }

  root.innerHTML = `
    <div class="section-heading">
      <div>
        <h2>Tổng hợp theo người - tất cả các ngày</h2>
        <p>${maxLoser && maxLoser.losses ? `Người thua nhiều nhất: <strong>${escapeHtml(maxLoser.name)}</strong> với <strong>${maxLoser.losses}</strong> séc thua.` : 'Chưa có lượt thua nào.'}</p>
      </div>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Người chơi</th>
            <th>Số ngày có thua</th>
            <th>Tổng séc thua</th>
            <th>Tổng tiền / điểm phải trả</th>
            <th>Đã đóng</th>
            <th>Còn lại</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td><strong>${escapeHtml(row.name)}</strong></td>
              <td>${row.days}</td>
              <td>${row.losses}</td>
              <td>${money(row.amount)}</td>
              <td>${money(row.paid)}</td>
              <td><strong>${money(row.remaining)}</strong></td>
              <td>${row.remaining <= 0 && row.amount > 0 ? '<span class="badge">Đã đủ</span>' : (row.losses > 0 ? '<span class="badge warning">Còn nợ</span>' : '-')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderDaysSummary(dates) {
  const root = $('#daysSummary');

  if (!dates.length) {
    root.innerHTML = '<h2>Tổng hợp theo ngày</h2><div class="empty-panel">Chưa có ngày nào có dữ liệu.</div>';
    return;
  }

  const rows = dates.map(calculateDaySummary);

  root.innerHTML = `
    <div class="section-heading">
      <div>
        <h2>Tổng hợp theo ngày</h2>
        <p>Bấm vào ngày để quay lại xem hoặc sửa các séc của ngày đó.</p>
      </div>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Ngày</th>
            <th>Số séc</th>
            <th>Lượt thua</th>
            <th>Tổng tiền / điểm</th>
            <th>Số lần sửa</th>
            <th>Sửa gần nhất</th>
            <th>Thua nhiều nhất trong ngày</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td><a href="index.html?date=${encodeURIComponent(row.date)}"><strong>${escapeHtml(row.date)}</strong></a></td>
              <td>${row.totalSets}</td>
              <td>${row.totalLoseTurns}</td>
              <td>${money(row.totalAmount)}</td>
              <td>${row.totalEdits}</td>
              <td>${formatDateTime(row.lastUpdatedAt) || '-'}</td>
              <td>${row.topLoser && row.topLoser.losses ? `${escapeHtml(row.topLoser.name)} (${row.topLoser.losses})` : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function init() {
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
