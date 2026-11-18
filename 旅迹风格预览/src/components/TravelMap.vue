<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import coordtransform from 'coordtransform';
import { useTripStore } from '../stores/trip.js';
import { DEMO } from '../data/demo.js';
import { placeById } from '../domain/places.js';
import { dateIsoAt } from '../domain/dates.js';
import { calculateDaySchedule } from '../domain/schedule.js';
import { placeSearch, postJson } from '../api/client.js';
import { clearMapPlaceSelection, focusSavedRouteOnMap, mapFocus, selectPlaceOnMap } from '../ui/mapFocus.js';

const trip = useTripStore();
const props = defineProps({ visible: { type: Boolean, default: true } });
const visible = computed(() => props.visible && trip.mapOpen);
const mapShell = ref(null);
const container = ref(null);
const directionCanvas = ref(null);
const status = ref('地图正在加载…');
const ready = ref(false);
const query = ref('');
const searchBusy = ref(false);
const searchError = ref('');
const searchResults = ref([]);
const endpointTarget = ref('');
const panel = ref('');
const selected = ref(null);
const detailBusy = ref(false);
const detailError = ref('');
const origin = ref(null);
const destination = ref(null);
const mode = ref('transit');
const drivingPolicy = ref('DEFAULT');
const transitPolicy = ref('DEFAULT');
const transitDepartureDate = ref('');
const transitDepartureTime = ref('');
const routeBusy = ref(false);
const routeError = ref('');
const routeData = ref(null);
const selectedRouteIndex = ref(0);
const expandedRouteIndex = ref(null);
const missingRouteGeometry = ref(false);
const waypoint = ref(null);
const routeStatus = ref('');
const contextMenu = ref(null);
const contextPoint = ref(null);
const officialPanel = ref(null);
const trafficEnabled = ref(false);
const satelliteEnabled = ref(false);
const measuring = ref(false);
const subwayOpen = ref(false);
const subwayUrl = computed(() => `${import.meta.env.BASE_URL}subway-view.html?city=${encodeURIComponent(String(trip.destination || '').trim())}`);
const moreOpen = ref(false);
const mapFullscreen = ref(false);
const measurePoints = ref([]);
const notice = ref('');
let map = null;
let overlays = [];
let plannedOverlays = [];
let routeComponent = null;
let routeOverlays = [];
let directionPaths = [];
let directionFrame = 0;
let savedRouteOverlays = [];
const visibleSavedRouteId = ref('');
const visibleSavedRouteDay = ref(-1);
let measureOverlays = [];
let trafficLayer = null;
let satelliteLayer = null;
let roadLayer = null;
let disposed = false;
let initializing = false;
let cancelPendingMapReady = null;
let initToken = 0;
let searchToken = 0;
let detailToken = 0;
let routeToken = 0;
let locateToken = 0;
let pendingPlaceFocusId = '';
let resizeObserver = null;
let resizeFrame = 0;

const points = computed(() => (trip.plans[trip.day] || [])
  .map((id) => placeById(trip.$state, id, DEMO.places)).filter(Boolean));
const scheduledRows = computed(() => calculateDaySchedule({ places: points.value, timing: trip.dailyTiming?.[trip.day] || {}, date: dateIsoAt(trip.start, trip.day) }));
const visibleSavedRoute = computed(() => {
  if (visibleSavedRouteDay.value !== trip.day || !visibleSavedRouteId.value) return null;
  const row = scheduledRows.value.find((item) => item.place.id === visibleSavedRouteId.value);
  const route = trip.dailyTiming?.[trip.day]?.visits?.[visibleSavedRouteId.value]?.route;
  return row && route ? { row, route } : null;
});
const favorites = computed(() => (trip.savedPlaces || [])
  .map((id) => trip.customPlaces?.[id]).filter(Boolean));
const wishPlaces = computed(() => (trip.wishPlaces || [])
  .map((id) => DEMO.places.find((place) => place.id === id) || trip.customPlaces?.[id]).filter(Boolean));
const unknownPoints = computed(() => points.value.filter((p) => !mapPosition(p)).length);
const demoPoints = computed(() => points.value.some((p) => DEMO.places.some((d) => d.id === p.id)));
const selectedFavorite = computed(() => !!selected.value && (trip.savedPlaces || []).includes(storagePlaceId(selected.value)));

