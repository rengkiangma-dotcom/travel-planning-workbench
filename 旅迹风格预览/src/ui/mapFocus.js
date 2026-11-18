import { reactive } from 'vue';

const mapFocus = reactive({
  placeId: '',
  selectedPlaceId: '',
  selectedRoutePlaceId: '',
  routeVersion: 0,
  version: 0,
});

function normalizePlaceId(placeId) {
  return String(placeId || '');
}

export function focusPlaceOnMap(placeId) {
  const id = normalizePlaceId(placeId);
  mapFocus.placeId = id;
  mapFocus.selectedPlaceId = id;
  mapFocus.selectedRoutePlaceId = '';
  mapFocus.version += 1;
}

export function selectPlaceOnMap(placeId) {
  mapFocus.selectedPlaceId = normalizePlaceId(placeId);
  mapFocus.selectedRoutePlaceId = '';
}

// 已保存交通段以其本次访问终点 ID 标识；日期由当前行程日决定。
export function focusSavedRouteOnMap(placeId) {
  mapFocus.selectedRoutePlaceId = normalizePlaceId(placeId);
  mapFocus.selectedPlaceId = '';
  mapFocus.routeVersion += 1;
}

export function clearMapPlaceSelection() {
  mapFocus.placeId = '';
  mapFocus.selectedPlaceId = '';
  mapFocus.selectedRoutePlaceId = '';
}

export { mapFocus };
