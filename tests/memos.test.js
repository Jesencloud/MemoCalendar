const test = require('node:test');
const assert = require('node:assert');
const {
  cleanMemosUIFields,
  cleanMemoDatesUIFields
} = require('../utils/memos.js');

test('cleanMemosUIFields removes legacy UI state without mutating source', () => {
  const source = [
    { id: 'memo-1', title: 'One', isSwiped: true },
    { id: 'memo-2', title: 'Two' }
  ];

  const cleaned = cleanMemosUIFields(source);

  assert.strictEqual(Object.hasOwn(cleaned[0], 'isSwiped'), false);
  assert.strictEqual(source[0].isSwiped, true);
  assert.notStrictEqual(cleaned[0], source[0]);
});

test('cleanMemosUIFields returns an empty list for non-array input', () => {
  assert.deepStrictEqual(cleanMemosUIFields(null), []);
  assert.deepStrictEqual(cleanMemosUIFields({}), []);
});

test('cleanMemoDatesUIFields cleans each memo list without mutating source', () => {
  const source = {
    '2026-07-13': [{ id: 'memo-1', isSwiped: true }],
    metadata: { preserved: true }
  };

  const cleaned = cleanMemoDatesUIFields(source);

  assert.strictEqual(Object.hasOwn(cleaned['2026-07-13'][0], 'isSwiped'), false);
  assert.strictEqual(source['2026-07-13'][0].isSwiped, true);
  assert.deepStrictEqual(cleaned.metadata, { preserved: true });
});
