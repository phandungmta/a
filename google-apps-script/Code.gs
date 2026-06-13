const SHEET_NAMES = {
  meta: 'Meta',
  players: 'Players',
  sets: 'Sets',
  payments: 'Payments'
};

const SHEET_HEADERS = {
  meta: ['key', 'value'],
  players: ['id', 'name', 'source', 'active'],
  sets: ['id', 'date', 'loserIdsJson', 'stake', 'note', 'createdAt', 'updatedAt', 'editCount', 'editHistoryJson'],
  payments: ['id', 'playerId', 'amount', 'note', 'paidAt', 'createdAt']
};

const ALLOWED_PARENT_ORIGINS = [
  'https://a-ten-mauve.vercel.app'
];

function doGet() {
  const template = HtmlService.createTemplateFromFile('Bridge');
  template.allowedOriginsJson = JSON.stringify(ALLOWED_PARENT_ORIGINS);

  return template.evaluate()
    .setTitle('Volleyball Tracker Bridge')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function ping() {
  return {
    ok: true,
    serverTime: new Date().toISOString()
  };
}

function getState() {
  return withDocumentLock_(function () {
    const sheets = ensureSheets_();
    const state = readState_(sheets);

    return {
      state: state,
      meta: buildMeta_(state)
    };
  });
}

function saveState(payload) {
  return withDocumentLock_(function () {
    const sheets = ensureSheets_();
    const state = normalizeIncomingState_(payload && payload.state);

    writeState_(sheets, state);

    return {
      state: readState_(sheets),
      meta: buildMeta_(state)
    };
  });
}

function withDocumentLock_(callback) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function ensureSheets_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const result = {};

  Object.keys(SHEET_NAMES).forEach(function (key) {
    const name = SHEET_NAMES[key];
    const headers = SHEET_HEADERS[key];
    let sheet = spreadsheet.getSheetByName(name);

    if (!sheet) {
      sheet = spreadsheet.insertSheet(name);
    }

    ensureHeaderRow_(sheet, headers);
    result[key] = sheet;
  });

  return result;
}

