const test = require('node:test');
const assert = require('node:assert');
const {
  MAX_SHARE_PATH_LENGTH,
  createSharedMemoPayload,
  parseSharedMemoPayload,
  createSharedMemoImportForSave,
  getSharedMemoSaveState,
  removeMemoByIdFromDates
} = require('../utils/share.js');
const { mergeImportedData } = require('../utils/backup.js');

const DEFAULT_CATEGORIES = [
  { key: 'Sport', labelCn: '运动', labelEn: 'Sport', color: '#ff9500', icon: '🏋' },
  { key: 'Work', labelCn: '工作', labelEn: 'Work', color: '#ff2d55', icon: '🚀' }
];

const options = {
  defaultCategories: DEFAULT_CATEGORIES,
  palette: ['#ff3b30', '#ff9500', '#ffcc00'],
  isValidDateString: date => /^\d{4}-\d{2}-\d{2}$/.test(date)
};

function loadIndexPageDefinition() {
  let pageDefinition;
  const originalPage = global.Page;
  const pageModulePath = require.resolve('../pages/index/index.js');
  try {
    global.Page = definition => {
      pageDefinition = definition;
    };
    delete require.cache[pageModulePath];
    require(pageModulePath);
  } finally {
    global.Page = originalPage;
  }
  return pageDefinition;
}

function createIndexPage() {
  const pageDefinition = loadIndexPageDefinition();
  const page = Object.assign({}, pageDefinition);
  page.data = JSON.parse(JSON.stringify(pageDefinition.data));
  page.setData = (updates, callback) => {
    Object.assign(page.data, updates);
    if (callback) callback();
  };
  return page;
}

test('createSharedMemoPayload and parseSharedMemoPayload round trip a memo', () => {
  const memo = {
    id: 'memo-1',
    title: '会议提醒 📅',
    time: '14:30',
    location: '上海办公室',
    notes: '带上合同和发票。',
    tag: 'Sport',
    color: '#ff9500',
    completed: false
  };

  const payload = createSharedMemoPayload('2026-07-05', memo, DEFAULT_CATEGORIES[0]);
  assert.match(payload, /^[A-Za-z0-9_-]+$/);

  const result = parseSharedMemoPayload(payload, options);
  assert.ok(result);
  assert.strictEqual(result.date, '2026-07-05');
  assert.strictEqual(result.memo.title, '会议提醒 📅');
  assert.strictEqual(result.memo.time, '14:30');
  assert.strictEqual(result.memo.location, '上海办公室');
  assert.strictEqual(result.memo.notes, '带上合同和发票。');
});

test('shared memo payload keeps custom category data', () => {
  const customCategory = {
    key: 'custom-design',
    labelCn: '设计',
    labelEn: 'Design',
    color: '#34c759',
    icon: '🎨',
    isCustom: true
  };
  const memo = {
    id: 'memo-custom',
    title: '设计评审',
    time: '09:00',
    location: '',
    notes: '',
    tag: 'custom-design',
    color: '#34c759',
    completed: true
  };

  const payload = createSharedMemoPayload('2026-07-06', memo, customCategory);
  const result = parseSharedMemoPayload(payload, options);

  assert.ok(result);
  assert.strictEqual(result.categories.length, 1);
  assert.strictEqual(result.categories[0].key, 'custom-design');
  assert.strictEqual(result.memo.tag, 'custom-design');
  assert.strictEqual(result.memo.categoryIcon, '🎨');
  assert.strictEqual(result.memo.completed, true);
});

test('parseSharedMemoPayload rejects invalid payloads', () => {
  assert.strictEqual(parseSharedMemoPayload('', options), null);
  assert.strictEqual(parseSharedMemoPayload('not-valid-json', options), null);
});

test('shared memo payload remains within configured share path limit for max fields', () => {
  const memo = {
    id: 'memo-max',
    title: '标题'.repeat(20),
    time: '23:59',
    location: '地点'.repeat(50),
    notes: '备注'.repeat(100),
    tag: 'Sport',
    color: '#ff9500',
    completed: false
  };

  const payload = createSharedMemoPayload('2026-07-07', memo, DEFAULT_CATEGORIES[0]);
  const path = `/pages/index/index?lang=zh&share=${payload}`;
  assert.ok(path.length <= MAX_SHARE_PATH_LENGTH);
});

test('createSharedMemoPayload can omit notes for long share paths', () => {
  const memo = {
    id: 'memo-no-notes',
    title: '分享基础信息',
    time: '8:30',
    location: '会议室',
    notes: '这段备注不应该进入分享 payload',
    tag: 'Sport',
    color: '#ff9500',
    completed: false
  };

  const payload = createSharedMemoPayload('2026-07-08', memo, DEFAULT_CATEGORIES[0], {
    includeNotes: false
  });
  const result = parseSharedMemoPayload(payload, options);

  assert.ok(result);
  assert.strictEqual(result.memo.time, '08:30');
  assert.strictEqual(result.memo.notes, '');
});

