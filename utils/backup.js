const { DEFAULT_CATEGORY } = require('./categories.js');
const { cleanMemoDatesUIFields } = require('./memos.js');

const BACKUP_APP = 'MemoCalendar';
const DEFAULT_COLOR = '#fa8231';
const MAX_BACKUP_TEXT_LENGTH = 2 * 1024 * 1024;
const MAX_IMPORTED_CATEGORIES = 200;
const MAX_IMPORTED_DATES = 3660;
const MAX_IMPORTED_MEMOS = 10000;
const MAX_MEMOS_PER_DATE = 500;
const MAX_MEMO_ID_LENGTH = 80;
const MAX_CATEGORY_ICON_LENGTH = 8;

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function truncateCodePoints(value, maxLength) {
  let result = '';
  let count = 0;
  for (const character of value) {
    if (count >= maxLength) break;
    result += character;
    count += 1;
  }
  return result;
}

function normalizeImportedCategories(categories, palette = []) {
  if (categories === undefined || categories === null) return [];
  if (!Array.isArray(categories) || categories.length > MAX_IMPORTED_CATEGORIES) return null;

  const normalized = [];
  const seenKeys = {};
  categories.forEach(item => {
    if (!isPlainObject(item)) return;

    const key = typeof item.key === 'string' ? item.key.trim() : '';
    const labelCn = typeof item.labelCn === 'string' ? item.labelCn.trim() : '';
    const labelEn = typeof item.labelEn === 'string' ? item.labelEn.trim() : '';
    if (!/^custom-[\w-]{1,64}$/.test(key) || !labelCn || !labelEn || seenKeys[key]) return;

    const fallbackColor = palette.length > 0
      ? palette[normalized.length % palette.length]
      : DEFAULT_COLOR;
    const color = /^#[0-9a-fA-F]{6}$/.test(item.color) ? item.color : fallbackColor;
    const icon = typeof item.icon === 'string' && item.icon
      ? truncateCodePoints(item.icon, MAX_CATEGORY_ICON_LENGTH)
      : '🏷️';
    normalized.push({
      key,
      labelCn: labelCn.slice(0, 10),
      labelEn: labelEn.slice(0, 10),
      color,
      icon,
      isCustom: true
    });
    seenKeys[key] = true;
  });

  return normalized;
}

function normalizeImportedMemoDates(memos, options = {}) {
  if (!isPlainObject(memos)) return null;

  const {
    defaultCategories = [],
    importedCategories = [],
    isValidDateString = () => true
  } = options;
  const fallbackCategory = defaultCategories[0] || DEFAULT_CATEGORY;
  const categoryMap = {};
  [...defaultCategories, ...importedCategories].forEach(category => {
    categoryMap[category.key] = category;
  });

  const normalized = {};
  const dates = Object.keys(memos);
  if (dates.length > MAX_IMPORTED_DATES) return null;

  const seenMemoIds = new Set();
  let totalMemoCount = 0;
  for (let i = 0; i < dates.length; i += 1) {
    const date = dates[i];
    const dayMemos = memos[date];
    if (!isValidDateString(date) || !Array.isArray(dayMemos)) return null;
    if (dayMemos.length > MAX_MEMOS_PER_DATE) return null;

    totalMemoCount += dayMemos.length;
    if (totalMemoCount > MAX_IMPORTED_MEMOS) return null;

    const normalizedDayMemos = [];
    for (let j = 0; j < dayMemos.length; j += 1) {
      const memo = normalizeImportedMemo(dayMemos[j], categoryMap, fallbackCategory);
      if (!memo || seenMemoIds.has(memo.id)) return null;
      seenMemoIds.add(memo.id);
      normalizedDayMemos.push(memo);
    }

    if (normalizedDayMemos.length > 0) {
      normalized[date] = normalizedDayMemos;
    }
  }

  return normalized;
}

function normalizeImportedTime(time) {
  if (typeof time !== 'string') return '';
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
}

function normalizeImportedMemo(item, categoryMap, fallbackCategory) {
  if (!isPlainObject(item)) return null;

  const id = typeof item.id === 'string' ? item.id.trim() : '';
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  if (!id || id.length > MAX_MEMO_ID_LENGTH || !title) return null;

  const importedTag = typeof item.tag === 'string' && item.tag ? item.tag : fallbackCategory.key;
  const category = categoryMap[importedTag] || fallbackCategory;
  const tag = categoryMap[importedTag] ? importedTag : category.key;
  const color = /^#[0-9a-fA-F]{6}$/.test(item.color) ? item.color : category.color;

  return {
    id,
    title: title.slice(0, 40),
    time: normalizeImportedTime(item.time),
    location: typeof item.location === 'string' ? item.location.trim().slice(0, 100) : '',
    tag,
    color,
    notes: typeof item.notes === 'string' ? item.notes.trim().slice(0, 200) : '',
    tagCn: typeof category.labelCn === 'string' ? category.labelCn : '',
    tagEn: typeof category.labelEn === 'string' ? category.labelEn : '',
    categoryIcon: typeof category.icon === 'string' ? category.icon : '',
    completed: item.completed === true
  };
}

function normalizeBackupObject(data, options = {}) {
  if (!isPlainObject(data) || data.app !== BACKUP_APP) return null;

  const importedCategories = normalizeImportedCategories(data.categories, options.palette);
  if (!importedCategories) return null;

  const importedMemos = normalizeImportedMemoDates(data.memos, {
    defaultCategories: options.defaultCategories,
    importedCategories,
    isValidDateString: options.isValidDateString
  });
  if (!importedMemos) return null;

  return {
    memos: importedMemos,
    categories: importedCategories
  };
}

function parseBackupData(text, options = {}) {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_TEXT_LENGTH) return null;

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return null;
  }
  return normalizeBackupObject(data, options);
}

function mergeImportedData(importedData, localMemos = {}, localCategories = [], options = {}) {
  const finalMemos = Object.assign({}, cleanMemoDatesUIFields(localMemos));
  Object.keys(importedData.memos).forEach(date => {
    if (!Array.isArray(finalMemos[date])) {
      finalMemos[date] = importedData.memos[date];
      return;
    }

    const localDayMemos = [...finalMemos[date]];
    importedData.memos[date].forEach(importedItem => {
      const index = localDayMemos.findIndex(m => m.id === importedItem.id);
      if (index !== -1) {
        localDayMemos[index] = importedItem;
      } else {
        localDayMemos.push(importedItem);
      }
    });
    finalMemos[date] = localDayMemos;
  });

  const finalCategories = normalizeImportedCategories(localCategories, options.palette) || [];
  importedData.categories.forEach(importedCat => {
    const exists = finalCategories.some(c => c.key === importedCat.key);
    if (!exists) {
      finalCategories.push(importedCat);
    }
  });

  return {
    memos: finalMemos,
    categories: finalCategories
  };
}

module.exports = {
  MAX_BACKUP_TEXT_LENGTH,
  MAX_IMPORTED_CATEGORIES,
  MAX_IMPORTED_DATES,
  MAX_IMPORTED_MEMOS,
  MAX_MEMOS_PER_DATE,
  MAX_MEMO_ID_LENGTH,
  MAX_CATEGORY_ICON_LENGTH,
  isPlainObject,
  normalizeImportedTime,
  parseBackupData,
  normalizeBackupObject,
  mergeImportedData,
  normalizeImportedCategories,
  normalizeImportedMemoDates,
  normalizeImportedMemo
};
