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

function createSelectorQueryMock(rects, getScrollTop = () => 0) {
  let rectRequested = false;
  let scrollRequested = false;
  let rectCallback = null;
  let scrollCallback = null;
  const query = {
    selectAll: () => ({
      boundingClientRect: callback => {
        rectRequested = true;
        rectCallback = callback || null;
        return query;
      }
    }),
    selectViewport: () => ({
      scrollOffset: callback => {
        scrollRequested = true;
        scrollCallback = callback || null;
        return query;
      }
    }),
    exec: callback => {
      const results = [];
      if (rectRequested) {
        results.push(rects);
        if (rectCallback) rectCallback(rects);
      }
      if (scrollRequested) {
        const offset = { scrollTop: getScrollTop() };
        results.push(offset);
        if (scrollCallback) scrollCallback(offset);
      }
      if (callback) callback(results);
    }
  };
  return query;
}

function createAutoScrollWxMock(options = {}) {
  const rects = options.rects || [];
  const windowHeight = options.windowHeight || 800;
  let currentScrollTop = options.scrollTop || 0;
  let requestedScrollTop = currentScrollTop;
  return {
    wx: {
      getSystemInfoSync: () => ({ windowHeight }),
      pageScrollTo: scrollOptions => {
        requestedScrollTop = scrollOptions.scrollTop;
        currentScrollTop = scrollOptions.scrollTop;
        scrollOptions.complete();
      },
      createSelectorQuery: () => createSelectorQueryMock(rects, () => currentScrollTop)
    },
    getRequestedScrollTop: () => requestedScrollTop
  };
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
  global.wx.createSelectorQuery = () => createSelectorQueryMock([
    { top: 0, left: 20, width: 300, height: 60 },
    { top: 60, left: 20, width: 300, height: 60 }
  ]);

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
  assert.strictEqual(page.data.dragPreviewReady, true);
  assert.strictEqual(page.data.dragPreviewTop, 0);
  assert.strictEqual(page.data.dragPreviewLeft, 20);
  assert.strictEqual(page.data.dragPreviewWidth, 300);
  assert.strictEqual(page.data.dragPreviewHeight, 60);
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

test('drag start initializes the current page scroll position before dragging is ready', () => {
  const page = createPage();
  const originalWx = global.wx;
  const autoScrollMock = createAutoScrollWxMock({
    scrollTop: 500,
    rects: [{ top: 200, left: 20, width: 300, height: 60 }]
  });
  global.wx = autoScrollMock.wx;

  try {
    page.onDragStart({
      currentTarget: { dataset: { id: 'memo-1', index: 0 } },
      touches: [{ clientY: 240 }]
    });

    assert.strictEqual(page.data.dragPreviewReady, true);
    assert.strictEqual(page.dragScrollTop, 500);

    page.onDragMove({
      touches: [{ clientY: 790 }]
    });

    assert.strictEqual(autoScrollMock.getRequestedScrollTop(), 508);
  } finally {
    page.stopDragAutoScroll();
    global.wx = originalWx;
  }
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

test('drag move auto-scrolls the page near the bottom edge', () => {
  const page = createPage();
  const originalWx = global.wx;
  const autoScrollMock = createAutoScrollWxMock({ scrollTop: 100 });
  global.wx = autoScrollMock.wx;

  try {
    page.data.draggingId = 'memo-1';
    page.data.selectedMemos = [{ id: 'memo-1', title: 'One' }];
    page.cardRects = [{ top: 300, height: 60 }];
    page.dragStartY = 400;
    page.dragIndex = 0;
    page.data.dragPreviewTop = 300;
    page.data.dragPreviewHeight = 60;
    page.dragScrollTop = 100;
    page.lastDragSetDataTime = 0;
    page.lastDragTranslateY = 0;

    page.onDragMove({
      touches: [{ clientY: 790 }]
    });

    assert.strictEqual(autoScrollMock.getRequestedScrollTop(), 108);
    assert.strictEqual(page.dragScrollTop, 108);
    assert.strictEqual(page.cardRects[0].top, 300);
    assert.strictEqual(page.dragScrollOffset, 8);
    assert.strictEqual(page.dragStartY, 400);
    assert.strictEqual(page.data.dragTranslateY, 390);
  } finally {
    page.stopDragAutoScroll();
    global.wx = originalWx;
  }
});

test('drag auto-scroll clamps speed when the touch moves beyond the top edge', () => {
  const page = createPage();
  const originalWx = global.wx;
  const autoScrollMock = createAutoScrollWxMock({ scrollTop: 100 });
  global.wx = autoScrollMock.wx;

  try {
    page.data.draggingId = 'memo-1';
    page.data.dragPreviewTop = 100;
    page.data.dragPreviewHeight = 60;
    page.data.selectedMemos = [{ id: 'memo-1', title: 'One' }];
    page.cardRects = [{ top: 100, height: 60 }];
    page.dragStartY = 120;
    page.dragIndex = 0;
    page.dragScrollTop = 100;

    page.onDragMove({
      touches: [{ clientY: -20 }]
    });

    assert.strictEqual(autoScrollMock.getRequestedScrollTop(), 90);
  } finally {
    page.stopDragAutoScroll();
    global.wx = originalWx;
  }
});

test('auto-scroll reorders cards without updating the fixed drag preview position', () => {
  const page = createPage();
  const originalWx = global.wx;
  const autoScrollMock = createAutoScrollWxMock({
    scrollTop: 100,
    windowHeight: 100
  });
  global.wx = autoScrollMock.wx;
  page.data.draggingId = 'memo-1';
  page.data.dragTranslateY = 50;
  page.data.dragPreviewTop = 0;
  page.data.dragPreviewHeight = 60;
  page.data.selectedMemos = [
    { id: 'memo-1', title: 'One' },
    { id: 'memo-2', title: 'Two' },
    { id: 'memo-3', title: 'Three' }
  ];
  page.cardRects = [
    { top: 0, height: 60 },
    { top: 60, height: 60 },
    { top: 120, height: 60 }
  ];
  page.dragStartY = 40;
  page.dragIndex = 0;
  page.dragScrollTop = 100;
  page.lastDragSetDataTime = Date.now();
  page.lastDragTranslateY = 50;
  page.setDataCalls = [];

  try {
    page.onDragMove({
      touches: [{ clientY: 92 }]
    });

    assert.deepStrictEqual(page.data.selectedMemos.map(memo => memo.id), [
      'memo-2',
      'memo-1',
      'memo-3'
    ]);
    assert.strictEqual(page.dragIndex, 1);
    assert.strictEqual(page.data.dragTranslateY, 50);
    assert.ok(page.setDataCalls.some(update => {
      return update.selectedMemos && update.dragTranslateY === undefined;
    }));
  } finally {
    page.stopDragAutoScroll();
    global.wx = originalWx;
  }
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
