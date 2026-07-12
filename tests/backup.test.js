const test = require('node:test');
const assert = require('node:assert');
const {
  parseBackupData,
  mergeImportedData,
  normalizeImportedCategories
} = require('../utils/backup.js');
const { isValidDateString } = require('../utils/date.js');

// Mock data structures
const MOCK_DEFAULT_CATEGORIES = [
  { key: 'Sport', labelCn: '运动', labelEn: 'Sport', color: '#ff9500', icon: '🏋' },
  { key: 'Work', labelCn: '工作', labelEn: 'Work', color: '#ff2d55', icon: '🚀' }
];

const MOCK_PALETTE = ['#ff3b30', '#ff9500', '#ffcc00'];

const options = {
  defaultCategories: MOCK_DEFAULT_CATEGORIES,
  palette: MOCK_PALETTE,
  isValidDateString
};

test('1. parseBackupData - 非法 JSON 字符串', () => {
  const result = parseBackupData('invalid-json', options);
  assert.strictEqual(result, null);
});

test('2. parseBackupData - 错误的 App 签名', () => {
  const badData = JSON.stringify({
    version: 1,
    app: 'WrongAppName',
    memos: {}
  });
  const result = parseBackupData(badData, options);
  assert.strictEqual(result, null);
});

test('3. parseBackupData - 正常数据导入解析', () => {
  const validData = JSON.stringify({
    version: 1,
    app: 'MemoCalendar',
    memos: {
      '2026-07-04': [
        {
          id: 'memo-1',
          title: '工作日程',
          tag: 'Work',
          completed: false
        }
      ]
    },
    categories: [
      {
        key: 'custom-1',
        labelCn: '自定义',
        labelEn: 'Custom',
        color: '#ff3b30'
      }
    ]
  });

  const result = parseBackupData(validData, options);
  assert.ok(result);
  assert.strictEqual(Object.keys(result.memos).length, 1);
  assert.strictEqual(result.memos['2026-07-04'][0].title, '工作日程');
  assert.strictEqual(result.categories.length, 1);
  assert.strictEqual(result.categories[0].key, 'custom-1');
});

test('4. parseBackupData - 字段超长裁剪规则', () => {
  const longTitle = 'A'.repeat(50); // 限制 40
  const longLocation = 'B'.repeat(120); // 限制 100
  const longNotes = 'C'.repeat(250); // 限制 200
  const longCatName = 'D'.repeat(15); // 限制 10

  const data = JSON.stringify({
    version: 1,
    app: 'MemoCalendar',
    memos: {
      '2026-07-04': [
        {
          id: 'memo-1',
          title: longTitle,
          location: longLocation,
          notes: longNotes,
          tag: 'Sport'
        }
      ]
    },
    categories: [
      {
        key: 'custom-1',
        labelCn: longCatName,
        labelEn: longCatName,
        color: '#ff3b30'
      }
    ]
  });

  const result = parseBackupData(data, options);
  assert.ok(result);
  const memo = result.memos['2026-07-04'][0];
  assert.strictEqual(memo.title.length, 40);
  assert.strictEqual(memo.location.length, 100);
  assert.strictEqual(memo.notes.length, 200);

  const cat = result.categories[0];
  assert.strictEqual(cat.labelCn.length, 10);
  assert.strictEqual(cat.labelEn.length, 10);
});

test('5. parseBackupData - 未知分类回退到默认分类', () => {
  const data = JSON.stringify({
    version: 1,
    app: 'MemoCalendar',
    memos: {
      '2026-07-04': [
        {
          id: 'memo-1',
          title: '未知分类测试',
          tag: 'NonExistentCategory'
        }
      ]
    }
  });

  const result = parseBackupData(data, options);
  assert.ok(result);
  const memo = result.memos['2026-07-04'][0];
  // 应该自动回退到默认的第一个分类 (Sport)
  assert.strictEqual(memo.tag, 'Sport');
  assert.strictEqual(memo.color, '#ff9500'); // Sport 的颜色
  assert.strictEqual(memo.categoryIcon, '🏋');
});

test('6. normalizeImportedCategories - 颜色过滤与调色盘兜底', () => {
  const badColorCategories = [
    { key: 'custom-1', labelCn: '分类1', labelEn: 'Cat1', color: 'invalid-color' },
    { key: 'custom-2', labelCn: '分类2', labelEn: 'Cat2', color: '#ff3b30' }
  ];

  const result = normalizeImportedCategories(badColorCategories, MOCK_PALETTE);
  assert.strictEqual(result.length, 2);
  // 分类1 的无效颜色应该退化为调色盘中的第一个颜色 (MOCK_PALETTE[0])
  assert.strictEqual(result[0].color, '#ff3b30');
  // 分类2 的有效十六进制颜色应该被保留
  assert.strictEqual(result[1].color, '#ff3b30');
});

test('7. mergeImportedData - 同 ID 日程覆盖合并与追加', () => {
  const localMemos = {
    '2026-07-04': [
      { id: 'memo-1', title: '旧的日程1', tag: 'Sport', completed: false },
      { id: 'memo-2', title: '本地日程2', tag: 'Sport', completed: true }
    ]
  };

  const importedData = {
    memos: {
      '2026-07-04': [
        { id: 'memo-1', title: '被覆盖的新日程1', tag: 'Sport', completed: true },
        { id: 'memo-3', title: '新增日程3', tag: 'Work', completed: false }
      ]
    },
    categories: []
  };

  const merged = mergeImportedData(importedData, localMemos, [], { palette: MOCK_PALETTE });
  assert.ok(merged);
  const dayMemos = merged.memos['2026-07-04'];
  assert.strictEqual(dayMemos.length, 3); // 1个被覆盖，1个保留，1个追加

  const memo1 = dayMemos.find(m => m.id === 'memo-1');
  assert.strictEqual(memo1.title, '被覆盖的新日程1');
  assert.strictEqual(memo1.completed, true);

  const memo2 = dayMemos.find(m => m.id === 'memo-2');
  assert.strictEqual(memo2.title, '本地日程2');

  const memo3 = dayMemos.find(m => m.id === 'memo-3');
  assert.strictEqual(memo3.title, '新增日程3');
});

test('8. mergeImportedData - 重复分类的去重逻辑', () => {
  const localCategories = [
    { key: 'custom-1', labelCn: '设计', labelEn: 'Design', color: '#ff3b30' }
  ];

  const importedData = {
    memos: {},
    categories: [
      { key: 'custom-1', labelCn: '设计(导入版)', labelEn: 'Design(Import)', color: '#ffcc00' },
      { key: 'custom-2', labelCn: '开发', labelEn: 'Dev', color: '#34c759' }
    ]
  };

  const merged = mergeImportedData(importedData, {}, localCategories, { palette: MOCK_PALETTE });
  assert.ok(merged);
  assert.strictEqual(merged.categories.length, 2); // custom-1 去重，追加 custom-2

  const cat1 = merged.categories.find(c => c.key === 'custom-1');
  // 应当保留本地已有的 custom-1 信息，去重导入的版本
  assert.strictEqual(cat1.labelCn, '设计');
  assert.strictEqual(cat1.color, '#ff3b30');

  const cat2 = merged.categories.find(c => c.key === 'custom-2');
  assert.strictEqual(cat2.labelCn, '开发');
});
