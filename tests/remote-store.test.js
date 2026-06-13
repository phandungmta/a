const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const stateCore = require('../shared-state.js');
const VERCEL_BRIDGE_URL = 'https://script.google.com/macros/s/AKfycbySZeitDAPXKM-z5HPgS3nL0a28rDla8547j0FN296ZSzGeTy4GHVfMTCU6-Vp7Rlsy3w/exec';

function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };
}

function buildCacheEnvelope(sharedState) {
  return {
    schemaVersion: stateCore.APP_SCHEMA_VERSION,
    savedAt: '2026-06-13T00:00:00.000Z',
    state: stateCore.extractSharedState(sharedState)
  };
}

function createSampleState() {
  const state = stateCore.defaultState();
  stateCore.syncDefaultPlayers(state);
  state.currentDate = '2026-06-13';
  state.stake = 20000;
  state.selectedLoserIds = [state.players[0].id];
  state.sets.push({
    id: 'set-1',
    date: '2026-06-13',
    loserIds: [state.players[0].id],
    stake: 20000,
    note: 'test',
    createdAt: '2026-06-13T10:00:00.000Z',
    updatedAt: '',
    editCount: 0,
    editHistory: []
  });
  return state;
}

function loadRemoteStore(options = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'remote-store.js'), 'utf8');
  const context = {
    VolleyballAppState: stateCore,
    APP_REMOTE_CONFIG: options.appRemoteConfig || {},
    location: options.location || { origin: 'http://localhost' },
    localStorage: options.localStorage || createMemoryStorage(),
    URL,
    console,
    setTimeout,
    clearTimeout
  };

  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.VolleyballRemoteStore;
}

test('uses Vercel bridge fallback when deployed config is blank', () => {
  const store = loadRemoteStore({
    appRemoteConfig: { bridgeUrl: '' },
    location: { origin: 'https://a-ten-mauve.vercel.app' }
  });

  assert.equal(store.config.bridgeUrl, VERCEL_BRIDGE_URL);
  assert.equal(store.hasRemoteBridge(), true);
});

test('respects a manual bridge config on production origin', () => {
  const store = loadRemoteStore({
    appRemoteConfig: {
      bridgeUrl: 'https://example.com/custom-bridge'
    },
    location: { origin: 'https://a-ten-mauve.vercel.app' }
  });

  assert.equal(store.config.bridgeUrl, 'https://example.com/custom-bridge');
  assert.equal(store.hasRemoteBridge(), true);
});

test('reads cached shared state immediately before remote sync', () => {
  const cachedState = createSampleState();
  const storage = createMemoryStorage({
    [stateCore.SHARED_CACHE_KEY]: JSON.stringify(buildCacheEnvelope(cachedState)),
    [stateCore.UI_STORAGE_KEY]: JSON.stringify({
      currentDate: '2026-06-13',
      stake: 20000,
      selectedLoserIds: [cachedState.players[0].id]
    })
  });
  const store = loadRemoteStore({
    appRemoteConfig: { bridgeUrl: VERCEL_BRIDGE_URL },
    localStorage: storage
  });

  const result = store.readCachedAppState();

  assert.equal(result.sync.source, 'cache');
  assert.equal(result.sync.tone, 'busy');
  assert.equal(result.state.sets.length, 1);
  assert.equal(result.state.currentDate, '2026-06-13');
});

test('does not persist shared data locally when online bridge is missing', async () => {
  const storage = createMemoryStorage();
  const store = loadRemoteStore({
    appRemoteConfig: { bridgeUrl: '' },
    localStorage: storage
  });
  const nextState = createSampleState();

  await assert.rejects(
    () => store.saveSharedState(nextState),
    /Chưa cấu hình URL Google Apps Script/
  );

  assert.equal(storage.getItem(stateCore.SHARED_CACHE_KEY), null);
  assert.equal(storage.getItem(stateCore.LEGACY_STORAGE_KEY), null);

  const savedUi = JSON.parse(storage.getItem(stateCore.UI_STORAGE_KEY));
  assert.equal(savedUi.currentDate, '2026-06-13');
  assert.equal(savedUi.stake, 20000);
});
