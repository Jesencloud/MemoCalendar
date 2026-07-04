const DEFAULT_CATEGORIES = [
  { key: 'Sport', labelCn: '运动', labelEn: 'Sport', color: '#ff9500', icon: '🏋' },
  { key: 'Travel', labelCn: '旅行', labelEn: 'Travel', color: '#32ade6', icon: '✈️' },
  { key: 'Social', labelCn: '社交', labelEn: 'Social', color: '#ff2d55', icon: '🥂' },
  { key: 'Pet', labelCn: '宠物', labelEn: 'Pet', color: '#a2845e', icon: '🐶' },
  { key: 'Beauty', labelCn: '美容', labelEn: 'Beauty', color: '#af52de', icon: '💆🏻‍♀️' },
  { key: 'Shopping', labelCn: '购物', labelEn: 'Shopping', color: '#007aff', icon: '🛍️' },
  { key: 'Food', labelCn: '美食', labelEn: 'Food', color: '#ffcc00', icon: '🍽️' },
  { key: 'Health', labelCn: '健康', labelEn: 'Health', color: '#34c759', icon: '💊' },
  { key: 'Gaming', labelCn: '游戏', labelEn: 'Gaming', color: '#5856d6', icon: '🎮' },
  { key: 'Study', labelCn: '学习', labelEn: 'Study', color: '#30b0c7', icon: '📚' },
  { key: 'Family', labelCn: '家庭', labelEn: 'Family', color: '#00c7be', icon: '🍼' },
  { key: 'Finance', labelCn: '财务', labelEn: 'Finance', color: '#8e8e93', icon: '💰' },
  { key: 'Dating', labelCn: '恋爱', labelEn: 'Dating', color: '#f472b6', icon: '💕' },
  { key: 'Hobby', labelCn: '爱好', labelEn: 'Hobby', color: '#b25c24', icon: '🎳️' },
  { key: 'Important', labelCn: '重要', labelEn: 'Important', color: '#ff3b30', icon: '❗' }
];

const CATEGORY_PALETTE = [
  '#ff3b30', // Apple Red
  '#ff9500', // Apple Orange
  '#ffcc00', // Apple Yellow
  '#34c759', // Apple Green
  '#00c7be', // Apple Mint
  '#30b0c7', // Apple Teal
  '#32ade6', // Apple Cyan
  '#007aff', // Apple Blue
  '#5856d6', // Apple Indigo
  '#af52de', // Apple Purple
  '#ff2d55', // Apple Pink
  '#a2845e', // Apple Brown
  '#8e8e93'  // Apple Gray
];

const DEFAULT_CATEGORY = DEFAULT_CATEGORIES[0];

function mergeCategories(customCategories = []) {
  return [
    ...DEFAULT_CATEGORIES,
    ...(Array.isArray(customCategories) ? customCategories : [])
  ];
}

function findCategoryByKey(categories, key) {
  if (!Array.isArray(categories)) return null;
  return categories.find(category => category.key === key) || null;
}

function findCategoryByName(categories, name) {
  if (!Array.isArray(categories) || typeof name !== 'string') return null;

  const normalizedName = name.trim().toLowerCase();
  if (!normalizedName) return null;

  return categories.find(category => {
    const labelCn = typeof category.labelCn === 'string' ? category.labelCn.toLowerCase() : '';
    const labelEn = typeof category.labelEn === 'string' ? category.labelEn.toLowerCase() : '';
    return labelCn === normalizedName || labelEn === normalizedName;
  }) || null;
}

function resolveCategory(categories, key) {
  return findCategoryByKey(categories, key) || DEFAULT_CATEGORY;
}

function getNextCategoryColor(customCategories = []) {
  const customCount = Array.isArray(customCategories) ? customCategories.length : 0;
  return CATEGORY_PALETTE[customCount % CATEGORY_PALETTE.length];
}

function createCustomCategory(key, name, color) {
  return {
    key,
    labelCn: name,
    labelEn: name,
    color,
    icon: '🏷️',
    isCustom: true
  };
}

module.exports = {
  DEFAULT_CATEGORIES,
  DEFAULT_CATEGORY,
  CATEGORY_PALETTE,
  mergeCategories,
  findCategoryByKey,
  findCategoryByName,
  resolveCategory,
  getNextCategoryColor,
  createCustomCategory
};
