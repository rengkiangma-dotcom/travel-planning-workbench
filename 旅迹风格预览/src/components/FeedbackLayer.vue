<script setup>
import { ref, watch } from 'vue';
import { ui, resolveConfirm } from '../ui/feedback.js';

const dialog = ref(null);

watch(() => ui.confirm, (value) => {
  if (!dialog.value) return;
  if (value && !dialog.value.open) dialog.value.showModal();
  if (!value && dialog.value.open) dialog.value.close();
});
</script>

<template>
  <div id="toast" :class="{ show: ui.toast }" role="status">{{ ui.toast }}</div>
  <dialog id="confirm-dialog" ref="dialog" @cancel.prevent="resolveConfirm(false)">
    <h2>{{ ui.confirm?.title }}</h2>
    <p>{{ ui.confirm?.text }}</p>
    <div class="dialog-actions">
      <button type="button" class="button outline" @click="resolveConfirm(false)">取消</button>
      <button type="button" class="button primary" @click="resolveConfirm(true)">确认</button>
    </div>
  </dialog>
</template>
