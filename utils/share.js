const { parseBackupData } = require('./backup.js');
const { encodeJsonPayload, decodeJsonPayload } = require('./encoding.js');

const SHARE_APP = 'MemoCalendar';
const SHARE_TYPE = 'memo-share';
const MAX_SHARE_PATH_LENGTH = 2048;
const MEMO_CONTENT_FIELDS = ['title', 'time', 'location', 'notes', 'tag', 'color', 'completed'];

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function normalizeShareText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeShareTime(value) {
  if (typeof value !== 'string') return '';
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
}

function createSharedMemoPayload(date, memo, category, options = {}) {
  if (typeof date !== 'string' || !isPlainObject(memo)) return '';
  const includeNotes = options.includeNotes !== false;

  const payload = {
    a: SHARE_APP,
    v: 1,
    t: SHARE_TYPE,
    d: date,
    m: {
      i: normalizeShareText(memo.id, 80),
      ti: normalizeShareText(memo.title, 40),
      tm: normalizeShareTime(memo.time),
      l: normalizeShareText(memo.location, 100),
      n: includeNotes ? normalizeShareText(memo.notes, 200) : '',
      g: normalizeShareText(memo.tag, 80),
      c: normalizeShareText(memo.color, 7),
      done: memo.completed === true ? 1 : 0
    }
  };

  if (category && category.isCustom) {
    payload.c = {
      k: normalizeShareText(category.key, 80),
      cn: normalizeShareText(category.labelCn, 10),
      en: normalizeShareText(category.labelEn, 10),
      c: normalizeShareText(category.color, 7),
      i: normalizeShareText(category.icon, 8)
    };
  }

  return encodeJsonPayload(payload);
}

function expandSharedMemoData(data) {
  if (!isPlainObject(data) || data.a !== SHARE_APP || data.t !== SHARE_TYPE) return null;
  if (typeof data.d !== 'string' || !isPlainObject(data.m)) return null;

  const memo = data.m;
  const backupData = {
    app: SHARE_APP,
    version: 1,
    type: SHARE_TYPE,
    memos: {
      [data.d]: [{
        id: memo.i,
        title: memo.ti,
        time: memo.tm,
        location: memo.l,
        notes: memo.n,
        tag: memo.g,
        color: memo.c,
        completed: memo.done === 1 || memo.done === true
      }]
    },
    categories: []
  };

  if (isPlainObject(data.c)) {
    backupData.categories.push({
      key: data.c.k,
      labelCn: data.c.cn,
      labelEn: data.c.en,
      color: data.c.c,
      icon: data.c.i
    });
  }

  return backupData;
}

function parseSharedMemoPayload(text, options = {}) {
  const compactData = decodeJsonPayload(text);
  if (!compactData) return null;
  const backupData = expandSharedMemoData(compactData);
  if (!backupData) return null;

  const importedData = parseBackupData(JSON.stringify(backupData), options);
  if (!importedData) return null;

  const dates = Object.keys(importedData.memos);
  if (dates.length !== 1) return null;

  const date = dates[0];
  const dayMemos = importedData.memos[date];
  if (!Array.isArray(dayMemos) || dayMemos.length !== 1) return null;

  return {
    date,
    memo: dayMemos[0],
    categories: importedData.categories,
    importedData
  };
}

function cloneImportedData(importedData) {
  const memos = {};
  Object.keys(importedData.memos || {}).forEach(date => {
    const dayMemos = importedData.memos[date];
    memos[date] = Array.isArray(dayMemos)
      ? dayMemos.map(item => Object.assign({}, item))
      : dayMemos;
  });

  return {
    memos,
    categories: Array.isArray(importedData.categories)
      ? importedData.categories.map(item => Object.assign({}, item))
      : []
  };
}

function createSharedMemoImportForSave(sharedMemoImport) {
  if (!sharedMemoImport || !isPlainObject(sharedMemoImport.importedData)) return null;

  const importedData = cloneImportedData(sharedMemoImport.importedData);
  const dayMemos = importedData.memos[sharedMemoImport.date];
  if (!Array.isArray(dayMemos) || dayMemos.length !== 1) return null;
  return importedData;
}

function getSharedMemoSaveState(sharedMemoImport, localMemos = {}) {
  if (!sharedMemoImport || !isPlainObject(sharedMemoImport.memo)) return null;

  const { date, memo } = sharedMemoImport;
  if (typeof date !== 'string' || typeof memo.id !== 'string' || !memo.id) return null;

  const dates = Object.keys(localMemos || {});
  for (let i = 0; i < dates.length; i += 1) {
    const existingDate = dates[i];
    const dayMemos = localMemos[existingDate];
    if (!Array.isArray(dayMemos)) continue;

    const existingMemo = dayMemos.find(item => item && item.id === memo.id);
    if (!existingMemo) continue;

    const contentMatches = MEMO_CONTENT_FIELDS.every(field => {
      return existingMemo[field] === memo[field];
    });
    return {
      status: existingDate === date && contentMatches ? 'unchanged' : 'changed'
    };
  }

  return { status: 'new' };
}

function removeMemoByIdFromDates(memoDates = {}, id) {
  const nextMemoDates = Object.assign({}, memoDates);
  if (!id) return nextMemoDates;

  Object.keys(nextMemoDates).forEach(date => {
    const dayMemos = nextMemoDates[date];
    if (!Array.isArray(dayMemos)) return;

    const filteredMemos = dayMemos.filter(item => !item || item.id !== id);
    if (filteredMemos.length === 0) {
      delete nextMemoDates[date];
    } else if (filteredMemos.length !== dayMemos.length) {
      nextMemoDates[date] = filteredMemos;
    }
  });

  return nextMemoDates;
}

module.exports = {
  MAX_SHARE_PATH_LENGTH,
  createSharedMemoPayload,
  parseSharedMemoPayload,
  createSharedMemoImportForSave,
  getSharedMemoSaveState,
  removeMemoByIdFromDates
};
