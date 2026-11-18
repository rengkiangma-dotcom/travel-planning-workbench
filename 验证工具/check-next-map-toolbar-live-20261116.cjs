// 单独浏览器与临时行程；只检查地图工具栏，不读取或写入真实备份。
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = path.join(__dirname, 'amap-toolbar-live-20261116');
const key = 'xingjian-lvji-preview-v1';
const seed = {version:1,tripId:'isolated-toolbar-check',started:true,entryMode:'new',section:'days',mapOpen:true,day:0,origin:'青岛',destination:'青岛',start:'2026-11-16',days:1,people:1,rooms:1,budget:1000,plans:[[]],customPlaces:{},savedPlaces:[],wishPlaces:[],dailyRoutes:{},dailyTiming:{},messages:[],undo:[]};
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1600,height:1000}});
  await context.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:seed});
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin==='http://127.0.0.1:18647'&&(u.pathname.startsWith('/api/backup/')||u.pathname==='/api/providers/config'))return route.abort('blockedbyclient');return route.continue();});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('http://127.0.0.1:18647/next/');await page.locator('.map-actions').waitFor({timeout:35000});await page.waitForTimeout(6000);
    const check=async(label)=>{
      const boxes=await page.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};return {toolbar:rect(document.querySelector('.map-actions')),map:rect(document.querySelector('.travel-map')),search:rect(document.querySelector('.map-search')),buttons:Array.from(document.querySelectorAll('.map-actions > button')).map(rect)};});
      assert.ok(boxes.toolbar.right<=boxes.map.right+1&&boxes.toolbar.left>=boxes.map.left-1,`${label}: 工具栏应在地图内`);
      assert.ok(boxes.buttons.every(x=>Math.abs(x.top-boxes.buttons[0].top)<1),`${label}: 按钮应保持同一行`);
      const overlap=boxes.toolbar.left<boxes.search.right&&boxes.toolbar.right>boxes.search.left&&boxes.toolbar.top<boxes.search.bottom&&boxes.toolbar.bottom>boxes.search.top;
      assert.equal(overlap,false,`${label}: 工具栏不能遮挡搜索框`);
    };
    await check('宽窗口');await page.screenshot({path:path.join(out,'工具栏-宽窗口.png')});
    await page.getByRole('button',{name:'卫星',exact:true}).click();assert.equal(await page.getByRole('button',{name:'卫星',exact:true}).getAttribute('aria-pressed'),'true');
    await page.waitForTimeout(3500);await page.screenshot({path:path.join(out,'工具栏-卫星图.png')});
    await page.getByRole('button',{name:'卫星',exact:true}).click();assert.equal(await page.getByRole('button',{name:'卫星',exact:true}).getAttribute('aria-pressed'),'false');
    await page.getByRole('button',{name:'路况',exact:true}).click();assert.equal(await page.getByRole('button',{name:'路况',exact:true}).getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:'路况',exact:true}).click();
    await page.getByRole('button',{name:'全屏',exact:true}).click();await page.waitForFunction(()=>document.fullscreenElement?.classList.contains('travel-map'));
    await page.getByRole('button',{name:'退出全屏',exact:true}).click();await page.waitForFunction(()=>!document.fullscreenElement);
    await page.getByRole('button',{name:'更多',exact:true}).click();await page.screenshot({path:path.join(out,'工具栏-更多菜单.png')});
    await page.getByRole('button',{name:'路线',exact:true}).click();assert.equal(await page.getByRole('button',{name:'驾车路线',exact:true}).isVisible(),true);
    await page.getByRole('button',{name:'关闭面板',exact:true}).click();
    await page.setViewportSize({width:1100,height:800});await page.waitForTimeout(1000);await check('窄窗口');await page.screenshot({path:path.join(out,'工具栏-窄窗口.png')});
    assert.deepEqual(errors,[]);console.log('PASS 实网地图工具栏：宽窄窗口布局、卫星/路况开关、全屏与更多菜单路线入口；地铁按钮禁用。');
  }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
