/* 地点查找与行程清单的纯函数；地图选点不在这里。 */

export function placeById(state, id, demoPlaces) {
  return demoPlaces.find((p) => p.id === id) || state.customPlaces?.[id] || null;
}

export function isSampleDestination(state) {
  return /杭州/.test(state.destination) && /上海/.test(state.origin);
}

export function canAddPlace(state, id, day, demoPlaces) {
  if (!id) return false;
  if (!Number.isInteger(day) || day < 0 || day >= state.plans.length) return false;
  if (!placeById(state, id, demoPlaces)) return false;
  if (state.plans.flat().includes(id)) return false;
  if (demoPlaces.some((p) => p.id === id) && !/杭州/.test(state.destination)) return false;
  return true;
}

export function withAdded(plans, day, id) {
  return plans.map((list, i) => (i === day ? [...list, id] : list));
}

export function withRemoved(plans, day, id) {
  return plans.map((list, i) => (i === day ? list.filter((x) => x !== id) : list));
}

export function withSwapped(plans, day, a, b) {
  const list = plans[day];
  if (!list || a < 0 || b < 0 || a >= list.length || b >= list.length) return plans;
  const copy = [...list];
  [copy[a], copy[b]] = [copy[b], copy[a]];
  return plans.map((one, i) => (i === day ? copy : one));
}

export function withMovedDay(plans, fromDay, toDay, id) {
  if (fromDay === toDay || !plans[fromDay] || !plans[toDay]) return plans;
  if (!plans[fromDay].includes(id)) return plans;
  return plans.map((list, i) => {
    if (i === fromDay) return list.filter((x) => x !== id);
    if (i === toDay) return [...list, id];
    return list;
  });
}

export const SAMPLE_PLANS = [['broken', 'bai', 'quyuan'], ['lingyin', 'longjing'], ['hefang']];

export function samplePlans(days) {
  return Array.from({ length: days }, (_, i) => [...(SAMPLE_PLANS[i] || [])]);
}