test('shared memo import keeps its id so repeated saves are idempotent', () => {
  const memo = {
    id: 'memo-duplicate',
    title: '重复 ID 测试',
    time: '10:00',
    location: '',
    notes: '',
    tag: 'Sport',
    color: '#ff9500',
    completed: false
  };
  const payload = createSharedMemoPayload('2026-07-09', memo, DEFAULT_CATEGORIES[0]);
  const sharedMemoImport = parseSharedMemoPayload(payload, options);
  const prepared = createSharedMemoImportForSave(sharedMemoImport);
  const merged = mergeImportedData(prepared, {
    '2026-07-09': [
      { id: 'memo-duplicate', title: '本地已有日程' }
    ]
  });

  assert.ok(prepared);
  assert.strictEqual(prepared.memos['2026-07-09'][0].id, 'memo-duplicate');
  assert.strictEqual(merged.memos['2026-07-09'].length, 1);
  assert.strictEqual(merged.memos['2026-07-09'][0].title, '重复 ID 测试');
});

test('shared memo save state distinguishes unchanged, changed and moved memos', () => {
  const memo = {
    id: 'memo-state',
    title: '状态检测',
    time: '10:30',
    location: '办公室',
    notes: '',
    tag: 'Sport',
    color: '#ff9500',
    completed: false
  };
  const payload = createSharedMemoPayload('2026-07-09', memo, DEFAULT_CATEGORIES[0]);
  const sharedMemoImport = parseSharedMemoPayload(payload, options);
  const localMemos = {
    '2026-07-09': [Object.assign({}, sharedMemoImport.memo)]
  };

  assert.strictEqual(getSharedMemoSaveState(sharedMemoImport, {}).status, 'new');
  assert.strictEqual(getSharedMemoSaveState(sharedMemoImport, localMemos).status, 'unchanged');

  localMemos['2026-07-09'][0].title = '本地旧标题';
  assert.strictEqual(getSharedMemoSaveState(sharedMemoImport, localMemos).status, 'changed');

  const movedMemos = { '2026-07-08': [Object.assign({}, sharedMemoImport.memo)] };
  assert.strictEqual(getSharedMemoSaveState(sharedMemoImport, movedMemos).status, 'changed');
  assert.deepStrictEqual(removeMemoByIdFromDates(movedMemos, memo.id), {});
});

test('card share button returns a path containing the selected memo', () => {
  const page = createIndexPage();
  page.data.lang = 'zh';
  page.data.selectedDate = '2026-07-10';
  page.memoDates = {
    '2026-07-10': [{
      id: 'memo-page-share',
      title: '页面分享测试',
      time: '15:30',
      location: '会议室',
      notes: '确认分享内容',
      tag: 'Sport',
      color: '#ff9500',
      completed: false
    }]
  };
  page.showToast = () => {};

  const config = page.onShareAppMessage({
    from: 'button',
    target: {
      dataset: {
        id: 'memo-page-share',
        date: '2026-07-10'
      }
    }
  });

  assert.match(config.title, /页面分享测试/);
  assert.match(config.path, /[?&]share=/);

  const payload = config.path.split('&share=')[1];
  const parsed = page.parseSharedMemoOption(payload);
  assert.ok(parsed);
  assert.strictEqual(parsed.date, '2026-07-10');
  assert.strictEqual(parsed.memo.title, '页面分享测试');
});

