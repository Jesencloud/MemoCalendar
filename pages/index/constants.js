const { DEFAULT_CATEGORY } = require('../../utils/categories.js');

const STORAGE_KEYS = {
  MEMOS: 'memoCalendarMemos',
  CUSTOM_CATEGORIES: 'memoCustomCategories'
};

const DEFAULT_FORM = {
  id: '',
  title: '',
  time: '',
  location: '',
  tag: DEFAULT_CATEGORY.key,
  color: DEFAULT_CATEGORY.color,
  notes: '',
  completed: false
};

module.exports = {
  STORAGE_KEYS,
  DEFAULT_FORM,
  DEFAULT_CATEGORY
};
