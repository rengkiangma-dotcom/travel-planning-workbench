<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

defineOptions({ inheritAttrs: false });
const props = defineProps({ modelValue: { default: '' }, options: { type: Array, required: true }, disabled: Boolean });
const emit = defineEmits(['update:modelValue', 'change']);
const root = ref(null);
const selected = computed(() => props.options.find((option) => String(option.value) === String(props.modelValue)) || props.options[0]);

function closeOutside(event) {
  if (root.value && !root.value.contains(event.target)) root.value.open = false;
}

onMounted(() => document.addEventListener('pointerdown', closeOutside));
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOutside));

function choose(option) {
  emit('update:modelValue', option.value);
  emit('change', option.value);
  root.value.open = false;
  root.value.querySelector('summary')?.focus();
}
</script>

<template>
  <details ref="root" class="theme-select" @keydown.esc.stop="root.open = false; root.querySelector('summary')?.focus()">
    <summary v-bind="$attrs" :aria-disabled="disabled || undefined" @click="disabled && $event.preventDefault()">{{ selected?.label }}<span aria-hidden="true">⌄</span></summary>
    <div class="theme-select-menu">
      <button v-for="option in options" :key="option.value" type="button" :class="{ selected: String(option.value) === String(modelValue) }" @click="choose(option)">{{ option.label }}</button>
    </div>
  </details>
</template>