function validPosition(value) {
  const pair = Array.isArray(value) ? value : typeof value === 'string' && /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(value) ? value.split(',').map(Number)
    : value && typeof value.getLng === 'function' && typeof value.getLat === 'function' ? [value.getLng(), value.getLat()]
      : value && Number.isFinite(Number(value.lng)) && Number.isFinite(Number(value.lat)) ? [value.lng, value.lat] : [];
  return pair.length === 2 && pair.every(Number.isFinite) && Math.abs(pair[0]) <= 180 && Math.abs(pair[1]) <= 90 ? pair : null;
}
function mapPosition(place) {
  const gcj = validPosition(place?.gcj02);
  if (gcj) return gcj;
  const wgs = validPosition(place?.wgs84) || (Number.isFinite(place?.lng) && Number.isFinite(place?.lat) ? [place.lng, place.lat] : null);
  return wgs ? validPosition(coordtransform.wgs84togcj02(...wgs)) : null;
}
function placeIdentity(value) {
  const id = String(value?.id ?? value ?? '');
  if (!id) return '';
  const demo = DEMO.places.find((place) => place.id === id);
  if (demo) return demo.id;
  const unprefixed = id.startsWith('poi:') ? id.slice(4) : id;
  if (DEMO.places.some((place) => place.id === unprefixed)) return unprefixed;
  if (id.startsWith('map:') || id.startsWith('poi:')) return id;
  return 'poi:' + id;
}
function storagePlaceId(place) {
  const sourceId = String(place?.id ?? place ?? '');
  if (!sourceId) return '';
  return sourceId.startsWith('poi:') || sourceId.startsWith('map:') ? sourceId : 'poi:' + sourceId;
}
function label(text, { selected = false, selectionOnly = false } = {}) {
  const el = document.createElement('span');
  el.className = [
    'travel-map-marker',
    selected ? 'selected' : '',
    selectionOnly ? 'selection-only' : '',
  ].filter(Boolean).join(' ');
  el.textContent = text;
  return el;
}
function remove(items) {
  if (map && items.length) map.remove(items);
}
// SDK 的内置箭头在部分浏览器中可能不显示；根据真实路线的屏幕坐标绘制。
function redrawRouteDirections() {
  directionFrame = 0;
  const canvas = directionCanvas.value;
  if (!canvas || !container.value) return;
  const width = container.value.clientWidth;
  const height = container.value.clientHeight;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx || !map?.lngLatToContainer || !width || !height) return;
  ctx.scale(ratio, ratio);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  let remaining = 30;
  let count = 0;
  for (const path of directionPaths) {
    for (let i = 1; i < path.length; i++) {
      const a = map.lngLatToContainer(path[i - 1]);
      const b = map.lngLatToContainer(path[i]);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (!Number.isFinite(length) || length < 0.01) continue;
      // 求出线段在屏幕附近的范围，避免长途路线在屏幕外产生大量绘制循环。
      let min = 0, max = 1;
      for (const [p, q] of [[-dx, a.x + 10], [dx, width + 10 - a.x], [-dy, a.y + 10], [dy, height + 10 - a.y]]) {
        if (p === 0) { if (q < 0) { min = 1; max = 0; break; } }
        else if (p < 0) min = Math.max(min, q / p);
        else max = Math.min(max, q / p);
      }
      if (min <= max && remaining <= length) {
        const first = Math.max(0, Math.ceil((length * min - remaining) / 60));
        const last = Math.floor((length * max - remaining) / 60);
        const ux = dx / length, uy = dy / length;
        for (let n = first; n <= last; n++) {
          const distance = remaining + n * 60;
          const x = a.x + ux * distance, y = a.y + uy * distance;
          ctx.beginPath();
          ctx.moveTo(x - 5 * ux - 3 * uy, y - 5 * uy + 3 * ux);
          ctx.lineTo(x, y);
          ctx.lineTo(x - 5 * ux + 3 * uy, y - 5 * uy - 3 * ux);
          ctx.stroke();
          count++;
        }
      }
      remaining = length < remaining ? remaining - length : 60 - ((length - remaining) % 60);
    }
  }
  canvas.dataset.arrowCount = String(count);
}
function scheduleRouteDirections() {
  if (!directionFrame) directionFrame = requestAnimationFrame(redrawRouteDirections);
}
function scheduleMapResize() {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    if (!map || !container.value) return;
    const { width, height } = container.value.getBoundingClientRect();
    if (width > 0 && height > 0) { map.resize(); scheduleRouteDirections(); }
  });
}
function observeMapResize(instance) {
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (typeof ResizeObserver !== 'function') {
    scheduleMapResize();
    return;
  }
  resizeObserver = new ResizeObserver(() => {
    if (map === instance) scheduleMapResize();
  });
  resizeObserver.observe(container.value);
  scheduleMapResize();
}
function invalidateRoute(message = '') {
  routeToken++;
  routeBusy.value = false;
  routeData.value = null;
  selectedRouteIndex.value = 0;
  expandedRouteIndex.value = null;
  missingRouteGeometry.value = false;
  routeStatus.value = '';
  routeError.value = message;
  try { routeComponent?.clear(); } catch { /* 组件可能已被地图销毁 */ }
  routeComponent = null;
  remove(routeOverlays);
  routeOverlays = [];
  directionPaths = [];
  scheduleRouteDirections();
  if (officialPanel.value) officialPanel.value.innerHTML = '';
}
function routeGeometry(route) {
  const paths = [];
  let incomplete = false;
  const addPath = (value) => {
    const raw = typeof value === 'string' ? value.split(';') : value;
    if (!Array.isArray(raw) || !raw.length) { incomplete = true; return false; }
    const startCount = paths.length;
    let path = [];
    const finish = () => {
      if (path.length >= 2) paths.push(path);
      else if (path.length) incomplete = true;
      path = [];
    };
    for (const item of raw) {
      let point = item;
      if (typeof point === 'string') {
        const parts = point.split(',').map((part) => part.trim());
        point = parts.length === 2 && parts.every((part) => /^-?\d+(?:\.\d+)?$/.test(part)) ? parts.map(Number) : null;
      }
      point = validPosition(point);
      if (!point) { incomplete = true; finish(); }
      else path.push(point);
    }
    finish();
    if (paths.length === startCount) incomplete = true;
    return paths.length > startCount;
  };
  // TransferPlan.path 是完整方案的真实线路；缺失时仅绘制有坐标的分段。
  if (route?.path && addPath(route.path)) return { paths, incomplete };
  for (const step of [...(route?.steps || []), ...(route?.rides || [])]) addPath(step.path || step.polyline);
  for (const segment of route?.segments || []) {
    const parts = [segment.transit, segment.walking, segment.bus].filter(Boolean);
    if (!parts.length) parts.push(segment);
    for (const part of parts) {
      if (part.path || part.polyline) { addPath(part.path || part.polyline); continue; }
      const pieces = [...(part.steps || []), ...(part.buslines || []), ...(part.lines || [])];
      if (!pieces.length) { incomplete = true; continue; }
      for (const piece of pieces) addPath(piece.path || piece.polyline);
    }
  }
  return { paths, incomplete: incomplete || !paths.length };
}
function routePaths(route) {
  return routeGeometry(route).paths;
}
function transitLegs(route) {
  return (route?.segments || []).flatMap((segment) => {
    const transit = segment.transit || segment.bus;
    if (!transit) return [];
    const names = (transit.lines || transit.buslines || []).map((line) => line.name).filter((name) => typeof name === 'string' && name.trim());
    const from = transit.on_station?.name || transit.departure_stop?.name || '';
    const to = transit.off_station?.name || transit.arrival_stop?.name || '';
    if (!names.length && !from && !to) return [];
    return [{ name: names.join(' / ') || '线路名称暂无', from: from || '上车站暂无', to: to || '下车站暂无' }];
  });
}
function routeInstructions(route) {
  return [...(route?.steps || []), ...(route?.rides || []), ...(route?.segments || []).flatMap((segment) => [segment, segment.walking, segment.transit, ...(segment.walking?.steps || [])])]
    .map((step) => step?.instruction).filter((text) => typeof text === 'string' && text.trim());
}
function routeNumber(value) {
  if (value == null || value === '' || Array.isArray(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function routeRoadNames(route) {
  if (!Array.isArray(route?.roads)) return '';
  return route.roads
    .map((road) => road?.road_name)
    .filter((name) => typeof name === 'string' && name.trim())
    .join(' · ');
}
async function resolveTransitCityCode(city) {
  const name = String(city || '').trim();
  if (!name) return '';
  try {
    const data = await postJson('/api/places/city-code', { city: name });
    const code = typeof data?.code === 'string' ? data.code.trim() : '';
    return /^\d{3,4}$/.test(code) ? code : '';
  } catch {
    // 城市代码解析失败时省略 cityd，交给 SDK 按起点城市回退，不能把城市名或空值传进去。
    return '';
  }
}
function drawRouteChoices(fit = false) {
  remove(routeOverlays);
  routeOverlays = [];
  if (!map || !window.AMap || !routeData.value) return;
  let selectedGeometry = { paths: [], incomplete: true };
  routeData.value.routes.forEach((route, index) => {
    const geometry = routeGeometry(route);
    const paths = geometry.paths;
    if (index === selectedRouteIndex.value) selectedGeometry = geometry;
    paths.forEach((path) => {
      const active = index === selectedRouteIndex.value;
      const line = new window.AMap.Polyline({ path, strokeColor: active ? '#1687ed' : '#8daec2', strokeOpacity: active ? 1 : 0.5, strokeWeight: active ? 7 : 4, lineJoin: 'round', lineCap: 'round', zIndex: active ? 20 : 10 });
      line.on('click', () => selectRoute(index));
      routeOverlays.push(line);
    });
  });
  missingRouteGeometry.value = !selectedGeometry.paths.length ? 'none' : selectedGeometry.incomplete ? 'partial' : false;
  directionPaths = selectedGeometry.paths;
  scheduleRouteDirections();
  if (routeOverlays.length) {
    map.add(routeOverlays);
    if (fit) map.setFitView(routeOverlays, false, [80, 60, 80, 380]);
  }
}
function selectRoute(index) {
  if (!routeData.value?.routes?.[index]) return;
  if (selectedRouteIndex.value !== index) expandedRouteIndex.value = null;
  selectedRouteIndex.value = index;
  drawRouteChoices();
}
function toggleRouteDetails(index) {
  const expand = expandedRouteIndex.value !== index;
  selectRoute(index);
  expandedRouteIndex.value = expand ? index : null;
}
function clearSavedRoutePreview() {
  remove(savedRouteOverlays);
  savedRouteOverlays = [];
  visibleSavedRouteId.value = '';
  visibleSavedRouteDay.value = -1;
  mapFocus.selectedRoutePlaceId = '';
}
function drawSavedRoute(fit = false) {
  remove(savedRouteOverlays);
  savedRouteOverlays = [];
  if (!map || !window.AMap || routeBusy.value || routeData.value) return;
  const focused = [];
  for (const row of scheduledRows.value) {
    const id = row.place.id;
    const route = trip.dailyTiming?.[trip.day]?.visits?.[id]?.route;
    if (!route) continue;
    const active = mapFocus.selectedRoutePlaceId === id;
    for (const savedPath of route.paths || []) {
      // 仅展示快照中连续有效的路段，不补画起终点直线。
      for (const path of routePaths({ path: savedPath })) {
        const line = new window.AMap.Polyline({ path, strokeColor: row.routeStale ? '#c78230' : '#1687ed', strokeOpacity: active ? 1 : 0.55, strokeWeight: active ? 7 : 4, strokeStyle: row.routeStale ? 'dashed' : 'solid', zIndex: active ? 20 : 10, extData: { savedRouteId: id } });
        line.on('click', () => focusSavedRouteOnMap(id));
        savedRouteOverlays.push(line);
        if (active) focused.push(line);
      }
    }
  }
  if (savedRouteOverlays.length) {
    map.add(savedRouteOverlays);
    if (fit && focused.length) map.setFitView(focused, false, [80, 60, 80, 380]);
  }
}
function applySavedRouteFocus(id) {
  if (!ready.value || !map || !id) return;
  invalidateRoute();
  visibleSavedRouteId.value = id;
  visibleSavedRouteDay.value = trip.day;
  if (!visibleSavedRoute.value) { clearSavedRoutePreview(); notice.value = '当前日期没有该路线快照。'; return; }
  panel.value = 'saved-route';
  drawSavedRoute(true);
}
function showPlace(p) {
  const token = ++detailToken;
  selected.value = p;
  detailError.value = '';
  detailBusy.value = false;
  selectPlaceOnMap(placeIdentity(p));
  panel.value = 'detail';
  const pos = mapPosition(p);
  if (map && pos) map.setZoomAndCenter(16, pos);
  const id = String(p?.id || '');
  if (!id || id.startsWith('map:') || DEMO.places.some((place) => place.id === id)) return;
  detailBusy.value = true;
  postJson('/api/places/detail', { id }).then((data) => {
    if (token !== detailToken || disposed || placeIdentity(selected.value) !== placeIdentity(p) || !data.poi) return;
    const known = Object.fromEntries(Object.entries(data.poi).filter(([, value]) => value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length)));
    selected.value = { ...p, ...known, id: p.id, detailQueriedAt: data.queriedAt || '' };
  }).catch((error) => {
    if (token === detailToken && !disposed) detailError.value = error.message || '地点详情暂不可用。';
  }).finally(() => { if (token === detailToken) detailBusy.value = false; });
}
function selectedMapPlace() {
  const id = placeIdentity(mapFocus.selectedPlaceId);
  if (!id) return null;
  if (selected.value && placeIdentity(selected.value) === id) return selected.value;
  return DEMO.places.find((place) => placeIdentity(place) === id)
    || trip.customPlaces?.[id]
    || favorites.value.find((place) => placeIdentity(place) === id)
    || wishPlaces.value.find((place) => placeIdentity(place) === id)
    || null;
}
function renderPoints() {
  if (!map || !window.AMap) return;
  remove(overlays);
  overlays = [];
  plannedOverlays = [];
  const seen = new Set();
  const selectedId = placeIdentity(mapFocus.selectedPlaceId);
  for (const [index, point] of points.value.entries()) {
    const pos = mapPosition(point);
    if (!pos) continue;
    const id = placeIdentity(point);
    seen.add(id);
    const marker = new window.AMap.Marker({
      position: pos,
      title: point.name,
      content: label(String(index + 1), { selected: id === selectedId }),
      anchor: 'center',
    });
    marker.on('click', () => showPlace(point));
    overlays.push(marker);
    plannedOverlays.push(marker);
  }
  for (const point of favorites.value) {
    const id = placeIdentity(point);
    if (seen.has(id)) continue;
    const pos = mapPosition(point);
    if (!pos) continue;
    seen.add(id);
    const marker = new window.AMap.Marker({
      position: pos,
      title: point.name,
      content: label('★', { selected: id === selectedId }),
      anchor: 'center',
    });
    marker.on('click', () => showPlace(point));
    overlays.push(marker);
  }
  for (const point of wishPlaces.value) {
    const id = placeIdentity(point);
    if (seen.has(id)) continue;
    const pos = mapPosition(point);
    if (!pos) continue;
    seen.add(id);
    const marker = new window.AMap.Marker({ position: pos, title: point.name, content: label('想', { selected: id === selectedId }), anchor: 'center' });
    marker.on('click', () => showPlace(point));
    overlays.push(marker);
  }
  if (trip.mapStay) {
    const id = placeIdentity(trip.mapStay);
    const pos = mapPosition(trip.mapStay);
    if (pos && !seen.has(id)) {
      seen.add(id);
      const marker = new window.AMap.Marker({ position: pos, title: trip.mapStay.name, content: label('住', { selected: id === selectedId }), anchor: 'center' });
      marker.on('click', () => showPlace(trip.mapStay));
      overlays.push(marker);
    }
  }
  const current = selectedMapPlace();
  if (current && selectedId && !seen.has(selectedId)) {
    const pos = mapPosition(current);
    if (pos) {
      const marker = new window.AMap.Marker({
        position: pos,
        title: current.name,
        content: label('', { selected: true, selectionOnly: true }),
        anchor: 'center',
      });
      marker.on('click', () => showPlace(current));
      overlays.push(marker);
    }
  }
  if (overlays.length) map.add(overlays);
}
function fitPoints() {
  if (map && plannedOverlays.length) map.setFitView(plannedOverlays, false, [80, 50, 80, 50]);
  else notice.value = '当前没有可定位的行程地点。';
}
function destinationView() {
  if (!/杭州/.test(trip.destination)) return null;
  const positions = DEMO.places.map(mapPosition).filter(Boolean);
  if (!positions.length) return null;
  return positions.reduce(
    (center, position) => [center[0] + position[0] / positions.length, center[1] + position[1] / positions.length],
    [0, 0],
  );
}
async function resolveDestinationView(city) {
  const localView = destinationView();
  if (localView) return localView;
  const data = await placeSearch({ city, keywords: city });
  const norm = (name) => String(name || '').trim().replace(/(?:市|省|自治区)$/, '');
  const candidates = (data.pois || []).filter((p) => mapPosition(p));
  const exact = candidates.filter((p) => norm(p.name) === norm(city));
  const place = exact.find((p) => String(p.type || '').includes('地名地址')) || exact[0]
    || candidates.find((p) => norm(p.name).includes(norm(city)) || norm(city).includes(norm(p.name)));
  const position = mapPosition(place);
  if (!position) throw new Error('无法唯一确定目的地位置，请搜索具体地点。');
  return position;
}
function loadSdk(key) {
  if (window.AMap) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => finish(false), 15000);
    function finish(ok) {
      clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (!ok) script.remove();
      ok ? resolve() : reject(new Error('地图脚本加载失败或超时'));
    }
    script.onload = () => finish(!!window.AMap);
    script.onerror = () => finish(false);
    script.src = 'https://webapi.amap.com/maps?v=2.0&key=' + encodeURIComponent(key);
    document.head.append(script);
  });
}
function waitForMapReady(instance) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const complete = () => finish();
    const cancel = () => {
      const error = new Error('地图加载已取消。');
      error.name = 'AbortError';
      finish(error);
    };
    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { instance.off('complete', complete); } catch { /* 销毁中的地图可能已释放事件 */ }
      if (cancelPendingMapReady === cancel) cancelPendingMapReady = null;
      if (error) reject(error); else resolve();
    }
    cancelPendingMapReady = cancel;
    timer = setTimeout(() => finish(new Error('地图未能完成加载，请检查高德配置、权限和网络，然后重试。')), 12000);
    try { instance.on('complete', complete); } catch (error) { finish(error); }
  });
}
async function initialize() {
  if (map || initializing || !visible.value) return;
  initializing = true;
  const token = ++initToken;
  status.value = '地图正在加载…';
  try {
    const response = await fetch('/api/map/js-config');
    if (!response.ok) throw new Error('无法读取地图配置，请检查本地服务。');
    const config = await response.json();
    if (!config.configured || !config.key) throw new Error('请在接口设置中填写高德网页地图 Key 和安全密钥。');
    window._AMapSecurityConfig = { serviceHost: location.origin + '/_AMapService' };
    await loadSdk(config.key);
    if (disposed || token !== initToken || !visible.value) return;
    await nextTick();
    if (disposed || token !== initToken || !visible.value || !container.value) return;
    const AMap = window.AMap;
    let initialLookupError = '';
    let initialView = destinationView();
    if (!initialView && trip.destination) {
      try {
        initialView = await resolveDestinationView(String(trip.destination).trim());
      } catch (error) {
        initialLookupError = error.message || '目的地定位失败。';
      }
    }
    if (disposed || token !== initToken || !visible.value || !container.value) return;
    map = new AMap.Map(container.value, {
      zoom: initialView ? 11 : 5,
      center: initialView || [105, 35],
      isHotspot: true,
      resizeEnable: true,
      viewMode: '3D',
      mapStyle: 'amap://styles/normal',
      WebGLParams: { antialias: true },
    });
    const instance = map;
    map.on('click', onMapClick);
    map.on('rightclick', onMapRightClick);
    map.on('hotspotclick', onHotspot);
    for (const event of ['mapmove', 'zoomchange', 'rotatechange', 'pitchchange', 'moveend', 'zoomend']) map.on(event, scheduleRouteDirections);
    await waitForMapReady(instance);
    if (disposed || token !== initToken || !visible.value || map !== instance) {
      const error = new Error('地图加载已取消。');
      error.name = 'AbortError';
      throw error;
    }
    AMap.plugin(['AMap.Scale', 'AMap.ToolBar'], () => {
      if (!map || disposed) return;
      if (AMap.Scale) map.addControl(new AMap.Scale());
      if (AMap.ToolBar) map.addControl(new AMap.ToolBar());
    });
    ready.value = true;
    status.value = '';
    observeMapResize(instance);
    renderPoints();
    drawSavedRoute();
    if (mapFocus.selectedRoutePlaceId) applySavedRouteFocus(mapFocus.selectedRoutePlaceId);
    else if (pendingPlaceFocusId) applyPlaceFocus(pendingPlaceFocusId);
    else if (initialView) instance.setZoomAndCenter(11, initialView);
    else if (initialLookupError) notice.value = `未能定位${trip.destination}：${initialLookupError}`;
  } catch (error) {
    if (map) { map.destroy(); map = null; }
    ready.value = false;
    if (!disposed && token === initToken) status.value = error.message || '地图加载失败，请检查配置和网络。';
  } finally {
    initializing = false;
    if (!disposed && token !== initToken && visible.value && !map) initialize();
  }
}
async function locateDestination(announce = true) {
  const city = String(trip.destination || '').trim();
  if (!city) { notice.value = '当前旅行还没有填写目的地。'; return; }
  const token = ++locateToken;
  const localView = destinationView();
  if (localView) {
    map?.setZoomAndCenter(11, localView);
    if (announce) notice.value = `已定位${city}。`;
    return;
  }
  if (announce) notice.value = `正在定位${city}…`;
  try {
    const position = await resolveDestinationView(city);
    if (disposed || token !== locateToken || trip.destination !== city) return;
    map?.setZoomAndCenter(11, position);
    if (announce) notice.value = `已定位${city}。`;
  } catch (error) {
    if (!disposed && token === locateToken) notice.value = error.message || '目的地定位失败。';
  }
}
function applyPlaceFocus(placeId) {
  if (!placeId) return;
  const place = DEMO.places.find((item) => item.id === placeId) || trip.customPlaces?.[placeId];
  if (!place) { notice.value = '没有找到这个地点的坐标。'; return; }
  locateToken++;
  pendingPlaceFocusId = '';
  showPlace(place);
}
async function search() {
  const keywords = query.value.trim();
  if (!keywords) return;
  const token = ++searchToken;
  searchBusy.value = true;
  searchError.value = '';
  searchResults.value = [];
  panel.value = 'search';
  try {
    const data = await placeSearch({ city: trip.destination, keywords });
    if (token !== searchToken || disposed) return;
    searchResults.value = data.pois || [];
    if (!searchResults.value.length) searchError.value = '没有找到地点，请换个名称。';
  } catch (error) {
    if (token === searchToken && !disposed) searchError.value = error.message || '地点查询失败。';
  } finally {
    if (token === searchToken) searchBusy.value = false;
  }
}
async function onHotspot(event) {
  if (measuring.value || !event?.id || !event?.name) return;
  const token = ++searchToken;
  searchBusy.value = true;
  searchError.value = '';
  searchResults.value = [];
  panel.value = 'search';
  try {
    const keywords = String(event.name);
    const data = await placeSearch({ city: trip.destination, keywords });
    if (token !== searchToken || disposed) return;
    const pois = data.pois || [];
    const exact = pois.find((p) => String(p.id) === String(event.id))
      || pois.find((p) => String(p.name || '').trim() === keywords.trim())
      || (pois.length === 1 ? pois[0] : null);
    if (exact) showPlace(exact);
    else searchError.value = '未找到对应地点，请搜索并核对地址。';
  } catch (error) {
    if (token === searchToken && !disposed) searchError.value = error.message || '地点详情获取失败。';
  } finally {
    if (token === searchToken) searchBusy.value = false;
  }
}
function savePlace(p) {
  const id = trip.saveCustomPlace(p);
  notice.value = id ? '已收藏到当前旅行。' : '地点坐标不完整，无法收藏。';
  return id;
}
function toggleFavorite(p) {
  const id = storagePlaceId(p);
  if (id && (trip.savedPlaces || []).includes(id)) {
    trip.removeSavedPlace(id);
    notice.value = '已取消收藏，已有每日安排不会删除。';
    return;
  }
  savePlace(p);
}
function addPlace(p) {
  const id = DEMO.places.some((d) => d.id === p.id) ? p.id : trip.saveCustomPlace(p, { favorite: false });
  if (!id) { notice.value = '地点坐标不完整，无法加入行程。'; return; }
  notice.value = trip.addPlace(id, trip.day) ? `已加入第 ${trip.day + 1} 天。` : '该地点已在行程中，或当前行程不能添加。';
}
function addWishPlace(p) {
  const value = DEMO.places.some((place) => place.id === p.id) ? p.id : p;
  notice.value = trip.addWishPlace(value) ? '已加入想去清单。' : '地点无法加入想去清单。';
}
function setStayPlace(p) {
  notice.value = trip.setMapStay(p) ? '已将这个地点设为住宿位置；尚未代表预订酒店。' : '地点坐标不完整，无法设为住宿位置。';
}
function useStayAsOrigin() {
  if (!trip.mapStay) { notice.value = '请先在地图上选择住宿位置。'; return; }
  selectEndpoint(trip.mapStay, 'origin');
  notice.value = '已从住宿位置设置起点，请查询路线。';
}
function addRouteToDay() {
  const result = routeData.value;
  const route = result?.routes?.[selectedRouteIndex.value];
  if (!route || !destination.value) return;
  const routeIndex = selectedRouteIndex.value;
  const queriedAt = result.queriedAt;
  const id = DEMO.places.some((place) => place.id === destination.value.id)
    ? destination.value.id
    : trip.saveCustomPlace(destination.value, { favorite: false });
  if (!id) { notice.value = '终点缺少有效坐标，无法加入行程。'; return; }
  const alreadyHere = (trip.plans[trip.day] || []).includes(id);
  if (!alreadyHere && trip.plans.flat().includes(id)) {
    notice.value = '这个地点已经安排在其他日期，请先移动或调整日期。';
    return;
  }
  if (!alreadyHere && !trip.addPlace(id, trip.day)) {
    notice.value = '无法将终点加入当天行程。';
    return;
  }
  const duration = route.time ?? route.durationSeconds ?? null;
  const saved = trip.saveDailyRoute(trip.day, id, {
    fromPlaceId: origin.value?.id ? placeIdentity(origin.value) : 'trip-origin',
    toPlaceId: id,
    fromName: origin.value?.name || trip.origin,
    mode: mode.value,
    durationSeconds: duration,
    queriedAt,
    queryDate: dateIsoAt(trip.start, trip.day),
    source: `高德路线 · 方案 ${routeIndex + 1}`,
    routeIndex,
    distance: routeNumber(route.distance),
    fare: routeNumber(route.cost),
    tolls: routeNumber(route.tolls),
    walkingDistance: routeNumber(route.walking_distance),
    paths: routePaths(route),
    instructions: routeInstructions(route),
    policy: result.policyName,
    departureDate: result.transitDepartureDate,
    departureTime: result.transitDepartureTime,
    originGcj02: routeCoordinate(origin.value, 'origin'),
    destinationGcj02: routeCoordinate(destination.value, 'destination'),
    waypointGcj02: waypoint.value ? routeCoordinate(waypoint.value) : '',
  });
  notice.value = saved
    ? `已将${alreadyHere ? '路线' : '终点和路线'}加入第 ${trip.day + 1} 天；使用方案 ${routeIndex + 1}。`
    : '地点已加入，但路线快照未能保存。';
}
function startEndpointSearch(side) {
  endpointTarget.value = side;
  query.value = '';
  searchResults.value = [];
  searchError.value = '';
  panel.value = 'search';
  nextTick(() => document.querySelector('.map-search input')?.focus());
}
function chooseSearchResult(p) {
  if (endpointTarget.value) {
    const side = endpointTarget.value;
    endpointTarget.value = '';
    selectEndpoint(p, side);
  } else showPlace(p);
}
function selectEndpoint(p, side) {
  if (!mapPosition(p)) { notice.value = '该地点没有可用坐标。'; return; }
  if (side === 'waypoint') waypoint.value = p;
  else (side === 'origin' ? origin : destination).value = p;
  invalidateRoute();
  panel.value = 'route';
}
function routeCoordinate(p, side) {
  const pos = (side === 'origin' ? validPosition(p?.exitGcj02) || validPosition(p?.entranceGcj02) : side === 'destination' ? validPosition(p?.entranceGcj02) : null) || mapPosition(p);
  return pos ? pos.map((n) => n.toFixed(6)).join(',') : '';
}
async function searchRoute() {
  if (!origin.value || !destination.value) return;
  if (mode.value === 'transit' && Boolean(transitDepartureDate.value) !== Boolean(transitDepartureTime.value)) {
    routeError.value = '请同时填写公交出发日期和时间，或清空两项。';
    return;
  }
  if (waypoint.value && mode.value !== 'driving') {
    routeError.value = '目前只验证了驾车途经点，请切换驾车或清除途经点。';
    return;
  }
  clearSavedRoutePreview();
  const token = ++routeToken;
  routeBusy.value = true;
  routeError.value = '';
  routeStatus.value = '';
  routeData.value = null;
  selectedRouteIndex.value = 0;
  expandedRouteIndex.value = null;
  missingRouteGeometry.value = false;
  remove(routeOverlays);
  routeOverlays = [];
  directionPaths = [];
  scheduleRouteDirections();
  try { routeComponent?.clear(); } catch { /* 清理旧组件失败不阻断新查询 */ }
  routeComponent = null;
  if (officialPanel.value) officialPanel.value.innerHTML = '';
  const plugins = { driving: 'AMap.Driving', transit: 'AMap.Transfer', walking: 'AMap.Walking', bicycling: 'AMap.Riding' };
  const plugin = plugins[mode.value];
  if (!plugin) { routeBusy.value = false; routeError.value = '不支持的出行方式。'; return; }
  // SDK 会把 cityd 强转成数字：传城市名会变成 NaN。查询前把终点城市解析成数字代码。
  let transitDestinationCode = '';
  if (mode.value === 'transit') {
    const destinationCity = typeof destination.value?.city === 'string' && destination.value.city.trim()
      ? destination.value.city.trim()
      : String(trip.destination || '').trim();
    transitDestinationCode = await resolveTransitCityCode(destinationCity);
    if (token !== routeToken || disposed) return;
  }
  const timer = setTimeout(() => {
    if (token !== routeToken || !routeBusy.value) return;
    routeToken++;
    routeBusy.value = false;
    routeData.value = null;
    try { routeComponent?.clear(); } catch { /* 超时组件可能已经释放 */ }
    routeComponent = null;
    if (officialPanel.value) officialPanel.value.innerHTML = '';
    routeError.value = '路线查询超时，请检查高德服务权限或稍后重试。';
  }, 25000);
  try {
    window.AMap.plugin([plugin], () => {
      if (token !== routeToken || disposed) { clearTimeout(timer); return; }
      const Constructor = window.AMap[plugin.split('.')[1]];
      if (!Constructor) {
        clearTimeout(timer);
        routeBusy.value = false;
        routeError.value = `高德未加载路线组件：${plugin}`;
        return;
      }
      try {
        // 官方插件未公开路线选中回调：由应用统一绘制和选中，避免面板和保存状态各自变化。
        const options = { extensions: 'all' };
        const policyName = mode.value === 'driving' ? drivingPolicy.value : mode.value === 'transit' ? transitPolicy.value : 'DEFAULT';
        if (policyName !== 'DEFAULT') {
          const policies = mode.value === 'driving' ? window.AMap.DrivingPolicy : window.AMap.TransferPolicy;
          if (policies?.[policyName] == null) throw new Error('当前高德组件不支持所选路线策略，请更换策略。');
          options.policy = policies[policyName];
        }
        if (mode.value === 'transit') {
          const cityName = (place) => (typeof place?.city === 'string' && place.city.trim() ? place.city.trim() : '');
          const originCity = cityName(origin.value);
          if (originCity) options.city = originCity;
          else if (trip.destination) options.city = String(trip.destination).trim();
          if (transitDestinationCode) options.cityd = transitDestinationCode;
        }
        const component = new Constructor(options);
        routeComponent = component;
        if (mode.value === 'transit' && transitDepartureDate.value && transitDepartureTime.value) {
          if (typeof component.leaveAt !== 'function') throw new Error('当前高德组件不支持指定公交出发时间。');
          component.leaveAt(transitDepartureTime.value, transitDepartureDate.value);
        }
        const callback = (resultStatus, result) => {
          clearTimeout(timer);
          if (token !== routeToken || disposed) { try { component.clear(); } catch {} return; }
          routeBusy.value = false;
          if (resultStatus !== 'complete') {
            routeError.value = resultStatus === 'no_data' ? '没有找到可用路线，请更换起终点或出行方式。' : '高德路线查询失败，请检查服务权限、地点坐标或网络。';
            return;
          }
          const routes = result?.routes || result?.plans || [];
          routeData.value = { ...result, routes, queriedAt: new Date().toISOString(), policyName, transitDepartureDate: mode.value === 'transit' ? transitDepartureDate.value : '', transitDepartureTime: mode.value === 'transit' ? transitDepartureTime.value : '' };
          if (mode.value === 'walking' && routes.length) expandedRouteIndex.value = 0;
          const count = Number(result?.count) || routes.length;
          routeStatus.value = `高德官方路线 · ${new Date().toLocaleString('zh-CN')} · 返回 ${count || '未知数量'} 个方案`;
          drawRouteChoices(true);
        };
        const start = routeCoordinate(origin.value, 'origin').split(',').map(Number);
        const end = routeCoordinate(destination.value, 'destination').split(',').map(Number);
        if (start.length !== 2 || end.length !== 2 || ![...start, ...end].every(Number.isFinite)) throw new Error('起终点坐标无效。');
        if (waypoint.value) {
          const via = routeCoordinate(waypoint.value).split(',').map(Number);
          if (via.length !== 2 || !via.every(Number.isFinite)) throw new Error('途经点坐标无效。');
          component.search(start, end, { waypoints: [via] }, callback);
        } else component.search(start, end, callback);
      } catch (error) {
        clearTimeout(timer);
        routeBusy.value = false;
        routeError.value = error.message || '路线组件初始化失败。';
      }
    });
  } catch (error) {
    clearTimeout(timer);
    routeBusy.value = false;
    routeError.value = error.message || '路线组件加载失败。';
  }
}
function toggleTraffic() {
  if (!map) return;
  try {
    if (!trafficLayer) trafficLayer = new window.AMap.TileLayer.Traffic();
    trafficEnabled.value ? map.remove(trafficLayer) : map.add(trafficLayer);
    trafficEnabled.value = !trafficEnabled.value;
  } catch { notice.value = '路况图层暂不可用。'; }
}
function toggleSatellite() {
  if (!map) return;
  try {
    if (!satelliteLayer) satelliteLayer = new window.AMap.TileLayer.Satellite();
    if (!roadLayer) roadLayer = new window.AMap.TileLayer.RoadNet();
    satelliteEnabled.value ? map.remove([satelliteLayer, roadLayer]) : map.add([satelliteLayer, roadLayer]);
    satelliteEnabled.value = !satelliteEnabled.value;
  } catch { notice.value = '卫星图层暂不可用。'; }
}
function pointFromCoordinate(position, name = '地图选点', address = '地图坐标（非高德 POI）') {
  const [lng, lat] = position;
  const wgs = coordtransform.gcj02towgs84(lng, lat);
  const gcj02 = [lng, lat].map((value) => Number(value).toFixed(6)).join(',');
  return {
    id: 'map:' + gcj02,
    name,
    address,
    city: String(trip.destination || ''),
    gcj02,
    wgs84: wgs.map((value) => Number(value).toFixed(6)).join(','),
    coordinateSystem: 'GCJ-02',
    source: '地图右键选点',
  };
}
function normalizeSdkPoi(poi) {
  const position = validPosition(poi?.location);
  if (!position) return null;
  const wgs = coordtransform.gcj02towgs84(...position);
  return {
    id: poi.id ? String(poi.id) : 'map:' + position.map((value) => Number(value).toFixed(6)).join(','),
    name: String(poi.name || '附近地点'),
    address: String(poi.address || ''),
    city: String(poi.cityname || poi.city || trip.destination || ''),
    district: String(poi.adname || poi.district || ''),
    type: String(poi.type || ''),
    gcj02: position.map((value) => Number(value).toFixed(6)).join(','),
    wgs84: wgs.map((value) => Number(value).toFixed(6)).join(','),
    coordinateSystem: 'GCJ-02',
    source: '高德周边搜索',
  };
}
function onMapRightClick(event) {
  if (measuring.value || !event?.lnglat || !container.value) return;
  const position = [event.lnglat.getLng(), event.lnglat.getLat()];
  if (!position.every(Number.isFinite)) return;
  const width = container.value.clientWidth;
  const height = container.value.clientHeight;
  const menuWidth = 178;
  const menuHeight = 294;
  const x = Number(event.pixel?.x ?? 0);
  const y = Number(event.pixel?.y ?? 0);
  contextPoint.value = position;
  contextMenu.value = {
    left: Math.max(8, Math.min(x, Math.max(8, width - menuWidth - 8))),
    top: Math.max(8, Math.min(y, Math.max(8, height - menuHeight - 8))),
  };
}
function onDocumentPointerDown(event) {
  if (!event.target?.closest?.('.map-context-menu')) contextMenu.value = null;
  if (!event.target?.closest?.('.map-actions')) moreOpen.value = false;
}
function onDocumentKeyDown(event) {
  if (event.key === 'Escape') { contextMenu.value = null; moreOpen.value = false; }
}
function onFullscreenChange() {
  mapFullscreen.value = document.fullscreenElement === mapShell.value;
  scheduleMapResize();
}
async function toggleMapFullscreen() {
  try {
    if (document.fullscreenElement === mapShell.value) await document.exitFullscreen();
    else if (!document.fullscreenElement && mapShell.value?.requestFullscreen) await mapShell.value.requestFullscreen();
    else notice.value = '当前窗口无法切换地图全屏。';
  } catch { notice.value = '地图全屏不可用，请检查浏览器权限。'; }
}
function runContextAction(action) {
  const position = contextPoint.value;
  contextMenu.value = null;
  if (!position) return;
  if (action === 'center') {
    map?.setCenter(position);
    notice.value = '已将地图中心移动到所选位置。';
    return;
  }
  if (action === 'clear') {
    origin.value = null;
    destination.value = null;
    waypoint.value = null;
    invalidateRoute();
    panel.value = 'route';
    notice.value = '已清除路线草稿；收藏和每日安排保持不变。';
    return;
  }
  if (['origin', 'waypoint', 'destination'].includes(action)) {
    selectEndpoint(pointFromCoordinate(position), action);
    notice.value = action === 'origin' ? '已将右键位置设为起点。' : action === 'waypoint' ? '已将右键位置设为途经点。' : '已将右键位置设为终点。';
    return;
  }
  if (action === 'where') {
    window.AMap.plugin(['AMap.Geocoder'], () => {
      if (disposed || !map) return;
      const geocoder = new window.AMap.Geocoder({ city: trip.destination || '全国' });
      geocoder.getAddress(position, (resultStatus, result) => {
        if (disposed) return;
        if (resultStatus !== 'complete' || !result?.regeocode) {
          notice.value = '逆地理查询失败，保留了原始坐标。';
          showPlace(pointFromCoordinate(position));
          return;
        }
        showPlace(pointFromCoordinate(position, '地图位置', result.regeocode.formattedAddress || '地址暂无'));
      });
    });
    return;
  }
  if (action === 'nearby') {
    const token = ++searchToken;
    searchBusy.value = true;
    searchError.value = '';
    searchResults.value = [];
    endpointTarget.value = '';
    panel.value = 'search';
    window.AMap.plugin(['AMap.PlaceSearch'], () => {
      if (disposed || token !== searchToken) return;
      const searcher = new window.AMap.PlaceSearch({ city: trip.destination || '全国', pageSize: 10 });
      searcher.searchNearBy('', position, 1000, (resultStatus, result) => {
        if (disposed || token !== searchToken) return;
        searchBusy.value = false;
        const pois = (result?.poiList?.pois || []).map(normalizeSdkPoi).filter(Boolean);
        searchResults.value = pois;
        if (!pois.length) searchError.value = resultStatus === 'complete' ? '附近 1 公里内没有返回可用地点。' : '周边搜索失败，请稍后重试。';
      });
    });
  }
}

