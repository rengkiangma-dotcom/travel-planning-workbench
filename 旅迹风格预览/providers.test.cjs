const {test}=require('node:test');const assert=require('node:assert/strict');const p=require('./providers.cjs');
test('长途列车以请求的上车日期为准，跨夜到达独立计算',()=>{const r=p.normalizeTrain({start_train_code:'K001',start_date:'2026-11-12',arrive_date:'2026-11-13',start_time:'23:30',arrive_time:'02:15',lishi:'02:45',from_station_telecode:'AAA',to_station_telecode:'BBB',prices:[{seat_name:'硬座',price:'0',num:'有'},{seat_name:'硬卧',price:null,num:'无'}]},'2026-11-14');assert.equal(r.date,'2026-11-14');assert.equal(r.arrivalDate,'2026-11-15');assert.equal(r.sourceTrainOriginDate,'2026-11-12');assert.equal(r.seats[0].price,0);assert.equal(r.seats[1].price,null);assert.equal(r.seats[1].available,false);});
test('报价缺失、空白字符串、数组及非数值不能转换成零元',()=>{for(const v of [null,'',' ','\t','\n',[],{},'未知'])assert.equal(p.numberOrNull(v),null);assert.equal(p.numberOrNull('0'),0);assert.equal(p.numberOrNull(0),0);assert.equal(p.numberOrNull('23.5'),23.5);});
test('限制查询组数，拒绝非法日期与超预售窗口',()=>{assert.throws(()=>p.railInput({origin:'上海',destination:'杭州',dates:['2026-02-30'],days:3}));assert.throws(()=>p.railInput({origin:'上海',destination:'杭州',dates:['2030-01-01'],days:3}));assert.throws(()=>p.railInput({origin:'上海',destination:'杭州',dates:[],days:3}));const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());assert.equal(p.railInput({origin:'上海',destination:'杭州',dates:[today],days:1}).dates.length,1);});
test('酒店POI的人均消费不冒充可订房价，提供底图转换坐标',()=>{const r=p.normalizePoi({id:'p',name:'酒店',location:'120.100000,30.200000',business:{cost:'188'}});assert.equal(r.referenceConsumption,188);assert.match(r.priceMeaning,/不是.*可订房价/);assert.equal(r.coordinateSystem,'GCJ-02');assert.notEqual(r.wgs84,r.gcj02);});
test('地点详情保留真实导航点、营业时间和照片，缺失或非法值保持未知',()=>{
  const r=p.normalizePoi({id:'B123',name:'公园',location:'120.100000,30.200000',cityname:'青岛市',citycode:'0532',adcode:'370200',business:{rating:'4.5',opentime_today:'08:30-17:30',opentime_week:'周一至周日开放'},navi:{entr_location:'120.101000,30.201000',exit_location:'120.102000,30.202000'},photos:[{title:'入口',url:'https://example.com/photo.jpg'}]});
  assert.equal(r.gcj02,'120.100000,30.200000');assert.equal(r.entranceGcj02,'120.101000,30.201000');assert.equal(r.exitGcj02,'120.102000,30.202000');
  assert.equal(r.city,'青岛市');assert.equal(r.citycode,'0532');assert.equal(r.adcode,'370200');
  assert.equal(r.openingHoursToday,'08:30-17:30');assert.equal(r.openingHoursWeek,'周一至周日开放');assert.deepEqual(r.photos,[{title:'入口',url:'https://example.com/photo.jpg'}]);
  const missing=p.normalizePoi({id:'B124',name:'位置',location:'',citycode:[],adcode:'not-valid',navi:{entr_location:'200,91',exit_location:[]},business:{opentime_today:[]},photos:[]});
  assert.equal(missing.gcj02,null);assert.equal(missing.wgs84,null);assert.equal(missing.entranceGcj02,null);assert.equal(missing.exitGcj02,null);assert.equal(missing.openingHoursToday,null);assert.deepEqual(missing.photos,[]);
  assert.equal(missing.citycode,'');assert.equal(missing.adcode,'');
});
test('按 POI ID 查询详情并申请扩展字段，不存在或非法 ID 明确报错',async()=>{
  const originalFetch=global.fetch,originalKey=process.env.AMAP_WEB_SERVICE_KEY;process.env.AMAP_WEB_SERVICE_KEY='test-key-for-unit-only';let calls=0;
  global.fetch=async u=>{calls++;assert.equal(u.pathname,'/v5/place/detail');assert.equal(u.searchParams.get('id'),'BTEST123');assert.equal(u.searchParams.get('show_fields'),'business,navi,photos');return{ok:true,json:async()=>({status:'1',pois:[{id:'BTEST123',name:'公园',location:'120.1,30.2',navi:{entr_location:'120.11,30.21'}}]})};};
  try{const r=await p.placeDetail({id:'poi:BTEST123'});assert.equal(r.poi.id,'BTEST123');assert.equal(r.poi.entranceGcj02,'120.11,30.21');assert.equal(calls,1);await assert.rejects(()=>p.placeDetail({id:'map:120.1,30.2'}),/POI/);await assert.rejects(()=>p.placeDetail({id:'A|B'}),/POI/);}
  finally{global.fetch=originalFetch;if(originalKey===undefined)delete process.env.AMAP_WEB_SERVICE_KEY;else process.env.AMAP_WEB_SERVICE_KEY=originalKey;}
});
test('地点搜索扩展字段及详情空结果保持原语义',async()=>{
  const originalFetch=global.fetch,originalKey=process.env.AMAP_WEB_SERVICE_KEY;process.env.AMAP_WEB_SERVICE_KEY='test-key-for-unit-only';
  global.fetch=async u=>{assert.equal(u.searchParams.get('show_fields'),'business,navi,photos');if(u.pathname==='/v5/place/text')return{ok:true,json:async()=>({status:'1',pois:[{id:'BSEARCH',name:'景点',location:'120.1,30.2',business:{rating:'4.5'},navi:{entr_location:'120.11,30.21'}}]})};assert.equal(u.pathname,'/v5/place/detail');return{ok:true,json:async()=>({status:'1',pois:[]})};};
  try{const result=await p.placeSearch({city:'测试城市',keywords:'字段验证'});assert.equal(result.city,'测试城市');assert.equal(result.pois[0].rating,'4.5');assert.equal(result.pois[0].entranceGcj02,'120.11,30.21');await assert.rejects(()=>p.placeDetail({id:'BNOTFOUND'}),e=>e.status===404&&e.message.includes('未找到'));}
  finally{global.fetch=originalFetch;if(originalKey===undefined)delete process.env.AMAP_WEB_SERVICE_KEY;else process.env.AMAP_WEB_SERVICE_KEY=originalKey;}
});
test('跨城公交分别解析城市、传日期策略并完整保留多方案和分段',async()=>{
  const originalFetch=global.fetch,originalKey=process.env.AMAP_WEB_SERVICE_KEY;process.env.AMAP_WEB_SERVICE_KEY='test-key-for-unit-only';const calls=[];
  global.fetch=async u=>{calls.push(u.pathname);if(u.pathname==='/v3/config/district'){const city=u.searchParams.get('keywords');return{ok:true,json:async()=>({status:'1',districts:[{name:city+'市',citycode:city==='青岛'?'0532':'0535'}]})};}assert.equal(u.pathname,'/v5/direction/transit/integrated');assert.equal(u.searchParams.get('city1'),'0532');assert.equal(u.searchParams.get('city2'),'0535');assert.equal(u.searchParams.get('strategy'),'3');assert.equal(u.searchParams.get('date'),'2026-11-20');assert.equal(u.searchParams.get('time'),'9-54');return{ok:true,json:async()=>({status:'1',route:{transits:Array.from({length:5},(_,i)=>({distance:'1200',cost:{duration:'900',transit_fee:'4'},segments:[{bus:{buslines:[{name:'公交'+i,departure_stop:{name:'站甲'},arrival_stop:{name:'站乙'},polyline:'120.1,36.1;120.2,36.2'}]}}]}))}})};};
  try{const r=await p.routeSearch({origin:'120.1,36.1',destination:'120.2,36.2',originCity:'青岛',destinationCity:'烟台',mode:'transit',strategy:'3',date:'2026-11-20',time:'09:54'});assert.equal(r.routes.length,5);assert.equal(r.routes[4].segments[0].bus.buslines[0].arrival_stop.name,'站乙');assert.equal(r.routes[4].transitFare,4);assert.equal(r.routes[4].polylines.length,1);assert.equal(calls.filter(x=>x==='/v3/config/district').length,2);}
  finally{global.fetch=originalFetch;if(originalKey===undefined)delete process.env.AMAP_WEB_SERVICE_KEY;else process.env.AMAP_WEB_SERVICE_KEY=originalKey;}
});
test('驾车路线携带策略与途经点并保留道路和路况，非驾车途经点拒绝',async()=>{
  const originalFetch=global.fetch,originalKey=process.env.AMAP_WEB_SERVICE_KEY;process.env.AMAP_WEB_SERVICE_KEY='test-key-for-unit-only';
  global.fetch=async u=>{assert.equal(u.pathname,'/v5/direction/driving');assert.equal(u.searchParams.get('strategy'),'33');assert.equal(u.searchParams.get('waypoints'),'120.2,30.2');assert.match(u.searchParams.get('show_fields'),/tmcs/);return{ok:true,json:async()=>({status:'1',route:{paths:[{distance:'1000',cost:{duration:'600',traffic_lights:'3',tolls:'2'},steps:[{road_name:'滨海路',polyline:'120.1,30.1;120.2,30.2',tmcs:[{tmc_status:'拥堵',tmc_polyline:'120.1,30.1;120.2,30.2'}]}]}]}})};};
  try{const r=await p.routeSearch({origin:'120.1,30.1',destination:'120.3,30.3',city:'杭州',mode:'driving',strategy:'33',waypoints:['120.2,30.2']});assert.equal(r.routes[0].trafficLights,3);assert.equal(r.routes[0].steps[0].road_name,'滨海路');assert.equal(r.routes[0].steps[0].tmcs[0].tmc_status,'拥堵');await assert.rejects(()=>p.routeSearch({origin:'120.1,30.1',destination:'120.3,30.3',city:'杭州',mode:'walking',waypoints:['120.2,30.2']}),/途经/);}
  finally{global.fetch=originalFetch;if(originalKey===undefined)delete process.env.AMAP_WEB_SERVICE_KEY;else process.env.AMAP_WEB_SERVICE_KEY=originalKey;}
});
test('非法或与方式不匹配的路线条件不向上游发请求',async()=>{
  const originalFetch=global.fetch;let calls=0;global.fetch=async()=>{calls++;throw Error('不应调用上游');};
  const base={origin:'120.1,30.1',destination:'120.2,30.2',city:'杭州'};
  try{
    await assert.rejects(()=>p.routeSearch({...base,mode:'transit',date:'2026-02-30'}),/日期/);
    await assert.rejects(()=>p.routeSearch({...base,mode:'transit',time:'24:00'}),/时间/);
    await assert.rejects(()=>p.routeSearch({...base,mode:'walking',strategy:0}),/策略/);
    await assert.rejects(()=>p.routeSearch({...base,mode:'driving',time:'12:00'}),/公交/);
    await assert.rejects(()=>p.routeSearch({...base,mode:'driving',waypoints:['999,20']}),/坐标/);
    await assert.rejects(()=>p.routeSearch({...base,mode:'transit',originCity:'杭州',city:'',destinationCity:''}),/终点城市/);
    assert.equal(calls,0);
  }finally{global.fetch=originalFetch;}
});
test('不完整公交分段不会变成零值或触发页面错误',async()=>{
 const originalFetch=global.fetch,originalKey=process.env.AMAP_WEB_SERVICE_KEY;process.env.AMAP_WEB_SERVICE_KEY='test-key-for-unit-only';
 global.fetch=async()=>({ok:true,json:async()=>({status:'1',route:{transits:[{segments:[{walking:{steps:[]},bus:{buslines:[]}},{}]}]}})});
 try{const result=await p.routeSearch({origin:'120.11,30.11',destination:'120.12,30.12',mode:'transit',city:'0571'});assert.equal(result.routes[0].durationSeconds,null);assert.equal(result.routes[0].transitFare,null);assert.deepEqual(result.routes[0].instructions,[]);assert.deepEqual(result.routes[0].polylines,[]);}
 finally{global.fetch=originalFetch;if(originalKey===undefined)delete process.env.AMAP_WEB_SERVICE_KEY;else process.env.AMAP_WEB_SERVICE_KEY=originalKey;}
});
test('公交路线将城市名解析为城市代码，并保留坐标与费用',async()=>{const originalFetch=global.fetch,originalKey=process.env.AMAP_WEB_SERVICE_KEY;process.env.AMAP_WEB_SERVICE_KEY='test-key-for-unit-only';let calls=0;global.fetch=async u=>{calls++;assert.equal(u.origin,'https://restapi.amap.com');if(u.pathname==='/v3/config/district'){assert.equal(u.searchParams.get('keywords'),'杭州');return{ok:true,json:async()=>({status:'1',districts:[{name:'杭州市',citycode:'0571',adcode:'330100'}]})};}assert.equal(u.pathname,'/v5/direction/transit/integrated');assert.equal(u.searchParams.get('city1'),'0571');assert.equal(u.searchParams.get('city2'),'0571');return{ok:true,json:async()=>({status:'1',route:{cost:{taxi_fee:'32'},transits:[{distance:'1500',cost:{duration:'900',transit_fee:'4'},segments:[{walking:{steps:[{instruction:'步行到车站',polyline:{polyline:'120.1,30.2;120.11,30.21'}}]}}]}]}})}};try{const r=await p.routeSearch({origin:'120.1,30.2',destination:'120.11,30.21',city:'杭州',mode:'transit'});assert.equal(r.taxiEstimate,32);assert.equal(r.routes[0].transitFare,4);assert.deepEqual(r.routes[0].instructions,['步行到车站']);assert.equal(r.routes[0].tolls,null);assert.equal(r.routes[0].mapPolylines[0].length,2);assert.equal(calls,2);}finally{global.fetch=originalFetch;if(originalKey===undefined)delete process.env.AMAP_WEB_SERVICE_KEY;else process.env.AMAP_WEB_SERVICE_KEY=originalKey;}});
test('城市代码解析接口返回数字城市码，未知城市明确报错',async()=>{
  const originalFetch=global.fetch,originalKey=process.env.AMAP_WEB_SERVICE_KEY;process.env.AMAP_WEB_SERVICE_KEY='test-key-for-unit-only';let calls=0;
  global.fetch=async u=>{calls++;assert.equal(u.pathname,'/v3/config/district');assert.equal(u.searchParams.get('keywords'),'日照');return{ok:true,json:async()=>({status:'1',districts:[{name:'日照市',citycode:'3711'}]})};};
  try{
    const r=await p.placeCityCode({city:'日照'});assert.equal(r.city,'日照');assert.equal(r.code,'3711');assert.equal(calls,1);
    await assert.rejects(()=>p.placeCityCode({city:'不存在城市甲'})); // 缓存未命中会请求上游，mock 只认「日照」，必然失败
  }
  finally{global.fetch=originalFetch;if(originalKey===undefined)delete process.env.AMAP_WEB_SERVICE_KEY;else process.env.AMAP_WEB_SERVICE_KEY=originalKey;}
});
test('高德上游失败不泄露带Key的URL',async()=>{const originalFetch=global.fetch,originalKey=process.env.AMAP_WEB_SERVICE_KEY;process.env.AMAP_WEB_SERVICE_KEY='test-key-no-leak';global.fetch=async()=>{throw Error('https://restapi.amap.com/?key=test-key-no-leak');};try{await assert.rejects(()=>p.placeSearch({city:'测试城市',keywords:'酒店-测试'}),e=>!e.message.includes('test-key-no-leak')&&e.message.includes('超时'));}finally{global.fetch=originalFetch;if(originalKey===undefined)delete process.env.AMAP_WEB_SERVICE_KEY;else process.env.AMAP_WEB_SERVICE_KEY=originalKey;}});

