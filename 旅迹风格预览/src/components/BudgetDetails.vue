<script setup>
import { computed } from 'vue';
import { useTripStore } from '../stores/trip.js';
import { budgetOf } from '../domain/budget.js';
import { toMinor, formatYuan } from '../domain/money.js';
import { DEMO } from '../data/demo.js';

const trip = useTripStore();
const b = computed(() => budgetOf(trip.$state, DEMO));
const over = computed(() => b.value.total > trip.budget);
const partial = computed(() => !b.value.transportName || !trip.hotel || b.value.missingTickets > 0);
</script>

<template>
  <div class="budget-box">
    <div>
      <strong>整趟费用估算</strong>
      <p>{{ trip.people }} 人 · {{ trip.days }} 天 · {{ trip.rooms }} 间房 · 示例金额</p>
    </div>
    <span class="money">{{ formatYuan(toMinor(b.total)) }}</span>
  </div>
  <div class="budget-details">
    <div>
      <span>往返交通{{ b.transportName ? '' : '（未选，暂不计）' }}</span>
      <span>{{ formatYuan(toMinor(b.rail)) }}</span>
    </div>
    <div>
      <span>住宿 · {{ Math.max(0, trip.days - 1) }} 晚{{ trip.hotel ? '' : trip.mapStay ? '（地点已选，价格未计）' : '（未选，暂不计）' }}</span>
      <span>{{ formatYuan(toMinor(b.stay)) }}</span>
    </div>
    <div>
      <span>已加入景点的示例门票{{ b.missingTickets ? `（${b.missingTickets} 个地点门票价格未核实）` : '' }}</span>
      <span>{{ formatYuan(toMinor(b.tickets)) }}</span>
    </div>
    <div>
      <span>餐饮 / 市内交通预留 · 每人每天 ¥100</span>
      <span>{{ formatYuan(toMinor(b.daily)) }}</span>
    </div>
    <div :class="{ 'budget-over': over }">
      <b>{{ over ? '超出预算' : '预算余量' }}{{ partial ? '（估算尚不完整）' : '' }}</b>
      <b>{{ formatYuan(toMinor(Math.abs(trip.budget - b.total))) }}</b>
    </div>
  </div>
</template>
