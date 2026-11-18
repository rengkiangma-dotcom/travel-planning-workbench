// 高德地铁 API 最小实网探针：独立浏览器，屏蔽真实备份及配置写入；不记录密钥或完整请求 URL。
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const out = path.join(__dirname,'amap-subway-probe-20261116');
const key='xingjian-lvji-preview-v1';
const seed={version:1,tripId:'subway-probe',started:true,entryMode:'new',section:'days',mapOpen:true,day:0,origin:'青岛',destination:'青岛',start:'2026-11-16',days:1,people:1,rooms:1,budget:1000,plans:[[]],customPlaces:{},savedPlaces:[],wishPlaces:[],dailyRoutes:{},dailyTiming:{},messages:[],undo:[]};
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1600,height:1000}});
  await context.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:seed});
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin==='http://127.0.0.1:18647'&&(u.pathname.startsWith('/api/backup/')||u.pathname==='/api/providers/config'))return route.abort('blockedbyclient');return route.continue();});
  const page=await context.newPage();const requests=[];page.on('response',r=>{const u=new URL(r.url());if(/subway|subways/i.test(u.pathname))requests.push({host:u.host,path:u.pathname,status:r.status()});});
  try{
    await page.goto('http://127.0.0.1:18647/next/');await page.locator('.map-actions').waitFor({timeout:35000});
    const result=await page.evaluate(async()=>{
      const config=await fetch('/api/map/js-config').then(r=>r.json());
      if(!config.configured||!config.key)return {error:'地图配置未就绪'};
      const directList=await fetch('https://webapi.amap.com/subway/data/citylist.json').then(r=>r.json()).then(v=>({ok:true,keys:Object.keys(v||{}),firstChildKeys:Object.keys(Object.values(v||{})[0]||{}).slice(0,5)})).catch(e=>({ok:false,error:e.message}));
      const el=document.createElement('div');el.id='subway-probe';Object.assign(el.style,{position:'fixed',top:'5%',left:'42%',width:'55%',height:'90%',background:'#fff',zIndex:'100000',overflow:'hidden'});document.body.append(el);
      const loaded=await new Promise(resolve=>{const timer=setTimeout(()=>resolve('加载超时'),15000);window.subwayProbeReady=()=>{clearTimeout(timer);resolve('ready');};const s=document.createElement('script');s.src='https://webapi.amap.com/subway?v=1.0&key='+encodeURIComponent(config.key)+'&callback=subwayProbeReady';s.onerror=()=>{clearTimeout(timer);resolve('脚本加载失败');};document.head.append(s);});
      if(loaded!=='ready'||typeof window.subway!=='function')return {error:loaded,subwayType:typeof window.subway};
      let instance;try{instance=window.subway('subway-probe',{easy:1,adcode:3702});window.__subwayProbe=instance;}catch(e){return {error:'实例创建失败: '+e.message};}
      const cities=await new Promise(resolve=>{const timer=setTimeout(()=>resolve(null),12000);try{instance.getCityList(data=>{clearTimeout(timer);resolve(data);});}catch(e){clearTimeout(timer);resolve({error:e.message});}});
      const sample=cities&&typeof cities==='object'?Object.entries(cities).filter(([code,v])=>/青岛|北京|上海|杭州/.test(JSON.stringify(v))).slice(0,8):[];
      const qingdao=sample.find(([code,v])=>JSON.stringify(v).includes('青岛'));
      return {apiType:typeof window.subway,directList,cityCount:cities&&typeof cities==='object'?Object.keys(cities).length:0,citySample:sample,selected:qingdao?.[0]||null};
    });
    await page.waitForTimeout(10000);
    result.render=await page.locator('#subway-probe').evaluate(el=>{const svg=el.querySelector('svg');const rect=x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};return {text:(el.innerText||'').slice(0,200),svg:el.querySelectorAll('svg').length,canvas:el.querySelectorAll('canvas').length,images:el.querySelectorAll('img').length,htmlLength:el.innerHTML.length,hostStyle:el.getAttribute('style'),hostRect:rect(el),svgRect:svg?rect(svg):null,svgParent:svg?.parentElement?.outerHTML.slice(0,500),computed:{position:getComputedStyle(el).position,overflow:getComputedStyle(el).overflow}};}).catch(()=>null);
    result.requests=requests;
    await page.screenshot({path:path.join(out,'地铁接口探针.png')});
    await fs.writeFile(path.join(out,'结果.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(String(e.message));process.exitCode=1});
