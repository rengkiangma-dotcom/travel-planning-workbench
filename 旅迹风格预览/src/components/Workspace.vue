<script setup>
import { computed, ref } from 'vue';
import { useTripStore } from '../stores/trip.js';
import { SECTIONS } from '../domain/state.js';
import { confirmDo, toast } from '../ui/feedback.js';
import { saveTripBackup } from '../api/backup.js';
import BudgetSummary from './BudgetSummary.vue';
import ProviderDialog from './ProviderDialog.vue';
import SavedTripsDialog from './SavedTripsDialog.vue';
import TravelMap from './TravelMap.vue';
import OverviewPanel from './panels/OverviewPanel.vue';
import TrafficPanel from './panels/TrafficPanel.vue';
import StayPanel from './panels/StayPanel.vue';
import PlacesPanel from './panels/PlacesPanel.vue';
import DaysPanel from './panels/DaysPanel.vue';
import OriginalPanel from './panels/OriginalPanel.vue';

const trip = useTripStore();
const settingsOpen = ref(false);
const savedOpen = ref(false);
const workspace = ref(null);
const leftWidth = ref(null);
const resizing = ref(false);
const PANELS = {
  overview: OverviewPanel,
  traffic: TrafficPanel,
  stay: StayPanel,
  places: PlacesPanel,
  days: DaysPanel,
  original: OriginalPanel,
};
const panel = computed(() => trip.section === 'original' ? OverviewPanel : (PANELS[trip.section] || OverviewPanel));
const title = computed(() => trip.tripName || `${trip.destination}之旅`);

function setLeftWidth(value) {
  const width = workspace.value?.clientWidth || 0;
  leftWidth.value = Math.max(340, Math.min(value, width - 288));
}

function startResize(event) {
  if (event.button !== 0) return;
  resizing.value = true;
  event.currentTarget.setPointerCapture(event.pointerId);
  setLeftWidth(event.clientX - workspace.value.getBoundingClientRect().left);
}

function moveResize(event) {
  if (resizing.value) setLeftWidth(event.clientX - workspace.value.getBoundingClientRect().left);
}

function endResize() {
  resizing.value = false;
}

function resizeKey(event) {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const current = leftWidth.value ?? workspace.value.querySelector('.planning').getBoundingClientRect().width;
  setLeftWidth(current + (event.key === 'ArrowLeft' ? -20 : 20));
}

async function resetAll() {
  const ok = await confirmDo('重新开始这份旅行？', '当前行程会先自动保存到本机，然后清空工作台。之后可以从“已保存的旅行”恢复。');
  if (!ok) return;
  try {
    if (!trip.tripId) trip.tripId = globalThis.crypto.randomUUID();
    await saveTripBackup(trip.$state);
  } catch (error) {
    toast('自动保存失败，未重新开始：' + error.message);
    return;
  }
  trip.reset();
  toast('本次行程已保存，可从“已保存的旅行”恢复');
}
</script>

<template>
  <div class="shell">
    <main id="main">
      <div id="desk">
        <div ref="workspace" class="workspace" id="workspace" :class="{ 'with-map': trip.mapOpen, resizing }" :style="leftWidth === null ? {} : { '--planning-width': `${leftWidth}px` }">
          <div class="planning">
            <header class="topbar workspace-topbar">
              <div class="breadcrumb">我的旅行 <span>/</span> <strong>规划工作台</strong></div>
              <div class="top-actions">
                <span class="demo-badge">新架构 · 试运行</span>
                <button class="text-button" id="saved-trips" @click="savedOpen = true">已保存的旅行</button>
                <button class="text-button" id="provider-settings" @click="settingsOpen = true">接口设置</button>
                <button class="text-button" id="reset" @click="resetAll">重新开始</button>
                <button class="button outline" id="map-toggle" :aria-expanded="String(trip.mapOpen)" @click="trip.toggleMap()">{{ trip.mapOpen ? '收起地图 ↙' : '展开地图 ↗' }}</button>
              </div>
            </header>
            <div class="page-heading">
              <div>
                <p class="eyebrow">TRAVEL STUDIO / 旅行工作台</p>
                <h1 id="trip-title">{{ title }}</h1>
                <p id="trip-meta">{{ trip.origin }}出发 · {{ trip.days }}天 / {{ trip.people }}人</p>
              </div>
            </div>

            <nav id="navigation" aria-label="规划模块">
              <button
                v-for="s in SECTIONS.filter((section) => section.id !== 'original')"
                :key="s.id"
                class="nav-item"
                :class="{ active: trip.section === s.id || (trip.section === 'original' && s.id === 'overview') }"
                :data-section="s.id"
                @click="trip.setSection(s.id)"
              >
                <span>{{ s.icon }}</span>{{ s.label }}
              </button>
            </nav>

            <section id="panel">
              <BudgetSummary v-if="trip.section === 'overview' || trip.section === 'original'" />
              <component :is="panel" />
            </section>
          </div>

          <div v-if="trip.mapOpen" class="workspace-splitter" role="separator" aria-label="调整规划区和地图宽度" aria-orientation="vertical" tabindex="0" @pointerdown.prevent="startResize" @pointermove="moveResize" @pointerup="endResize" @pointercancel="endResize" @lostpointercapture="endResize" @keydown="resizeKey"><span></span></div>
          <div class="studio-dock" v-show="trip.mapOpen">
            <TravelMap :visible="trip.mapOpen" />
          </div>
        </div>
      </div>
    </main>
  </div>

  <ProviderDialog v-model:open="settingsOpen" />
  <SavedTripsDialog v-model:open="savedOpen" />
</template>
