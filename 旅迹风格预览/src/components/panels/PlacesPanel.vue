<script setup>
import { computed, ref } from 'vue';
import { useTripStore } from '../../stores/trip.js';
import { DEMO } from '../../data/demo.js';
import { isSampleDestination } from '../../domain/places.js';
import { dateAt } from '../../domain/dates.js';
import { toast } from '../../ui/feedback.js';
import { focusPlaceOnMap, mapFocus } from '../../ui/mapFocus.js';
import ThemeSelect from '../ThemeSelect.vue';

const trip = useTripStore();
const targetDay = ref(trip.day);
const savedCustom = computed(() => (trip.savedPlaces || []).map((id) => trip.customPlaces?.[id]).filter(Boolean));
const wishCustom = computed(() => (trip.wishPlaces || []).map((id) => DEMO.places.find((place) => place.id === id) || trip.customPlaces?.[id]).filter(Boolean));
function isMapSelected(placeId) {
  const selectedId = mapFocus.selectedPlaceId;
  return selectedId === placeId || (placeId?.startsWith('poi:') && selectedId === placeId.slice(4) && DEMO.places.some((place) => place.id === selectedId));
}

function addPlace(id) {
  if (trip.addPlace(id, Number(targetDay.value))) toast(`已加入第 ${Number(targetDay.value) + 1} 天`);
  else toast('这个地点已经在行程里了。');
}

function showOnMap(id) {
  focusPlaceOnMap(id);
  if (!trip.mapOpen) trip.toggleMap();
}
</script>

<template>
  <div class="surface">
    <label class="field">加入哪一天
      <ThemeSelect v-model="targetDay" :options="trip.plans.map((_, index) => ({ value: index, label: `第 ${index + 1} 天 · ${dateAt(trip.start, index)}` }))" aria-label="加入哪一天" />
    </label>
    <p class="subtle">杭州真实地点示例；图片为示意，门票和开放信息待核实。</p>
    <article
      v-for="place in DEMO.places"
      :key="place.id"
      class="option-card place-image-card place-focus-card"
      :class="{ selected: mapFocus.selectedPlaceId === place.id }"
      role="button"
      tabindex="0"
      :aria-label="`在地图上查看${place.name}`"
      :aria-pressed="mapFocus.selectedPlaceId === place.id"
      @click="showOnMap(place.id)"
      @keydown.enter="showOnMap(place.id)"
      @keydown.space.prevent="showOnMap(place.id)"
    >
      <div class="place-image-placeholder" role="img" aria-label="风景示意图，非地点实景">
        <svg viewBox="0 0 120 100" aria-hidden="true"><circle cx="88" cy="24" r="10" fill="#e4bc78"/><path d="M0 67 31 35 58 64 75 45 120 77V100H0Z" fill="#a8bba3"/><path d="M0 78 31 59 54 76 82 62 120 82V100H0Z" fill="#708e7c"/><path d="M0 86 Q30 78 60 86 T120 86 V100H0Z" fill="#9fc2b5"/></svg>
        <small>示意图</small>
      </div>
      <div class="place-card-content">
        <h3>{{ place.name }}</h3>
        <p class="subtle">{{ place.area }} · {{ place.kind }}</p>
        <p class="subtle">门票待核实 · {{ place.duration }}</p>
        <div class="place-card-actions">
          <button type="button" class="button outline small" :disabled="trip.plans.flat().includes(place.id) || !isSampleDestination(trip.$state)" @click.stop="addPlace(place.id)" @keydown.stop>
            {{ trip.plans.flat().includes(place.id) ? '已加入行程' : '+ 加入当天' }}
          </button>
        </div>
      </div>
    </article>
    <section v-if="wishCustom.length" class="surface saved-custom-places">
      <h2>想去清单</h2>
      <p class="subtle">先收集地点，再决定安排在哪一天。</p>
      <article v-for="place in wishCustom" :key="place.id" class="option-card place-focus-card" :class="{ selected: isMapSelected(place.id) }" :data-place-id="place.id">
        <div class="option-top"><h3>{{ place.name }}</h3><span class="mini-tag">{{ place.city || '真实地点' }}</span></div>
        <p>{{ place.address || '地址暂无' }}</p>
        <div class="place-card-actions">
          <button type="button" class="button outline small" :aria-pressed="isMapSelected(place.id)" @click="showOnMap(place.id)">地图定位</button>
          <button type="button" class="button outline small" :disabled="trip.plans.flat().includes(place.id)" @click="addPlace(place.id)">{{ trip.plans.flat().includes(place.id) ? '已加入行程' : `加入第 ${Number(targetDay) + 1} 天` }}</button>
          <button type="button" class="text-button" @click="trip.removeWishPlace(place.id)">移出想去</button>
        </div>
      </article>
    </section>
    <section v-if="savedCustom.length" class="surface saved-custom-places">
      <h2>已收藏的真实地点</h2>
      <p class="subtle">来自高德搜索或地图选点；地点收藏与每日安排相互独立。</p>
      <article v-for="place in savedCustom" :key="place.id" class="option-card place-focus-card" :class="{ selected: isMapSelected(place.id) }" :data-place-id="place.id">
        <div class="option-top"><h3>{{ place.name }}</h3><span class="mini-tag">{{ place.city || '真实地点' }}</span></div>
        <p>{{ place.address || '地址暂无' }}</p>
        <div class="place-card-actions">
          <button type="button" class="button outline small" :aria-pressed="isMapSelected(place.id)" @click="showOnMap(place.id)">地图定位</button>
          <button type="button" class="button outline small" :disabled="trip.plans.flat().includes(place.id)" @click="addPlace(place.id)">{{ trip.plans.flat().includes(place.id) ? '已加入行程' : `加入第 ${Number(targetDay) + 1} 天` }}</button>
          <button type="button" class="text-button" @click="trip.removeSavedPlace(place.id)">取消收藏</button>
        </div>
      </article>
    </section>
    <p v-if="!isSampleDestination(trip.$state) && !savedCustom.length && !wishCustom.length" class="note">这些地点仅适用于杭州，当前目的地暂未接入地点数据。</p>
  </div>
</template>
