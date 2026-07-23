const { DEFAULT_CATEGORY } = require('../../utils/categories.js');

const STORAGE_KEYS = {
  MEMOS: 'memoCalendarMemos',
  CUSTOM_CATEGORIES: 'memoCustomCategories',
  LANGUAGE: 'memoCalendarLanguage'
};
const STORAGE_ROLLBACK_ERROR_CODE = 'STORAGE_ROLLBACK_FAILED';

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
  STORAGE_ROLLBACK_ERROR_CODE,
  DEFAULT_FORM
};
