const test = require('node:test');
const assert = require('node:assert');
const {
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORY,
  CATEGORY_PALETTE,
  mergeCategories,
  findCategoryByKey,
  findCategoryByName,
  resolveCategory,
  getNextCategoryColor,
  createCustomCategory
} = require('../utils/categories.js');

test('DEFAULT_CATEGORIES contains 15 entries', () => {
  assert.strictEqual(DEFAULT_CATEGORIES.length, 15);
});

test('DEFAULT_CATEGORY is the first entry', () => {
  assert.strictEqual(DEFAULT_CATEGORY.key, 'Sport');
  assert.strictEqual(DEFAULT_CATEGORY.labelCn, '运动');
});

test('CATEGORY_PALETTE contains 13 colors', () => {
  assert.strictEqual(CATEGORY_PALETTE.length, 13);
});

test('mergeCategories appends custom categories after defaults', () => {
  const custom = [
    { key: 'custom-1', labelCn: '自定义', labelEn: 'Custom', color: '#ff0000' }
  ];
  const result = mergeCategories(custom);
  assert.strictEqual(result.length, DEFAULT_CATEGORIES.length + 1);
  assert.strictEqual(result[DEFAULT_CATEGORIES.length].key, 'custom-1');
});

test('mergeCategories handles empty and invalid input', () => {
  assert.strictEqual(mergeCategories().length, DEFAULT_CATEGORIES.length);
  assert.strictEqual(mergeCategories(null).length, DEFAULT_CATEGORIES.length);
  assert.strictEqual(mergeCategories('invalid').length, DEFAULT_CATEGORIES.length);
});

test('findCategoryByKey returns matching category', () => {
  const result = findCategoryByKey(DEFAULT_CATEGORIES, 'Travel');
  assert.ok(result);
  assert.strictEqual(result.labelCn, '旅行');
});

test('findCategoryByKey returns null for missing key', () => {
  const result = findCategoryByKey(DEFAULT_CATEGORIES, 'NonExistent');
  assert.strictEqual(result, null);
});

test('findCategoryByKey returns null for invalid input', () => {
  assert.strictEqual(findCategoryByKey(null, 'key'), null);
  assert.strictEqual(findCategoryByKey('invalid', 'key'), null);
});

test('findCategoryByName matches by labelCn', () => {
  const result = findCategoryByName(DEFAULT_CATEGORIES, '运动');
  assert.ok(result);
  assert.strictEqual(result.key, 'Sport');
});

test('findCategoryByName matches by labelEn case-insensitive', () => {
  const result = findCategoryByName(DEFAULT_CATEGORIES, 'TRAVEL');
  assert.ok(result);
  assert.strictEqual(result.key, 'Travel');
});

test('findCategoryByName returns null for missing name', () => {
  const result = findCategoryByName(DEFAULT_CATEGORIES, '不存在');
  assert.strictEqual(result, null);
});

test('findCategoryByName returns null for invalid input', () => {
  assert.strictEqual(findCategoryByName(null, 'name'), null);
  assert.strictEqual(findCategoryByName(DEFAULT_CATEGORIES, null), null);
  assert.strictEqual(findCategoryByName(DEFAULT_CATEGORIES, ''), null);
  assert.strictEqual(findCategoryByName(DEFAULT_CATEGORIES, '   '), null);
});

test('resolveCategory returns matched category', () => {
  const result = resolveCategory(DEFAULT_CATEGORIES, 'Food');
  assert.strictEqual(result.key, 'Food');
});

test('resolveCategory falls back to DEFAULT_CATEGORY', () => {
  const result = resolveCategory(DEFAULT_CATEGORIES, 'NonExistent');
  assert.strictEqual(result.key, DEFAULT_CATEGORY.key);
});

test('getNextCategoryColor cycles through palette', () => {
  const color0 = getNextCategoryColor([]);
  const color1 = getNextCategoryColor([1]);
  const color13 = getNextCategoryColor(new Array(13));
  assert.strictEqual(color0, CATEGORY_PALETTE[0]);
  assert.strictEqual(color1, CATEGORY_PALETTE[1]);
  assert.strictEqual(color13, CATEGORY_PALETTE[0]);
});

test('createCustomCategory builds correct structure', () => {
  const result = createCustomCategory('custom-123', '测试', '#ff0000');
  assert.deepStrictEqual(result, {
    key: 'custom-123',
    labelCn: '测试',
    labelEn: '测试',
    color: '#ff0000',
    icon: '🏷️',
    isCustom: true
  });
});
