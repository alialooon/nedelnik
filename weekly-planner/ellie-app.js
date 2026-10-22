import { CATEGORIES, WEEKDAYS, toISO, addDays, startOfWeek, parseDate, occurrencesForWeek,
  timeMinutes, minutesFromParts, formatMinutes, taskDuration, timeStats,
  validateTask, sanitizeBackup, blankData, periodAnchor, periodTasksForWeek, periodTasksForMonth } from './logic.mjs';

const KEY='nedelnik-planner-v1';
const UI_KEY='nedelnik-ui-preferences-v1';
const BACKUP_KEY='nedelnik-planner-backups-v1';
const $=id=>document.getElementById(id);
const today=()=>toISO(new Date());
const shortDays=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const escapeHTML=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>globalThis.crypto?.randomUUID?.()||'task-'+Date.now()+'-'+Math.random().toString(36).slice(2);
function loadUIPrefs() {
  const fallback={week:startOfWeek(today()),focusedDay:today(),view:'board',inboxHidden:false,focusMinutes:25};
  try {
    const raw=JSON.parse(localStorage.getItem(UI_KEY)||'{}');
    if(!raw || typeof raw!=='object')return fallback;
    return {
      week:parseDate(raw.week)?startOfWeek(raw.week):fallback.week,
      focusedDay:parseDate(raw.focusedDay)?raw.focusedDay:fallback.focusedDay,
      view:['board','calendar','focus'].includes(raw.view)?raw.view:'board',
      inboxHidden:raw.inboxHidden===true,
      focusMinutes:Number.isInteger(raw.focusMinutes)&&raw.focusMinutes>=1&&raw.focusMinutes<=240?raw.focusMinutes:25
    };
  } catch{return fallback;}
}
const savedUI=loadUIPrefs();
function saveUIPrefs() {
  try {
    localStorage.setItem(UI_KEY,JSON.stringify({
      week,focusedDay,view,focusMinutes:focusDurationMinutes,
      inboxHidden:document.querySelector('.workspace')?.classList.contains('inbox-hidden')===true
    }));
  }catch(error){console.warn('Не удалось сохранить настройки окна',error);}
}
let recoveredFromBackup=false;
let state=load(),week=savedUI.week,focusedDay=savedUI.focusedDay,view=savedUI.view,editor=null;
let focusTaskId=null,focusTrackedSeconds=0,focusRemainderSeconds=0,statsScope='week';
let focusDurationMinutes=savedUI.focusMinutes;
let dragItem=null,toastTimeout=null,focusRemaining=focusDurationMinutes*60,focusRunning=false,focusEndsAt=0,timerHandle=null;

