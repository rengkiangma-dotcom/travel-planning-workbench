process.env.TEMP = 'E:/旅游规划工作台制作/验证工具/tmp';
process.env.TMP = process.env.TEMP;
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:18647/next/';
const KEY = 'xingjian-lvji-preview-v1';

const seed = {
  version: 1, started: true, entryMode: 'existing', section: 'traffic', mapOpen: false, day: 0,
  origin: '上海', destination: '杭州', start: '2026-11-16', days: 3, people: 2, rooms: 1,
  budget: 3000, flexible: false, original: '', notes: '', transport: null, hotel: null, mapStay: null,
  outStatus: '待定', backStatus: '待定', liveTickets: null,
  plans: [[], [], []], customPlaces: {}, savedPlaces: [], dailyRoutes: {}, messages: [], undo: [],
};

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.addInitScript(([key, value]) => {
    try { localStorage.setItem(key, value); } catch { /* 忽略 */ }
  }, [KEY, JSON.stringify(seed)]);

  try {
    await page.goto(BASE);
    await page.waitForFunction(() => document.querySelector('#trip-title'));
    await page.locator('.nav-item[data-section="traffic"]').click();
    await page.getByRole('button', { name: '查询真实往返' }).click();
    await page.locator('.real-train').first().waitFor({ timeout: 90000 });

    const inbound = page.locator('.leg-card').nth(1);
    await inbound.getByRole('button', { name: '算最便宜' }).click();
    const result = page.locator('.best-result');
    await result.waitFor({ timeout: 120000 });
    console.log('真实比较结果：' + (await result.innerText()).replace(/\s+/g, ' '));
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
