// 仅诊断独立高德预览的官方组件，一次驾车查询，不打印密钥/完整 URL。
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const root = 'E:/旅游规划工作台制作/验证工具/tmp';
const base = 'http://127.0.0.1:18647';
const browserPath = 'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
(async()=>{
 await fs.mkdir(root,{recursive:true});process.env.TEMP=root;process.env.TMP=root;process.chdir(root);
 const browser=await chromium.launch({headless:true,executablePath:browserPath});
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();page.setDefaultTimeout(15000);
 if(process.argv.includes('--jsonp-mime')) await page.route('**/_AMapService/**',async route=>{const response=await route.fetch();const params=new URL(route.request().url()).searchParams;const headers={...response.headers()};if(params.has('callback'))headers['content-type']='application/javascript; charset=utf-8';await route.fulfill({response,headers});});
 const traffic=[];const errors=[];
 page.on('requestfailed',r=>{const u=new URL(r.url());if(u.hostname==='127.0.0.1'||u.hostname==='webapi.amap.com')traffic.push({event:'failed',path:u.pathname,reason:r.failure()?.errorText?.slice(0,70)});});
 page.on('response',async r=>{const u=new URL(r.url());if(!u.pathname.startsWith('/_AMapService/'))return;let result={event:'response',path:u.pathname,status:r.status(),contentType:r.headers()['content-type'],parameterNames:[...u.searchParams.keys()]};try{const raw=await r.text();const start=raw.indexOf('{'),end=raw.lastIndexOf('}');const j=JSON.parse(start>=0&&end>start?raw.slice(start,end+1):raw);result={...result,callbackName:u.searchParams.get('callback'),bodyLength:raw.length,bodyPrefix:raw.slice(0,80),bodySuffix:raw.slice(-45),bodyFormat:raw.trim().startsWith('{')?'json':raw.trim().startsWith('(')?'wrapped':'other',serviceStatus:j.status,info:String(j.info??'').slice(0,90),infocode:j.infocode,errcode:j.errcode,count:j.count,hasRoute:!!j.route,topKeys:Object.keys(j).slice(0,14),routeKeys:j.route?Object.keys(j.route).slice(0,14):[],pathCount:j.route?.paths?.length};}catch(e){result.bodyFormat='not-JSON-object';}traffic.push(result);});
 page.on('pageerror',e=>errors.push(String(e.message).split('?')[0].slice(0,160)));
 try{await page.goto(base+'/地图互动独立预览/?mode=live',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('真实地图已初始化'),null,{timeout:25000});
 await page.evaluate(()=>{const original=AMap.plugin;AMap.plugin=function(names,done){return original.call(this,names,()=>{const Ctor=AMap.Driving;const previous=Ctor?.prototype?.search;if(previous){Ctor.prototype.search=function(...args){const i=args.findLastIndex(a=>typeof a==='function');if(i>=0){const cb=args[i];args[i]=(s,r)=>{window.__amapCallback={status:s,type:Object.prototype.toString.call(r),value:typeof r==='string'?r.slice(0,120):undefined,keys:r&&typeof r==='object'?Object.keys(r).slice(0,18):[],message:String(r?.message??'').slice(0,100),info:String(r?.info??'').slice(0,100)};return cb(s,r);};}return previous.apply(this,args);};}done();});};});
 const modes=process.argv.includes('--all')?['driving','transit','walking','riding']:['driving'];const results=[];
 await page.locator('#engine').selectOption('official');
 for(const mode of modes){
   if(mode!=='driving')await page.getByTestId('mode-'+mode).click();
   await page.getByTestId('route-search').click();
   await page.waitForFunction(()=>/真实官方组件|查询失败|初始化失败|不可用/.test(document.querySelector('#status')?.textContent||''),null,{timeout:20000}).catch(()=>{});
   await page.waitForTimeout(500);
   const s=await page.locator('#status').innerText();
   results.push({mode,status:s,panelText:(await page.locator('#official-panel').innerText()).slice(0,220)});
   if(process.argv.includes('--jsonp-mime'))await page.screenshot({path:'E:/旅游规划工作台制作/验证工具/amap-live-preview/official-'+mode+'-mime-override.png',fullPage:true});
 }
 console.log(JSON.stringify({results,traffic,errors,callback:await page.evaluate(()=>window.__amapCallback??null)},null,2));
 }catch(e){console.log('diagnostic '+String(e.message).split('?')[0].slice(0,180));console.log(JSON.stringify({traffic,errors},null,2));process.exitCode=1;}
 finally{await context.close();await browser.close();}
})().catch(e=>{console.error(String(e.message).slice(0,180));process.exitCode=1});
