export function parseTimeOfDay(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function formatTimeOfDay(value) {
  if (!Number.isFinite(value)) return '待填写';
  const dayOffset = Math.floor(value / 1440);
  const minuteOfDay = ((Math.round(value) % 1440) + 1440) % 1440;
  const hours = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
  const minutes = String(minuteOfDay % 60).padStart(2, '0');
  const prefix = dayOffset === 0 ? '' : dayOffset === 1 ? '次日 ' : dayOffset === -1 ? '前一天 ' : dayOffset < 0 ? `前 ${-dayOffset} 天 ` : `+${dayOffset} 天 `;
  return prefix + hours + ':' + minutes;
}

function dateNumber(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const timestamp = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp / 86400000 : null;
}

export function calculateDaySchedule({ places = [], timing = {}, date = '' } = {}) {
  const startTime = parseTimeOfDay(timing.startTime || '09:00');
  const baseDate = dateNumber(date);
  let previousDeparture = startTime;
  let previousId = null;

  return places.map((place, index) => {
    const visit = timing.visits?.[place.id] || {};
    const route = visit.route || null;
    const duration = route?.durationSeconds;
    const durationKnown = duration !== null && duration !== undefined && Number.isFinite(Number(duration)) && Number(duration) >= 0;
    const transitDepartureSpecified = route?.mode === 'transit' && Boolean(route.departureDate || route.departureTime);
    const transitDepartureDate = transitDepartureSpecified ? dateNumber(route.departureDate) : null;
    const transitDepartureTime = transitDepartureSpecified ? parseTimeOfDay(route.departureTime) : null;
    // 指定出发时间的公交快照只适用于相同日期和前一段的实际离开时刻。
    const transitDepartureMatches = !transitDepartureSpecified || (baseDate !== null && transitDepartureDate !== null
      && transitDepartureTime !== null && previousDeparture !== null
      && (transitDepartureDate - baseDate) * 1440 + transitDepartureTime === previousDeparture);
    const routeMatches = Boolean(
      route
      && !route.staleReason
      && transitDepartureMatches
      && route.toPlaceId === place.id
      && (index === 0 ? Boolean(route.fromPlaceId) && !places.some((item) => item.id === route.fromPlaceId) : route.fromPlaceId === previousId)
      && (!date || !route.queryDate || route.queryDate === date),
    );
    const travelMinutes = routeMatches && durationKnown ? Math.ceil(Number(duration) / 60) : null;
    const expectedArrival = travelMinutes !== null && previousDeparture !== null
      ? previousDeparture + travelMinutes
      : null;
    const clockArrival = parseTimeOfDay(visit.fixedArrivalTime || '');
    const fixedDate = dateNumber(visit.fixedArrivalDate);
    // 无日期的旧数据保持当天含义；有明确日期但无法换算时，不猜测其时间。
    const fixedArrival = clockArrival === null || visit.fixedArrivalDateUnknown ? null : visit.fixedArrivalDate
      ? (baseDate !== null && fixedDate !== null ? clockArrival + (fixedDate - baseDate) * 1440 : null)
      : clockArrival;
    const arrival = clockArrival !== null ? fixedArrival : expectedArrival;
    const rawStay = visit.stayMinutes;
    const stayMinutes = rawStay !== null && rawStay !== undefined && rawStay !== ''
      && Number.isInteger(Number(rawStay)) && Number(rawStay) >= 0 && Number(rawStay) <= 1440
      ? Number(rawStay)
      : null;
    const leave = arrival !== null && stayMinutes !== null ? arrival + stayMinutes : null;
    const routeStale = Boolean(route && !routeMatches);
    const conflict = fixedArrival !== null && expectedArrival !== null && fixedArrival < expectedArrival;

    const result = {
      place,
      travelMinutes,
      arrival,
      leave,
      stayMinutes,
      fixedArrivalTime: visit.fixedArrivalTime || '',
      fixedArrivalDate: visit.fixedArrivalDate || '',
      fixedDateUnknown: Boolean(clockArrival !== null && (visit.fixedArrivalDateUnknown || (visit.fixedArrivalDate && fixedArrival === null))),
      routeStale,
      routeQueriedAt: route?.queriedAt || '',
      routeMode: route?.mode || '',
      conflict,
    };
    previousDeparture = leave;
    previousId = place.id;
    return result;
  });
}
