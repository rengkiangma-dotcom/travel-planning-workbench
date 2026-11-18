// 当前路线界面截图：独立浏览器和临时行程，禁止访问真实备份或写入接口配置。
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const out=path.join(__dirname,'amap-current-route-screens-20261116');
const key='xingjian-lvji-preview-v1';
const seed={version:1,tripId:'current-route-screens',started:true,entryMode:'new',section:'days',mapOpen:true,day:0,origin:'青岛',destination:'青岛',start:'2026-11-16',days:1,people:1,rooms:1,budget:1000,plans:[[]],customPlaces:{},savedPlaces:[],wishPlaces:[],dailyRoutes:{},dailyTiming:{},messages:[],undo:[]};
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1600,height:1000}});
  await context.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:seed});
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin==='http://127.0.0.1:18647'&&(u.pathname.startsWith('/api/backup/')||u.pathname==='/api/providers/config'))return route.abort('blockedbyclient');return route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(20000);
  async function searchPlace(term,action){await page.getByLabel('搜索地图地点').fill(term);await page.locator('.map-search').getByRole('button',{name:'搜索',exact:true}).click();const row=page.locator('.map-panel-card .place-row').filter({hasText:term}).first();await row.waitFor({timeout:30000});await row.click();await page.getByRole('button',{name:action,exact:true}).click();}
  const results=[];
  try{
    await page.goto('http://127.0.0.1:18647/next/');await page.locator('.map-actions').waitFor({timeout:35000});
    await searchPlace('青岛北站','设为起点');await searchPlace('青岛市植物园','去这里');
    for(const [mode,label] of [['driving','驾车'],['transit','公交'],['walking','步行']]){
      await page.getByLabel('路线出行方式').selectOption(mode);await page.getByRole('button',{name:'查询路线',exact:true}).click();
      await page.waitForFunction(()=>Boolean(document.querySelector('.route-status')?.textContent||document.querySelector('.route-panel [role="alert"]')?.textContent),null,{timeout:45000});
      const count=await page.locator('.route-choice').count();const status=await page.locator('.route-status').innerText().catch(()=> '');const error=await page.locator('.route-panel [role="alert"]').innerText().catch(()=> '');
      await page.waitForTimeout(1500);await page.screenshot({path:path.join(out,label+'.png')});
      results.push({mode,label,status,count,error});
    }
    await fs.writeFile(path.join(out,'记录.json'),JSON.stringify({viewport:{width:1600,height:1000},origin:'青岛北站',destination:'青岛市植物园',results},null,2));console.log(JSON.stringify(results));
  }finally{await context.close();await browser.close();}
})().catch(e=>{console.error('FAILED:',e.message);process.exitCode=1});
