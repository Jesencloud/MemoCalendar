function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(dateString) {
  if (typeof dateString !== 'string') return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function isValidDateString(dateString) {
  return parseDate(dateString) !== null;
}

function createWeekDays(dateString) {
  const parsed = parseDate(dateString);
  if (!parsed) return [];

  const selected = new Date(parsed.year, parsed.month, parsed.day);
  const mondayOffset = (selected.getDay() + 6) % 7;
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const current = new Date(parsed.year, parsed.month, parsed.day - mondayOffset + i);
    const date = formatDate(current);
    days.push({
      date,
      year: current.getFullYear(),
      month: current.getMonth() + 1,
      day: current.getDate(),
      selected: date === dateString
    });
  }
  return days;
}

module.exports = {
  formatDate,
  parseDate,
  isValidDateString,
  createWeekDays
};
