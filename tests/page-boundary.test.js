const test = require('node:test');
const assert = require('node:assert');
const { STORAGE_KEYS } = require('../pages/index/constants.js');

let pageDefinition;
const originalPage = global.Page;
try {
  global.Page = definition => {
    pageDefinition = definition;
  };
  require('../pages/index/index.js');
} finally {
  global.Page = originalPage;
}

function setDataValue(data, path, value) {
  const parts = path.split('.');
  let target = data;
  for (let i = 0; i < parts.length - 1; i += 1) {
    target = target[parts[i]];
  }
  target[parts[parts.length - 1]] = value;
}

function createPage() {
  const page = Object.assign({}, pageDefinition);
  page.data = JSON.parse(JSON.stringify(pageDefinition.data));
  page.memoDates = {};
  page.todayDate = '2026-07-13';
  page.getTodayDate = () => '2026-07-13';
  page.setDataCalls = [];
  page.setData = function(update, callback) {
    this.setDataCalls.push(update);
    Object.keys(update).forEach(key => setDataValue(this.data, key, update[key]));
    if (callback) callback();
  };
  page.vibrate = () => {};
  page.showToast = () => {};
  page.updateMemoDateMeta = () => ({ updated: true });
  page.generateMemoId = () => 'memo-new';
  page.calendarCtx = null;
  return page;
}

// ========== sortByTime ==========

test('sortByTime: does nothing with single memo', async () => {
  const page = createPage();
  page.data.selectedMemos = [{ id: 'memo-1', time: '10:00' }];
  page.data.sortOrder = 'desc';
  let saveCalled = false;
  page.saveMemosToStorage = async () => { saveCalled = true; return true; };

  await page.sortByTime();

  assert.strictEqual(saveCalled, false);
});

test('sortByTime: does nothing with empty array', async () => {
  const page = createPage();
  page.data.selectedMemos = [];
  page.data.sortOrder = 'desc';
  let saveCalled = false;
  page.saveMemosToStorage = async () => { saveCalled = true; return true; };

  await page.sortByTime();

  assert.strictEqual(saveCalled, false);
});

test('sortByTime: does nothing with undefined selectedMemos', async () => {
  const page = createPage();
  page.data.selectedMemos = undefined;
  page.data.sortOrder = 'desc';
  let saveCalled = false;
  page.saveMemosToStorage = async () => { saveCalled = true; return true; };

  await page.sortByTime();

  assert.strictEqual(saveCalled, false);
});

test('sortByTime: toggles order from desc to asc', async () => {
  const page = createPage();
  page.data.selectedDate = '2026-07-13';
  page.data.sortOrder = 'desc';
  page.data.selectedMemos = [
    { id: 'memo-1', title: 'A', time: '14:00' },
    { id: 'memo-2', title: 'B', time: '09:00' }
  ];
  page.data.memoDateMeta = {};
  page.memoDates = { '2026-07-13': [] };
  page.saveMemosToStorage = async () => true;

  await page.sortByTime();

  assert.strictEqual(page.data.sortOrder, 'asc');
  assert.strictEqual(page.data.selectedMemos[0].id, 'memo-2');
  assert.strictEqual(page.data.selectedMemos[1].id, 'memo-1');
});

test('sortByTime: toggles order from asc to desc', async () => {
  const page = createPage();
  page.data.selectedDate = '2026-07-13';
  page.data.sortOrder = 'asc';
  page.data.selectedMemos = [
    { id: 'memo-1', title: 'A', time: '14:00' },
    { id: 'memo-2', title: 'B', time: '09:00' }
  ];
  page.data.memoDateMeta = {};
  page.memoDates = { '2026-07-13': [] };
  page.saveMemosToStorage = async () => true;

  await page.sortByTime();

  assert.strictEqual(page.data.sortOrder, 'desc');
  assert.strictEqual(page.data.selectedMemos[0].id, 'memo-1');
  assert.strictEqual(page.data.selectedMemos[1].id, 'memo-2');
});

test('sortByTime: memos without time are placed at the end', async () => {
  const page = createPage();
  page.data.selectedDate = '2026-07-13';
  page.data.sortOrder = 'desc';
  page.data.selectedMemos = [
    { id: 'memo-1', title: 'A', time: '' },
    { id: 'memo-2', title: 'B', time: '09:00' },
    { id: 'memo-3', title: 'C', time: '14:00' }
  ];
  page.data.memoDateMeta = {};
  page.memoDates = { '2026-07-13': [] };
  page.saveMemosToStorage = async () => true;

  await page.sortByTime();

  // sortOrder was 'desc', so it toggles to 'asc'
  // asc order: 09:00 < 14:00 < '' (no time at end)
  const times = page.data.selectedMemos.map(m => m.time);
  assert.strictEqual(times[0], '09:00');
  assert.strictEqual(times[1], '14:00');
  assert.strictEqual(times[2], '');
});

