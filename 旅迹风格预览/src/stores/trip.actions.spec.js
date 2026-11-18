import { beforeEach, describe, it, expect } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useTripStore } from './trip.js';
import { calculateDaySchedule } from '../domain/schedule.js';

const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};

const form = {
  mode: 'new', origin: '上海', destination: '杭州', start: '2026-11-14',
  days: 3, people: 2, budget: 3000, title: '', notes: '',
};

function start(overrides = {}) {
  const trip = useTripStore();
  trip.createTrip({ ...form, ...overrides });
  return trip;
}

beforeEach(() => {
  memory.clear();
  setActivePinia(createPinia());
});

describe('trip 行程清单', () => {
  it('加地点、拒绝重复，并能撤销', () => {
    const trip = start();
    expect(trip.addPlace('lingyin', 1)).toBe(true);
    expect(trip.plans[1]).toEqual(['lingyin']);
    expect(trip.day).toBe(1);
    expect(trip.addPlace('lingyin', 2)).toBe(false);
    expect(trip.undoPlans()).toBe(true);
    expect(trip.plans[1]).toEqual([]);
  });

  it('上下移动、跨天移动与移除都会留下撤销点', () => {
    const trip = start();
    trip.addPlace('lingyin', 0);
    trip.addPlace('hefang', 0);
    expect(trip.movePlace('hefang', -1)).toBe(true);
    expect(trip.plans[0]).toEqual(['hefang', 'lingyin']);
    expect(trip.movePlace('hefang', -1)).toBe(false);
    expect(trip.movePlaceToDay('lingyin', 2)).toBe(true);
    expect(trip.plans[0]).toEqual(['hefang']);
    expect(trip.plans[2]).toEqual(['lingyin']);
    expect(trip.removePlace('lingyin', 2)).toBe(true);
    expect(trip.plans[2]).toEqual([]);
    expect(trip.undo.length).toBe(5);
  });

  it('每日时间、固定预约与路线快照按具体访问保存', () => {
    const trip = start();
    trip.addPlace('lingyin', 0);
    expect(trip.setDayStartTime(0, '08:30')).toBe(true);
    expect(trip.setDayStartTime(0, '25:00')).toBe(false);
    expect(trip.setPlaceStayMinutes(0, 'lingyin', '90')).toBe(true);
    expect(trip.setFixedArrivalTime(0, 'lingyin', '09:30')).toBe(true);
    expect(trip.saveDailyRoute(0, 'lingyin', {
      fromPlaceId: 'trip-origin', toPlaceId: 'lingyin', fromName: '上海', mode: 'driving',
      durationSeconds: 1200, queriedAt: '2026-11-15T08:00:00.000Z', queryDate: '2026-11-14',
      routeIndex: 1, distance: 1600, fare: null, paths: [[[120.1, 30.1], [120.2, 30.2]]], instructions: ['沿道路前行'],
    })).toBe(true);
    expect(trip.dailyTiming[0].startTime).toBe('08:30');
    expect(trip.dailyTiming[0].visits.lingyin.stayMinutes).toBe(90);
    expect(trip.dailyTiming[0].visits.lingyin.route.durationSeconds).toBe(1200);
    expect(trip.dailyTiming[0].visits.lingyin.route).toMatchObject({ routeIndex: 1, distance: 1600, fare: null, paths: [[[120.1, 30.1], [120.2, 30.2]]], instructions: ['沿道路前行'] });
    expect(trip.saveDailyRoute(1, 'lingyin', { fromPlaceId: 'trip-origin' })).toBe(false);
  });

  it('跨天移动迁移访问资料并能撤销，不覆盖目标日已有记录', () => {
    const trip = start();
    trip.addPlace('lingyin', 0);
    trip.setPlaceStayMinutes(0, 'lingyin', 90);
    trip.setFixedArrivalTime(0, 'lingyin', '09:30');
    trip.setFixedArrivalDate(0, 'lingyin', '2026-11-15');
    trip.saveDailyRoute(0, 'lingyin', { fromPlaceId: 'trip-origin', durationSeconds: 1200, queryDate: '2026-11-14' });
    trip.setPlaceStayMinutes(1, 'hefang', 45);
    expect(trip.movePlaceToDay('lingyin', 1, 0)).toBe(true);
    expect(trip.dailyTiming[0].visits.lingyin).toBeUndefined();
    expect(trip.dailyTiming[1].visits.lingyin).toMatchObject({ stayMinutes: 90, fixedArrivalTime: '09:30', fixedArrivalDate: '2026-11-15', route: { durationSeconds: 1200 } });
    expect(trip.dailyTiming[1].visits.lingyin.route.staleReason).toBeTruthy();
    expect(trip.dailyTiming[1].visits.hefang.stayMinutes).toBe(45);
    trip.setPlaceStayMinutes(1, 'lingyin', 120);
    expect(trip.undoPlans()).toBe(true);
    expect(trip.plans[0]).toContain('lingyin');
    expect(trip.dailyTiming[0].visits.lingyin.stayMinutes).toBe(120);
    expect(trip.dailyTiming[1].visits.lingyin).toBeUndefined();
    expect(trip.dailyTiming[1].visits.hefang.stayMinutes).toBe(45);
    trip.setPlaceStayMinutes(2, 'lingyin', 12);
    expect(trip.movePlaceToDay('lingyin', 2, 0)).toBe(false);
    expect(trip.dailyTiming[0].visits.lingyin.stayMinutes).toBe(120);
    expect(trip.dailyTiming[2].visits.lingyin.stayMinutes).toBe(12);
  });

  it('修改住宿后仅标记以旧住宿为起点的首段路线过期', () => {
    const trip = start();
    const stay = { id: 'old-stay', name: '旧住宿', gcj02: '120.71,30.21' };
    trip.setMapStay(stay);
    trip.addPlace('lingyin', 0);
    trip.saveDailyRoute(0, 'lingyin', { fromPlaceId: trip.mapStay.id, durationSeconds: 900 });
    expect(trip.dailyTiming[0].visits.lingyin.route.staleReason).toBeUndefined();
    trip.setMapStay({ id: 'new-stay', name: '新住宿', gcj02: '120.72,30.22' });
    expect(trip.dailyTiming[0].visits.lingyin.route.staleReason).toBeTruthy();
    expect(trip.dailyTiming[0].visits.lingyin.route.durationSeconds).toBe(900);
  });

  it('移动后才设置的停留时间在撤销移动时跟随地点', () => {
    const trip = start();
    trip.addPlace('lingyin', 0);
    expect(trip.movePlaceToDay('lingyin', 1, 0)).toBe(true);
    trip.setPlaceStayMinutes(1, 'lingyin', 45);
    expect(trip.undoPlans()).toBe(true);
    expect(trip.dailyTiming[0].visits.lingyin.stayMinutes).toBe(45);
    expect(trip.dailyTiming[1].visits.lingyin).toBeUndefined();
  });

  it('撤销跨天移动时恢复未改变的原路线；改查后的路线不冒充原日期有效', () => {
    const trip = start();
    trip.addPlace('lingyin', 0);
    trip.saveDailyRoute(0, 'lingyin', { fromPlaceId: 'trip-origin', durationSeconds: 600, queryDate: '2026-11-14' });
    const oldRoute = { ...trip.dailyTiming[0].visits.lingyin.route };
    expect(trip.movePlaceToDay('lingyin', 1, 0)).toBe(true);
    trip.setPlaceStayMinutes(1, 'lingyin', 45);
    expect(trip.undoPlans()).toBe(true);
    expect(trip.dailyTiming[0].visits.lingyin.route).toEqual(oldRoute);
    expect(trip.dailyTiming[0].visits.lingyin.stayMinutes).toBe(45);

    expect(trip.movePlaceToDay('lingyin', 1, 0)).toBe(true);
    trip.saveDailyRoute(1, 'lingyin', { fromPlaceId: 'trip-origin', durationSeconds: 1200 });
    expect(trip.undoPlans()).toBe(true);
    const newRoute = trip.dailyTiming[0].visits.lingyin.route;
    expect(newRoute.durationSeconds).toBe(1200);
    expect(newRoute.staleReason).toBeTruthy();
    expect(calculateDaySchedule({ places: [{ id: 'lingyin' }], date: trip.start, timing: trip.dailyTiming[0] })[0].travelMinutes).toBeNull();
  });

  it('旧预约日期未知时跨天保留未知，填写行程起始日期不能自动猜测', () => {
    const trip = start({ start: '' });
    trip.addPlace('lingyin', 0);
    trip.dailyTiming = { 0: { startTime: '09:00', visits: { lingyin: { fixedArrivalTime: '09:30', stayMinutes: 30 } } } };
    expect(trip.movePlaceToDay('lingyin', 1, 0)).toBe(true);
    expect(trip.setStart('2026-11-15')).toBe(true);
    let row = calculateDaySchedule({ places: [{ id: 'lingyin' }], date: '2026-11-16', timing: trip.dailyTiming[1] })[0];
    expect(row.fixedDateUnknown).toBe(true);
    expect(row.arrival).toBeNull();
    expect(trip.setFixedArrivalDate(1, 'lingyin', '2026-11-17')).toBe(true);
    row = calculateDaySchedule({ places: [{ id: 'lingyin' }], date: '2026-11-16', timing: trip.dailyTiming[1] })[0];
    expect(row.fixedDateUnknown).toBe(false);
    expect(row.arrival).toBe(2010);
  });

  it('恢复旧格式撤销记录时没有路线基线，保留路线并谨慎标为过期', () => {
    const trip = start();
    const route = { fromPlaceId: 'trip-origin', toPlaceId: 'lingyin', durationSeconds: 600 };
    const original = { route, stayMinutes: 45 };
    trip.plans = [[], ['lingyin'], []];
    trip.dailyTiming = { 1: { visits: { lingyin: original } } };
    trip.undo = [JSON.stringify({ plans: [['lingyin'], [], []], timingTransfer: { fromDay: 0, toDay: 1, id: 'lingyin', original } })];
    expect(trip.undoPlans()).toBe(true);
    expect(trip.dailyTiming[0].visits.lingyin.route).toMatchObject({ durationSeconds: 600, staleReason: expect.any(String) });
    expect(trip.dailyTiming[0].visits.lingyin.stayMinutes).toBe(45);
  });

  it('最多 7 天，增加天数同步加空分组', () => {
    const trip = start({ days: 7 });
    expect(trip.addDay()).toBe(false);
    const seven = start({ days: 6 });
    expect(seven.addDay()).toBe(true);
    expect(seven.days).toBe(7);
    expect(seven.plans).toHaveLength(7);
  });

  it('增加一天后撤销，同步恢复天数并可从本地保存恢复原旅行', () => {
    const trip = start({ days: 2, title: '撤销后仍保留的旅行' });
    trip.addPlace('lingyin', 0);
    trip.setPlaceStayMinutes(0, 'lingyin', 90);
    expect(trip.addDay()).toBe(true);
    trip.setDay(2);
    expect(trip.undoPlans()).toBe(true);
    expect(trip.days).toBe(2);
    expect(trip.plans).toHaveLength(2);
    expect(trip.day).toBeLessThan(2);
    setActivePinia(createPinia());
    const restored = useTripStore();
    expect(restored.started).toBe(true);
    expect(restored.tripName).toBe('撤销后仍保留的旅行');
    expect(restored.days).toBe(2);
    expect(restored.plans[0]).toContain('lingyin');
    expect(restored.dailyTiming[0].visits.lingyin.stayMinutes).toBe(90);
  });

  it('示例只对杭州可用，载入后停在第一天', () => {
    const trip = start();
    expect(trip.loadSample()).toBe(true);
    expect(trip.plans[0]).toEqual(['broken', 'bai', 'quyuan']);
    expect(trip.day).toBe(0);
    expect(trip.section).toBe('days');
    const other = start({ destination: '苏州' });
    expect(other.loadSample()).toBe(false);
  });
});