function load() {
  try {
    const str=localStorage.getItem(KEY);
    return str?sanitizeBackup(JSON.parse(str)):blankData();
  }catch(error){
    console.error('Saved data cannot be read',error);
    try{
      const history=JSON.parse(localStorage.getItem(BACKUP_KEY)||'[]');
      for(const backup of history.slice().reverse()){
        try{
          const restored=sanitizeBackup(backup.data);
          recoveredFromBackup=true;
          return restored;
        }catch{}
      }
    }catch{}
    return blankData();
  }
}
function getBackups(){
  try{
    const backups=JSON.parse(localStorage.getItem(BACKUP_KEY)||'[]');
    return Array.isArray(backups)?backups:[];
  }catch{return [];}
}
function save(){
  try{
    const stored=localStorage.getItem(KEY),backups=getBackups();
    const day=today();
    if(stored&&!backups.some(b=>b.day===day)){
      backups.push({day,createdAt:Date.now(),data:JSON.parse(stored)});
      try{localStorage.setItem(BACKUP_KEY,JSON.stringify(backups.slice(-7)));}
      catch(error){console.warn('Недостаточно места для резервной копии',error);}
    }
    localStorage.setItem(KEY,JSON.stringify(state));
  }catch(error){notify('Не удалось сохранить: используйте экспорт JSON');console.error(error);}
}
function moveToTrash(kind,value){
  if(!value)return;
  state.trash=state.trash||[];
  state.trash.push({kind,value:JSON.parse(JSON.stringify(value)),deletedAt:Date.now()});
  state.trash=state.trash.filter(v=>Date.now()-v.deletedAt<30*86400000).slice(-300);
}
function maybeCarryOverdue(){
  if(!state.settings?.autoCarry)return 0;
  const date=today();
  const overdue=state.tasks.filter(t=>(!t.scope||t.scope==='day')&&(!t.repeat||t.repeat==='none')&&t.date<date
    &&(t.status||'todo')!=='done'&&t.completed!==true);
  if(!overdue.length)return 0;
  state.rolloverLog=state.rolloverLog||[];
  for(const task of overdue){
    state.rolloverLog.push({id:task.id,from:task.date,to:date,title:task.title});
    task.date=date;
  }
  state.rolloverLog=state.rolloverLog.slice(-2000);
  save();return overdue.length;
}
function notify(text){
  clearTimeout(toastTimeout);
  $('notification').textContent=text;$('notification').hidden=false;
  toastTimeout=setTimeout(()=>$('notification').hidden=true,3500);
}
function closeDialog(id){if($(id).open)$(id).close();}
function openDialog(id){$('moreMenu').open=false;$(id).showModal();}
function weekLabel(iso){
  const last=addDays(iso,6),a=parseDate(iso),b=parseDate(last);
  const m=d=>d.toLocaleDateString('ru-RU',{month:'long'});
  return a.getMonth()===b.getMonth()&&a.getFullYear()===b.getFullYear()
    ?a.getDate()+'–'+b.getDate()+' '+m(b)+' '+b.getFullYear()
    :a.getDate()+' '+m(a)+' – '+b.getDate()+' '+m(b)+' '+b.getFullYear();
}
function dayLabel(iso){return parseDate(iso).toLocaleDateString('ru-RU',{day:'numeric',month:'long'});}
function allTasks(){return occurrencesForWeek(state.tasks,week);}
function dayTasks(iso){return allTasks().filter(t=>t.occurrenceDate===iso);}
function statusOf(task,date){
  return task.repeat&&task.repeat!=='none'
    ?(task.statusByDate?.[date]??((task.completedDates||[]).includes(date)?'done':'todo'))
    :(task.status??(task.completed?'done':'todo'));
}
function planned(task){return Number.isInteger(task.plannedMinutes)?task.plannedMinutes:taskDuration(task);}
function duration(estimate){return estimate>0?formatMinutes(estimate):'Без оценки';}
const ICON_PATHS={
  'plus':'<path d="M12 5v14M5 12h14"/>',
  'panel':'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  'calendar':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  'layers':'<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M7 21h12a2 2 0 0 0 2-2V7"/>',
  'checklist':'<path d="m3 7 2 2 4-4M12 7h9M3 17l2 2 4-4m3 2h9"/>',
  'chart':'<path d="M4 20V12M10 20V4M16 20v-9M22 20v-6"/>',
  'chevron-left':'<path d="m15 18-6-6 6-6"/>',
  'chevron-right':'<path d="m9 18 6-6-6-6"/>',
  'trash':'<path d="M4 6h16m-10 0V4h4v2m4 0-1 14H7L6 6m4 4v7m4-7v7"/>',
  'play':'<path d="m9 6 10 6-10 6z"/>'
};
function icon(name){
  return '<svg class="ui-icon" width="17" height="17" viewBox="0 0 24 24" fill="none"'
    +' stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    +(ICON_PATHS[name]||ICON_PATHS.plus)+'</svg>';
}
function decorateIcons(){
  for(const el of document.querySelectorAll('[data-ui-icon]')){
    const glyph=icon(el.dataset.uiIcon);
    if(el.tagName==='BUTTON'){
      const iconOnly=['inboxToggle','newInboxTask','prevPeriod','nextPeriod'].includes(el.id)
        ||el.closest('.quick-add');
      if(iconOnly)el.innerHTML=glyph;
      else el.insertAdjacentHTML('afterbegin',glyph);
    }else el.innerHTML=glyph;
  }
}
function dot(category){return '<span class="category-dot '+escapeHTML(category||'other')+'"></span>';}
function renderInbox(){
  $('inboxCount').textContent=state.inbox.length;
  const selected=today(),items=occurrencesForWeek(state.tasks,startOfWeek(selected))
    .filter(t=>t.occurrenceDate===selected);
  $('sidebarTodayCount').textContent=items.length;
  $('sidebarTodayDate').textContent=parseDate(selected).toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
  $('templateCount').textContent=state.templates.length;
  $('inboxList').innerHTML=state.inbox.length?state.inbox.map(t=>
    '<article class="inbox-item" draggable="true" data-source="inbox" data-id="'+escapeHTML(t.id)+'">'
    +'<button type="button" data-action="edit-inbox" data-id="'+escapeHTML(t.id)+'" aria-label="Изменить задачу">○</button>'
    +'<div class="item-main"><div class="item-title">'+escapeHTML(t.title)+'</div>'
    +'<div class="item-subline">'+dot(t.category)+escapeHTML(CATEGORIES[t.category]||'Личное')+' · '+duration(planned(t))+'</div></div>'
    +'<button type="button" data-action="inbox-today" data-id="'+escapeHTML(t.id)+'" title="Запланировать на сегодня">→</button>'
    +'</article>').join('')
    :'<div class="inbox-empty"><span class="empty-marker" aria-hidden="true">✓</span>'
    +'<strong>Всё записано</strong><span>Не держи дела в голове. Начни с одной задачи.</span>'
    +'<div class="example-suggestions"><button type="button" data-suggestion="Разобрать почту">Разобрать почту</button>'
    +'<button type="button" data-suggestion="Купить продукты">Купить продукты</button></div>'
    +'<small>Примеры не добавляются, пока ты не нажмёшь «+».</small></div>';
}
function card(t,day){
  const status=statusOf(t,day),done=status==='done';
  const estimate=planned(t),sub=[dot(t.category),escapeHTML(CATEGORIES[t.category]||'Другое')];
  if(t.start)sub.push(' · '+escapeHTML(t.start));
  if(t.measureMode==='count')sub.push(' · '+(t.actualCount??0)+'/'+(t.targetCount||0)+' повт.');
  else if(estimate>0)sub.push(' · '+formatMinutes(estimate));
  if(t.subtasks?.length)sub.push(' · '+t.subtasks.filter(s=>s.done).length+'/'+t.subtasks.length+' шагов');
  const meta=sub.join('');
  return '<article class="task-tile '+(done?'done ':'')+'category-'+escapeHTML(t.category||'other')+' priority-'+escapeHTML(t.priority||'normal')
    +'" data-source="task" draggable="true" data-id="'+escapeHTML(t.id)+'" data-date="'+day+'">'
    +'<button type="button" class="task-check '+(done?'done':status==='partial'?'partial':'')
    +'" data-action="status" data-id="'+escapeHTML(t.id)+'" data-date="'+day
    +'" aria-label="Изменить статус: '+escapeHTML(t.title)+'">'+(done?'✓':status==='partial'?'−':'')+'</button>'
    +'<button type="button" class="task-edit" data-action="edit-task" data-id="'+escapeHTML(t.id)+'" data-date="'+day+'">'
    +'<span class="item-title">'+escapeHTML(t.title)+'</span><span class="item-subline">'+meta+'</span></button>'
    +(t.subtasks?.length?'<div class="task-subtasks">'
      +t.subtasks.map(s=>'<label class="task-subtask"><input type="checkbox" data-action="toggle-subtask" data-id="'
        +escapeHTML(t.id)+'" data-date="'+day+'" data-sub-id="'+escapeHTML(s.id)+'" '
        +(s.done?'checked':'')+' /><span>'+escapeHTML(s.title)+'</span></label>').join('')+'</div>':'')
    +'<button type="button" class="task-start" data-action="start-focus" data-id="'+escapeHTML(t.id)+'" data-date="'+day
    +'" title="Запустить таймер задачи" aria-label="Начать работу над задачей">'+icon('play')+'</button>'
    +'</article>';
}
function renderBoard(){
  const all=allTasks();
  $('boardView').innerHTML=Array.from({length:7},(_,i)=>{
    const date=addDays(week,i),tasks=all.filter(t=>t.occurrenceDate===date),now=date===today();
    const estimate=tasks.reduce((sum,t)=>sum+planned(t),0);
    const done=tasks.filter(t=>t.done).length,partial=tasks.filter(t=>t.status==='partial').length;
    const percent=tasks.length?Math.round((done+partial*.5)/tasks.length*100):0;
    const weekday=WEEKDAYS[i],dayNumber=parseDate(date).getDate();
    return '<section class="day-column '+(now?'today ':'')+(i>=5?'weekend':'')
      +'" data-drop-date="'+date+'" aria-label="'+weekday+' '+dayLabel(date)+'">'
      +'<div class="day-heading"><div class="day-heading-main"><span class="day-weekday">'+weekday
      +'</span><strong class="day-number">'+dayNumber+'</strong>'
      +'<span class="day-count">'+(tasks.length?done+' / '+tasks.length+' выполнено':'Нет задач')+'</span></div>'
      +(estimate?'<span class="day-estimate" title="Запланировано времени">'+formatMinutes(estimate)+'</span>':'')
      +'<div class="day-progress" role="progressbar" aria-label="Выполнение задач: '+weekday+'" aria-valuenow="'+percent
      +'" aria-valuemin="0" aria-valuemax="100"><span style="width:'+percent+'%"></span></div>'
      +'</div><div class="day-tasks">'+(tasks.length?tasks.map(t=>card(t,date)).join('')
      :'<div class="day-blank"><span class="day-blank-icon" aria-hidden="true">＋</span>'
      +'<strong>Свободный день</strong><span>Перетащи дело сюда</span></div>')+'</div>'
      +'<button type="button" class="day-add" data-action="add-day" data-date="'+date
      +'" aria-label="Добавить задачу: '+weekday+' '+dayNumber+'">'+icon('plus')+' Новая задача</button>'
      +'</section>';
  }).join('');
}
function renderPeriodPlans(){
  const entries=periodTasksForWeek(state.tasks,week);
  const w=entries.filter(t=>t.scope==='week'),m=entries.filter(t=>t.scope==='month');
  const unfinished=entries.filter(t=>!t.done).length;
  $('periodStripLabel').textContent='Планы периода · '+w.length+' на неделю · '+m.length
    +' на месяц'+(unfinished?' · '+unfinished+' осталось':'');
  if($('periodDialog').open)renderPeriodDialog();
}
function renderPeriodDialog(){
  const entries=periodTasksForWeek(state.tasks,week);
  const groups=[
    {scope:'week',label:'На неделю · '+weekLabel(week)},
    {scope:'month',label:'На месяц · '+parseDate(week).toLocaleDateString('ru-RU',{month:'long',year:'numeric'})}
  ];
  $('periodTaskList').innerHTML=groups.map(group=>{
    const tasks=entries.filter(t=>t.scope===group.scope);
    return '<section class="period-group"><h3>'+escapeHTML(group.label)+'</h3>'
      +(tasks.length?tasks.map(t=>
        '<div class="period-item '+(t.done?'period-done':'')+'">'
        +'<button type="button" class="period-check" data-action="period-status" data-id="'+escapeHTML(t.id)
        +'" aria-label="Изменить статус: '+escapeHTML(t.title)+'">'+(t.done?'✓':'')+'</button>'
        +'<div class="period-main"><strong>'+escapeHTML(t.title)+'</strong><small>'
        +dot(t.category)+escapeHTML(CATEGORIES[t.category]||'Другое')
        +(t.measureMode==='count'?' · '+(t.actualCount||0)+'/'+(t.targetCount||0)+' повт.'
          :planned(t)?' · '+formatMinutes(planned(t)):'')+'</small></div>'
        +'<button type="button" class="period-inline-action" data-action="period-schedule" data-id="'+escapeHTML(t.id)
        +'">На день</button>'
        +'<button type="button" class="period-inline-action" data-action="period-edit" data-id="'+escapeHTML(t.id)
        +'">Изменить</button></div>').join('')
      :'<p class="period-empty">Пока нет задач на этот период.</p>')
      +'</section>';
  }).join('');
}
function calendarMinutesAt(target,clientY){
  const rect=target.getBoundingClientRect();
  if(rect.height<=0)return 0;
  const ratio=Math.max(0,Math.min(1,(clientY-rect.top)/rect.height));
  return Math.min(1425,Math.round(ratio*1440/15)*15);
}
function renderCalendar(){
  const tasks=allTasks(),dayMinutes=1440;
  const timed=tasks.filter(t=>t.start);
  // The body fills the available space, with the whole 00:00–24:00 day divided
  // into 24 proportional rows. There is no fixed minimum hour height or scrollbar.
  const percent=minutes=>Math.max(0,Math.min(100,minutes/dayMinutes*100));
  const head='<div class="timeline-head"><span></span>'
    +Array.from({length:7},(_,i)=>'<div class="'+(addDays(week,i)===today()?'is-current':'')
    +'">'+shortDays[i]+' '+parseDate(addDays(week,i)).getDate()+'</div>').join('')
    +'</div>';
  // Center each hour caption between its two horizontal grid lines, including 00:00 and 23:00.
  const labels='<div class="hour-labels">'+Array.from({length:24},(_,i)=>
    '<span class="hour-label" style="top:'+percent(i*60+30)+'%">'+String(i).padStart(2,'0')+':00</span>').join('')+'</div>';
  const now=new Date(),nowMins=now.getHours()*60+now.getMinutes();
  const columns=Array.from({length:7},(_,i)=>{
    const date=addDays(week,i),isToday=date===today();
    const blocks=tasks.filter(t=>t.occurrenceDate===date&&t.start).map(t=>{
      const start=timeMinutes(t.start);
      if(Number.isNaN(start))return '';
      const mins=planned(t)>0?planned(t):60;
      const top=percent(start);
      const height=Math.min(100-top,Math.max(2.5,percent(mins)));
      const short=mins<90;
      return '<div class="time-block '+escapeHTML(t.category)+'" draggable="true" data-source="task" data-id="'
        +escapeHTML(t.id)+'" data-date="'+date+'" style="top:'+top+'%;height:'+height
        +'%" title="'+escapeHTML(t.title)+' — '+escapeHTML(t.start)+'">'
        +'<strong>'+escapeHTML(t.title)+'</strong>'
        +(short?'':'<small>'+escapeHTML(t.start)+(t.end?'–'+escapeHTML(t.end):' · '+formatMinutes(mins))+'</small>')
        +'</div>';
    }).join('');
    const nowLine=isToday
      ?'<div class="current-time-line" style="top:'+percent(nowMins)+'%" aria-label="Сейчас"></div>':'';
    return '<div class="calendar-day '+(isToday?'calendar-today ':'')+(i>=5?'calendar-weekend':'')
      +'" data-drop-date="'+date+'">'+blocks+nowLine+'</div>';
  }).join('');
  const unscheduled=tasks.filter(t=>!t.start).length;
  $('calendarView').innerHTML=head+'<div class="timeline-body">'+labels+columns
    +(!timed.length?'<div class="timebox-empty" aria-hidden="true"><span class="timebox-empty-icon">⌁</span>'
      +'<strong>Расписание пока свободно</strong><span>Перетащи задачу из списка без даты на нужный час</span></div>':'')
    +'</div><div class="calendar-unscheduled">Все 24 часа на одном экране · '
    +unscheduled+' задач без времени — на вкладке «Задачи».</div>';
}
function renderFocus(){
  const tasks=dayTasks(focusedDay);
  const summary=timeStats(tasks),done=tasks.filter(t=>t.done).length;
  const rank=t=>t.priority==='high'?0:t.priority==='normal'?1:2;
  const ordered=[...tasks].sort((a,b)=>Number(a.done)-Number(b.done)||rank(a)-rank(b)
    ||(a.start||'').localeCompare(b.start||''));
  if(!focusRunning&&!ordered.some(t=>t.id===focusTaskId))focusTaskId=ordered.find(t=>!t.done)?.id||ordered[0]?.id||null;
  const priorities=ordered.slice(0,3),later=ordered.slice(3);
  const percent=summary.completion,hasFact=summary.measured>0;
  const focusPreset=[15,25,45,60].includes(focusDurationMinutes)?String(focusDurationMinutes):'custom';
  const selectOptions=ordered.map(t=>'<option value="'+escapeHTML(t.id)+'" '+(t.id===focusTaskId?'selected':'')+'>'+escapeHTML(t.title)+'</option>').join('');
  $('focusView').innerHTML='<div class="focus-list">'
    +'<div class="focus-header"><div><span class="eyebrow">Главное на день</span><h2>План на '+dayLabel(focusedDay)+'</h2></div>'
    +'<input type="date" id="focusDate" value="'+focusedDay+'" aria-label="Дата для режима фокуса" /></div>'
    +'<div class="focus-summary"><div><small>Выполнено</small><strong>'+done+' / '+tasks.length
    +'</strong></div><div><small>План</small><strong>'+formatMinutes(summary.plan)
    +'</strong></div><div><small>Факт</small><strong>'+(hasFact?formatMinutes(summary.fact):'—')
    +'</strong></div></div><div class="focus-completion" role="progressbar" aria-label="Выполнение задач" aria-valuenow="'
    +percent+'" aria-valuemin="0" aria-valuemax="100"><span style="width:'+percent+'%"></span></div>'
    +'<div class="focus-section-title">Приоритеты дня</div>'
    +(priorities.length?priorities.map(t=>card(t,focusedDay)).join('')
      :'<div class="focus-empty"><span class="focus-empty-icon" aria-hidden="true">✓</span>'
      +'<strong>Выбери главное дело</strong><span>Добавь задачу или перетащи её из списка слева.</span></div>')
    +(later.length?'<div class="focus-section-title">Остальные дела · '+later.length+'</div>'
      +later.map(t=>card(t,focusedDay)).join(''):'')
    +'<button class="focus-add" type="button" data-action="add-day" data-date="'+focusedDay+'">'+icon('plus')+' Добавить задачу</button></div>'
    +'<div class="focus-timer"><span class="eyebrow">Сосредоточенная работа</span>'
    +'<h2>Фокус-таймер</h2>'
    +'<label class="field focus-task-select"><span>Учитывать время для задачи</span>'
    +'<select id="focusTaskSelect" '+(focusRunning?'disabled':'')+'><option value="">Без привязки</option>'
    +selectOptions+'</select></label>'
    +'<div class="focus-duration-controls"><label class="field"><span>Продолжительность</span>'
    +'<select id="focusDurationPreset" '+(focusRunning?'disabled':'')+'>'
    +[15,25,45,60].map(n=>'<option value="'+n+'" '+(focusPreset===String(n)?'selected':'')+'>'+n+' мин</option>').join('')
    +'<option value="custom" '+(focusPreset==='custom'?'selected':'')+'>Своё время</option></select></label>'
    +'<label id="focusCustomLabel" class="field" '+(focusPreset==='custom'?'':'hidden')+'><span>Минуты (1–240)</span>'
    +'<input id="focusCustomMinutes" type="number" min="1" max="240" step="1" value="'+focusDurationMinutes+'" '
    +(focusRunning?'disabled':'')+' aria-label="Своя длительность таймера в минутах" /></label></div>'
    +'<div class="timer-ring"><div class="timer-face" id="timerFace">25:00</div></div>'
    +'<p>Каждая полная минута записывается в фактическое время выбранной задачи.</p>'
    +'<div class="timer-actions"><button type="button" class="primary-action" id="timerToggle">'
    +(focusRunning?'Пауза':'Начать')+'</button><button type="button" class="quiet-action" id="timerReset">Сброс</button></div>'
    +'<p class="focus-timer-note">Останови таймер, чтобы сменить задачу. Незавершённые минуты не округляются вверх.</p></div>';
  refreshTimer();
}
function render(){
  $('periodTitle').textContent=weekLabel(week);
  $('jumpDate').value=focusedDay;
  $('boardView').hidden=view!=='board';$('calendarView').hidden=view!=='calendar';$('focusView').hidden=view!=='focus';
  document.querySelectorAll('[data-view]').forEach(b=>{
    const active=b.dataset.view===view;
    b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
  });
  $('viewDescription').textContent=view==='board'?'Распределяй дела по дням недели'
    :view==='calendar'?'Расписание по часам':'Самое важное — в одном месте';
  const stats=timeStats(allTasks());
  $('weekProgress').textContent=stats.total+' дел · '+stats.done+' выполнено · '+formatMinutes(stats.plan)+' в плане';
  $('inlineProgressFill').style.width=stats.completion+'%';
  renderInbox();
  renderPeriodPlans();
  if(view==='board')renderBoard();
  else if(view==='calendar')renderCalendar();
  else renderFocus();
  saveUIPrefs();
}
function defaultTask(title,date){
  return {id:uid(),title,date,scope:'day',start:'',end:'',plannedMinutes:30,actualMinutes:null,actualByDate:{},
    category:'personal',priority:'normal',repeat:'none',notes:'',completed:false,completedDates:[],
    status:'todo',statusByDate:{},measureMode:'duration',targetCount:null,actualCount:null,actualCountByDate:{},
    repeatDays:[],repeatInterval:2,subtasks:[],subtaskByDate:{}};
}
function inboxFromTask(task){
  return {id:uid(),title:task.title,category:task.category||'personal',priority:task.priority||'normal',
    plannedMinutes:planned(task),notes:task.notes||''};
}
function captureInbox(title){
  if(!title.trim())return;
  if(state.inbox.length>=3000){notify('Достигнут лимит списка без даты');return;}
  state.inbox.push({id:uid(),title:title.trim().slice(0,120),plannedMinutes:30,
    category:'personal',priority:'normal',notes:''});
  save();render();
}
function addInboxToDay(id,date,atMinutes=null){
  const idx=state.inbox.findIndex(t=>t.id===id);if(idx===-1)return;
  const t=state.inbox[idx];
  const task={...defaultTask(t.title,date),plannedMinutes:t.plannedMinutes,
    category:t.category,priority:t.priority,notes:t.notes};
  if(Number.isFinite(atMinutes))applyTime(task,atMinutes);
  const error=validateTask(task);if(error){notify(error);return;}
  state.tasks.push(task);state.inbox.splice(idx,1);save();render();
}
function applyTime(task,minutes){
  const start=Math.round(minutes/15)*15;
  const duration=Math.min(Math.max(planned(task),15),1439-start);
  const fmt=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
  task.start=fmt(start);task.end=fmt(start+duration);
  task.plannedMinutes=duration;task.measureMode='interval';
}
function moveTask(id,fromDate,toDate,atMinutes=null){
  const task=state.tasks.find(t=>t.id===id);if(!task)return;
  if(task.repeat&&task.repeat!=='none') {
    const original=occurrencesForWeek([task],startOfWeek(fromDate)).find(t=>t.occurrenceDate===fromDate);
    if(!original)return;
    const copy={...defaultTask(original.title,toDate),category:original.category,
      priority:original.priority,notes:original.notes,plannedMinutes:planned(original)};
    if(Number.isFinite(atMinutes))applyTime(copy,atMinutes);
    state.tasks.push(copy);
    notify('Повторяющаяся задача скопирована на выбранный день');
  }else{
    task.date=toDate;
    task.scope='day';
    if(Number.isFinite(atMinutes))applyTime(task,atMinutes);
  }
  save();render();
}
function moveToInbox(id){
  const idx=state.tasks.findIndex(t=>t.id===id);if(idx===-1)return;
  const task=state.tasks[idx];
  state.inbox.push(inboxFromTask(task));
  if(task.repeat==='none')state.tasks.splice(idx,1);
  save();render();notify('Задача перемещена в список без даты');
}
function changeStatus(id,date){
  const t=state.tasks.find(task=>task.id===id);if(!t)return;
  const next=statusOf(t,date)==='done'?'todo':'done';
  if(t.repeat!=='none'){
    t.statusByDate={...(t.statusByDate||{}),[date]:next};
    const done=new Set(t.completedDates||[]);
    if(next==='done')done.add(date);else done.delete(date);
    t.completedDates=[...done].sort();
  }else{t.status=next;t.completed=next==='done';}
  save();render();
}
function chooseDate(date){
  if(!parseDate(date))return;
  week=startOfWeek(date);focusedDay=date;render();
}

