import { postJson } from './client.js';

export function saveTripBackup(state) {
  return postJson('/api/backup/save', { state }, { timeout: 20000 });
}

export async function listTripBackups() {
  const response = await fetch('/api/backup/list');
  if (!response.ok) throw new Error('读取已保存的旅行失败');
  return response.json();
}

export async function readTripBackup(file) {
  const response = await fetch('/api/backup/file?name=' + encodeURIComponent(file));
  if (!response.ok) {
    let message = '读取备份失败';
    try { message = (await response.json()).error || message; } catch { /* 保持默认 */ }
    throw new Error(message);
  }
  return response.json();
}

export async function removeTripBackup(file) {
  const response = await fetch('/api/backup/file?name=' + encodeURIComponent(file), { method: 'DELETE' });
  if (!response.ok) {
    let message = '删除备份失败';
    try { message = (await response.json()).error || message; } catch { /* 保持默认 */ }
    throw new Error(message);
  }
  return response.json();
}