test('骑行使用高德路径规划 2.0，保留路线和未知费用', async () => {
  const originalFetch = global.fetch, originalKey = process.env.AMAP_WEB_SERVICE_KEY;
  process.env.AMAP_WEB_SERVICE_KEY = 'test-key-for-unit-only';
  let calls = 0;
  global.fetch = async (url) => {
    calls++;
    assert.equal(url.origin, 'https://restapi.amap.com');
    assert.equal(url.pathname, '/v5/direction/bicycling');
    assert.equal(url.searchParams.get('origin'), '120.123456,30.123456');
    assert.equal(url.searchParams.get('destination'), '120.223456,30.223456');
    assert.equal(url.searchParams.get('show_fields'), 'cost,polyline,navi');
    assert.equal(url.searchParams.has('city1'), false);
    return {ok:true, json:async()=>({status:'1',route:{paths:[
      {distance:'2400',cost:{duration:'620'},steps:[{instruction:'沿道路骑行',polyline:'120.123456,30.123456;120.223456,30.223456'}]},
      {distance:'',steps:[]},
    ]}})};
  };
  try {
    const result = await p.routeSearch({origin:'120.123456,30.123456',destination:'120.223456,30.223456',city:'杭州',mode:'bicycling'});
    assert.equal(calls, 1);
    assert.equal(result.mode, 'bicycling');
    assert.equal(result.coordinateSystem, 'GCJ-02');
    assert.equal(result.routes[0].distance, 2400);
    assert.deepEqual(result.routes[0].instructions, ['沿道路骑行']);
    assert.equal(result.routes[0].durationSeconds, 620);
    assert.equal(result.routes[0].transitFare, null);
    assert.equal(result.routes[0].tolls, null);
    assert.deepEqual(result.routes[0].polylines, ['120.123456,30.123456;120.223456,30.223456']);
    assert.equal(result.routes[0].mapPolylines[0].length, 2);
    assert.equal(result.routes[1].distance, null);
    assert.equal(result.routes[1].durationSeconds, null);
    assert.deepEqual(result.routes[1].polylines, []);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.AMAP_WEB_SERVICE_KEY;
    else process.env.AMAP_WEB_SERVICE_KEY = originalKey;
  }
});
