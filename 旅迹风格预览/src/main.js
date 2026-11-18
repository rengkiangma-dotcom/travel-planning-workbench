import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './styles/index.css';
import { useTripStore } from './stores/trip.js';

const app = createApp(App);
app.use(createPinia());
app.mount('#app');

const trip = useTripStore();
trip.$subscribe(() => { trip.persist(); }, { detached: true, flush: 'post' });
