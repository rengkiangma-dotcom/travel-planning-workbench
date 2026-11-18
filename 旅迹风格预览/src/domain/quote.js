/* 报价五态与按单位计价；未知是合法状态，不是缺省值。 */
import { toMinor } from './money.js';

export const CATEGORIES = ['rail', 'lodging', 'localTransit', 'admission', 'meal', 'other'];
export const KINDS = ['realQuote', 'quoteSnapshot', 'estimate', 'unknown', 'paid'];
export const UNITS = ['perPerson', 'perRoomNight', 'perVehicle', 'total'];

export function makeQuote(input) {
  if (!input || typeof input !== 'object') throw new Error('报价必须是对象');
  if (!KINDS.includes(input.kind)) throw new Error('报价类型不合法：' + input.kind);
  if (!UNITS.includes(input.unit)) throw new Error('计价单位不合法：' + input.unit);

  const kind = input.kind;
  const category = CATEGORIES.includes(input.category) ? input.category : 'other';
  let amount = null;

  if (kind === 'unknown') {
    if (!String(input.note || '').trim()) throw new Error('未知报价必须写明原因');
  } else {
    amount = toMinor(input.amount);
    if (amount === null) throw new Error('报价金额无法换算，请显式标为 unknown 并写明原因');
  }

  return {
    category,
    source: String(input.source || 'user'),
    kind,
    amount,
    currency: input.currency || 'CNY',
    unit: input.unit,
    quantity: Number.isInteger(input.quantity) && input.quantity > 0 ? input.quantity : 1,
    people: Number.isInteger(input.people) ? input.people : null,
    rooms: Number.isInteger(input.rooms) ? input.rooms : null,
    queriedAt: input.queriedAt || null,
    validFor: input.validFor || '',
    note: input.note || '',
  };
}

export function lineTotalMinor(quote, ctx) {
  if (!quote || quote.kind === 'unknown' || quote.amount === null) return null;
  const people = ctx.people ?? 1;
  const rooms = ctx.rooms ?? 1;
  const nights = ctx.nights ?? 1;
  const quantity = quote.quantity ?? 1;

  if (quote.unit === 'perPerson') return quote.amount * people * quantity;
  if (quote.unit === 'perRoomNight') return quote.amount * rooms * nights * quantity;
  if (quote.unit === 'perVehicle') return quote.amount * quantity;
  if (quote.unit === 'total') return quote.amount * quantity;
  return null;
}

export function summarize(quotes, ctx) {
  const byCategory = {};
  let totalMinor = 0;
  const unknown = [];
  for (const quote of quotes) {
    const line = lineTotalMinor(quote, ctx);
    if (line === null) { unknown.push(quote); continue; }
    totalMinor += line;
    byCategory[quote.category] = (byCategory[quote.category] || 0) + line;
  }
  return { totalMinor, byCategory, unknownCount: unknown.length, unknown };
}