function toggleEditorExtras(){
  const measure=$('editMeasure').value,repeat=$('editRepeat').value;
  $('durationFields').hidden=measure==='count';
  $('countFields').hidden=measure!=='count';
  $('intervalFields').hidden=measure!=='interval';
  $('repeatDayFields').hidden=repeat!=='custom';
  $('repeatIntervalField').hidden=repeat!=='interval';
}
function collectEditorSubtasks(){
  return [...$('editSubtasks').querySelectorAll('.subtask-item')].map(row=>({
    id:row.dataset.id,title:row.querySelector('.subtask-title').value.trim().slice(0,180),
    done:row.querySelector('.subtask-done').checked
  })).filter(s=>s.title).slice(0,100);
}
function renderEditorSubtasks(){
  $('editSubtasks').innerHTML=(editor?.subtasks||[]).map(s=>
    '<div class="subtask-item" data-id="'+escapeHTML(s.id)+'">'
    +'<input class="subtask-done" type="checkbox" '+(s.done?'checked':'')+' aria-label="Подзадача выполнена"/>'
    +'<input class="subtask-title" type="text" maxlength="180" value="'+escapeHTML(s.title)+'" aria-label="Подзадача"/>'
    +'<button type="button" class="subtask-remove" data-subtask-remove="'+escapeHTML(s.id)+'" aria-label="Удалить подзадачу">×</button></div>'
  ).join('');
}
function addEditorSubtask(){
  const title=$('newSubtask').value.trim();
  if(!title)return;
  const existing=collectEditorSubtasks();
  if(existing.length>=100){notify('Не более 100 подзадач');return;}
  editor.subtasks=[...existing,{id:uid(),title:title.slice(0,180),done:false}];
  renderEditorSubtasks();$('newSubtask').value='';$('newSubtask').focus();
}