function onMapClick(event) {
  if (!measuring.value || !event?.lnglat) return;
  measurePoints.value = [...measurePoints.value, [event.lnglat.getLng(), event.lnglat.getLat()]];
  drawMeasure();
}
function drawMeasure() {
  if (!map) return;
  remove(measureOverlays);
  measureOverlays = measurePoints.value.map((pos, index) => new window.AMap.Marker({ position: pos, content: label(String(index + 1)), anchor: 'center' }));
  if (measurePoints.value.length > 1) measureOverlays.push(new window.AMap.Polyline({ path: measurePoints.value, strokeColor: '#ec7349', strokeWeight: 4, strokeStyle: 'dashed' }));
  if (measureOverlays.length) map.add(measureOverlays);
}
const measureDistance = computed(() => {
  let meters = 0;
  const rad = (n) => n * Math.PI / 180;
  for (let i = 1; i < measurePoints.value.length; i++) {
    const [lng1, lat1] = measurePoints.value[i - 1];
    const [lng2, lat2] = measurePoints.value[i];
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
    meters += 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  }
  return meters < 1000 ? `${Math.round(meters)} 米` : `${(meters / 1000).toFixed(2)} 公里`;
});
function clearMeasure() { measurePoints.value = []; remove(measureOverlays); measureOverlays = []; }
function toggleMeasure() {
  measuring.value = !measuring.value;
  if (measuring.value) { clearMeasure(); notice.value = '在地图上依次点击测量点，距离为直线分段距离。'; }
}
watch(() => [trip.day, JSON.stringify(trip.plans), JSON.stringify(trip.customPlaces), JSON.stringify(trip.savedPlaces), JSON.stringify(trip.wishPlaces), JSON.stringify(trip.mapStay)], () => { renderPoints(); });
// 路线查询属于当时的日期、顺序与住宿；这些输入变化后不能把旧结果写进新安排。
watch(() => [trip.day, trip.start, JSON.stringify(trip.plans), JSON.stringify(trip.mapStay)], () => {
  if (routeBusy.value || routeData.value || routeComponent) invalidateRoute('日期、行程顺序或住宿已变化，请重新查询路线。');
}, { flush: 'sync' });
watch(() => trip.destination, () => {
  detailToken++;
  searchToken++;
  locateToken++;
  searchBusy.value = false;
  searchResults.value = [];
  endpointTarget.value = '';
  selected.value = null;
  clearMapPlaceSelection();
  pendingPlaceFocusId = '';
  origin.value = null;
  destination.value = null;
  waypoint.value = null;
  contextMenu.value = null;
  invalidateRoute('目的地已改变，请重新选择路线起终点。');
  if (ready.value) locateDestination(false);
});
watch(() => mapFocus.version, () => {
  pendingPlaceFocusId = mapFocus.placeId;
  if (ready.value && map) applyPlaceFocus(pendingPlaceFocusId);
});
watch(() => mapFocus.selectedPlaceId, () => {
  if (ready.value && map) renderPoints();
});
watch(() => mapFocus.routeVersion, () => applySavedRouteFocus(mapFocus.selectedRoutePlaceId));
watch(() => mapFocus.selectedRoutePlaceId, () => drawSavedRoute());
watch([routeBusy, routeData], () => drawSavedRoute());
watch(() => [trip.day, trip.start, JSON.stringify(trip.plans), JSON.stringify(trip.dailyTiming)], () => {
  if (visibleSavedRouteId.value && (visibleSavedRouteDay.value !== trip.day || !visibleSavedRoute.value)) {
    clearSavedRoutePreview();
    if (panel.value === 'saved-route') panel.value = '';
  }
  drawSavedRoute();
});
watch(mode, () => invalidateRoute());
watch([drivingPolicy, transitPolicy, transitDepartureDate, transitDepartureTime], () => invalidateRoute(), { flush: 'sync' });
watch(visible, async (open) => {
  if (!open) { subwayOpen.value = false; if (initializing) { initToken++; cancelPendingMapReady?.(); } return; }
  if (!map) await initialize();
  await nextTick();
  scheduleMapResize();
});
onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  document.addEventListener('keydown', onDocumentKeyDown);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  clearMapPlaceSelection();
  initialize();
});
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  disposed = true;
  initToken++;
  searchToken++;
  detailToken++;
  routeToken++;
  locateToken++;
  cancelPendingMapReady?.();
  resizeObserver?.disconnect();
  resizeObserver = null;
  cancelAnimationFrame(resizeFrame);
  cancelAnimationFrame(directionFrame);
  if (map) { map.off('click', onMapClick); map.off('rightclick', onMapRightClick); map.off('hotspotclick', onHotspot); map.destroy(); map = null; }
  try { routeComponent?.clear(); } catch { /* 销毁阶段忽略组件清理错误 */ }
  routeComponent = null;
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  document.removeEventListener('keydown', onDocumentKeyDown);
});
</script>

