const test = require('node:test');
const assert = require('node:assert');
const {
  formatDate,
  parseDate,
  isValidDateString,
  createWeekDays
} = require('../utils/date.js');

test('formatDate formats a local Date as YYYY-MM-DD', () => {
  assert.strictEqual(formatDate(new Date(2026, 6, 9)), '2026-07-09');
});

test('parseDate returns zero-based month parts', () => {
  assert.deepStrictEqual(parseDate('2026-07-09'), {
    year: 2026,
    month: 6,
    day: 9
  });
});

test('isValidDateString rejects malformed and impossible dates', () => {
  assert.strictEqual(isValidDateString('2026-7-9'), false);
  assert.strictEqual(isValidDateString('2025-02-29'), false);
  assert.strictEqual(isValidDateString('2024-02-29'), true);
});

test('createWeekDays returns a Monday-first week across month boundaries', () => {
  const days = createWeekDays('2026-08-01');

  assert.strictEqual(days.length, 7);
  assert.strictEqual(days[0].date, '2026-07-27');
  assert.strictEqual(days[6].date, '2026-08-02');
  assert.strictEqual(days.filter(day => day.selected).length, 1);
  assert.strictEqual(days.find(day => day.selected).date, '2026-08-01');
});