describe('trip 交通与住宿选择', () => {
  it('选示例交通会把待定状态改成已选待购，但不覆盖已购票', () => {
    const trip = start();
    trip.selectTransport('rail');
    expect(trip.outStatus).toBe('已选待购');
    trip.setTransportStatus('outStatus', '已购票');
    trip.selectTransport('train');
    expect(trip.outStatus).toBe('已购票');
    expect(trip.transport).toBe('train');
  });

  it('选真实车票时清空示例交通，签名随需求变化', () => {
    const trip = start();
    trip.selectTransport('rail');
    trip.chooseTicket('outbound', { seat: { name: '二等座', price: 160 } });
    expect(trip.transport).toBe(null);
    expect(trip.outStatus).toBe('已选待购');
    expect(trip.tickets.signature).toBe('上海|杭州|2026-11-14|3');
    trip.applyRequirements({ origin: '上海', destination: '杭州', start: '2026-11-15', people: 2, budget: 3000, notes: '' });
    expect(trip.tickets).toBe(null);
  });

  it('住宿选择、房间数与要求都能保存', () => {
    const trip = start();
    expect(trip.selectHotel('metro')).toBe(true);
    expect(trip.hotel).toBe('metro');
    trip.setRooms(99);
    expect(trip.rooms).toBe(20);
    trip.setStayNotes('  无烟房  ');
    expect(trip.stayNotes).toBe('无烟房');
    expect(trip.selectHotel('nope')).toBe(false);
  });
});

