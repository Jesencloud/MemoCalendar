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
  return page;
}

function installFakeTimers() {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const timers = [];
  global.setTimeout = (callback, delay) => {
    timers.push({ callback, delay });
    return timers.length;
  };
  global.clearTimeout = () => {};
  return {
    timers,
    restore() {
      global.setTimeout = originalSetTimeout;
      global.clearTimeout = originalClearTimeout;
    }
  };
}

test('swipe done toggles and commits UI state once after saving', async () => {
  const page = createPage();
  const date = '2026-07-09';
  page.data.selectedDate = date;
  page.data.memoDateMeta = {};
  page.memoDates = {
    [date]: [
      { id: 'memo-1', title: 'One', completed: false, isSwiped: true },
      { id: 'memo-2', title: 'Two', completed: false }
    ]
  };
  page.saveMemosToStorage = async () => true;
  page.updateMemoDateMeta = () => ({ updated: true });

  await page.onMemoCompletedTap({ currentTarget: { dataset: { id: 'memo-1' } } });

  assert.strictEqual(page.memoDates[date][0].completed, true);
  assert.strictEqual(Object.hasOwn(page.memoDates[date][0], 'isSwiped'), false);
  assert.strictEqual(page.data.memoActionId, '');
  assert.strictEqual(page.data.swipedMemoId, '');
  assert.strictEqual(page.data.selectedMemos[0].completed, true);
  assert.strictEqual(page.setDataCalls.length, 2);
  assert.ok(page.setDataCalls[1].selectedMemos);
});

test('memo action lock blocks overlapping swipe actions', async () => {
  const page = createPage();
  let saveCalled = false;
  page.memoMutationLock = 'swipe-done:memo-in-progress';
  page.saveMemosToStorage = async () => {
    saveCalled = true;
    return true;
  };

  await page.onMemoCompletedTap({ currentTarget: { dataset: { id: 'memo-2' } } });

  assert.strictEqual(saveCalled, false);
  assert.strictEqual(page.memoMutationLock, 'swipe-done:memo-in-progress');
});

test('swipe delete releases the lock and updates the list in one commit', async () => {
  const page = createPage();
  const date = '2026-07-09';
  let confirmOptions;
  page.data.selectedDate = date;
  page.data.memoDateMeta = {};
  page.memoDates = {
    [date]: [
      { id: 'memo-1', title: 'One', completed: false },
      { id: 'memo-2', title: 'Two', completed: false }
    ]
  };
  page.showConfirm = options => {
    confirmOptions = options;
  };
  page.saveMemosToStorage = async () => true;
  page.updateMemoDateMeta = () => ({ updated: true });

  page.deleteMemoById('memo-1', { clearSwipeOnCancel: true });
  assert.strictEqual(page.memoMutationLock, 'delete:memo-1');
  assert.strictEqual(page.data.memoActionId, 'memo-1');

  await confirmOptions.confirm();

  assert.deepStrictEqual(page.memoDates[date].map(item => item.id), ['memo-2']);
  assert.deepStrictEqual(page.data.selectedMemos.map(item => item.id), ['memo-2']);
  assert.strictEqual(page.memoMutationLock, '');
  assert.strictEqual(page.data.memoActionId, '');
  assert.strictEqual(page.setDataCalls.length, 2);
});

test('cancelling swipe delete releases the lock and closes swipe actions', () => {
  const page = createPage();
  let confirmOptions;
  page.data.selectedDate = '2026-07-09';
  page.data.swipedMemoId = 'memo-1';
  page.showConfirm = options => {
    confirmOptions = options;
  };

  page.deleteMemoById('memo-1', { clearSwipeOnCancel: true });
  confirmOptions.cancel();

  assert.strictEqual(page.memoMutationLock, '');
  assert.strictEqual(page.data.memoActionId, '');
  assert.strictEqual(page.data.swipedMemoId, '');
});

test('storage failure releases the swipe mutation lock', async () => {
  const page = createPage();
  const date = '2026-07-09';
  const fakeTimers = installFakeTimers();
  page.data.selectedDate = date;
  page.data.swipedMemoId = 'memo-1';
  page.memoDates = {
    [date]: [{ id: 'memo-1', title: 'One', completed: false }]
  };
  page.saveMemosToStorage = async () => false;

  try {
    await page.onMemoCompletedTap({ currentTarget: { dataset: { id: 'memo-1' } } });

    assert.strictEqual(page.memoMutationLock, '');
    assert.strictEqual(page.data.memoActionId, '');
    assert.strictEqual(fakeTimers.timers[0].delay, 3000);

    fakeTimers.timers[0].callback();
    assert.strictEqual(page.data.swipedMemoId, '');
  } finally {
    fakeTimers.restore();
  }
});

