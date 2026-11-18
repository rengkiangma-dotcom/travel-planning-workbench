/* 已选 12306 方案的读取与合计；未确认或需求已变时一律视为无效。 */

export function tripSignature(state) {
  return [state.origin, state.destination, state.start, state.days].join('|');
}

export function legFare(leg) {
  if (!leg) return null;
  if (Array.isArray(leg.legs)) return leg.legs.reduce((sum, one) => sum + one.seat.price, 0);
  return leg.seat?.price ?? null;
}

export function seatsAvailable(train) {
  return (train.seats || [])
    .filter((s) => s.available && s.price !== null)
    .sort((a, b) => a.price - b.price || (a.name === '无座' ? 1 : 0) - (b.name === '无座' ? 1 : 0));
}

export function minFare(trains) {
  const values = trains.flatMap((t) => seatsAvailable(t).map((s) => s.price));
  return values.length ? Math.min(...values) : null;
}

export function ticketsFor(state) {
  const saved = state.liveTickets;
  return saved && saved.signature === tripSignature(state) ? saved : null;
}

export function ticketsTotal(state) {
  const saved = ticketsFor(state);
  if (!saved) return 0;
  return [saved.outbound, saved.inbound]
    .filter(Boolean)
    .reduce((sum, leg) => sum + (legFare(leg) || 0), 0);
}

export function ticketsLabel(state) {
  const saved = ticketsFor(state);
  if (!saved) return '';
  const legs = [saved.outbound, saved.inbound].filter(Boolean);
  if (!legs.length) return '';
  return legs.length === 2 ? '已选真实往返' : '已选真实单程';
}
