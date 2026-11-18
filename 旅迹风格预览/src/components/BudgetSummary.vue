<script setup>
import { computed } from 'vue';
import { useTripStore } from '../stores/trip.js';
import { budgetOf } from '../domain/budget.js';
import { toMinor, formatYuan } from '../domain/money.js';
import { DEMO } from '../data/demo.js';

const trip = useTripStore();
const result = computed(() => budgetOf(trip.$state, DEMO));
</script>

<template>
  <section class="compact-summary" aria-label="旅行费用摘要">
    <div><small>当前估算 <span>示例</span></small><strong>{{ formatYuan(toMinor(result.total)) }}</strong></div>
    <div><small>整趟预算</small><b>{{ formatYuan(toMinor(trip.budget)) }}</b></div>
    <div><small>{{ result.transportName ? '往返交通' : '交通待定' }}</small><b>{{ result.transportName || '尚未计入' }}</b></div>
    <div><small>住宿</small><b>{{ result.stayName }}</b></div>
  </section>
</template>
