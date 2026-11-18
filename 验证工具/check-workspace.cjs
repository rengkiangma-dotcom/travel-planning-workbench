// 旧版三栏布局验收（2026-11-10）：依赖 .rail 可见、.studio-dock、[data-studio-day]、「已有行程」旧标签，当前界面已改为左侧编辑/对话 + 右侧完整地图，本脚本不对应当前页面，不要当作回归基线。现行替代：check-entry-map.cjs、check-compact-scroll.cjs、check-review-plan.cjs、check-map-*.cjs。
process.env.TEMP='E:/旅游规划工作台制作/验证工具/tmp';process.env.TMP=process.env.TEMP;
const {chromium}=require('playwright');const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--disable-gpu']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1}),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const out=path.resolve(__dirname,'../旅迹风格预览/验收');await fs.mkdir(out,{recursive:true});
 try{
 await page.goto('http://127.0.0.1:18647/');
 await page.getByRole('button',{name:'已经有安排 保留原文，继续完善'}).click();
 const original='11 月 14 日已买高铁到杭州，第二天上午预约不能改动。';
 await page.getByLabel('已有行程',{exact:true}).fill(original);await page.getByLabel('行程名称').fill('杭州 · 沿湖慢慢走');
 await page.getByRole('button',{name:'保留安排，创建旅行工作台',exact:false}).click();
 await page.getByRole('button',{name:'载入杭州示例',exact:true}).click();await page.locator('#dialog-confirm').click();
 assert.equal(await page.locator('.studio-dock').isVisible(),true);assert.equal(await page.locator('#map-panel').isVisible(),false);assert.equal(await page.locator('.assistant-welcome').isVisible(),true);
 const geometry=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};};return{rail:rect('.rail'),editor:rect('.planning'),dock:rect('.studio-dock'),overflow:document.documentElement.scrollWidth>innerWidth,bodyOverflow:document.documentElement.scrollHeight>innerHeight+1};});
 assert.equal(geometry.overflow,false);assert.equal(geometry.bodyOverflow,false);assert.ok(geometry.rail.x<geometry.editor.x&&geometry.editor.x<geometry.dock.x);
 await page.waitForFunction(()=>!document.querySelector('#toast').classList.contains('show'));
 await page.screenshot({path:path.join(out,'工作台-聊天.png'),fullPage:true});
 await page.locator('[data-studio-day="1"]').click();await page.waitForFunction(()=>document.querySelector('#trip-title').textContent.startsWith('第 2 天'));assert.equal(await page.locator('#panel .event').count(),2);
 await page.locator('#dock-map-toggle').click();await page.waitForFunction(()=>document.querySelector('#map-route-label').textContent==='灵隐寺一带 → 龙井村');
 assert.equal(await page.locator('#chat-form').isVisible(),true);assert.equal(await page.locator('#map-panel').isVisible(),true);
 await page.locator('#quick-place').selectOption('leifeng');await page.getByRole('button',{name:'添加',exact:true}).click();
 assert.equal(await page.locator('#panel .event').count(),3);assert.match(await page.locator('[data-studio-day="1"]').textContent(),/3 个已安排地点/);
 await page.getByRole('button',{name:'↶ 撤销',exact:true}).click();assert.equal(await page.locator('#panel .event').count(),2);
 await page.locator('.nav-item[data-section="stay"]').click();await page.locator('[data-hotel="metro"]').click();assert.match(await page.locator('.fixed-summary').textContent(),/地铁 1 \/ 3 号线周边/);
 await page.locator('.nav-item[data-section="traffic"]').click();await page.locator('[data-transport="rail"]').click();assert.match(await page.locator('.side-metric').textContent(),/1,606/);
 await page.locator('#chat-input').fill('保留上午预约，其他时间尽量松弛。');await page.getByRole('button',{name:'发送想法',exact:true}).click();assert.match(await page.locator('#chat-log').textContent(),/已把这段话保存/);
 await page.locator('[data-studio-day="0"]').click();
 await page.waitForFunction(()=>{const tiles=[...document.querySelectorAll('.leaflet-tile-current')];return tiles.length>0&&tiles.every(i=>i.complete&&i.naturalWidth>0&&parseFloat(getComputedStyle(i).opacity)>.99);},{},{timeout:20000}).catch(()=>{});
 await page.waitForFunction(()=>!document.querySelector('#toast').classList.contains('show'));
 await page.screenshot({path:path.join(out,'工作台-地图与聊天.png'),fullPage:true});
 await page.reload();assert.equal(await page.locator('#map-panel').isVisible(),true);assert.match(await page.locator('#chat-log').textContent(),/保留上午预约/);
 await page.locator('.nav-item[data-section="original"]').click();assert.equal(await page.locator('.original-text').textContent(),original);
 await page.locator('#dock-map-toggle').click();assert.equal(await page.locator('#map-panel').isVisible(),false);assert.equal(await page.locator('#chat-form').isVisible(),true);
 await page.setViewportSize({width:1280,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
 const report={date:'2026-11-10',geometry,checks:['桌面左侧旅程/中间编辑/右侧助手三栏','页面无横向或整体纵向溢出，编辑区独立滚动','日期侧栏切换与地点计数','地图初始隐藏、打开时聊天仍可用、收起后聊天保持','新增地点与撤销','住宿交通摘要和费用1606元','自由聊天存为备注并刷新恢复','原始行程未改写','1280像素宽度无横向溢出'],pageErrors:errors};await fs.writeFile(path.join(out,'工作台验证记录.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
