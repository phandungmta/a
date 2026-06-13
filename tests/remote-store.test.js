const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const stateCore = require('../shared-state.js');

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

  assert.equal(
    store.config.bridgeUrl,
    'https://script.google.com/macros/s/AKfycbzaluFbu_qqalxfXIERdv7SsMQMU9QINAh5a4uzaeOOdW8i01bAlthdk9z7bWjUvcCO/exec'
  );
  assert.equal(store.hasRemoteBridge(), true);
});
