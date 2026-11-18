process.env.TEMP = 'E:/旅游规划工作台制作/验证工具/tmp';
process.env.TMP = process.env.TEMP;
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://127.0.0.1:18647/next/';
const KEY = 'xingjian-lvji-preview-v1';

const seed = {
  version: 1, started: true, entryMode: 'existing', section: 'overview', mapOpen: true, day: 0,
  origin: '上海', destination: '杭州', start: '2026-11-14', days: 3, people: 2, rooms: 1,
  budget: 3000, flexible: true, original: '去程交通：G123 上海虹桥 → 杭州东',
  notes: '学生穷游，住宿靠近地铁', transport: null, hotel: null, mapStay: null,
  outStatus: '待定', backStatus: '待定',
  plans: [['broken', 'bai', 'quyuan'], ['lingyin'], []],
  customPlaces: {}, savedPlaces: [], dailyRoutes: {}, messages: [], undo: [],
  existingDetails: { outbound: 'G123 上海虹桥 → 杭州东', returnTrip: '', hotel: '', schedule: '' },
};

const queriedAt = Date.parse('2026-11-13T08:00:00Z');
const train = {
  id: 't1', train: 'G1', from: '上海虹桥', to: '杭州东', date: '2026-11-14',
  departure: '08:00', arrival: '09:00', duration: '1 小时',
  seats: [{ name: '二等座', available: true, price: 73, remaining: '有' }],
};
const railBody = {
  source: '测试数据', queriedAt, currency: 'CNY',
  query: { origin: '上海', destination: '杭州', days: 3, dates: ['2026-11-14'], flags: '' },
  fromStations: [{ name: '上海虹桥' }], toStations: [{ name: '杭州东' }],
  results: [{
    date: '2026-11-14', returnDate: '2026-11-16',
    outbound: { trains: [train], error: null },
    inbound: { trains: [{ ...train, id: 't2', train: 'G2', departure: '18:00', arrival: '19:00' }], error: null },
  }],
};
const hotelBody = {
  source: '测试数据', queriedAt,
  query: { date: '2026-11-14', checkOut: '2026-11-16', nights: 2, rooms: 1, adults: 2 },
  hotels: [{ id: 'h1', name: '湖滨测试酒店', address: '测试路 1 号', price: 268, currency: 'CNY', priceMeaning: '首夜参考起价，不含税' }],
};
const detailBody = {
  source: '测试数据', queriedAt, name: '湖滨测试酒店', checkIn: '2026-11-14', checkOut: '2026-11-16',
  query: { checkOut: '2026-11-16', rooms: 1, adults: 2 },
  rates: [{ name: '大床房', plan: '含早', averagePrice: 288, currency: 'CNY', meal: '双早', cancelPolicy: '入住前 1 天可取消', onRequest: false }],
  note: '测试报价',
};
const placeBody = {
  source: '测试数据', queriedAt,
  pois: [{
    id: 'B001', name: '灵隐寺游客中心', city: '杭州', district: '西湖区', address: '灵隐路 1 号',
    referenceConsumption: 75, rating: '4.7', gcj02: '120.101,30.240', wgs84: '120.096,30.242',
  }],
};

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([key, value]) => {
    try { localStorage.setItem(key, value); } catch { /* 忽略 */ }
  }, [KEY, JSON.stringify(seed)]);
  await page.route('**/api/rail/search', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(railBody) }));
  await page.route('**/api/hotels/search', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hotelBody) }));
  await page.route('**/api/hotels/detail', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detailBody) }));
  await page.route('**/api/places/search', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(placeBody) }));

  const stored = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);

  try {
    await page.goto(BASE);
    await page.waitForFunction(() => document.querySelector('#trip-title'));

    await page.locator('.nav-item[data-section="traffic"]').click();
    await page.getByRole('button', { name: '查询真实往返' }).click();
    await page.locator('.real-train').first().waitFor();
    await page.getByRole('button', { name: '选择去程' }).first().click();
    await page.locator('#confirm-dialog').getByRole('button', { name: '确认' }).click();
    await page.waitForFunction(() => document.querySelector('.leg-card')?.textContent.includes('G1'));
    assert.match(await page.locator('.compact-summary').innerText(), /896/, '73 元单程 × 2 人 + 灵隐寺 150 + 600 餐饮预留');

    await page.locator('.nav-item[data-section="stay"]').click();
    await page.getByRole('button', { name: '查询酒店报价' }).click();
    await page.getByText('湖滨测试酒店').first().waitFor();
    await page.getByRole('button', { name: '查房型报价' }).click();
    await page.getByText('大床房').waitFor();

    await page.locator('.nav-item[data-section="places"]').click();
    await page.getByRole('button', { name: '查询高德地点' }).click();
    await page.getByText('灵隐寺游客中心').first().waitFor();
    await page.getByRole('button', { name: '加入待规划' }).click();
    await page.locator('.saved-places').waitFor();
    await page.getByRole('button', { name: '加入行程', exact: true }).click();
    assert.ok((await stored()).plans.flat().includes('poi:B001'), '真实地点应能加入某一天');

    await page.locator('.nav-item[data-section="days"]').click();
    assert.equal(await page.locator('.timeline .event').count(), 4, '三个示例地点加刚收藏的真实地点');
    const before = await page.locator('.event h3').first().innerText();
    await page.locator('.event').first().getByRole('button', { name: '↓ 下移' }).click();
    const after = await page.locator('.event h3').first().innerText();
    assert.notEqual(after, before, '下移后第一项应变化');
    await page.getByRole('button', { name: '↶ 撤销' }).click();
    assert.equal(await page.locator('.event h3').first().innerText(), before, '撤销应恢复顺序');

    await page.locator('.nav-item[data-section="original"]').click();
    await page.locator('#requirements-form textarea').fill('新的备注：返程已买票');
    await page.getByRole('button', { name: '保存修改' }).click();
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).notes === '新的备注：返程已买票', KEY);
    assert.match(await page.locator('#panel').innerText(), /已有行程原文/, '原文应保留');

    await page.screenshot({ path: 'E:/旅游规划工作台制作/旅迹风格预览/验收/next-panels.png', fullPage: true });

    await page.getByRole('button', { name: '接口设置' }).click();
    await page.locator('#provider-dialog[open]').waitFor();
    assert.match(await page.locator('#provider-dialog').innerText(), /12306/);
    await page.locator('#provider-close').click();

    const beforeBackups = await page.evaluate(async () => (
      (await (await fetch('/api/backup/list')).json()).items || []
    ).map((item) => item.file));

    await page.getByRole('button', { name: '重新开始' }).click();
    await page.locator('#confirm-dialog').getByRole('button', { name: '确认' }).click();
    await page.getByRole('button', { name: '还没有行程 从目的地与交通开始' }).waitFor();

    await page.locator('.journal-item').first().waitFor();
    assert.match(await page.locator('.entry-journal').innerText(), /杭州/);

    await page.getByRole('button', { name: '已保存的旅行' }).click();
    await page.locator('#saved-trips-dialog[open]').waitFor();
    await page.getByText('杭州之旅').first().waitFor();
    await page.getByRole('button', { name: '恢复这次旅行' }).first().click();
    await page.locator('#confirm-dialog').getByRole('button', { name: '确认' }).click();
    await page.waitForFunction(() => document.querySelector('#trip-title'));
    assert.match(await page.locator('#trip-title').innerText(), /杭州/);

    const created = await page.evaluate(async (known) => (
      (await (await fetch('/api/backup/list')).json()).items || []
    ).find((item) => !known.includes(item.file))?.file || null, beforeBackups);
    if (created) {
      await page.evaluate(async (file) => {
        await fetch('/api/backup/file?name=' + encodeURIComponent(file), { method: 'DELETE' });
      }, created);
    }

    assert.deepEqual(errors, []);
    console.log('PASS 新架构数据面板：12306 选座、酒店报价、地点收藏入行程、日程排序撤销、需求保存、接口设置、重新开始自动保存与恢复');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