function toggleSubtask(id,date,subId,checked){
  const task=state.tasks.find(t=>t.id===id);
  if(!task||!task.subtasks?.some(s=>s.id===subId))return;
  if(task.repeat&&task.repeat!=='none'){
    task.subtaskByDate=task.subtaskByDate||{};
    task.subtaskByDate[date]={...(task.subtaskByDate[date]||{}),[subId]:checked};
  }else{
    const s=task.subtasks.find(s=>s.id===subId);
    s.done=checked;
  }
  save();render();
}
function openEditor(source='new',id=null,occurrence=null,date=null,atMinutes=null){
  editor={source,id,occurrence,date};$('taskForm').reset();$('editError').hidden=true;
  const task=source==='task'?state.tasks.find(t=>t.id===id):
    source==='inbox'?state.inbox.find(t=>t.id===id):null;
  $('taskDialogTitle').textContent=source==='new'?'Новая задача':'Редактирование задачи';
  $('editTitle').value=task?.title||'';
  $('editDate').value=source==='inbox'?'':(task?.repeat!=='none'&&occurrence?occurrence:task?.date||date||focusedDay);
  $('editCategory').value=task?.category||'personal';
  $('editPriority').value=task?.priority||'normal';
  const mins=task?planned(task):30;
  $('editHours').value=Math.floor(mins/60);
  $('editMinutes').value=mins%60;
  $('editMeasure').value=task?.measureMode||(task?.start?'interval':'duration');
  $('editTargetCount').value=task?.targetCount??30;
  const selectedDay=occurrence||task?.date||date||focusedDay;
  $('editActualCount').value=task?.repeat&&task.repeat!=='none'
    ?task.actualCountByDate?.[selectedDay]??''
    :task?.actualCount??'';
  $('editStart').value=task?.start||'';
  $('editEnd').value=task?.end||'';
  if(Number.isFinite(atMinutes)){
    const tmp=defaultTask('x',date||focusedDay);
    applyTime(tmp,atMinutes);
    $('editStart').value=tmp.start;$('editEnd').value=tmp.end;
    $('editMeasure').value='interval';
  }
  $('editRepeat').value=task?.repeat||'none';
  $('editRepeatInterval').value=task?.repeatInterval||2;
  const days=task?.repeatDays||[];
  $('repeatDayFields').querySelectorAll('input[type=checkbox]').forEach(input=>{
    input.checked=days.includes(Number(input.value));
  });
  $('editStatus').value=task&&source==='task'?statusOf(task,selectedDay):'todo';
  const actualValue=source==='task'&&task
    ?(task.repeat&&task.repeat!=='none'?task.actualByDate?.[selectedDay]:task.actualMinutes)
    :null;
  $('editActual').value=actualValue??'';
  $('editNotes').value=task?.notes||'';
  editor.subtasks=(task?.subtasks||[]).map(s=>({...s,done:task?.repeat&&task.repeat!=='none'
    ?task.subtaskByDate?.[selectedDay]?.[s.id]===true:s.done===true}));
  renderEditorSubtasks();
  toggleEditorExtras();
  $('deleteTask').hidden=source==='new';
  $('saveTemplate').checked=false;
  openDialog('taskDialog');$('editTitle').focus();
}
function submitEditor(event){
  event.preventDefault();
  const title=$('editTitle').value.trim(),date=$('editDate').value;
  const measureMode=$('editMeasure').value;
  const minutes=minutesFromParts($('editHours').value,$('editMinutes').value);
  const actual=$('editActual').value===''?null:Number($('editActual').value);
  const targetCount=measureMode==='count'?Number($('editTargetCount').value):null;
  const actualCount=measureMode==='count'&&$('editActualCount').value!==''?Number($('editActualCount').value):null;
  const repeat=$('editRepeat').value;
  const repeatDays=[...$('repeatDayFields').querySelectorAll('input:checked')].map(x=>Number(x.value));
  const repeatInterval=Number($('editRepeatInterval').value||2);
  const subtasks=collectEditorSubtasks();
  if(!title||Number.isNaN(minutes)){showEditError('Введите название и правильное время.');return;}
  if(measureMode==='count'&&(!Number.isInteger(targetCount)||targetCount<1||targetCount>100000
    ||(actualCount!==null&&(!Number.isInteger(actualCount)||actualCount<0||actualCount>100000)))){
    showEditError('Укажите количество повторений и фактическое число.');return;
  }
  if(repeat==='custom'&&!repeatDays.length){showEditError('Выберите дни повторения.');return;}
  if(repeat==='interval'&&(!Number.isInteger(repeatInterval)||repeatInterval<2||repeatInterval>365)){
    showEditError('Укажите период от 2 до 365 дней.');return;
  }
  const fields={title:title.slice(0,120),date,start:measureMode==='interval'?$('editStart').value:'',
    end:measureMode==='interval'?$('editEnd').value:'',
    plannedMinutes:measureMode==='count'?0:minutes,actualMinutes:actual,
    category:$('editCategory').value,priority:$('editPriority').value,repeat,
    repeatDays,repeatInterval,measureMode,targetCount,actualCount,
    status:$('editStatus').value,notes:$('editNotes').value.trim(),subtasks};
  if(fields.start&&!fields.end){
    const start=timeMinutes(fields.start),end=Math.min(1439,start+Math.max(15,minutes));
    fields.end=String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0');
  }
  if(fields.start&&fields.end)fields.plannedMinutes=timeMinutes(fields.end)-timeMinutes(fields.start);
  if(measureMode==='interval'&&!fields.start){showEditError('Для интервала укажите начало.');return;}
  if(!date) {
    if(repeat!=='none'||measureMode==='count'){showEditError('Для повторений и количества укажите дату.');return;}
    if(editor.source==='task'){
      const index=state.tasks.findIndex(t=>t.id===editor.id);
      if(index>=0){moveToTrash('task',state.tasks[index]);state.tasks.splice(index,1);}
    }
    const existing=editor.source==='inbox'?state.inbox.find(t=>t.id===editor.id):null;
    const newInbox={id:existing?.id||uid(),title:fields.title,plannedMinutes:minutes,
      category:fields.category,priority:fields.priority,notes:fields.notes};
    if(existing)Object.assign(existing,newInbox);else state.inbox.push(newInbox);
  }else{
    const old=editor.source==='task'?state.tasks.find(t=>t.id===editor.id):null;
    const candidate={...(old||defaultTask(fields.title,date)),...fields};
    if(old?.repeat&&old.repeat!=='none' && fields.repeat!=='none' && date===(editor.occurrence||old.date)){
      candidate.date=old.date;
    }
    const day=editor.occurrence||date;
    if(candidate.repeat!=='none'){
      candidate.statusByDate={...(old?.statusByDate||{}),[day]:fields.status};
      candidate.actualByDate={...(old?.actualByDate||{})};
      if(actual!==null)candidate.actualByDate[day]=actual;
      else delete candidate.actualByDate[day];
      candidate.actualCountByDate={...(old?.actualCountByDate||{})};
      if(actualCount!==null)candidate.actualCountByDate[day]=actualCount;
      else delete candidate.actualCountByDate[day];
      candidate.subtasks=subtasks.map(s=>({...s,done:false}));
      candidate.subtaskByDate={...(old?.subtaskByDate||{}),
        [day]:Object.fromEntries(subtasks.map(s=>[s.id,s.done]))};
      const done=new Set(old?.completedDates||[]);
      if(fields.status==='done')done.add(day);else done.delete(day);
      candidate.completedDates=[...done].sort();
      candidate.actualMinutes=null;candidate.actualCount=null;candidate.completed=false;
    }else{
      candidate.statusByDate={};candidate.completedDates=[];candidate.actualByDate={};
      candidate.actualCountByDate={};candidate.subtaskByDate={};
      candidate.completed=fields.status==='done';
    }
    const err=validateTask(candidate);
    if(err){showEditError(err);return;}
    if(old)Object.assign(old,candidate);
    else{
      state.tasks.push(candidate);
      if(editor.source==='inbox')state.inbox=state.inbox.filter(x=>x.id!==editor.id);
    }
  }
  if($('saveTemplate').checked&&!state.templates.some(t=>t.title===fields.title)){
    state.templates.push({id:uid(),title:fields.title,plannedMinutes:minutes,
      category:fields.category,priority:fields.priority,notes:fields.notes});
  }
  closeDialog('taskDialog');save();render();notify('Задача сохранена');
}
function showEditError(error){$('editError').textContent=error;$('editError').hidden=false;}
function deleteEditor(){
  if(!editor)return;
  const task=editor.source==='task'?state.tasks.find(t=>t.id===editor.id):null;
  if(task?.repeat&&task.repeat!=='none' && !confirm('Удалить всю повторяющуюся серию задач?'))return;
  if(editor.source==='inbox'){
    const item=state.inbox.find(t=>t.id===editor.id);
    moveToTrash('inbox',item);
    state.inbox=state.inbox.filter(t=>t.id!==editor.id);
  }else if(editor.source==='task'){
    moveToTrash('task',task);
    state.tasks=state.tasks.filter(t=>t.id!==editor.id);
  }
  closeDialog('taskDialog');save();render();notify('Задача помещена в корзину');
}
function reviewSummary(){
  const date=$('reviewDate').value;if(!parseDate(date))return;
  const tasks=occurrencesForWeek(state.tasks,startOfWeek(date)).filter(t=>t.occurrenceDate===date);
  const done=tasks.filter(t=>t.done).length;
  const plan=tasks.reduce((n,t)=>n+planned(t),0);
  const fact=tasks.reduce((n,t)=>n+(t.actualMinutes||0),0);
  $('reviewStats').innerHTML=[
    ['Выполнено',done+' / '+tasks.length],['План',formatMinutes(plan)],['Факт',formatMinutes(fact)]
  ].map(([name,n])=>'<div><small>'+name+'</small><strong>'+n+'</strong></div>').join('');
  $('reviewNotes').value=state.reviews[date]||'';
}
function openReview(){
  $('reviewDate').value=focusedDay;reviewSummary();openDialog('reviewDialog');
}
function saveReview(){
  const date=$('reviewDate').value;if(!parseDate(date))return;
  state.reviews[date]=$('reviewNotes').value.slice(0,5000);save();closeDialog('reviewDialog');notify('Итоги дня сохранены');
}
function rollTomorrow(){
  const date=$('reviewDate').value;if(!parseDate(date))return;
  const tomorrow=addDays(date,1);
  const tasks=state.tasks.filter(t=>t.repeat==='none'&&t.date===date&&statusOf(t,date)!=='done');
  if(!tasks.length){notify('Нет незавершённых задач для переноса');return;}
  if(!confirm('Перенести '+tasks.length+' незавершённых задач на '+dayLabel(tomorrow)+'?'))return;
  tasks.forEach(t=>{
    state.rolloverLog=state.rolloverLog||[];
    state.rolloverLog.push({id:t.id,from:t.date,to:tomorrow,title:t.title});
    t.date=tomorrow;
  });
  state.rolloverLog=state.rolloverLog.slice(-2000);
  save();reviewSummary();render();notify('Незавершённые дела перенесены');
}
function openAnalytics(){
  statsScope='week';
  renderAnalytics();openDialog('statsDialog');
}

