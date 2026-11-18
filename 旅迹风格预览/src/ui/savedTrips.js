import { ref } from 'vue';
import { listTripBackups, readTripBackup } from '../api/backup.js';
import { useTripStore } from '../stores/trip.js';
import { confirmDo, toast } from './feedback.js';

const items = ref([]);
const folder = ref('');
const loading = ref(false);
const error = ref('');

export function useSavedTrips() {
  const trip = useTripStore();

  async function refresh() {
    loading.value = true;
    error.value = '';
    try {
      const data = await listTripBackups();
      items.value = data.items || [];
      folder.value = data.dir || '';
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  }

  async function restore(item) {
    const ok = await confirmDo('恢复这次旅行？', '当前工作台会被这份保存的行程替换；当前未保存的修改会丢失。');
    if (!ok) return false;
    try {
      const data = await readTripBackup(item.file);
      if (!data.tripId) data.tripId = `legacy:${item.file}`;
      if (!trip.restoreTrip(data)) {
        toast('这份保存不完整，无法恢复');
        return false;
      }
      toast('已恢复保存的旅行');
      return true;
    } catch (err) {
      toast('恢复失败：' + err.message);
      return false;
    }
  }

  return { items, folder, loading, error, refresh, restore };
}
