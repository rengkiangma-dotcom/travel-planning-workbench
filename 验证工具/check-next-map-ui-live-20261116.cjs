// 独立 Chromium 实测正式 Vue 工作台；使用隔离 localStorage，不读取真实旅行。
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

const base = 'http://127.0.0.1:18647';
const key = 'xingjian-lvji-preview-v1';
const tmp = 'E:/旅游规划工作台制作/验证工具/tmp';
const shots = 'E:/旅游规划工作台制作/验证工具/amap-workbench-ui-live-20261116';
const browserPath = 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const seed = {
  version: 1, tripId: 'isolated-live-map-check', started: true, entryMode: 'new',
  section: 'days', mapOpen: true, day: 0, origin: '青岛北站', destination: '青岛',
  start: today, days: 1, people: 1, rooms: 1, budget: 3000,
  flexible: true, autoLookup: true, tripName: '隔离地图实测',
  plans: [[]], customPlaces: {}, savedPlaces: [], wishPlaces: [], dailyRoutes: {}, dailyTiming: {},
  messages: [], undo: [],
};

(async () => {
  await fs.mkdir(tmp, { recursive: true });
  await fs.mkdir(shots, { recursive: true });
  process.env.TEMP = tmp; process.env.TMP = tmp; process.chdir(tmp);
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  // 即使界面行为变化，也不能读取或修改用户的备份与接口配置。
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === base && (url.pathname.startsWith('/api/backup/') || url.pathname === '/api/providers/config')) {
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(18000);
  const errors = [];
  const routeResponses = [];
  page.on('pageerror', (error) => errors.push(error.message.slice(0, 180)));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/_AMapService/v') && url.pathname.includes('/direction/')) {
      routeResponses.push({ path: url.pathname, status: response.status(), contentType: response.headers()['content-type'] || '' });
    }
  });
  await context.addInitScript(({ storageKey, value }) => localStorage.setItem(storageKey, JSON.stringify(value)), { storageKey: key, value: seed });

  async function searchPlace(term) {
    await page.getByLabel('搜索地图地点').fill(term);
    await page.locator('.map-search').getByRole('button', { name: '搜索', exact: true }).click();
    await page.locator('.map-panel-card .place-row').first().waitFor({ state: 'visible', timeout: 25000 });
    const rows = await page.locator('.map-panel-card .place-row').allInnerTexts();
    const exact = page.locator('.map-panel-card .place-row').filter({ hasText: term }).first();
    if (await exact.count()) await exact.click(); else await page.locator('.map-panel-card .place-row').first().click();
    return rows.slice(0, 3);
  }
  async function queryMode(mode) {
    await page.getByLabel('路线出行方式').selectOption(mode);
    await page.getByRole('button', { name: '查询路线' }).click();
    await page.waitForFunction(() => Boolean(document.querySelector('.route-status')?.textContent || document.querySelector('.map-panel-card [role="alert"]')?.textContent), null, { timeout: 45000 });
    const status = await page.locator('.route-status').innerText().catch(() => '');
    const error = await page.locator('.map-panel-card [role="alert"]').innerText().catch(() => '');
    const choices = page.locator('.route-choice');
    if (!status.includes('高德官方路线')) throw new Error(mode + ' route failed: ' + error);
    await choices.first().waitFor({ state: 'visible' });
    const routeChoices = await choices.allInnerTexts();
    assert.ok(routeChoices.length > 0, mode + ' should display route choices from the real response');
    assert.equal(await choices.first().getAttribute('aria-pressed'), 'true', mode + ' should initially select the first plan');
    await page.screenshot({ path: path.join(shots, `workbench-live-${mode}.png`), fullPage: true });
    return { mode, status, choices: routeChoices };
  }

  async function saveSelectedRoute(mode, index) {
    const choice = page.getByTestId(`route-option-${index}`);
    await choice.click();
    assert.equal(await choice.getAttribute('aria-pressed'), 'true', '用户选择的方案应显示为选中');
    const choiceText = await choice.innerText();
    const minutes = /方案\s+\d+\s*·\s*(\d+)\s*分钟/.exec(choiceText);
    const distance = /(\d+(?:\.\d+)?)\s*公里/.exec(choiceText);
    await page.screenshot({ path: path.join(shots, `workbench-live-${mode}-selected-${index + 1}.png`), fullPage: true });
    await page.getByRole('button', { name: /将选中方案加入第 1 天/ }).click();
    const saved = await page.evaluate((storageKey) => {
      const state = JSON.parse(localStorage.getItem(storageKey));
      const id = state.plans[0][0];
      return { id, route: state.dailyTiming?.[0]?.visits?.[id]?.route, plans: state.plans[0] };
    }, key);
    assert.ok(saved.id && saved.route, '明确加入当天后应保存路线快照');
    assert.equal(saved.route.mode, mode, '保存的出行方式应与选择一致');
    assert.equal(saved.route.routeIndex, index, '保存的方案序号应与选中卡片一致');
    assert.equal(saved.route.queryDate, today, '路线应归属于测试行程日期');
    if (minutes) assert.equal(Math.ceil(saved.route.durationSeconds / 60), Number(minutes[1]), '保存时长应与选中方案一致');
    if (distance) assert.equal((saved.route.distance / 1000).toFixed(1), Number(distance[1]).toFixed(1), '保存距离应与选中方案一致');
    return { ...saved, choiceText };
  }

  try {
    await page.goto(base + '/next/', { waitUntil: 'domcontentloaded' });
    try { await page.locator('.map-actions').waitFor({ timeout: 35000 }); }
    catch (error) {
      const diagnose = await page.evaluate((storageKey) => ({ location: location.href, title: document.title, text: document.body?.innerText?.slice(0, 1200), storage: localStorage.getItem(storageKey)?.slice(0, 700) }), key).catch((e) => ({ error: e.message }));
      await page.screenshot({ path: path.join(shots, 'workbench-live-startup-failure.png'), fullPage: true }).catch(() => {});
      console.log('STARTUP_DIAGNOSTIC', JSON.stringify({ diagnose, pageErrors: errors }));
      throw error;
    }
    const originRows = await searchPlace('青岛北站');
    await page.getByRole('button', { name: '设为起点' }).click();
    const destinationRows = await searchPlace('青岛市植物园');
    await page.getByRole('button', { name: '去这里' }).click();

    const results = [];
    results.push(await queryMode('driving'));
    const saved = await saveSelectedRoute('driving', 0);

    results.push(await queryMode('transit'));
    const transitCount = await page.locator('.route-choice').count();
    const transitSaved = await saveSelectedRoute('transit', transitCount > 1 ? 1 : 0);
    results.push(await queryMode('walking'));
    results.push(await queryMode('bicycling'));

    const mapBox = await page.locator('.map-canvas').boundingBox();
    await page.mouse.click(mapBox.x + mapBox.width - 80, mapBox.y + mapBox.height - 100, { button: 'right' });
    await page.getByTestId('map-context-origin').waitFor({ state: 'visible' });
    await page.getByTestId('map-context-origin').click();
    assert.match(await page.locator('.map-panel-card').innerText(), /起点：地图选点/);
    await page.evaluate((storageKey) => {
      const state = JSON.parse(localStorage.getItem(storageKey));
      window.__savedPlanCount = state.plans[0].length;
    }, key);
    await page.mouse.click(mapBox.x + mapBox.width - 80, mapBox.y + mapBox.height - 100, { button: 'right' });
    await page.getByTestId('map-context-clear').click();
    const afterClear = await page.evaluate((storageKey) => {
      const state = JSON.parse(localStorage.getItem(storageKey));
      return { plans: state.plans[0], route: state.dailyTiming?.[0]?.visits };
    }, key);
    assert.equal(afterClear.plans.length, 1, 'clearing route draft must not delete saved daily place');
    assert.ok(Object.keys(afterClear.route || {}).length, 'clearing route draft must preserve saved route timing');

    await page.screenshot({ path: path.join(shots, 'workbench-live-after-clear.png'), fullPage: true });
    assert.deepEqual(errors, [], 'live Vue map must not throw uncaught browser errors');
    assert.ok(routeResponses.length >= 4, 'all four route services should be requested');
    assert.ok(routeResponses.every((r) => r.status === 200 && r.contentType.includes('application/javascript')), 'JSONP route proxy responses must use JavaScript MIME');
    for (const mode of ['driving', 'transit', 'walking', 'bicycling']) {
      assert.ok(routeResponses.some((r) => r.path.includes(`/direction/${mode}`)), `${mode} 应有真实路线代理请求`);
    }
    assert.ok(transitCount > 1, '本次公交未返回第二方案，无法验证选中备选方案后保存；其余实测结果见截图');
    console.log(JSON.stringify({
      result: 'PASS',
      searchResults: { origin: originRows, destination: destinationRows },
      routes: results,
      routeResponses,
      savedRoute: { id: saved.id, mode: saved.route.mode, durationSeconds: saved.route.durationSeconds, queryDate: saved.route.queryDate },
      transitSaved: { mode: transitSaved.route.mode, routeIndex: transitSaved.route.routeIndex, durationSeconds: transitSaved.route.durationSeconds, choiceText: transitSaved.choiceText },
      errors,
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });

