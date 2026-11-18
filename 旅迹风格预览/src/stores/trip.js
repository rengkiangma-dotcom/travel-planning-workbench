import { defineStore } from 'pinia';
import coordtransform from 'coordtransform';
import { fresh, load, save, normalize, SECTIONS } from '../domain/state.js';
import { tripSignature, ticketsFor } from '../domain/tickets.js';
import {
  canAddPlace, withAdded, withRemoved, withSwapped, withMovedDay, samplePlans,
} from '../domain/places.js';
import { DEMO } from '../data/demo.js';
import { dateIsoAt } from '../domain/dates.js';

const STATUSES = ['待定', '已选待购', '已购票'];
const MAX_DAYS = 7;
const MAX_UNDO = 15;

function originalLines(existing) {
  return [
    ['去程交通', existing.outbound],
    ['返程交通', existing.returnTrip],
    ['已订住宿', existing.hotel],
    ['景点或预约', existing.schedule],
  ]
    .filter(([, value]) => String(value || '').trim())
    .map(([label, value]) => label + '：' + String(value).trim())
    .join('\n');
}

function validCoordinates(value) {
  if (!Array.isArray(value) || value.some((item) => item === null || item === undefined || typeof item === 'boolean' || (typeof item === 'string' && !item.trim()))) return [];
  const pair = Array.isArray(value) ? value.map(Number) : [];
  return pair.length === 2
    && pair.every(Number.isFinite)
    && Math.abs(pair[0]) <= 180
    && Math.abs(pair[1]) <= 90
    ? pair
    : [];
}

function coords(value) {
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(value)) {
    return validCoordinates(value.split(',').map(Number));
  }
  if (Array.isArray(value)) return validCoordinates(value);
  if (typeof value?.getLng === 'function' && typeof value?.getLat === 'function') {
    return validCoordinates([value.getLng(), value.getLat()]);
  }
  if (value && Number.isFinite(Number(value.lng)) && Number.isFinite(Number(value.lat))) {
    return validCoordinates([value.lng, value.lat]);
  }
  if (value && Number.isFinite(Number(value.longitude)) && Number.isFinite(Number(value.latitude))) {
    return validCoordinates([value.longitude, value.latitude]);
  }
  return [];
}

function firstCoords(...values) {
  for (const value of values) {
    const pair = coords(value);
    if (pair.length) return pair;
  }
  return [];
}

function coordinateText(pair) {
  return pair.map((value) => Number(value).toFixed(6).replace(/\.?0+$/, '')).join(',');
}

function placeCoordinates(poi) {
  let gcj = firstCoords(poi?.gcj02, poi?.location);
  let wgs = firstCoords(poi?.wgs84, poi);
  if (!gcj.length && wgs.length) gcj = validCoordinates(coordtransform.wgs84togcj02(...wgs));
  if (!wgs.length && gcj.length) wgs = validCoordinates(coordtransform.gcj02towgs84(...gcj));
  return gcj.length && wgs.length ? { gcj, wgs } : null;
}

