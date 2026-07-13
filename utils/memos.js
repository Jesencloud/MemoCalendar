function cleanMemosUIFields(memos) {
  if (!Array.isArray(memos)) return [];
  return memos.map(item => {
    const cleanItem = Object.assign({}, item);
    delete cleanItem.isSwiped;
    return cleanItem;
  });
}

function cleanMemoDatesUIFields(memoDates) {
  const cleanMemoDates = {};
  Object.keys(memoDates || {}).forEach(date => {
    const list = memoDates[date];
    cleanMemoDates[date] = Array.isArray(list) ? cleanMemosUIFields(list) : list;
  });
  return cleanMemoDates;
}

module.exports = {
  cleanMemosUIFields,
  cleanMemoDatesUIFields
};
