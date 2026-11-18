import { describe, it, expect } from 'vitest';
import { budgetOf } from './budget.js';
import { fresh } from './state.js';

const demo = {
  places: [
    { id: 'free', name: '免费的', cost: 0 },
    { id: 'paid', name: '收费的', cost: 75 },
  ],
  hotels: [{ id: 'metro', name: '地铁旁', price: 268, tag: '出行方便' }],
  transport: [{ id: 'rail', name: '高铁往返', cost: 160 }],
};

function trip(overrides = {}) {
  return {
    ...fresh(), started: true, days: 3, people: 2, rooms: 1,
    plans: [[], [], []], ...overrides,
  };
}

describe('budgetOf', () => {
  it('没有交通住宿时只算餐饮预留', () => {
    const result = budgetOf(trip(), demo);
    expect(result.daily).toBe(600);
    expect(result.total).toBe(600);
    expect(result.transportName).toBe('');
    expect(result.stayName).toBe('稍后再选');
  });

  it('交通按人数，住宿按房间夜', () => {
    const result = budgetOf(trip({ transport: 'rail', hotel: 'metro' }), demo);
    expect(result.rail).toBe(320);
    expect(result.stay).toBe(268 * 2 * 1);
    expect(result.total).toBe(320 + 536 + 600);
  });

  it('门票按人数累加，未知票价单独计数且不计零', () => {
    const result = budgetOf(trip({
      plans: [['paid', 'custom:1'], [], []],
      customPlaces: { 'custom:1': { id: 'custom:1', name: '真实地点', cost: null } },
    }), demo);
    expect(result.tickets).toBe(150);
    expect(result.missingTickets).toBe(1);
  });

  it('地图选的住宿优先显示名字，但不计价', () => {
    const result = budgetOf(trip({ mapStay: { name: '湖滨某处' } }), demo);
    expect(result.stayName).toBe('湖滨某处');
    expect(result.stay).toBe(0);
  });

  it('一天行程只算 0 晚住宿，不出现负数', () => {
    const result = budgetOf(trip({ days: 1, plans: [[]], hotel: 'metro' }), demo);
    expect(result.stay).toBe(0);
  });

  it('已选 12306 往返优先于示例交通，并按人计', () => {
    const signature = ['上海', '杭州', '2026-11-14', 3].join('|');
    const leg = (price) => ({ seat: { name: '二等座', price } });
    const result = budgetOf(trip({
      transport: 'rail',
      liveTickets: { signature, outbound: leg(160), inbound: leg(138) },
    }), demo);
    expect(result.rail).toBe(298 * 2);
    expect(result.transportName).toBe('已选真实往返');
    expect(result.total).toBe(596 + 600);
  });
});
