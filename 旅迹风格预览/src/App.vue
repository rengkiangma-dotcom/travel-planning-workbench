<script setup>
import { computed, watchEffect } from 'vue';
import EntryScreen from './components/EntryScreen.vue';
import Workspace from './components/Workspace.vue';
import FeedbackLayer from './components/FeedbackLayer.vue';
import { useTripStore } from './stores/trip.js';

const trip = useTripStore();
const started = computed(() => trip.started);

watchEffect(() => {
  document.body.classList.toggle('entry-mode', !trip.started);
  document.body.classList.toggle('studio-mode', trip.started);
});
</script>

<template>
  <EntryScreen v-if="!started" />
  <Workspace v-else />
  <FeedbackLayer />
</template>
