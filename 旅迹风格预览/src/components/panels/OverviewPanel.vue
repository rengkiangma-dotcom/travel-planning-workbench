<script setup>
import { computed } from 'vue';
import { useTripStore } from '../../stores/trip.js';
import { DEMO } from '../../data/demo.js';
import { isSampleDestination, placeById } from '../../domain/places.js';
import BudgetDetails from '../BudgetDetails.vue';

const trip = useTripStore();
const sample = computed(() => isSampleDestination(trip.$state));
const counts = computed(() => ({
  days: trip.plans.length,
  places: trip.plans.flat().length,
  pool: (trip.wishPlaces || []).length,
}));
const planned = computed(() => (trip.plans.flat() || [])
  .map((id) => placeById(trip.$state, id, DEMO.places))
  .filter(Boolean)
  .slice(0, 4));
</script>

<template>
  <div v-if="!sample" class="note">你的需求已保存。目前仅有上海—杭州的演示交通及杭州地点，不会为其他城市自动生成虚假结果。</div>

  <div v-if="trip.original" class="surface">
    <div class="original-header"><strong>你带来的行程</strong><span class="protected">原文已保留</span></div>
    <pre class="original-text">{{ trip.original }}</pre>
  </div>

  <div class="surface" style="margin-top:18px">
    <div class="budget-details">
      <div><span>已安排天数</span><span>{{ counts.days }}</span></div>
      <div><span>已安排地点</span><span>{{ counts.places }}</span></div>
      <div><span>待规划地点</span><span>{{ counts.pool }}</span></div>
    </div>
    <p v-if="planned.length" class="subtle">已加入：{{ planned.map((p) => p.name).join('、') }}{{ counts.places > planned.length ? ' 等' : '' }}</p>
    <BudgetDetails />
  </div>

  <div v-if="counts.places === 0" class="no-map-hint">
    <span>想先看看每日安排长什么样？</span>
    <button class="button outline small" :disabled="!sample" @click="trip.loadSample()">载入杭州示例</button>
  </div>
</template>
