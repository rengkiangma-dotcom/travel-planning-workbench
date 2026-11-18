<script setup>
import { ref, watch } from 'vue';
import { readTripBackup, removeTripBackup } from '../api/backup.js';
import { useSavedTrips } from '../ui/savedTrips.js';
import { confirmDo, toast } from '../ui/feedback.js';

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['update:open']);

const { items, folder, loading, error, refresh, restore } = useSavedTrips();
const dialog = ref(null);

watch(() => props.open, async (value) => {
  if (!dialog.value) return;
  if (value) {
    if (!dialog.value.open) dialog.value.showModal();
    await refresh();
  } else if (dialog.value.open) {
    dialog.value.close();
  }
});

function when(at) {
  return new Date(at).toLocaleString('zh-CN', { hour12: false });
}

async function pick(item) {
  if (await restore(item)) emit('update:open', false);
}

async function download(item) {
  try {
    const data = await readTripBackup(item.file);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `行间-${item.summary?.destination || '旅行'}-${item.file}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    toast('下载失败：' + err.message);
  }
}

async function remove(item) {
  const ok = await confirmDo('删除这份保存？', `${item.summary?.title || '未命名的旅行'} 的本地快照会被删除，无法恢复。`);
  if (!ok) return;
  try {
    await removeTripBackup(item.file);
    await refresh();
    toast('已删除这份保存');
  } catch (err) {
    toast('删除失败：' + err.message);
  }
}
</script>

<template>
  <dialog id="saved-trips-dialog" ref="dialog" @close="emit('update:open', false)" @cancel.prevent="emit('update:open', false)">
    <h2>已保存的旅行</h2>
    <p class="subtle">每次点“重新开始”都会先把当前行程保存到本机，保留最近 40 份。</p>
    <p v-if="error" class="live-error" role="alert">{{ error }}</p>
    <p v-if="loading" class="subtle">正在读取…</p>
    <p v-else-if="!items.length" class="subtle">还没有保存过旅行。点“重新开始”时，当前行程会自动存到这里。</p>

    <div v-else class="saved-trip-list">
      <article v-for="item in items" :key="item.file" class="option-card">
        <div class="option-top">
          <div>
            <h3>{{ item.summary?.title || '未命名的旅行' }}</h3>
            <span class="subtle">
              {{ item.summary?.origin || '—' }} → {{ item.summary?.destination || '—' }}
              · {{ item.summary?.days || 0 }} 天 · {{ item.summary?.people || 0 }} 人
              · {{ item.summary?.places || 0 }} 个地点
            </span>
          </div>
          <span class="mini-tag">{{ when(item.at) }}</span>
        </div>
        <div class="option-bottom">
          <span class="subtle">出发 {{ item.summary?.start || '待定' }}</span>
          <div class="saved-trip-actions">
            <button type="button" class="text-button" @click="remove(item)">删除</button>
            <button type="button" class="text-button" @click="download(item)">下载</button>
            <button type="button" class="button primary small" @click="pick(item)">恢复这次旅行</button>
          </div>
        </div>
      </article>
    </div>

    <p v-if="folder" class="subtle saved-trip-folder">备份位置：{{ folder }}</p>
    <div class="dialog-actions">
      <button type="button" class="button outline" @click="emit('update:open', false)">关闭</button>
    </div>
  </dialog>
</template>
