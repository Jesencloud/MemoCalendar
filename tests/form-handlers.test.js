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
  page.setData = function(update, callback) {
    Object.keys(update).forEach(key => setDataValue(this.data, key, update[key]));
    if (callback) callback();
  };
  page.vibrate = () => {};
  page.showToast = () => {};
  page.updateMemoDateMeta = () => ({ updated: true });
  page.generateMemoId = () => 'memo-new';
  return page;
}

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
