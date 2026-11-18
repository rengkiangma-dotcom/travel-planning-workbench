// 只读取独立预览的静态文件，所有网络请求由独立浏览器拦截；不连接工作台服务。
// 不访问真实旅行、备份或用户浏览器资料。截图均标明模拟数据。
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../旅迹风格预览/地图互动独立预览');
const screenshots = path.resolve(__dirname, 'amap-interaction-preview');
const tmp = path.resolve(__dirname, 'tmp');
const base = 'http://preview-isolated.test';
const tripKey = 'xingjian-lvji-preview-v1';
const tripSentinel = '模拟验收隔离哨兵，不是真实行程';
const browserPath = 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';

// 假高德 SDK 模拟周边响应迟到，仍然拦截网络，不使用真实 Key 或地图。
async function checkNearbyRace(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const sdk = `(() => {
    window.__nearby=[];
    class Map { constructor(){window.__fakeMap=this;this.events={}} on(n,f){this.events[n]=f} add(){} remove(){} setZoomAndCenter(){} setFitView(){} setCenter(){} }
    class Marker { on(){} }
    class Polyline { on(){} }
    class PlaceSearch { searchNearBy(q,p,r,cb){window.__nearby.push(cb)} }
    window.AMap={Map,Marker,Polyline,PlaceSearch,plugin:(names,cb)=>cb()};
  })();
  `;
  const unexpected = [];
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.origin === 'https://webapi.amap.com' && url.pathname === '/maps') return route.fulfill({ status: 200, contentType: 'text/javascript', body: sdk });
    if (url.origin !== base) { unexpected.push(url.origin + url.pathname); return route.abort(); }
    if (url.pathname === '/api/map/js-config') return json({ configured: true, key: 'test-only' });
    if (url.pathname === '/api/routes/search') return json({ routes: [{ distance: 1000, durationSeconds: 600, polylines: ['120.1,36.1;120.2,36.2'], instructions: ['模拟道路'] }] });
    if (request.method() !== 'GET' || url.pathname.startsWith('/api/')) { unexpected.push(url.pathname); return route.abort(); }
    try {
      const file = path.resolve(root, decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html');
      if (!file.startsWith(root + path.sep)) throw Error('outside preview');
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
      if (!mime[path.extname(file)]) throw Error('unsupported');
      return route.fulfill({ status: 200, contentType: mime[path.extname(file)], body: await fs.readFile(file) });
    } catch { return route.fulfill({ status: 404, body: 'not found' }); }
  });
  try {
    await page.goto(`${base}/index.html?mode=live`);
    await page.waitForFunction(() => !!window.__fakeMap);
    await page.evaluate(() => window.__fakeMap.events.rightclick({ pixel: { x: 700, y: 400 }, lnglat: { lng: 120.35, lat: 36.1 } }));
    await page.getByTestId('context-nearby').click();
    await page.waitForFunction(() => window.__nearby.length === 1);
    await page.locator('#engine').selectOption('custom');
    await page.getByTestId('route-search').click();
    await page.getByTestId('route-card-0').waitFor();
    await page.evaluate(() => window.__nearby[0]('complete', { poiList: { pois: [{ id: 'old', name: '迟到的周边地点', location: { lng: 120.35, lat: 36.1 } }] } }));
    assert.equal(await page.getByTestId('route-card-0').count(), 1, '迟到的周边结果不得覆盖当前路线卡');
    assert.equal(await page.getByText('迟到的周边地点').count(), 0);
    assert.deepEqual(unexpected, [], '隔离测试不得请求外部服务');
  } finally {
    await context.close();
  }
}

