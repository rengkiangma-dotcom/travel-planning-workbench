const { chromium } = require('playwright');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({headless:true,executablePath:'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context = await browser.newContext({viewport:{width:1600,height:1000}});
  await context.addInitScript(() => localStorage.setItem('xingjian-lvji-preview-v1',JSON.stringify({version:1,tripId:'isolated-arrow-diagnostic',started:true,entryMode:'new',section:'days',mapOpen:true,day:0,origin:'杭州',destination:'杭州',start:'2026-11-16',days:1,people:1,rooms:1,budget:1000,plans:[[]],customPlaces:{},savedPlaces:[],wishPlaces:[],dailyRoutes:{},dailyTiming:{},messages:[],undo:[]})));
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:18647' && (url.pathname.startsWith('/api/backup/') || url.pathname === '/api/providers/config')) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:18647/next/');
  await page.waitForFunction(() => window.AMap?.Map, null, {timeout:30000});
  await page.evaluate(() => {
    document.body.innerHTML = '<div id="map2d" style="position:absolute;left:0;top:0;width:800px;height:1000px"></div><div id="map3d" style="position:absolute;left:800px;top:0;width:800px;height:1000px"></div>';
    for (const mode of ['2D','3D']) {
      const map = new AMap.Map(`map${mode.toLowerCase()}`, { viewMode:mode, center:[120.20,30.25], zoom:14 });
      const canvas = document.createElement('canvas'); canvas.width=24;canvas.height=24;
      const ctx=canvas.getContext('2d');ctx.strokeStyle='white';ctx.lineWidth=5;ctx.lineJoin='round';ctx.moveTo(2,20);ctx.lineTo(12,4);ctx.lineTo(22,20);ctx.stroke();
      for (const [i,extra] of [{},{dirColor:'#ffffff'},{dirImg:canvas}].entries()) {
        const lat=30.26-i*.01;
        const line=new AMap.Polyline({path:[[120.18,lat],[120.22,lat]],strokeColor:'#1687ed',strokeWeight:10,showDir:true,...extra});map.add(line);
      }
    }
  });
  await page.waitForTimeout(5000);
  await page.screenshot({path:path.join(__dirname,'amap-route-arrows-live-20261116','SDK箭头诊断.png')});
  await browser.close();
})().catch(e => { console.error(e); process.exitCode=1; });
