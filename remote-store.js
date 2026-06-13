(function (root) {
  const core = root.VolleyballAppState;

  if (!core) {
    throw new Error('VolleyballAppState must be loaded before remote-store.js');
  }

  const DEFAULT_CONFIG = {
    bridgeUrl: '',
    requestTimeoutMs: 20000,
    bridgeIframeId: 'volleyball-tracker-bridge',
    messageNamespace: 'volleyball-tracker'
  };

  const DEPLOYMENT_BRIDGE_URLS = Object.freeze({
    'https://a-ten-mauve.vercel.app': 'https://script.google.com/macros/s/AKfycbzaluFbu_qqalxfXIERdv7SsMQMU9QINAh5a4uzaeOOdW8i01bAlthdk9z7bWjUvcCO/exec'
  });

  function resolveConfig() {
    const runtimeConfig = {
      ...DEFAULT_CONFIG,
      ...(root.APP_REMOTE_CONFIG || {})
    };
    const runtimeOrigin = root.location && typeof root.location.origin === 'string'
      ? root.location.origin
      : '';

    if (DEPLOYMENT_BRIDGE_URLS[runtimeOrigin]) {
      runtimeConfig.bridgeUrl = DEPLOYMENT_BRIDGE_URLS[runtimeOrigin];
    }

    return Object.freeze(runtimeConfig);
  }

  const config = resolveConfig();

  let bridgeSetupPromise = null;
  let bridgeFrame = null;
  let bridgeListenerAttached = false;
  let bridgeReadyResolver = null;
  let bridgeReadyRejecter = null;
  let bridgeReadyTimer = null;
  const pendingRequests = new Map();

  function getBridgeOrigin() {
    if (!config.bridgeUrl) return '';

    try {
      return new URL(config.bridgeUrl).origin;
    } catch {
      return '';
    }
  }

  function hasRemoteBridge() {
    return Boolean(config.bridgeUrl && getBridgeOrigin());
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
    writeJsonStorage(core.LEGACY_STORAGE_KEY, core.buildState(core.extractSharedState(state), core.extractUiState(state)));
  }

  function loadCachedSharedState() {
    const cached = readJsonStorage(core.SHARED_CACHE_KEY);
    return core.normalizeSharedState(cached && cached.state ? cached.state : cached);
  }

  function saveUiState(state) {
    writeJsonStorage(core.UI_STORAGE_KEY, core.extractUiState(state));
    persistLegacyMirror(state);
  }

  function ensureBridgeIframe() {
    if (bridgeFrame) return bridgeFrame;

    bridgeFrame = document.getElementById(config.bridgeIframeId);

    if (bridgeFrame) return bridgeFrame;

    bridgeFrame = document.createElement('iframe');
    bridgeFrame.id = config.bridgeIframeId;
    bridgeFrame.src = config.bridgeUrl;
    bridgeFrame.title = 'Volleyball Tracker Bridge';
    bridgeFrame.setAttribute('aria-hidden', 'true');
    bridgeFrame.tabIndex = -1;
    bridgeFrame.style.display = 'none';
    document.body.appendChild(bridgeFrame);

    return bridgeFrame;
  }

  function cleanupPendingRequest(id, timer) {
    if (timer) {
      clearTimeout(timer);
    }

    pendingRequests.delete(id);
  }

  function handleBridgeMessage(event) {
    if (event.origin !== getBridgeOrigin()) return;

    const message = event.data || {};
    if (message.namespace !== config.messageNamespace) return;

    if (message.type === 'bridge-ready') {
      if (!bridgeReadyResolver) return;

      if (bridgeReadyTimer) {
        root.clearTimeout(bridgeReadyTimer);
        bridgeReadyTimer = null;
      }

      const resolve = bridgeReadyResolver;
      bridgeReadyResolver = null;
      bridgeReadyRejecter = null;
      resolve(ensureBridgeIframe());
      return;
    }

    if (message.type !== 'bridge-response' || !message.id) return;

    const pending = pendingRequests.get(message.id);
    if (!pending) return;

    cleanupPendingRequest(message.id, pending.timer);

    if (message.ok) {
      pending.resolve(message.payload || {});
      return;
    }

    pending.reject(new Error(message.error || 'Bridge Apps Script trả về lỗi.'));
  }

  function attachBridgeListener() {
    if (bridgeListenerAttached) return;
    root.addEventListener('message', handleBridgeMessage);
    bridgeListenerAttached = true;
  }

  function ensureBridgeReady() {
    if (!hasRemoteBridge()) {
      return Promise.reject(new Error('Chưa cấu hình bridge Apps Script.'));
    }

    if (bridgeSetupPromise) return bridgeSetupPromise;

    attachBridgeListener();
    bridgeSetupPromise = new Promise((resolve, reject) => {
      ensureBridgeIframe();
      bridgeReadyResolver = resolve;
      bridgeReadyRejecter = reject;

      bridgeReadyTimer = root.setTimeout(() => {
        bridgeReadyResolver = null;
        bridgeReadyRejecter = null;
        bridgeReadyTimer = null;
        bridgeSetupPromise = null;
        reject(new Error('Bridge Apps Script không phản hồi.'));
      }, config.requestTimeoutMs);
    });

    return bridgeSetupPromise;
  }

  async function callBridge(method, payload) {
    await ensureBridgeReady();

    const iframe = ensureBridgeIframe();
    const targetWindow = iframe.contentWindow;

    if (!targetWindow) {
      throw new Error('Không truy cập được cửa sổ bridge Apps Script.');
    }

    return new Promise((resolve, reject) => {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
      const timer = root.setTimeout(() => {
        cleanupPendingRequest(id, timer);
        reject(new Error('Hết thời gian chờ phản hồi từ bridge Apps Script.'));
      }, config.requestTimeoutMs);

      pendingRequests.set(id, { resolve, reject, timer });

      targetWindow.postMessage({
        namespace: config.messageNamespace,
        type: 'bridge-request',
        id,
        method,
        payload: payload || {}
      }, getBridgeOrigin());
    });
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
      bridgeOrigin: getBridgeOrigin(),
      source: 'default',
      notice: '',
      meta: null
    };

    if (hasRemoteBridge()) {
      try {
        const remote = await callBridge('getState');
        const remoteShared = core.normalizeSharedState(remote.state);
        const remoteHasData = core.hasMeaningfulSharedData(remoteShared);

        if (!remoteHasData && core.hasMeaningfulSharedData(legacyShared)) {
          const seeded = await callBridge('saveState', { state: legacyShared });
          shared = core.normalizeSharedState(seeded.state);
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
        if (core.hasMeaningfulSharedData(cachedShared)) {
          shared = cachedShared;
          sync = {
            ...sync,
            source: 'cache',
            notice: 'Không kết nối được lưu trữ online. Ứng dụng đang hiển thị bản cache trên máy này.'
          };
        } else if (core.hasMeaningfulSharedData(legacyShared)) {
          shared = legacyShared;
          sync = {
            ...sync,
            source: 'legacy',
            notice: 'Không kết nối được lưu trữ online. Ứng dụng đang hiển thị dữ liệu cũ trên máy này.'
          };
        } else {
          shared = core.defaultSharedState();
          sync = {
            ...sync,
            source: 'default',
            notice: error instanceof Error ? error.message : 'Không kết nối được lưu trữ online.'
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
        source: core.hasMeaningfulSharedData(legacyShared) ? 'legacy' : (core.hasMeaningfulSharedData(cachedShared) ? 'cache' : 'default'),
        notice: 'Chưa cấu hình bridge Apps Script. Dữ liệu hiện chỉ lưu trên máy này.'
      };
    }

    const state = core.buildState(shared, ui);
    core.syncDefaultPlayers(state);
    saveUiState(state);
    persistLegacyMirror(state);
    writeJsonStorage(core.SHARED_CACHE_KEY, buildCacheEnvelope(core.extractSharedState(state)));

    return { state, sync };
  }

  async function saveSharedState(state) {
    const nextState = core.buildState(core.extractSharedState(state), core.extractUiState(state));
    core.syncDefaultPlayers(nextState);
    saveUiState(nextState);

    if (!hasRemoteBridge()) {
      writeJsonStorage(core.SHARED_CACHE_KEY, buildCacheEnvelope(core.extractSharedState(nextState)));
      persistLegacyMirror(nextState);

      return {
        state: nextState,
        sync: {
          remoteEnabled: false,
          bridgeUrl: config.bridgeUrl,
          bridgeOrigin: getBridgeOrigin(),
          source: 'legacy',
          notice: 'Chưa cấu hình bridge Apps Script. Đã lưu tạm trên máy này.',
          meta: null
        }
      };
    }

    const saved = await callBridge('saveState', { state: core.extractSharedState(nextState) });
    const mergedState = core.buildState(saved.state, nextState);
    core.syncDefaultPlayers(mergedState);
    saveUiState(mergedState);
    persistLegacyMirror(mergedState);
    writeJsonStorage(core.SHARED_CACHE_KEY, buildCacheEnvelope(core.extractSharedState(mergedState)));

    return {
      state: mergedState,
      sync: {
        remoteEnabled: true,
        bridgeUrl: config.bridgeUrl,
        bridgeOrigin: getBridgeOrigin(),
        source: 'remote',
        notice: '',
        meta: saved.meta || null
      }
    };
  }

  root.VolleyballRemoteStore = {
    config,
    hasRemoteBridge,
    loadAppState,
    saveSharedState,
    saveUiState
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
