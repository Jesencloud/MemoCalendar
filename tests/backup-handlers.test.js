const test = require('node:test');
const assert = require('node:assert');
const { MAX_BACKUP_TEXT_LENGTH } = require('../utils/backup.js');
const { STORAGE_ROLLBACK_ERROR_CODE } = require('../pages/index/constants.js');

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
  page.refreshMemoDateMetaAsync = () => {};
  page.showStorageFailureToast = () => {};

  // Mock wx APIs
  global.wx = global.wx || {};
  global.wx.getStorage = ({ key, success }) => {
    success({ data: {} });
  };
  global.wx.setStorage = ({ success }) => {
    success();
  };

  return page;
}

test('open backup modal sets visibility and clears input', () => {
  const page = createPage();
  page.data.backupModalVisible = false;
  page.data.importInputText = 'old text';

  page.onOpenBackupModal();

  assert.strictEqual(page.data.backupModalVisible, true);
  assert.strictEqual(page.data.importInputText, '');
});

test('close backup modal clears input', () => {
  const page = createPage();
  page.data.backupModalVisible = true;
  page.data.importInputText = 'test';

  page.onCloseBackupModal();

  assert.strictEqual(page.data.backupModalVisible, false);
  assert.strictEqual(page.data.importInputText, '');
});

test('close backup modal blocked when importing', () => {
  const page = createPage();
  page.data.backupModalVisible = true;
  page.importingData = true;

  page.onCloseBackupModal();

  assert.strictEqual(page.data.backupModalVisible, true);
});

test('export data copies to clipboard', async () => {
  const page = createPage();
  let clipboardData;
  page.data.text = { copySuccess: '复制成功', clipboardWriteFailed: '写入失败' };
  page.getBackupStorageSnapshot = async () => ({
    memos: { '2026-07-09': [{ id: 'memo-1', title: 'Test' }] },
    categories: []
  });
  global.wx.setClipboardData = ({ data, success }) => {
    clipboardData = data;
    success();
  };

  await page.onExportData();

  const parsed = JSON.parse(clipboardData);
  assert.strictEqual(parsed.app, 'MemoCalendar');
  assert.strictEqual(parsed.version, 1);
  assert.ok(parsed.exportAt);
  assert.strictEqual(parsed.memos['2026-07-09'][0].id, 'memo-1');
});

test('import from clipboard reads and processes data', async () => {
  const page = createPage();
  const date = '2026-07-09';
  page.data.selectedDate = date;
  page.data.text = {
    clipboardEmpty: '剪贴板为空',
    clipboardReadFailed: '读取失败',
    invalidBackupFormat: '格式无效',
    importSuccess: '导入成功'
  };
  page.memoDates = {};
  let savedMemos;

  global.wx.getStorage = ({ key, success }) => {
    if (key === 'memoCalendarMemos') {
      success({ data: {} });
    } else {
      success({ data: [] });
    }
  };
  global.wx.setStorage = ({ key, data, success }) => {
    if (key === 'memoCalendarMemos') {
      savedMemos = data;
    }
    success();
  };

  const importData = JSON.stringify({
    version: 1,
    app: 'MemoCalendar',
    memos: { [date]: [{ id: 'memo-1', title: 'Imported', tag: 'Sport', completed: false }] },
    categories: []
  });

  await page.processImportData(importData, false, true);

  assert.ok(savedMemos, 'memoCalendarMemos should be saved');
  assert.strictEqual(savedMemos[date][0].id, 'memo-1');
  assert.strictEqual(page.importingData, false);
});

test('import from empty clipboard shows error', async () => {
  const page = createPage();
  page.data.text = {
    clipboardEmpty: '剪贴板为空',
    clipboardReadFailed: '读取失败'
  };
  global.wx.getClipboardData = ({ success }) => {
    success({ data: '' });
  };

  await page.onImportFromClipboard();

  assert.strictEqual(page.importingData, false);
});

