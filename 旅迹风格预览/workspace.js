// Two-column studio: editor/chat on the left, full-height map on the right.
const studioWorkspace=document.querySelector('#workspace');
const planning=document.querySelector('.planning');
const assistantPanel=document.querySelector('.assistant-box');
const mapPanel=document.querySelector('#map-panel');
const heading=document.querySelector('.page-heading');
planning.prepend(heading);
const sideBudget=document.createElement('section');sideBudget.className='compact-summary';sideBudget.setAttribute('aria-label','旅行费用摘要');heading.after(sideBudget);
const navigation=document.querySelector('#navigation');sideBudget.after(navigation);
document.querySelector('#tabs').hidden=true;
const viewSwitch=document.createElement('div');viewSwitch.className='left-view-switch';viewSwitch.innerHTML='<div role="group" aria-label="左侧工作区"><button data-left-view="editor">行程编辑</button><button data-left-view="chat">对话助手 <span>演示</span></button></div><button id="local-reset" class="text-button">重新开始</button>';navigation.after(viewSwitch);
const studioDock=document.createElement('aside');studioDock.className='studio-dock';studioDock.setAttribute('aria-label','完整地图');studioWorkspace.append(studioDock);studioDock.append(mapPanel);
const assistantWelcome=document.createElement('div');assistantWelcome.className='assistant-welcome';assistantWelcome.innerHTML='<div class="welcome-symbol">✦</div><h2>下一步，由你决定。</h2><p>可以先选交通和住宿，也可以整理想去的地方。<br>地图在右边，修改和想法都留在左边。</p>';
document.querySelector('#chat-log').before(assistantWelcome);
const chatNote=document.createElement('p');chatNote.className='composer-note';chatNote.textContent='预设交互演示，未接 AI。自由输入保存为备注。';document.querySelector('#chat-form').after(chatNote);
document.querySelector('#local-reset').onclick=()=>document.querySelector('#reset').click();
const baseStudioRender=render;
render=function(){baseStudioRender();syncStudio();};
function syncStudio(){
 document.body.classList.toggle('studio-mode',state.started);
 if(!state.started)return;
 const b=budget(),title=state.tripName||state.destination+'之旅',chatView=state.leftView==='chat';
 document.querySelector('#trip-title').textContent=title;
 document.querySelector('.page-heading .eyebrow').textContent='TRAVEL STUDIO / 旅行工作台';
 document.querySelector('#trip-meta').textContent=`${state.origin}出发 · ${dateAt()} — ${dateAt(state.days-1)} · ${state.days}天 / ${state.people}人`;
 sideBudget.innerHTML=`<div><small>当前估算 <span>示例</span></small><strong>${yen(b.total)}</strong></div><div><small>整趟预算</small><b>${yen(state.budget)}</b></div><div><small>${transport()?'往返交通':'交通待定'}</small><b>${transport()?esc(transport().name):'尚未计入'}</b></div><div><small>住宿</small><b title="${esc(state.mapStay?.name||hotel()?.tag||'稍后再选')}">${state.mapStay?.name?esc(state.mapStay.name):hotel()?esc(hotel().tag):'稍后再选'}</b></div>`;
 planning.classList.toggle('chat-view',chatView);
 viewSwitch.querySelectorAll('[data-left-view]').forEach(button=>{button.classList.toggle('active',button.dataset.leftView===(chatView?'chat':'editor'));button.setAttribute('aria-pressed',String(button.classList.contains('active')));});
 studioDock.hidden=!state.mapOpen;
 const legend=document.querySelector('.map-legend');legend.hidden=!(['route','daily-route'].includes(state.liveMap?.kind)||(!state.liveMap&&currentPoints().length>1));if(!legend.hidden)legend.textContent=state.liveMap?.kind==='daily-route'?(state.liveMap.segments.some(s=>s.error||!s.data?.routes?.[0]?.polylines?.length)?'高德路线；缺失路段未显示':'高德路线查询结果'):state.liveMap?.kind==='route'?'高德路线查询结果':'地点顺序示意线，非导航路线';
 const mapToggle=document.querySelector('#map-toggle');(state.mapOpen?mapPanel:document.querySelector('.top-actions')).append(mapToggle);mapToggle.classList.toggle('map-corner-toggle',state.mapOpen);mapToggle.setAttribute('aria-label',state.mapOpen?'收起地图':'展开地图');mapToggle.title=state.mapOpen?'收起地图':'展开地图';
 const settings=document.querySelector('#provider-settings');if(settings)viewSwitch.append(settings);
 assistantWelcome.hidden=state.messages.length>0;
 document.querySelector('#map-caption').textContent=`第 ${state.day+1} 天 · ${dateAt(state.day)} · ${state.plans[state.day].length} 个地点`;
}
document.addEventListener('click',e=>{
 const view=e.target.closest('[data-left-view]');if(view){state.leftView=view.dataset.leftView;save();render();return;}
 const section=e.target.closest('[data-section]');if(section&&state.started&&state.leftView==='chat'){state.leftView='editor';save();render();}
});
render();
