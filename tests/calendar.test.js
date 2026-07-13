const test = require('node:test');
const assert = require('node:assert');

let componentDefinition;
const originalComponent = global.Component;
try {
  global.Component = definition => {
    componentDefinition = definition;
  };
  require('../components/calendar/calendar.js');
} finally {
  global.Component = originalComponent;
}

function createComponent() {
  const comp = {};
  comp.data = JSON.parse(JSON.stringify(componentDefinition.data));
  comp.properties = JSON.parse(JSON.stringify(componentDefinition.properties || {}));
  comp.properties.lang = 'zh';
  comp.properties.selectedDate = '';
  comp.properties.memoDateMeta = {};
  comp.setDataCalls = [];
  comp.setData = function(update, callback) {
    this.setDataCalls.push(update);
    const keys = Object.keys(update);
    for (let i = 0; i < keys.length; i += 1) {
      this.data[keys[i]] = update[keys[i]];
    }
    if (callback) callback();
  };
  comp.vibrate = () => {};
  comp.triggerEvent = () => {};
  comp.calendarSwipeAnimating = false;

  const methods = componentDefinition.methods || {};
  Object.keys(methods).forEach(key => {
    comp[key] = methods[key].bind(comp);
  });

  return comp;
}

// ========== createMonthDays ==========

test('createMonthDays: January 2026 starts on Thursday (3 empty days before)', () => {
  const comp = createComponent();
  comp.data.memoDateMeta = {};
  const days = comp.createMonthDays(2026, 0, '2026-01-15');

  assert.strictEqual(days[0].day, '');
  assert.strictEqual(days[1].day, '');
  assert.strictEqual(days[2].day, '');
  assert.strictEqual(days[3].day, 1);
  assert.strictEqual(days.length, 31 + 3);
});

test('createMonthDays: February 2028 (leap year) has 29 days', () => {
  const comp = createComponent();
  comp.data.memoDateMeta = {};
  const days = comp.createMonthDays(2028, 1, '2028-02-15');

  const actualDays = days.filter(d => d.day !== '');
  assert.strictEqual(actualDays.length, 29);
});

test('createMonthDays: February 2026 (non-leap year) has 28 days', () => {
  const comp = createComponent();
  comp.data.memoDateMeta = {};
  const days = comp.createMonthDays(2026, 1, '2026-02-15');

  const actualDays = days.filter(d => d.day !== '');
  assert.strictEqual(actualDays.length, 28);
});

test('createMonthDays: marks today correctly', () => {
  const comp = createComponent();
  comp.data.memoDateMeta = {};
  const days = comp.createMonthDays(2026, 6, '2026-07-15');

  const today = days.find(d => d.fullDate === '2026-07-15');
  assert.ok(today);
  assert.strictEqual(today.isPast, false);
});

test('createMonthDays: marks past dates correctly', () => {
  const comp = createComponent();
  comp.data.memoDateMeta = {};
  const days = comp.createMonthDays(2026, 6, '2026-07-20');

  const pastDay = days.find(d => d.fullDate === '2026-07-10');
  assert.ok(pastDay);
  assert.strictEqual(pastDay.isPast, true);
});

test('createMonthDays: includes memo colors from memoDateMeta', () => {
  const comp = createComponent();
  comp.data.memoDateMeta = {
    '2026-07-15': { hasMemo: true, memoColors: ['#ff0000', '#00ff00'] }
  };
  const days = comp.createMonthDays(2026, 6, '2026-07-20');

  const memoDay = days.find(d => d.fullDate === '2026-07-15');
  assert.ok(memoDay);
  assert.strictEqual(memoDay.hasMemo, true);
  assert.deepStrictEqual(memoDay.memoColors, ['#ff0000', '#00ff00']);
});

test('createMonthDays: days without memo have hasMemo=false', () => {
  const comp = createComponent();
  comp.data.memoDateMeta = {};
  const days = comp.createMonthDays(2026, 6, '2026-07-20');

  const noMemoDay = days.find(d => d.fullDate === '2026-07-01');
  assert.ok(noMemoDay);
  assert.strictEqual(noMemoDay.hasMemo, false);
  assert.deepStrictEqual(noMemoDay.memoColors, []);
});

// ========== createWeekDays ==========

test('createWeekDays: returns 7 days starting from Monday of the week', () => {
  const comp = createComponent();
  comp.data.memoDateMeta = {};
  const days = comp.createWeekDays('2026-07-09', '2026-07-20');

  assert.strictEqual(days.length, 7);
  assert.strictEqual(days[0].fullDate, '2026-07-06');
  assert.strictEqual(days[6].fullDate, '2026-07-12');
});

test('createWeekDays: handles week containing month boundary', () => {
  const comp = createComponent();
  comp.data.memoDateMeta = {};
  const days = comp.createWeekDays('2026-07-01', '2026-07-20');

  assert.strictEqual(days.length, 7);
  assert.strictEqual(days[0].fullDate, '2026-06-29');
});

test('createWeekDays: returns empty array for invalid date', () => {
  const comp = createComponent();
  comp.data.memoDateMeta = {};
  const days = comp.createWeekDays('invalid-date', '2026-07-20');

  assert.deepStrictEqual(days, []);
});

// ========== createDayItem ==========

test('createDayItem: returns correct structure', () => {
  const comp = createComponent();
  comp.data.memoDateMeta = {};
  const item = comp.createDayItem(new Date(2026, 6, 15), '2026-07-20', {});

  assert.strictEqual(item.day, 15);
  assert.strictEqual(item.fullDate, '2026-07-15');
  assert.strictEqual(item.dateKey, '2026-07-15');
  assert.strictEqual(item.isPast, true);
  assert.strictEqual(item.hasMemo, false);
  assert.deepStrictEqual(item.memoColors, []);
});

test('createDayItem: returns holidayInfo for Chinese holiday', () => {
  const comp = createComponent();
  comp.data.memoDateMeta = {};
  const item = comp.createDayItem(new Date(2026, 0, 1), '2026-07-20', {});

  assert.ok(item.holidayInfo);
  assert.strictEqual(item.holidayInfo.type, 'holiday');
  assert.strictEqual(item.holidayInfo.name, '元旦');
});

test('createDayItem: returns null holidayInfo for non-holiday', () => {
  const comp = createComponent();
  comp.data.memoDateMeta = {};
  const item = comp.createDayItem(new Date(2026, 6, 15), '2026-07-20', {});

  assert.strictEqual(item.holidayInfo, null);
});

// ========== getShiftedMonth ==========

test('getShiftedMonth: forward shift crosses year boundary', () => {
  const comp = createComponent();
  const result = comp.getShiftedMonth(2026, 11, 1);

  assert.strictEqual(result.year, 2027);
  assert.strictEqual(result.month, 0);
});

test('getShiftedMonth: backward shift crosses year boundary', () => {
  const comp = createComponent();
  const result = comp.getShiftedMonth(2026, 0, -1);

  assert.strictEqual(result.year, 2025);
  assert.strictEqual(result.month, 11);
});

test('getShiftedMonth: no shift returns same month', () => {
  const comp = createComponent();
  const result = comp.getShiftedMonth(2026, 5, 0);

  assert.strictEqual(result.year, 2026);
  assert.strictEqual(result.month, 5);
});

// ========== getShiftedWeekDate ==========

test('getShiftedWeekDate: forward shift by 1 week', () => {
  const comp = createComponent();
  const result = comp.getShiftedWeekDate('2026-07-09', 1);

  assert.strictEqual(result, '2026-07-16');
});

test('getShiftedWeekDate: backward shift by 1 week', () => {
  const comp = createComponent();
  const result = comp.getShiftedWeekDate('2026-07-09', -1);

  assert.strictEqual(result, '2026-07-02');
});