test('finish import state releases only the matching mutation lock', () => {
  const page = createPage();
  page.importingData = true;
  page.data.importingData = true;
  page.memoMutationLock = 'save-memo';

  page.finishImportState('import');

  assert.strictEqual(page.memoMutationLock, 'save-memo');
  assert.strictEqual(page.importingData, false);
  assert.strictEqual(page.data.importingData, false);
});

test('clipboard read failure releases import state', () => {
  const page = createPage();
  page.data.text = {
    clipboardEmpty: '剪贴板为空',
    clipboardReadFailed: '读取失败'
  };
  global.wx.getClipboardData = ({ fail }) => {
    fail();
  };

  page.onImportFromClipboard();

  assert.strictEqual(page.memoMutationLock, '');
  assert.strictEqual(page.importingData, false);
  assert.strictEqual(page.data.importingData, false);
});

test('import invalid format shows error', async () => {
  const page = createPage();
  page.data.selectedDate = '2026-07-09';
  page.data.text = {
    invalidBackupFormat: '格式无效'
  };
  global.wx.getClipboardData = ({ success }) => {
    success({ data: 'invalid-json' });
  };

  await page.processImportData('invalid-json');

  assert.strictEqual(page.importingData, false);
});

test('merge import combines with existing data', async () => {
  const page = createPage();
  const date = '2026-07-09';
  page.data.selectedDate = date;
  page.data.text = { importSuccess: '导入成功' };
  page.memoDates = {
    [date]: [{ id: 'memo-1', title: 'Existing', tag: 'Sport', completed: false }]
  };
  global.wx.getStorage = ({ key, success }) => {
    if (key === 'memoCalendarMemos') {
      success({ data: { [date]: [{ id: 'memo-1', title: 'Existing', tag: 'Sport', completed: false }] } });
    } else {
      success({ data: [] });
    }
  };
  global.wx.setStorage = ({ success }) => {
    success();
  };
  page.saveImportedDataSafely = async () => true;

  const importData = JSON.stringify({
    version: 1,
    app: 'MemoCalendar',
    memos: { [date]: [{ id: 'memo-2', title: 'New', tag: 'Sport', completed: false }] },
    categories: []
  });

  await page.processImportData(importData, false);

  assert.strictEqual(page.memoDates[date].length, 2);
});

test('overwrite import replaces all data', async () => {
  const page = createPage();
  const date = '2026-07-09';
  page.data.selectedDate = date;
  page.data.text = { importSuccess: '导入成功' };
  page.memoDates = {
    [date]: [{ id: 'memo-1', title: 'Old', tag: 'Sport', completed: false }]
  };
  page.saveImportedDataSafely = async () => true;

  const importData = JSON.stringify({
    version: 1,
    app: 'MemoCalendar',
    memos: { [date]: [{ id: 'memo-2', title: 'New', tag: 'Sport', completed: false }] },
    categories: []
  });

  await page.processImportData(importData, true);

  assert.strictEqual(page.memoDates[date].length, 1);
  assert.strictEqual(page.memoDates[date][0].id, 'memo-2');
});

test('import blocked when mutation lock is active', async () => {
  const page = createPage();
  page.memoMutationLock = 'save-memo';
  page.data.text = {};

  await page.processImportData('{}');

  assert.strictEqual(page.memoMutationLock, 'save-memo');
  assert.strictEqual(page.importingData, false);
});

test('import text input updates logic data without setData', () => {
  const page = createPage();
  page.data.importInputText = '';
  page.setDataCalls = [];

  page.onImportTextInput({ detail: { value: 'test data' } });

  assert.strictEqual(page.data.importInputText, 'test data');
  assert.strictEqual(page.setDataCalls.length, 0);
});

test('import text input is capped at the backup size limit', () => {
  const page = createPage();

  page.onImportTextInput({
    detail: { value: 'x'.repeat(MAX_BACKUP_TEXT_LENGTH + 10) }
  });

  assert.strictEqual(page.data.importInputText.length, MAX_BACKUP_TEXT_LENGTH);
});