function renderAnalytics(){
  const month=parseDate(week);
  const monthKey=week.slice(0,7);
  const first=monthKey+'-01',next= new Date(month.getFullYear(),month.getMonth()+1,1);
  const last=toISO(new Date(next.getFullYear(),next.getMonth(),0,12));
  const firstWeek=startOfWeek(first);
  const weeks=Math.ceil((Math.round((parseDate(last)-parseDate(firstWeek))/86400000)+1)/7);
  const all=statsScope==='month'
    ?Array.from({length:weeks},(_,i)=>occurrencesForWeek(state.tasks,addDays(firstWeek,i*7)))
      .flat().filter(t=>t.occurrenceDate.startsWith(monthKey))
    :allTasks();
  const days=statsScope==='month'
    ?Array.from({length:parseDate(last).getDate()},(_,i)=>addDays(first,i))
    :Array.from({length:7},(_,i)=>addDays(week,i));
  const stats=timeStats(all),scope=statsScope==='month'?'месяца':'недели';
  const cards=[['Задач',stats.total],['Завершено',stats.done],['План',formatMinutes(stats.plan)],
    ['Факт',formatMinutes(stats.fact)]];
  const cats=Object.keys(CATEGORIES).map(category=>{
    const entries=all.filter(t=>t.category===category),s=timeStats(entries);
    return {category,name:CATEGORIES[category],...s};
  }).filter(x=>x.total>0).sort((a,b)=>b.plan-a.plan);
  $('statsContent').innerHTML='<div class="stats-scope"><button type="button" data-stats-scope="week" '
    +(statsScope==='week'?'class="active"':'')+'>Неделя</button><button type="button" data-stats-scope="month" '
    +(statsScope==='month'?'class="active"':'')+'>Месяц</button></div>'
    +'<div class="stats-metrics">'+cards.map(([label,n])=>
      '<div class="metric-box"><small>'+label+'</small><strong>'+n+'</strong></div>').join('')+'</div>'
    +'<p>Выполнение '+scope+': '+stats.completion+'%. '
    +(stats.plan>0&&stats.measured?'Факт / план: '+Math.round(stats.fact/stats.plan*100)+'%.':'Незаписанное время не считается фактом.')+'</p>'
    +'<h3>По категориям</h3>'
    +(stats.countPlan?'<p>Повторения: '+stats.countFact+' из '+stats.countPlan+'</p>':'')
    +(cats.length?cats.map(cat=>'<div class="stat-day"><div style="flex:1"><strong>'
       +escapeHTML(cat.name)+'</strong><div class="stat-bar"><i style="width:'+cat.completion+'%"></i></div></div>'
       +'<span>'+cat.done+'/'+cat.total+' · '+formatMinutes(cat.plan)+' / '+formatMinutes(cat.fact)+'</span></div>').join('')
      :'<p>Пока нет задач за выбранный период.</p>')
    +'<h3>По дням</h3>'
    +days.map(d=>{
      const s=timeStats(all.filter(t=>t.occurrenceDate===d));
      return '<div class="stat-day"><div style="flex:1"><strong>'+shortDays[(parseDate(d).getDay()+6)%7]
        +' '+parseDate(d).getDate()+'</strong><div class="stat-bar"><i style="width:'+s.completion+'%"></i></div></div>'
        +'<span>'+s.done+'/'+s.total+' · '+formatMinutes(s.plan)+' / '+formatMinutes(s.fact)+'</span></div>';
    }).join('');
}
function renderTrash(){
  const items=(state.trash||[]).slice().reverse(),backups=getBackups();
  $('trashContent').innerHTML='<p class="muted-note">Удалённые задачи хранятся 30 дней в этом браузерном профиле.</p>'
    +(items.length?items.map((item,i)=>
      '<div class="template-row"><strong>'+escapeHTML(item.value.title||'Без названия')+'</strong><small>'
      +(item.kind==='task'?'Задача':item.kind==='template'?'Шаблон':'Без даты')+'</small>'
      +'<button type="button" class="template-add" data-restore-trash="'+(items.length-1-i)+'">Восстановить</button></div>').join('')
    :'<p class="inbox-empty">Корзина пуста</p>')
    +'<h3>Локальные копии</h3>'
    +'<p class="muted-note">Сохраняются в профиле приложения, до 7 ежедневных копий. Для защиты от потери профиля экспортируй JSON.</p>'
    +(backups.length?backups.slice().reverse().map((b,i)=>
      '<div class="template-row"><strong>'+escapeHTML(b.day||'Копия')+'</strong>'
      +'<button type="button" class="template-add" data-restore-backup="'+(backups.length-1-i)+'">Восстановить копию</button></div>').join('')
      :'<p class="inbox-empty">Копии появятся при редактировании задач.</p>')
    +'<h3>История переносов</h3>'
    +(state.rolloverLog?.length?state.rolloverLog.slice(-20).reverse().map(item=>
      '<div class="history-row"><strong>'+escapeHTML(item.title)+'</strong> '
      +escapeHTML(item.from)+' → '+escapeHTML(item.to)+'</div>').join('')
      :'<p class="inbox-empty">Переносов пока не было.</p>');
}
function restoreTrash(index){
  const item=state.trash?.[index];
  if(!item)return;
  const target=item.kind==='task'?state.tasks:item.kind==='template'?state.templates:state.inbox;
  if(target.length>10000){notify('Достигнут лимит данных');return;}
  const copy=JSON.parse(JSON.stringify(item.value));
  if(target.some(t=>t.id===copy.id))copy.id=uid();
  target.push(copy);state.trash.splice(index,1);
  save();render();renderTrash();notify('Восстановлено');
}
function restoreBackup(index){
  const backup=getBackups()[index];if(!backup)return;
  if(!confirm('Заменить текущие задачи состоянием на '+backup.day+'? Текущая версия останется в резервной копии при следующем изменении дня. Перед восстановлением рекомендуется экспорт JSON.'))return;
  try{
    const current=localStorage.getItem(KEY);
    const snapshots=getBackups();
    if(current)snapshots.push({day:today(),createdAt:Date.now(),data:JSON.parse(current)});
    localStorage.setItem(BACKUP_KEY,JSON.stringify(snapshots.slice(-7)));
    state=sanitizeBackup(backup.data);save();render();renderTrash();notify('Копия восстановлена');
  }catch{notify('Не удалось восстановить резервную копию');}
}
function renderTemplates(){
  $('templateContent').innerHTML=state.templates.length?state.templates.map(t=>
    '<div class="template-row"><strong>'+escapeHTML(t.title)+'</strong><small>'+duration(planned(t))+'</small>'
    +'<button type="button" class="template-add" data-template="'+escapeHTML(t.id)+'">В список</button>'
    +'<button type="button" class="template-edit" data-template-edit="'+escapeHTML(t.id)+'" aria-label="Изменить шаблон">Изменить</button>'
    +'<button type="button" class="template-delete" data-template-delete="'+escapeHTML(t.id)
    +'" aria-label="Удалить шаблон '+escapeHTML(t.title)+'" title="Удалить шаблон">'+icon('trash')+'</button></div>').join('')
    :'<p class="inbox-empty">Пока нет шаблонов. Создайте первый в форме выше.</p>';
}
function openTemplates(){
  renderTemplates();resetTemplateEditor();openDialog('templateDialog');
}

