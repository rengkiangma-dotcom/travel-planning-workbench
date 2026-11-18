<script setup>
import { computed, nextTick, watch } from 'vue';
import { useTripStore } from '../../stores/trip.js';
import { DEMO } from '../../data/demo.js';
import { placeById } from '../../domain/places.js';
import { dateAt, dateIsoAt } from '../../domain/dates.js';
import { calculateDaySchedule, formatTimeOfDay } from '../../domain/schedule.js';
import { toMinor, formatYuan } from '../../domain/money.js';
import { toast } from '../../ui/feedback.js';
import { focusPlaceOnMap, focusSavedRouteOnMap, mapFocus } from '../../ui/mapFocus.js';
import ThemeSelect from '../ThemeSelect.vue';

const trip = useTripStore();
const money = (value) => formatYuan(toMinor(value));
const plan = computed(() => (trip.plans[trip.day] || []).map((id) => placeById(trip.$state, id, DEMO.places)).filter(Boolean));
const available = computed(() => {
  const seen = new Set();
  return [
    ...DEMO.places,
    ...(trip.wishPlaces || []).map((id) => DEMO.places.find((place) => place.id === id) || trip.customPlaces?.[id]),
    ...(trip.savedPlaces || []).map((id) => trip.customPlaces?.[id]),
  ].filter((place) => {
    if (!place || seen.has(place.id) || trip.plans.flat().includes(place.id)) return false;
    seen.add(place.id);
    return true;
  });
});
const timing = computed(() => trip.dailyTiming?.[trip.day] || { startTime: '09:00', visits: {} });
const scheduleRows = computed(() => calculateDaySchedule({ places: plan.value, timing: timing.value, date: dateIsoAt(trip.start, trip.day) }));
function setStartTime(event) { trip.setDayStartTime(trip.day, event.target.value); }
function setStayMinutes(placeId, event) { trip.setPlaceStayMinutes(trip.day, placeId, event.target.value); }
function setFixedArrival(placeId, event) { trip.setFixedArrivalTime(trip.day, placeId, event.target.value); }
function setFixedDate(placeId, event) { trip.setFixedArrivalDate(trip.day, placeId, event.target.value); }

function addQuick(id) {
  if (!id) return;
  if (trip.addPlace(id, trip.day)) toast(`已加入第 ${trip.day + 1} 天`);
  else toast('这个地点已经在行程里了。');
}

function moveTo(id, day) {
  const target = Number(day);
  if (target === trip.day) return;
  if (trip.movePlaceToDay(id, target)) toast(`已移动到第 ${target + 1} 天`);
  else toast('目标日期已有这个地点的安排资料，请先检查，避免覆盖。');
}

function showOnMap(id) {
  focusPlaceOnMap(id);
  if (!trip.mapOpen) trip.toggleMap();
}
function showSavedRoute(id) {
  focusSavedRouteOnMap(id);
  if (!trip.mapOpen) trip.toggleMap();
}
watch(() => mapFocus.selectedRoutePlaceId, async (id) => {
  if (!id) return;
  await nextTick();
  const row = [...document.querySelectorAll('.day-time-list li')].find((item) => item.dataset.routePlace === id);
  row?.scrollIntoView({ block: 'nearest' });
});

</script>

