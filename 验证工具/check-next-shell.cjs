process.env.TEMP = 'E:/旅游规划工作台制作/验证工具/tmp';
process.env.TMP = process.env.TEMP;
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const BASE = 'http://127.0.0.1:18647/next/';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/rail/search', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"测试中暂停"}' }));

  try {
    await page.goto(BASE);
    await page.getByRole('button', { name: '还没有行程 从目的地与交通开始' }).click();
    await page.getByRole('button', { name: '创建旅行工作台', exact: false }).click();

    await page.waitForFunction(() => document.querySelector('#trip-title')?.textContent.includes('杭州'));
    assert.equal(await page.locator('.studio-dock .travel-map').isVisible(), true, '行程确定后新架构地图区默认展开');
    assert.equal(await page.locator('.nav-item[data-section]').count(), 5, '导航显示概览、交通、住宿、想去、每日安排五个面板');
    await page.locator('.nav-item[data-section="overview"]').click();
    assert.match(await page.locator('.compact-summary').innerText(), /600/, '2 人 3 天的餐饮预留应是 600');

    await page.locator('.nav-item[data-section="days"]').click();
    assert.match(await page.locator('#panel').innerText(), /这一天还留着空白|个地点/);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#trip-title')?.textContent.includes('杭州'));
    assert.equal(await page.getByRole('button', { name: '还没有行程 从目的地与交通开始' }).count(), 0, '刷新后不应回到入口页');

    await page.locator('#map-toggle').click();
    assert.equal(await page.locator('.studio-dock .travel-map').isVisible(), false);
    await page.locator('#map-toggle').click();
    assert.equal(await page.locator('.studio-dock .travel-map').isVisible(), true);

    await page.screenshot({ path: 'E:/旅游规划工作台制作/旅迹风格预览/验收/next-shell.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS 新架构外壳：建行程、默认展开地图、导航、刷新保留、地图开关');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
