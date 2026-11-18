import { describe, it, expect } from 'vitest';
import { makeQuote, lineTotalMinor, summarize } from './quote.js';

const base = {
  category: 'rail', source: '12306', kind: 'realQuote',
  amount: 553, currency: 'CNY', unit: 'perPerson', quantity: 1,
  queriedAt: '2026-11-13T07:00:00.000Z', validFor: '2026-11-14 G1234', note: '',
};

describe('quote', () => {
  it('真实报价换算成分并保留来源与时间', () => {
    const q = makeQuote(base);
    expect(q.amount).toBe(55300);
    expect(q.source).toBe('12306');
    expect(q.queriedAt).toBe('2026-11-13T07:00:00.000Z');
  });

  it('未知报价必须带原因，金额为 null', () => {
    const q = makeQuote({ category: 'admission', kind: 'unknown', unit: 'total', note: '门票价格未核实', source: 'user' });
    expect(q.amount).toBeNull();
    expect(q.kind).toBe('unknown');
    expect(() => makeQuote({ category: 'admission', kind: 'unknown', unit: 'total' })).toThrow(/原因/);
  });

  it('非未知报价缺金额或单位非法直接报错', () => {
    expect(() => makeQuote({ ...base, amount: null })).toThrow(/金额/);
    expect(() => makeQuote({ ...base, unit: 'perNight' })).toThrow(/计价单位/);
    expect(() => makeQuote({ ...base, kind: 'guess' })).toThrow(/报价类型/);
  });

  it('按单位计价：人数、房间夜、车辆', () => {
    const perPerson = makeQuote({ ...base, amount: 100, unit: 'perPerson', quantity: 1 });
    expect(lineTotalMinor(perPerson, { people: 2, rooms: 1, nights: 1 })).toBe(20000);
    const perRoom = makeQuote({ ...base, category: 'lodging', amount: 368, unit: 'perRoomNight', quantity: 1 });
    expect(lineTotalMinor(perRoom, { people: 2, rooms: 2, nights: 3 })).toBe(368 * 2 * 3 * 100);
    const perVehicle = makeQuote({ ...base, category: 'localTransit', amount: 40, unit: 'perVehicle', quantity: 2 });
    expect(lineTotalMinor(perVehicle, { people: 5, rooms: 1, nights: 1 })).toBe(8000);
  });

  it('汇总时未知不计入总额，但单独计数', () => {
    const known = makeQuote({ ...base, amount: 553 });
    const unknown = makeQuote({ category: 'admission', kind: 'unknown', unit: 'total', note: '门票待查', source: 'user' });
    const result = summarize([known, unknown], { people: 2, rooms: 1, nights: 2 });
    expect(result.totalMinor).toBe(110600);
    expect(result.unknownCount).toBe(1);
    expect(result.byCategory.rail).toBe(110600);
  });
});
