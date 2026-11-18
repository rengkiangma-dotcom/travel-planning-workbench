// 高德路线箭头实网验收；独立浏览器和临时行程，不使用真实备份。
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const out=path.join(__dirname,'amap-route-arrows-live-20261116');
const key='xingjian-lvji-preview-v1';
const seed={version:1,tripId:'isolated-route-arrows',started:true,entryMode:'new',section:'days',mapOpen:true,day:0,origin:'杭州',destination:'杭州',start:'2026-11-16',days:1,people:1,rooms:1,budget:1000,plans:[[]],customPlaces:{},savedPlaces:[],wishPlaces:[],dailyRoutes:{},dailyTiming:{},messages:[],undo:[]};
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:'C:/Users/LENOVO/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1600,height:1000}});
  await context.addInitScript(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:seed});
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin==='http://127.0.0.1:18647'&&(u.pathname.startsWith('/api/backup/')||u.pathname==='/api/providers/config'))return route.abort('blockedbyclient');return route.continue();});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(25000);
  async function search(term, action){await page.getByLabel('搜索地图地点').fill(term);await page.locator('.map-search').getByRole('button',{name:'搜索',exact:true}).click();const results=page.locator('.map-panel-card .place-row');await results.first().waitFor({timeout:30000});const matched=results.filter({hasText:term}).first();await (await matched.count()?matched:results.first()).click();await page.getByRole('button',{name:action,exact:true}).click();}
  try{
    await page.goto('http://127.0.0.1:18647/next/');await page.locator('.map-actions').waitFor({timeout:35000});
    await search('民心路','设为起点');await search('杭州市信访局','去这里');
    const results=[];
    for(const [mode,label] of [['driving','驾车'],['transit','公交'],['walking','步行']]){
      await page.getByLabel('路线出行方式').selectOption(mode);await page.getByRole('button',{name:'查询路线'}).click();
      await page.getByTestId('route-option-0').waitFor({timeout:45000});await page.waitForTimeout(1800);
      const count=await page.locator('.route-choice').count();
      await page.screenshot({path:path.join(out,`${label}-路线.png`)});
      const target=mode==='transit'&&count>1?1:0;
      const expand=page.getByTestId(`route-expand-${target}`);
      if(await expand.getAttribute('aria-expanded')!=='true')await expand.click();
      assert.equal(await expand.getAttribute('aria-expanded'),'true',`${label}详情应展开`);
      assert.equal(await page.getByTestId(`route-option-${target}`).getAttribute('aria-pressed'),'true',`${label}展开方案应被选中`);
      const details=await page.getByTestId(`route-details-${target}`).innerText();
      await page.screenshot({path:path.join(out,`${label}-展开详情.png`)});
      results.push({mode,count,expanded:target+1,detailsPreview:details.slice(0,300)});
      await expand.click();assert.equal(await expand.getAttribute('aria-expanded'),'false');
    }
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'结果.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
  }finally{await context.close();await browser.close();}
})().catch(e=>{console.error('FAILED:',e.message);process.exitCode=1});
