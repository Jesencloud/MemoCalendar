const test = require('node:test');
const assert = require('node:assert');
const { getTranslations } = require('../utils/i18n.js');

test('getTranslations returns the requested language', () => {
  assert.strictEqual(getTranslations('zh').today, '今天');
  assert.strictEqual(getTranslations('en').today, 'Today');
});

test('getTranslations falls back to Chinese for unknown languages', () => {
  assert.deepStrictEqual(getTranslations('unknown'), getTranslations('zh'));
});

test('translated dictionaries contain every Chinese fallback key', () => {
  const zh = getTranslations('zh');
  const en = getTranslations('en');
  Object.keys(zh).forEach(key => {
    assert.ok(Object.prototype.hasOwnProperty.call(en, key), `missing translation key: ${key}`);
  });
});
