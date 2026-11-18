<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useTripStore } from '../stores/trip.js';
import SavedTripsDialog from './SavedTripsDialog.vue';
import ThemeSelect from './ThemeSelect.vue';
import { useSavedTrips } from '../ui/savedTrips.js';

const trip = useTripStore();
const mode = ref(null);
const entryTab = ref('new');
const error = ref('');
const savedOpen = ref(false);
const {
  items: savedItems, loading: savedLoading, refresh: refreshSaved, restore: restoreSaved,
} = useSavedTrips();

onMounted(refreshSaved);

function journalDate(item) {
  const start = item.summary?.start;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(start || '') ? new Date(start + 'T12:00:00') : new Date(item.at);
  if (Number.isNaN(+date)) return '日期待定';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
const form = reactive({
  origin: '上海', destination: '杭州', start: '2026-11-14', days: 3, people: 2, budget: 3000,
  title: '', notes: '', outbound: '', returnTrip: '', hotel: '', schedule: '',
});

function submit() {
  error.value = '';
  if (!form.origin.trim() || !form.destination.trim()) { error.value = '请填写出发地和目的地'; return; }
  if (mode.value === 'existing' && ![form.outbound, form.returnTrip, form.hotel, form.schedule].some((v) => String(v).trim())) {
    error.value = '请至少填写一项已确定的安排';
    return;
  }
  trip.createTrip({
    mode: mode.value,
    origin: form.origin, destination: form.destination, start: form.start,
    days: form.days, people: form.people, budget: form.budget,
    title: form.title, notes: form.notes,
    existing: { outbound: form.outbound, returnTrip: form.returnTrip, hotel: form.hotel, schedule: form.schedule },
  });
}
</script>

<template>
  <section class="lvji-create">
    <div class="lvji-copy">
      <span class="kicker">NEW JOURNEY / 新建旅行</span>
      <h1>让出发的想法，<br><em>变成一段旅程。</em></h1>
      <p>先确定目的地，再安排交通、住宿与每天的行程。</p>
    </div>

    <div class="lvji-create-card">
      <div class="create-card-head">
        <div class="entry-tabs" role="group" aria-label="旅行入口">
          <button type="button" :class="{ active: entryTab === 'new' }" :aria-pressed="entryTab === 'new'" @click="entryTab = 'new'">新建旅行</button>
          <button type="button" :class="{ active: entryTab === 'saved' }" :aria-pressed="entryTab === 'saved'" @click="entryTab = 'saved'; refreshSaved()">已保存的旅行</button>
        </div>
        <div class="create-head-actions">
          <span class="demo-badge">新架构 · 试运行</span>
        </div>
      </div>
      <h2 v-if="entryTab === 'new'">你已经有行程了吗？</h2>

      <div v-if="entryTab === 'new'" class="journey-mode" role="group" aria-label="已有行程情况">
        <button type="button" :class="{ active: mode === 'new' }" data-mode="new" @click="mode = 'new'">
          <strong>还没有行程</strong><small>从目的地与交通开始</small>
        </button>
        <button type="button" :class="{ active: mode === 'existing' }" data-mode="existing" @click="mode = 'existing'">
          <strong>已经有安排</strong><small>填写已确定的安排</small>
        </button>
      </div>

      <div v-if="entryTab === 'saved'" class="entry-journal">
        <div class="journal-head">
          <span class="kicker">TRAVEL NOTES / 旅记</span>
          <button v-if="savedItems.length" type="button" class="text-button" @click="savedOpen = true">管理旅行 →</button>
        </div>

        <p v-if="savedLoading" class="subtle">正在读取已保存的旅行…</p>
        <div v-else-if="!savedItems.length" class="choose-start">
          <p>还没有保存的旅行。重新开始时，当前行程会自动保存。</p>
        </div>
        <ul v-else class="journal-list">
          <li v-for="item in savedItems" :key="item.file">
            <button type="button" class="journal-item" @click="restoreSaved(item)">
              <span class="journal-date">{{ journalDate(item) }}</span>
              <span class="journal-body">
                <strong>{{ item.summary?.title || '未命名的旅行' }}</strong>
                <small>
                  {{ item.summary?.origin || '—' }} → {{ item.summary?.destination || '—' }}
                  · {{ item.summary?.days || 0 }} 天 · {{ item.summary?.places || 0 }} 个地点
                </small>
              </span>
              <span class="journal-go">继续 →</span>
            </button>
          </li>
        </ul>
      </div>

      <form v-if="entryTab === 'new' && mode" id="setup-form" @submit.prevent="submit">
        <div v-if="mode === 'existing'" class="existing-group full">
          <strong>已确定的安排</strong>
          <p>填你已经确定的内容，暂时没有的可以留空。</p>
          <label class="field">去程交通<input v-model="form.outbound" maxlength="500" placeholder="例如：高铁 G123，上海虹桥 → 杭州东"></label>
          <label class="field">返程交通<input v-model="form.returnTrip" maxlength="500" placeholder="例如：高铁 G456，杭州东 → 上海虹桥"></label>
          <label class="field">住宿地点<input v-model="form.hotel" maxlength="500" placeholder="输入或粘贴酒店名称、准确地址"></label>
          <label class="field">已确定的景点或预约<textarea v-model="form.schedule" maxlength="8000" placeholder="例如：第 2 天上午 10:00 预约灵隐寺"></textarea></label>
        </div>

        <div class="form-grid">
          <label class="field">出发地<input v-model="form.origin" name="origin" maxlength="60" required></label>
          <label class="field">目的地<input v-model="form.destination" name="destination" maxlength="60" required></label>
          <label class="field full">行程名称 <span class="optional">可选</span><input v-model="form.title" name="title" maxlength="80" placeholder="例如：沿湖慢慢走"></label>
        </div>

        <div class="form-grid">
          <label class="field">出发日期<input v-model="form.start" name="start" type="date" max="2030-12-31"></label>
          <label class="field">想玩几天
            <ThemeSelect v-model="form.days" :options="Array.from({ length: 7 }, (_, index) => ({ value: index + 1, label: `${index + 1} 天` }))" aria-label="想玩几天" />
          </label>
          <label class="field">整趟预算 <span class="optional">所有人 / 元</span>
            <input v-model.number="form.budget" name="budget" type="number" min="0" max="1000000">
          </label>
          <label class="field">出行人数
            <input v-model.number="form.people" name="people" type="number" min="1" max="20">
          </label>
        </div>

        <label class="field notes-label">偏好与备注
          <textarea v-model="form.notes" maxlength="3000" placeholder="比如：学生穷游、住宿靠近地铁、喜欢博物馆、不想太赶……"></textarea>
        </label>

        <p v-if="error" class="live-error">{{ error }}</p>
        <button class="create-submit" type="submit">
          {{ mode === 'existing' ? '保留安排，创建旅行工作台' : '创建旅行工作台' }} <span>→</span>
        </button>
      </form>

    </div>
  </section>
  <SavedTripsDialog v-model:open="savedOpen" />
</template>
