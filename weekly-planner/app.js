import { CATEGORIES, WEEKDAYS, toISO, addDays, startOfWeek, parseDate, occurrencesForWeek, timeStats, minutesFromParts, formatMinutes, formatDecimalHours, createFromTemplate, validateTask, blankData, sanitizeBackup } from './logic.mjs';

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
function render() {
  const all = allOccurrences(), visible = filteredOccurrences();
  $('weekTitle').textContent = formatWeek(monday);
  $('jumpDate').value = monday;
  $('weekNote').value = data.weekNotes[monday] || '';
  document.documentElement.dataset.theme = 'dark';

  $('weekBoard').innerHTML = Array.from({length:7}, (_, i) => {
    const iso = addDays(monday, i);
    const tasks = visible.filter(t => t.occurrenceDate === iso);
    const hasFilteredTasks = all.some(t => t.occurrenceDate === iso);
    const current = iso === today();
    const dayNote = data.dayNotes[iso] || '';
    const dateValue = parseDate(iso);
    const dateNumber = dateValue.getDate();
    const dateMonth = dateValue.toLocaleDateString('ru-RU', {month:'short'}).replace('.', '');
    return `<section class="day-row ${current?'is-today':''}" aria-label="${WEEKDAYS[i]}, ${formatDay(iso)}">
      <div class="day-date">
        <span class="day-name">${SHORT_WEEKDAYS[i]}</span>
        <span class="day-number">${dateNumber}</span>
        <span class="day-month">${dateMonth}</span>
        ${current?'<span class="today-tag">Сегодня</span>':''}
      </div>
      <div class="day-content">
        <div class="day-task-list">
          ${tasks.length ? tasks.map(taskCard).join('') : `<div class="empty-day">${hasFilteredTasks?'Нет дел по фильтру':'Нет дел'}</div>`}
        </div>
        <div class="day-actions">
          <button class="add-day" type="button" data-action="add" data-date="${iso}">+ Добавить дело</button>
          <button class="add-day from-library" type="button" data-action="library" data-date="${iso}">Из общего списка</button>
          <details class="day-extra">
            <summary aria-label="Заметка для ${WEEKDAYS[i]}" title="Заметка для этого дня">${dayNote?'✎ Заметка':'✎'}</summary>
            <textarea id="note-${iso}" data-day-note="${iso}" rows="2" maxlength="10000" placeholder="Заметка для этого дня">${escapeHTML(dayNote)}</textarea>
          </details>
        </div>
      </div>
    </section>`;
  }).join('');
}
function taskCard(t) {
  const tags=[];
  if(t.start)tags.push(t.start);
  if(t.plannedMinutes>0)tags.push(formatMinutes(t.plannedMinutes));
  const time=tags.length?'<span class="task-time">'+tags.join(' · ')+'</span>':'';
  const actual=Number.isInteger(t.actualMinutes)?'<span class="task-fact">Факт '+formatMinutes(t.actualMinutes)+'</span>':'';
  return '<article class="task-card '+(t.done?'done':'')+'">'
    +'<button class="task-check" type="button" data-action="toggle" data-id="'+escapeHTML(t.id)
    +'" data-date="'+t.occurrenceDate+'" aria-label="'+(t.done?'Снять отметку':'Отметить выполненным')+': '+escapeHTML(t.title)
    +'" aria-pressed="'+t.done+'">'+(t.done?'✓':'')+'</button>'+time
    +'<button class="task-description" type="button" data-action="edit" data-id="'+escapeHTML(t.id)
    +'" data-date="'+t.occurrenceDate+'" title="Редактировать дело"><span class="task-title">'+escapeHTML(t.title)+'</span>'
    +(t.repeat==='weekly'?'<span class="task-flag" title="Повторяется еженедельно">↻</span>':'')
    +(t.priority==='high'?'<span class="task-flag priority" title="Важное">★</span>':'')
    +'</button>'+actual+'</article>';
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
function openTask(task=null,occurrenceDate=null,proposedDate=null) {
  editingId=task?.id||null;
  editingOccurrence=occurrenceDate||null;
  $('taskForm').reset();
  $('dialogHeading').textContent=task?'Редактировать дело':'Новое дело';
  $('taskTitle').value=task?.title||'';
  $('taskDate').value=task?.date||proposedDate||(today()>=monday&&today()<=addDays(monday,6)?today():monday);
  $('taskStart').value=task?.start||'';
  $('taskCategory').value=task?.category||'other';
  $('taskPriority').value=task?.priority||'normal';
  $('taskRepeat').value=task?.repeat||'none';
  $('taskNotes').value=task?.notes||'';
  setDurationInputs('planHours','planMinutes',task?.plannedMinutes??null);
  const actual=task?.repeat==='weekly'?(task.actualByDate?.[occurrenceDate]??null):(task?.actualMinutes??null);
  setDurationInputs('actualHours','actualMinutes',actual);
  $('deleteTask').hidden=!task;
  $('clockFields').open=Boolean(task?.start);
  $('actualFields').open=Number.isInteger(actual);
  $('recurrenceHint').hidden=task?.repeat!=='weekly';
  $('advancedFields').open=Boolean(task&&(task.notes||task.repeat==='weekly'||task.priority==='high'||task.category!=='other'));
  $('formError').hidden=true;
  previewDuration('planHours','planMinutes','plannedPreview','Необязательно');
  previewDuration('actualHours','actualMinutes','actualPreview','Пока не записано');
  openModal('taskDialog');
  requestAnimationFrame(()=>$('taskTitle').focus());
}
function closeTask() {
  closeModal('taskDialog');
  editingId=null;
  editingOccurrence=null;
}
function submitTask(event) {
  event.preventDefault();
  const planned=readDuration('planHours','planMinutes');
  const actual=readDuration('actualHours','actualMinutes');
  const payload={
    title:$('taskTitle').value.trim(),date:$('taskDate').value,start:$('taskStart').value||'',
    end:'',plannedMinutes:planned,category:$('taskCategory').value,
    priority:$('taskPriority').value,repeat:$('taskRepeat').value,notes:$('taskNotes').value.trim()
  };
  const error=validateTask({...payload,actualMinutes:actual});
  if(error||Number.isNaN(planned)||Number.isNaN(actual)){
    $('formError').textContent=error||'Проверьте часы и минуты.';
    $('formError').hidden=false;return;
  }
  if(editingId){
    const index=data.tasks.findIndex(t=>t.id===editingId);
    if(index<0){closeTask();return;}
    const old=data.tasks[index];
    const keepSeries=old.repeat==='weekly'&&payload.repeat==='weekly'&&old.date===payload.date;
    const actualByDate=keepSeries?{...(old.actualByDate||{})}:{};
    if(payload.repeat==='weekly'){
      const factDate=keepSeries?(editingOccurrence||payload.date):payload.date;
      if(actual===null)delete actualByDate[factDate];else actualByDate[factDate]=actual;
    }
    data.tasks[index]={...old,...payload,actualMinutes:payload.repeat==='weekly'?null:actual,
      actualByDate,completedDates:keepSeries?old.completedDates:[]};
    showToast('Дело обновлено');
  }else{
    const actualByDate=payload.repeat==='weekly'&&actual!==null?{[payload.date]:actual}:{};
    data.tasks.push({id:uid(),...payload,actualMinutes:payload.repeat==='weekly'?null:actual,
      actualByDate,completed:false,completedDates:[]});
    showToast('Новое дело добавлено');
  }
  const selectedDate=editingOccurrence&&payload.repeat==='weekly'?editingOccurrence:payload.date;
  closeTask();save();monday=startOfWeek(selectedDate);render();
}
function toggleTask(id,date) {
  const task = data.tasks.find(t=>t.id===id);
  if (!task) return;
  if (task.repeat==='weekly') {
    const done = new Set(task.completedDates || []);
    if (done.has(date)) done.delete(date); else done.add(date);
    task.completedDates = [...done].sort();
  } else task.completed = !task.completed;
  save(); render();
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
function openLibrary(date) {
  $('libraryDate').value=date||(today()>=monday&&today()<=addDays(monday,6)?today():monday);
  $('libraryForm').reset();$('libraryError').hidden=true;
  renderLibrary();openModal('libraryDialog');
}
function renderLibrary() {
  $('libraryList').innerHTML=data.templates.length?data.templates.map(t=>
    '<div class="library-item"><div class="library-name"><strong>'+escapeHTML(t.title)
    +'</strong><small>'+(t.plannedMinutes>0?'План: '+formatMinutes(t.plannedMinutes):'Без времени')
    +'</small></div><button type="button" class="secondary-button" data-template-action="add" data-template-id="'
    +escapeHTML(t.id)+'">В день</button><button type="button" class="library-delete" data-template-action="delete" data-template-id="'
    +escapeHTML(t.id)+'" aria-label="Удалить '+escapeHTML(t.title)+'">×</button></div>').join('')
    :'<p class="library-empty">Список пока пуст. Сохрани привычное дело ниже и добавляй его в любой день.</p>';
}
function addLibraryTemplate(event) {
  event.preventDefault();
  const title=$('libraryTitle').value.trim(),planned=readDuration('libraryHours','libraryMinutes');
  if(!title||title.length>120||Number.isNaN(planned)){
    $('libraryError').textContent='Укажите название и корректную длительность.';
    $('libraryError').hidden=false;return;
  }
  data.templates.push({id:uid(),title,notes:'',category:'other',priority:'normal',plannedMinutes:planned??0});
  $('libraryForm').reset();$('libraryError').hidden=true;
  save();renderLibrary();showToast('Дело сохранено в общем списке');
}
function onLibraryAction(event) {
  const button=event.target.closest('button[data-template-action]');
  if(!button)return;
  const t=data.templates.find(v=>v.id===button.dataset.templateId);
  if(!t)return;
  if(button.dataset.templateAction==='delete') {
    if(!confirm('Удалить «'+t.title+'» из общего списка? Запланированные дела останутся.'))return;
    data.templates=data.templates.filter(v=>v.id!==t.id);
    save();renderLibrary();return;
  }
  const date=$('libraryDate').value;
  if(!parseDate(date)){showToast('Выберите правильную дату.');return;}
  data.tasks.push(createFromTemplate(t,date,uid()));
  save();closeModal('libraryDialog');goToWeek(date);
  showToast('«'+t.title+'» добавлено на '+formatDay(date));
}
$('newTaskButton').addEventListener('click',()=>openTask());
$('previousWeek').addEventListener('click',()=>{monday=addDays(monday,-7);render();});
$('nextWeek').addEventListener('click',()=>{monday=addDays(monday,7);render();});
$('goToday').addEventListener('click',()=>{monday=startOfWeek(today());render();});
$('filtersToggle').addEventListener('click',()=>{
  const panel = $('filtersPanel');
  panel.hidden = !panel.hidden;
  $('filtersToggle').setAttribute('aria-expanded', String(!panel.hidden));
  $('moreMenu').open = false;
  if (!panel.hidden) $('searchInput').focus();
});
$('searchInput').addEventListener('input',event=>{filters.search=event.target.value.trim().toLocaleLowerCase('ru');render();});
$('categoryFilter').addEventListener('change',event=>{filters.category=event.target.value;render();});
$('hideCompleted').addEventListener('change',event=>{filters.hideCompleted=event.target.checked;render();});
$('weekBoard').addEventListener('click',event=>{
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const {action,id,date} = button.dataset;
  if (action === 'add') openTask(null,null,date);
  else if (action === 'toggle') toggleTask(id,date);
  else if (action === 'edit') {
    const task = data.tasks.find(t=>t.id===id);
    if (task) openTask(task,date);
  }
});
$('weekBoard').addEventListener('input',event=>{
  if (!event.target.matches('textarea[data-day-note]')) return;
  data.dayNotes[event.target.dataset.dayNote]=event.target.value;
  save();
});
$('weekNote').addEventListener('input',event=>{data.weekNotes[monday]=event.target.value;save();});
$('taskForm').addEventListener('submit',submitTask);
$('closeDialog').addEventListener('click',closeTask);
$('cancelTask').addEventListener('click',closeTask);
$('deleteTask').addEventListener('click',()=>{if(editingId)removeTask(editingId);});
$('taskRepeat').addEventListener('change',event=>{ $('recurrenceHint').hidden=event.target.value!=='weekly'; });
$('taskDialog').addEventListener('click',event=>{if(event.target===$('taskDialog'))closeTask();});
$('exportButton').addEventListener('click',()=>{$('moreMenu').open=false;exportData();});
$('importButton').addEventListener('click',()=>{$('moreMenu').open=false;$('importFile').click();});
$('importFile').addEventListener('change',event=>importData(event.target.files?.[0]));
$('toastUndo').addEventListener('click',()=>{
  if(!undoTask)return;
  data.tasks.splice(Math.min(undoTask.index,data.tasks.length),0,undoTask.task);
  undoTask=null;save();render();showToast('Удаление отменено');
});
$('toastClose').addEventListener('click',()=>{$('toast').hidden=true;clearTimeout(toastTimer);});
document.addEventListener('click',event=>{
  if(!$('moreMenu').contains(event.target)) $('moreMenu').open=false;
});
document.addEventListener('keydown',event=>{
  if(event.ctrlKey||event.metaKey||event.altKey||event.target.matches('input,textarea,select,[contenteditable]')||$('taskDialog').open)return;
  if(event.key.toLowerCase()==='n'){event.preventDefault();openTask();}
  else if(event.key==='/'){event.preventDefault();$('filtersPanel').hidden=false;$('filtersToggle').setAttribute('aria-expanded','true');$('searchInput').focus();}
});
render();