<template>
  <div ref="mapShell" class="travel-map">
    <div ref="container" class="map-canvas" aria-label="高德地图"></div>
    <canvas ref="directionCanvas" class="route-directions" aria-hidden="true"></canvas>
    <div v-if="contextMenu" class="map-context-menu" :style="{ left: `${contextMenu.left}px`, top: `${contextMenu.top}px` }" @pointerdown.stop @click.stop>
      <button type="button" data-testid="map-context-origin" @click="runContextAction('origin')"><i class="context-origin" aria-hidden="true">起</i>设为起点</button>
      <button type="button" data-testid="map-context-waypoint" @click="runContextAction('waypoint')"><i class="context-waypoint" aria-hidden="true">经</i>设为途经点</button>
      <button type="button" data-testid="map-context-destination" @click="runContextAction('destination')"><i class="context-destination" aria-hidden="true">终</i>设为终点</button>
      <button type="button" data-testid="map-context-where" @click="runContextAction('where')"><i aria-hidden="true">?</i>这是哪儿</button>
      <button type="button" data-testid="map-context-nearby" @click="runContextAction('nearby')"><i aria-hidden="true">⌕</i>搜周边（1 公里）</button>
      <button type="button" data-testid="map-context-center" @click="runContextAction('center')"><i aria-hidden="true">⊙</i>设为地图中心点</button>
      <button type="button" data-testid="map-context-clear" @click="runContextAction('clear')"><i aria-hidden="true">▤</i>清除路线</button>
    </div>
    <div v-if="!ready" class="map-loading" role="status"><p>{{ status }}</p><p v-if="status !== '地图正在加载…'">修改 Key 或安全密钥后，请刷新页面再试。</p><button type="button" @click="initialize">重新加载</button></div>
    <template v-else>
      <form class="map-search" @submit.prevent="search">
        <span class="map-search-mark" aria-hidden="true">➤</span><input v-model="query" aria-label="搜索地图地点" placeholder="搜索位置、公交站、地铁站" maxlength="100">
        <button :disabled="searchBusy" type="submit">{{ searchBusy ? '搜索中' : '搜索' }}</button>
        <button type="button" class="search-route-toggle" aria-label="打开路线规划" :aria-pressed="panel === 'route'" @click="endpointTarget = ''; panel = panel === 'route' ? '' : 'route'">➤</button>
      </form>
      <div class="map-actions" aria-label="地图工具">
        <button type="button" :aria-pressed="satelliteEnabled" @click="toggleSatellite"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 5 5-3 3-5-5 3-3Zm11 11 5 5 3-3-5-5-3 3ZM10 8l6 6-5 5-6-6 5-5Zm5-5 6 6m-4-8 6 6M3 21l3-3"/></svg>卫星</button>
        <button type="button" :aria-pressed="trafficEnabled" @click="toggleTraffic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="3"/><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="18" r="1.5"/><path d="M5 6h2m10 0h2M5 12h2m10 0h2M5 18h2m10 0h2"/></svg>路况</button>
        <button type="button" :aria-pressed="measuring" @click="toggleMeasure"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15 15 3l6 6L9 21l-6-6Zm7-7 2 2m1-5 2 2M7 11l2 2m-5 1 2 2"/></svg>{{ measuring ? '结束测距' : '测距' }}</button>
        <button type="button" :aria-pressed="subwayOpen" @click="subwayOpen = !subwayOpen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2v14m10-14v14M4 7h16M5 16h14M6 21l3-5m9 5-3-5"/></svg>地铁</button>
        <button type="button" @click="toggleMapFullscreen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"/></svg>{{ mapFullscreen ? '退出全屏' : '全屏' }}</button>
        <button type="button" :aria-expanded="moreOpen" aria-controls="map-more-menu" @click="moreOpen = !moreOpen"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>更多</button>
        <div v-if="moreOpen" id="map-more-menu" class="map-more-menu">
          <button type="button" @click="moreOpen = false; fitPoints()">看行程</button>
          <button type="button" @click="moreOpen = false; locateDestination(true)">定位目的地</button>
          <button type="button" @click="moreOpen = false; panel = panel === 'favorites' ? '' : 'favorites'">收藏</button>
          <button type="button" @click="moreOpen = false; panel = panel === 'route' ? '' : 'route'">路线</button>
        </div>
      </div>
      <section v-if="subwayOpen" class="subway-overlay" aria-label="地铁线路图">
        <header><strong>地铁线路图</strong><button type="button" aria-label="关闭地铁图" @click="subwayOpen = false">×</button></header>
        <iframe :src="subwayUrl" title="地铁线路图" sandbox="allow-scripts allow-same-origin"></iframe>
      </section>
      <div v-if="measuring || measurePoints.length" class="measure-bar">
        {{ measuring ? '点击地图添加测量点，点“结束测距”停止' : '直线分段测距' }} · {{ measureDistance }}
        <button type="button" @click="clearMeasure">清除</button>
      </div>
      <section v-show="panel" class="map-panel-card" :class="{ 'route-panel': panel === 'route', 'detail-panel': panel === 'detail' }">
        <header>
          <strong v-if="panel !== 'route'">{{ panel === 'search' ? '搜索结果' : panel === 'favorites' ? '收藏地点' : panel === 'saved-route' ? '已安排路线' : selected?.name }}</strong>
          <nav v-else class="route-tabs" aria-label="交通方式快捷切换">
            <button v-for="item in [{id:'driving',label:'驾车'},{id:'transit',label:'公交'},{id:'walking',label:'步行'},{id:'bicycling',label:'骑行'}]" :key="item.id" type="button" :aria-label="`${item.label}路线`" :aria-pressed="mode === item.id" @click="mode = item.id">
              <svg viewBox="0 0 24 24" aria-hidden="true"><template v-if="item.id === 'driving'"><path d="M5 10 7 5h10l2 5M4 11h16v7H4zM6 18v2m12-2v2M7 14h1m8 0h1" /></template><template v-else-if="item.id === 'transit'"><path d="M5 17V6q0-3 7-3t7 3v11H5Zm0-7h14M7 17v3m10-3v3M8 14h1m6 0h1" /></template><template v-else-if="item.id === 'walking'"><circle cx="13" cy="4" r="2"/><path d="m12 8-3 4-3 1m6-5 3 3 3 1M12 8l-1 6-3 6m3-6 4 3 1 3"/></template><template v-else><circle cx="5" cy="17" r="4"/><circle cx="19" cy="17" r="4"/><path d="m5 17 4-8 4 8H5m4-8 5 0 5 8m-8-12h3"/></template></svg><small>{{ item.label }}</small>
            </button>
          </nav>
          <button type="button" aria-label="关闭面板" @click="endpointTarget = ''; panel = ''">×</button>
        </header>
        <template v-if="panel === 'search'">
          <p v-if="endpointTarget">搜索并选择{{ endpointTarget === 'origin' ? '起点' : endpointTarget === 'waypoint' ? '途经点' : '终点' }} <button type="button" @click="endpointTarget = ''; panel = 'route'">返回路线</button></p>
          <p v-if="searchBusy">正在查询…</p><p v-else-if="searchError" role="alert">{{ searchError }}</p>
          <button v-for="p in searchResults" :key="p.id" type="button" class="place-row" @click="chooseSearchResult(p)"><strong>{{ p.name }}</strong><small>{{ p.city }} {{ p.district }} {{ p.address }}<template v-if="!mapPosition(p)"> · 暂无坐标</template></small></button>
        </template>
        <template v-else-if="panel === 'favorites'">
          <p v-if="!favorites.length">还没有收藏地点。</p>
          <button v-for="p in favorites" :key="p.id" type="button" class="place-row" @click="showPlace(p)"><strong>{{ p.name }}</strong><small>{{ p.address }}</small></button>
        </template>
        <template v-else-if="panel === 'detail' && selected">
          <img v-if="selected.photos?.[0]?.url" class="place-photo" :src="selected.photos[0].url" :alt="selected.photos[0].title || selected.name" referrerpolicy="no-referrer">
          <p>{{ selected.city }} {{ selected.district || selected.area }}</p><p>{{ selected.address || '地址暂无' }}</p>
          <p v-if="detailBusy">正在获取地点详情…</p><p v-else-if="detailError" role="status">{{ detailError }} 已保留当前地点。</p>
          <p v-if="!mapPosition(selected)">该地点暂无坐标，暂不能设为路线端点。</p>
          <p>评分：{{ selected.rating || '暂无' }} · 营业时间（查询时）：{{ selected.openingHoursWeek || selected.openingHoursToday || '暂无' }}</p>
          <p v-if="!selected.photos?.[0]?.url">图片：暂无</p>
          <div class="detail-actions">
            <button type="button" :disabled="detailBusy" @click="toggleFavorite(selected)">{{ selectedFavorite ? '取消收藏' : '收藏' }}</button><button type="button" :disabled="detailBusy" @click="addWishPlace(selected)">加入想去</button><button type="button" :disabled="detailBusy" @click="addPlace(selected)">加入第 {{ trip.day + 1 }} 天</button>
            <button type="button" :disabled="detailBusy" @click="selectEndpoint(selected, 'origin')">设为起点</button><button type="button" class="go-place" :disabled="detailBusy" @click="selectEndpoint(selected, 'destination')">去这里</button>
            <button type="button" :disabled="detailBusy" @click="setStayPlace(selected)">设为住宿位置</button>
          </div>
        </template>
        <div v-if="panel === 'saved-route' && visibleSavedRoute" data-testid="saved-route-detail">
          <p>{{ visibleSavedRoute.route.fromName || '起点' }} → {{ visibleSavedRoute.row.place.name }}</p>
          <p>{{ visibleSavedRoute.row.routeStale ? '路线已过期，请重新查询。' : `预计交通 ${visibleSavedRoute.row.travelMinutes === null ? '未知' : `${visibleSavedRoute.row.travelMinutes} 分钟`}` }}</p>
          <p v-if="!visibleSavedRoute.route.paths?.length">该路线快照没有可绘制的道路坐标。</p>
          <p v-if="visibleSavedRoute.route.queriedAt">查询时间：{{ visibleSavedRoute.route.queriedAt }}</p>
        </div>
        <div v-show="panel === 'route'">
          <div class="route-editor">
          <p>起点：{{ origin?.name || '尚未选择' }} <button type="button" @click="startEndpointSearch('origin')">选择起点</button></p>
          <p>终点：{{ destination?.name || '尚未选择' }} <button type="button" @click="startEndpointSearch('destination')">选择终点</button></p>
          <p v-if="waypoint">途经：{{ waypoint.name }} <button type="button" @click="waypoint = null; invalidateRoute()">移除途经点</button></p>
          <p v-if="trip.mapStay">住宿：{{ trip.mapStay.name }} <button type="button" @click="useStayAsOrigin">从住宿出发</button></p>
          <div class="detail-actions">
            <button type="button" :disabled="!origin || !destination" @click="[origin, destination] = [destination, origin]; invalidateRoute()">交换起终点</button>
            <button type="button" @click="startEndpointSearch('waypoint')">添加途经点</button>
            <button type="button" @click="origin = null; destination = null; waypoint = null; invalidateRoute()">清除路线</button>
          </div>
          </div>
          <form class="route-controls" @submit.prevent="searchRoute">
            <div class="route-form"><select v-model="mode" aria-label="路线出行方式"><option value="transit">公交 / 地铁</option><option value="driving">驾车</option><option value="walking">步行</option><option value="bicycling">骑行</option></select><button type="submit" :disabled="!origin || !destination || routeBusy">{{ routeBusy ? '查询中…' : '查询路线' }}</button></div>
            <label v-if="mode === 'driving'" class="route-setting">驾车路线策略 <select v-model="drivingPolicy" aria-label="驾车路线策略"><option value="DEFAULT">推荐（默认）</option><option value="LEAST_TIME">最快</option><option value="LEAST_FEE">最经济</option><option value="LEAST_DISTANCE">最短距离</option><option value="REAL_TRAFFIC">考虑实时路况</option></select></label>
            <template v-if="mode === 'transit'">
              <label class="route-setting">公交路线策略 <select v-model="transitPolicy" aria-label="公交路线策略"><option value="DEFAULT">推荐（默认）</option><option value="LEAST_TIME">最快</option><option value="LEAST_FEE">最经济</option><option value="LEAST_TRANSFER">少换乘</option><option value="LEAST_WALK">少步行</option><option value="NO_SUBWAY">不乘地铁</option></select></label>
              <div class="route-departure"><label>出发日期 <input v-model="transitDepartureDate" type="date" aria-label="公交出发日期"></label><label>出发时间 <input v-model="transitDepartureTime" type="time" aria-label="公交出发时间"></label></div>
              <p class="route-hint">日期和时间需同时填写；是否影响公交结果尚未完成真实验证。</p>
            </template>
          </form>
          <p v-if="routeStatus" class="route-status" role="status">{{ routeStatus }}</p>
          <div v-if="routeData?.routes?.length" class="route-choice-list" aria-label="路线方案">
            <article v-for="(route, index) in routeData.routes" :key="index" class="route-choice-item">
              <button type="button" class="route-choice" :class="{ active: selectedRouteIndex === index }" :data-testid="`route-option-${index}`" :aria-pressed="selectedRouteIndex === index" @click="selectRoute(index)">
                <strong>方案 {{ index + 1 }} · {{ routeNumber(route.time ?? route.durationSeconds) === null ? '时间未知' : `${Math.ceil(routeNumber(route.time ?? route.durationSeconds) / 60)} 分钟` }}</strong>
                <span>{{ routeNumber(route.distance) === null ? '距离未知' : `${(routeNumber(route.distance) / 1000).toFixed(1)} 公里` }}<template v-if="mode === 'driving' && routeNumber(route.traffic_lights) !== null"> · 红绿灯 {{ routeNumber(route.traffic_lights) }} 个</template><template v-if="routeNumber(route.walking_distance) !== null"> · 步行 {{ (routeNumber(route.walking_distance) / 1000).toFixed(1) }} 公里</template><template v-if="routeNumber(route.cost) !== null"> · 参考 ¥{{ routeNumber(route.cost) }}</template><template v-if="routeNumber(route.tolls) !== null"> · 过路费 ¥{{ routeNumber(route.tolls) }}</template></span>
                <template v-if="mode === 'driving' && routeRoadNames(route)"><span>途经：{{ routeRoadNames(route) }}</span></template>
                <template v-if="mode === 'transit'"><span v-for="(leg, legIndex) in transitLegs(route)" :key="legIndex">{{ leg.name }} · {{ leg.from }} → {{ leg.to }}</span><span v-if="!transitLegs(route).length">线路和车站：暂无</span></template>
              </button>
              <button type="button" class="route-expand" :class="{ expanded: expandedRouteIndex === index }" :data-testid="`route-expand-${index}`" :aria-label="`${expandedRouteIndex === index ? '收起' : '展开'}方案 ${index + 1} 详情`" :aria-expanded="expandedRouteIndex === index" :aria-controls="`route-details-${index}`" @click="toggleRouteDetails(index)"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5" /></svg></button>
              <div v-if="expandedRouteIndex === index" :id="`route-details-${index}`" :data-testid="`route-details-${index}`" class="route-details">
                <ol v-if="routeInstructions(route).length"><li v-for="(instruction, i) in routeInstructions(route)" :key="i">{{ instruction }}</li></ol>
                <p v-else>高德未返回详细路线指引。</p>
              </div>
            </article>
            <p v-if="missingRouteGeometry" class="route-hint">{{ missingRouteGeometry === 'partial' ? '部分路线坐标缺失，仅绘制有连续坐标的路段。' : '当前方案未返回可绘制的路线坐标，未用直线代替。' }}</p>
            <p class="route-hint">线路颜色仅用于区分方案；未显示实时路况。</p>
            <button type="button" class="button outline small" @click="addRouteToDay">将选中方案加入第 {{ trip.day + 1 }} 天</button>
          </div>
          <p v-if="routeError" role="alert">{{ routeError }}</p>
          <div ref="officialPanel" class="official-route-panel"></div>
          <small>路线由高德官方组件查询、工作台绘制；时间和费用是本次查询快照，不代表未来实际出行。</small>
        </div>
      </section>
      <div class="map-caption">第 {{ trip.day + 1 }} 天 · 数字为行程顺序，星标为收藏<span v-if="unknownPoints"> · {{ unknownPoints }} 个地点缺少坐标</span><span v-if="demoPoints"> · 示例地点坐标仅供参考</span></div>
      <div v-if="notice" class="map-notice" role="status" @click="notice = ''">{{ notice }} <span aria-hidden="true">×</span></div>
    </template>
  </div>
