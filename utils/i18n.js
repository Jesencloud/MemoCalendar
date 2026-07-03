/**
 * i18n utility for the memo calendar.
 */

const translations = {
  zh: {
    title: '备忘日历',
    subtitle: '记录日程，规划生活 📅',
    navTitle: '备忘录日历',
    today: '今天',
    events: '的日程',
    noEvents: '今天没有任何行程安排，点击右下角按钮添加一个吧！',
    langToggle: 'EN',
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    months: [
      '一月',
      '二月',
      '三月',
      '四月',
      '五月',
      '六月',
      '七月',
      '八月',
      '九月',
      '十月',
      '十一月',
      '十二月'
    ],
    addMemo: '新建备忘',
    editMemo: '编辑备忘',
    delete: '删除',
    save: '保存',
    cancel: '取消',
    ok: '确定',
    inputTitlePlaceholder: '要做什么呢？(必填)',
    inputTimePlaceholder: '选择具体时间 (选填)',
    inputLocationPlaceholder: '行程地点 (选填)',
    inputNotesPlaceholder: '添加详细的备注信息... (选填)',
    selectCategory: '选择分类',
    categoryWork: '工作',
    categoryLife: '生活',
    categorySport: '运动',
    categoryStudy: '学习',
    categoryImportant: '重要',
    confirmDelete: '确定要删除这条便签吗？',
    titleRequired: '请填写便签标题/内容',
    invalidDate: '日期无效',
    sortByTime: '时间排序'
  },
  en: {
    title: 'Memo Calendar',
    subtitle: 'Track schedule & plan life 📅',
    navTitle: 'Memo Calendar',
    today: 'Today',
    events: '\'s Memos',
    noEvents: 'No memos for today. Tap the "+" button in the bottom right to add one!',
    langToggle: '中文',
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    months: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December'
    ],
    addMemo: 'New Memo',
    editMemo: 'Edit Memo',
    delete: 'Delete',
    save: 'Save',
    cancel: 'Cancel',
    ok: 'OK',
    inputTitlePlaceholder: 'What to do? (Required)',
    inputTimePlaceholder: 'Select time (Optional)',
    inputLocationPlaceholder: 'Event location (Optional)',
    inputNotesPlaceholder: 'Add detailed notes... (Optional)',
    selectCategory: 'Category',
    categoryWork: 'Work',
    categoryLife: 'Life',
    categorySport: 'Sport',
    categoryStudy: 'Study',
    categoryImportant: 'Important',
    confirmDelete: 'Are you sure you want to delete this memo?',
    titleRequired: 'Please enter a memo title',
    invalidDate: 'Invalid date',
    sortByTime: 'Sort by Time'
  }
};

function t(key, lang = 'zh') {
  const dict = translations[lang] || translations.zh;
  if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
  if (Object.prototype.hasOwnProperty.call(translations.zh, key)) return translations.zh[key];
  return key;
}

module.exports = {
  translations,
  t
};
