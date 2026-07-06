const test = require('node:test');
const assert = require('node:assert');
const {
  MAX_SHARE_PATH_LENGTH,
  createSharedMemoPayload,
  parseSharedMemoPayload,
  createSharedMemoImportForSave
} = require('../utils/share.js');

const DEFAULT_CATEGORIES = [
  { key: 'Sport', labelCn: '运动', labelEn: 'Sport', color: '#ff9500', icon: '🏋' },
  { key: 'Work', labelCn: '工作', labelEn: 'Work', color: '#ff2d55', icon: '🚀' }
];

const options = {
  defaultCategories: DEFAULT_CATEGORIES,
  palette: ['#ff3b30', '#ff9500', '#ffcc00'],
  isValidDateString: date => /^\d{4}-\d{2}-\d{2}$/.test(date)
};

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

test('createSharedMemoImportForSave regenerates duplicate local ids', () => {
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
  const prepared = createSharedMemoImportForSave(
    sharedMemoImport,
    {
      '2026-07-09': [
        { id: 'memo-duplicate', title: '本地已有日程' }
      ]
    },
    () => 'memo-generated'
  );

  assert.ok(prepared);
  assert.strictEqual(prepared.memos['2026-07-09'][0].id, 'memo-generated');
});
