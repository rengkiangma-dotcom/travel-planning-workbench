// 独立验收：只读取 next 构建产物，全部接口和外网均由测试拦截。
// 不使用工作台服务，不访问真实备份，不复用用户浏览器资料。
process.env.TEMP = 'E:/旅游规划工作台制作/验证工具/tmp';
process.env.TMP = process.env.TEMP;
// Edge 在当前目录生成诊断日志，放到测试临时目录，避免污染项目根目录。
process.chdir(process.env.TEMP);
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '../旅迹风格预览/next');
const KEY = 'xingjian-lvji-preview-v1';
const seed = {
  version: 1, tripId: 'isolated-test', started: true, entryMode: 'existing',
  section: 'days', mapOpen: true, day: 0, origin: '上海', destination: '杭州',
  start: '2026-11-14', days: 2, people: 2, rooms: 1, budget: 3000,
  plans: [['poi:test-a', 'poi:test-b'], ['poi:test-c']],
  customPlaces: {
    'poi:test-a': { id: 'poi:test-a', name: '测试地点甲', gcj02: '120.101,30.201', wgs84: '120.091,30.191' },
    'poi:test-b': { id: 'poi:test-b', name: '测试地点乙', gcj02: '120.102,30.202', wgs84: '120.092,30.192' },
    'poi:test-c': { id: 'poi:test-c', name: '测试地点丙', gcj02: '120.103,30.203', wgs84: '120.093,30.193' },
    'poi:broken': {
      id: 'poi:broken',
      name: '断桥残雪',
      city: '杭州',
      area: '西湖区',
      address: '北山街',
      gcj02: '120.151347,30.258151',
      wgs84: '120.146643,30.260475',
      lng: 120.146643,
      lat: 30.260475,
    },
  },
  savedPlaces: ['poi:test-a', 'poi:test-b', 'poi:test-c'], dailyRoutes: {},
  messages: [], undo: [],
};

function installFakeMap() {
  window.__mapTest = { maps: [], routeRequests: [], holdRoute: false, pendingRoutes: [], routeFailure: false };
  class MockMap {
    constructor(element, options) {
      this.element = element; this.options = options; this.items = []; this.events = {};
      window.__mapTest.maps.push(this);
    }
    add(items) { this.items.push(...(Array.isArray(items) ? items : [items])); }
    remove(items) { const list = Array.isArray(items) ? items : [items]; this.items = this.items.filter((item) => !list.includes(item)); }
    on(name, handler) {
      this.events[name] = handler;
      if (name === 'complete' && !sessionStorage.getItem('mock-map-no-complete')) {
        setTimeout(() => { if (!this.destroyed && this.events.complete === handler) handler(); }, 0);
      }
    }
    once(name, handler) { this.on(name, handler); }
    off(name) { delete this.events[name]; }
    destroy() { this.destroyed = true; }
    setFitView(items) { this.fitCount = (this.fitCount || 0) + 1; this.fitItems = items; }
    setZoomAndCenter(zoom, center) { this.zoom = zoom; this.center = center; }
    setCenter(center) { this.center = center; }
    resize() { this.resizeCount = (this.resizeCount || 0) + 1; }
    addControl() {}
  }
  class Marker {
    constructor(options) { this.options = options; this.events = {}; this.kind = 'marker'; }
    on(name, handler) { this.events[name] = handler; }
  }
  class Polyline { constructor(options) { this.options = options; this.kind = 'polyline'; this.events = {}; } on(name, handler) { this.events[name] = handler; } }
  class Traffic { constructor() { this.kind = 'traffic'; } }
  class Satellite { constructor() { this.kind = 'satellite'; } }
  class RoadNet { constructor() { this.kind = 'road'; } }
  class RouteComponent {
    constructor(options, mode) { this.options = options; this.mode = mode; this.overlays = []; }
    search(origin, destination, optionsOrCallback, maybeCallback) {
      const searchOptions = typeof optionsOrCallback === 'function' ? {} : (optionsOrCallback || {});
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
      window.__mapTest.routeRequests.push({ mode: this.mode, origin, destination, waypoints: searchOptions.waypoints || [], city: this.options.city || '', cityd: this.options.cityd || '', policy: this.options.policy, departure: this.departure });
      const complete = () => {
        if (window.__mapTest.routeFailure) { callback('error', '模拟路线查询失败'); return; }
        const line = new Polyline({ path: [[120.102, 30.202], [120.104, 30.204]], strokeColor: '#1687ed', strokeWeight: 6 });
        this.overlays = [line];
        this.options.map?.add(this.overlays);
        if (this.options.panel) this.options.panel.innerHTML = '<div class="mock-official-result">官方模拟路线 1.2 公里 · 15 分钟</div><p>步行到车站</p>';
        const route1 = { distance: 1200, time: 900, traffic_lights: 5, roads: [{ road_name: '环城北路' }, { road_name: '文一路' }], steps: [{ instruction: '步行到车站', path: [[120.102,30.202],[120.104,30.204]] }] };
        const route2 = { distance: 2000, time: 1500, traffic_lights: 8, roads: [{ road_name: '文一路' }, { road_name: '莫干山路' }], steps: [{ instruction: '走另一条道路', path: [[120.102,30.202],[120.103,30.205],[120.104,30.204]] }] };
        if (this.mode === 'transit') {
          route1.walking_distance = 800;
          route1.segments = [{ instruction: '乘地铁', transit: { path: route1.steps[0].path, lines: [{ name: '地铁1号线' }], on_station: { name: '起点站' }, off_station: { name: '终点站' } } }];
          route2.segments = [{ instruction: '乘公交', transit: { path: route2.steps[0].path, lines: [{ name: '公交2路' }], on_station: { name: '公交起点站' }, off_station: { name: '公交终点站' } } }];
          delete route1.steps; delete route2.steps;
        }
        if (this.mode === 'bicycling') {
          route1.rides = [{ instruction: '沿骑行道路行驶', path: route1.steps[0].path }];
          route2.rides = [{ instruction: '骑行备选道路', path: route2.steps[0].path }];
          delete route1.steps; delete route2.steps;
        }
        if (window.__mapTest.partialGeometry) {
          route1.steps = [{ instruction: '部分道路', polyline: '120.102,30.202;120.103,30.203;,;120.104,30.204;120.105,30.205' }, { instruction: '无坐标段' }];
        }
        callback('complete', this.mode === 'transit' ? { count: 2, plans: [route1, route2] } : { count: 2, routes: [route1, route2] });
      };
      if (window.__mapTest.holdRoute) window.__mapTest.pendingRoutes.push(complete);
      else complete();
    }
    clear() { this.options.map?.remove(this.overlays); this.overlays = []; if (this.options.panel) this.options.panel.innerHTML = ''; }
  }
  class Driving extends RouteComponent { constructor(options) { super(options, 'driving'); } }
  class Transfer extends RouteComponent { constructor(options) { super(options, 'transit'); } leaveAt(time, date) { this.departure = { time, date }; } }
  class Walking extends RouteComponent { constructor(options) { super(options, 'walking'); } }
  class Riding extends RouteComponent { constructor(options) { super(options, 'bicycling'); } }
  class Geocoder {
    getAddress(position, callback) { callback('complete', { regeocode: { formattedAddress: '测试逆地理地址' } }); }
  }
  class PlaceSearch {
    searchNearBy(_keyword, position, _radius, callback) {
      callback('complete', { poiList: { pois: [{ id: 'nearby-1', name: '附近测试地点', address: '测试周边地址', cityname: '杭州', location: { lng: position[0] + 0.001, lat: position[1] + 0.001 } }] } });
    }
  }
  window.AMap = {
    Map: MockMap, Marker, Polyline, TileLayer: { Traffic, Satellite, RoadNet },
    Driving, Transfer, Walking, Riding, Geocoder, PlaceSearch,
    DrivingPolicy: { LEAST_TIME: 201, LEAST_FEE: 202, LEAST_DISTANCE: 203, REAL_TRAFFIC: 204 },
    TransferPolicy: { LEAST_TIME: 301, LEAST_FEE: 302, LEAST_TRANSFER: 303, LEAST_WALK: 304, MOST_COMFORT: 305, NO_SUBWAY: 306 },
    Scale: class {}, ToolBar: class {}, plugin: (_names, done) => done(),
  };
}

