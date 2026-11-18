import { describe, it, expect } from 'vitest';
import { fresh, normalize, load, save, STORAGE_KEY, SECTIONS } from './state.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

describe('state', () => {
  it('空值与坏 JSON 都回到完整默认值', () => {
    const base = normalize(null);
    expect(base.started).toBe(false);
    expect(base.days).toBe(3);
    expect(base.plans).toEqual([[], [], []]);
    expect(base.version).toBe(1);
    expect(normalize('not-an-object').started).toBe(false);
  });

  it('天数与分组数不一致时整体回退，不做半截修补', () => {
    const bad = { ...fresh(), started: true, days: 3, plans: [[]] };
    expect(normalize(bad).started).toBe(false);
  });

  it('越界的天号和未知板块被夹回合法值', () => {
    const raw = { ...fresh(), started: true, days: 3, day: 9, section: 'nope', plans: [[], [], []] };
    const state = normalize(raw);
    expect(state.day).toBe(2);
    expect(state.section).toBe('overview');
    expect(SECTIONS.some((s) => s.id === 'days')).toBe(true);
  });

  it('保留旧版写入的扩展字段', () => {
    const raw = {
      ...fresh(), started: true, days: 2, plans: [[], []],
      liveTickets: { signature: 'x', outbound: { train: 'G1' } },
      mapStay: { name: '湖滨' }, leftView: 'chat',
    };
    const state = normalize(raw);
    expect(state.liveTickets.outbound.train).toBe('G1');
    expect(state.mapStay.name).toBe('湖滨');
    expect(state.leftView).toBe('chat');
  });

  it('读写使用同一个键，能原样读回', () => {
    const storage = memoryStorage();
    const state = normalize({ ...fresh(), started: true, days: 2, plans: [[], []], budget: 4321 });
    save(state, storage);
    expect(JSON.parse(storage.getItem(STORAGE_KEY)).budget).toBe(4321);
    expect(load(storage).budget).toBe(4321);
  });

  it('存储抛错时不崩溃，返回默认值', () => {
    const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(load(storage).started).toBe(false);
    expect(() => save(fresh(), storage)).not.toThrow();
  });
});
