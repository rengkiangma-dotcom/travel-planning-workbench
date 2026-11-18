import { describe, it, expect } from 'vitest';
import { calculateDaySchedule, formatTimeOfDay, parseTimeOfDay } from './schedule.js';

const places = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];

describe('daily schedule time calculation', () => {
  it('按已保存的交通时长与每次停留时间连续计算', () => {
    const rows = calculateDaySchedule({
      places,
      date: '2026-11-15',
      timing: {
        startTime: '09:00',
        visits: {
          a: { route: { fromPlaceId: 'trip-origin', toPlaceId: 'a', durationSeconds: 1200, queryDate: '2026-11-15' }, stayMinutes: 90 },
          b: { route: { fromPlaceId: 'a', toPlaceId: 'b', durationSeconds: 1500, queryDate: '2026-11-15' }, stayMinutes: 60 },
          c: { route: { fromPlaceId: 'b', toPlaceId: 'c', durationSeconds: 600, queryDate: '2026-11-15' }, stayMinutes: 30 },
        },
      },
    });
    expect(rows.map((row) => [row.arrival, row.leave])).toEqual([[560, 650], [675, 735], [745, 775]]);
    expect(rows.map((row) => row.routeStale)).toEqual([false, false, false]);
  });

  it('路线或停留时间缺失时显示待填写，不按 0 计算后续时间', () => {
    const rows = calculateDaySchedule({
      places,
      timing: { startTime: '09:00', visits: { a: { stayMinutes: 90 }, b: { route: { fromPlaceId: 'a', toPlaceId: 'b', durationSeconds: 600 } } } },
    });
    expect(rows[0].arrival).toBe(null);
    expect(rows[0].leave).toBe(null);
    expect(rows[1].arrival).toBe(null);
    expect(formatTimeOfDay(rows[1].arrival)).toBe('待填写');
  });

  it('调整地点顺序后，前后地点不匹配的路线标记过期', () => {
    const timing = { startTime: '09:00', visits: {
      a: { route: { fromPlaceId: 'trip-origin', toPlaceId: 'a', durationSeconds: 600 } },
      b: { route: { fromPlaceId: 'a', toPlaceId: 'b', durationSeconds: 600 } },
    } };
    const rows = calculateDaySchedule({ places: [places[1], places[0]], timing });
    expect(rows[0].routeStale).toBe(true);
    expect(rows[0].arrival).toBe(null);
    expect(rows[1].routeStale).toBe(true);
  });

  it('固定预约可锚定到达时间，并提示早于预计到达的冲突', () => {
    const rows = calculateDaySchedule({
      places: [places[0]],
      timing: { startTime: '09:00', visits: {
        a: { route: { fromPlaceId: 'trip-origin', toPlaceId: 'a', durationSeconds: 1800 }, fixedArrivalTime: '09:20', stayMinutes: 60 },
      } },
    });
    expect(rows[0].arrival).toBe(560);
    expect(rows[0].leave).toBe(620);
    expect(rows[0].conflict).toBe(true);
  });

  it('跨午夜继续显示次日时间，拒绝非法时钟值', () => {
    expect(parseTimeOfDay('23:50')).toBe(1430);
    expect(parseTimeOfDay('24:00')).toBe(null);
    expect(formatTimeOfDay(1455)).toBe('次日 00:15');
    expect(formatTimeOfDay(2890)).toBe('+2 天 00:10');
  });

  it('路线查询日期与当前日不一致时标记过期', () => {
    const rows = calculateDaySchedule({
      places: [places[0]],
      date: '2026-11-16',
      timing: { startTime: '09:00', visits: {
        a: { route: { fromPlaceId: 'trip-origin', toPlaceId: 'a', durationSeconds: 600, queryDate: '2026-11-15' } },
      } },
    });
    expect(rows[0].routeStale).toBe(true);
    expect(rows[0].arrival).toBe(null);
  });

  it('跨午夜预约保留用户指定日期，按完整日期判断冲突', () => {
    const rows = calculateDaySchedule({
      places: [places[0]], date: '2026-11-15',
      timing: { startTime: '23:50', visits: { a: {
        route: { fromPlaceId: 'trip-origin', toPlaceId: 'a', durationSeconds: 1200 },
        fixedArrivalTime: '00:15', fixedArrivalDate: '2026-11-16', stayMinutes: 30,
      } } },
    });
    expect(rows[0]).toMatchObject({ arrival: 1455, leave: 1485, conflict: false });
    const conflicting = calculateDaySchedule({
      places: [places[0]], date: '2026-11-15',
      timing: { startTime: '23:50', visits: { a: {
        route: { fromPlaceId: 'trip-origin', toPlaceId: 'a', durationSeconds: 1200 },
        fixedArrivalTime: '00:05', fixedArrivalDate: '2026-11-16', stayMinutes: 30,
      } } },
    });
    expect(conflicting[0]).toMatchObject({ arrival: 1445, conflict: true });
  });

  it('标记过期的路线不再计入时间', () => {
    const rows = calculateDaySchedule({ places: [places[0]], timing: { visits: { a: {
      route: { fromPlaceId: 'old-hotel', toPlaceId: 'a', durationSeconds: 900, staleReason: '住宿已变化' },
    } } } });
    expect(rows[0]).toMatchObject({ routeStale: true, travelMinutes: null, arrival: null });
  });

  it('固定日期无效时不把预计到达冒充固定到达', () => {
    const rows = calculateDaySchedule({ places: [places[0]], date: '', timing: { visits: { a: {
      route: { fromPlaceId: 'trip-origin', toPlaceId: 'a', durationSeconds: 600 },
      fixedArrivalTime: '10:00', fixedArrivalDate: '2026-11-16', stayMinutes: 30,
    } } } });
    expect(rows[0]).toMatchObject({ fixedDateUnknown: true, arrival: null, leave: null });
    expect(formatTimeOfDay(-15)).toBe('前一天 23:45');
  });

  it('指定公交出发时间必须与上一段实际离开日期和时间一致，未知或不一致不计时', () => {
    const route = { fromPlaceId: 'trip-origin', toPlaceId: 'a', durationSeconds: 1200, mode: 'transit', departureDate: '2026-11-15', departureTime: '10:00' };
    const input = (startTime, date = '2026-11-15') => ({ places: [places[0]], date, timing: { startTime, visits: { a: { route } } } });
    expect(calculateDaySchedule(input('10:00'))[0]).toMatchObject({ routeStale: false, travelMinutes: 20, arrival: 620 });
    expect(calculateDaySchedule(input('09:00'))[0]).toMatchObject({ routeStale: true, travelMinutes: null, arrival: null });
    expect(calculateDaySchedule(input('10:00', ''))[0]).toMatchObject({ routeStale: true, travelMinutes: null, arrival: null });
    expect(calculateDaySchedule(input('10:00', '2026-11-16'))[0]).toMatchObject({ routeStale: true, travelMinutes: null, arrival: null });
    const missingPrevious = calculateDaySchedule({ places: [places[0], places[1]], date: '2026-11-15', timing: { startTime: '09:00', visits: {
      a: { stayMinutes: 30 }, b: { route: { ...route, fromPlaceId: 'a', toPlaceId: 'b' } },
    } } });
    expect(missingPrevious[1]).toMatchObject({ routeStale: true, travelMinutes: null, arrival: null });
  });

  it('公交跨日出发使用日期与前一站离开时间比较', () => {
    const rows = calculateDaySchedule({ places: [places[0], places[1]], date: '2026-11-15', timing: { startTime: '23:20', visits: {
      a: { route: { fromPlaceId: 'trip-origin', toPlaceId: 'a', durationSeconds: 600 }, stayMinutes: 40 },
      b: { route: { fromPlaceId: 'a', toPlaceId: 'b', durationSeconds: 900, mode: 'transit', departureDate: '2026-11-16', departureTime: '00:10' }, stayMinutes: 30 },
    } } });
    expect(rows[0].leave).toBe(1450);
    expect(rows[1]).toMatchObject({ routeStale: false, travelMinutes: 15, arrival: 1465 });
  });
});
