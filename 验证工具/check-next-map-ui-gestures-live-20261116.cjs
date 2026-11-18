// 实网地图操作：独立浏览器、临时行程；屏蔽备份和提供商配置接口。
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const out = path.join(__dirname, process.env.AMAP_CAPTURE_DIR || 'amap-workbench-ui-live-20261116');
const key = 'xingjian-lvji-preview-v1';
const seed = { version:1, tripId:'isolated-map-gestures', started:true, entryMode:'new', section:'days', mapOpen:true, day:0, origin:'青岛', destination:'青岛', start:'2026-11-16', days:1, people:1, rooms:1, budget:1000, plans:[[]], customPlaces:{}, savedPlaces:[], wishPlaces:[], dailyRoutes:{}, dailyTiming:{}, messages:[], undo:[] };
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.AMAP_BROWSER_PATH || 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1600,height:1000}});
  await context.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:seed});
  await context.addInitScript(()=>{
    const original=Element.prototype.append;
    Element.prototype.append=function(...nodes){
      for(const node of nodes){
        if(node.tagName==='SCRIPT'&&node.src.startsWith('https://webapi.amap.com/maps?')){
          const onload=node.onload;
          node.onload=function(event){
            const MapClass=window.AMap?.Map;
            if(MapClass){window.AMap.Map=class extends MapClass {constructor(...args){super(...args);window.__mapProbe=this;}};}
            if(onload)return onload.call(this,event);
          };
        }
      }
      return original.apply(this,nodes);
    };
  });
  await context.route('**/*', async route=>{const u=new URL(route.request().url()); if(u.origin==='http://127.0.0.1:18647'&&(u.pathname.startsWith('/api/backup/')||u.pathname==='/api/providers/config')) return route.abort('blockedbyclient');return route.continue();});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.goto('http://127.0.0.1:18647/next/');
    await page.locator('.map-actions').waitFor({timeout:35000});
    await page.waitForTimeout(7000);
    const map=page.locator('.map-canvas');const box=await map.boundingBox();
    assert.ok(box && await map.locator('canvas').count()>0,'真实地图 canvas 应存在');
    const before=await map.screenshot({path:path.join(out,'真实地图-拖动前.png')});
    await page.mouse.move(box.x+box.width*.62,box.y+box.height*.45);await page.mouse.down();await page.mouse.move(box.x+box.width*.75,box.y+box.height*.52,{steps:12});await page.mouse.up();
    await page.waitForTimeout(3000);
    const after=await map.screenshot({path:path.join(out,'真实地图-拖动后.png')});
    const hash=x=>createHash('sha256').update(x).digest('hex');
    assert.notEqual(hash(before),hash(after),'拖动前后地图截图应变化');
    const point={x:box.x+box.width*.6,y:box.y+box.height*.4};
    const wheelTarget=await page.evaluate(({x,y})=>{const target=document.elementFromPoint(x,y);window.__wheelTest=[];document.addEventListener('wheel',e=>window.__wheelTest.push({deltaY:e.deltaY,target:e.target?.className}),{capture:true});return {tag:target?.tagName,className:target?.className};},point);
    const zoomBefore=await page.evaluate(()=>({zoom:window.__mapProbe?.getZoom(),status:window.__mapProbe?.getStatus?.()}));
    await page.mouse.move(point.x,point.y);await page.mouse.wheel(0,-450);
    await page.waitForTimeout(2500);
    const zoomed=await map.screenshot({path:path.join(out,'真实地图-缩放后.png')});
    const wheelChanged=hash(after)!==hash(zoomed);
    if(!wheelChanged) console.log('滚轮诊断',JSON.stringify({wheelTarget,zoomBefore,zoomAfter:await page.evaluate(()=>window.__mapProbe?.getZoom()),events:await page.evaluate(()=>window.__wheelTest),zoomControls:await page.evaluate(()=>Array.from(document.querySelectorAll('[class*=zoom]')).slice(0,10).map(e=>({tag:e.tagName,className:e.className,title:e.getAttribute('title'),text:e.textContent?.slice(0,25)})))}));
    await page.locator('.amap-ctrl-zoomin').click();
    await page.waitForTimeout(2500);
    const buttonZoomed=await map.screenshot({path:path.join(out,'真实地图-点击放大.png')});
    assert.notEqual(hash(zoomed),hash(buttonZoomed),'点击放大按钮后地图截图应变化');
    await page.mouse.click(box.x+box.width*.65,box.y+box.height*.55,{button:'right'});
    await page.getByTestId('map-context-origin').waitFor({state:'visible'});
    await page.screenshot({path:path.join(out,'真实地图-右键菜单.png')});
    await page.getByTestId('map-context-origin').click();
    assert.match(await page.locator('.map-panel-card').innerText(),/起点：地图选点/);
    await page.getByLabel('搜索地图地点').fill('青岛北站');
    await page.locator('.map-search').getByRole('button',{name:'搜索',exact:true}).click();
    await page.locator('.map-panel-card .place-row').first().waitFor({state:'visible',timeout:25000});
    await page.locator('.map-panel-card .place-row').first().click();
    await page.locator('.detail-panel').waitFor({state:'visible'});
    await page.waitForTimeout(1500);
    await page.screenshot({path:path.join(out,'真实地图-地点详情.png')});
    assert.match(await page.locator('.detail-panel').innerText(),/青岛北站/);
    const hit={x:box.width*.70,y:box.height*.48};
    const expectedCenter=await page.evaluate(p=>{const q=window.__mapProbe.containerToLngLat(new window.AMap.Pixel(p.x,p.y));return [q.getLng(),q.getLat()];},hit);
    await page.mouse.click(box.x+hit.x,box.y+hit.y,{button:'right'});
    await page.getByTestId('map-context-center').click();
    await page.waitForTimeout(1200);
    const centered=await page.evaluate(()=>{const q=window.__mapProbe.getCenter();return [q.getLng(),q.getLat()];});
    assert.ok(Math.abs(centered[0]-expectedCenter[0])<0.0001&&Math.abs(centered[1]-expectedCenter[1])<0.0001,'地图中心应移动到右键经纬度');
    await page.mouse.click(box.x+hit.x,box.y+hit.y,{button:'right'});
    await page.getByTestId('map-context-where').click();
    await page.waitForFunction(()=>document.querySelector('.detail-panel')?.innerText.includes('地图位置')||document.querySelector('.map-notice')?.innerText.includes('逆地理查询失败'),null,{timeout:20000});
    const whereResult=await page.locator('.map-panel-card').innerText();
    assert.match(whereResult,/地图位置/,'逆地理应成功返回地址，而不是只保留坐标');
    await page.mouse.click(box.x+hit.x,box.y+hit.y,{button:'right'});
    await page.getByTestId('map-context-nearby').click();
    await page.waitForFunction(()=>document.querySelector('.map-panel-card .place-row')||document.querySelector('.map-panel-card [role="alert"]'),null,{timeout:20000});
    const nearbyCount=await page.locator('.map-panel-card .place-row').count();
    assert.ok(nearbyCount>0,`周边搜索未返回地点：${await page.locator('.map-panel-card').innerText()}`);
    console.log('PASS 实网右键居中坐标、逆地理与周边搜索',JSON.stringify({nearbyCount}));
    if(!wheelChanged){
      await page.evaluate(()=>new Promise(resolve=>{
        const el=document.createElement('div');el.id='standalone-amap-diagnostic';Object.assign(el.style,{position:'fixed',left:'100px',top:'100px',width:'400px',height:'400px',zIndex:'100000'});document.body.appendChild(el);
        window.__standaloneMap=new window.AMap.Map(el,{zoom:11,center:[120.38,36.07]});window.__standaloneMap.on('complete',resolve);setTimeout(resolve,7000);
      }));
      const standaloneBefore=await page.evaluate(()=>window.__standaloneMap.getZoom());
      await page.mouse.move(300,300);await page.mouse.wheel(0,-450);await page.waitForTimeout(2500);
      console.log('独立 SDK 滚轮对照',JSON.stringify({before:standaloneBefore,after:await page.evaluate(()=>window.__standaloneMap.getZoom())}));
      await page.evaluate(()=>{window.__standaloneMap.destroy();document.getElementById('standalone-amap-diagnostic').remove();});
    }
    assert.deepEqual(errors,[]);
    console.log(`PASS 真实地图拖动和放大按钮后截图变化；右键菜单可打开，位置可设为起点；搜索并打开地点详情；无页面异常。滚轮截图变化：${wheelChanged}`);
  } finally { await context.close();await browser.close(); }
})().catch(e=>{console.error(e.stack);process.exitCode=1});