<template>
  <div class="day-header">
    <div class="day-tabs">
      <button
        v-for="(_, i) in trip.plans"
        :key="i"
        class="day-button"
        :class="{ active: i === trip.day }"
        @click="trip.setDay(i)"
      >
        第 {{ i + 1 }} 天
      </button>
      <button v-if="trip.days < 7" class="day-button" @click="trip.addDay()">＋ 加一天</button>
    </div>
    <button class="text-button" :disabled="!trip.undo.length" @click="trip.undoPlans()">↶ 撤销</button>
  </div>

  <div class="day-intro">
    <span>{{ dateAt(trip.start, trip.day) }} · {{ plan.length }} 个地点 · 时间按已确认路线和停留时长计算</span>
    <button class="text-button" @click="trip.toggleMap()">{{ trip.mapOpen ? '地图已展开' : '在地图上看 ↗' }}</button>
  </div>

  <section v-if="plan.length" class="day-time-planner">
    <div class="day-time-head">
      <label>当天出发时间 <input type="time" :value="timing.startTime || '09:00'" @change="setStartTime"></label>
      <span>缺少交通或停留数据时显示“待填写”，不会按 0 分钟计算。</span>
    </div>
    <ol class="day-time-list">
      <li v-for="row in scheduleRows" :key="row.place.id" :data-route-place="row.place.id" :class="{ 'route-selected': mapFocus.selectedRoutePlaceId === row.place.id }">
        <div class="day-time-title"><strong>{{ row.place.name }}</strong><span>交通：{{ row.routeStale ? '路线过期' : row.travelMinutes === null ? '待填写' : `${row.travelMinutes} 分钟` }}</span></div>
        <button v-if="timing.visits?.[row.place.id]?.route" type="button" class="icon-button" :aria-label="`地图查看至${row.place.name}的路线`" :aria-pressed="mapFocus.selectedRoutePlaceId === row.place.id" @click="showSavedRoute(row.place.id)">查看地图路线</button>
        <div class="day-time-fields">
          <span>到达 <b>{{ formatTimeOfDay(row.arrival) }}</b></span>
          <span>离开 <b>{{ formatTimeOfDay(row.leave) }}</b></span>
          <label>固定到达 <input type="time" :value="row.fixedArrivalTime" @change="setFixedArrival(row.place.id, $event)"></label>
          <label v-if="row.fixedArrivalTime">预约日期 <input type="date" :value="row.fixedArrivalDate || (row.fixedDateUnknown ? '' : dateIsoAt(trip.start, trip.day))" @change="setFixedDate(row.place.id, $event)"></label>
          <label>停留（分钟） <input type="number" min="0" max="1440" :value="row.stayMinutes ?? ''" placeholder="待填写" @change="setStayMinutes(row.place.id, $event)"></label>
        </div>
        <p v-if="row.routeStale" class="time-warning">路线可能因前一站、住宿、日期或公交出发时间变化或未知而过期，请重新查询。</p>
        <p v-if="row.conflict" class="time-warning">固定预约时间早于预计到达时间，请调整。</p>
        <p v-if="row.fixedDateUnknown" class="time-warning">预约日期或行程日期未知，请填写后计算。</p>
      </li>
    </ol>
  </section>

  <ol v-if="plan.length" class="timeline">
    <li v-for="(place, index) in plan" :key="place.id" class="event">
      <span class="event-num">{{ index + 1 }}</span>
      <article class="event-card">
        <div class="event-top">
          <h3>{{ place.name }}</h3>
          <span class="price-pill">{{ place.cost === null || place.cost === undefined ? '价格未知' : place.cost ? money(place.cost) + ' / 人' : '示例免费' }}</span>
        </div>
        <div class="event-meta">
          <span>{{ place.area }}</span>
          <span>{{ place.duration }}</span>
        </div>
        <p>{{ place.address || place.note }}</p>
        <div class="event-actions">
          <button class="icon-button" type="button" :aria-label="`在地图查看${place.name}`" @click="showOnMap(place.id)">地图定位</button>
          <button class="icon-button" :disabled="index === 0" @click="trip.movePlace(place.id, -1)">↑ 上移</button>
          <button class="icon-button" :disabled="index === plan.length - 1" @click="trip.movePlace(place.id, 1)">↓ 下移</button>
          <ThemeSelect class="compact-select" :model-value="trip.day" :options="trip.plans.map((_, day) => ({ value: day, label: `第 ${day + 1} 天` }))" :aria-label="`移动${place.name}到其他日期`" @change="moveTo(place.id, $event)" />
          <button class="icon-button" @click="trip.removePlace(place.id)">移除</button>
        </div>
      </article>
    </li>
  </ol>
  <div v-else class="empty">这一天还留着空白。<br>在下面选几个想去的地方。</div>

  <div v-if="/杭州/.test(trip.destination)" class="add-place">
    <ThemeSelect model-value="" :options="[{ value: '', label: '＋ 添加杭州示例地点' }, ...available.map((place) => ({ value: place.id, label: place.name }))]" aria-label="选择添加的地点" @change="addQuick" />
  </div>

</template>

<style scoped>
.day-time-list li.route-selected { outline: 2px solid #3281dc; outline-offset: 3px; border-radius: 6px; }
</style>
