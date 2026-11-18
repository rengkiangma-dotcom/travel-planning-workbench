/* 只和本地 18647 服务通信；失败时把可读原因抛给界面。 */

const DEFAULT_TIMEOUT = 30000;

export async function postJson(path, body, { timeout = DEFAULT_TIMEOUT } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('本地后端未启动或版本过旧，请重新启动预览服务。');
    }
    if (!response.ok) throw new Error(data?.error || `查询失败（${response.status}）`);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('查询超时，请稍后重试。');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const railSearch = (input) => postJson('/api/rail/search', input, { timeout: 45000 });
export const railInterline = (input) => postJson('/api/rail/interline', input, { timeout: 45000 });
export const placeSearch = (input) => postJson('/api/places/search', input);
export const hotelSearch = (input) => postJson('/api/hotels/search', input);
export const hotelDetail = (input) => postJson('/api/hotels/detail', input);

export async function providerStatus() {
  const response = await fetch('/api/providers/status');
  if (!response.ok) throw new Error('读取接口状态失败');
  return response.json();
}

export const saveProviderConfig = (input) => postJson('/api/providers/config', input);