test('oversized import is rejected and releases import state', async () => {
  const page = createPage();
  page.data.text = {
    backupDataTooLarge: '备份过大',
    invalidBackupFormat: '格式无效'
  };
  let toastMessage;
  page.showToast = message => {
    toastMessage = message;
  };

  await page.processImportData('x'.repeat(MAX_BACKUP_TEXT_LENGTH + 1));

  assert.strictEqual(toastMessage, '备份过大');
  assert.strictEqual(page.importingData, false);
  assert.strictEqual(page.memoMutationLock, '');
});

test('trigger merge import calls processImportData', async () => {
  const page = createPage();
  page.data.importInputText = '{"version":1,"app":"MemoCalendar","memos":{},"categories":[]}';
  let processCalled = false;
  page.processImportData = async () => { processCalled = true; };

  page.onTriggerMergeImport();

  assert.strictEqual(processCalled, true);
});

test('trigger overwrite import shows confirmation', () => {
  const page = createPage();
  page.data.importInputText = '{"version":1,"app":"MemoCalendar","memos":{},"categories":[]}';
  page.data.text = {
    confirmOverwriteTitle: '确认覆盖',
    confirmOverwriteDesc: '确定覆盖？'
  };
  let confirmOptions;
  page.showConfirm = (options) => { confirmOptions = options; };

  page.onTriggerOverwriteImport();

  assert.ok(confirmOptions);
  assert.strictEqual(confirmOptions.title, '确认覆盖');
});

test('trigger import with empty input shows error', () => {
  const page = createPage();
  page.data.importInputText = '';
  page.data.text = { clipboardEmpty: '剪贴板为空' };
  let toastMessage;
  page.showToast = (msg) => { toastMessage = msg; };

  page.onTriggerMergeImport();

  assert.strictEqual(toastMessage, '剪贴板为空');
});

test('save imported data safely rolls back on failure', async () => {
  const page = createPage();
  let rollbackCalled = false;
  const originalConsoleError = console.error;
  console.error = () => {}; // Suppress expected error output
  page.rollbackBackupStorage = async () => { rollbackCalled = true; };
  global.wx.setStorage = ({ key, success, fail }) => {
    if (key === 'memoCustomCategories') {
      success();
    } else {
      fail({ errMsg: 'setStorage fail' });
    }
  };

  try {
    const result = await page.saveImportedDataSafely(
      { memos: {}, categories: [] },
      { memos: {}, categories: [] }
    );

    assert.strictEqual(result, false);
    assert.strictEqual(rollbackCalled, true);
  } finally {
    console.error = originalConsoleError;
  }
});

test('rollback storage retries and reports partial failure', async () => {
  const page = createPage();
  const originalConsoleError = console.error;
  console.error = () => {}; // Suppress expected error output
  let memoWriteAttempts = 0;
  global.wx.setStorage = ({ key, success, fail }) => {
    if (key === 'memoCustomCategories') {
      success();
    } else {
      memoWriteAttempts += 1;
      fail({ errMsg: 'fail' });
    }
  };

  try {
    await assert.rejects(
      page.rollbackBackupStorage({ memos: {}, categories: [] }),
      error => error && error.code === STORAGE_ROLLBACK_ERROR_CODE
    );
    assert.strictEqual(memoWriteAttempts, 2);
  } finally {
    console.error = originalConsoleError;
  }
});

test('save imported data reports rollback recovery failure', async () => {
  const page = createPage();
  const originalConsoleError = console.error;
  console.error = () => {};
  const rollbackError = new Error('rollback failed');
  rollbackError.code = STORAGE_ROLLBACK_ERROR_CODE;
  page.setStorage = async key => {
    if (key === 'memoCalendarMemos') throw new Error('write failed');
  };
  page.rollbackBackupStorage = async () => {
    throw rollbackError;
  };
  let shownError;
  page.showStorageFailureToast = error => {
    shownError = error;
  };

  try {
    const result = await page.saveImportedDataSafely(
      { memos: {}, categories: [] },
      { memos: {}, categories: [] }
    );

    assert.strictEqual(result, false);
    assert.strictEqual(shownError, rollbackError);
  } finally {
    console.error = originalConsoleError;
  }
});
