window.DEMO = {
  places: [
    {id:'broken',name:'断桥残雪',lat:30.2595,lng:120.1488,area:'西湖北岸',cost:0,duration:'约 1 小时',kind:'湖边散步',note:'从北山街开始，慢慢走进西湖。'},
    {id:'bai',name:'白堤',lat:30.2527,lng:120.1435,area:'西湖',cost:0,duration:'约 1.5 小时',kind:'步行风景',note:'给湖边的长椅和咖啡留一点时间。'},
    {id:'quyuan',name:'曲院风荷',lat:30.2498,lng:120.1306,area:'西湖西侧',cost:0,duration:'约 1 小时',kind:'公园',note:'不赶路，沿湖逛到杨公堤一带。'},
    {id:'lingyin',name:'灵隐寺一带',lat:30.2405,lng:120.1003,area:'灵隐景区',cost:75,duration:'约 3 小时',kind:'人文山林',note:'门票按演示估算，预约及实际票种需另行确认。'},
    {id:'longjing',name:'龙井村',lat:30.2177,lng:120.1008,area:'西湖西南',cost:0,duration:'约 2 小时',kind:'茶园',note:'在茶山附近走走，吃饭与饮茶费用另计。'},
    {id:'hefang',name:'河坊街',lat:30.2380,lng:120.1696,area:'上城区',cost:0,duration:'约 1.5 小时',kind:'街巷',note:'最后一天轻松走走，留足返程余量。'},
    {id:'museum',name:'浙江省博物馆（孤山馆区）',lat:30.2520,lng:120.1360,area:'孤山',cost:0,duration:'约 2 小时',kind:'博物馆',note:'开放展厅、开放日与预约信息待实际核对。'},
    {id:'leifeng',name:'雷峰塔',lat:30.2305,lng:120.1495,area:'西湖南岸',cost:40,duration:'约 1.5 小时',kind:'人文景观',note:'门票为示例估算。'},
    {id:'grand',name:'拱宸桥',lat:30.3202,lng:120.1389,area:'京杭大运河',cost:0,duration:'约 2 小时',kind:'运河漫步',note:'离西湖较远，适合另留半天。'}
  ],
  hotels:[
    {id:'metro',name:'武林广场 · 地铁旁住宿',area:'地铁 1 / 3 号线周边',price:268,tag:'出行方便',detail:'演示位置：武林广场附近，不对应真实可订酒店。',lat:30.2748,lng:120.1586},
    {id:'station',name:'杭州东站 · 简约住宿',area:'东站枢纽周边',price:188,tag:'预算友好',detail:'演示位置：杭州东站附近，接驳便利程度需实际核实。',lat:30.2910,lng:120.2080},
    {id:'lake',name:'湖滨 · 步行到湖边',area:'龙翔桥地铁站周边',price:368,tag:'离西湖近',detail:'演示位置：湖滨商圈，不对应真实房源或库存。',lat:30.2540,lng:120.1640}
  ],
  transport:[
    {id:'rail',name:'高铁往返',out:'上海虹桥 → 杭州东',back:'杭州东 → 上海虹桥',time:'去程 09:00–10:00 · 返程 18:00–19:00',cost:160,tag:'省时好安排'},
    {id:'train',name:'普通火车往返',out:'上海南 → 杭州',back:'杭州 → 上海南',time:'去程 08:00–10:30 · 返程 17:30–20:00',cost:57,tag:'费用更低'},
    {id:'air',name:'飞机往返',out:'上海虹桥机场 → 杭州萧山机场',back:'杭州萧山机场 → 上海虹桥机场',time:'仅展示机场字段与票价比较方式',cost:860,tag:'纯交互样例 · 不保证有直飞'}
  ]
};