test('delete storage failure restarts swipe auto close', async () => {
  const page = createPage();
  const date = '2026-07-09';
  const fakeTimers = installFakeTimers();
  let confirmOptions;
  page.data.selectedDate = date;
  page.data.swipedMemoId = 'memo-1';
  page.memoDates = {
    [date]: [{ id: 'memo-1', title: 'One', completed: false }]
  };
  page.showConfirm = options => {
    confirmOptions = options;
  };
  page.saveMemosToStorage = async () => false;

  try {
    page.deleteMemoById('memo-1', { clearSwipeOnCancel: true });
    await confirmOptions.confirm();

    assert.strictEqual(page.memoMutationLock, '');
    assert.strictEqual(page.data.memoActionId, '');
    assert.strictEqual(fakeTimers.timers[0].delay, 3000);

    fakeTimers.timers[0].callback();
    assert.strictEqual(page.data.swipedMemoId, '');
  } finally {
    fakeTimers.restore();
  }
});

test('active swipe mutation blocks sorting writes', async () => {
  const page = createPage();
  let saveCalled = false;
  page.data.selectedDate = '2026-07-09';
  page.data.selectedMemos = [
    { id: 'memo-1', title: 'One', time: '10:00' },
    { id: 'memo-2', title: 'Two', time: '09:00' }
  ];
  page.memoMutationLock = 'swipe-done:memo-1';
  page.saveMemosToStorage = async () => {
    saveCalled = true;
    return true;
  };

  await page.sortByTime();

  assert.strictEqual(saveCalled, false);
  assert.strictEqual(page.memoMutationLock, 'swipe-done:memo-1');
});

test('active swipe mutation blocks backup import writes', async () => {
  const page = createPage();
  let snapshotRead = false;
  page.memoMutationLock = 'swipe-done:memo-1';
  page.getBackupStorageSnapshot = async () => {
    snapshotRead = true;
    return { memos: {}, categories: [] };
  };

  await page.processImportData('{}');

  assert.strictEqual(snapshotRead, false);
  assert.strictEqual(page.memoMutationLock, 'swipe-done:memo-1');
  assert.strictEqual(page.data.importingData, false);
});

test('opened swipe actions close automatically after three seconds', () => {
  const page = createPage();
  const fakeTimers = installFakeTimers();

  try {
    page.openSwipeActions('memo-1');
    assert.strictEqual(page.data.swipedMemoId, 'memo-1');
    assert.strictEqual(fakeTimers.timers[0].delay, 3000);

    page.openSwipeActions('memo-2');
    fakeTimers.timers[0].callback();
    assert.strictEqual(page.data.swipedMemoId, 'memo-2');

    fakeTimers.timers[1].callback();
    assert.strictEqual(page.data.swipedMemoId, '');
    assert.strictEqual(page.swipeCloseTimer, null);
  } finally {
    fakeTimers.restore();
  }
});

test('cancelled swipe clears gesture state without opening actions', () => {
  const page = createPage();
  const fakeTimers = installFakeTimers();

  try {
    page.onSwipeTouchStart({
      currentTarget: { dataset: { id: 'memo-1' } },
      touches: [{ clientX: 100, clientY: 20 }]
    });
    page.onSwipeTouchCancel();

    assert.strictEqual(page.swipeTouchActive, false);
    assert.strictEqual(page.activeId, '');
    assert.strictEqual(page.data.swipedMemoId, '');
    assert.strictEqual(fakeTimers.timers.length, 0);
  } finally {
    fakeTimers.restore();
  }
});

test('cancelled drag restores stored order without saving', () => {
  const page = createPage();
  const date = '2026-07-09';
  let saveCalled = false;
  page.data.selectedDate = date;
  page.data.draggingId = 'memo-2';
  page.data.dragTranslateY = 80;
  page.data.selectedMemos = [
    { id: 'memo-2', title: 'Two' },
    { id: 'memo-1', title: 'One' }
  ];
  page.memoDates = {
    [date]: [
      { id: 'memo-1', title: 'One' },
      { id: 'memo-2', title: 'Two' }
    ]
  };
  page.saveMemosToStorage = async () => {
    saveCalled = true;
    return true;
  };

  page.onDragCancel();

  assert.strictEqual(saveCalled, false);
  assert.strictEqual(page.data.draggingId, '');
  assert.strictEqual(page.data.dragTranslateY, 0);
  assert.deepStrictEqual(page.data.selectedMemos.map(item => item.id), ['memo-1', 'memo-2']);
});

test('opening another memo for editing closes existing swipe actions', () => {
  const page = createPage();
  const date = '2026-07-09';
  page.data.selectedDate = date;
  page.data.swipedMemoId = 'memo-1';
  page.memoDates = {
    [date]: [
      { id: 'memo-1', title: 'One', notes: '' },
      { id: 'memo-2', title: 'Two', notes: 'Details' }
    ]
  };

  page.onEditMemoTap({ currentTarget: { dataset: { id: 'memo-2' } } });

  assert.strictEqual(page.data.swipedMemoId, '');
  assert.strictEqual(page.data.modalVisible, true);
  assert.strictEqual(page.data.memoForm.id, 'memo-2');
  assert.strictEqual(page.setDataCalls.length, 1);
});
