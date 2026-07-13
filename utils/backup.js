const { DEFAULT_CATEGORY } = require('./categories.js');
const { cleanMemoDatesUIFields } = require('./memos.js');

const BACKUP_APP = 'MemoCalendar';
const DEFAULT_COLOR = '#fa8231';

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function normalizeImportedCategories(categories, palette = []) {
  if (categories === undefined || categories === null) return [];
  if (!Array.isArray(categories)) return null;

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
    normalized.push({
      key,
      labelCn: labelCn.slice(0, 10),
      labelEn: labelEn.slice(0, 10),
      color,
      icon: typeof item.icon === 'string' && item.icon ? item.icon : '🏷️',
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
  for (let i = 0; i < dates.length; i += 1) {
    const date = dates[i];
    const dayMemos = memos[date];
    if (!isValidDateString(date) || !Array.isArray(dayMemos)) return null;

    const normalizedDayMemos = [];
    for (let j = 0; j < dayMemos.length; j += 1) {
      const memo = normalizeImportedMemo(dayMemos[j], categoryMap, fallbackCategory);
      if (!memo) return null;
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
  if (!id || !title) return null;

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

function parseBackupData(text, options = {}) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return null;
  }

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

function mergeImportedData(importedData, localMemos = {}, localCategories = [], options = {}) {
  const finalMemos = cleanMemoDatesUIFields(localMemos);
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
  parseBackupData,
  mergeImportedData,
  normalizeImportedCategories,
  normalizeImportedMemoDates,
  normalizeImportedMemo
};