function ensureHeaderRow_(sheet, headers) {
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  const existing = headerRange.getValues()[0];
  const needsHeader = headers.some(function (header, index) {
    return existing[index] !== header;
  });

  if (needsHeader) {
    headerRange.setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function normalizeIncomingState_(raw) {
  const state = raw && typeof raw === 'object' ? raw : {};

  return {
    players: Array.isArray(state.players) ? state.players.map(normalizePlayer_).filter(function (player) {
      return player.name;
    }) : [],
    sets: Array.isArray(state.sets) ? state.sets.map(normalizeSet_) : [],
    payments: Array.isArray(state.payments) ? state.payments.map(normalizePayment_) : [],
    playersCsvLoadedAt: state.playersCsvLoadedAt ? String(state.playersCsvLoadedAt) : ''
  };
}

function normalizePlayer_(item) {
  return {
    id: item && item.id ? String(item.id) : createId_(),
    name: normalizePlayerName_(item && item.name),
    source: item && item.source ? String(item.source) : '',
    active: item && item.active === false ? false : true
  };
}

function normalizeSet_(item) {
  return {
    id: item && item.id ? String(item.id) : createId_(),
    date: isDateInput_(item && item.date) ? String(item.date) : todayISO_(),
    loserIds: Array.isArray(item && item.loserIds) ? item.loserIds.filter(Boolean).map(String) : [],
    stake: Number(item && item.stake || 0),
    note: item && item.note ? String(item.note) : '',
    createdAt: item && item.createdAt ? String(item.createdAt) : new Date().toISOString(),
    updatedAt: item && item.updatedAt ? String(item.updatedAt) : '',
    editCount: Number(item && item.editCount || 0),
    editHistory: Array.isArray(item && item.editHistory) ? item.editHistory.filter(Boolean).map(String) : []
  };
}

function normalizePayment_(item) {
  return {
    id: item && item.id ? String(item.id) : createId_(),
    playerId: item && item.playerId ? String(item.playerId) : '',
    amount: Number(item && item.amount || 0),
    note: item && item.note ? String(item.note) : '',
    paidAt: item && (item.paidAt || item.createdAt) ? String(item.paidAt || item.createdAt) : new Date().toISOString(),
    createdAt: item && (item.createdAt || item.paidAt) ? String(item.createdAt || item.paidAt) : new Date().toISOString()
  };
}

function writeState_(sheets, state) {
  writeSheetRows_(sheets.meta, SHEET_HEADERS.meta, [
    ['schemaVersion', '2'],
    ['updatedAt', new Date().toISOString()],
    ['playersCsvLoadedAt', state.playersCsvLoadedAt || '']
  ]);

  writeSheetRows_(sheets.players, SHEET_HEADERS.players, state.players.map(function (player) {
    return [
      player.id,
      player.name,
      player.source,
      String(player.active)
    ];
  }));

  writeSheetRows_(sheets.sets, SHEET_HEADERS.sets, state.sets.map(function (item) {
    return [
      item.id,
      item.date,
      JSON.stringify(item.loserIds || []),
      Number(item.stake || 0),
      item.note || '',
      item.createdAt || '',
      item.updatedAt || '',
      Number(item.editCount || 0),
      JSON.stringify(item.editHistory || [])
    ];
  }));

  writeSheetRows_(sheets.payments, SHEET_HEADERS.payments, state.payments.map(function (payment) {
    return [
      payment.id,
      payment.playerId,
      Number(payment.amount || 0),
      payment.note || '',
      payment.paidAt || '',
      payment.createdAt || ''
    ];
  }));
}

function writeSheetRows_(sheet, headers, rows) {
  sheet.clearContents();
  ensureHeaderRow_(sheet, headers);

  if (!rows.length) return;

  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function readState_(sheets) {
  const meta = readKeyValueSheet_(sheets.meta);

  return {
    players: readDataRows_(sheets.players).map(function (row) {
      return normalizePlayer_({
        id: row[0],
        name: row[1],
        source: row[2],
        active: String(row[3]).toLowerCase() !== 'false'
      });
    }),
    sets: readDataRows_(sheets.sets).map(function (row) {
      return normalizeSet_({
        id: row[0],
        date: row[1],
        loserIds: parseJsonArray_(row[2]),
        stake: row[3],
        note: row[4],
        createdAt: row[5],
        updatedAt: row[6],
        editCount: row[7],
        editHistory: parseJsonArray_(row[8])
      });
    }),
    payments: readDataRows_(sheets.payments).map(function (row) {
      return normalizePayment_({
        id: row[0],
        playerId: row[1],
        amount: row[2],
        note: row[3],
        paidAt: row[4],
        createdAt: row[5]
      });
    }),
    playersCsvLoadedAt: meta.playersCsvLoadedAt || ''
  };
}

function readKeyValueSheet_(sheet) {
  const values = readDataRows_(sheet);
  const result = {};

  values.forEach(function (row) {
    if (!row[0]) return;
    result[String(row[0])] = row[1] != null ? String(row[1]) : '';
  });

  return result;
}

function readDataRows_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow <= 1 || lastColumn <= 0) return [];

  return sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues().filter(function (row) {
    return row.some(function (cell) {
      return cell !== '' && cell != null;
    });
  });
}

function parseJsonArray_(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function buildMeta_(state) {
  return {
    schemaVersion: 2,
    updatedAt: new Date().toISOString(),
    playerCount: state.players.length,
    setCount: state.sets.length,
    paymentCount: state.payments.length
  };
}

function normalizePlayerName_(value) {
  return String(value || '').replace(/^\uFEFF/, '').trim().replace(/\s+/g, ' ');
}

function isDateInput_(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function todayISO_() {
  const now = new Date();
  return Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function createId_() {
  return Utilities.getUuid();
}
