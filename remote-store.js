(function (root) {
  'use strict';

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

  let bridgeSetupPromise = null;
  let bridgeFrame = null;
  let bridgeListenerAttached = false;
  let bridgeReadyResolver = null;
  let bridgeReadyRejecter = null;
  let bridgeReadyTimer = null;
  let bridgeReadyPollTimer = null;
  let bridgeReadySeen = false;
  let bridgeTargetOrigin = '';
  let bridgeTargetWindow = null;
  let bridgeProtocol = '';
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

  function hasBridgeTarget() {
    return Boolean(bridgeReadySeen && bridgeTargetWindow);
  }

  function isGoogleAppsSandboxOrigin(origin) {
    if (!origin) return false;

    try {
      const hostname = new URL(origin).hostname;
      return hostname === 'script.googleusercontent.com'
        || hostname.endsWith('.script.googleusercontent.com')
        || hostname === 'script.google.com';
    } catch {
      return false;
    }
  }

  function isBridgeMessageOrigin(origin) {
    return origin === getBridgeOrigin()
      || origin === bridgeTargetOrigin
      || isGoogleAppsSandboxOrigin(origin);
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

  function ensureBridgeIframe() {
    if (bridgeFrame) return bridgeFrame;

    bridgeFrame = document.getElementById(config.bridgeIframeId);
    if (bridgeFrame) return bridgeFrame;

    bridgeFrame = document.createElement('iframe');
    bridgeFrame.id = config.bridgeIframeId;
    bridgeFrame.title = 'Volleyball Tracker Bridge';
    bridgeFrame.setAttribute('aria-hidden', 'true');
    bridgeFrame.tabIndex = -1;
    bridgeFrame.style.position = 'fixed';
    bridgeFrame.style.width = '1px';
    bridgeFrame.style.height = '1px';
    bridgeFrame.style.border = '0';
    bridgeFrame.style.opacity = '0';
    bridgeFrame.style.pointerEvents = 'none';
    bridgeFrame.style.left = '-10000px';
    bridgeFrame.style.top = '-10000px';

    const separator = config.bridgeUrl.includes('?') ? '&' : '?';
    bridgeFrame.src = `${config.bridgeUrl}${separator}parentOrigin=${encodeURIComponent(root.location.origin)}&ts=${Date.now()}`;
    document.body.appendChild(bridgeFrame);

    return bridgeFrame;
  }

  function cleanupPendingRequest(id, timer) {
    if (timer) root.clearTimeout(timer);
    pendingRequests.delete(id);
  }

  function clearBridgeReadyWaiters() {
    if (bridgeReadyTimer) {
      root.clearTimeout(bridgeReadyTimer);
      bridgeReadyTimer = null;
    }

    if (bridgeReadyPollTimer) {
      root.clearInterval(bridgeReadyPollTimer);
      bridgeReadyPollTimer = null;
    }
  }

  function tryGetEventSource(event) {
    try {
      return event.source || null;
    } catch {
      return null;
    }
  }

  function isModernReady(message) {
    return message
      && message.namespace === config.messageNamespace
      && message.type === 'bridge-ready';
  }

  function isLegacyReady(message) {
    if (!message || typeof message !== 'object') return false;
    const type = String(message.type || '').toUpperCase();
    const action = String(message.action || '').toLowerCase();
    return message.source === 'volleyball-bridge'
      && (type === 'VOLLEYBALL_BRIDGE_READY' || action === 'ready');
  }

  function markBridgeReady(event, protocol) {
    bridgeReadySeen = true;
    bridgeProtocol = protocol || bridgeProtocol || 'modern';
    bridgeTargetOrigin = event.origin || bridgeTargetOrigin || getBridgeOrigin();
    bridgeTargetWindow = tryGetEventSource(event) || bridgeTargetWindow;

    clearBridgeReadyWaiters();

    if (!bridgeReadyResolver) return;
    const resolve = bridgeReadyResolver;
    bridgeReadyResolver = null;
    bridgeReadyRejecter = null;
    resolve(bridgeTargetWindow || ensureBridgeIframe().contentWindow);
  }

  function handleModernResponse(message) {
    if (!message || message.namespace !== config.messageNamespace) return false;
    if (message.type !== 'bridge-response' || !message.id) return false;

    const pending = pendingRequests.get(message.id);
    if (!pending) return true;

    cleanupPendingRequest(message.id, pending.timer);

    if (message.ok) {
      pending.resolve(message.payload || {});
    } else {
      pending.reject(new Error(message.error || 'Bridge Apps Script trả về lỗi.'));
    }

    return true;
  }

  function handleLegacyResponse(message) {
    if (!message || typeof message !== 'object') return false;

    const requestId = message.requestId || message.id || '';
    if (!requestId) return false;

    const type = String(message.type || '').toUpperCase();
    const action = String(message.action || '').toLowerCase();
    const isLegacyMessage = message.source === 'volleyball-bridge'
      || type.startsWith('VOLLEYBALL_')
      || ['loaded', 'saved', 'load-error', 'save-error'].includes(action);

    if (!isLegacyMessage) return false;

    const pending = pendingRequests.get(requestId);
    if (!pending) return true;

    cleanupPendingRequest(requestId, pending.timer);

    const failed = message.ok === false
      || type === 'VOLLEYBALL_ERROR'
      || action.endsWith('-error');

    if (failed) {
      pending.reject(new Error(message.error || 'Bridge Apps Script trả về lỗi.'));
      return true;
    }

    if (pending.method === 'getState') {
      pending.resolve({
        state: message.state || message.data || null,
        meta: message.meta || message.result || null
      });
      return true;
    }

    if (pending.method === 'saveState') {
      pending.resolve({
        state: pending.payload && pending.payload.state ? pending.payload.state : null,
        meta: message.result || message.meta || null
      });
      return true;
    }

    pending.resolve(message.payload || message.result || {});
    return true;
  }

  function handleBridgeMessage(event) {
    if (!isBridgeMessageOrigin(event.origin)) return;

    const message = event.data || {};

    if (isModernReady(message)) {
      markBridgeReady(event, 'modern');
      return;
    }

    if (isLegacyReady(message)) {
      markBridgeReady(event, 'legacy');
      return;
    }

    if (handleModernResponse(message)) return;
    handleLegacyResponse(message);
  }

  function attachBridgeListener() {
    if (bridgeListenerAttached) return;
    root.addEventListener('message', handleBridgeMessage);
    bridgeListenerAttached = true;
  }

  function appendBridgeChildTargets(targets, frameWindow, targetOrigin) {
    if (!frameWindow) return;

    try {
      const childFrames = frameWindow.frames;
      const childCount = Number(childFrames.length || 0);

      for (let index = 0; index < childCount; index += 1) {
        const childWindow = childFrames[index];
        if (!childWindow) continue;
        if (targets.some((entry) => entry.window === childWindow)) continue;

        targets.push({ window: childWindow, origin: targetOrigin });
        appendBridgeChildTargets(targets, childWindow, targetOrigin);
      }
    } catch {
      // Cross-origin child traversal is best-effort only.
    }
  }

  function getBridgeRequestTargets() {
    const targets = [];
    const targetOrigin = bridgeTargetOrigin || getBridgeOrigin();

    if (bridgeTargetWindow) {
      targets.push({ window: bridgeTargetWindow, origin: targetOrigin });
    }

    const iframe = ensureBridgeIframe();
    const outerWindow = iframe.contentWindow;

    if (outerWindow && !targets.some((entry) => entry.window === outerWindow)) {
      targets.push({ window: outerWindow, origin: getBridgeOrigin() });
    }

    appendBridgeChildTargets(targets, outerWindow, targetOrigin);
    return targets;
  }

  function ensureBridgeReady() {
    if (!hasRemoteBridge()) {
      return Promise.reject(new Error('Chưa cấu hình bridge Apps Script.'));
    }

    if (hasBridgeTarget()) {
      return Promise.resolve(bridgeTargetWindow);
    }

    if (bridgeSetupPromise) return bridgeSetupPromise;

    attachBridgeListener();
    bridgeSetupPromise = new Promise((resolve, reject) => {
      bridgeReadyResolver = resolve;
      bridgeReadyRejecter = reject;

      bridgeReadyTimer = root.setTimeout(() => {
        bridgeReadyResolver = null;
        bridgeReadyRejecter = null;
        clearBridgeReadyWaiters();
        bridgeSetupPromise = null;
        reject(new Error('Bridge Apps Script không phản hồi. Hãy kiểm tra quyền triển khai Apps Script là “Anyone”.'));
      }, config.requestTimeoutMs);

      bridgeReadyPollTimer = root.setInterval(() => {
        if (!hasBridgeTarget() || !bridgeReadyResolver) return;
        markBridgeReady({
          origin: bridgeTargetOrigin,
          source: bridgeTargetWindow
        }, bridgeProtocol || 'modern');
      }, 50);

      ensureBridgeIframe();
    });

    return bridgeSetupPromise;
  }

  function buildModernRequest(id, method, payload) {
    return {
      namespace: config.messageNamespace,
      type: 'bridge-request',
      id,
      method,
      payload: payload || {}
    };
  }

  function buildLegacyRequest(id, method, payload) {
    if (method === 'getState') {
      return {
        source: 'volleyball-tracker',
        action: 'load',
        type: 'load',
        command: 'load',
        requestId: id
      };
    }

    if (method === 'saveState') {
      const state = payload && payload.state ? payload.state : {};
      return {
        source: 'volleyball-tracker',
        action: 'save',
        type: 'save',
        command: 'save',
        requestId: id,
        state,
        data: state,
        payload: state,
        json: JSON.stringify(state)
      };
    }

    return {
      source: 'volleyball-tracker',
      action: method,
      type: method,
      requestId: id,
      payload: payload || {}
    };
  }

  async function callBridge(method, payload) {
    await ensureBridgeReady();

    const requestTargets = getBridgeRequestTargets();
    if (!requestTargets.length) {
      throw new Error('Không truy cập được cửa sổ bridge Apps Script.');
    }

    return new Promise((resolve, reject) => {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
      const timer = root.setTimeout(() => {
        cleanupPendingRequest(id, timer);
        reject(new Error('Hết thời gian chờ phản hồi từ bridge Apps Script.'));
      }, config.requestTimeoutMs);

      pendingRequests.set(id, {
        resolve,
        reject,
        timer,
        method,
        payload: payload || {}
      });

      const protocol = bridgeProtocol || 'modern';
      const message = protocol === 'legacy'
        ? buildLegacyRequest(id, method, payload)
        : buildModernRequest(id, method, payload);

      let sent = false;
      requestTargets.forEach(({ window: targetWindow, origin: targetOrigin }) => {
        try {
          targetWindow.postMessage(message, targetOrigin || '*');
          sent = true;
        } catch {
          // Keep trying other known bridge windows.
        }
      });

      if (!sent) {
        cleanupPendingRequest(id, timer);
        reject(new Error('Không gửi được yêu cầu tới bridge Apps Script.'));
      }
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
        const remoteShared = core.normalizeSharedState(remote && remote.state);
        const remoteHasData = core.hasMeaningfulSharedData(remoteShared);

        if (!remoteHasData && core.hasMeaningfulSharedData(legacyShared)) {
          const seeded = await callBridge('saveState', { state: legacyShared });
          shared = core.normalizeSharedState((seeded && seeded.state) || legacyShared);
          sync = {
            ...sync,
            source: 'migrated',
            notice: 'Đã chuyển dữ liệu cũ trên máy này lên lưu trữ online.',
            meta: seeded && seeded.meta ? seeded.meta : null
          };
        } else {
          shared = remoteShared;
          sync = {
            ...sync,
            source: 'remote',
            meta: remote && remote.meta ? remote.meta : null
          };
        }

        writeJsonStorage(core.SHARED_CACHE_KEY, buildCacheEnvelope(shared));
      } catch (error) {
        if (core.hasMeaningfulSharedData(cachedShared)) {
          shared = cachedShared;
          sync = {
            ...sync,
            source: 'cache',
            notice: `Không kết nối được lưu trữ online: ${error instanceof Error ? error.message : String(error)} Ứng dụng đang hiển thị bản cache trên máy này.`
          };
        } else if (core.hasMeaningfulSharedData(legacyShared)) {
          shared = legacyShared;
          sync = {
            ...sync,
            source: 'legacy',
            notice: `Không kết nối được lưu trữ online: ${error instanceof Error ? error.message : String(error)} Ứng dụng đang hiển thị dữ liệu cũ trên máy này.`
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
      if (!core.hasMeaningfulSharedData(shared)) shared = core.defaultSharedState();

      sync = {
        ...sync,
        source: core.hasMeaningfulSharedData(legacyShared)
          ? 'legacy'
          : (core.hasMeaningfulSharedData(cachedShared) ? 'cache' : 'default'),
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
    writeJsonStorage(core.SHARED_CACHE_KEY, buildCacheEnvelope(core.extractSharedState(nextState)));

    if (!hasRemoteBridge()) {
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

    const saved = await callBridge('saveState', {
      state: core.extractSharedState(nextState)
    });
    const savedShared = saved && saved.state
      ? saved.state
      : core.extractSharedState(nextState);
    const mergedState = core.buildState(savedShared, core.extractUiState(nextState));
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
        meta: saved && saved.meta ? saved.meta : null
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
