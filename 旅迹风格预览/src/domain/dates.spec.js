import { describe, it, expect } from 'vitest';
import { dateAt, dateIsoAt } from './dates.js';

describe('dateAt', () => {
  it('从出发日往后数，跨月正确', () => {
    expect(dateAt('2026-11-14', 0)).toBe('11月14日');
    expect(dateAt('2026-11-30', 1)).toBe('12月1日');
  });

  it('提供稳定的 ISO 日期供路线快照标记日期', () => {
    expect(dateIsoAt('2026-11-30', 1)).toBe('2026-12-01');
    expect(dateIsoAt('', 0)).toBe('');
  });

  it('日期无效时给出待定，不抛错', () => {
    expect(dateAt('', 0)).toBe('日期待定');
    expect(dateAt('2026-13-45', 0)).toBe('日期待定');
  });
});