describe('trip 需求变更与自建地点', () => {
  it('换目的地会清掉示例交通、酒店和示例地点，自建地点保留', () => {
    const trip = start();
    trip.selectTransport('rail');
    trip.selectHotel('metro');
    trip.addPlace('lingyin', 0);
    const custom = trip.saveCustomPlace({
      id: 'B001', name: '真实地点', city: '苏州', district: '姑苏区',
      gcj02: '120.6,31.3', wgs84: '120.59,31.29',
    });
    trip.addPlace(custom, 0);
    trip.applyRequirements({ origin: '上海', destination: '苏州', start: '2026-11-14', people: 2, budget: 3000, notes: '' });
    expect(trip.transport).toBe(null);
    expect(trip.hotel).toBe(null);
    expect(trip.plans[0]).toEqual([custom]);
  });

  it('坐标不合格的自建地点不保存', () => {
    const trip = start();
    expect(trip.saveCustomPlace({ id: 'x', name: '缺坐标' })).toBe(null);
    expect(trip.saveCustomPlace({ id: 'invalid-null', name: '空坐标', lng: null, lat: null })).toBe(null);
    expect(trip.saveCustomPlace({ id: 'invalid-blank', name: '空字符串坐标', lng: '', lat: '' })).toBe(null);
    expect(trip.savedPlaces).toEqual([]);
  });

  it('收藏及住宿保留真实入口和地点详情，缺失字段不覆盖已有资料', () => {
    const trip = start();
    const poi = { id: 'B020', name: '景点', gcj02: '120.6,36.1', entranceGcj02: '120.61,36.11', exitGcj02: '120.62,36.12', rating: '4.5', openingHoursToday: '09:00-17:00', photos: [{ title: '正门', url: 'https://example.com/a.jpg' }] };
    const id = trip.saveCustomPlace(poi);
    trip.saveCustomPlace({ id: 'B020', name: '景点', gcj02: '120.6,36.1' });
    expect(trip.customPlaces[id]).toMatchObject({ entranceGcj02: '120.61,36.11', exitGcj02: '120.62,36.12', rating: '4.5', openingHoursToday: '09:00-17:00', photos: poi.photos });
    expect(trip.setMapStay(poi)).toBe(true);
    expect(trip.mapStay).toMatchObject({ entranceGcj02: '120.61,36.11', exitGcj02: '120.62,36.12' });
  });

  it('加入行程不自动收藏，重复保存保留用户备注与费用', () => {
    const trip = start();
    const poi = { id: 'B002', name: '真实地点', city: '青岛', gcj02: '120.6,36.1', wgs84: '120.59,36.09' };
    const id = trip.saveCustomPlace(poi, { favorite: false });
    expect(id).toBe('poi:B002');
    expect(trip.savedPlaces).not.toContain(id);
    trip.customPlaces[id].note = '想看日落';
    trip.customPlaces[id].cost = 35;
    trip.saveCustomPlace({ ...poi, name: '真实地点新名称' }, { favorite: false });
    expect(trip.customPlaces[id].name).toBe('真实地点新名称');
    expect(trip.customPlaces[id].note).toBe('想看日落');
    expect(trip.customPlaces[id].cost).toBe(35);
  });

  it('收藏、想去与加入当天是三种独立状态', () => {
    const trip = start();
    const id = trip.addWishPlace({ id: 'B003', name: '想去地点', gcj02: '120.8,36.3', wgs84: '120.79,36.29' });
    expect(id).toBe('poi:B003');
    expect(trip.wishPlaces).toContain(id);
    expect(trip.savedPlaces).not.toContain(id);
    expect(trip.plans[0]).not.toContain(id);
    expect(trip.addPlace(id, 0)).toBe(true);
    expect(trip.wishPlaces).toContain(id);
    trip.removeWishPlace(id);
    expect(trip.wishPlaces).not.toContain(id);
    expect(trip.plans[0]).toContain(id);
  });

  it('取消收藏只移除收藏标记，已经安排的每日地点保留', () => {
    const trip = start();
    const id = trip.saveCustomPlace({ id: 'B004', name: '已安排地点', gcj02: '120.81,36.31', wgs84: '120.8,36.3' });
    expect(trip.savedPlaces).toContain(id);
    expect(trip.addPlace(id, 0)).toBe(true);
    trip.removeSavedPlace(id);
    expect(trip.savedPlaces).not.toContain(id);
    expect(trip.plans[0]).toContain(id);
    expect(trip.customPlaces[id].name).toBe('已安排地点');
  });

  it('右键坐标可作为内部地点加入，住宿位置独立保存', () => {
    const trip = start();
    const coordinateId = trip.saveCustomPlace({ name: '地图选点', gcj02: '120.7,36.2', wgs84: '120.69,36.19' }, { favorite: false });
    expect(coordinateId).toBe('map:120.7,36.2');
    expect(trip.addPlace(coordinateId, 0)).toBe(true);
    expect(trip.savedPlaces).not.toContain(coordinateId);
    expect(trip.setMapStay({ name: '住宿位置', gcj02: '120.71,36.21', wgs84: '120.7,36.2' })).toBe(true);
    expect(trip.mapStay.name).toBe('住宿位置');
    expect(trip.hotel).toBe(null);
    trip.clearMapStay();
    expect(trip.mapStay).toBe(null);
  });

  it('示例地点只有经纬度时，收藏会补齐 GCJ-02 与 WGS-84', () => {
    const trip = start();
    const id = trip.saveCustomPlace({
      id: 'broken', name: '断桥残雪', lng: 120.1488, lat: 30.2595,
    });
    expect(id).toBe('poi:broken');
    expect(trip.savedPlaces).toContain(id);
    expect(trip.customPlaces[id].gcj02).toMatch(/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/);
    expect(trip.customPlaces[id].wgs84).toMatch(/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/);
    expect(trip.customPlaces[id].gcj02).not.toBe(trip.customPlaces[id].wgs84);
  });
});
