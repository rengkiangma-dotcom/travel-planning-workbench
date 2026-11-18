process.env.TEMP = 'E:/旅游规划工作台制作/验证工具/tmp';
process.env.TMP = process.env.TEMP;
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://127.0.0.1:18647/next/';
const KEY = 'xingjian-lvji-preview-v1';

const seed = {
  version: 1, started: true, entryMode: 'existing', section: 'traffic', mapOpen: true, day: 0,
  origin: '上海', destination: '杭州', start: '2026-11-14', days: 3, people: 2, rooms: 1,
  budget: 3000, flexible: false, original: '', notes: '', transport: null, hotel: null, mapStay: null,
  outStatus: '待定', backStatus: '待定', liveTickets: null,
  plans: [[], [], []], customPlaces: {}, savedPlaces: [], dailyRoutes: {}, messages: [], undo: [],
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
const planLeg = (trainNo, from, to, departure, arrival, price) => ({
  train: trainNo, from, to, date: '2026-11-16', departure, arrival,
  seats: [{ name: '二等座', available: true, price, remaining: '有' }],
});
const interBody = {
  source: '测试数据（中转）', queriedAt, currency: 'CNY',
  results: [{
    date: '2026-11-16',
    plans: [{
      middle: { name: '嘉兴南', code: 'JXH' },
      legs: [
        planLeg('G10', '杭州东', '嘉兴南', '16:00', '16:40', 30),
        planLeg('G11', '嘉兴南', '上海虹桥', '17:10', '17:50', 28),
      ],
      sameStation: true, waitTime: '30 分钟', totalDuration: '1 小时 50 分', minFare: 58,
    }],
    error: null,
  }],
};

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([key, value]) => {
    try { localStorage.setItem(key, value); } catch { /* 忽略 */ }
  }, [KEY, JSON.stringify(seed)]);
  await page.route('**/api/rail/search', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(railBody) }));
  await page.route('**/api/rail/interline', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(interBody) }));

  try {
    await page.goto(BASE);
    await page.waitForFunction(() => document.querySelector('#trip-title'));
    await page.locator('.nav-item[data-section="traffic"]').click();

    const cards = page.locator('.leg-card');
    assert.equal(await cards.count(), 2, '应有去程、返程两栏');
    assert.match(await cards.nth(0).innerText(), /去程[\s\S]*上海 → 杭州/);
    assert.match(await cards.nth(1).innerText(), /返程[\s\S]*杭州 → 上海/);

    await cards.nth(1).getByRole('button', { name: '算最便宜' }).click();
    const options = page.locator('.best-option');
    await options.first().waitFor();
    assert.equal(await options.count(), 2, '应同时列出直达与中转两个候选');
    const board = await page.locator('.best-result').innerText();
    assert.match(board, /直达[\s\S]*¥73/, '候选里应有直达最低价');
    assert.match(board, /中转[\s\S]*¥58/, '候选里应有中转合计价');
    assert.match(board, /最低/, '应标出更便宜的一类');
    assert.match(await cards.nth(1).innerText(), /尚未选择/, '算完不应自动写入行程');

    await page.getByRole('button', { name: '选中转' }).click();
    const confirm = page.locator('#confirm-dialog');
    await confirm.waitFor();
    assert.match(await confirm.innerText(), /¥58/);
    await confirm.getByRole('button', { name: '确认' }).click();

    await page.waitForFunction(() => document.querySelector('.leg-card:nth-child(2)')?.textContent.includes('¥58'));
    const inbound = await cards.nth(1).innerText();
    assert.match(inbound, /¥58/, '返程应记入中转合计价');
    assert.match(inbound, /直达 ¥73 · 中转 ¥58/, '应保留直达与中转的最低价比');
    assert.deepEqual(errors, [], '页面不应有脚本错误');

    await page.screenshot({ path: 'E:/旅游规划工作台制作/旅迹风格预览/验收/next-cheapest.png', fullPage: true });
    console.log('PASS 去程/返程两栏与“算最便宜”：先列直达 ¥73 / 中转 ¥58，点选后才写入返程');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
