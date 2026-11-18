/* 旧版 budget() 的等价实现：先保证数字一致，口径问题留给报价层计划。 */

import { ticketsFor, ticketsTotal, ticketsLabel } from './tickets.js';

export function budgetOf(state, demo) {
  const transport = demo.transport.find((t) => t.id === state.transport) || null;
  const hotel = demo.hotels.find((h) => h.id === state.hotel) || null;
  const placeById = (id) => demo.places.find((p) => p.id === id) || state.customPlaces?.[id] || null;

  const people = state.people || 0;
  const days = state.days || 0;
  const rooms = state.rooms || 1;

  const saved = ticketsFor(state);
  const live = saved && [saved.outbound, saved.inbound].some(Boolean) ? saved : null;
  const rail = (live ? ticketsTotal(state) : (transport?.cost || 0)) * people;
  const stay = (hotel?.price || 0) * Math.max(0, days - 1) * rooms;

  let tickets = 0;
  let missingTickets = 0;
  for (const id of (state.plans || []).flat()) {
    const place = placeById(id);
    if (!place) continue;
    if (place.cost === null || place.cost === undefined) { missingTickets += 1; continue; }
    tickets += place.cost * people;
  }

  const daily = days * people * 100;

  return {
    rail,
    stay,
    tickets,
    daily,
    missingTickets,
    total: rail + stay + tickets + daily,
    transportName: live ? ticketsLabel(state) : (transport?.name || ''),
    live,
    stayName: state.mapStay?.name || hotel?.tag || '稍后再选',
  };
}