function placeDetails(poi, previous = {}) {
  const optionalCoordinate = (value, old) => {
    const pair = firstCoords(value);
    return pair.length ? coordinateText(pair) : (old || null);
  };
  const optionalText = (value, old) => typeof value === 'string' && value.trim() ? value.trim() : (old || null);
  const photos = Array.isArray(poi.photos)
    ? poi.photos.filter((photo) => typeof photo?.url === 'string' && /^https?:\/\//i.test(photo.url)).map((photo) => ({ title: String(photo.title || ''), url: photo.url }))
    : [];
  return {
    entranceGcj02: optionalCoordinate(poi.entranceGcj02, previous.entranceGcj02),
    exitGcj02: optionalCoordinate(poi.exitGcj02, previous.exitGcj02),
    rating: optionalText(poi.rating, previous.rating),
    openingHoursToday: optionalText(poi.openingHoursToday, previous.openingHoursToday),
    openingHoursWeek: optionalText(poi.openingHoursWeek, previous.openingHoursWeek),
    photos: photos.length ? photos : (previous.photos || []),
  };
}

function invalidateStayRoutes(store, previousStay, nextStay) {
  if (!previousStay?.id) return;
  if (previousStay.id === nextStay?.id && previousStay.gcj02 === nextStay?.gcj02) return;
  for (const daily of Object.values(store.dailyTiming || {})) {
    for (const visit of Object.values(daily?.visits || {})) {
      if (visit?.route?.fromPlaceId === previousStay.id) {
        visit.route = { ...visit.route, staleReason: '住宿位置已改变，请重新查询' };
      }
    }
  }
}

export const useTripStore = defineStore('trip', {
  state: () => load(),
  getters: {
    currentPoints: (s) => s.plans[s.day] || [],
    sectionLabel: (s) => SECTIONS.find((x) => x.id === s.section)?.label || '旅程概览',
    tickets: (s) => ticketsFor(s),
  },
  actions: {
    persist() {
      return save(this.$state);
    },
    createTrip(form) {
      const days = Math.min(MAX_DAYS, Math.max(1, Number(form.days) || 1));
      const existing = form.existing || {};
      const isExisting = form.mode === 'existing';
      Object.assign(this, fresh(), {
        started: true,
        tripId: globalThis.crypto.randomUUID(),
        entryMode: form.mode,
        mapOpen: true,
        origin: String(form.origin || '').trim(),
        destination: String(form.destination || '').trim(),
        start: String(form.start || ''),
        days,
        people: Math.max(1, Number(form.people) || 1),
        rooms: 1,
        budget: Math.max(0, Number(form.budget) || 0),
        tripName: String(form.title || '').trim(),
        notes: String(form.notes || '').trim(),
        original: isExisting ? originalLines(existing) : '',
        existingDetails: isExisting ? { ...existing } : null,
        section: isExisting ? 'overview' : 'traffic',
        plans: Array.from({ length: days }, () => []),
      });
      this.persist();
    },
    setSection(id) {
      if (!SECTIONS.some((s) => s.id === id)) return;
      this.section = id;
      this.persist();
    },
    setDay(value) {
      const day = Number(value);
      if (!Number.isInteger(day) || day < 0 || day >= this.days) return;
      this.day = day;
      this.persist();
    },
    toggleMap() {
      this.mapOpen = !this.mapOpen;
      this.persist();
    },
    snapshot(timingTransfer = null) {
      this.undo.push(JSON.stringify(timingTransfer ? { plans: this.plans, timingTransfer } : this.plans));
      if (this.undo.length > MAX_UNDO) this.undo.shift();
    },
    undoPlans() {
      if (!this.undo.length) return false;
      const snapshot = JSON.parse(this.undo[this.undo.length - 1]);
      if (snapshot.timingTransfer) {
        const { fromDay, toDay, id, original, originalRoute, migratedRoute } = snapshot.timingTransfer;
        const currentFrom = this.dailyTiming?.[fromDay]?.visits?.[id];
        const moved = this.dailyTiming?.[toDay]?.visits?.[id] ?? original;
        if (moved != null) {
          if (currentFrom !== undefined) return false;
          const source = this.dailyTiming[fromDay] || { startTime: '09:00', visits: {} };
          const target = this.dailyTiming[toDay] || { startTime: '09:00', visits: {} };
          const restored = { ...moved };
          // 只有目标日的路线从未改变，才能恢复移动前的原路线；否则保留新路线并明确过期。
          const hasBaseline = Object.prototype.hasOwnProperty.call(snapshot.timingTransfer, 'migratedRoute');
          const unchanged = hasBaseline && JSON.stringify(moved.route || null) === JSON.stringify(migratedRoute || null);
          if (unchanged && originalRoute) restored.route = originalRoute;
          else if (restored.route) restored.route = { ...restored.route, staleReason: '行程日期已改变，请重新查询' };
          this.dailyTiming[fromDay] = { ...source, visits: { ...(source.visits || {}), [id]: restored } };
          const targetVisits = { ...(target.visits || {}) };
          delete targetVisits[id];
          this.dailyTiming[toDay] = { ...target, visits: targetVisits };
        }
      }
      this.undo.pop();
      this.plans = Array.isArray(snapshot) ? snapshot : snapshot.plans;
      this.days = this.plans.length;
      if (this.day >= this.plans.length) this.day = 0;
      this.persist();
      return true;
    },
    addPlace(id, day = this.day) {
      const target = Number(day);
      if (!canAddPlace(this.$state, id, target, DEMO.places)) return false;
      this.snapshot();
      this.plans = withAdded(this.plans, target, id);
      this.day = target;
      this.persist();
      return true;
    },
    removePlace(id, day = this.day) {
      if (!this.plans[day]?.includes(id)) return false;
      this.snapshot();
      this.plans = withRemoved(this.plans, day, id);
      this.persist();
      return true;
    },
    movePlace(id, delta, day = this.day) {
      const list = this.plans[day] || [];
      const index = list.indexOf(id);
      const next = index + delta;
      if (index < 0 || next < 0 || next >= list.length) return false;
      this.snapshot();
      this.plans = withSwapped(this.plans, day, index, next);
      this.persist();
      return true;
    },
    movePlaceToDay(id, toDay, fromDay = this.day) {
      const target = Number(toDay);
      if (!Number.isInteger(target) || target === fromDay || !this.plans[fromDay]?.includes(id) || !this.plans[target] || this.plans[target].includes(id)) return false;
      const sourceVisit = this.dailyTiming?.[fromDay]?.visits?.[id];
      if (this.dailyTiming?.[target]?.visits?.[id] !== undefined) return false;
      const originalRoute = sourceVisit?.route ? { ...sourceVisit.route } : null;
      const original = sourceVisit ? { ...sourceVisit } : null;
      // 固定时间原本隐含所属日期；迁移前将其固化，避免移动后改变预约日期。
      if (original?.fixedArrivalTime && !original.fixedArrivalDate && !original.fixedArrivalDateUnknown) {
        original.fixedArrivalDate = dateIsoAt(this.start, fromDay);
        original.fixedArrivalDateUnknown = !original.fixedArrivalDate;
      }
      if (original?.route) original.route = { ...original.route, staleReason: '行程日期已改变，请重新查询' };
      this.snapshot({ fromDay, toDay: target, id, original, originalRoute, migratedRoute: original?.route || null });
      this.plans = withMovedDay(this.plans, fromDay, target, id);
      if (original) {
        const source = this.dailyTiming[fromDay];
        const visits = { ...source.visits }; delete visits[id];
        this.dailyTiming[fromDay] = { ...source, visits };
        const destination = this.dailyTiming[target] || { startTime: '09:00', visits: {} };
        this.dailyTiming[target] = { ...destination, visits: { ...(destination.visits || {}), [id]: original } };
      }
      this.persist();
      return true;
    },
    addDay() {
      if (this.days >= MAX_DAYS) return false;
      this.snapshot();
      this.days += 1;
      this.plans = [...this.plans, []];
      this.persist();
      return true;
    },
    loadSample() {
      if (!/杭州/.test(this.destination)) return false;
      this.snapshot();
      this.plans = samplePlans(this.days);
      this.day = 0;
      this.section = 'days';
      this.persist();
      return true;
    },
    selectTransport(id) {
      if (!DEMO.transport.some((t) => t.id === id)) return false;
      this.transport = id;
      if (this.outStatus !== '已购票') this.outStatus = '已选待购';
      if (this.backStatus !== '已购票') this.backStatus = '已选待购';
      this.persist();
      return true;
    },
    setTransportStatus(which, value) {
      if (!['outStatus', 'backStatus'].includes(which) || !STATUSES.includes(value)) return;
      this[which] = value;
      this.persist();
    },
    setStart(date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
      this.start = date;
      this.persist();
      return true;
    },
    setDayStartTime(day, time) {
      const target = Number(day);
      if (!Number.isInteger(target) || target < 0 || target >= this.days || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || ''))) return false;
      this.dailyTiming = this.dailyTiming && typeof this.dailyTiming === 'object' ? this.dailyTiming : {};
      const current = this.dailyTiming[target] || { startTime: '09:00', visits: {} };
      this.dailyTiming[target] = { ...current, startTime: String(time), visits: current.visits || {} };
      this.persist();
      return true;
    },
    setPlaceStayMinutes(day, placeId, value) {
      const target = Number(day);
      if (!Number.isInteger(target) || target < 0 || target >= this.days || !placeId) return false;
      const minutes = value === '' || value == null ? null : Number(value);
      if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440)) return false;
      this.dailyTiming = this.dailyTiming && typeof this.dailyTiming === 'object' ? this.dailyTiming : {};
      const current = this.dailyTiming[target] || { startTime: '09:00', visits: {} };
      const visits = { ...(current.visits || {}) };
      visits[placeId] = { ...(visits[placeId] || {}), stayMinutes: minutes };
      this.dailyTiming[target] = { ...current, visits };
      this.persist();
      return true;
    },
    setFixedArrivalTime(day, placeId, time) {
      const target = Number(day);
      if (!Number.isInteger(target) || target < 0 || target >= this.days || !placeId) return false;
      if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time))) return false;
      this.dailyTiming = this.dailyTiming && typeof this.dailyTiming === 'object' ? this.dailyTiming : {};
      const current = this.dailyTiming[target] || { startTime: '09:00', visits: {} };
      const visits = { ...(current.visits || {}) };
      const previous = visits[placeId] || {};
      const fixedArrivalDate = time ? (previous.fixedArrivalDate || (previous.fixedArrivalDateUnknown ? '' : dateIsoAt(this.start, target))) : '';
      visits[placeId] = { ...previous, fixedArrivalTime: String(time || ''), fixedArrivalDate, fixedArrivalDateUnknown: Boolean(time && !fixedArrivalDate) };
      this.dailyTiming[target] = { ...current, visits };
      this.persist();
      return true;
    },
    setFixedArrivalDate(day, placeId, date) {
      const target = Number(day);
      const value = String(date || '');
      const parsed = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00Z') : null;
      if (!Number.isInteger(target) || target < 0 || target >= this.days || !placeId || (value && (!parsed || Number.isNaN(+parsed) || parsed.toISOString().slice(0, 10) !== value))) return false;
      this.dailyTiming = this.dailyTiming && typeof this.dailyTiming === 'object' ? this.dailyTiming : {};
      const current = this.dailyTiming[target] || { startTime: '09:00', visits: {} };
      const visits = { ...(current.visits || {}) };
      const previous = visits[placeId] || {};
      visits[placeId] = { ...previous, fixedArrivalDate: value, fixedArrivalDateUnknown: Boolean(previous.fixedArrivalTime && !value) };
      this.dailyTiming[target] = { ...current, visits };
      this.persist();
      return true;
    },
    saveDailyRoute(day, placeId, route) {
      const target = Number(day);
      if (!Number.isInteger(target) || target < 0 || target >= this.days || !placeId || !route?.fromPlaceId) return false;
      if (!(this.plans[target] || []).includes(placeId)) return false;
      const duration = route.durationSeconds;
      const durationSeconds = duration !== null && duration !== undefined && duration !== '' && Number.isFinite(Number(duration)) && Number(duration) >= 0
        ? Number(duration)
        : null;
      const numberOrNull = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
      const paths = Array.isArray(route.paths) ? route.paths.filter((path) => Array.isArray(path) && path.length >= 2 && path.every((point) => validCoordinates(point).length === 2)).map((path) => path.map((point) => validCoordinates(point))) : [];
      this.dailyTiming = this.dailyTiming && typeof this.dailyTiming === 'object' ? this.dailyTiming : {};
      const current = this.dailyTiming[target] || { startTime: '09:00', visits: {} };
      const visits = { ...(current.visits || {}) };
      visits[placeId] = {
        ...(visits[placeId] || {}),
        route: {
          fromPlaceId: String(route.fromPlaceId),
          toPlaceId: String(route.toPlaceId || placeId),
          fromName: String(route.fromName || ''),
          mode: String(route.mode || ''),
          durationSeconds,
          queriedAt: String(route.queriedAt || ''),
          queryDate: String(route.queryDate || ''),
          source: String(route.source || '高德官方路线组件'),
          routeIndex: Number.isInteger(route.routeIndex) && route.routeIndex >= 0 ? route.routeIndex : null,
          distance: numberOrNull(route.distance),
          fare: numberOrNull(route.fare),
          tolls: numberOrNull(route.tolls),
          walkingDistance: numberOrNull(route.walkingDistance),
          paths,
          instructions: Array.isArray(route.instructions) ? route.instructions.filter((text) => typeof text === 'string') : [],
          policy: String(route.policy || ''),
          departureDate: String(route.departureDate || ''),
          departureTime: String(route.departureTime || ''),
          originGcj02: firstCoords(route.originGcj02).length ? coordinateText(firstCoords(route.originGcj02)) : '',
          destinationGcj02: firstCoords(route.destinationGcj02).length ? coordinateText(firstCoords(route.destinationGcj02)) : '',
          waypointGcj02: firstCoords(route.waypointGcj02).length ? coordinateText(firstCoords(route.waypointGcj02)) : '',
        },
      };
      this.dailyTiming[target] = { ...current, visits };
      this.persist();
      return true;
    },
    selectHotel(id) {
      if (!DEMO.hotels.some((h) => h.id === id)) return false;
      invalidateStayRoutes(this, this.mapStay, null);
      this.hotel = id;
      this.mapStay = null;
      this.persist();
      return true;
    },
    setRooms(value) {
      this.rooms = Math.min(20, Math.max(1, Number(value) || 1));
      this.persist();
    },
    setStayNotes(text) {
      this.stayNotes = String(text || '').trim().slice(0, 1000);
      this.persist();
    },
    setFlexible(value) {
      this.flexible = Boolean(value);
      this.persist();
    },
    setAutoLookup(value) {
      this.autoLookup = Boolean(value);
      this.persist();
    },
    chooseTicket(leg, ticket) {
      if (!['outbound', 'inbound'].includes(leg) || !ticket) return false;
      const signature = tripSignature(this.$state);
      const base = this.liveTickets && this.liveTickets.signature === signature ? this.liveTickets : { signature };
      this.liveTickets = { ...base, [leg]: ticket };
      this.transport = null;
      this[leg === 'outbound' ? 'outStatus' : 'backStatus'] = '已选待购';
      this.persist();
      return true;
    },
    clearTickets() {
      this.liveTickets = null;
      this.persist();
    },
    saveCustomPlace(poi, { favorite = true } = {}) {
      const position = placeCoordinates(poi);
      const sourceId = poi?.id ? String(poi.id) : '';
      if (!poi?.name || !position) return null;
      const rawId = sourceId || 'map:' + coordinateText(position.gcj);
      const id = rawId.startsWith('poi:') || rawId.startsWith('map:') ? rawId : 'poi:' + rawId;
      this.customPlaces = this.customPlaces || {};
      this.savedPlaces = Array.isArray(this.savedPlaces) ? this.savedPlaces : [];
      const previous = this.customPlaces[id] || {};
      this.customPlaces[id] = {
        ...previous,
        ...placeDetails(poi, previous),
        id,
        name: String(poi.name),
        address: String(poi.address || previous.address || ''),
        city: String(poi.city || previous.city || ''),
        area: String(poi.district || poi.area || previous.area || poi.city || ''),
        gcj02: coordinateText(position.gcj),
        wgs84: coordinateText(position.wgs),
        lng: position.wgs[0],
        lat: position.wgs[1],
        cost: previous.cost ?? null,
        duration: previous.duration ?? '',
        note: previous.note ?? '',
        source: poi.source || previous.source || '高德地点搜索',
      };
      if (favorite && !this.savedPlaces.includes(id)) this.savedPlaces.push(id);
      this.persist();
      return id;
    },
    setMapStay(poi) {
      const position = placeCoordinates(poi);
      if (!poi?.name || !position) return false;
      const sourceId = poi?.id ? String(poi.id) : 'map:' + coordinateText(position.gcj);
      const id = sourceId.startsWith('poi:') || sourceId.startsWith('map:') ? sourceId : 'poi:' + sourceId;
      const previousStay = this.mapStay;
      this.mapStay = {
        ...placeDetails(poi, previousStay?.id === id ? previousStay : {}),
        id,
        name: String(poi.name),
        address: String(poi.address || ''),
        city: String(poi.city || ''),
        gcj02: coordinateText(position.gcj),
        wgs84: coordinateText(position.wgs),
        lng: position.wgs[0],
        lat: position.wgs[1],
        coordinateSystem: 'GCJ-02',
      };
      invalidateStayRoutes(this, previousStay, this.mapStay);
      this.hotel = null;
      this.persist();
      return true;
    },
    clearMapStay() {
      invalidateStayRoutes(this, this.mapStay, null);
      this.mapStay = null;
      this.persist();
    },
    removeSavedPlace(id) {
      this.savedPlaces = (this.savedPlaces || []).filter((x) => x !== id);
      this.persist();
    },
    addWishPlace(value) {
      const id = typeof value === 'string' ? value : this.saveCustomPlace(value, { favorite: false });
      if (!id) return null;
      this.wishPlaces = Array.isArray(this.wishPlaces) ? this.wishPlaces : [];
      if (!this.wishPlaces.includes(id)) this.wishPlaces.push(id);
      this.persist();
      return id;
    },
    removeWishPlace(id) {
      this.wishPlaces = (this.wishPlaces || []).filter((x) => x !== id);
      this.persist();
    },
    applyRequirements(form) {
      const previousOrigin = this.origin;
      const previousDestination = this.destination;
      this.origin = String(form.origin || '').trim();
      this.destination = String(form.destination || '').trim();
      this.start = String(form.start || '').trim();
      this.notes = String(form.notes || '').trim();
      this.people = Math.max(1, Number(form.people) || 1);
      this.budget = Math.max(0, Number(form.budget) || 0);
      if (previousOrigin !== this.origin || previousDestination !== this.destination) {
        this.transport = null;
        this.outStatus = '待定';
        this.backStatus = '待定';
        this.liveTickets = null;
        if (previousDestination !== this.destination) {
          this.hotel = null;
          this.snapshot();
          this.plans = this.plans.map((list) => list.filter((id) => !DEMO.places.some((p) => p.id === id)));
        }
      }
      this.persist();
    },
    reset() {
      Object.assign(this, fresh());
      this.persist();
    },
    restoreTrip(raw) {
      const state = normalize(raw);
      if (!state.started) return false;
      Object.assign(this, state);
      this.section = 'overview';
      this.persist();
      return true;
    },
  },
});