function resetTemplateEditor(){
  $('templateCreateForm').reset();$('templateEditId').value='';
  $('templateSaveButton').textContent='＋ Создать';
  $('cancelTemplateEdit').hidden=true;
}
function editTemplate(id){
  const tpl=state.templates.find(t=>t.id===id);if(!tpl)return;
  $('templateEditId').value=id;
  $('templateNewTitle').value=tpl.title;
  $('templateNewCategory').value=tpl.category;
  $('templateNewMinutes').value=tpl.plannedMinutes;
  $('templateSaveButton').textContent='Сохранить';
  $('cancelTemplateEdit').hidden=false;$('templateNewTitle').focus();
}
function createTemplate(event){
  event.preventDefault();
  const title=$('templateNewTitle').value.trim(),minsText=$('templateNewMinutes').value.trim();
  const plannedMinutes=Number(minsText),category=$('templateNewCategory').value,editing=$('templateEditId').value;
  if(!title||title.length>120){notify('Введите название задачи до 120 символов');return;}
  if(!minsText||!Number.isInteger(plannedMinutes)||plannedMinutes<0||plannedMinutes>1440){
    notify('Укажите время от 0 до 1440 минут');return;
  }
  if(!CATEGORIES[category]){notify('Выберите категорию');return;}
  if(!editing&&state.templates.length>=2000){notify('Достигнут лимит шаблонов');return;}
  if(state.templates.some(t=>t.id!==editing&&t.title.toLocaleLowerCase('ru-RU')===title.toLocaleLowerCase('ru-RU'))){
    notify('Шаблон с таким названием уже существует');return;
  }
  const tpl=editing?state.templates.find(t=>t.id===editing):null;
  if(editing&&!tpl){notify('Шаблон не найден');return;}
  if(tpl)Object.assign(tpl,{title,plannedMinutes,category});
  else state.templates.push({id:uid(),title,plannedMinutes,category,priority:'normal',notes:''});
  save();render();renderTemplates();resetTemplateEditor();
  $('templateNewTitle').focus();notify(editing?'Шаблон обновлён':'Шаблон создан');
}
function deleteTemplate(id){
  const template=state.templates.find(t=>t.id===id);
  if(!template)return;
  if(!confirm('Удалить шаблон «'+template.title+'»? Уже добавленные задачи останутся в расписании.'))return;
  moveToTrash('template',template);
  state.templates=state.templates.filter(t=>t.id!==id);
  if($('templateEditId').value===id)resetTemplateEditor();
  save();render();renderTemplates();notify('Шаблон помещён в корзину');
}
function exportData(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='zadachi-backup-'+today()+'.json';document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importData(file){
  if(!file)return;
  try{
    if(file.size>5_000_000)throw Error('Файл больше 5 МБ.');
    const decoded=sanitizeBackup(JSON.parse(await file.text()));
    if(!confirm('Заменить текущие задачи данными из файла? Сначала сохраните резервную копию.'))return;
    state=decoded;save();render();notify('Данные импортированы');
  }catch(err){notify('Ошибка импорта: '+err.message);}
  finally{$('importFile').value='';}
}

let focusStartedAt=0,focusCheckpointSeconds=0;
let focusTaskDate=null;
function setFocusDuration(minutes){
  if(focusRunning)return;
  if(!Number.isInteger(minutes)||minutes<1||minutes>240){
    notify('Укажите длительность от 1 до 240 минут');return;
  }
  focusDurationMinutes=minutes;
  saveUIPrefs();
  resetTimer();
}
function creditFocusTime(){
  if(!focusRunning||!focusTaskId)return;
  const elapsed=Math.max(0,Math.floor((Date.now()-focusStartedAt)/1000));
  const seconds=focusRemainderSeconds+Math.max(0,elapsed-focusCheckpointSeconds);
  const minutes=Math.floor(seconds/60);
  focusRemainderSeconds=seconds%60;
  focusCheckpointSeconds=elapsed;
  if(!minutes)return;
  const task=state.tasks.find(t=>t.id===focusTaskId);
  if(!task)return;
  if(task.repeat&&task.repeat!=='none'){
    task.actualByDate=task.actualByDate||{};
    task.actualByDate[focusTaskDate]=(task.actualByDate[focusTaskDate]||0)+minutes;
  }else task.actualMinutes=(task.actualMinutes||0)+minutes;
  save();
  const summary=$('focusView')?.querySelector('.focus-summary');
  if(summary&&view==='focus'){
    const actual=timeStats(dayTasks(focusedDay));
    const fact=summary.children[2]?.querySelector('strong');
    if(fact)fact.textContent=actual.measured?formatMinutes(actual.fact):'—';
  }
}
function refreshTimer(){
  if(!$('timerFace'))return;
  const s=focusRemaining;
  $('timerFace').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
  const ring=$('timerFace').closest('.timer-ring');
  if(ring)ring.style.setProperty('--timer-ratio',Math.max(0,Math.min(100,s/(focusDurationMinutes*60)*100))+'%');
}
function timerTick(){
  if(!focusRunning)return;
  creditFocusTime();
  focusRemaining=Math.max(0,Math.ceil((focusEndsAt-Date.now())/1000));
  refreshTimer();
  if(focusRemaining===0){
    focusRunning=false;clearInterval(timerHandle);focusCarryReset();
    if($('timerToggle'))$('timerToggle').textContent='Начать';
    if($('focusTaskSelect'))$('focusTaskSelect').disabled=false;
    notify('Сессия фокуса завершена; факт сохранён');
  }
}
function focusCarryReset(){
  focusCheckpointSeconds=0;focusStartedAt=0;focusRemainderSeconds=0;
}
function toggleTimer(){
  if(focusRunning){
    creditFocusTime();
    focusRemaining=Math.max(0,Math.ceil((focusEndsAt-Date.now())/1000));
    focusRunning=false;clearInterval(timerHandle);
  }else{
    if(focusRemaining<=0)focusRemaining=focusDurationMinutes*60;
    const selector=$('focusTaskSelect');
    if(selector)focusTaskId=selector.value||null;
    focusTaskDate=focusedDay;
    focusStartedAt=Date.now();focusCheckpointSeconds=0;
    focusEndsAt=Date.now()+focusRemaining*1000;
    focusRunning=true;timerHandle=setInterval(timerTick,500);
  }
  if($('focusDurationPreset'))$('focusDurationPreset').disabled=focusRunning;
  if($('focusCustomMinutes'))$('focusCustomMinutes').disabled=focusRunning;
  if($('focusTaskSelect'))$('focusTaskSelect').disabled=focusRunning;
  if($('timerToggle'))$('timerToggle').textContent=focusRunning?'Пауза':'Начать';
  refreshTimer();
}
function resetTimer(){
  if(focusRunning)creditFocusTime();
  focusRunning=false;clearInterval(timerHandle);focusRemaining=focusDurationMinutes*60;focusCarryReset();
  if($('timerToggle'))$('timerToggle').textContent='Начать';
  if($('focusTaskSelect'))$('focusTaskSelect').disabled=false;
  refreshTimer();
}
function setupDrag(){
  document.addEventListener('dragstart',event=>{
    const item=event.target.closest('[draggable=true][data-id]');if(!item)return;
    dragItem={source:item.dataset.source,id:item.dataset.id,date:item.dataset.date||null};
    event.dataTransfer.effectAllowed='move';
    event.dataTransfer.setData('text/plain',JSON.stringify(dragItem));
    item.classList.add('dragging');
  });
  document.addEventListener('dragend',event=>{
    event.target.closest('.dragging')?.classList.remove('dragging');
    document.querySelectorAll('.drop-target').forEach(t=>t.classList.remove('drop-target'));
    dragItem=null;
  });
  document.addEventListener('dragover',event=>{
    const target=event.target.closest('[data-drop-date],.inbox-panel');
    if(!target)return;
    event.preventDefault();event.dataTransfer.dropEffect='move';
    document.querySelectorAll('.drop-target').forEach(t=>t.classList.remove('drop-target'));
    target.classList.add('drop-target');
  });
  document.addEventListener('drop',event=>{
    const target=event.target.closest('[data-drop-date],.inbox-panel');
    if(!target)return;
    event.preventDefault();
    const item=dragItem;if(!item)return;
    document.querySelectorAll('.drop-target').forEach(t=>t.classList.remove('drop-target'));
    if(target.matches('.inbox-panel')){
      if(item.source==='task')moveToInbox(item.id);
      return;
    }
    let at=null;
    if(target.classList.contains('calendar-day')){
      at=calendarMinutesAt(target,event.clientY);
    }
    const date=target.dataset.dropDate;
    if(item.source==='inbox')addInboxToDay(item.id,date,at);
    else moveTask(item.id,item.date,date,at);
  });
}
function setupClick(){
  document.addEventListener('click',event=>{
    const action=event.target.closest('[data-action]');if(action){
      const {action:verb,id,date}=action.dataset;
      if(verb==='add-day')openEditor('new',null,null,date);
      else if(verb==='status')changeStatus(id,date);
      else if(verb==='edit-task')openEditor('task',id,date);
      else if(verb==='edit-inbox')openEditor('inbox',id);
      else if(verb==='inbox-today')addInboxToDay(id,today());
      else if(verb==='toggle-subtask')toggleSubtask(id,date,action.dataset.subId,action.checked);
      else if(verb==='period-status')changeStatus(id,state.tasks.find(t=>t.id===id)?.date||focusedDay);
      else if(verb==='period-edit'||verb==='period-schedule'){
        const task=state.tasks.find(t=>t.id===id);
        if(!task)return;
        closeDialog('periodDialog');
        openEditor('task',id);
        if(verb==='period-schedule'){
          $('editScope').value='day';
          $('editDate').value=focusedDay;
          toggleEditorExtras();
        }
      }
      else if(verb==='start-focus'){
        if(focusRunning&&focusTaskId!==id){notify('Сначала остановите текущий таймер');return;}
        if(!focusRunning)resetTimer();
        focusTaskId=id;chooseDate(date);view='focus';render();
        if(!focusRunning)toggleTimer();
      }
      return;
    }
    if(event.target.closest('[data-close]'))closeDialog(event.target.closest('[data-close]').dataset.close);
    const subRemove=event.target.closest('[data-subtask-remove]');
    if(subRemove&&editor){
      editor.subtasks=collectEditorSubtasks().filter(s=>s.id!==subRemove.dataset.subtaskRemove);
      renderEditorSubtasks();return;
    }
    const editTemplateButton=event.target.closest('[data-template-edit]');
    if(editTemplateButton){editTemplate(editTemplateButton.dataset.templateEdit);return;}
    const restoreItem=event.target.closest('[data-restore-trash]');
    if(restoreItem){restoreTrash(Number(restoreItem.dataset.restoreTrash));return;}
    const restoreCopy=event.target.closest('[data-restore-backup]');
    if(restoreCopy){restoreBackup(Number(restoreCopy.dataset.restoreBackup));return;}
    const scopeButton=event.target.closest('[data-stats-scope]');
    if(scopeButton){statsScope=scopeButton.dataset.statsScope;renderAnalytics();return;}
    const deleteButton=event.target.closest('[data-template-delete]');
    if(deleteButton){
      deleteTemplate(deleteButton.dataset.templateDelete);
      return;
    }
    if(event.target.closest('[data-template]')){
      const tpl=state.templates.find(t=>t.id===event.target.closest('[data-template]').dataset.template);
      if(tpl){state.inbox.push({id:uid(),title:tpl.title,plannedMinutes:tpl.plannedMinutes,
        category:tpl.category,priority:tpl.priority,notes:tpl.notes});save();render();
        closeDialog('templateDialog');notify('Шаблон добавлен в список');}
    }
    const suggestion=event.target.closest('[data-suggestion]');
    if(suggestion){
      $('inboxInput').value=suggestion.dataset.suggestion;
      $('inboxInput').focus();return;
    }
    if(event.target.id==='timerToggle')toggleTimer();
    if(event.target.id==='timerReset')resetTimer();
    const blankDay=event.target.closest('.day-column');
    if(blankDay && !event.target.closest('.task-tile,.day-add,.day-heading,button,input')){
      openEditor('new',null,null,blankDay.dataset.dropDate);
      return;
    }
    if(event.target.closest('.calendar-day')&&event.target===event.target.closest('.calendar-day')){
      const target=event.target;
      openEditor('new',null,null,target.dataset.dropDate,calendarMinutesAt(target,event.clientY));
    }
  });
}
function setupNativeUpdates(){
  const bridge=window.chrome?.webview;
  if(!bridge || typeof bridge.postMessage!=='function')return;
  const button=$('checkUpdates'),label=$('updateStatus');
  button.hidden=false;
  label.hidden=false;
  function showStatus(status,version){
    const versionText=version&&version!=='?'?' · '+version:'';
    const messages={
      checking:'Проверяем обновления…',
      current:'Установлена актуальная версия'+versionText,
      updated:'Обновлено до версии'+versionText,
      failed:'Не удалось проверить GitHub. Локальная версия работает.'
    };
    label.textContent=messages[status]||'';
    label.hidden=!messages[status];
    button.disabled=status==='checking';
    button.textContent=status==='checking'?'Проверка…':'Проверить обновления';
  }
  bridge.addEventListener('message',event=>{
    if(typeof event.data!=='string')return;
    const result=/^nedelnik:update:(checking|current|updated|failed):([a-f0-9?]{1,16})$/.exec(event.data);
    if(!result)return;
    showStatus(result[1],result[2]);
    if(result[1]==='updated')notify('Планировщик обновлён'+(result[2]!=='?'?' · '+result[2]:''));
  });
  button.addEventListener('click',()=>{
    if(button.disabled)return;
    showStatus('checking','');
    bridge.postMessage('nedelnik:check-updates');
  });
  showStatus('checking','');
}
function setup(){
  $('inboxForm').addEventListener('submit',event=>{
    event.preventDefault();captureInbox($('inboxInput').value);$('inboxInput').value='';$('inboxInput').focus();
  });
  $('newInboxTask').addEventListener('click',()=>$('inboxInput').focus());
  $('sidebarToday').addEventListener('click',()=>{
    chooseDate(today());view='board';render();
  });
  $('inboxToggle').addEventListener('click',()=>{
    const hidden=document.querySelector('.workspace').classList.toggle('inbox-hidden');
    $('inboxToggle').setAttribute('aria-expanded',String(!hidden));
    saveUIPrefs();
  });
  $('prevPeriod').addEventListener('click',()=>{week=addDays(week,-7);focusedDay=week;render();});
  $('nextPeriod').addEventListener('click',()=>{week=addDays(week,7);focusedDay=week;render();});
  $('goToday').addEventListener('click',()=>chooseDate(today()));
  $('periodButton').addEventListener('click',()=>{
    try{if($('jumpDate').showPicker)$('jumpDate').showPicker();else $('jumpDate').focus();}
    catch{$('jumpDate').focus();}
  });
  $('jumpDate').addEventListener('change',event=>chooseDate(event.target.value));
  document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>{
    view=btn.dataset.view;render();
  }));
  $('openReview').addEventListener('click',openReview);
  $('reviewDate').addEventListener('change',reviewSummary);
  $('saveReview').addEventListener('click',saveReview);
  $('rollTomorrow').addEventListener('click',rollTomorrow);
  $('openStats').addEventListener('click',openAnalytics);
  $('openPeriodPlans').addEventListener('click',()=>{renderPeriodDialog();openDialog('periodDialog');});
  $('newWeekPlan').addEventListener('click',()=>{
    closeDialog('periodDialog');openEditor('new',null,null,week);
    $('editScope').value='week';toggleEditorExtras();
  });
  $('newMonthPlan').addEventListener('click',()=>{
    closeDialog('periodDialog');openEditor('new',null,null,week);
    $('editScope').value='month';toggleEditorExtras();
  });
  $('openTemplates').addEventListener('click',openTemplates);
  $('openTrash').addEventListener('click',()=>{renderTrash();openDialog('trashDialog');});
  $('autoCarry').checked=state.settings?.autoCarry===true;
  $('autoCarry').addEventListener('change',event=>{
    if(event.target.checked&&!confirm('Включить автоперенос? При открытии планировщика все просроченные невыполненные разовые дела перейдут на сегодняшний день.')){
      event.target.checked=false;return;
    }
    state.settings=state.settings||{};
    state.settings.autoCarry=event.target.checked;
    save();maybeCarryOverdue();render();$('moreMenu').open=false;
    notify(event.target.checked?'Автоперенос включён':'Автоперенос выключен');
  });
  $('openQuickTemplate').addEventListener('click',openTemplates);
  $('templateCreateForm').addEventListener('submit',createTemplate);
  $('cancelTemplateEdit').addEventListener('click',resetTemplateEditor);
  $('editMeasure').addEventListener('change',toggleEditorExtras);
  $('editRepeat').addEventListener('change',toggleEditorExtras);
  $('addSubtask').addEventListener('click',addEditorSubtask);
  $('newSubtask').addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();addEditorSubtask();}
  });
  $('exportButton').addEventListener('click',()=>{$('moreMenu').open=false;exportData();});
  $('importButton').addEventListener('click',()=>{$('moreMenu').open=false;$('importFile').click();});
  $('importFile').addEventListener('change',e=>importData(e.target.files?.[0]));
  $('taskForm').addEventListener('submit',submitEditor);
  $('deleteTask').addEventListener('click',deleteEditor);
  document.addEventListener('change',event=>{
    if(event.target.id==='focusDate'){
      if(focusRunning){notify('Сначала остановите таймер');event.target.value=focusedDay;return;}
      chooseDate(event.target.value);view='focus';render();
    }
    if(event.target.id==='focusDurationPreset'&&!focusRunning){
      const custom=event.target.value==='custom';
      $('focusCustomLabel').hidden=!custom;
      if(custom){
        $('focusCustomMinutes').value=focusDurationMinutes;
        $('focusCustomMinutes').focus();
      }else setFocusDuration(Number(event.target.value));
    }
    if(event.target.id==='focusCustomMinutes'&&!focusRunning){
      const minutes=Number(event.target.value);
      if(event.target.value!==''&&Number.isInteger(minutes)&&minutes>=1&&minutes<=240){
        setFocusDuration(minutes);
      }else{
        notify('Укажите длительность от 1 до 240 минут');
        event.target.value=focusDurationMinutes;
      }
    }
    if(event.target.id==='focusTaskSelect'&&!focusRunning){
      const next=event.target.value||null;
      if(next!==focusTaskId)focusRemainderSeconds=0;
      focusTaskId=next;
    }
  });
  for(const id of ['taskDialog','reviewDialog','statsDialog','templateDialog','trashDialog','periodDialog']){
    $(id).addEventListener('click',event=>{if(event.target===$(id))closeDialog(id);});
  }
  document.addEventListener('keydown',event=>{
    if(event.target.matches('input,textarea,select')||event.ctrlKey||event.altKey||event.metaKey)return;
    if(event.key.toLowerCase()==='n'){event.preventDefault();$('inboxInput').focus();}
  });
  setupDrag();setupClick();
  setupNativeUpdates();
  document.querySelector('.workspace').classList.toggle('inbox-hidden',savedUI.inboxHidden);
  $('inboxToggle').setAttribute('aria-expanded',String(!savedUI.inboxHidden));
  decorateIcons();
  window.addEventListener('resize',()=>{if(view==='calendar')renderCalendar();});
  window.addEventListener('focus',()=>{if(maybeCarryOverdue())render();});
  maybeCarryOverdue();
  render();
  if(recoveredFromBackup)notify('Данные восстановлены из последней локальной копии. Рекомендуется экспорт JSON.');
  // Let the native Windows host reveal the window only after its UI exists.
  // Keep browser-only use working even when the WebView2 bridge is absent.
  if(window.chrome?.webview?.postMessage){
    setTimeout(()=>{
      if(document.querySelector('#boardView .day-column')
          ||document.querySelector('#calendarView .timeline-body')
          ||document.querySelector('#focusView .focus-list')){
        window.chrome.webview.postMessage('nedelnik:ready');
      }
    },60);
  }
}
setup();
