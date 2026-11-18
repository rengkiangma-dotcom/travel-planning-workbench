/* 金额一律换算成「分」的整数再相加；未知保持 null，绝不按 0 处理。 */

export function toMinor(amount) {
  if (amount === null || amount === undefined || amount === '') return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function sumMinor(list) {
  return list.reduce((sum, v) => (v === null || v === undefined ? sum : sum + v), 0);
}

export function formatYuan(minor) {
  if (minor === null || minor === undefined) return '待查';
  return '¥' + (minor / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
