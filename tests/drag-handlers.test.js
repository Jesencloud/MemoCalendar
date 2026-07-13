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

  // Mock wx API
  global.wx = global.wx || {};
  global.wx.createSelectorQuery = () => ({
    selectAll: () => ({
      boundingClientRect: (cb) => {
        cb([{ top: 0, height: 60 }, { top: 60, height: 60 }]);
        return {
          exec: () => {}
        };
      }
    })
  });

  return page;
}

test('drag start sets dragging state and queries card rects', () => {
  const page = createPage();

  page.onDragStart({
    currentTarget: { dataset: { id: 'memo-1', index: 0 } },
    touches: [{ clientY: 100 }]
  });

  assert.strictEqual(page.data.draggingId, 'memo-1');
  assert.strictEqual(page.data.dragTranslateY, 0);
  assert.strictEqual(page.cardRects.length, 2);
});

test('drag start blocked when mutation lock is active', () => {
  const page = createPage();
  page.memoMutationLock = 'swipe-done:memo-1';

  page.onDragStart({
    currentTarget: { dataset: { id: 'memo-2', index: 1 } },
    touches: [{ clientY: 100 }]
  });

  assert.strictEqual(page.data.draggingId, '');
});

test('drag move swaps items when crossing center threshold', () => {
  const page = createPage();
  const date = '2026-07-09';
  page.data.selectedDate = date;
  page.data.draggingId = 'memo-1';
  page.data.selectedMemos = [
    { id: 'memo-1', title: 'One' },
    { id: 'memo-2', title: 'Two' }
  ];
  page.cardRects = [
    { top: 0, height: 60 },
    { top: 60, height: 60 }
  ];
  page.dragStartY = 30;
  page.dragIndex = 0;

  page.onDragMove({
    touches: [{ clientY: 120 }]
  });

  assert.strictEqual(page.data.selectedMemos[0].id, 'memo-2');
  assert.strictEqual(page.data.selectedMemos[1].id, 'memo-1');
  assert.strictEqual(page.dragIndex, 1);
});

test('drag move throttles translation updates', () => {
  const page = createPage();
  page.data.draggingId = 'memo-1';
  page.data.selectedMemos = [{ id: 'memo-1', title: 'One' }];
  page.cardRects = [{ top: 0, height: 60 }];
  page.dragStartY = 30;
  page.dragIndex = 0;
  page.lastDragSetDataTime = Date.now();
  page.lastDragTranslateY = 50;
  page.setDataCalls = [];

  page.onDragMove({
    touches: [{ clientY: 80 }]
  });

  // Should not have called setData because throttle is active
  assert.strictEqual(page.setDataCalls.length, 0);
});

test('drag end saves and releases lock on success', async () => {
  const page = createPage();
  const date = '2026-07-09';
  page.data.selectedDate = date;
  page.data.draggingId = 'memo-1';
  page.data.selectedMemos = [
    { id: 'memo-2', title: 'Two' },
    { id: 'memo-1', title: 'One' }
  ];
  page.data.memoDateMeta = {};
  page.memoDates = {
    [date]: [
      { id: 'memo-1', title: 'One' },
      { id: 'memo-2', title: 'Two' }
    ]
  };
  page.saveMemosToStorage = async () => true;

  await page.onDragEnd();

  assert.strictEqual(page.data.draggingId, '');
  assert.strictEqual(page.data.dragTranslateY, 0);
  assert.strictEqual(page.cardRects, null);
  assert.strictEqual(page.memoMutationLock, '');
});

test('drag end restores order on save failure', async () => {
  const page = createPage();
  const date = '2026-07-09';
  page.data.selectedDate = date;
  page.data.draggingId = 'memo-1';
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
  page.saveMemosToStorage = async () => false;

  await page.onDragEnd();

  assert.strictEqual(page.data.draggingId, '');
  assert.deepStrictEqual(page.data.selectedMemos.map(m => m.id), ['memo-1', 'memo-2']);
});

test('drag cancel restores original order without saving', () => {
  const page = createPage();
  const date = '2026-07-09';
  let saveCalled = false;
  page.data.selectedDate = date;
  page.data.draggingId = 'memo-1';
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
  assert.deepStrictEqual(page.data.selectedMemos.map(m => m.id), ['memo-1', 'memo-2']);
});

test('drag blocked when mutation lock is active', async () => {
  const page = createPage();
  page.data.draggingId = 'memo-1';
  page.memoMutationLock = 'save-memo';
  page.saveMemosToStorage = async () => true;

  await page.onDragEnd();

  assert.strictEqual(page.memoMutationLock, 'save-memo');
});
