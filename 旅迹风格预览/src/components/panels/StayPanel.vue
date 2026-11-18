<script setup>
import { useTripStore } from '../../stores/trip.js';
import { DEMO } from '../../data/demo.js';
import { toMinor, formatYuan } from '../../domain/money.js';

const trip = useTripStore();
const money = (value) => formatYuan(toMinor(value));
function openMapForStay() { if (!trip.mapOpen) trip.toggleMap(); }
</script>

<template>
  <div class="surface">
    <div class="map-stay-card">
      <div><strong>地图选择住宿位置</strong><p class="subtle">可在地图中搜索酒店或地址，再从地点详情选择“设为住宿位置”。这只记录位置，不代表已经订房。</p>
        <p v-if="trip.mapStay" class="map-stay-current">已选：{{ trip.mapStay.name }} · {{ trip.mapStay.address || '地址暂无' }}</p>
      </div>
      <div class="map-stay-actions"><button type="button" class="button outline small" @click="openMapForStay">{{ trip.mapOpen ? '地图已展开' : '打开地图选位置' }}</button><button v-if="trip.mapStay" type="button" class="text-button" @click="trip.clearMapStay()">清除位置</button></div>
    </div>
    <p class="subtle">以下为杭州住宿位置和价格示例，不是真实可预订酒店。</p>
    <article v-for="option in DEMO.hotels" :key="option.id" class="option-card" :class="{ selected: trip.hotel === option.id }">
      <div class="option-top">
        <div>
          <h3>{{ option.name }}</h3>
          <span class="subtle">{{ option.area }}</span>
        </div>
        <span class="money">{{ money(option.price) }}<small> / 间夜 · 示例</small></span>
      </div>
      <p>{{ option.detail }}</p>
      <div class="option-bottom">
        <span class="mini-tag">{{ option.tag }}</span>
        <button type="button" class="button small" :class="trip.hotel === option.id ? 'outline' : 'primary'" :disabled="!/杭州/.test(trip.destination)" @click="trip.selectHotel(option.id)">
          {{ trip.hotel === option.id ? '已选 · 可换其他' : '选择这个位置' }}
        </button>
      </div>
    </article>
  </div>
</template>
