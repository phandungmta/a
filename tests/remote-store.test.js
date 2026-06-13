const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const stateCore = require('../shared-state.js');
const VERCEL_BRIDGE_URL = 'https://script.google.com/macros/s/AKfycbzaluFbu_qqalxfXIERdv7SsMQMU9QINAh5a4uzaeOOdW8i01bAlthdk9z7bWjUvcCO/exec';

function loadRemoteStore(options = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'remote-store.js'), 'utf8');
  const context = {
    VolleyballAppState: stateCore,
    APP_REMOTE_CONFIG: options.appRemoteConfig || {},
    location: options.location || { origin: 'http://localhost' },
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

test('prefers the pinned Vercel bridge over a conflicting manual config on production origin', () => {
  const store = loadRemoteStore({
    appRemoteConfig: {
      bridgeUrl: 'https://script.google.com/macros/s/AKfycbySZeitDAPXKM-z5HPgS3nL0a28rDla8547j0FN296ZSzGeTy4GHVfMTCU6-Vp7Rlsy3w/exec'
    },
    location: { origin: 'https://a-ten-mauve.vercel.app' }
  });

  assert.equal(store.config.bridgeUrl, VERCEL_BRIDGE_URL);
  assert.equal(store.hasRemoteBridge(), true);
});
