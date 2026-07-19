function cleanMemosUIFields(memos) {
  if (!Array.isArray(memos)) return [];
  
  const hasDirty = memos.some(item => 'isSwiped' in item);
  if (!hasDirty) return memos;

  return memos.map(item => {
    if (!('isSwiped' in item)) return item;
    const cleanItem = Object.assign({}, item);
    delete cleanItem.isSwiped;
    return cleanItem;
  });
}

function cleanMemoDatesUIFields(memoDates) {
  if (!memoDates) return {};
  
  let hasDirty = false;
  for (const date in memoDates) {
    const list = memoDates[date];
    if (Array.isArray(list) && list.some(item => 'isSwiped' in item)) {
      hasDirty = true;
      break;
    }
  }

  if (!hasDirty) return memoDates;

  const cleanMemoDates = {};
  Object.keys(memoDates).forEach(date => {
    const list = memoDates[date];
    cleanMemoDates[date] = Array.isArray(list) ? cleanMemosUIFields(list) : list;
  });
  return cleanMemoDates;
}

module.exports = {
  cleanMemosUIFields,
  cleanMemoDatesUIFields
};