async function run() {
  await fs.mkdir(tmp, { recursive: true });
  await fs.mkdir(screenshots, { recursive: true });
  process.env.TEMP = tmp;
  process.env.TMP = tmp;
  process.chdir(tmp);
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const blocked = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(({ key, value }) => {
    if (!sessionStorage.getItem('isolated-sentinel-installed')) {
      localStorage.setItem(key, value);
      sessionStorage.setItem('isolated-sentinel-installed', '1');
    }
  }, { key: tripKey, value: tripSentinel });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base || request.method() !== 'GET' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/_AMapService/')) {
      blocked.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort();
    }
    try {
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep)) throw new Error('path outside preview');
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
      if (!mime[path.extname(file)]) throw new Error('unsupported extension');
      return route.fulfill({ status: 200, contentType: mime[path.extname(file)], body: await fs.readFile(file) });
    } catch {
      return route.fulfill({ status: 404, body: 'not found' });
    }
  });
  const id = name => page.getByTestId(name);
  try {
    await page.goto(`${base}/index.html?mode=mock`);
    await id('mock-map').waitFor();
    await page.evaluate(() => {
      const label = document.createElement('div');
      label.textContent = `模拟数据验收截图 · ${new Date().toLocaleString('zh-CN')} · 非真实地图与路线`;
      Object.assign(label.style, { position: 'fixed', right: '8px', bottom: '6px', zIndex: '99999', padding: '6px 9px', background: '#8f3030', color: '#fff', fontSize: '12px' });
      document.body.appendChild(label);
    });
    const snap = name => page.screenshot({ path: path.join(screenshots, `${name}.png`), fullPage: true });
    assert.match(await page.locator('#mode-label').innerText(), /模拟数据/);
    await id('mock-map').click({ position: { x: 700, y: 500 } });
    assert.match(await id('place-detail').innerText(), /青岛市植物园/);
    await id('favorite-toggle').click();
    assert.match(await id('favorite-toggle').innerText(), /取消收藏/);
    assert.match(await id('place-list').innerText(), /★/);
    await id('add-day').click();
    assert.match(await id('schedule').innerText(), /青岛市植物园/);
    await id('favorite-toggle').click();
    assert.match(await id('schedule').innerText(), /青岛市植物园/, '取消收藏后已安排地点保留');
    await snap('place-detail');
    await id('place-list').getByRole('button', { name: /青岛北站/ }).click();
    await id('add-day').click();
    const before = await id('schedule').innerText();
    assert.match(before, /09:20 到达 · 10:50 离开/);
    assert.match(before, /11:15 到达/);
    await snap('schedule');
    const stay = page.locator('[data-stay="0"]');
    await stay.click();
    await stay.press('Control+A');
    await page.keyboard.type('123');
    assert.equal(await page.locator('[data-stay="0"]').inputValue(), '123', '停留时间应支持键盘连续输入多位数');
    await page.locator('[data-stay="0"]').fill('90');
    await id('move-down-0').click();
    assert.ok((await id('schedule').innerText()).indexOf('青岛北站') < (await id('schedule').innerText()).indexOf('青岛市植物园'), '换序应更新日程');
    await id('home-origin').click();
    assert.match(await id('origin').innerText(), /模拟住宿/);
    await id('mock-map').click({ button: 'right', position: { x: 700, y: 500 } });
    await id('context-menu').waitFor({ state: 'visible' });
    await snap('context-menu');
    await id('context-origin').click();
    const chosen = await id('origin').innerText();
    assert.match(chosen, /所选坐标 · 120\.\d{6},36\.\d{6}/);
    await id('mock-map').click({ button: 'right', position: { x: 700, y: 500 } });
    await id('context-destination').click();
    assert.equal(await id('destination').innerText(), chosen, '相同右键位置应产生相同坐标');
    await id('mock-map').click({ button: 'right', position: { x: 700, y: 500 } });
    await id('context-waypoint').click();
    assert.match(await page.locator('#waypoints').innerText(), /所选坐标/);
    await id('mock-map').click({ button: 'right', position: { x: 700, y: 500 } });
    await id('context-clear').click();
    assert.equal(await page.locator('#waypoints').innerText(), '');
    assert.match(await id('schedule').innerText(), /青岛北站/, '清除路线不得删除安排');
    await id('mock-map').click({ button: 'right', position: { x: 700, y: 500 } });
    await id('context-where').click();
    assert.match(await id('place-detail').innerText(), /模拟逆地理位置/);
    assert.match(await id('status').innerText(), /模拟模式/);
    await id('mock-map').click({ button: 'right', position: { x: 700, y: 500 } });
    await id('context-nearby').click();
    assert.match(await id('place-detail').innerText(), /模拟周边位置/);
    await id('mock-map').click({ button: 'right', position: { x: 700, y: 500 } });
    await id('context-center').click();
    assert.match(await id('status').innerText(), /模拟：已设地图中心/);
    await id('mock-map').click({ button: 'right', position: { x: 700, y: 500 } });
    await page.keyboard.press('Escape');
    assert.equal(await id('context-menu').isVisible(), false, 'Escape 应关闭右键菜单');
    await id('place-list').getByRole('button', { name: /青岛北站/ }).click();
    await page.locator('#set-origin').click();
    await id('place-list').getByRole('button', { name: /青岛市植物园/ }).click();
    await page.locator('#set-destination').click();
    for (const mode of ['driving', 'transit', 'walking', 'riding']) {
      await id(`mode-${mode}`).click();
      assert.equal(await id('route-card-0').count(), 0, '切换方式应清除旧结果');
      await id('route-search').click();
      await id('route-card-0').waitFor();
      assert.match(await id('status').innerText(), /模拟路线/);
      if (mode === 'driving' || mode === 'transit') {
        await id('route-card-1').click();
        assert.match(await id('route-map-1').getAttribute('class'), /active/, '点击列表应选中地图路线');
        await id('route-map-0').click();
        assert.match(await id('route-card-0').getAttribute('class'), /active/, '点击地图路线应选中列表');
      }
      await snap(`route-${mode}`);
    }
    await page.reload();
    await id('mock-map').waitFor();
    assert.match(await id('schedule').innerText(), /青岛北站/, '预览状态应可从专属存储恢复');
    await page.setViewportSize({ width: 900, height: 800 });
    assert.ok(await id('route-search').isVisible(), '窄窗口下路线查询仍可操作');
    await page.setViewportSize({ width: 375, height: 812 });
    await id('route-search').click();
    await id('route-card-0').waitFor();
    await id('mode-walking').click();
    await id('route-search').click();
    await id('route-card-0').waitFor();
    assert.match(await id('status').innerText(), /模拟路线/, '手机宽度下应能切换方式并查询');
    assert.deepEqual(errors, [], '页面不应产生未捕获异常');
    assert.deepEqual(blocked, [], '模拟场景不应尝试访问真实服务');
    assert.equal(await page.evaluate(key => localStorage.getItem(key), tripKey), tripSentinel, '预览不得改写旅行存储');
    await checkNearbyRace(browser);
    console.log('PASS 独立模拟地图互动验收（含键盘、窄屏与迟到的周边响应）');
  } catch (error) {
    await page.screenshot({ path: path.join(screenshots, 'failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
