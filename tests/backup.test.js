const test = require('node:test');
const assert = require('node:assert');
const {
  MAX_BACKUP_TEXT_LENGTH,
  MAX_MEMOS_PER_DATE,
  MAX_MEMO_ID_LENGTH,
  MAX_CATEGORY_ICON_LENGTH,
  parseBackupData,
  normalizeBackupObject,
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

test('normalizeBackupObject matches the text parsing normalization result', () => {
  const backupObject = {
    version: 1,
    app: 'MemoCalendar',
    memos: {
      '2026-07-19': [{
        id: 'memo-object',
        title: ' Object import ',
        time: '9:05',
        tag: 'Sport',
        completed: false
      }]
    },
    categories: []
  };

  assert.deepStrictEqual(
    normalizeBackupObject(backupObject, options),
    parseBackupData(JSON.stringify(backupObject), options)
  );
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

test('parseBackupData rejects backup text above the size limit', () => {
  const result = parseBackupData('x'.repeat(MAX_BACKUP_TEXT_LENGTH + 1), options);
  assert.strictEqual(result, null);
});

test('parseBackupData rejects memo IDs above the length limit', () => {
  const data = JSON.stringify({
    version: 1,
    app: 'MemoCalendar',
    memos: {
      '2026-07-04': [{ id: 'x'.repeat(MAX_MEMO_ID_LENGTH + 1), title: 'Too long ID' }]
    },
    categories: []
  });

  assert.strictEqual(parseBackupData(data, options), null);
});

test('parseBackupData truncates oversized custom category icons', () => {
  const data = JSON.stringify({
    version: 1,
    app: 'MemoCalendar',
    memos: {},
    categories: [{
      key: 'custom-icon',
      labelCn: '图标',
      labelEn: 'Icon',
      color: '#ff3b30',
      icon: '😀'.repeat(MAX_CATEGORY_ICON_LENGTH + 1)
    }]
  });

  const result = parseBackupData(data, options);
  assert.ok(result);
  assert.strictEqual(Array.from(result.categories[0].icon).length, MAX_CATEGORY_ICON_LENGTH);
});

test('parseBackupData rejects duplicate memo IDs across the backup', () => {
  const data = JSON.stringify({
    version: 1,
    app: 'MemoCalendar',
    memos: {
      '2026-07-04': [{ id: 'memo-duplicate', title: 'First' }],
      '2026-07-05': [{ id: 'memo-duplicate', title: 'Second' }]
    },
    categories: []
  });

  assert.strictEqual(parseBackupData(data, options), null);
});

test('parseBackupData rejects too many memos on one date', () => {
  const dayMemos = Array.from({ length: MAX_MEMOS_PER_DATE + 1 }, (_, index) => ({
    id: `memo-${index}`,
    title: `Memo ${index}`
  }));
  const data = JSON.stringify({
    version: 1,
    app: 'MemoCalendar',
    memos: { '2026-07-04': dayMemos },
    categories: []
  });

  assert.strictEqual(parseBackupData(data, options), null);
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

test('6. parseBackupData - 非法时间字段清空', () => {
  const data = JSON.stringify({
    version: 1,
    app: 'MemoCalendar',
    memos: {
      '2026-07-04': [
        {
          id: 'memo-1',
          title: '非法时间测试',
          time: '99:99',
          tag: 'Sport'
        }
      ]
    }
  });

  const result = parseBackupData(data, options);
  assert.ok(result);
  assert.strictEqual(result.memos['2026-07-04'][0].time, '');
});

test('7. parseBackupData - 单位数小时归一化', () => {
  const data = JSON.stringify({
    version: 1,
    app: 'MemoCalendar',
    memos: {
      '2026-07-04': [
        {
          id: 'memo-1',
          title: '时间归一化测试',
          time: '8:30',
          tag: 'Sport'
        }
      ]
    }
  });

  const result = parseBackupData(data, options);
  assert.ok(result);
  assert.strictEqual(result.memos['2026-07-04'][0].time, '08:30');
});

test('8. normalizeImportedCategories - 颜色过滤与调色盘兜底', () => {
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

test('9. mergeImportedData - 同 ID 日程覆盖合并与追加', () => {
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

  const merged = mergeImportedData(importedData, localMemos, [], options);
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

test('mergeImportedData moves an imported memo when the same id exists on another date', () => {
  const localMemos = {
    '2026-07-23': [{ id: 'same-id', title: '旧日期日程', tag: 'Sport' }]
  };
  const importedData = {
    memos: {
      '2026-07-24': [{ id: 'same-id', title: '导入的新日期日程', tag: 'Sport' }]
    },
    categories: []
  };

  const merged = mergeImportedData(importedData, localMemos, [], options);

  assert.strictEqual(merged.memos['2026-07-23'], undefined);
  assert.strictEqual(merged.memos['2026-07-24'].length, 1);
  assert.strictEqual(merged.memos['2026-07-24'][0].title, '导入的新日期日程');
});

test('mergeImportedData does not mutate a clean local memo root', () => {
  const localMemos = {
    '2026-07-04': [{ id: 'memo-1', title: 'Local memo' }]
  };
  const importedData = {
    memos: {
      '2026-07-05': [{ id: 'memo-2', title: 'Imported memo' }]
    },
    categories: []
  };

  const merged = mergeImportedData(importedData, localMemos, [], options);

  assert.notStrictEqual(merged.memos, localMemos);
  assert.deepStrictEqual(Object.keys(localMemos), ['2026-07-04']);
  assert.strictEqual(localMemos['2026-07-05'], undefined);
  assert.strictEqual(merged.memos['2026-07-05'][0].id, 'memo-2');
});

test('10. mergeImportedData - 重复分类的去重逻辑', () => {
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

  const merged = mergeImportedData(importedData, {}, localCategories, options);
  assert.ok(merged);
  assert.strictEqual(merged.categories.length, 2); // custom-1 去重，追加 custom-2

  const cat1 = merged.categories.find(c => c.key === 'custom-1');
  // 应当保留本地已有的 custom-1 信息，去重导入的版本
  assert.strictEqual(cat1.labelCn, '设计');
  assert.strictEqual(cat1.color, '#ff3b30');

  const cat2 = merged.categories.find(c => c.key === 'custom-2');
  assert.strictEqual(cat2.labelCn, '开发');
});

test('mergeImportedData keeps the local category definition for a conflicting key', () => {
  const localCategories = [{
    key: 'custom-conflict',
    labelCn: '本地分类',
    labelEn: 'Local',
    color: '#654321',
    icon: 'L'
  }];
  const importedData = {
    memos: {
      '2026-07-24': [{
        id: 'memo-conflict',
        title: '分类冲突',
        tag: 'custom-conflict',
        color: '#123456',
        tagCn: '导入分类',
        tagEn: 'Imported',
        categoryIcon: 'I'
      }]
    },
    categories: [{
      key: 'custom-conflict',
      labelCn: '导入分类',
      labelEn: 'Imported',
      color: '#123456',
      icon: 'I',
      isCustom: true
    }]
  };

  const merged = mergeImportedData(importedData, {}, localCategories, options);
  const memo = merged.memos['2026-07-24'][0];

  assert.strictEqual(merged.categories.length, 1);
  assert.strictEqual(merged.categories[0].labelCn, '本地分类');
  assert.deepStrictEqual(
    {
      tag: memo.tag,
      color: memo.color,
      tagCn: memo.tagCn,
      tagEn: memo.tagEn,
      categoryIcon: memo.categoryIcon
    },
    {
      tag: 'custom-conflict',
      color: '#654321',
      tagCn: '本地分类',
      tagEn: 'Local',
      categoryIcon: 'L'
    }
  );
});

test('mergeImportedData maps an imported category with a default name to the default category', () => {
  const importedData = {
    memos: {
      '2026-07-24': [{
        id: 'memo-sport',
        title: '运动日程',
        tag: 'custom-sport',
        color: '#123456'
      }]
    },
    categories: [{
      key: 'custom-sport',
      labelCn: '运动',
      labelEn: 'Exercise',
      color: '#123456',
      icon: 'X',
      isCustom: true
    }]
  };

  const merged = mergeImportedData(importedData, {}, [], options);
  const memo = merged.memos['2026-07-24'][0];

  assert.deepStrictEqual(merged.categories, []);
  assert.strictEqual(memo.tag, 'Sport');
  assert.strictEqual(memo.color, '#ff9500');
  assert.strictEqual(memo.tagCn, '运动');
  assert.strictEqual(memo.tagEn, 'Sport');
  assert.strictEqual(memo.categoryIcon, '🏋');
});

test('mergeImportedData maps an imported category with a local name to the local category', () => {
  const localCategories = [{
    key: 'custom-local-fitness',
    labelCn: '健身',
    labelEn: 'Fitness',
    color: '#654321',
    icon: 'L'
  }];
  const importedData = {
    memos: {
      '2026-07-24': [{
        id: 'memo-fitness',
        title: '健身日程',
        tag: 'custom-imported-fitness',
        color: '#123456'
      }]
    },
    categories: [{
      key: 'custom-imported-fitness',
      labelCn: '健身',
      labelEn: 'Workout',
      color: '#123456',
      icon: 'I',
      isCustom: true
    }]
  };

  const merged = mergeImportedData(importedData, {}, localCategories, options);
  const memo = merged.memos['2026-07-24'][0];

  assert.strictEqual(merged.categories.length, 1);
  assert.strictEqual(memo.tag, 'custom-local-fitness');
  assert.strictEqual(memo.color, '#654321');
  assert.strictEqual(memo.tagCn, '健身');
  assert.strictEqual(memo.tagEn, 'Fitness');
  assert.strictEqual(memo.categoryIcon, 'L');
});
