<script setup>
import { computed, reactive } from 'vue';
import { useTripStore } from '../../stores/trip.js';
import { confirmDo, toast } from '../../ui/feedback.js';

const trip = useTripStore();
const details = computed(() => trip.existingDetails || null);
const rows = computed(() => {
  const d = details.value;
  if (!d) return [];
  return [
    ['去程交通', d.outbound],
    ['返程交通', d.returnTrip],
    ['住宿', d.hotel],
    ['景点或预约', d.schedule],
  ].filter(([, v]) => String(v || '').trim());
});

const form = reactive({
  origin: trip.origin,
  destination: trip.destination,
  start: trip.start,
  people: trip.people,
  budget: trip.budget,
  notes: trip.notes,
});

async function save() {
  if (!String(form.origin).trim() || !String(form.destination).trim()) {
    toast('请填写出发地和目的地');
    return;
  }
  const originChanged = String(form.origin).trim() !== trip.origin;
  const destinationChanged = String(form.destination).trim() !== trip.destination;
  const dateChanged = String(form.start) !== trip.start;
  if (originChanged || destinationChanged) {
    const ok = await confirmDo('更改出发地或目的地？', '更换目的地会移除示例交通、示例酒店和示例地点；已添加的真实地点与原始安排会保留，请核对新目的地和车票。');
    if (!ok) return;
  } else if (dateChanged && (trip.outStatus === '已购票' || trip.backStatus === '已购票')) {
    const ok = await confirmDo('修改已购票行程的日期？', '页面修改不会改签，请核对实际车票、酒店与预约。原文保留。');
    if (!ok) return;
  }
  trip.applyRequirements({ ...form });
  toast('需求已保存，已有行程原文保留。');
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(trip.$state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '行间-本地规划.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('已导出本地备份');
}
</script>

<template>
  <div class="surface">
    <p class="eyebrow">你的确定，始终保留</p>
    <h2>需求与已有安排</h2>
    <p class="subtle">已填信息直接沿用。示例功能不会改写下方原始行程。</p>

    <div v-if="rows.length" class="budget-details">
      <div v-for="[label, value] in rows" :key="label"><span>{{ label }}</span><span>{{ value }}</span></div>
    </div>
    <template v-if="trip.original">
      <div class="original-header"><strong>已有行程原文</strong><span class="protected">只读保留</span></div>
      <pre class="original-text">{{ trip.original }}</pre>
    </template>
    <div v-else class="note">你从零开始规划，尚未填写已有行程原文。</div>

    <form id="requirements-form" style="margin-top:20px" @submit.prevent="save">
      <div class="form-grid">
        <label class="field">出发地<input v-model="form.origin" maxlength="60" required></label>
        <label class="field">目的地<input v-model="form.destination" maxlength="60" required></label>
        <label class="field">出发日期<input v-model="form.start" type="date" min="2026-11-09" max="2030-12-31" required></label>
        <label class="field">同行人数<input v-model.number="form.people" type="number" min="1" max="20" required></label>
        <label class="field">整趟预算（元）<input v-model.number="form.budget" type="number" min="100" max="1000000" required></label>
        <label class="field">天数<span>{{ trip.days }} 天（演示创建后固定）</span></label>
        <label class="field full">补充安排 / 班次 / 需求
          <textarea v-model="form.notes" maxlength="12000" placeholder="例如：返程已买票、第二天上午预约、不能改的酒店…"></textarea>
        </label>
      </div>
      <div class="form-actions">
        <button type="button" class="text-button" @click="exportBackup">导出本地规划备份 ↓</button>
        <button class="button primary">保存修改</button>
      </div>
    </form>
    <p class="subtle">原文在迁移中只读保留，不会因为切换板块被改写。</p>
  </div>
</template>