</template>

<style scoped>
.travel-map { position: relative; container-type: inline-size; width: 100%; height: 100%; min-height: 420px; overflow: hidden; background: #e7eee8; color: #253b32; font-size: 13px; }
.map-canvas { position: absolute; inset: 0; }
.route-directions { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.map-loading { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 12px; align-items: center; justify-content: center; padding: 24px; text-align: center; background: #f1f4ef; }
button, input, select { font: inherit; }
button { cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .55; }
.map-search, .map-actions, .map-panel-card, .map-caption, .map-notice, .measure-bar { position: absolute; z-index: 2; background: #fff; box-shadow: 0 3px 14px #24372e24; }
.map-search { top: 16px; left: 16px; display: flex; width: min(320px, calc(100% - 32px)); border-radius: 8px; overflow: hidden; }
.map-search input { flex: 1; min-width: 0; padding: 12px; border: 0; outline-offset: -2px; }
.map-search button, .route-form button { border: 0; background: #3281dc; color: white; padding: 0 16px; }
.map-actions { right: 16px; top: 16px; display: flex; flex-wrap: wrap; gap: 2px; max-width: 190px; padding: 4px; border-radius: 8px; }
.map-actions button, .detail-actions button, .measure-bar button { border: 0; border-radius: 5px; background: #fff; color: #334b41; padding: 8px; }
.map-actions button[aria-pressed="true"], .detail-actions button:hover { background: #e3f0e9; color: #205d41; }
.map-panel-card { top: 70px; left: 16px; width: min(320px, calc(100% - 32px)); max-height: calc(100% - 130px); overflow: auto; border-radius: 8px; padding: 14px; }
.map-panel-card header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.map-context-menu { position: absolute; z-index: 12; width: 178px; padding: 6px; border: 1px solid #dce5dc; border-radius: 9px; background: #fffefa; box-shadow: 0 8px 26px #1d342b35; display: grid; gap: 2px; }
.map-context-menu button { border: 0; border-radius: 5px; background: transparent; color: #30463b; padding: 9px 10px; text-align: left; font-size: 12px; }
.map-context-menu button:hover, .map-context-menu button:focus-visible { background: #edf4ed; outline: none; }
.official-route-panel { max-height: min(42vh, 420px); margin-top: 8px; overflow: auto; overscroll-behavior: contain; border-top: 1px solid #edf1ed; }
.official-route-panel:empty { display: none; }
.route-status { color: #486f54; font-size: 11px; }
.place-photo { display: block; max-width: 100%; max-height: 160px; object-fit: cover; border-radius: 8px; }
.route-choice-list { display: grid; gap: 7px; margin: 10px 0; }
.route-choice { display: grid; gap: 4px; width: 100%; padding: 10px; text-align: left; background: #fff; border: 1px solid #dce5e0; border-radius: 8px; color: #263c31; cursor: pointer; }
.route-choice.active { border-color: #3281dc; background: #f0f7ff; }
.route-choice span, .route-hint { font-size: 11px; color: #65766d; }
.map-panel-card header button { border: 0; background: none; font-size: 22px; }
.map-panel-card p { margin: 9px 0; line-height: 1.5; }
.map-panel-card small { color: #65766e; line-height: 1.5; }
.place-row { display: flex; flex-direction: column; gap: 4px; width: 100%; text-align: left; padding: 10px 4px; background: transparent; border: 0; border-bottom: 1px solid #edf1ed; }
.place-row:hover, .place-row.active { background: #eef6f1; }
.detail-actions { display: flex; flex-wrap: wrap; gap: 4px; }
.detail-actions button { border: 1px solid #d9e5dc; }
.route-instructions { margin: 12px 0; font-size: 12px; line-height: 1.6; }
.route-instructions ol { margin: 6px 0; padding-left: 20px; }
.route-form { display: flex; height: 36px; margin: 12px 0; }
.route-form select { flex: 1; min-width: 0; border: 1px solid #d9e5dc; }
.route-setting { display: flex; align-items: center; gap: 8px; margin: 8px 0; font-size: 12px; }
.route-setting select { flex: 1; min-width: 0; border: 1px solid #d9e5dc; padding: 5px; }
.route-departure { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; }
.route-departure label { display: grid; gap: 3px; flex: 1 1 110px; min-width: 0; }
.route-departure input { min-width: 0; width: 100%; border: 1px solid #d9e5dc; padding: 5px; }
.travel-map { color: #4c4c4c; background: #e9edef; }
.map-search { border-radius: 3px; box-shadow: 0 2px 7px #0003; }
.map-search-mark { display: grid; place-items: center; color: #168fff; font-size: 22px; width: 38px; transform: rotate(-25deg); }
.map-search input { padding: 12px 4px; }
.map-search button { background: #fff; color: #168fff; border-left: 1px solid #eee; }
.map-search .search-route-toggle { padding: 0 11px; font-size: 18px; }
.map-search .search-route-toggle[aria-pressed="true"] { background: #edf6ff; }
.map-actions { display: flex; flex-wrap: nowrap; gap: 0; width: max-content; max-width: calc(100% - 32px); padding: 0 4px; border-radius: 3px; box-shadow: 0 2px 7px #0003; }
.map-actions > button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; position: relative; min-height: 44px; padding: 0 10px; color: #788197; border-radius: 0; white-space: nowrap; }
.map-actions > button:not(:last-of-type)::after { position: absolute; right: 0; height: 20px; border-right: 1px dashed #d9dce2; content: ''; }
.map-actions svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
.map-actions > button:disabled { color: #aab0bc; opacity: .6; }
.map-more-menu { position: absolute; top: calc(100% + 6px); right: 0; width: 130px; padding: 5px 0; background: #fff; box-shadow: 0 3px 12px #0003; border-radius: 3px; }
.map-more-menu button { display: block; width: 100%; padding: 9px 14px; text-align: left; color: #59667a; border-radius: 0; }
.map-more-menu button:hover { background: #eef6ff; color: #168fff; }
.travel-map:fullscreen { width: 100vw; height: 100vh; }
.subway-overlay { position: absolute; z-index: 15; inset: 0; display: flex; flex-direction: column; background: #fff; }
.subway-overlay > header { height: 44px; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 0 14px; background: #fff; color: #3f5268; box-shadow: 0 2px 6px #0002; }
.subway-overlay > header button { border: 0; background: none; color: #718096; font-size: 26px; line-height: 1; }
.subway-overlay iframe { flex: 1; width: 100%; min-height: 0; border: 0; }
.map-actions button[aria-pressed="true"], .map-actions button:hover { background: #eef6ff; color: #168fff; }
.map-panel-card { border-radius: 3px; box-shadow: 0 2px 9px #0003; }
.map-panel-card.detail-panel .place-photo { width: 100%; max-height: 180px; border-radius: 0; }
.detail-panel .detail-actions { gap: 4px 6px; border-top: 1px solid #eee; padding-top: 10px; }
.detail-panel .detail-actions button { border: 0; border-radius: 2px; color: #168fff; padding: 7px 5px; }
.detail-panel .detail-actions button:hover { background: #edf7ff; color: #0876d9; }
.detail-panel .detail-actions .go-place { color: #fff; background: #1687f9; padding: 7px 12px; }
.map-context-menu { padding: 7px 0; border: 0; border-radius: 1px; background: #fff; box-shadow: 0 5px 20px #0003; gap: 0; }
.map-context-menu button { display: flex; align-items: center; gap: 11px; min-height: 37px; padding: 7px 14px; color: #555; font-size: 13px; border-radius: 0; }
.map-context-menu button:nth-child(4) { border-top: 1px solid #ddd; margin-top: 5px; padding-top: 11px; }
.map-context-menu button:hover, .map-context-menu button:focus-visible { background: #eef7ff; }
.map-context-menu i { display: inline-grid; place-items: center; flex: 0 0 20px; width: 20px; height: 20px; border-radius: 50%; color: #168fff; font-style: normal; font-weight: 600; }
.map-context-menu .context-origin, .map-context-menu .context-waypoint, .map-context-menu .context-destination { color: #fff; background: #378cf2; font-weight: 400; }
.map-context-menu .context-waypoint { background: #09bfd2; }
.map-context-menu .context-destination { background: #ec3e30; }
.map-panel-card.route-panel { top: 70px; padding: 0; max-height: calc(100% - 130px); }
.route-panel > header { padding: 5px 12px 0; background: #398cf5; color: #fff; }
.route-panel > header > button { color: #fff; }
.route-tabs { display: flex; justify-content: space-around; flex: 1; }
.route-tabs button { display: grid; place-items: center; gap: 1px; min-width: 42px; padding: 5px; border: 0; background: transparent; color: #bad8ff; font-size: 17px; }
.route-tabs svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.route-tabs button small { color: inherit; font-size: 10px; }
.route-tabs button[aria-pressed="true"] { color: #fff; font-weight: bold; }
.route-editor { padding: 8px 16px 14px; background: #398cf5; color: #fff; }
.route-editor p { display: flex; align-items: center; justify-content: space-between; gap: 5px; padding: 5px 8px; background: #317edf; }
.route-editor p button { flex: none; border: 0; padding: 4px 6px; background: #5ca3fa; color: #fff; }
.route-editor .detail-actions button { border: 0; color: #fff; background: #5ba0f4; }
.route-controls { padding: 2px 14px 8px; border-bottom: 1px solid #eee; }
.route-controls .route-form { margin: 8px 0; }
.route-controls .route-form select, .route-controls .route-setting select, .route-controls input { border: 1px solid #dce5ef; color: #40556c; background: #fff; }
.route-controls .route-form button { background: #398cf5; }
.route-panel .route-status, .route-panel .route-choice-list, .route-panel > div > p, .route-panel > div > small { margin-left: 14px; margin-right: 14px; }
.route-panel > div > small { display: block; margin-bottom: 12px; }
.route-choice-list { gap: 0; }
.route-choice-item { position: relative; border-bottom: 1px solid #eee; }
.route-choice { border: 0; border-radius: 0; padding: 12px 40px 12px 12px; color: #444; }
.route-choice.active { border-color: #eee; background: #f1f7fb; }
.route-choice strong { color: #1887ed; }
.route-choice span, .route-hint { color: #808080; }
.route-expand { position: absolute; top: 20px; right: 4px; display: grid; place-items: center; width: 32px; height: 32px; border: 0; background: transparent; color: #7a858b; }
.route-expand svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; transition: transform .15s ease; }
.route-expand.expanded svg { transform: rotate(180deg); }
.route-expand:hover, .route-expand:focus-visible { color: #1687ed; }
.route-details { padding: 4px 12px 12px; background: #f8fbfd; color: #59666d; line-height: 1.7; font-size: 12px; }
.route-details ol { margin: 0; padding-left: 22px; }
.route-details li { padding: 5px 0; border-top: 1px solid #e8eef2; }
.map-caption { bottom: 12px; left: 12px; right: 12px; padding: 7px 10px; border-radius: 6px; font-size: 11px; background: #ffffffeb; }
.measure-bar { bottom: 50px; right: 16px; padding: 4px 8px; border-radius: 6px; }
.map-notice { bottom: 52px; left: 16px; max-width: 320px; padding: 10px; border-radius: 6px; cursor: pointer; }
:deep(.travel-map-marker) { display: grid; place-items: center; width: 27px; height: 27px; border-radius: 50%; background: #3383db; color: white; border: 2px solid white; font-weight: bold; box-shadow: 0 2px 7px #0005; transition: background .16s ease, box-shadow .16s ease, transform .16s ease; }
:deep(.travel-map-marker.selected) { background: #df663c; box-shadow: 0 0 0 4px #df663c33, 0 4px 12px #0004; transform: scale(1.16); }
:deep(.travel-map-marker.selection-only) { width: 18px; height: 18px; border-width: 3px; box-shadow: 0 0 0 7px #df663c2e, 0 3px 10px #0004; transform: none; }
:deep(.travel-map-marker.selection-only::after) { content: ""; width: 4px; height: 4px; border-radius: 50%; background: white; }
@container (max-width: 720px) { .map-actions { top: 68px; left: 16px; right: auto; } .map-panel-card, .map-panel-card.route-panel { top: 124px; max-height: calc(100% - 184px); } }
@container (max-width: 390px) { .map-actions > button { gap: 3px; padding: 0 4px; font-size: 11px; } .map-actions svg { width: 14px; height: 14px; } }
</style>
