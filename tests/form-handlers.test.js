const test = require('node:test');
const assert = require('node:assert');

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
  return page;
}

function createCategoryRenamePage() {
  const page = createPage();
  const date = '2026-07-13';
  const category = {
    key: 'custom-1',
    labelCn: '旧分类',
    labelEn: 'Old category',
    color: '#34c759',
    icon: '🏷️',
    isCustom: true
  };
  const originalMemos = {
    [date]: [{
      id: 'memo-1',
      title: 'Memo',
      tag: category.key,
      tagCn: category.labelCn,
      tagEn: category.labelEn
    }]
  };
  page.data.text = { saved: 'saved' };
  page.data.categories = [category];
  page.data.selectedDate = date;
  page.data.selectedMemos = originalMemos[date];
  page.data.memoForm = { tag: category.key, color: category.color };
  page.data.customCategoryName = '新分类';
  page.data.customCategoryModalVisible = true;
  page.data.editingCategoryKey = category.key;
  page.memoDates = originalMemos;
  return { page, date, category, originalMemos };
}

test('text inputs update logic data without setData', () => {
  const page = createPage();

  page.onFormTitleInput({ detail: { value: 'Updated title' } });
  page.onFormLocationInput({ detail: { value: 'Updated location' } });
  page.onCustomCategoryNameInput({ detail: { value: 'Updated category' } });

  assert.strictEqual(page.data.memoForm.title, 'Updated title');
  assert.strictEqual(page.data.memoForm.location, 'Updated location');
  assert.strictEqual(page.data.customCategoryName, 'Updated category');
  assert.strictEqual(page.setDataCalls.length, 0);
});

test('notes input throttles counter setData while keeping the latest value', () => {
  const page = createPage();
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  let scheduledCallback;
  let scheduledDelay;
  global.setTimeout = (callback, delay) => {
    scheduledCallback = callback;
    scheduledDelay = delay;
    return 1;
  };
  global.clearTimeout = () => {};

  try {
    page.onFormNotesInput({ detail: { value: 'first' } });
    page.onFormNotesInput({ detail: { value: 'latest notes' } });

    assert.strictEqual(page.data.memoForm.notes, 'latest notes');
    assert.strictEqual(page.setDataCalls.length, 0);
    assert.strictEqual(scheduledDelay, 80);

    scheduledCallback();
    assert.strictEqual(page.data.memoNotesLength, 12);
    assert.strictEqual(page.setDataCalls.length, 1);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test('saving a memo closes the modal with the cleaned selected list', async () => {
  const page = createPage();
  const date = '2026-07-13';
  let closeData;
  page.data.selectedDate = date;
  page.data.memoForm = {
    id: '',
    title: 'New memo',
    time: '',
    location: '',
    tag: 'work',
    color: '',
    notes: '',
    completed: false
  };
  page.memoDates = {
    [date]: [{ id: 'memo-1', title: 'Existing', isSwiped: true }]
  };
  page.saveMemosToStorage = async () => true;
  page._closeModalWithData = (data, callback) => {
    closeData = data;
    callback();
    return true;
  };

  await page.onSaveMemo();

  assert.deepStrictEqual(closeData.selectedMemos.map(item => item.id), ['memo-1', 'memo-new']);
  assert.strictEqual(Object.hasOwn(closeData.selectedMemos[0], 'isSwiped'), false);
  assert.strictEqual(closeData.swipedMemoId, '');
  assert.strictEqual(page.savingMemo, false);
  assert.strictEqual(page.memoMutationLock, '');
});

test('saving does not replace the visible list after the selected date changes', async () => {
  const page = createPage();
  const savedDate = '2026-07-13';
  const currentDate = '2026-07-14';
  let finishSave;
  let closeData;
  page.data.selectedDate = savedDate;
  page.data.memoForm = {
    id: '',
    title: 'New memo',
    time: '',
    location: '',
    tag: 'work',
    color: '',
    notes: '',
    completed: false
  };
  page.memoDates = { [savedDate]: [] };
  page.saveMemosToStorage = () => new Promise(resolve => {
    finishSave = resolve;
  });
  page._closeModalWithData = (data, callback) => {
    closeData = data;
    callback();
    return true;
  };

  const saving = page.onSaveMemo();
  page.data.selectedDate = currentDate;
  page.data.selectedMemos = [{ id: 'current', title: 'Current date memo' }];
  finishSave(true);
  await saving;

  assert.strictEqual(Object.hasOwn(closeData, 'selectedMemos'), false);
  assert.deepStrictEqual(page.data.selectedMemos.map(item => item.id), ['current']);
  assert.deepStrictEqual(page.memoDates[savedDate].map(item => item.id), ['memo-new']);
});

test('renaming a category commits memos and categories before updating UI', async () => {
  const { page, date, category, originalMemos } = createCategoryRenamePage();
  const writes = [];
  page.getStorage = async key => key === 'memoCalendarMemos' ? originalMemos : [category];
  page.setStorage = async (key, value) => {
    writes.push({ key, value });
  };

  await page.onSaveCustomCategory();

  assert.deepStrictEqual(writes.map(item => item.key), [
    'memoCalendarMemos',
    'memoCustomCategories'
  ]);
  assert.strictEqual(page.memoDates[date][0].tagCn, '新分类');
  assert.strictEqual(page.memoDates[date][0].tagEn, '新分类');
  assert.strictEqual(page.data.selectedMemos[0].tagCn, '新分类');
  assert.strictEqual(page.data.customCategoryModalVisible, false);
});

test('category rename rolls back storage and keeps UI unchanged when category write fails', async () => {
  const { page, category, originalMemos } = createCategoryRenamePage();
  const snapshot = { memos: originalMemos, categories: [category] };
  let rollbackSnapshot;
  let storageFailureShown = false;
  const originalConsoleError = console.error;
  console.error = () => {};
  page.getStorage = async key => key === 'memoCalendarMemos' ? originalMemos : [category];
  page.setStorage = async key => {
    if (key === 'memoCustomCategories') throw new Error('category write failed');
  };
  page.rollbackBackupStorage = async value => {
    rollbackSnapshot = value;
  };
  page.showStorageFailureToast = () => {
    storageFailureShown = true;
  };

  try {
    await page.onSaveCustomCategory();

    assert.deepStrictEqual(rollbackSnapshot, snapshot);
    assert.strictEqual(page.memoDates, originalMemos);
    assert.strictEqual(page.data.selectedMemos[0].tagCn, '旧分类');
    assert.strictEqual(page.data.customCategoryModalVisible, true);
    assert.strictEqual(page.data.editingCategoryKey, category.key);
    assert.strictEqual(storageFailureShown, true);
  } finally {
    console.error = originalConsoleError;
  }
});

test('new category stays open when storage fails', async () => {
  const page = createPage();
  let storageFailureShown = false;
  const originalConsoleError = console.error;
  console.error = () => {};
  page.data.text = { created: 'created' };
  page.data.categories = [];
  page.data.customCategoryName = '新分类';
  page.data.customCategoryModalVisible = true;
  page.data.editingCategoryKey = null;
  page.getStorage = async () => [];
  page.setStorage = async () => {
    throw new Error('category write failed');
  };
  page.showStorageFailureToast = () => {
    storageFailureShown = true;
  };

  try {
    await page.onSaveCustomCategory();

    assert.strictEqual(page.data.customCategoryModalVisible, true);
    assert.strictEqual(page.data.customCategoryName, '新分类');
    assert.strictEqual(storageFailureShown, true);
  } finally {
    console.error = originalConsoleError;
  }
});
