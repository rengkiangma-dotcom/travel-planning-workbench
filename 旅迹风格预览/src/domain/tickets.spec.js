import { describe, it, expect } from 'vitest';
import { tripSignature, legFare, seatsAvailable, minFare, ticketsFor, ticketsTotal, ticketsLabel } from './tickets.js';

const state = { origin: '上海', destination: '杭州', start: '2026-11-14', days: 3 };
const signature = '上海|杭州|2026-11-14|3';

const leg = (price) => ({ date: '2026-11-14', train: 'G1', from: '上海虹桥', to: '杭州东', seat: { name: '二等座', price } });

describe('tickets', () => {
  it('签名随出发地、目的地、日期、天数变化', () => {
    expect(tripSignature(state)).toBe(signature);
    expect(tripSignature({ ...state, days: 4 })).not.toBe(signature);
  });

  it('换乘方案按分段票价合计', () => {
    const transfer = { legs: [{ seat: { price: 70 } }, { seat: { price: 55 } }] };
    expect(legFare(transfer)).toBe(125);
    expect(legFare(leg(160))).toBe(160);
    expect(legFare(null)).toBe(null);
  });

  it('只统计有票且有价的席别，无座排最后', () => {
    const train = {
      seats: [
        { name: '无座', available: true, price: 100 },
        { name: '二等座', available: true, price: 100 },
        { name: '一等座', available: false, price: 160 },
        { name: '商务座', available: true, price: null },
      ],
    };
    expect(seatsAvailable(train).map((s) => s.name)).toEqual(['二等座', '无座']);
    expect(minFare([train])).toBe(100);
    expect(minFare([{ seats: [] }])).toBe(null);
  });

  it('需求变更后旧票据不再生效', () => {
    const saved = { signature, outbound: leg(160), inbound: leg(138) };
    expect(ticketsFor({ ...state, liveTickets: saved })).toBe(saved);
    expect(ticketsFor({ ...state, days: 4, liveTickets: saved })).toBe(null);
  });

  it('往返合计与标签跟着已选腿走', () => {
    const both = { ...state, liveTickets: { signature, outbound: leg(160), inbound: leg(138) } };
    expect(ticketsTotal(both)).toBe(298);
    expect(ticketsLabel(both)).toBe('已选真实往返');
    const one = { ...state, liveTickets: { signature, outbound: leg(160) } };
    expect(ticketsTotal(one)).toBe(160);
    expect(ticketsLabel(one)).toBe('已选真实单程');
    expect(ticketsLabel(state)).toBe('');
  });
});
