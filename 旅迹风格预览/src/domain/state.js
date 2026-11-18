/* 与旧版共用同一个 localStorage 键和同一份字段结构。 */

export const STORAGE_KEY = 'xingjian-lvji-preview-v1';

export const SECTIONS = [
  { id: 'overview', label: '旅程概览', icon: '◫' },
  { id: 'traffic', label: '往返交通', icon: '⇄' },
  { id: 'stay', label: '住宿选择', icon: '⌂' },
  { id: 'places', label: '想去的地方', icon: '♧' },
  { id: 'days', label: '每日安排', icon: '☷' },
  { id: 'original', label: '我的需求', icon: '✎' },
];

export function fresh() {
  return {
    version: 1, tripId: '', started: false, entryMode: null, section: 'overview', mapOpen: false, day: 0,
    origin: '上海', destination: '杭州', start: '2026-11-14', days: 3, people: 2, rooms: 1,
    budget: 3000, flexible: true, autoLookup: true, tripName: '', stayNotes: '',
    original: '', notes: '', transport: null, hotel: null,
    mapStay: null, outStatus: '待定', backStatus: '待定',
    liveTickets: null, existingDetails: null,
    plans: [[], [], []], customPlaces: {}, savedPlaces: [], wishPlaces: [], dailyRoutes: {}, dailyTiming: {},
    messages: [], undo: [],
  };
}

export function normalize(raw) {
  const base = fresh();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;

  const state = { ...base, ...raw };
  if (!Array.isArray(state.plans) || !state.plans.every(Array.isArray)) return base;
  if (!Number.isInteger(state.days) || state.days < 1 || state.days > 7) return base;
  if (state.plans.length !== state.days) return base;
  if (!Array.isArray(state.messages) || !Array.isArray(state.undo)) return base;

  const day = Number.isInteger(state.day) ? state.day : 0;
  state.day = Math.max(0, Math.min(day, state.days - 1));
  if (!SECTIONS.some((s) => s.id === state.section)) state.section = 'overview';
  if (!state.customPlaces || typeof state.customPlaces !== 'object') state.customPlaces = {};
  if (!Array.isArray(state.savedPlaces)) state.savedPlaces = [];
  if (!Array.isArray(state.wishPlaces)) state.wishPlaces = [];
  if (!state.dailyRoutes || typeof state.dailyRoutes !== 'object' || Array.isArray(state.dailyRoutes)) state.dailyRoutes = {};
  if (!state.dailyTiming || typeof state.dailyTiming !== 'object' || Array.isArray(state.dailyTiming)) state.dailyTiming = {};
  if (!state.liveTickets || typeof state.liveTickets !== 'object' || Array.isArray(state.liveTickets)) state.liveTickets = null;
  if (!state.existingDetails || typeof state.existingDetails !== 'object' || Array.isArray(state.existingDetails)) state.existingDetails = null;
  if (typeof state.stayNotes !== 'string') state.stayNotes = '';
  if (typeof state.tripName !== 'string') state.tripName = '';
  state.autoLookup = state.autoLookup !== false;
  return state;
}

export function load(storage = globalThis.localStorage) {
  try {
    return normalize(JSON.parse(storage.getItem(STORAGE_KEY)));
  } catch {
    return fresh();
  }
}

export function save(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
