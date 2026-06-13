(function (root) {
  'use strict';

  const core = root.VolleyballAppState;

  if (!core) {
    throw new Error('VolleyballAppState must be loaded before remote-store.js');
  }

  const DEFAULT_CONFIG = {
    bridgeUrl: '',
    requestTimeoutMs: 25000,
    saveVerifyAttempts: 15,
    saveVerifyDelayMs: 900
  };

  const DEPLOYMENT_BRIDGE_URLS = Object.freeze({
    'https://a-ten-mauve.vercel.app': 'https://script.google.com/macros/s/AKfycbySZeitDAPXKM-z5HPgS3nL0a28rDla8547j0FN296ZSzGeTy4GHVfMTCU6-Vp7Rlsy3w/exec'
  });

  function resolveConfig() {
    const runtimeConfig = {
      ...DEFAULT_CONFIG,
      ...(root.APP_REMOTE_CONFIG || {})
    };
    const runtimeOrigin = root.location && typeof root.location.origin === 'string'
      ? root.location.origin
      : '';

    if (!runtimeConfig.bridgeUrl && DEPLOYMENT_BRIDGE_URLS[runtimeOrigin]) {
      runtimeConfig.bridgeUrl = DEPLOYMENT_BRIDGE_URLS[runtimeOrigin];
    }

    return Object.freeze(runtimeConfig);
  }

  const config = resolveConfig();

  function getRemoteOrigin() {
    if (!config.bridgeUrl) return '';

    try {
      return new URL(config.bridgeUrl).origin;
    } catch {
      return '';
    }
  }

  function hasRemoteBridge() {
    return Boolean(config.bridgeUrl && getRemoteOrigin());
  }

  function readJsonStorage(key) {
    return core.readStorage(root.localStorage, key);
  }

  function writeJsonStorage(key, value) {
    return core.writeStorage(root.localStorage, key, value);
  }

  function buildCacheEnvelope(sharedState) {
    return {
      schemaVersion: core.APP_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      state: core.extractSharedState(sharedState)
    };
  }

  function persistLegacyMirror(state) {
    writeJsonStorage(
      core.LEGACY_STORAGE_KEY,
      core.buildState(core.extractSharedState(state), core.extractUiState(state))
    );
  }

  function loadCachedSharedState() {
    const cached = readJsonStorage(core.SHARED_CACHE_KEY);
    return core.normalizeSharedState(cached && cached.state ? cached.state : cached);
  }

  function saveUiState(state) {
    writeJsonStorage(core.UI_STORAGE_KEY, core.extractUiState(state));
    persistLegacyMirror(state);
  }

  function delay(milliseconds) {
    return new Promise(function (resolve) {
      root.setTimeout(resolve, milliseconds);
    });
  }

  function appendQuery(url, parameters) {
    const target = new URL(url);
    Object.keys(parameters).forEach(function (key) {
      const value = parameters[key];
      if (value !== undefined && value !== null) {
        target.searchParams.set(key, String(value));
      }
    });
    return target.toString();
  }

  function loadRemoteEnvelope() {
    if (!hasRemoteBridge()) {
      return Promise.reject(new Error('Chưa cấu hình URL Google Apps Script.'));
    }

    return new Promise(function (resolve, reject) {
      const callbackName = '__volleyballJsonp_' + Date.now().toString(36)
        + '_' + Math.random().toString(36).slice(2, 10);
      const script = document.createElement('script');
      let finished = false;

      function cleanup() {
        if (script.parentNode) script.parentNode.removeChild(script);
        try {
          delete root[callbackName];
        } catch (_) {
          root[callbackName] = undefined;
        }
      }

      const timer = root.setTimeout(function () {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error('Google Apps Script không phản hồi khi tải dữ liệu.'));
      }, config.requestTimeoutMs);

      root[callbackName] = function (payload) {
        if (finished) return;
        finished = true;
        root.clearTimeout(timer);
        cleanup();

        if (!payload || payload.ok === false) {
          reject(new Error(payload && payload.error
            ? payload.error
            : 'Google Apps Script trả về dữ liệu không hợp lệ.'));
          return;
        }

        resolve({
          state: payload.state || null,
          meta: payload.meta || null
        });
      };

      script.async = true;
      script.src = appendQuery(config.bridgeUrl, {
        action: 'load',
        callback: callbackName,
        _: Date.now()
      });
      script.onerror = function () {
        if (finished) return;
        finished = true;
        root.clearTimeout(timer);
        cleanup();
        reject(new Error('Không tải được API Google Apps Script.'));
      };

      document.head.appendChild(script);
    });
  }

  async function postRemoteState(sharedState, writeToken) {
    if (!hasRemoteBridge()) {
      throw new Error('Chưa cấu hình URL Google Apps Script.');
    }

    const body = JSON.stringify({
      action: 'save',
      state: sharedState,
      writeToken: writeToken
    });

    await root.fetch(config.bridgeUrl, {
      method: 'POST',
      mode: 'no-cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8'
      },
      body: body
    });
  }

  async function saveRemoteState(sharedState) {
    const writeToken = 'save-' + Date.now().toString(36)
      + '-' + Math.random().toString(36).slice(2, 10);

    await postRemoteState(sharedState, writeToken);

    let lastEnvelope = null;
    for (let attempt = 0; attempt < config.saveVerifyAttempts; attempt += 1) {
      await delay(config.saveVerifyDelayMs);
      lastEnvelope = await loadRemoteEnvelope();

      if (lastEnvelope.meta && lastEnvelope.meta.writeToken === writeToken) {
        return lastEnvelope;
      }
    }

    throw new Error(
      'Đã gửi yêu cầu lưu nhưng chưa đọc lại được bản ghi xác nhận từ Google Sheets.'
    );
  }

  async function loadAppState() {
    const storedUi = readJsonStorage(core.UI_STORAGE_KEY);
    const legacy = core.loadLegacyState(root.localStorage);
    const legacyShared = core.extractSharedState(legacy);
    const cachedShared = loadCachedSharedState();
    const ui = core.normalizeUiState(storedUi || legacy);

    let shared = null;
    let sync = {
      remoteEnabled: hasRemoteBridge(),
      bridgeUrl: config.bridgeUrl,
      bridgeOrigin: getRemoteOrigin(),
      source: 'default',
      notice: '',
      meta: null
    };

    if (hasRemoteBridge()) {
      try {
        const remote = await loadRemoteEnvelope();
        const remoteShared = core.normalizeSharedState(remote.state);
        const remoteHasData = core.hasMeaningfulSharedData(remoteShared);

        if (!remoteHasData && core.hasMeaningfulSharedData(legacyShared)) {
          const seeded = await saveRemoteState(legacyShared);
          shared = core.normalizeSharedState(seeded.state || legacyShared);
          sync = {
            ...sync,
            source: 'migrated',
            notice: 'Đã chuyển dữ liệu cũ trên máy này lên lưu trữ online.',
            meta: seeded.meta || null
          };
        } else {
          shared = remoteShared;
          sync = {
            ...sync,
            source: 'remote',
            meta: remote.meta || null
          };
        }

        writeJsonStorage(core.SHARED_CACHE_KEY, buildCacheEnvelope(shared));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (core.hasMeaningfulSharedData(cachedShared)) {
          shared = cachedShared;
          sync = {
            ...sync,
            source: 'cache',
            notice: 'Không kết nối được lưu trữ online: ' + message
              + ' Ứng dụng đang hiển thị bản cache trên máy này.'
          };
        } else if (core.hasMeaningfulSharedData(legacyShared)) {
          shared = legacyShared;
          sync = {
            ...sync,
            source: 'legacy',
            notice: 'Không kết nối được lưu trữ online: ' + message
              + ' Ứng dụng đang hiển thị dữ liệu cũ trên máy này.'
          };
        } else {
          shared = core.defaultSharedState();
          sync = {
            ...sync,
            source: 'default',
            notice: message
          };
        }
      }
    } else {
      shared = core.hasMeaningfulSharedData(legacyShared) ? legacyShared : cachedShared;
      if (!core.hasMeaningfulSharedData(shared)) {
        shared = core.defaultSharedState();
      }

      sync = {
        ...sync,
        source: core.hasMeaningfulSharedData(legacyShared)
          ? 'legacy'
          : (core.hasMeaningfulSharedData(cachedShared) ? 'cache' : 'default'),
        notice: 'Chưa cấu hình URL Google Apps Script. Dữ liệu hiện chỉ lưu trên máy này.'
      };
    }

    const state = core.buildState(shared, ui);
    core.syncDefaultPlayers(state);
    saveUiState(state);
    persistLegacyMirror(state);
    writeJsonStorage(core.SHARED_CACHE_KEY, buildCacheEnvelope(core.extractSharedState(state)));

    return { state: state, sync: sync };
  }

  async function saveSharedState(state) {
    const nextState = core.buildState(
      core.extractSharedState(state),
      core.extractUiState(state)
    );
    core.syncDefaultPlayers(nextState);
    saveUiState(nextState);
    persistLegacyMirror(nextState);
    writeJsonStorage(
      core.SHARED_CACHE_KEY,
      buildCacheEnvelope(core.extractSharedState(nextState))
    );

    if (!hasRemoteBridge()) {
      return {
        state: nextState,
        sync: {
          remoteEnabled: false,
          bridgeUrl: config.bridgeUrl,
          bridgeOrigin: getRemoteOrigin(),
          source: 'legacy',
          notice: 'Chưa cấu hình URL Google Apps Script. Đã lưu tạm trên máy này.',
          meta: null
        }
      };
    }

    const saved = await saveRemoteState(core.extractSharedState(nextState));
    const savedShared = saved && saved.state
      ? saved.state
      : core.extractSharedState(nextState);
    const mergedState = core.buildState(
      savedShared,
      core.extractUiState(nextState)
    );

    core.syncDefaultPlayers(mergedState);
    saveUiState(mergedState);
    persistLegacyMirror(mergedState);
    writeJsonStorage(
      core.SHARED_CACHE_KEY,
      buildCacheEnvelope(core.extractSharedState(mergedState))
    );

    return {
      state: mergedState,
      sync: {
        remoteEnabled: true,
        bridgeUrl: config.bridgeUrl,
        bridgeOrigin: getRemoteOrigin(),
        source: 'remote',
        notice: '',
        meta: saved && saved.meta ? saved.meta : null
      }
    };
  }

  root.VolleyballRemoteStore = {
    config: config,
    hasRemoteBridge: hasRemoteBridge,
    loadAppState: loadAppState,
    saveSharedState: saveSharedState,
    saveUiState: saveUiState
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
