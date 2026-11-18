// 独立浏览器：最多两次真实公交路线请求，不读写真实旅行、备份或接口配置。
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = 'http://127.0.0.1:18647';
const storageKey = 'xingjian-lvji-preview-v1';
const tmp = path.join(__dirname, 'tmp');
const screenshots = path.join(__dirname, 'amap-live-preview');
const browserPath = 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const dateAt = (offset) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + offset * 86400000));
const seed = { version: 1, tripId: 'isolated-policy-probe', started: true, entryMode: 'new', section: 'days', mapOpen: true, day: 0, origin: '青岛北站', destination: '青岛', start: dateAt(0), days: 1, people: 1, rooms: 1, budget: 3000, flexible: true, autoLookup: true, tripName: '独立公交测试', plans: [[]], customPlaces: {}, savedPlaces: [], wishPlaces: [], dailyRoutes: {}, dailyTiming: {}, messages: [], undo: [] };

(async () => {
  await fs.mkdir(tmp, { recursive: true });
  await fs.mkdir(screenshots, { recursive: true });
  process.env.TEMP = tmp; process.env.TMP = tmp;
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const requests = [], responses = [];
  let attempts = 0;
  await context.route('**/*', async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === base && (url.pathname.startsWith('/api/backup/') || url.pathname === '/api/providers/config')) return route.abort('blockedbyclient');
    if (url.origin === base && url.pathname.startsWith('/_AMapService/') && url.pathname.includes('/direction/')) {
      attempts++;
      const allowed = ['strategy', 'policy', 'date', 'time', 'city', 'cityd', 'nightflag'];
      requests.push({ path: url.pathname, params: Object.fromEntries(allowed.filter(k => url.searchParams.has(k)).map(k => [k, url.searchParams.get(k)])) });
      if (attempts > 2) return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === base && url.pathname.startsWith('/_AMapService/') && url.pathname.includes('/direction/')) responses.push({ path: url.pathname, status: response.status() });
  });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value: seed });

  async function selectPlace(term, action) {
    await page.getByLabel('搜索地图地点').fill(term);
    await page.locator('.map-search').getByRole('button', { name: '搜索', exact: true }).click();
    const exact = page.locator('.map-panel-card .place-row').filter({ hasText: term }).first();
    await exact.waitFor({ state: 'visible', timeout: 30000 });
    await exact.click();
    await page.getByRole('button', { name: action, exact: true }).click();
  }
  async function query(label) {
    const before = attempts;
    await page.getByRole('button', { name: '查询路线', exact: true }).click();
    await page.waitForFunction(() => Boolean(document.querySelector('.route-status')?.textContent || document.querySelector('.map-panel-card [role="alert"]')?.textContent), null, { timeout: 45000 });
    const status = await page.locator('.route-status').innerText().catch(() => '');
    const error = await page.locator('.map-panel-card [role="alert"]').innerText().catch(() => '');
    const choices = await page.locator('.route-choice').allInnerTexts();
    await page.screenshot({ path: path.join(screenshots, `transit-policy-${label}.png`), fullPage: true });
    return { label, routeRequests: attempts - before, status, error, choiceCount: choices.length, choices: choices.map(s => s.replace(/\s+/g, ' ').trim()).slice(0, 5) };
  }
  try {
    await page.goto(base + '/next/', { waitUntil: 'domcontentloaded' });
    await page.locator('.map-actions').waitFor({ timeout: 35000 });
    await selectPlace('青岛北站', '设为起点');
    await selectPlace('青岛市植物园', '去这里');
    await page.getByLabel('路线出行方式').selectOption('transit');
    const defaultResult = await query('default');
    if (attempts >= 2) throw new Error('默认查询已触及两次请求上限，未执行第二次');
    await page.getByLabel('公交路线策略').selectOption('LEAST_WALK');
    await page.getByLabel('公交出发日期').fill(dateAt(2));
    await page.getByLabel('公交出发时间').fill('10:15');
    const changedResult = await query('changed');
    console.log(JSON.stringify({ requested: { origin: '青岛北站', destination: '青岛市植物园', strategy: '少步行', date: dateAt(2), time: '10:15' }, attempts, requests, responses, defaultResult, changedResult }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => { console.error('测试未完成：' + String(error.message || error).replace(/([?&](?:key|jscode)=)[^&\s]+/gi, '$1已隐藏')); process.exitCode = 1; });
