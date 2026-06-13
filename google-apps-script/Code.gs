const STORE_SHEET_NAME = 'TrackerState';
const CHUNK_SIZE = 40000;
const LAST_WRITE_TOKEN_KEY = 'VOLLEYBALL_LAST_WRITE_TOKEN';
const LAST_SAVED_AT_KEY = 'VOLLEYBALL_LAST_SAVED_AT';

/**
 * Web API:
 *   GET  ?action=load              -> JSON
 *   GET  ?action=load&callback=... -> JSONP
 *   GET  ?action=ping              -> JSON/JSONP
 *   POST { action: 'save', state: {...}, writeToken: '...' }
 */
function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = String(params.action || '').toLowerCase();

  try {
    if (action === 'load' || action === 'getstate' || action === 'get') {
      return createApiOutput_(getTrackerEnvelope_(), params.callback);
    }

    if (action === 'ping') {
      return createApiOutput_({
        ok: true,
        service: 'volleyball-tracker-direct-api',
        time: new Date().toISOString()
      }, params.callback);
    }

    return HtmlService.createHtmlOutput(
      '<!doctype html><html><head><meta charset="utf-8"><title>Volleyball Tracker API</title></head>' +
      '<body><h2>Volleyball Tracker API đang hoạt động</h2>' +
      '<p>Dùng <code>?action=load</code> để kiểm tra dữ liệu.</p></body></html>'
    ).setTitle('Volleyball Tracker API');
  } catch (error) {
    return createApiOutput_({
      ok: false,
      error: error && error.message ? error.message : String(error)
    }, params.callback);
  }
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents
      ? e.postData.contents
      : '{}';
    const request = JSON.parse(raw);
    const action = String(request.action || '').toLowerCase();

    if (action !== 'save' && action !== 'savestate' && action !== 'set') {
      throw new Error('Hành động POST không hợp lệ.');
    }

    if (!request.state || typeof request.state !== 'object') {
      throw new Error('Dữ liệu state gửi lên không hợp lệ.');
    }

    const result = saveTrackerState_(request.state, request.writeToken || '');
    return createJsonOutput_({
      ok: true,
      meta: result
    });
  } catch (error) {
    return createJsonOutput_({
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
}

function getTrackerEnvelope_() {
  const properties = PropertiesService.getScriptProperties();
  return {
    ok: true,
    state: getTrackerState_(),
    meta: {
      writeToken: properties.getProperty(LAST_WRITE_TOKEN_KEY) || '',
      savedAt: properties.getProperty(LAST_SAVED_AT_KEY) || ''
    }
  };
}

function getTrackerState_() {
  const sheet = getStoreSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const chunks = sheet.getRange(2, 1, lastRow - 1, 1)
    .getDisplayValues()
    .map(function (row) { return row[0]; })
    .filter(Boolean);

  if (!chunks.length) return null;

  try {
    return JSON.parse(chunks.join(''));
  } catch (error) {
    throw new Error('Dữ liệu trong Google Sheet không phải JSON hợp lệ: ' + error.message);
  }
}

function saveTrackerState_(state, writeToken) {
  const json = JSON.stringify(state);
  const chunks = [];

  for (let index = 0; index < json.length; index += CHUNK_SIZE) {
    chunks.push([json.slice(index, index + CHUNK_SIZE)]);
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const savedAt = new Date().toISOString();
    const sheet = getStoreSheet_();
    sheet.clearContents();
    sheet.getRange('A1:B1').setValues([[
      'VOLLEYBALL_TRACKER_STATE',
      savedAt
    ]]);

    if (chunks.length) {
      sheet.getRange(2, 1, chunks.length, 1).setValues(chunks);
    }

    SpreadsheetApp.flush();

    const properties = PropertiesService.getScriptProperties();
    properties.setProperty(LAST_WRITE_TOKEN_KEY, String(writeToken || ''));
    properties.setProperty(LAST_SAVED_AT_KEY, savedAt);

    return {
      writeToken: String(writeToken || ''),
      savedAt: savedAt,
      chunks: chunks.length
    };
  } finally {
    lock.releaseLock();
  }
}

function getStoreSheet_() {
  const properties = PropertiesService.getScriptProperties();
  let spreadsheetId = properties.getProperty('VOLLEYBALL_SPREADSHEET_ID');
  let spreadsheet = null;

  if (spreadsheetId) {
    try {
      spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    } catch (error) {
      spreadsheetId = '';
    }
  }

  if (!spreadsheetId) {
    spreadsheet = SpreadsheetApp.create('Volleyball Tracker Data');
    spreadsheetId = spreadsheet.getId();
    properties.setProperty('VOLLEYBALL_SPREADSHEET_ID', spreadsheetId);
  }

  let sheet = spreadsheet.getSheetByName(STORE_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(STORE_SHEET_NAME);
  }

  return sheet;
}

function createApiOutput_(payload, callback) {
  const callbackName = String(callback || '');

  if (callbackName && isValidCallbackName_(callbackName)) {
    return ContentService
      .createTextOutput(callbackName + '(' + JSON.stringify(payload) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return createJsonOutput_(payload);
}

function createJsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function isValidCallbackName_(value) {
  return /^[A-Za-z_$][0-9A-Za-z_$]*(?:\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(value);
}