test('card share button resolves a generated weekly preview image', async () => {
  const page = createIndexPage();
  const memo = {
    id: 'memo-share-image',
    title: '周历分享图',
    time: '09:30',
    location: '会议室',
    notes: '',
    tag: 'Sport',
    color: '#ff9500',
    categoryIcon: '🏋',
    completed: false
  };
  page.data.lang = 'zh';
  page.memoDates = new Proxy({ '2026-08-01': [memo] }, {
    get(target, property) {
      if (typeof property === 'string' && property !== '2026-08-01') {
        throw new Error(`share image accessed unrelated memo date: ${property}`);
      }
      return target[property];
    }
  });

  const drawnText = [];
  const context = new Proxy({
    measureText: text => ({ width: Array.from(text).length * 12 }),
    fillText: text => {
      drawnText.push(text);
    },
    draw: (reserve, callback) => callback()
  }, {
    get(target, property) {
      if (property in target) return target[property];
      return () => {};
    }
  });
  const originalWx = global.wx;
  let canvasCreateCount = 0;
  let imageExportCount = 0;
  global.wx = {
    createCanvasContext: () => {
      canvasCreateCount += 1;
      return context;
    },
    canvasToTempFilePath: options => {
      imageExportCount += 1;
      options.success({ tempFilePath: '/tmp/memo-share.png' });
    }
  };

  try {
    const config = page.onShareAppMessage({
      from: 'button',
      target: {
        dataset: { id: memo.id, date: '2026-08-01' }
      }
    });
    const resolvedConfig = await config.promise;

    assert.strictEqual(resolvedConfig.imageUrl, '/tmp/memo-share.png');
    assert.match(resolvedConfig.path, /[?&]share=/);
    assert.ok(drawnText.includes('2026年8月1日'));
    assert.ok(!drawnText.some(text => typeof text === 'string' && text.includes(' - ')));
    assert.ok(!drawnText.includes('备忘录日历'));
    assert.ok(drawnText.includes('🏋'));

    const cachedConfig = page.onShareAppMessage({
      from: 'button',
      target: {
        dataset: { id: memo.id, date: '2026-08-01' }
      }
    });
    assert.strictEqual((await cachedConfig.promise).imageUrl, '/tmp/memo-share.png');
    assert.strictEqual(canvasCreateCount, 1);
    assert.strictEqual(imageExportCount, 1);

    memo.title = '周历分享图（修改）';
    const changedConfig = page.onShareAppMessage({
      from: 'button',
      target: {
        dataset: { id: memo.id, date: '2026-08-01' }
      }
    });
    assert.strictEqual((await changedConfig.promise).imageUrl, '/tmp/memo-share.png');
    assert.strictEqual(canvasCreateCount, 2);
    assert.strictEqual(imageExportCount, 2);
  } finally {
    global.wx = originalWx;
  }
});

test('shared memo preview identifies duplicates and updates before saving', async () => {
  const page = createIndexPage();
  const memo = {
    id: 'memo-received-share',
    title: '接收分享测试',
    time: '16:30',
    location: '咖啡厅',
    notes: '保存到本地日程',
    tag: 'Sport',
    color: '#ff9500',
    completed: false
  };
  const payload = createSharedMemoPayload('2026-07-11', memo, DEFAULT_CATEGORIES[0]);

  page.todayDate = '2026-07-10';
  page.memoDates = {};
  page.getBackupStorageSnapshot = async () => ({
    memos: page.memoDates,
    categories: []
  });
  let saveCount = 0;
  page.saveImportedDataSafely = async () => {
    saveCount += 1;
    return true;
  };
  page.refreshMemoDateMetaAsync = () => {};
  const toastTitles = [];
  page.showToast = title => {
    toastTitles.push(title);
  };

  page.showSharedMemoPreview(page.parseSharedMemoOption(payload));
  assert.strictEqual(page.data.sharedMemoSaveStatus, 'new');
  await page.onSaveSharedMemo();

  page.showSharedMemoPreview(page.parseSharedMemoOption(payload));
  assert.strictEqual(page.data.sharedMemoSaveStatus, 'unchanged');
  await page.onSaveSharedMemo();

  assert.strictEqual(page.data.savingSharedMemo, false);
  assert.strictEqual(page.data.sharePreviewVisible, false);
  assert.strictEqual(page.data.selectedDate, '2026-07-11');
  assert.strictEqual(page.data.selectedMemos.length, 1);
  assert.strictEqual(page.data.selectedMemos[0].title, '接收分享测试');
  assert.strictEqual(page.memoDates['2026-07-11'].length, 1);
  assert.strictEqual(page.memoDates['2026-07-11'][0].title, '接收分享测试');
  assert.strictEqual(saveCount, 1);
  assert.ok(toastTitles.includes('该日程已保存'));

  const updatedPayload = createSharedMemoPayload(
    '2026-07-11',
    Object.assign({}, memo, { title: '接收分享测试（更新）' }),
    DEFAULT_CATEGORIES[0]
  );
  page.showSharedMemoPreview(page.parseSharedMemoOption(updatedPayload));
  assert.strictEqual(page.data.sharedMemoSaveStatus, 'changed');
  await page.onSaveSharedMemo();

  assert.strictEqual(saveCount, 2);
  assert.strictEqual(page.data.sharedMemoSaveStatus, 'new');
  assert.strictEqual(page.data.sharePreviewVisible, false);
  assert.strictEqual(page.memoDates['2026-07-11'].length, 1);
  assert.strictEqual(page.memoDates['2026-07-11'][0].title, '接收分享测试（更新）');
  assert.ok(toastTitles.includes('已替换本地日程'));
});
