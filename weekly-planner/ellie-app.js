import { CATEGORIES, WEEKDAYS, toISO, addDays, startOfWeek, parseDate, occurrencesForWeek,
  timeMinutes, minutesFromParts, formatMinutes, taskDuration, timeStats,
  validateTask, sanitizeBackup, blankData } from './logic.mjs';

const KEY='nedelnik-planner-v1';
const $=id=>document.getElementById(id);
const today=()=>toISO(new Date());
const shortDays=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const escapeHTML=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>globalThis.crypto?.randomUUID?.()||'task-'+Date.now()+'-'+Math.random().toString(36).slice(2);
let state=load(),week=startOfWeek(today()),focusedDay=today(),view='board',editor=null;
let dragItem=null,toastTimeout=null,focusRemaining=25*60,focusRunning=false,focusEndsAt=0,timerHandle=null;

function load() {
  try {
    const str=localStorage.getItem(KEY);
    return str?sanitizeBackup(JSON.parse(str)):blankData();
  }catch(error){
    console.error('Saved data cannot be read',error);
    return blankData();
  }
}
function save(){
  try{localStorage.setItem(KEY,JSON.stringify(state));}
  catch(error){notify('Не удалось сохранить: используйте экспорт JSON');console.error(error);}
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
  return task.repeat==='daily'||task.repeat==='weekly'
    ?(task.statusByDate?.[date]??((task.completedDates||[]).includes(date)?'done':'todo'))
    :(task.status??(task.completed?'done':'todo'));
}
function planned(task){return Number.isInteger(task.plannedMinutes)?task.plannedMinutes:taskDuration(task);}
function duration(estimate){return estimate>0?formatMinutes(estimate):'Без оценки';}
function dot(category){return '<span class="category-dot '+escapeHTML(category||'other')+'"></span>';}
function renderInbox(){
  $('inboxCount').textContent=state.inbox.length;
  $('inboxList').innerHTML=state.inbox.length?state.inbox.map(t=>
    '<article class="inbox-item" draggable="true" data-source="inbox" data-id="'+escapeHTML(t.id)+'">'
    +'<button type="button" data-action="edit-inbox" data-id="'+escapeHTML(t.id)+'" aria-label="Изменить задачу">○</button>'
    +'<div class="item-main"><div class="item-title">'+escapeHTML(t.title)+'</div>'
    +'<div class="item-subline">'+dot(t.category)+escapeHTML(CATEGORIES[t.category]||'Личное')+' · '+duration(planned(t))+'</div></div>'
    +'<button type="button" data-action="inbox-today" data-id="'+escapeHTML(t.id)+'" title="Запланировать на сегодня">→</button>'
    +'</article>').join('')
    :'<p class="inbox-empty">Здесь живут дела без даты.<br>Добавь мысль — затем перетащи её в расписание.</p>';
}
function card(t,day){
  const status=statusOf(t,day),done=status==='done';
  const estimate=planned(t),sub=[dot(t.category),escapeHTML(CATEGORIES[t.category]||'Другое')];
  if(t.start)sub.push('· '+escapeHTML(t.start));
  const meta=sub.join('');
  return '<article class="task-tile '+(done?'done ':'')+'priority-'+escapeHTML(t.priority||'normal')
    +'" data-source="task" draggable="true" data-id="'+escapeHTML(t.id)+'" data-date="'+day+'">'
    +'<button type="button" class="task-check '+(done?'done':status==='partial'?'partial':'')
    +'" data-action="status" data-id="'+escapeHTML(t.id)+'" data-date="'+day
    +'" aria-label="Изменить статус: '+escapeHTML(t.title)+'">'+(done?'✓':status==='partial'?'−':'')+'</button>'
    +'<button type="button" class="task-edit" data-action="edit-task" data-id="'+escapeHTML(t.id)+'" data-date="'+day+'">'
    +'<span class="item-title">'+escapeHTML(t.title)+'</span><span class="item-subline">'+meta+'</span></button>'
    +(estimate>0?'<span class="time-chip">'+formatMinutes(estimate)+'</span>':'')
    +'</article>';
}
function renderBoard(){
  const all=allTasks();
  $('boardView').innerHTML=Array.from({length:7},(_,i)=>{
    const date=addDays(week,i),tasks=all.filter(t=>t.occurrenceDate===date),now=date===today();
    const estimate=tasks.reduce((sum,t)=>sum+planned(t),0);
    return '<section class="day-column '+(now?'today ':'')+(i>=5?'weekend':'')
      +'" data-drop-date="'+date+'" aria-label="'+WEEKDAYS[i]+' '+dayLabel(date)+'">'
      +'<div class="day-heading"><span class="day-name"><strong class="'+(now?'today-number':'')+'">'
      +shortDays[i]+' '+parseDate(date).getDate()+'</strong></span><span class="day-estimate">'
      +(estimate?formatMinutes(estimate):'')+'</span></div>'
      +'<button type="button" class="day-add" data-action="add-day" data-date="'+date+'">＋ Добавить задачу</button>'
      +'<div class="day-tasks">'+tasks.map(t=>card(t,date)).join('')+'</div></section>';
  }).join('');
}
function renderCalendar(){
  const tasks=allTasks(),startHour=6,endHour=23;
  const head='<div class="timeline-head"><span></span>'
    +Array.from({length:7},(_,i)=>'<div>'+shortDays[i]+' '+parseDate(addDays(week,i)).getDate()+'</div>').join('')
    +'</div>';
  const labels='<div class="hour-labels">'+Array.from({length:endHour-startHour+1},(_,i)=>
    '<span class="hour-label" style="top:'+(i*60)+'px">'+String(i+startHour).padStart(2,'0')+':00</span>').join('')+'</div>';
  const columns=Array.from({length:7},(_,i)=>{
    const date=addDays(week,i);
    return '<div class="calendar-day" data-drop-date="'+date+'">'+tasks.filter(t=>t.occurrenceDate===date&&t.start).map(t=>{
      const start=timeMinutes(t.start);if(Number.isNaN(start))return '';
      const mins=planned(t)>0?planned(t):60;
      const top=Math.max(0,start-startHour*60);
      if(top>(endHour-startHour)*60)return '';
      const ht=Math.min((endHour-startHour)*60-top,Math.max(25,mins));
      return '<div class="time-block '+escapeHTML(t.category)+'" draggable="true" data-source="task" data-id="'
        +escapeHTML(t.id)+'" data-date="'+date+'" style="top:'+top+'px;height:'+ht
        +'px" title="'+escapeHTML(t.title)+'"><strong>'+escapeHTML(t.title)
        +'</strong><small>'+escapeHTML(t.start)+(t.end?'–'+escapeHTML(t.end):' · '+formatMinutes(mins))+'</small></div>';
    }).join('')+'</div>';
  }).join('');
  const unscheduled=tasks.filter(t=>!t.start).length;
  $('calendarView').innerHTML=head+'<div class="timeline-body">'+labels+columns+'</div>'
    +'<div class="calendar-unscheduled">Перетаскивай задачи на свободное время с 06:00 до 23:00. '
    +unscheduled+' дел без конкретного времени — на вкладке «Задачи».</div>';
}
function renderFocus(){
  const tasks=dayTasks(focusedDay),done=tasks.filter(t=>t.done).length;
  $('focusView').innerHTML='<div class="focus-list"><h2>План на '+dayLabel(focusedDay)+'</h2>'
    +'<div class="focus-day-picker"><input type="date" id="focusDate" value="'+focusedDay+'" aria-label="Дата для режима фокуса" />'
    +'　'+done+' из '+tasks.length+' выполнено</div>'
    +'<button class="day-add" type="button" data-action="add-day" data-date="'+focusedDay+'">＋ Добавить задачу</button>'
    +(tasks.length?tasks.map(t=>card(t,focusedDay)).join(''):'<p class="inbox-empty">На этот день пока нет задач</p>')+'</div>'
    +'<div class="focus-timer"><span class="eyebrow">Сосредоточенная работа</span><h2>Фокус-таймер</h2>'
    +'<div class="timer-face" id="timerFace">25:00</div><p>25 минут работы, затем небольшой перерыв</p>'
    +'<div class="timer-actions"><button type="button" class="primary-action" id="timerToggle">'
    +(focusRunning?'Пауза':'Начать')+'</button><button type="button" class="quiet-action" id="timerReset">Сброс</button></div></div>';
  refreshTimer();
}
function render(){
  $('periodTitle').textContent=weekLabel(week);
  $('jumpDate').value=focusedDay;
  $('boardView').hidden=view!=='board';$('calendarView').hidden=view!=='calendar';$('focusView').hidden=view!=='focus';
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  $('viewDescription').textContent=view==='board'?'Перетаскивай задачи между днями'
    :view==='calendar'?'Планируй время по часам':'Выбери главное и работай над этим';
  const stats=timeStats(allTasks());
  $('weekProgress').textContent=stats.done+' из '+stats.total+' выполнено · '+formatMinutes(stats.plan)+' в планах';
  renderInbox();
  if(view==='board')renderBoard();
  else if(view==='calendar')renderCalendar();
  else renderFocus();
}
function defaultTask(title,date){
  return {id:uid(),title,date,start:'',end:'',plannedMinutes:30,actualMinutes:null,actualByDate:{},
    category:'personal',priority:'normal',repeat:'none',notes:'',completed:false,completedDates:[],
    status:'todo',statusByDate:{},measureMode:'duration',targetCount:null,actualCount:null,actualCountByDate:{}};
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
  if(task.repeat!=='none') {
    const original=occurrencesForWeek([task],startOfWeek(fromDate)).find(t=>t.occurrenceDate===fromDate);
    if(!original)return;
    const copy={...defaultTask(original.title,toDate),category:original.category,
      priority:original.priority,notes:original.notes,plannedMinutes:planned(original)};
    if(Number.isFinite(atMinutes))applyTime(copy,atMinutes);
    state.tasks.push(copy);
    notify('Повторяющаяся задача скопирована на выбранный день');
  }else{
    task.date=toDate;
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
  $('editStart').value=task?.start||'';
  $('editEnd').value=task?.end||'';
  if(Number.isFinite(atMinutes)){
    const tmp=defaultTask('x',date||focusedDay);
    applyTime(tmp,atMinutes);
    $('editStart').value=tmp.start;$('editEnd').value=tmp.end;
  }
  $('editRepeat').value=task?.repeat||'none';
  $('editStatus').value=task&&source==='task'?statusOf(task,occurrence||task.date):'todo';
  const actualValue=source==='task'&&task
    ?(task.repeat!=='none'?task.actualByDate?.[occurrence||task.date]:task.actualMinutes)
    :null;
  $('editActual').value=actualValue??'';
  $('editNotes').value=task?.notes||'';
  $('deleteTask').hidden=source==='new';
  $('saveTemplate').checked=false;
  openDialog('taskDialog');$('editTitle').focus();
}
function submitEditor(event){
  event.preventDefault();
  const title=$('editTitle').value.trim(),date=$('editDate').value;
  const minutes=minutesFromParts($('editHours').value,$('editMinutes').value);
  const actual=$('editActual').value===''?null:Number($('editActual').value);
  if(!title||Number.isNaN(minutes)){showEditError('Введите название и правильное время.');return;}
  const fields={title:title.slice(0,120),date,start:$('editStart').value,end:$('editEnd').value,
    plannedMinutes:minutes,actualMinutes:actual,category:$('editCategory').value,
    priority:$('editPriority').value,repeat:$('editRepeat').value,
    status:$('editStatus').value,notes:$('editNotes').value.trim()};
  if(fields.start && !fields.end){
    const start=timeMinutes(fields.start);
    const end=Math.min(1439,start+Math.max(15,minutes));
    fields.end=String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0');
  }
  if(!fields.start)fields.end='';
  if(fields.start&&fields.end)fields.plannedMinutes=timeMinutes(fields.end)-timeMinutes(fields.start);
  if(!date) {
    if(fields.repeat!=='none'){showEditError('Для повторения укажите дату начала.');return;}
    if(editor.source==='task'){
      const index=state.tasks.findIndex(t=>t.id===editor.id);
      if(index>=0)state.tasks.splice(index,1);
    }
    const existing=editor.source==='inbox'?state.inbox.find(t=>t.id===editor.id):null;
    const newInbox={id:existing?.id||uid(),title:fields.title,plannedMinutes:minutes,
      category:fields.category,priority:fields.priority,notes:fields.notes};
    if(existing)Object.assign(existing,newInbox);else state.inbox.push(newInbox);
  }else{
    const old=editor.source==='task'?state.tasks.find(t=>t.id===editor.id):null;
    const candidate={...(old||defaultTask(fields.title,date)),...fields,
      measureMode:fields.start?'interval':'duration'};
    if(old?.repeat!=='none' && fields.repeat!=='none' && date===(editor.occurrence||old.date)){
      // Editing an occurrence preserves the series' original anchor date.
      candidate.date=old.date;
    }
    const err=validateTask(candidate);
    if(err){showEditError(err);return;}
    const day=editor.occurrence||date;
    if(candidate.repeat!=='none'){
      candidate.statusByDate={...(old?.statusByDate||{}),[day]:fields.status};
      candidate.actualByDate={...(old?.actualByDate||{})};
      if(actual!==null)candidate.actualByDate[day]=actual;
      else delete candidate.actualByDate[day];
      const done=new Set(old?.completedDates||[]);
      if(fields.status==='done')done.add(day);else done.delete(day);
      candidate.completedDates=[...done].sort();
      candidate.actualMinutes=null;candidate.completed=false;
    }else{
      candidate.statusByDate={};candidate.completedDates=[];candidate.actualByDate={};
      candidate.completed=fields.status==='done';
    }
    if(old)Object.assign(old,candidate);
    else {
      state.tasks.push(candidate);
      if(editor.source==='inbox')state.inbox=state.inbox.filter(x=>x.id!==editor.id);
    }
  }
  if($('saveTemplate').checked && !state.templates.some(t=>t.title===fields.title)){
    state.templates.push({id:uid(),title:fields.title,plannedMinutes:minutes,
      category:fields.category,priority:fields.priority,notes:fields.notes});
  }
  closeDialog('taskDialog');save();render();notify('Задача сохранена');
}
function showEditError(error){$('editError').textContent=error;$('editError').hidden=false;}
function deleteEditor(){
  if(!editor)return;
  if(editor.source==='inbox')state.inbox=state.inbox.filter(t=>t.id!==editor.id);
  else if(editor.source==='task')state.tasks=state.tasks.filter(t=>t.id!==editor.id);
  closeDialog('taskDialog');save();render();notify('Задача удалена');
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
  tasks.forEach(t=>t.date=tomorrow);
  save();reviewSummary();render();notify('Незавершённые дела перенесены');
}
function openAnalytics(){
  const days=Array.from({length:7},(_,i)=>addDays(week,i));
  const stats=timeStats(allTasks());
  const cards=[['Задач',stats.total],['Завершено',stats.done],['План',formatMinutes(stats.plan)],['Факт',formatMinutes(stats.fact)]];
  $('statsContent').innerHTML='<div class="stats-metrics">'+cards.map(([label,n])=>
    '<div class="metric-box"><small>'+label+'</small><strong>'+n+'</strong></div>').join('')+'</div>'
    +'<p>Выполнение недели: '+stats.completion+'%. План и факт считаются отдельно; незаписанное время не считается фактом.</p>'
    +days.map(d=>{
      const tasks=allTasks().filter(t=>t.occurrenceDate===d),s=timeStats(tasks);
      return '<div class="stat-day"><div style="flex:1"><strong>'+shortDays[(parseDate(d).getDay()+6)%7]+' '+parseDate(d).getDate()
        +'</strong><div class="stat-bar"><i style="width:'+s.completion+'%"></i></div></div>'
        +'<span>'+s.done+'/'+s.total+' · '+formatMinutes(s.plan)+' / '+formatMinutes(s.fact)+'</span></div>';
    }).join('');
  openDialog('statsDialog');
}
function openTemplates(){
  $('templateContent').innerHTML=state.templates.length?state.templates.map(t=>
    '<div class="template-row"><strong>'+escapeHTML(t.title)+'</strong><small>'+duration(planned(t))+'</small>'
    +'<button type="button" data-template="'+escapeHTML(t.id)+'">В список</button></div>').join('')
    :'<p class="inbox-empty">Сохраните задачу как шаблон в форме редактирования.</p>';
  openDialog('templateDialog');
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
function refreshTimer(){
  if(!$('timerFace'))return;
  const s=focusRemaining;
  $('timerFace').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
}
function timerTick(){
  if(!focusRunning)return;
  focusRemaining=Math.max(0,Math.ceil((focusEndsAt-Date.now())/1000));
  refreshTimer();
  if(focusRemaining===0){focusRunning=false;clearInterval(timerHandle);
    if($('timerToggle'))$('timerToggle').textContent='Начать';
    notify('Сессия фокуса завершена');}
}
function toggleTimer(){
  if(focusRunning){focusRemaining=Math.max(0,Math.ceil((focusEndsAt-Date.now())/1000));focusRunning=false;clearInterval(timerHandle);}
  else{if(focusRemaining<=0)focusRemaining=25*60;focusEndsAt=Date.now()+focusRemaining*1000;
    focusRunning=true;timerHandle=setInterval(timerTick,500);}
  if($('timerToggle'))$('timerToggle').textContent=focusRunning?'Пауза':'Начать';
  refreshTimer();
}
function resetTimer(){focusRunning=false;clearInterval(timerHandle);focusRemaining=25*60;
  if($('timerToggle'))$('timerToggle').textContent='Начать';refreshTimer();}
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
      const rect=target.getBoundingClientRect();
      const y=event.clientY-rect.top;
      at=Math.round((360+Math.max(0,y))/15)*15;
      at=Math.max(360,Math.min(1350,at));
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
      return;
    }
    if(event.target.closest('[data-close]'))closeDialog(event.target.closest('[data-close]').dataset.close);
    if(event.target.closest('[data-template]')){
      const tpl=state.templates.find(t=>t.id===event.target.closest('[data-template]').dataset.template);
      if(tpl){state.inbox.push({id:uid(),title:tpl.title,plannedMinutes:tpl.plannedMinutes,
        category:tpl.category,priority:tpl.priority,notes:tpl.notes});save();render();
        closeDialog('templateDialog');notify('Шаблон добавлен в список');}
    }
    if(event.target.id==='timerToggle')toggleTimer();
    if(event.target.id==='timerReset')resetTimer();
    if(event.target.closest('.calendar-day')&&event.target===event.target.closest('.calendar-day')){
      const target=event.target;
      const mins=Math.round((360+event.clientY-target.getBoundingClientRect().top)/15)*15;
      openEditor('new',null,null,target.dataset.dropDate,Math.max(360,Math.min(1350,mins)));
    }
  });
}
function setup(){
  $('inboxForm').addEventListener('submit',event=>{
    event.preventDefault();captureInbox($('inboxInput').value);$('inboxInput').value='';$('inboxInput').focus();
  });
  $('newInboxTask').addEventListener('click',()=>$('inboxInput').focus());
  $('inboxToggle').addEventListener('click',()=>{
    $('workspacePlaceholder')?.remove();
    document.querySelector('.workspace').classList.toggle('inbox-hidden');
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
  $('openTemplates').addEventListener('click',openTemplates);
  $('openQuickTemplate').addEventListener('click',openTemplates);
  $('exportButton').addEventListener('click',()=>{$('moreMenu').open=false;exportData();});
  $('importButton').addEventListener('click',()=>{$('moreMenu').open=false;$('importFile').click();});
  $('importFile').addEventListener('change',e=>importData(e.target.files?.[0]));
  $('taskForm').addEventListener('submit',submitEditor);
  $('deleteTask').addEventListener('click',deleteEditor);
  document.addEventListener('change',event=>{
    if(event.target.id==='focusDate'){chooseDate(event.target.value);view='focus';render();}
  });
  for(const id of ['taskDialog','reviewDialog','statsDialog','templateDialog']){
    $(id).addEventListener('click',event=>{if(event.target===$(id))closeDialog(id);});
  }
  document.addEventListener('keydown',event=>{
    if(event.target.matches('input,textarea,select')||event.ctrlKey||event.altKey||event.metaKey)return;
    if(event.key.toLowerCase()==='n'){event.preventDefault();$('inboxInput').focus();}
  });
  setupDrag();setupClick();
  render();
}
setup();
