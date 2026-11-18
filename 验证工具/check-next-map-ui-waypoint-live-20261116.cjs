// 独立真实地图途经点验证：隔离浏览器存储，避免触碰真实用户行程。
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const tmp = 'E:/旅游规划工作台制作/验证工具/tmp';
const key = 'xingjian-lvji-preview-v1';
(async () => {
  await fs.mkdir(tmp, { recursive: true });
  process.env.TEMP = tmp;
  process.env.TMP = tmp;
  process.chdir(tmp);
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',
  });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  await context.route('**/*', async route => { const u = new URL(route.request().url()); if (u.origin === 'http://127.0.0.1:18647' && (u.pathname.startsWith('/api/backup/') || u.pathname === '/api/providers/config')) return route.abort('blockedbyclient'); return route.continue(); });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  const responses = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 180)));
  page.on('response', r => { const u = new URL(r.url()); if (u.pathname.includes('/direction/driving')) responses.push({ status: r.status(), type: r.headers()['content-type'], path: u.pathname }); });
  await context.addInitScript(({key}) => {
    localStorage.setItem(key, JSON.stringify({
      version: 1, tripId: 'isolated-waypoint-check', started: true, entryMode: 'new',
      section: 'days', mapOpen: true, day: 0, origin: '青岛', destination: '青岛',
      start: '2026-11-15', days: 1, people: 1, rooms: 1,
      budget: 1000, plans: [[]], customPlaces: {}, savedPlaces: [], wishPlaces: [],
      dailyRoutes: {}, dailyTiming: {}, messages: [], undo: [],
    }));
  }, {key});
  try {
    await page.goto('http://127.0.0.1:18647/next/', {waitUntil:'domcontentloaded'});
    await page.locator('.map-actions').waitFor({timeout:35000});
    const rect = await page.locator('.map-canvas').boundingBox();
    const choose = async (fx, fy, testid) => {
      await page.mouse.click(rect.x + rect.width * fx, rect.y + rect.height * fy, {button:'right'});
      if (testid === 'map-context-origin') await page.screenshot({path:'E:/旅游规划工作台制作/验证工具/amap-workbench-ui-live-20261116/workbench-live-context-menu.png'});
      await page.getByTestId(testid).click();
    };
    await choose(0.55, 0.64, 'map-context-origin');
    await choose(0.67, 0.61, 'map-context-waypoint');
    await choose(0.78, 0.58, 'map-context-destination');
    await page.getByLabel('路线出行方式').selectOption('driving');
    const before = await page.locator('.map-panel-card').innerText();
    assert.match(before, /途经：地图选点/);
    await page.getByRole('button', {name:'查询路线'}).click();
    await page.waitForFunction(() => Boolean(document.querySelector('.route-status')?.textContent || document.querySelector('.map-panel-card [role="alert"]')?.textContent), null, {timeout:45000});
    const status = await page.locator('.route-status').innerText().catch(()=>'');
    const failure = await page.locator('.map-panel-card [role="alert"]').innerText().catch(()=>'');
    const panel = await page.locator('.official-route-panel').innerText().catch(()=>'');
    console.log(JSON.stringify({status,failure,panelSnippet:panel.slice(0,170),responses,errors},null,2));
    assert.ok(status.includes('高德官方路线'), '途经点驾车查询必须返回真实官方路线');
    assert.equal(errors.length,0);
    const imagePath='E:/旅游规划工作台制作/验证工具/amap-workbench-ui-live-20261116/workbench-live-driving-waypoint.png';
    await page.screenshot({path:imagePath,fullPage:true});
    console.log('PASS official driving waypoint');
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(e=>{console.error('FAILED: '+String(e.stack||e).slice(0,1400));process.exitCode=1;});