test('getShiftedWeekDate: returns original for invalid date', () => {
  const comp = createComponent();
  const result = comp.getShiftedWeekDate('invalid', 1);

  assert.strictEqual(result, 'invalid');
});

// ========== getAutoSelectedDate ==========

test('getAutoSelectedDate: preserves day when valid', () => {
  const comp = createComponent();
  comp.data.selectedDate = '2026-07-15';
  const result = comp.getAutoSelectedDate(2026, 6);

  assert.strictEqual(result, '2026-07-15');
});

test('getAutoSelectedDate: clamps to last day of month', () => {
  const comp = createComponent();
  comp.data.selectedDate = '2026-01-31';
  const result = comp.getAutoSelectedDate(2026, 1);

  assert.strictEqual(result, '2026-02-28');
});

test('getAutoSelectedDate: uses today when no selectedDate', () => {
  const comp = createComponent();
  comp.data.selectedDate = '';
  const result = comp.getAutoSelectedDate(2026, 6);

  const today = new Date().getDate();
  assert.ok(result.startsWith('2026-07-'));
});

// ========== getCalendarState (rowCount) ==========

test('getCalendarState: month view rowCount for 31-day month starting Sunday', () => {
  const comp = createComponent();
  comp.data.memoDateMeta = {};
  const state = comp.getCalendarState(2026, 5, '2026-06-15', 'month');

  assert.strictEqual(state.rowCount, 5);
});

test('getCalendarState: month view rowCount for February 2028', () => {
  const comp = createComponent();
  comp.data.memoDateMeta = {};
  const state = comp.getCalendarState(2028, 1, '2028-02-15', 'month');

  assert.strictEqual(state.rowCount, 5);
});

test('getCalendarState: week view rowCount is always 1', () => {
  const comp = createComponent();
  comp.data.memoDateMeta = {};
  const state = comp.getCalendarState(2026, 6, '2026-07-09', 'week');

  assert.strictEqual(state.rowCount, 1);
});

test('getCalendarState: week view produces 3 swiper panels', () => {
  const comp = createComponent();
  comp.data.memoDateMeta = {};
  const state = comp.getCalendarState(2026, 6, '2026-07-09', 'week');

  assert.strictEqual(state.swiperPanels.length, 3);
  assert.strictEqual(state.swiperPanels[1].days.length, 7);
});

test('getCalendarState: month view produces 3 swiper panels', () => {
  const comp = createComponent();
  comp.data.memoDateMeta = {};
  const state = comp.getCalendarState(2026, 6, '2026-07-15', 'month');

  assert.strictEqual(state.swiperPanels.length, 3);
  assert.ok(state.swiperPanels[1].days.length >= 28);
});

// ========== toggleViewMode ==========

test('toggleViewMode: switches from month to week', () => {
  global.wx = global.wx || {};
  global.wx.vibrateShort = () => {};
  const comp = createComponent();
  comp.data.viewMode = 'month';
  comp.data.currentYear = 2026;
  comp.data.currentMonth = 6;
  comp.data.selectedDate = '2026-07-15';
  comp.data.memoDateMeta = {};

  comp.toggleViewMode('week');

  assert.strictEqual(comp.data.viewMode, 'week');
  assert.strictEqual(comp.data.rowCount, 1);
});

test('toggleViewMode: switches from week to month', () => {
  global.wx = global.wx || {};
  global.wx.vibrateShort = () => {};
  const comp = createComponent();
  comp.data.viewMode = 'week';
  comp.data.currentYear = 2026;
  comp.data.currentMonth = 6;
  comp.data.selectedDate = '2026-07-15';
  comp.data.memoDateMeta = {};

  comp.toggleViewMode('month');

  assert.strictEqual(comp.data.viewMode, 'month');
  assert.ok(comp.data.rowCount >= 4);
});
