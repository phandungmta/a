const core = window.VolleyballAppState;
const store = window.VolleyballRemoteStore;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

let state = core.defaultState();
let syncInfo = {
  remoteEnabled: false,
  source: 'default',
  notice: '',
  meta: null
};
let editingSetId = null;
let toastTimer = null;
let isSaving = false;

function dateFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('date');
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : '';
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

function selectedLosersFromUI() {
  return $$('#losersList input[type="checkbox"]:checked').map(input => input.value);
}

function sortIds(ids) {
  return (ids || []).slice().sort();
}

function sameLoserIds(left, right) {
  const sortedLeft = sortIds(left);
  const sortedRight = sortIds(right);
  return sortedLeft.length === sortedRight.length
    && sortedLeft.every((id, index) => id === sortedRight[index]);
}

function getSelectablePlayers() {
  return state.players.filter(player => player.active !== false);
}

function getCurrentDateSets() {
  return state.sets
    .filter(item => item.date === state.currentDate)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function playerName(id) {
  return state.players.find(player => player.id === id)?.name || 'Người không còn trong danh sách mặc định';
}

function calculatePlayerSummary(sets) {
  return state.players.map(player => {
    const losses = sets.reduce((sum, item) => sum + (item.loserIds.includes(player.id) ? 1 : 0), 0);
    const amount = sets.reduce((sum, item) => sum + (item.loserIds.includes(player.id) ? Number(item.stake || 0) : 0), 0);
    return { id: player.id, name: player.name, losses, amount };
  });
}

function renderSyncBanner() {
  const banner = $('#syncBanner');
  if (!banner) return;

  if (isSaving) {
    banner.className = 'sync-banner busy';
    banner.textContent = 'Đang lưu dữ liệu dùng chung...';
    return;
  }

  if (syncInfo.notice) {
    banner.className = 'sync-banner warn';
    banner.textContent = syncInfo.notice;
    return;
  }

  banner.className = syncInfo.remoteEnabled ? 'sync-banner ok' : 'sync-banner';
  banner.textContent = syncInfo.remoteEnabled
    ? `Đang dùng lưu trữ online chung${syncInfo.meta?.updatedAt ? ` · Đồng bộ gần nhất: ${formatDateTime(syncInfo.meta.updatedAt)}` : ''}`
    : 'Dữ liệu hiện chỉ lưu trên máy này.';
}

function render() {
  $('#currentDate').value = state.currentDate;
  $('#stakeInput').value = state.stake || '';
  $('#btnSaveSet').textContent = editingSetId ? 'Cập nhật séc' : 'Lưu 1 séc';

  renderSyncBanner();
  renderLosersList();
  renderSummary();
  renderSets();
}

function renderLosersList() {
  const root = $('#losersList');
  const players = getSelectablePlayers();
  root.innerHTML = '';

  if (!players.length) {
    root.innerHTML = '<div class="empty-panel mini">Không có người chơi khả dụng trong danh sách mặc định.</div>';
    return;
  }

  players.forEach(player => {
    const div = document.createElement('div');
    div.className = 'check-item';

    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = player.id;
    checkbox.checked = state.selectedLoserIds.includes(player.id);
    checkbox.disabled = isSaving;
    checkbox.addEventListener('change', () => {
      state.selectedLoserIds = selectedLosersFromUI();
      store.saveUiState(state);
    });

    const span = document.createElement('span');
    span.textContent = player.name;
    label.appendChild(checkbox);
    label.appendChild(span);
    div.appendChild(label);
    root.appendChild(div);
  });
}

function renderSummary() {
  const sets = getCurrentDateSets();
  const totalSets = sets.length;
  const totalLoseTurns = sets.reduce((sum, item) => sum + item.loserIds.length, 0);
  const totalAmount = sets.reduce((sum, item) => sum + item.loserIds.length * Number(item.stake || 0), 0);
  const maxLoser = calculatePlayerSummary(sets).sort((a, b) => b.losses - a.losses)[0];

  $('#summaryGrid').innerHTML = `
    <article class="stat-card"><p>Tổng số séc</p><strong>${totalSets}</strong></article>
    <article class="stat-card"><p>Tổng lượt thua</p><strong>${totalLoseTurns}</strong></article>
    <article class="stat-card"><p>Tổng tiền / điểm</p><strong>${money(totalAmount)}</strong></article>
    <article class="stat-card"><p>Thua nhiều nhất</p><strong>${maxLoser && maxLoser.losses ? maxLoser.name : '-'}</strong></article>
  `;

  renderFinalSummary(sets);
}

function renderFinalSummary(sets) {
  const root = $('#finalSummary');
  const rows = calculatePlayerSummary(sets).sort((a, b) => b.losses - a.losses || a.name.localeCompare(b.name, 'vi'));

  if (!getSelectablePlayers().length) {
    root.innerHTML = '<h2>Tổng hợp cuối cùng</h2><div class="empty-panel">Chưa có người chơi trong danh sách mặc định.</div>';
    return;
  }

  root.innerHTML = `
    <h2>Tổng hợp cuối cùng ngày ${state.currentDate}</h2>
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Người chơi</th>
            <th>Số séc thua</th>
            <th>Tiền / điểm phải trả</th>
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td><strong>${escapeHtml(row.name)}</strong></td>
              <td>${row.losses}</td>
              <td>${money(row.amount)}</td>
              <td>${row.losses > 0 ? '<span class="badge">Có thua</span>' : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderSets() {
  const root = $('#setsContainer');
  root.innerHTML = '';
  const sets = getCurrentDateSets();

  if (!sets.length) {
    root.innerHTML = '<div class="empty-panel">Ngày này chưa có séc nào. Chọn người thua rồi bấm “Lưu 1 séc”.</div>';
    return;
  }

  sets.forEach((item, index) => {
    const template = $('#setRowTemplate').content.cloneNode(true);
    const card = template.querySelector('.set-card');
    const names = (item.loserIds || []).map(playerName).join(', ') || 'Không có người thua';
    const createdText = formatDateTime(item.createdAt) || '-';
    const editCount = Number(item.editCount || 0);
    const updatedText = formatDateTime(item.updatedAt);
    const editText = editCount > 0
      ? `Số lần sửa: ${editCount} · Thời gian sửa gần nhất: ${updatedText || '-'}`
      : 'Số lần sửa: 0 · Chưa sửa';

    card.querySelector('h3').textContent = `Séc ${index + 1}`;
    card.querySelector('.set-meta').textContent = `Tạo: ${createdText} · ${money(item.stake)} / người thua${item.note ? ` · ${item.note}` : ''} · ${editText}`;
    card.querySelector('.set-losers').innerHTML = `<strong>Người thua:</strong> ${escapeHtml(names)}`;

    const editButton = card.querySelector('.edit-set');
    const deleteButton = card.querySelector('.delete-set');
    editButton.disabled = isSaving;
    deleteButton.disabled = isSaving;
    editButton.addEventListener('click', () => editSet(item.id));
    deleteButton.addEventListener('click', () => deleteSet(item.id));
    root.appendChild(template);
  });
}

async function commitSharedMutation(mutator, options = {}) {
  if (isSaving) return false;

  const previousState = core.cloneState(state);
  mutator();
  core.syncDefaultPlayers(state);
  store.saveUiState(state);
  isSaving = true;
  renderSyncBanner();
  render();

  try {
    const result = await store.saveSharedState(state);
    state = result.state;
    syncInfo = result.sync;
    render();
    if (typeof options.afterSuccess === 'function') {
      options.afterSuccess();
    }
    if (options.successMessage) {
      showToast(options.successMessage);
    } else if (syncInfo.notice) {
      showToast(syncInfo.notice);
    }
    return true;
  } catch (error) {
    state = previousState;
    store.saveUiState(state);
    syncInfo = {
      ...syncInfo,
      notice: error instanceof Error ? error.message : 'Không lưu được dữ liệu online.'
    };
    render();
    showToast(options.errorMessage || syncInfo.notice);
    return false;
  } finally {
    isSaving = false;
    renderSyncBanner();
    render();
  }
}

async function saveSet() {
  const loserIds = selectedLosersFromUI();
  const stake = Number($('#stakeInput').value || 0);
  const note = $('#setNote').value.trim();

  if (!getSelectablePlayers().length) {
    showToast('Cần có người chơi trong danh sách mặc định trước.');
    return;
  }

  if (!loserIds.length) {
    showToast('Hãy tích ít nhất 1 người thua.');
    return;
  }

  state.stake = stake;
  state.selectedLoserIds = loserIds;

  if (editingSetId) {
    const item = state.sets.find(setItem => setItem.id === editingSetId);
    if (!item) return;

    const changed = item.date !== state.currentDate
      || !sameLoserIds(item.loserIds, loserIds)
      || Number(item.stake || 0) !== stake
      || (item.note || '') !== note;

    if (!changed) {
      editingSetId = null;
      render();
      $('#setNote').value = '';
      showToast('Không có thay đổi mới trong séc này.');
      return;
    }

    const nextEditCount = Number(item.editCount || 0) + 1;
    const success = await commitSharedMutation(() => {
      const updatedAt = new Date().toISOString();
      item.date = state.currentDate;
      item.loserIds = loserIds.slice();
      item.stake = stake;
      item.note = note;
      item.editCount = nextEditCount;
      item.updatedAt = updatedAt;
      item.editHistory = Array.isArray(item.editHistory) ? item.editHistory : [];
      item.editHistory.push(updatedAt);
      editingSetId = null;
    }, {
      successMessage: `Đã cập nhật séc. Số lần sửa: ${nextEditCount}.`,
      errorMessage: 'Không cập nhật được séc.'
    });

    if (success) {
      $('#setNote').value = '';
    }

    return;
  }

  const success = await commitSharedMutation(() => {
    state.sets.push({
      id: core.uid(),
      date: state.currentDate,
      loserIds: loserIds.slice(),
      stake,
      note,
      createdAt: new Date().toISOString(),
      updatedAt: '',
      editCount: 0,
      editHistory: []
    });
  }, {
    successMessage: 'Đã lưu thêm 1 séc.',
    errorMessage: 'Không lưu được séc mới.'
  });

  if (success) {
    $('#setNote').value = '';
  }
}

function editSet(id) {
  const item = state.sets.find(setItem => setItem.id === id);
  if (!item || isSaving) return;

  editingSetId = id;
  state.currentDate = item.date;
  state.selectedLoserIds = item.loserIds.slice();
  state.stake = Number(item.stake || 0);
  store.saveUiState(state);
  render();
  $('#setNote').value = item.note || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteSet(id) {
  if (isSaving) return;
  if (!confirm('Xóa séc này?')) return;

  const success = await commitSharedMutation(() => {
    state.sets = state.sets.filter(item => item.id !== id);
    if (editingSetId === id) {
      editingSetId = null;
    }
  }, {
    successMessage: 'Đã xóa séc.',
    errorMessage: 'Không xóa được séc.'
  });

  if (success && editingSetId == null) {
    $('#setNote').value = '';
  }
}

async function clearCurrentDate() {
  if (isSaving) return;
  if (!confirm(`Xóa toàn bộ séc ngày ${state.currentDate}?`)) return;

  const success = await commitSharedMutation(() => {
    state.sets = state.sets.filter(item => item.date !== state.currentDate);
    editingSetId = null;
  }, {
    successMessage: 'Đã xóa dữ liệu ngày này.',
    errorMessage: 'Không xóa được dữ liệu ngày này.'
  });

  if (success) {
    $('#setNote').value = '';
  }
}

function importJson(file) {
  if (!file || isSaving) return;

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const imported = JSON.parse(reader.result);
      const importedState = core.buildState(imported, imported);
      core.syncDefaultPlayers(importedState);
      editingSetId = null;
      isSaving = true;
      renderSyncBanner();
      render();

      try {
        const result = await store.saveSharedState(importedState);
        state = result.state;
        syncInfo = result.sync;
        render();
        $('#setNote').value = '';
        showToast('Đã nhập dữ liệu JSON.');
      } catch (error) {
        syncInfo = {
          ...syncInfo,
          notice: error instanceof Error ? error.message : 'Không nhập được dữ liệu JSON lên lưu trữ online.'
        };
        render();
        showToast(syncInfo.notice);
      } finally {
        isSaving = false;
        render();
      }
    } catch (error) {
      showToast('File JSON không hợp lệ.');
    }
  };
  reader.readAsText(file, 'utf-8');
}

function bindEvents() {
  $('#currentDate').addEventListener('change', (event) => {
    state.currentDate = event.target.value || core.todayISO();
    store.saveUiState(state);
    render();
  });

  $('#btnToday').addEventListener('click', () => {
    state.currentDate = core.todayISO();
    store.saveUiState(state);
    render();
  });

  $('#stakeInput').addEventListener('input', (event) => {
    state.stake = Number(event.target.value || 0);
    store.saveUiState(state);
  });

  $('#btnSaveSet').addEventListener('click', saveSet);
  $('#btnClearDate').addEventListener('click', clearCurrentDate);
  $('#importJson').addEventListener('change', (event) => {
    importJson(event.target.files[0]);
    event.target.value = '';
  });
}

async function init() {
  bindEvents();
  const initial = await store.loadAppState();
  state = initial.state;
  syncInfo = initial.sync;

  const queryDate = dateFromQuery();
  if (queryDate) {
    state.currentDate = queryDate;
    store.saveUiState(state);
  }

  render();

  if (syncInfo.notice) {
    showToast(syncInfo.notice);
  }
}

init();