test('sortByTime: blocked by active mutation lock', async () => {
  const page = createPage();
  page.data.selectedMemos = [
    { id: 'memo-1', time: '14:00' },
    { id: 'memo-2', time: '09:00' }
  ];
  page.memoMutationLock = 'save-memo';
  let saveCalled = false;
  page.saveMemosToStorage = async () => { saveCalled = true; return true; };

  await page.sortByTime();

  assert.strictEqual(saveCalled, false);
  assert.strictEqual(page.memoMutationLock, 'save-memo');
});

test('sortByTime: releases lock on save failure', async () => {
  const page = createPage();
  page.data.selectedDate = '2026-07-13';
  page.data.sortOrder = 'desc';
  page.data.selectedMemos = [
    { id: 'memo-1', time: '14:00' },
    { id: 'memo-2', time: '09:00' }
  ];
  page.memoDates = { '2026-07-13': [] };
  page.saveMemosToStorage = async () => false;

  await page.sortByTime();

  assert.strictEqual(page.memoMutationLock, '');
});

// ========== selectDate ==========

test('selectDate: sets selectedDate and updates today button', () => {
  const page = createPage();
  page.todayDate = '2026-07-13';
  page.memoDates = { '2026-07-15': [] };

  page.selectDate('2026-07-15');

  assert.strictEqual(page.data.selectedDate, '2026-07-15');
  assert.strictEqual(page.data.showTodayButton, true);
  assert.strictEqual(page.data.sortOrder, 'desc');
  assert.strictEqual(page.setDataCalls.length, 1);
});

test('selectDate: hides today button when selecting today', () => {
  const page = createPage();
  page.todayDate = '2026-07-13';
  page.memoDates = { '2026-07-13': [] };

  page.selectDate('2026-07-13');

  assert.strictEqual(page.data.showTodayButton, false);
});

test('selectDate: shows toast for invalid date', () => {
  const page = createPage();
  page.todayDate = '2026-07-13';
  let toastMsg;
  page.showToast = (msg) => { toastMsg = msg; };
  page.data.text = { invalidDate: '日期无效' };

  page.selectDate('invalid');

  assert.strictEqual(toastMsg, '日期无效');
  assert.strictEqual(page.data.selectedDate, '');
});

test('selectDate: resets swipedMemoId', () => {
  const page = createPage();
  page.todayDate = '2026-07-13';
  page.data.swipedMemoId = 'memo-1';
  page.memoDates = { '2026-07-15': [] };

  page.selectDate('2026-07-15');

  assert.strictEqual(page.data.swipedMemoId, '');
});

// ========== goToday ==========

test('goToday: navigates to today and calls calendarCtx.goToDate', () => {
  const page = createPage();
  page.todayDate = '2026-07-13';
  let goToCalledWith;
  page.calendarCtx = {
    goToDate: (date) => { goToCalledWith = date; }
  };
  page.memoDates = { '2026-07-13': [] };

  page.goToday();

  assert.strictEqual(goToCalledWith, '2026-07-13');
  assert.strictEqual(page.data.selectedDate, '2026-07-13');
});

test('goToday: works without calendarCtx', () => {
  const page = createPage();
  page.todayDate = '2026-07-13';
  page.calendarCtx = null;
  page.memoDates = { '2026-07-13': [] };

  page.goToday();

  assert.strictEqual(page.data.selectedDate, '2026-07-13');
});

test('goToday: works when calendarCtx has no goToDate method', () => {
  const page = createPage();
  page.todayDate = '2026-07-13';
  page.calendarCtx = {};
  page.memoDates = { '2026-07-13': [] };

  page.goToday();

  assert.strictEqual(page.data.selectedDate, '2026-07-13');
});

// ========== removeMemoFromDate ==========

test('removeMemoFromDate: removes memo and cleans up empty date', () => {
  const page = createPage();
  const memoDates = {
    '2026-07-13': [{ id: 'memo-1' }]
  };

  const result = page.removeMemoFromDate(memoDates, '2026-07-13', 'memo-1');

  assert.ok(result);
  assert.strictEqual(result['2026-07-13'], undefined);
});

test('removeMemoFromDate: removes memo but keeps other memos', () => {
  const page = createPage();
  const memoDates = {
    '2026-07-13': [{ id: 'memo-1' }, { id: 'memo-2' }]
  };

  const result = page.removeMemoFromDate(memoDates, '2026-07-13', 'memo-1');

  assert.ok(result);
  assert.strictEqual(result['2026-07-13'].length, 1);
  assert.strictEqual(result['2026-07-13'][0].id, 'memo-2');
});

test('removeMemoFromDate: returns null when memo not found', () => {
  const page = createPage();
  const memoDates = {
    '2026-07-13': [{ id: 'memo-1' }]
  };

  const result = page.removeMemoFromDate(memoDates, '2026-07-13', 'memo-999');

  assert.strictEqual(result, null);
});

test('removeMemoFromDate: returns null when date not found', () => {
  const page = createPage();
  const memoDates = {};

  const result = page.removeMemoFromDate(memoDates, '2026-07-13', 'memo-1');

  assert.strictEqual(result, null);
});

test('removeMemoFromDate: does not mutate original', () => {
  const page = createPage();
  const memoDates = {
    '2026-07-13': [{ id: 'memo-1' }, { id: 'memo-2' }]
  };

  page.removeMemoFromDate(memoDates, '2026-07-13', 'memo-1');

  assert.strictEqual(memoDates['2026-07-13'].length, 2);
});

