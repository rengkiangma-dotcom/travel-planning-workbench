export function dateIsoAt(start, index = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '')) return '';
  const date = new Date(start + 'T00:00:00Z');
  if (Number.isNaN(+date)) return '';
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

export function dateAt(start, index = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '')) return '日期待定';
  const date = new Date(start + 'T12:00:00');
  if (Number.isNaN(+date)) return '日期待定';
  date.setDate(date.getDate() + index);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