async function run() {
  const base = 'http://isolated-map.test';
  let browser;
  try { browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe' }); }
  catch (error) { throw error; }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  let configEnabled = true;
  let searchFailure = false;
  let cityCodeFailure = false;
  let subwayListFailure = false;
  page.on('pageerror', (error) => errors.push(error.message));
  await context.addInitScript(({ key, value }) => {
    if (!sessionStorage.getItem('isolated-map-seeded')) {
      localStorage.setItem(key, JSON.stringify(value));
      sessionStorage.setItem('isolated-map-seeded', 'yes');
    }
  }, { key: KEY, value: seed });
  await context.addInitScript(installFakeMap);
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.origin === 'https://webapi.amap.com' && url.pathname === '/subway/data/citylist.json') return subwayListFailure ? json({ error: '模拟不可用' }, 503) : json({ citylist: [{ adcode: '3301', cityname: '杭州市', spell: 'hangzhou' }, { adcode: '3702', cityname: '青岛市', spell: 'qingdao' }] });
    if (url.origin === 'https://webapi.amap.com' && url.pathname === '/subway') {
      const callback = url.searchParams.get('callback');
      if (!/^[A-Za-z_$][\w$]*$/.test(callback || '')) return route.abort();
      const body = `window.subway = function(id, options) { document.getElementById(id).textContent = '模拟地铁图-' + options.adcode; return {event:{on:function(name, cb){if(name==='subway.complete')setTimeout(cb,0)}}}; }; window[${JSON.stringify(callback)}]();`;
      return route.fulfill({status: 200, contentType: 'application/javascript', body});
    }
    if (url.origin !== base) return route.abort();
    if (url.pathname === '/api/map/js-config') return json(configEnabled ? { configured: true, key: 'fake-key' } : { configured: false, key: null });
    if (url.pathname === '/api/places/search') {
      if (searchFailure) return json({ error: '模拟地点查询失败' }, 503);
      const { keywords } = request.postDataJSON();
      const num = keywords.includes('乙') ? 2 : keywords.includes('丙') ? 3 : 4;
      return json({ pois: [{ id: `lookup-${num}`, name: `搜索地点${num}`, city: '杭州', address: `测试地址${num}`, gcj02: `120.10${num},30.20${num}`, wgs84: `120.09${num},30.19${num}` }] });
    }
    if (url.pathname === '/api/places/city-code') {
      if (cityCodeFailure) return json({ error: '模拟城市代码解析失败' }, 400);
      const { city } = request.postDataJSON();
      return city === '杭州' ? json({ city, code: '3301' }) : json({ error: '无法确定城市代码' }, 400);
    }
    if (url.pathname === '/api/places/detail') {
      const { id } = request.postDataJSON();
      if (id === 'poi:test-a') return json({ poi: { id: 'test-a', rating: '4.6', openingHoursToday: '09:00-17:00', entranceGcj02: '120.111,30.211', exitGcj02: '120.112,30.212', photos: [] } });
      return json({ error: '模拟详情暂无' }, 404);
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_AMapService/')) return json({ error: '测试中禁止访问真实接口' }, 503);
    if (request.method() !== 'GET') return route.abort();
    try {
      const relative = url.pathname.replace(/^\/next\//, '') || 'index.html';
      const file = path.resolve(root, relative);
      const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
      if (!file.startsWith(root + path.sep) || !mime[path.extname(file)]) throw new Error('not found');
      return route.fulfill({ status: 200, contentType: mime[path.extname(file)], body: await fs.readFile(file) });
    } catch { return route.fulfill({ status: 404, body: 'not found' }); }
  });

  const mapState = () => page.evaluate(() => {
    const map = window.__mapTest.maps.at(-1);
    return { items: map.items.map((x) => ({ kind: x.kind, title: x.options?.title, text: x.options?.content?.textContent, className: x.options?.content?.className, position: x.options?.position, path: x.options?.path, extData: x.options?.extData, showDir: x.options?.showDir, dirColor: x.options?.dirColor })) };
  });
  const search = async (term) => {
    await page.getByLabel('搜索地图地点').fill(term);
    await page.locator('.map-search').getByRole('button', { name: '搜索', exact: true }).click();
  };
  const openMapMore = async () => {
    const button = page.getByRole('button', { name: '更多', exact: true });
    if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
  };
  try {
    await page.goto(`${base}/next/`);
    await page.locator('.map-actions').waitFor();
    const toolbarButtons = await page.locator('.map-actions > button').allInnerTexts();
    assert.deepEqual(toolbarButtons.map((text) => text.trim()), ['卫星', '路况', '测距', '地铁', '全屏', '更多'], '地图工具栏应按高德参考顺序横向排列');
    assert.equal(await page.getByRole('button', { name: '地铁', exact: true }).isEnabled(), true, '地图工具栏应提供地铁图入口');
    const beforeSubway = await page.evaluate((key) => localStorage.getItem(key), KEY);
    await page.getByRole('button', { name: '地铁', exact: true }).click();
    const subwayFrame = page.frameLocator('iframe[title="地铁线路图"]');
    await subwayFrame.getByText('模拟地铁图-3301').waitFor();
    await subwayFrame.getByLabel('选择地铁城市').selectOption('3702');
    await subwayFrame.getByText('模拟地铁图-3702').waitFor();
    await page.locator('iframe[title="地铁线路图"]').evaluate((el) => { el.src = '/next/subway-view.html?city=不支持的城市'; });
    await subwayFrame.getByRole('status').getByText('当前目的地没有匹配到地铁图，请选择城市。').waitFor();
    assert.equal(await subwayFrame.locator('#subway-map').innerText(), '', '不支持的城市不得默认显示其他城市线路');
    subwayListFailure = true;
    await page.locator('iframe[title="地铁线路图"]').evaluate((el) => { el.src = '/next/subway-view.html?city=杭州'; });
    await subwayFrame.getByRole('status').getByText('地铁城市列表加载失败。').waitFor();
    subwayListFailure = false;
    await page.getByRole('button', { name: '关闭地铁图', exact: true }).click();
    assert.equal(await page.locator('iframe[title="地铁线路图"]').count(), 0, '关闭地铁图时应卸载隔离页面');
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), KEY), beforeSubway, '浏览地铁图不应修改行程');
    await page.getByRole('button', { name: '地铁', exact: true }).click();
    await page.locator('iframe[title="地铁线路图"]').waitFor();
    await page.getByRole('button', { name: /收起地图/ }).click();
    assert.equal(await page.locator('iframe[title="地铁线路图"]').count(), 0, '收起地图时应卸载地铁图');
    await page.getByRole('button', { name: /展开地图/ }).click();
    await page.locator('.map-actions').waitFor({state:'visible'});
    await page.getByRole('button', { name: '更多', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '看行程', exact: true }).isVisible(), true, '工作台原有入口应能从更多菜单打开');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button', { name: '看行程', exact: true }).count(), 0, 'Escape 应关闭更多菜单');
    await page.getByRole('button', { name: '全屏', exact: true }).click();
    await page.waitForFunction(() => document.fullscreenElement?.classList.contains('travel-map'));
    await page.getByRole('button', { name: '退出全屏', exact: true }).click();
    await page.waitForFunction(() => !document.fullscreenElement);
    await page.getByRole('button', { name: '打开路线规划', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '驾车路线', exact: true }).isVisible(), true, '搜索栏路线入口应打开路线面板');
    await page.getByRole('button', { name: '关闭面板', exact: true }).click();
    let state = await mapState();
    assert.equal(await page.evaluate(() => window.__mapTest.maps[0].zoom), 11, '地图打开时应定位到目的地城市');
    assert.equal(await page.evaluate(() => window.__mapTest.maps[0].options.viewMode), '3D', '地图应启用高清 3D 渲染');
    assert.equal(await page.evaluate(() => window.__mapTest.maps[0].options.WebGLParams.antialias), true, '地图应启用 WebGL 抗锯齿');
    await page.waitForFunction(() => (window.__mapTest.maps[0].resizeCount || 0) > 0); // resize 在下一帧执行
    assert.ok(await page.evaluate(() => {
      const center = window.__mapTest.maps[0].center;
      return center[0] > 120 && center[0] < 121 && center[1] > 30 && center[1] < 31;
    }), '目的地初始中心应位于杭州范围');
    assert.deepEqual(state.items.filter((x) => x.text === '1').map((x) => [x.title, x.position]), [['测试地点甲', [120.101, 30.201]]], '行程标记使用 GCJ-02 坐标');
    assert.deepEqual(state.items.filter((x) => x.text === '2').map((x) => x.title), ['测试地点乙']);
    await page.locator('.event').first().getByRole('button', { name: '在地图查看测试地点甲' }).click();
    await page.waitForFunction(() => window.__mapTest.maps[0].zoom === 16);
    assert.deepEqual(await page.evaluate(() => window.__mapTest.maps[0].center), [120.101, 30.201], '每日行程地图定位应指向同一稳定地点 ID');
    await page.getByText(/评分：4.6/).waitFor();
    assert.match(await page.locator('.map-panel-card').innerText(), /09:00-17:00/, '地点详情显示接口返回的营业时间');

    await page.evaluate(() => window.__mapTest.maps[0].events.rightclick({
      pixel: { x: 700, y: 420 },
      lnglat: { getLng: () => 120.123, getLat: () => 30.222 },
    }));
    await page.getByTestId('map-context-center').click();
    assert.deepEqual(await page.evaluate(() => window.__mapTest.maps[0].center), [120.123, 30.222], '右键地图中心应使用本次固定坐标');
    await page.evaluate(() => window.__mapTest.maps[0].events.rightclick({
      pixel: { x: 500, y: 300 },
      lnglat: { getLng: () => 120.124, getLat: () => 30.223 },
    }));
    await page.getByTestId('map-context-where').click();
    await page.getByText('测试逆地理地址').waitFor();
    assert.match(await page.locator('.map-panel-card').innerText(), /地图位置/);
    await page.evaluate(() => window.__mapTest.maps[0].events.rightclick({
      pixel: { x: 520, y: 320 },
      lnglat: { getLng: () => 120.125, getLat: () => 30.224 },
    }));
    await page.getByTestId('map-context-nearby').click();
    await page.getByText('附近测试地点').waitFor();
    await page.locator('.map-panel-card').getByRole('button', { name: /附近测试地点/ }).click();
    await page.getByRole('button', { name: '设为住宿位置' }).click();
    await page.getByText(/已将这个地点设为住宿位置/).waitFor();
    assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).mapStay.name, KEY), '附近测试地点', '地图地点应能独立设为住宿位置');
    await page.getByRole('button', { name: '加入想去' }).click();
    assert.ok(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).wishPlaces.includes('poi:nearby-1'), KEY), '加入想去应与收藏和当天安排分开保存');
    await openMapMore();
    await page.getByRole('button', { name: '路线', exact: true }).click();
    await page.getByRole('button', { name: '从住宿出发' }).click();
    assert.match(await page.locator('.map-panel-card').innerText(), /起点：附近测试地点/, '路线应支持从住宿位置出发');
    await page.evaluate(() => window.__mapTest.maps[0].events.rightclick({
      pixel: { x: 520, y: 320 },
      lnglat: { getLng: () => 120.126, getLat: () => 30.225 },
    }));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.map-context-menu').count(), 0, 'Escape 应关闭右键菜单');

    await page.locator('.nav-item[data-section="places"]').click();
    await page.getByRole('button', { name: /收起地图/ }).click();
    assert.equal(await page.locator('.map-canvas').isVisible(), false, '收起后地图应隐藏');
    assert.equal(await page.getByRole('button', { name: '地图定位', exact: true }).count(), 4, '左侧应分别展示真实想去地点和收藏地点');
    assert.ok(await page.locator('[data-place-id="poi:nearby-1"]').evaluate((element) => element.classList.contains('selected')), '地图点击附近真实地点后，左侧想去卡片同步高亮');
    const brokenCard = page.getByRole('button', { name: '在地图上查看断桥残雪' });
    await brokenCard.click();
    await page.locator('.map-actions').waitFor({ state: 'visible' });
    await page.waitForFunction(() => window.__mapTest.maps[0].zoom === 16);
    assert.equal(await page.evaluate(() => window.__mapTest.maps[0].zoom), 16, '点击地点卡片后应放大到地点级别');
    assert.ok(await page.evaluate(() => {
      const [lng, lat] = window.__mapTest.maps[0].center;
      return Math.abs(lng - 120.151347) < 0.000001 && Math.abs(lat - 30.258151) < 0.000001;
    }), '点击地点卡片后应移动到对应地点的 GCJ-02 中心');
    assert.equal(await brokenCard.getAttribute('aria-pressed'), 'true', '点击卡片后左侧卡片应保持选中');
    assert.ok(await brokenCard.evaluate((element) => element.classList.contains('selected')), '选中卡片应显示选中样式');
    await page.waitForFunction(() => window.__mapTest.maps[0].items.some((item) => (
      item.kind === 'marker'
      && item.options?.title === '断桥残雪'
      && item.options?.content?.classList?.contains('selected')
    )));
    state = await mapState();
    const brokenMarkers = state.items.filter((item) => item.title === '断桥残雪');
    assert.equal(brokenMarkers.length, 1, '示例景点与它的收藏记录应共用同一个 Marker');
    assert.ok(brokenMarkers.some((item) => /\bselected\b/.test(item.className || '')), '点击卡片后地图对应 Marker 应同步选中');
    const baitCard = page.getByRole('button', { name: '在地图上查看白堤' });
    await baitCard.click();
    await page.waitForFunction(() => {
      const [lng, lat] = window.__mapTest.maps[0].center;
      return Math.abs(lng - 120.149189) < 0.000001 && Math.abs(lat - 30.255701) < 0.000001;
    });
    assert.equal(await brokenCard.getAttribute('aria-pressed'), 'false', '切换到另一张卡片后旧卡片应取消选中');
    assert.equal(await baitCard.getAttribute('aria-pressed'), 'true', '新点击的卡片应成为唯一选中项');
    state = await mapState();
    assert.doesNotMatch(state.items.find((item) => item.title === '断桥残雪')?.className || '', /\bselected\b/, '旧 Marker 应取消选中');
    assert.match(state.items.find((item) => item.title === '白堤')?.className || '', /\bselected\b/, '新地点 Marker 应显示选中');
    await page.evaluate(() => {
      const marker = window.__mapTest.maps[0].items.find((item) => item.kind === 'marker' && item.options?.title === '测试地点甲');
      marker.events.click();
    });
    await page.waitForFunction(() => document.querySelector('[data-place-id="poi:test-a"]')?.classList.contains('selected'));
    assert.equal(await page.locator('[data-place-id="poi:test-a"] button[aria-pressed]').getAttribute('aria-pressed'), 'true', '点击真实地点 Marker 后左侧收藏卡片同步选中');
    assert.equal(await baitCard.getAttribute('aria-pressed'), 'false', '点击地图 Marker 后示例卡片取消选中');
    await brokenCard.click();
    await page.waitForFunction(() => document.querySelector('[aria-label="在地图上查看断桥残雪"]')?.getAttribute('aria-pressed') === 'true');
    assert.ok(!(await mapState()).items.some((x) => x.text === '定位'), '地点聚焦只移动地图，不应额外绘制定位标记');
    assert.match(await page.locator('.map-panel-card').innerText(), /断桥残雪/);
    await page.locator('.map-panel-card').getByRole('button', { name: '收藏', exact: true }).click();
    await page.getByRole('status').getByText('已收藏到当前旅行。').waitFor();
    assert.ok(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).savedPlaces.includes('poi:broken'), KEY), '示例地点收藏后应写入收藏列表');
    assert.match(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).customPlaces['poi:broken'].gcj02, KEY), /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/);
    assert.match(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).customPlaces['poi:broken'].wgs84, KEY), /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/);
    await page.locator('.map-panel-card').getByRole('button', { name: '取消收藏', exact: true }).click();
    await page.getByRole('status').getByText(/已取消收藏/).waitFor();
    assert.equal(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).savedPlaces.includes('poi:broken'), KEY), false, '取消收藏移除左侧收藏但不删地点原始资料');
    await page.locator('.nav-item[data-section="days"]').click();

    await openMapMore();
    await page.getByRole('button', { name: '看行程' }).click();
    assert.deepEqual(await page.evaluate(() => window.__mapTest.maps[0].fitItems.map((item) => item.options.title)), ['测试地点甲', '测试地点乙'], '看行程只缩放到当天的行程地点，不包含未安排的收藏');
    await page.locator('.event').first().getByRole('button', { name: '↓ 下移' }).click();
    await page.waitForFunction(() => window.__mapTest.maps[0].items.some((x) => x.options?.title === '测试地点乙' && x.options?.content?.textContent === '1'));
    await page.getByRole('button', { name: '第 2 天', exact: true }).click();
    await page.waitForFunction(() => window.__mapTest.maps[0].items.some((x) => x.options?.title === '测试地点丙' && x.options?.content?.textContent === '1'));
    assert.deepEqual((await mapState()).items.filter((x) => x.text === '1').map((x) => x.title), ['测试地点丙'], '切换日期更新地图序号');

    const widthBefore = (await page.locator('.map-canvas').boundingBox()).width;
    const resizeBefore = await page.evaluate(() => window.__mapTest.maps[0].resizeCount || 0);
    await page.getByRole('separator', { name: '调整规划区和地图宽度' }).focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction((width) => document.querySelector('.map-canvas').getBoundingClientRect().width < width, widthBefore);
    await page.waitForFunction((count) => (window.__mapTest.maps[0].resizeCount || 0) > count, resizeBefore);
    await page.getByRole('button', { name: /收起地图/ }).click();
    await page.getByRole('button', { name: /展开地图/ }).click();
    await page.locator('.map-actions').waitFor({ state: 'visible' });

    await page.getByRole('button', { name: '路况', exact: true }).click();
    assert.ok((await mapState()).items.some((x) => x.kind === 'traffic'));
    await page.getByRole('button', { name: '路况', exact: true }).click();
    assert.ok(!(await mapState()).items.some((x) => x.kind === 'traffic'));
    await page.getByRole('button', { name: '卫星', exact: true }).click();
    assert.ok((await mapState()).items.some((x) => x.kind === 'satellite'));
    await page.getByRole('button', { name: '卫星', exact: true }).click();

    await page.getByRole('button', { name: '测距', exact: true }).click();
    await page.evaluate(() => {
      const fire = window.__mapTest.maps[0].events.click;
      for (const [lng, lat] of [[120.1, 30.2], [120.11, 30.2]]) fire({ lnglat: { getLng: () => lng, getLat: () => lat } });
    });
    await page.locator('.measure-bar').getByText(/\d+\.\d+ 公里|\d+ 米/).waitFor();
    assert.equal((await mapState()).items.filter((x) => x.kind === 'polyline').length, 1, '测距应画出线段');
    await page.locator('.measure-bar').getByRole('button', { name: '清除' }).click();
    assert.equal((await mapState()).items.filter((x) => x.kind === 'polyline').length, 0, '清除测距应移除线段');
    await page.getByRole('button', { name: '结束测距' }).click();

    await search('乙');
    await page.getByRole('button', { name: /搜索地点2/ }).click();
    await page.getByRole('button', { name: '设为起点' }).click();
    await search('新地点');
    await page.getByRole('button', { name: /搜索地点4/ }).click();
    await page.getByRole('button', { name: '加入第 2 天' }).click();
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).plans[1].includes('poi:lookup-4'), KEY);
    assert.ok((await mapState()).items.some((x) => x.title === '搜索地点4' && x.text === '2'), '搜索地点入行程后应出现对应序号');
    await page.getByRole('button', { name: '去这里' }).click();
    await page.evaluate(() => {
      const marker = window.__mapTest.maps[0].items.find((item) => item.kind === 'marker' && item.options?.title === '测试地点丙');
      marker.events.click();
    });
    await page.getByRole('button', { name: '设为起点' }).click();
    await page.getByRole('button', { name: '查询路线' }).click();
    await page.getByTestId('route-option-0').waitFor();
    assert.match(await page.getByTestId('route-option-0').innerText(), /地铁1号线/, '公交卡片应显示实际返回的线路');
    assert.match(await page.getByTestId('route-option-0').innerText(), /起点站.*终点站/s, '公交卡片应显示上下车站');
    assert.match(await page.getByTestId('route-option-0').innerText(), /步行 0\.8 公里/, '公交卡片应显示接口实际步行距离');
    assert.deepEqual(await page.evaluate(() => { const { mode, origin, destination, waypoints, city, cityd } = window.__mapTest.routeRequests[0]; return { mode, origin, destination, waypoints, city, cityd }; }), { mode: 'transit', origin: [120.103, 30.203], destination: [120.104, 30.204], waypoints: [], city: '杭州', cityd: '3301' }, '起点城市未知时回退行程目的地，终点城市必须解析成数字代码');
    cityCodeFailure = true;
    await page.getByLabel('公交路线策略').selectOption('LEAST_WALK', { timeout: 1500 });
    assert.equal(await page.getByTestId('route-option-0').count(), 0, '变更公交策略应使旧结果失效');
    await page.getByRole('button', { name: '查询路线' }).click();
    await page.getByTestId('route-option-0').waitFor();
    assert.deepEqual(await page.evaluate(() => { const last = window.__mapTest.routeRequests.at(-1); return { policy: last.policy, city: last.city, cityd: last.cityd }; }), { policy: 304, city: '杭州', cityd: '' }, '应使用 JS API 的运行时策略常量；城市代码解析失败时省略 cityd，不传非法值');
    cityCodeFailure = false;
    await page.evaluate(() => { window.__mapTest.noSubway = window.AMap.TransferPolicy.NO_SUBWAY; delete window.AMap.TransferPolicy.NO_SUBWAY; });
    await page.getByLabel('公交路线策略').selectOption('NO_SUBWAY');
    const beforeMissingPolicy = await page.evaluate(() => window.__mapTest.routeRequests.length);
    await page.getByRole('button', { name: '查询路线' }).click();
    await page.getByRole('alert').getByText(/不支持所选路线策略/).waitFor();
    assert.equal(await page.evaluate(() => window.__mapTest.routeRequests.length), beforeMissingPolicy, '策略常量缺失时不得默默使用默认策略');
    await page.evaluate(() => { window.AMap.TransferPolicy.NO_SUBWAY = window.__mapTest.noSubway; });
    await page.getByLabel('公交路线策略').selectOption('LEAST_WALK');
    await page.getByLabel('公交出发日期').fill('2026-11-15');
    await page.getByRole('button', { name: '查询路线' }).click();
    await page.getByRole('alert').getByText(/同时填写公交出发日期和时间/).waitFor();
    await page.getByLabel('公交出发时间').fill('09:30');
    assert.equal(await page.getByTestId('route-option-0').count(), 0, '变更出发时间应使旧结果失效');
    await page.getByRole('button', { name: '查询路线' }).click();
    await page.getByTestId('route-option-0').waitFor();
    assert.deepEqual(await page.evaluate(() => window.__mapTest.routeRequests.at(-1).departure), { time: '09:30', date: '2026-11-15' });
    await page.evaluate(() => { window.__mapTest.leaveAt = window.AMap.Transfer.prototype.leaveAt; window.AMap.Transfer.prototype.leaveAt = undefined; });
    await page.getByRole('button', { name: '查询路线' }).click();
    await page.getByRole('alert').getByText(/不支持指定公交出发时间/).waitFor();
    await page.evaluate(() => { window.AMap.Transfer.prototype.leaveAt = window.__mapTest.leaveAt; });
    await page.getByLabel('公交出发日期').fill('');
    await page.getByLabel('公交出发时间').fill('');
    await page.getByRole('button', { name: '查询路线' }).click();
    await page.getByTestId('route-option-0').waitFor();
    assert.ok((await mapState()).items.some((x) => x.kind === 'polyline' && x.path?.length === 2), '应根据接口返回的真实几何绘制路线');
    assert.ok((await mapState()).items.filter((x) => x.kind === 'polyline' && !x.extData?.savedRouteId).every((x) => x.showDir === true && x.dirColor === '#ffffff'), '路线折线应显示白色方向箭头');
    await page.getByTestId('route-expand-0').click();
    assert.equal(await page.getByTestId('route-expand-0').getAttribute('aria-expanded'), 'true', '方案箭头应展开当前方案详情');
    await page.getByTestId('route-details-0').getByText('乘地铁', { exact: true }).waitFor();
    await page.getByTestId('route-expand-1').click();
    assert.equal(await page.getByTestId('route-option-1').getAttribute('aria-pressed'), 'true', '展开第二方案应同时选中对应路线');
    assert.equal(await page.getByTestId('route-details-0').count(), 0, '展开另一方案时应关闭旧详情');
    await page.getByTestId('route-details-1').getByText('乘公交', { exact: true }).waitFor();
    await page.getByTestId('route-expand-1').click();
    assert.equal(await page.getByTestId('route-details-1').count(), 0, '再次点击箭头应收起详情');
    await page.getByTestId('route-option-0').click();
    await page.getByRole('button', { name: '第 1 天', exact: true }).click();
    assert.equal(await page.getByTestId('route-option-0').count(), 0, '切换日程日期后旧路线必须失效');
    await page.getByRole('button', { name: '第 2 天', exact: true }).click();
    await page.getByRole('button', { name: '查询路线' }).click();
    await page.getByTestId('route-option-0').waitFor();
    await page.getByTestId('route-option-1').click({ timeout: 1500 });
    await page.getByRole('button', { name: /将选中方案加入第 2 天/ }).click();
    const second = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).dailyTiming[1].visits['poi:lookup-4'].route, KEY);
    assert.equal(second.durationSeconds, 1500, '保存的时长必须属于选中的第二条路线');
    await page.evaluate(() => {
      const line = window.__mapTest.maps[0].items.find((item) => item.kind === 'polyline' && item.options?.path?.length === 2);
      line.events.click();
    });
    assert.equal(await page.getByTestId('route-option-0').getAttribute('aria-pressed'), 'true', '点击地图线路应同步切换方案');
    await page.getByRole('button', { name: '将选中方案加入第 2 天' }).click();
    const savedRoute = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).dailyTiming[1].visits['poi:lookup-4'].route, KEY);
    assert.equal(savedRoute.fromPlaceId, 'poi:test-c');
    assert.equal(savedRoute.durationSeconds, 900);
    await page.getByRole('button', { name: '选择起点' }).click();
    await search('乙');
    await page.getByRole('button', { name: /搜索地点2/ }).click();
    await page.getByRole('button', { name: '查询路线' }).click();
    await page.getByTestId('route-option-0').waitFor();
    assert.deepEqual(await page.evaluate(() => { const last = window.__mapTest.routeRequests.at(-1); return { city: last.city, cityd: last.cityd }; }), { city: '杭州', cityd: '3301' }, '两端城市都确定时公交组件应收到数字城市代码');
    const timeRows = page.locator('.day-time-list li');
    await timeRows.nth(0).getByLabel('固定到达').fill('09:00');
    await timeRows.nth(0).getByLabel('停留（分钟）').fill('60');
    await timeRows.nth(1).getByLabel('停留（分钟）').fill('90');
    await timeRows.nth(1).getByLabel('停留（分钟）').press('Tab');
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).dailyTiming[1].visits['poi:lookup-4']?.stayMinutes === 90, KEY);
    await page.getByText('10:15', { exact: true }).waitFor();
    await page.getByText('11:45', { exact: true }).waitFor();
    await page.evaluate(() => {
      const badge = document.createElement('div');
      badge.textContent = '模拟地图验收截图：没有真实地图底图';
      Object.assign(badge.style, { position: 'fixed', bottom: '8px', right: '8px', zIndex: '99999', background: '#a22020', color: 'white', padding: '8px', fontSize: '14px' });
      document.body.append(badge);
    });
    await page.screenshot({ path: path.join(require('os').tmpdir(), 'next-map-route-mock-preview.png') });

    await openMapMore();
    await page.getByRole('button', { name: '收藏', exact: true }).click();
    assert.equal(await page.getByTestId('route-option-0').isVisible(), false, '切换到收藏面板时应隐藏路线详情');
    await openMapMore();
    await page.getByRole('button', { name: '路线', exact: true }).click();
    await page.getByTestId('route-option-0').waitFor();
    assert.equal((await mapState()).items.filter((x) => x.kind === 'polyline').length, 2, '返回路线面板应保留当前路线，不重复画线');

    await page.getByLabel('公交路线策略').selectOption('LEAST_TRANSFER');
    await page.waitForFunction(() => window.__mapTest.maps[0].items.some((item) => item.options?.extData?.savedRouteId === 'poi:lookup-4'), null, { timeout: 1500 });
    await page.evaluate(() => window.__mapTest.maps[0].items.find((item) => item.options?.extData?.savedRouteId === 'poi:lookup-4').events.click());
    assert.equal(await page.getByRole('button', { name: '地图查看至搜索地点4的路线' }).getAttribute('aria-pressed'), 'true', '未先点击左侧时，地图中已存路线也可直接选择');
    await page.getByRole('button', { name: '地图查看至搜索地点4的路线' }).click({ timeout: 1500 });
    await page.getByTestId('saved-route-detail').waitFor();
    assert.equal(await page.getByTestId('route-option-0').count(), 0, '查看已保存路线时应关闭当前路线草稿');
    let savedLines = (await mapState()).items.filter((x) => x.kind === 'polyline' && x.extData?.savedRouteId === 'poi:lookup-4');
    assert.ok(savedLines.length > 0, '已保存路线应使用快照几何绘制');
    assert.equal(await page.getByRole('button', { name: '地图查看至搜索地点4的路线' }).getAttribute('aria-pressed'), 'true');
    await page.locator('.event').first().getByRole('button', { name: /在地图查看/ }).click();
    await page.evaluate(() => {
      const line = window.__mapTest.maps[0].items.find((item) => item.kind === 'polyline' && item.options?.extData?.savedRouteId === 'poi:lookup-4');
      line.events.click();
    });
    assert.equal(await page.getByRole('button', { name: '地图查看至搜索地点4的路线' }).getAttribute('aria-pressed'), 'true', '点击地图路线应同步选择左侧交通段');

    await openMapMore();
    await page.getByRole('button', { name: '路线', exact: true }).click();
    await page.getByRole('button', { name: '驾车路线', exact: true }).click();
    assert.equal(await page.getByLabel('路线出行方式').inputValue(), 'driving', '路线顶部的驾车按钮应切换实际查询方式');
    assert.equal(await page.getByRole('button', { name: '驾车路线', exact: true }).getAttribute('aria-pressed'), 'true', '当前出行方式应有选中状态');
    await page.getByLabel('路线出行方式').selectOption('driving');
    await page.getByLabel('驾车路线策略').selectOption('REAL_TRAFFIC');
    await page.evaluate(() => window.__mapTest.maps[0].events.rightclick({
      pixel: { x: 490, y: 310 },
      lnglat: { getLng: () => 120.112, getLat: () => 30.222 },
    }));
    await page.getByTestId('map-context-waypoint').click();
    await page.getByRole('button', { name: '查询路线' }).click();
    await page.getByTestId('route-option-0').waitFor();
    assert.equal(await page.evaluate(() => window.__mapTest.routeRequests.at(-1).policy), 204, '驾车应使用 JS API 对应常量');
    assert.deepEqual(await page.evaluate(() => window.__mapTest.routeRequests.at(-1).waypoints), [[120.112, 30.222]], '驾车途经点应采用右键固定坐标');
    assert.match(await page.getByTestId('route-option-0').innerText(), /红绿灯 5 个/, '驾车卡片应展示接口返回的红绿灯数');
    assert.match(await page.getByTestId('route-option-0').innerText(), /途经：环城北路 · 文一路/, '驾车卡片应展示接口返回的途经道路');
    await page.getByRole('button', { name: '移除途经点' }).click();

    await page.getByLabel('路线出行方式').selectOption('bicycling');
    assert.equal((await mapState()).items.filter((x) => x.kind === 'polyline' && !x.extData?.savedRouteId).length, 0, '切换出行方式应清除旧路线草稿');
    assert.equal(await page.getByTestId('route-option-0').count(), 0);
    await page.getByRole('button', { name: '查询路线' }).click();
    await page.getByTestId('route-option-0').waitFor();
    assert.equal(await page.evaluate(() => window.__mapTest.routeRequests.at(-1).mode), 'bicycling', '骑行应使用高德官方 Riding 组件');
    await page.getByTestId('route-expand-0').click();
    await page.getByTestId('route-details-0').getByText('沿骑行道路行驶').waitFor();
    assert.ok((await mapState()).items.some((x) => x.kind === 'polyline' && x.path?.length === 2), '骑行 rides 路段应绘制');
    await page.getByRole('button', { name: '交换起终点' }).click();
    assert.equal((await mapState()).items.filter((x) => x.kind === 'polyline' && !x.extData?.savedRouteId).length, 0, '交换起终点应清除旧路线草稿');
    assert.match(await page.locator('.map-panel-card').innerText(), /起点：搜索地点4/);
    assert.match(await page.locator('.map-panel-card').innerText(), /终点：搜索地点2/);

    await page.evaluate(() => { window.__mapTest.holdRoute = true; });
    const requestCount = await page.evaluate(() => window.__mapTest.routeRequests.length);
    await page.getByRole('button', { name: '查询路线' }).click();
    await page.waitForFunction((count) => window.__mapTest.routeRequests.length > count, requestCount);
    await page.getByLabel('路线出行方式').selectOption('walking');
    await page.evaluate(() => {
      window.__mapTest.holdRoute = false;
      window.__mapTest.pendingRoutes.splice(0).forEach((complete) => complete());
    });
    await page.waitForTimeout(100);
    assert.equal(await page.getByTestId('route-option-0').count(), 0, '切换方式后过期响应不能恢复旧路线面板');
    assert.equal((await mapState()).items.filter((x) => x.kind === 'polyline' && !x.extData?.savedRouteId).length, 0, '过期响应不能重新画线');

    await page.evaluate(() => { window.__mapTest.holdRoute = true; });
    const beforeDateRequest = await page.evaluate(() => window.__mapTest.routeRequests.length);
    await page.getByRole('button', { name: '查询路线' }).click();
    await page.waitForFunction((count) => window.__mapTest.routeRequests.length > count, beforeDateRequest);
    await page.getByRole('button', { name: '第 1 天', exact: true }).click();
    await page.evaluate(() => {
      window.__mapTest.holdRoute = false;
      window.__mapTest.pendingRoutes.splice(0).forEach((complete) => complete());
    });
    await page.waitForTimeout(100);
    assert.equal(await page.getByTestId('route-option-0').count(), 0, '切换日期后旧响应不得进入新日期');
    assert.equal((await mapState()).items.filter((x) => x.kind === 'polyline').length, 0, '旧响应不得恢复地图线路');
    await page.getByRole('button', { name: '第 2 天', exact: true }).click();

    await page.evaluate(() => { window.__mapTest.partialGeometry = true; });
    await page.getByRole('button', { name: '查询路线' }).click();
    await page.getByTestId('route-option-0').waitFor();
    await page.getByText(/部分路线坐标缺失/).waitFor({ timeout: 1500 });
    const routeLines = (await mapState()).items.filter((x) => x.kind === 'polyline');
    assert.equal(routeLines.length, 3, '无效坐标应断开两侧有效线段，不能连成跨越缺失点的假路线');
    assert.ok(routeLines.every((line) => line.path.every((point) => point[0] !== 0 || point[1] !== 0)), '空坐标不能转换成零点');
    await page.evaluate(() => { window.__mapTest.partialGeometry = false; });
    await page.getByLabel('路线出行方式').selectOption('driving');

    await page.evaluate(() => { window.__mapTest.routeFailure = true; });
    await page.getByRole('button', { name: '查询路线' }).click();
    await page.getByRole('alert').getByText(/高德路线查询失败/).waitFor();
    assert.equal((await mapState()).items.filter((x) => x.kind === 'polyline' && !x.extData?.savedRouteId).length, 0, '路线失败时不能保留旧草稿线');
    searchFailure = true;
    await search('失败');
    await page.getByRole('alert').getByText('模拟地点查询失败').waitFor();
    assert.equal(await page.locator('.map-panel-card .place-row').count(), 0, '地点搜索失败后不能显示旧搜索结果');
    await page.reload();
    await page.locator('.map-actions').waitFor();
    assert.ok((await mapState()).items.some((x) => x.title === '搜索地点4' && x.text === '2'), '刷新后从当前旅行恢复标记');
    assert.equal((await mapState()).items.filter((x) => x.kind === 'polyline' && x.extData?.savedRouteId === 'poi:lookup-4').length, 1, '刷新后应按保存快照重绘路线且不重复');
    await page.getByRole('button', { name: /收起地图/ }).click();
    await page.getByRole('button', { name: /展开地图/ }).click();
    await page.locator('.map-actions').waitFor({ state: 'visible' });
    assert.equal((await mapState()).items.filter((x) => x.kind === 'polyline' && x.extData?.savedRouteId === 'poi:lookup-4').length, 1, '地图收起再展开不应产生重复路线覆盖物');
    configEnabled = false;
    await page.reload();
    await page.getByRole('status').getByText(/请在接口设置中填写/).waitFor();
    configEnabled = true;
    await page.evaluate(() => sessionStorage.setItem('mock-map-no-complete', '1'));
    await page.reload();
    await page.locator('.map-loading').getByText(/地图未能完成加载/).waitFor({ timeout: 16000 });
    assert.equal(await page.locator('.map-actions').count(), 0, '未完成加载时不能显示地图工具为可用');
    assert.ok(await page.evaluate(() => window.__mapTest.maps[0].destroyed), '地图超时后应释放地图实例');
    await page.evaluate(() => sessionStorage.removeItem('mock-map-no-complete'));
    await page.locator('.map-loading').getByRole('button', { name: '重新加载' }).click();
    await page.locator('.map-actions').waitFor();
    assert.deepEqual(errors, [], '页面不应抛出未捕获异常');
    console.log('PASS 独立模拟地图：地图就绪与超时重试、GCJ-02 标记、行程联动、分栏、测距、路线及错误处理');
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
