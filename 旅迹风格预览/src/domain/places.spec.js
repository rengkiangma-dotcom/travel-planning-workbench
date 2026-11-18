import { describe, it, expect } from 'vitest';
import { placeById, canAddPlace, withAdded, withRemoved, withSwapped, withMovedDay, samplePlans } from './places.js';

const demo = [
  { id: 'lingyin', name: '灵隐寺', cost: 75 },
  { id: 'hefang', name: '河坊街', cost: 0 },
];
const base = { destination: '杭州', origin: '上海', customPlaces: { 'poi:x': { id: 'poi:x', name: '真实地点' } }, plans: [[], [], []] };

describe('places', () => {
  it('示例地点与自建地点都能按 id 找到', () => {
    expect(placeById(base, 'lingyin', demo).name).toBe('灵隐寺');
    expect(placeById(base, 'poi:x', demo).name).toBe('真实地点');
    expect(placeById(base, 'nope', demo)).toBe(null);
  });

  it('重复地点、越界天号、非杭州示例都不允许加入', () => {
    expect(canAddPlace(base, 'lingyin', 0, demo)).toBe(true);
    expect(canAddPlace({ ...base, plans: [['lingyin'], [], []] }, 'lingyin', 1, demo)).toBe(false);
    expect(canAddPlace(base, 'lingyin', 3, demo)).toBe(false);
    expect(canAddPlace({ ...base, destination: '苏州' }, 'lingyin', 0, demo)).toBe(false);
    expect(canAddPlace({ ...base, destination: '苏州' }, 'poi:x', 0, demo)).toBe(true);
  });

  it('加入、移除、交换与跨天移动都不改原数组', () => {
    const plans = [['a', 'b'], ['c'], []];
    expect(withAdded(plans, 1, 'd')).toEqual([['a', 'b'], ['c', 'd'], []]);
    expect(withRemoved(plans, 0, 'a')).toEqual([['b'], ['c'], []]);
    expect(withSwapped(plans, 0, 0, 1)).toEqual([['b', 'a'], ['c'], []]);
    expect(withSwapped(plans, 0, 0, 9)).toBe(plans);
    expect(withMovedDay(plans, 0, 2, 'b')).toEqual([['a'], ['c'], ['b']]);
    expect(withMovedDay(plans, 0, 2, 'zzz')).toBe(plans);
    expect(plans).toEqual([['a', 'b'], ['c'], []]);
  });

  it('示例只填前三天，其余天留空', () => {
    expect(samplePlans(3)[0]).toEqual(['broken', 'bai', 'quyuan']);
    expect(samplePlans(5)[4]).toEqual([]);
  });
});
