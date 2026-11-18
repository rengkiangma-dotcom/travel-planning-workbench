import { beforeEach, describe, it, expect } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useTripStore } from './trip.js';
import { STORAGE_KEY } from '../domain/state.js';

const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};

const baseForm = {
  mode: 'new', origin: '上海', destination: '杭州', start: '2026-11-14',
  days: 2, people: 2, budget: 3000, title: '', notes: '',
  existing: { outbound: '', returnTrip: '', hotel: '', schedule: '' },
};

beforeEach(() => {
  memory.clear();
  setActivePinia(createPinia());
});

describe('trip store', () => {
  it('新建行程：写入天数分组、默认打开地图、进入交通页', () => {
    const trip = useTripStore();
    trip.createTrip(baseForm);
    expect(trip.started).toBe(true);
    expect(trip.days).toBe(2);
    expect(trip.plans).toEqual([[], []]);
    expect(trip.mapOpen).toBe(true);
    expect(trip.section).toBe('traffic');
  });

  it('已有行程：进入概览并把分项写成原文', () => {
    const trip = useTripStore();
    trip.createTrip({
      ...baseForm,
      mode: 'existing',
      existing: { outbound: 'G123 上海虹桥 → 杭州东', returnTrip: '', hotel: '东城某酒店', schedule: '第 2 天上午预约博物馆' },
    });
    expect(trip.section).toBe('overview');
    expect(trip.original).toContain('去程交通：G123 上海虹桥 → 杭州东');
    expect(trip.original).toContain('已订住宿：东城某酒店');
    expect(trip.original).not.toContain('返程交通');
  });

  it('天数被夹在 1–7', () => {
    const trip = useTripStore();
    trip.createTrip({ ...baseForm, days: 99 });
    expect(trip.days).toBe(7);
    expect(trip.plans).toHaveLength(7);
  });

  it('非法板块与越界天号被忽略', () => {
    const trip = useTripStore();
    trip.createTrip(baseForm);
    trip.setSection('nope');
    expect(trip.section).toBe('traffic');
    trip.setDay(5);
    expect(trip.day).toBe(0);
    trip.setDay(1);
    expect(trip.day).toBe(1);
  });

  it('每次操作都写回同一个 localStorage 键', () => {
    const trip = useTripStore();
    trip.createTrip(baseForm);
    expect(JSON.parse(memory.get(STORAGE_KEY)).destination).toBe('杭州');
    trip.setSection('days');
    expect(JSON.parse(memory.get(STORAGE_KEY)).section).toBe('days');
  });
});
