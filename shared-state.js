(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.VolleyballAppState = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LEGACY_STORAGE_KEY = 'volleyball_simple_loser_tracker_v1';
  const UI_STORAGE_KEY = 'volleyball_simple_loser_tracker_ui_v2';
  const SHARED_CACHE_KEY = 'volleyball_simple_loser_tracker_shared_cache_v2';
  const APP_SCHEMA_VERSION = 2;
  const DEFAULT_PLAYER_NAMES = [
    'Cao cầu',
    'Dũng',
    'Duy',
    'Đông anh',
    'Đức',
    'Hà',
    'Ký',
    'Quang anh',
    'Quang em',
    'Sơn'
  ];

  function todayISO() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 10);
  }

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function isDateInput(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  }

  function normalizePlayerName(value) {
    return String(value || '').replace(/^\uFEFF/, '').trim().replace(/\s+/g, ' ');
  }

  function playerKey(name) {
    return normalizePlayerName(name).toLocaleLowerCase('vi-VN');
  }

  function stablePlayerId(name) {
    const normalized = playerKey(name).normalize('NFC');
    let hash = 2166136261;

    for (let index = 0; index < normalized.length; index += 1) {
      hash ^= normalized.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return `player-${(hash >>> 0).toString(36)}`;
  }

  function defaultSharedState() {
    return {
      players: [],
      sets: [],
      payments: [],
      playersCsvLoadedAt: ''
    };
  }

  function defaultUiState() {
    return {
      selectedLoserIds: [],
      stake: 0,
      currentDate: todayISO()
    };
  }

  function defaultState() {
    return {
      ...defaultSharedState(),
      ...defaultUiState()
    };
  }

  function normalizePlayer(item) {
    const name = normalizePlayerName(item && item.name);

    return {
      id: item && item.id ? item.id : uid(),
      name,
      source: item && item.source ? item.source : '',
      active: item && item.active === false ? false : true
    };
  }

  function normalizeSet(item) {
    return {
      id: item && item.id ? item.id : uid(),
      date: isDateInput(item && item.date) ? item.date : todayISO(),
      loserIds: Array.isArray(item && item.loserIds) ? item.loserIds.filter(Boolean) : [],
      stake: Number(item && item.stake || 0),
      note: item && item.note ? String(item.note) : '',
      createdAt: item && item.createdAt ? item.createdAt : new Date().toISOString(),
      updatedAt: item && item.updatedAt ? item.updatedAt : '',
      editCount: Number(item && item.editCount || 0),
      editHistory: Array.isArray(item && item.editHistory) ? item.editHistory.filter(Boolean) : []
    };
  }

  function normalizePayment(item) {
    return {
      id: item && item.id ? item.id : uid(),
      playerId: item && item.playerId ? item.playerId : '',
      amount: Number(item && item.amount || 0),
      note: item && item.note ? String(item.note) : '',
      paidAt: item && (item.paidAt || item.createdAt) ? (item.paidAt || item.createdAt) : new Date().toISOString(),
      createdAt: item && (item.createdAt || item.paidAt) ? (item.createdAt || item.paidAt) : new Date().toISOString()
    };
  }

  function normalizeSharedState(raw) {
    const parsed = raw && typeof raw === 'object' ? raw : {};

    return {
      ...defaultSharedState(),
      ...parsed,
      players: Array.isArray(parsed.players) ? parsed.players.map(normalizePlayer).filter(player => player.name) : [],
      sets: Array.isArray(parsed.sets) ? parsed.sets.map(normalizeSet) : [],
      payments: Array.isArray(parsed.payments) ? parsed.payments.map(normalizePayment) : [],
      playersCsvLoadedAt: parsed.playersCsvLoadedAt ? String(parsed.playersCsvLoadedAt) : ''
    };
  }

  function normalizeUiState(raw) {
    const parsed = raw && typeof raw === 'object' ? raw : {};

    return {
      ...defaultUiState(),
      selectedLoserIds: Array.isArray(parsed.selectedLoserIds) ? parsed.selectedLoserIds.filter(Boolean) : [],
      stake: Number(parsed.stake || 0),
      currentDate: isDateInput(parsed.currentDate) ? parsed.currentDate : todayISO()
    };
  }

  function buildState(shared, ui) {
    return {
      ...normalizeSharedState(shared),
      ...normalizeUiState(ui)
    };
  }

  function extractSharedState(state) {
    const shared = normalizeSharedState(state);

    return {
      players: shared.players,
      sets: shared.sets,
      payments: shared.payments,
      playersCsvLoadedAt: shared.playersCsvLoadedAt
    };
  }

  function extractUiState(state) {
    const ui = normalizeUiState(state);

    return {
      selectedLoserIds: ui.selectedLoserIds,
      stake: ui.stake,
      currentDate: ui.currentDate
    };
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function hasMeaningfulSharedData(sharedState) {
    const shared = normalizeSharedState(sharedState);
    return Boolean(shared.players.length || shared.sets.length || shared.payments.length);
  }

  function playerInUse(state, playerId) {
    return state.sets.some(item => item.loserIds.includes(playerId))
      || state.payments.some(payment => payment.playerId === playerId);
  }

  function playersChanged(currentPlayers, nextPlayers) {
    if (currentPlayers.length !== nextPlayers.length) return true;

    return currentPlayers.some((player, index) => {
      const next = nextPlayers[index];

      return !next
        || player.id !== next.id
        || player.name !== next.name
        || player.source !== next.source
        || player.active !== next.active;
    });
  }

  function syncPlayersFromNames(state, names) {
    const shared = state && typeof state === 'object' ? state : defaultState();
    const cleanedNames = (names || []).map(normalizePlayerName).filter(Boolean);
    const existingPlayers = (shared.players || []).map(normalizePlayer).filter(player => player.name);
    const existingByKey = new Map(existingPlayers.map(player => [playerKey(player.name), player]));
    const nextPlayers = [];
    const usedIds = new Set();

    cleanedNames.forEach(name => {
      const key = playerKey(name);
      const existing = existingByKey.get(key);

      if (existing) {
        nextPlayers.push({
          ...existing,
          name,
          source: 'built-in',
          active: true
        });
        usedIds.add(existing.id);
        return;
      }

      let id = stablePlayerId(name);
      let suffix = 2;

      while (usedIds.has(id) || existingPlayers.some(player => player.id === id)) {
        id = `${stablePlayerId(name)}-${suffix}`;
        suffix += 1;
      }

      nextPlayers.push({
        id,
        name,
        source: 'built-in',
        active: true
      });
      usedIds.add(id);
    });

    existingPlayers.forEach(player => {
      if (usedIds.has(player.id)) return;
      if (!playerInUse(shared, player.id)) return;

      nextPlayers.push({
        ...player,
        active: false
      });
    });

    const changed = playersChanged(existingPlayers, nextPlayers);

    if (!changed) return false;

    shared.players = nextPlayers;
    shared.playersCsvLoadedAt = new Date().toISOString();

    if (Array.isArray(shared.selectedLoserIds)) {
      const activeIds = new Set(nextPlayers.filter(player => player.active !== false).map(player => player.id));
      shared.selectedLoserIds = shared.selectedLoserIds.filter(id => activeIds.has(id));
    }

    return true;
  }

  function syncDefaultPlayers(state) {
    return syncPlayersFromNames(state, DEFAULT_PLAYER_NAMES);
  }

  function readStorage(storage, key) {
    if (!storage || typeof storage.getItem !== 'function') return null;

    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeStorage(storage, key, value) {
    if (!storage || typeof storage.setItem !== 'function') return false;

    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function loadLegacyState(storage) {
    const parsed = readStorage(storage, LEGACY_STORAGE_KEY);
    return parsed ? buildState(parsed, parsed) : defaultState();
  }

  return {
    APP_SCHEMA_VERSION,
    DEFAULT_PLAYER_NAMES,
    LEGACY_STORAGE_KEY,
    SHARED_CACHE_KEY,
    UI_STORAGE_KEY,
    buildState,
    cloneState,
    defaultSharedState,
    defaultState,
    defaultUiState,
    extractSharedState,
    extractUiState,
    hasMeaningfulSharedData,
    loadLegacyState,
    normalizePayment,
    normalizePlayer,
    normalizePlayerName,
    normalizeSet,
    normalizeSharedState,
    normalizeUiState,
    playerKey,
    readStorage,
    stablePlayerId,
    syncDefaultPlayers,
    syncPlayersFromNames,
    todayISO,
    uid,
    writeStorage
  };
}));
