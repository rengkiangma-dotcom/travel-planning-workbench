<script setup>
import { onMounted, reactive, ref, watch } from 'vue';
import { providerStatus, saveProviderConfig } from '../api/client.js';
import { toast } from '../ui/feedback.js';

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(['update:open']);

const dialog = ref(null);
const status = ref(null);
const error = ref('');
const saving = ref(false);
const form = reactive({ amapKey: '', rollinggoKey: '', clearAmap: false });

watch(() => props.open, (value) => {
  if (!dialog.value) return;
  if (value && !dialog.value.open) dialog.value.showModal();
  if (!value && dialog.value.open) dialog.value.close();
});

async function refresh() {
  try {
    status.value = await providerStatus();
  } catch (err) {
    error.value = err.message;
  }
}

onMounted(refresh);

async function save() {
  if (saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    status.value = await saveProviderConfig({
      amapKey: form.amapKey.trim(),
      rollinggoKey: form.rollinggoKey.trim(),
      clearAmap: form.clearAmap,
    });
    form.amapKey = '';
    form.rollinggoKey = '';
    form.clearAmap = false;
    toast('接口配置已保存');
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <dialog id="provider-dialog" ref="dialog" @close="emit('update:open', false)" @cancel.prevent="emit('update:open', false)">
    <h2>本地接口设置</h2>
    <div id="provider-status">
      <p v-for="item in [
        ['amap', '高德 Web 服务'],
        ['hotel', 'RollingGo 酒店报价'],
        ['rail', '12306（本地 MCP）'],
      ]" :key="item[0]" class="provider-row">
        <strong>{{ status?.providers?.[item[0]]?.name || item[1] }}</strong>
        <span :class="status?.providers?.[item[0]]?.configured ? 'ok' : 'muted'">
          {{ status?.providers?.[item[0]]?.configured ? '已配置' : '未配置' }}
        </span>
        <small v-if="status?.providers?.[item[0]]?.reason">{{ status.providers[item[0]].reason }}</small>
      </p>
      <p class="subtle">高德网页地图 Key 只在旧版地图里使用；这一版只需要 Web 服务 Key（地点搜索）和 RollingGo Key（酒店报价）。</p>
    </div>
    <form id="provider-form" @submit.prevent="save">
      <label class="field">高德 Web 服务 Key
        <input v-model="form.amapKey" type="password" autocomplete="new-password" maxlength="128" placeholder="留空则保留已有配置">
      </label>
      <label class="field" style="margin-top:15px">RollingGo 酒店 Key（可选）
        <input v-model="form.rollinggoKey" type="password" autocomplete="new-password" maxlength="256" placeholder="与高德 Key 不同，留空保留已有配置">
        <small style="font-size:10px;margin-top:8px">没有 Key 可在 RollingGo 官网申请；这里只调用搜索和房型查询。</small>
      </label>
      <label class="check-label" style="margin-top:12px">
        <input v-model="form.clearAmap" type="checkbox"> 清除已保存的高德 Web 服务 Key
      </label>
      <p v-if="error" class="live-error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button type="button" class="button outline" id="provider-close" @click="emit('update:open', false)">关闭</button>
        <button class="button primary" :disabled="saving">{{ saving ? '保存中…' : '保存配置' }}</button>
      </div>
    </form>
  </dialog>
</template>
