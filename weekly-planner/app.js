import { CATEGORIES, WEEKDAYS, toISO, addDays, startOfWeek, parseDate, occurrencesForWeek, timeStats, timeMinutes, minutesFromParts, formatMinutes, formatDecimalHours, createFromTemplate, validateTask, blankData, sanitizeBackup } from './logic.mjs';

const STORAGE_KEY = 'nedelnik-planner-v1';
const SHORT_WEEKDAYS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const $ = id => document.getElementById(id);
const today = () => toISO(new Date());
let data = load();
let monday = startOfWeek(today());
let editingId = null;
let editingOccurrence = null;
let filters = { category:'all', search:'', hideCompleted:false };
let undoTask = null;
let toastTimer = null;
let autosaveTimer = null;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Carbon+ is dark by design; retain all tasks and notes when upgrading.
    return { ...(raw ? sanitizeBackup(JSON.parse(raw)) : blankData()), theme:'dark' };
  } catch (error) {
    console.warn('Невозможно прочитать сохранённые данные:', error);
    return blankData();
  }
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    $('saveStatus').textContent = 'Все изменения сохранены';
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => $('saveStatus').textContent = 'Сохраняется автоматически', 1800);
  } catch (error) {
    showToast('Не удалось сохранить данные. Экспортируйте резервную копию.');
    console.warn(error);
  }
}
function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c])); }
function uid() { return globalThis.crypto?.randomUUID?.() ?? `task-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function formatWeek(first) {
  const last = addDays(first,6);
  const a = parseDate(first), b = parseDate(last);
  const m = date => date.toLocaleDateString('ru-RU',{month:'long'});
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    ? `${a.getDate()}–${b.getDate()} ${m(b)} ${b.getFullYear()}`
    : `${a.getDate()} ${m(a)} – ${b.getDate()} ${m(b)} ${b.getFullYear()}`;
}
function formatDay(iso) { return parseDate(iso).toLocaleDateString('ru-RU',{day:'numeric',month:'long'}); }
function durationLabel(minutes) {
  const h = Math.floor(minutes/60), m = minutes%60;
  return h && m ? `${h} ч ${m} мин` : h ? `${h} ч` : `${m} мин`;
}
function allOccurrences() { return occurrencesForWeek(data.tasks,monday); }
function filteredOccurrences() {
  return allOccurrences().filter(task =>
    (filters.category === 'all' || task.category === filters.category) &&
    (!filters.hideCompleted || !task.done) &&
    (!filters.search || `${task.title} ${task.notes}`.toLocaleLowerCase('ru').includes(filters.search))
  );
}
let calendarMonth=monday;
let selectedDay=today();
let viewMode='week'; // weeks -> week -> day
let overviewAnchor=startOfWeek(addDays(monday,-14));
let dayPage=0;
function periodLabel(first) {
  const last=addDays(first,6),a=parseDate(first),b=parseDate(last);
  const month=d=>d.toLocaleDateString('ru-RU',{month:'long'});
  return a.getMonth()===b.getMonth() ?
    a.getDate()+'–'+b.getDate()+' '+month(b):
    a.getDate()+' '+month(a)+' – '+b.getDate()+' '+month(b);
}
function renderCalendar() {
  const month=parseDate(calendarMonth),first=new Date(month.getFullYear(),month.getMonth(),1,12);
  const start=startOfWeek(toISO(first));
  $('calendarMonthLabel').textContent=first.toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
  $('calendarGrid').innerHTML=Array.from({length:42},(_,i)=>{
    const iso=addDays(start,i),d=parseDate(iso),current=d.getMonth()===first.getMonth();
    return '<button type="button" class="calendar-date '+(current?'':'outside ')
      +(startOfWeek(iso)===monday?'selected ':'')+(iso===today()?'calendar-today':'')
      +'" data-calendar-date="'+iso+'" aria-label="'+formatDay(iso)+'">'+d.getDate()+'</button>';
  }).join('');
}
function render() {
  const all=allOccurrences(),visible=filteredOccurrences();
  const board=$('weekBoard');
  board.className='week-list view-'+viewMode+' view-animate';
  $('weekPickerSummary').textContent=periodLabel(monday);
  $('weekNote').value=data.weekNotes[monday]||'';
  $('viewCaption').textContent=viewMode==='day'?'Выбранный день':viewMode==='weeks'?'Обзор':'Моя неделя';
  $('weekTitle').textContent=viewMode==='day'?formatDay(selectedDay)
    :viewMode==='weeks'?'Выберите неделю':formatWeek(monday);
  $('backView').disabled=viewMode==='weeks';
  document.documentElement.dataset.theme='dark';
  $('weekPicker').hidden=viewMode==='weeks';
  if(viewMode==='weeks') {
    board.innerHTML=Array.from({length:6},(_,i)=>{
      const first=addDays(overviewAnchor,i*7),tasks=occurrencesForWeek(data.tasks,first);
      const last=addDays(first,6),active=first===monday;
      return '<button type="button" class="week-overview-item '+(active?'active':'')
        +'" data-action="select-week" data-date="'+first+'"><span class="overview-number">'
        +String(parseDate(first).getDate()).padStart(2,'0')+'</span><span class="overview-info">'
        +'<strong>'+periodLabel(first)+'</strong><small>'+tasks.length+' дел · '
        +tasks.filter(t=>t.done).length+' выполнено</small></span><span class="overview-open">→</span></button>';
    }).join('');
  } else if(viewMode==='day') {
    const tasks=visible.filter(t=>t.occurrenceDate===selectedDay);
    const pageSize=Math.max(3,Math.min(9,Math.floor((window.innerHeight-300)/52)));
    const pages=Math.max(1,Math.ceil(tasks.length/pageSize));
    dayPage=Math.min(dayPage,pages-1);
    const page=tasks.slice(dayPage*pageSize,(dayPage+1)*pageSize);
    board.innerHTML='<section class="day-detail">'
      +'<div class="day-detail-head"><span>'+WEEKDAYS[(parseDate(selectedDay).getDay()+6)%7]
      +'</span><button type="button" class="day-add-more" data-action="add" data-date="'+selectedDay+'">+ Задача</button></div>'
      +'<div class="day-detail-tasks">'+(page.length?page.map(taskCard).join('')
       :'<button type="button" class="day-blank" data-action="add" data-date="'+selectedDay+'">Нажмите, чтобы добавить задачу</button>')
      +'</div><div class="page-controls">'
      +(pages>1?'<button type="button" data-action="page-prev" '+(dayPage===0?'disabled':'')+'>←</button>'
       +'<span>'+(dayPage+1)+' / '+pages+'</span><button type="button" data-action="page-next" '
       +(dayPage===pages-1?'disabled':'')+'>→</button>':'')
      +'</div></section>';
  } else {
    board.innerHTML=Array.from({length:7},(_,i)=>{
      const iso=addDays(monday,i),day=parseDate(iso);
      const tasks=visible.filter(t=>t.occurrenceDate===iso),shown=tasks.slice(0,2);
      return '<section class="day-row '+(i>=5?'is-weekend ':'')+(iso===today()?'is-today':'')
        +'" data-date="'+iso+'" tabindex="0" aria-label="'+WEEKDAYS[i]+', '+formatDay(iso)+'. Пустое место: новая задача.">'
        +'<button type="button" class="day-date" data-action="day" data-date="'+iso+'">'
        +'<span class="day-name">'+SHORT_WEEKDAYS[i]+'</span>'
        +'<span class="day-number">'+day.getDate()+'</span>'
        +'<span class="day-month">'+day.toLocaleDateString('ru-RU',{month:'short'}).replace('.','')+'</span>'
        +'</button><div class="day-content"><div class="day-task-list">'
        +(shown.length?shown.map(taskCard).join(''):'<span class="empty-day">+ Задача</span>')
        +(tasks.length>2?'<button class="more-tasks" type="button" data-action="day" data-date="'+iso+'">Ещё '+(tasks.length-2)+'</button>':'')
        +'</div></div></section>';
    }).join('');
  }
  renderCalendar();
}
function taskCard(t) {
  const mode=t.measureMode||'duration';
  const plan=mode==='count'?(Number.isInteger(t.targetCount)?t.targetCount+' раз':''):
    mode==='interval'&&t.start&&t.end?t.start+'–'+t.end:
    t.plannedMinutes>0?formatMinutes(t.plannedMinutes):'';
  const actual=mode==='count'&&Number.isInteger(t.actualCount)?
      'Факт '+t.actualCount+' раз':
    Number.isInteger(t.actualMinutes)?'Факт '+formatMinutes(t.actualMinutes):'';
  const status=t.status||(t.done?'done':'todo'),sign=status==='done'?'✓':status==='partial'?'−':'';
  return '<article class="task-card status-'+status+' priority-'+(t.priority||'normal')+'">'
    +'<button class="task-check" type="button" data-action="toggle" data-id="'+escapeHTML(t.id)
    +'" data-date="'+t.occurrenceDate+'" aria-label="Изменить статус: '+escapeHTML(t.title)+'" title="Статус: '
    +(status==='done'?'Выполнено':status==='partial'?'Частично':'Не выполнено')+'">'
    +sign+'</button>'
    +'<button class="task-description" type="button" data-action="edit" data-id="'+escapeHTML(t.id)
    +'" data-date="'+t.occurrenceDate+'" title="Редактировать задачу">'
    +'<span class="priority-indicator"></span><span class="task-title">'+escapeHTML(t.title)+'</span>'
    +(plan?'<span class="task-time">'+escapeHTML(plan)+'</span>':'')
    +(actual?'<span class="task-fact">'+escapeHTML(actual)+'</span>':'')+'</button></article>';
}
function openDay(date) {
  selectedDay=date;
  const tasks=filteredOccurrences().filter(t=>t.occurrenceDate===date);
  $('dayDialogTitle').textContent=formatDay(date);
  $('dayDialogTasks').innerHTML=tasks.map(taskCard).join('')+
    '<button type="button" class="day-add-more" data-action="add" data-date="'+date+'">+ Задача</button>';
  openModal('dayDialog');
}
function setDurationInputs(h,m,value) {
  $(h).value=Number.isInteger(value)?String(Math.floor(value/60)):'';
  $(m).value=Number.isInteger(value)?String(value%60):'';
}
function readDuration(h,m) {
  const hours=$(h).value.trim(),minutes=$(m).value.trim();
  return hours===''&&minutes===''?null:minutesFromParts(hours,minutes);
}
function previewDuration(h,m,id,empty) {
  const n=readDuration(h,m);
  $(id).textContent=n===null?empty:Number.isNaN(n)?'Проверьте часы и минуты'
    :formatMinutes(n)+' ('+formatDecimalHours(n)+')';
}
function syncScrollLock() {
  document.documentElement.classList.toggle('overlay-open',
    Boolean($('moreMenu').open||$('taskDialog').open||$('libraryDialog').open||$('statsDialog').open));
  document.body.classList.toggle('overlay-open',
    Boolean($('moreMenu').open||$('taskDialog').open||$('libraryDialog').open||$('statsDialog').open));
}
function openModal(id) {
  $('moreMenu').open=false;
  $(id).showModal();
  syncScrollLock();
}
function closeModal(id) {
  $(id).close();
  syncScrollLock();
}
function setTaskMeasureMode(mode) {
  $('taskMeasureMode').value=mode;
  $('durationFields').hidden=mode!=='duration';
  $('intervalFields').hidden=mode!=='interval';
  $('countFields').hidden=mode!=='count';
  $('actualFields').hidden=mode==='count';
}
function chooseTemplate(t) {
  $('taskTitle').value=t.title;
  $('taskCategory').value=t.category||'personal';
  $('taskPriority').value=t.priority||'normal';
  $('taskNotes').value=t.notes||'';
  setTaskMeasureMode(t.measureMode||'duration');
  setDurationInputs('planHours','planMinutes',t.plannedMinutes??null);
  $('targetCount').value=t.targetCount??'';
  previewDuration('planHours','planMinutes','plannedPreview','Необязательно');
  $('templateChooser').hidden=true;
}
function renderTemplateChooser() {
  $('templateChooser').innerHTML=data.templates.length?data.templates.map(t=>
    '<button type="button" data-choose-template="'+escapeHTML(t.id)+'">'+escapeHTML(t.title)+'</button>'
    ).join(''):'<p>Список пуст. Сохранить задачу можно при её создании.</p>';
}
function openTask(task=null,occurrenceDate=null,proposedDate=null) {
  editingId=task?.id||null;editingOccurrence=occurrenceDate||null;
  $('taskForm').reset();$('templateChooser').hidden=true;
  $('dialogHeading').textContent=task?'Редактировать задачу':'Новая задача';
  $('taskTitle').value=task?.title||'';
  $('taskDate').value=task?.date||proposedDate||(today()>=monday&&today()<=addDays(monday,6)?today():monday);
  $('taskCategory').value=task?.category||'personal';
  $('taskPriority').value=task?.priority||'normal';
  $('taskRepeat').value=task?.repeat||'none';
  $('taskNotes').value=task?.notes||'';
  setTaskMeasureMode(task?.measureMode||((task?.start&&task?.end)?'interval':'duration'));
  $('taskStart').value=task?.start||'';$('taskEnd').value=task?.end||'';
  setDurationInputs('planHours','planMinutes',task?.plannedMinutes??null);
  const actual=task?.repeat==='weekly'?(task.actualByDate?.[occurrenceDate]??null):(task?.actualMinutes??null);
  setDurationInputs('actualHours','actualMinutes',actual);
  $('targetCount').value=task?.targetCount??'';
  $('actualCount').value=task?.repeat==='weekly'?(task.actualCountByDate?.[occurrenceDate]??''):(task?.actualCount??'');
  $('taskStatus').value=task?.repeat==='weekly'?
    (task.statusByDate?.[occurrenceDate]??((task.completedDates||[]).includes(occurrenceDate)?'done':'todo')):
    (task?.status??(task?.completed?'done':'todo'));
  $('saveToLibrary').checked=false;
  $('deleteTask').hidden=!task;
  $('actualFields').open=Number.isInteger(actual);
  $('recurrenceHint').hidden=task?.repeat!=='weekly';
  $('advancedFields').open=Boolean(task&&(task.notes||task.repeat==='weekly'));
  $('formError').hidden=true;
  previewDuration('planHours','planMinutes','plannedPreview','Необязательно');
  previewDuration('actualHours','actualMinutes','actualPreview','Пока не записано');
  if($('dayDialog').open)closeModal('dayDialog');
  openModal('taskDialog');
  requestAnimationFrame(()=>$('taskTitle').focus());
}
function closeTask() {
  closeModal('taskDialog');editingId=null;editingOccurrence=null;
}
function submitTask(event) {
  event.preventDefault();
  const mode=$('taskMeasureMode').value;
  let planned=mode==='duration'?readDuration('planHours','planMinutes'):null;
  const actual=mode==='count'?null:readDuration('actualHours','actualMinutes');
  const start=mode==='interval'?$('taskStart').value:'',end=mode==='interval'?$('taskEnd').value:'';
  if(mode==='interval'&&start&&end)planned=timeMinutes(end)-timeMinutes(start);
  if(mode==='count')planned=0;
  const targetCount=mode==='count'?Number($('targetCount').value):null;
  const actualCount=mode==='count'&&$('actualCount').value!==''?Number($('actualCount').value):null;
  const status=$('taskStatus').value;
  const payload={title:$('taskTitle').value.trim(),date:$('taskDate').value,start,end,
    measureMode:mode,plannedMinutes:planned,targetCount,category:$('taskCategory').value,
    priority:$('taskPriority').value,repeat:$('taskRepeat').value,notes:$('taskNotes').value.trim()};
  const problem=validateTask({...payload,status,actualMinutes:actual,actualCount});
  if(problem||Number.isNaN(planned)||Number.isNaN(actual)){
    $('formError').textContent=problem||'Проверьте время и количество повторений.';
    $('formError').hidden=false;return;
  }
  const factDate=editingOccurrence||payload.date;
  if(editingId){
    const index=data.tasks.findIndex(t=>t.id===editingId);
    if(index<0){closeTask();return;}
    const old=data.tasks[index],keep=old.repeat==='weekly'&&payload.repeat==='weekly'&&old.date===payload.date;
    const byDate=keep?{...(old.actualByDate||{})}:{};
    const statusByDate=keep?{...(old.statusByDate||{})}:{};
    const countByDate=keep?{...(old.actualCountByDate||{})}:{};
    if(payload.repeat==='weekly'){
      if(actual===null)delete byDate[factDate];else byDate[factDate]=actual;
      if(actualCount===null)delete countByDate[factDate];else countByDate[factDate]=actualCount;
      statusByDate[factDate]=status;
    }
    const completion=keep?new Set(old.completedDates||[]):new Set();
    if(payload.repeat==='weekly'){
      if(status==='done')completion.add(factDate);else completion.delete(factDate);
    }
    data.tasks[index]={...old,...payload,actualMinutes:payload.repeat==='weekly'?null:actual,
      actualCount:payload.repeat==='weekly'?null:actualCount,
      actualByDate:byDate,actualCountByDate:countByDate,status,statusByDate,
      completed:status==='done',completedDates:[...completion].sort()};
  }else{
    data.tasks.push({id:uid(),...payload,actualMinutes:payload.repeat==='weekly'?null:actual,
      actualCount:payload.repeat==='weekly'?null:actualCount,
      actualByDate:payload.repeat==='weekly'&&actual!==null?{[payload.date]:actual}:{},
      actualCountByDate:payload.repeat==='weekly'&&actualCount!==null?{[payload.date]:actualCount}:{},
      status,statusByDate:payload.repeat==='weekly'?{[payload.date]:status}:{},
      completed:status==='done',completedDates:payload.repeat==='weekly'&&status==='done'?[payload.date]:[]});
  }
  if($('saveToLibrary').checked&&!data.templates.some(t=>t.title.toLocaleLowerCase('ru')===payload.title.toLocaleLowerCase('ru'))){
    data.templates.push({id:uid(),title:payload.title,category:payload.category,
      priority:payload.priority,plannedMinutes:planned||0,measureMode:mode,
      targetCount,notes:payload.notes});
  }
  const navigationDate=payload.repeat==='weekly'?factDate:payload.date;
  closeTask();save();
  monday=startOfWeek(navigationDate);
  if(viewMode==='day')selectedDay=navigationDate;
  render();showToast('Задача сохранена');
}
function toggleTask(id,date) {
  const task=data.tasks.find(t=>t.id===id);
  if(!task)return;
  const current=task.repeat==='weekly'
    ?(task.statusByDate?.[date]??((task.completedDates||[]).includes(date)?'done':'todo'))
    :(task.status??(task.completed?'done':'todo'));
  const next=current==='todo'?'partial':current==='partial'?'done':'todo';
  if(task.repeat==='weekly'){
    task.statusByDate={...(task.statusByDate||{}),[date]:next};
    const done=new Set(task.completedDates||[]);
    if(next==='done')done.add(date);else done.delete(date);
    task.completedDates=[...done].sort();
  }else{
    task.status=next;task.completed=next==='done';
  }
  save();render();
}
function removeTask(id) {
  const index = data.tasks.findIndex(t=>t.id===id);
  if (index === -1) return;
  undoTask = {task:data.tasks[index], index};
  data.tasks.splice(index,1);
  if ($('taskDialog').open) closeTask();
  save(); render(); showToast('Дело удалено',true);
}
function showToast(message, undo=false) {
  clearTimeout(toastTimer);
  $('toastMessage').textContent = message;
  $('toastUndo').hidden = !undo;
  $('toast').hidden = false;
  toastTimer = setTimeout(()=>{ $('toast').hidden=true; undoTask=null; },5000);
}
function exportData() {
  const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'});
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href=url; anchor.download=`nedelnik-${today()}.json`;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  showToast('Резервная копия скачана');
}
async function importData(file) {
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error('Файл слишком большой (максимум 5 МБ).');
    const restored = sanitizeBackup(JSON.parse(await file.text()));
    if (!confirm(`Заменить текущие данные? В файле ${restored.tasks.length} дел. Текущие планы будут перезаписаны.`)) return;
    data = { ...restored, theme:'dark' }; filters = { category:'all',search:'',hideCompleted:false };
    $('categoryFilter').value='all'; $('searchInput').value=''; $('hideCompleted').checked=false;
    monday=startOfWeek(today()); save(); render(); showToast('Резервная копия восстановлена');
  } catch(error) { showToast(`Ошибка импорта: ${error.message}`); }
  finally { $('importFile').value=''; }
}
function goToWeek(date) {
  if(!parseDate(date))return;
  monday=startOfWeek(date);
  render();
}
function openLibrary() {
  renderLibrary();openModal('libraryDialog');
}
function renderLibrary() {
  $('libraryList').innerHTML=data.templates.length?data.templates.map(t=>{
    const details=t.measureMode==='count'&&t.targetCount?t.targetCount+' раз':
      t.plannedMinutes>0?formatMinutes(t.plannedMinutes):'Без времени';
    return '<div class="library-item library-readonly"><div class="library-name"><strong>'
      +escapeHTML(t.title)+'</strong><small>'+escapeHTML(details)+' · '
      +escapeHTML(CATEGORIES[t.category]||'Личное время')+'</small></div></div>';
  }).join(''):'<p class="library-empty">Пока пусто. Задачи попадают сюда, когда в их форме включено «Сохранить также в общий список».</p>';
}
function renderStats() {
  const all=allOccurrences(),summary=timeStats(all);
  $('statsWeekTitle').textContent=formatWeek(monday);
  const dayRows=Array.from({length:7},(_,i)=>{
    const date=addDays(monday,i),s=timeStats(all.filter(t=>t.occurrenceDate===date));
    return '<div class="stat-day"><span>'+SHORT_WEEKDAYS[i]+' · '+formatDay(date)+'</span>'
      +'<span>'+formatMinutes(s.plan)+' / '+(s.measured?formatMinutes(s.fact):'—')+'</span></div>';
  }).join('');
  $('statsContent').innerHTML=
    '<p class="stats-help">План — время, которое ты собирался выделить. Факт — сколько реально потратил. Укажи факт при редактировании дела.</p>'
    +'<div class="stats-grid">'
    +'<div class="stats-metric"><small>План</small><strong>'+formatMinutes(summary.plan)+'</strong><span>'+formatDecimalHours(summary.plan)+'</span></div>'
    +'<div class="stats-metric"><small>Факт</small><strong>'+formatMinutes(summary.fact)+'</strong><span>'+formatDecimalHours(summary.fact)+'</span></div>'
    +'<div class="stats-metric"><small>Факт от плана</small><strong>'+(summary.timeRatio===null?'—':summary.timeRatio+'%')+'</strong><span>'
    +(summary.measured?'Записано: '+summary.measured+' дел':'Пока нет данных')+'</span></div>'
    +'<div class="stats-metric"><small>Выполнено</small><strong>'+summary.completion+'%</strong><span>'+summary.done+' из '+summary.total+' дел</span></div>'
    +'</div>'+(summary.countPlan>0?'<p class="stats-count">Повторения: план <strong>'
      +summary.countPlan+'</strong>, факт <strong>'+(summary.countMeasured?summary.countFact:'—')
      +'</strong></p>':'')
    +'<h3 class="stat-subheading">По дням <small>план / факт</small></h3>'+dayRows
    +'<p class="stats-footnote">Минуты переводятся в часы: 90 мин = 1 ч 30 мин = 1,5 ч. Если факт не записан, время не учитывается.</p>';
}
function openStats() {
  renderStats();openModal('statsDialog');
}
function moveView(direction) {
  if(viewMode==='weeks'){overviewAnchor=addDays(overviewAnchor,direction*42);render();}
  else if(viewMode==='day'){
    selectedDay=addDays(selectedDay,direction);
    monday=startOfWeek(selectedDay);
    dayPage=0;render();
  }else{
    monday=addDays(monday,direction*7);
    render();
  }
}
function backView() {
  if(viewMode==='day'){viewMode='week';dayPage=0;}
  else if(viewMode==='week'){
    viewMode='weeks';
    overviewAnchor=startOfWeek(addDays(monday,-14));
  }
  render();
}
function showDay(date) {
  if(!parseDate(date))return;
  selectedDay=date;monday=startOfWeek(date);dayPage=0;viewMode='day';
  render();
}
$('previousWeek').addEventListener('click',()=>moveView(-1));
$('nextWeek').addEventListener('click',()=>moveView(1));
$('backView').addEventListener('click',backView);
$('calendarPrev').addEventListener('click',()=>{
  const d=parseDate(calendarMonth);d.setMonth(d.getMonth()-1,1);calendarMonth=toISO(d);renderCalendar();
});
$('calendarNext').addEventListener('click',()=>{
  const d=parseDate(calendarMonth);d.setMonth(d.getMonth()+1,1);calendarMonth=toISO(d);renderCalendar();
});
$('calendarCurrent').addEventListener('click',()=>{
  monday=startOfWeek(today());viewMode='week';calendarMonth=monday;$('weekPicker').open=false;
  syncScrollLock();render();
});
$('calendarGrid').addEventListener('click',event=>{
  const button=event.target.closest('button[data-calendar-date]');
  if(!button)return;
  monday=startOfWeek(button.dataset.calendarDate);
  viewMode='week';$('weekPicker').open=false;syncScrollLock();render();
});
$('weekPicker').addEventListener('toggle',()=>{
  if($('weekPicker').open){calendarMonth=monday;renderCalendar();$('moreMenu').open=false;}
  syncScrollLock();
});
$('statsButton').addEventListener('click',openStats);
$('libraryButton').addEventListener('click',openLibrary);
$('closeLibrary').addEventListener('click',()=>closeModal('libraryDialog'));
$('closeStats').addEventListener('click',()=>closeModal('statsDialog'));
$('closeDay').addEventListener('click',()=>closeModal('dayDialog'));
$('filtersToggle').addEventListener('click',()=>{
  const p=$('filtersPanel');p.hidden=!p.hidden;
  $('filtersToggle').setAttribute('aria-expanded',String(!p.hidden));
  $('moreMenu').open=false;syncScrollLock();if(!p.hidden)$('searchInput').focus();
});
$('searchInput').addEventListener('input',event=>{filters.search=event.target.value.trim().toLocaleLowerCase('ru');render();});
$('categoryFilter').addEventListener('change',event=>{filters.category=event.target.value;render();});
$('hideCompleted').addEventListener('change',event=>{filters.hideCompleted=event.target.checked;render();});
$('weekBoard').addEventListener('click',event=>{
  const b=event.target.closest('button[data-action]');
  if(b){
    const {action,id,date}=b.dataset;
    if(action==='add')openTask(null,null,date);
    else if(action==='day')showDay(date);
    else if(action==='select-week'){monday=date;viewMode='week';render();}
    else if(action==='toggle')toggleTask(id,date);
    else if(action==='edit'){
      const task=data.tasks.find(t=>t.id===id);
      if(task)openTask(task,date);
    }else if(action==='page-prev'){dayPage=Math.max(0,dayPage-1);render();}
    else if(action==='page-next'){dayPage++;render();}
    return;
  }
  // The empty surface of any week column creates a task in that day's date.
  const col=event.target.closest('.view-week .day-row');
  if(col&&!event.target.closest('button,input,textarea,select,details,summary')){
    openTask(null,null,col.dataset.date);return;
  }
  if(viewMode==='day'&&event.target.closest('.day-detail')
    &&!event.target.closest('button,input,textarea,select,details,summary')){
    openTask(null,null,selectedDay);
  }
});
$('weekBoard').addEventListener('keydown',event=>{
  if(!['Enter',' '].includes(event.key)||event.target.tagName!=='SECTION')return;
  if(!event.target.classList.contains('day-row'))return;
  event.preventDefault();openTask(null,null,event.target.dataset.date);
});
$('weekNote').addEventListener('input',event=>{data.weekNotes[monday]=event.target.value;save();});
$('taskForm').addEventListener('submit',submitTask);
$('taskMeasureMode').addEventListener('change',event=>setTaskMeasureMode(event.target.value));
$('chooseTemplate').addEventListener('click',()=>{
  renderTemplateChooser();$('templateChooser').hidden=!$('templateChooser').hidden;
});
$('templateChooser').addEventListener('click',event=>{
  const b=event.target.closest('button[data-choose-template]');
  if(!b)return;
  const template=data.templates.find(t=>t.id===b.dataset.chooseTemplate);
  if(template)chooseTemplate(template);
});
$('closeDialog').addEventListener('click',closeTask);
$('cancelTask').addEventListener('click',closeTask);
$('deleteTask').addEventListener('click',()=>{if(editingId)removeTask(editingId);});
$('taskRepeat').addEventListener('change',event=>{$('recurrenceHint').hidden=event.target.value!=='weekly';});
for(const [h,m,p,empty] of [
  ['planHours','planMinutes','plannedPreview','Необязательно'],
  ['actualHours','actualMinutes','actualPreview','Пока не записано']]){
  [h,m].forEach(id=>$(id).addEventListener('input',()=>previewDuration(h,m,p,empty)));
}
for(const id of ['taskDialog','libraryDialog','statsDialog','dayDialog']){
  $(id).addEventListener('click',event=>{if(event.target===$(id))closeModal(id);});
  $(id).addEventListener('close',syncScrollLock);
}
$('moreMenu').addEventListener('toggle',()=>{if($('moreMenu').open)$('weekPicker').open=false;syncScrollLock();});
$('exportButton').addEventListener('click',()=>{$('moreMenu').open=false;syncScrollLock();exportData();});
$('importButton').addEventListener('click',()=>{$('moreMenu').open=false;syncScrollLock();$('importFile').click();});
$('importFile').addEventListener('change',event=>importData(event.target.files?.[0]));
$('toastUndo').addEventListener('click',()=>{
  if(!undoTask)return;
  data.tasks.splice(Math.min(undoTask.index,data.tasks.length),0,undoTask.task);
  undoTask=null;save();render();showToast('Удаление отменено');
});
$('toastClose').addEventListener('click',()=>{$('toast').hidden=true;clearTimeout(toastTimer);});
document.addEventListener('click',event=>{
  if(!$('moreMenu').contains(event.target))$('moreMenu').open=false;
  if(!$('weekPicker').contains(event.target))$('weekPicker').open=false;
  syncScrollLock();
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
    if($('moreMenu').open)$('moreMenu').open=false;
    if($('weekPicker').open)$('weekPicker').open=false;
    syncScrollLock();return;
  }
  if(event.ctrlKey||event.metaKey||event.altKey||event.target.matches('input,textarea,select,[contenteditable]')
    ||$('taskDialog').open||$('libraryDialog').open||$('statsDialog').open||$('dayDialog').open)return;
  if(event.key.toLowerCase()==='n'){event.preventDefault();openTask(null,null,viewMode==='day'?selectedDay:monday);}
});
window.addEventListener('resize',()=>{
  if(viewMode==='day')render();
});
render();
