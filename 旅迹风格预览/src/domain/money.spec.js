import { describe, it, expect } from 'vitest';
import { toMinor, sumMinor, formatYuan } from './money.js';

describe('money', () => {
  it('元转分四舍五入到整数', () => {
    expect(toMinor(120.5)).toBe(12050);
    expect(toMinor('12.34')).toBe(1234);
    expect(toMinor(0)).toBe(0);
  });

  it('未知金额保持 null，不当 0', () => {
    expect(toMinor(null)).toBeNull();
    expect(toMinor(undefined)).toBeNull();
    expect(toMinor('')).toBeNull();
    expect(toMinor('abc')).toBeNull();
  });

  it('先各自换算再相加，避免浮点误差', () => {
    expect(sumMinor([toMinor(0.1), toMinor(0.2)])).toBe(30);
    expect(sumMinor([null, 100, undefined])).toBe(100);
  });

  it('按分显示，未知显示待查', () => {
    expect(formatYuan(300000)).toBe('¥3,000');
    expect(formatYuan(12050)).toBe('¥120.5');
    expect(formatYuan(null)).toBe('待查');
  });
});