// ========== toggleLang ==========

test('toggleLang: switches from zh to en', () => {
  const page = createPage();
  page.data.lang = 'zh';
  page.todayDate = '2026-07-13';
  page.data.text = { navTitle: '备忘录日历' };
  let navTitle;
  let storedLanguage;
  global.wx = global.wx || {};
  global.wx.setNavigationBarTitle = ({ title }) => { navTitle = title; };
  page.setStorage = async (key, value) => {
    assert.strictEqual(key, STORAGE_KEYS.LANGUAGE);
    storedLanguage = value;
  };

  page.toggleLang();

  assert.strictEqual(page.data.lang, 'en');
  assert.strictEqual(page.data.text.today, 'Today');
  assert.strictEqual(navTitle, 'Memo Calendar');
  assert.strictEqual(storedLanguage, 'en');
});

test('toggleLang: switches from en to zh', () => {
  const page = createPage();
  page.data.lang = 'en';
  page.todayDate = '2026-07-13';
  page.data.text = { navTitle: 'Memo Calendar' };
  let navTitle;
  let storedLanguage;
  global.wx = global.wx || {};
  global.wx.setNavigationBarTitle = ({ title }) => { navTitle = title; };
  page.setStorage = async (key, value) => {
    assert.strictEqual(key, STORAGE_KEYS.LANGUAGE);
    storedLanguage = value;
  };

  page.toggleLang();

  assert.strictEqual(page.data.lang, 'zh');
  assert.strictEqual(page.data.text.today, '今天');
  assert.strictEqual(navTitle, '备忘录日历');
  assert.strictEqual(storedLanguage, 'zh');
});

test('onLoad: local language preference overrides the entry language parameter', async () => {
  const page = createPage();
  page.loadMemosFromStorage = async () => ({});
  page.getStorage = async key => {
    if (key === STORAGE_KEYS.LANGUAGE) return 'zh';
    if (key === STORAGE_KEYS.CUSTOM_CATEGORIES) return [];
    return {};
  };
  page.refreshMemoDateMetaAsync = () => {};
  page.updateNavigationTitle = () => {};

  await page.onLoad({ lang: 'en' });

  assert.strictEqual(page.data.lang, 'zh');
  assert.strictEqual(page.data.text.today, '今天');
});

// ========== showConfirm ==========

test('showConfirm: calls confirm callback on confirm', () => {
  const page = createPage();
  page.data.text = { confirm: '确定', cancel: '取消' };
  let confirmCalled = false;
  let modalOptions;
  global.wx = global.wx || {};
  global.wx.showModal = (options) => {
    modalOptions = options;
    options.success({ confirm: true, cancel: false });
  };

  page.showConfirm({
    title: '标题',
    content: '内容',
    confirm: async () => { confirmCalled = true; }
  });

  assert.strictEqual(confirmCalled, true);
  assert.strictEqual(modalOptions.title, '标题');
  assert.strictEqual(modalOptions.content, '内容');
});

test('showConfirm: calls cancel callback on cancel', () => {
  const page = createPage();
  page.data.text = { confirm: '确定', cancel: '取消' };
  let cancelCalled = false;
  global.wx = global.wx || {};
  global.wx.showModal = (options) => {
    options.success({ confirm: false, cancel: true });
  };

  page.showConfirm({
    cancel: async () => { cancelCalled = true; }
  });

  assert.strictEqual(cancelCalled, true);
});

test('showConfirm: handles confirm callback error', async () => {
  const page = createPage();
  page.data.text = { confirm: '确定', cancel: '取消' };
  let errorCaught = false;
  const originalConsoleError = console.error;
  console.error = () => { errorCaught = true; };
  global.wx = global.wx || {};
  global.wx.showModal = (options) => {
    options.success({ confirm: true, cancel: false });
  };

  try {
    await page.showConfirm({
      confirm: async () => { throw new Error('test error'); }
    });
    assert.ok(errorCaught);
  } finally {
    console.error = originalConsoleError;
  }
});

test('showConfirm: uses default confirmColor', () => {
  const page = createPage();
  page.data.text = { confirm: '确定', cancel: '取消' };
  let modalOptions;
  global.wx = global.wx || {};
  global.wx.showModal = (options) => {
    modalOptions = options;
    options.success({ confirm: false, cancel: false });
  };

  page.showConfirm({});

  assert.strictEqual(modalOptions.confirmColor, '#fa8231');
  assert.strictEqual(modalOptions.confirmText, '确定');
  assert.strictEqual(modalOptions.cancelText, '取消');
});

test('showConfirm: calls fail callback on modal failure', () => {
  const page = createPage();
  page.data.text = { confirm: '确定', cancel: '取消' };
  let failCalled = false;
  global.wx = global.wx || {};
  global.wx.showModal = (options) => {
    options.fail(new Error('modal failed'));
  };

  page.showConfirm({
    fail: () => { failCalled = true; }
  });

  assert.strictEqual(failCalled, true);
});
