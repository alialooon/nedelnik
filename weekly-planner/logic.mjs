export const CATEGORIES = {
  work:'Работа', personal:'Личное время', study:'Учёба', sport:'Спорт', health:'Здоровье', other:'Другое'
};
export const WEEKDAYS = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_MINUTES = 1440 * 31;

export function parseDate(iso) {
  if (typeof iso !== 'string' || !DATE_PATTERN.test(iso)) return null;
  const [y,m,d] = iso.split('-').map(Number);
  const date = new Date(y,m-1,d,12);
  if (date.getFullYear() !== y || date.getMonth() !== m-1 || date.getDate() !== d) return null;
  return date;
}
export function toISO(date) {
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}
export function addDays(iso, number) {
  const date = parseDate(iso);
  if (!date) throw new Error('Некорректная дата');
  date.setDate(date.getDate() + number);
  return toISO(date);
}
export function startOfWeek(iso) {
  const d = parseDate(iso);
  if (!d) throw new Error('Некорректная дата');
  return addDays(iso,-((d.getDay()+6)%7));
}
export function periodAnchor(date,scope='day') {
  if(!parseDate(date))return null;
  if(scope==='week')return startOfWeek(date);
  if(scope==='month')return date.slice(0,7)+'-01';
  return date;
}
export function periodTasksForWeek(tasks,monday) {
  if(!parseDate(monday)||startOfWeek(monday)!==monday)return [];
  const month=periodAnchor(monday,'month');
  return tasks.filter(t=>(t.scope==='week'&&t.date===monday)
    ||(t.scope==='month'&&t.date===month))
    .map(t=>({...t,done:t.status==='done',status:t.status||'todo'}))
    .sort((a,b)=>(a.scope==='week'?0:1)-(b.scope==='week'?0:1)
      ||a.title.localeCompare(b.title));
}
export function periodTasksForMonth(tasks,iso) {
  const month=periodAnchor(iso,'month');if(!month)return [];
  return tasks.filter(t=>(t.scope==='month'&&t.date===month)
    ||(t.scope==='week'&&t.date.slice(0,7)===month.slice(0,7)))
    .map(t=>({...t,done:t.status==='done',status:t.status||'todo'}));
}
export function timeMinutes(time) {
  if (!TIME_PATTERN.test(time || '')) return NaN;
  const [h,m] = time.split(':').map(Number);
  return h*60+m;
}
export function taskDuration(task) {
  if (Number.isInteger(task?.plannedMinutes)) return task.plannedMinutes;
  if (task?.start && task?.end) return Math.max(0,timeMinutes(task.end)-timeMinutes(task.start));
  return 0;
}
export function minutesFromParts(hours,minutes) {
  const h=Number(hours || 0),m=Number(minutes || 0);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h<0 || m<0 || h*60+m>MAX_MINUTES) return NaN;
  return h*60+m;
}
export function formatMinutes(minutes) {
  const n=Math.max(0,Math.floor(Number(minutes)||0)),h=Math.floor(n/60),m=n%60;
  return h ? (m ? h+' ч '+m+' мин' : h+' ч') : m+' мин';
}
export function formatDecimalHours(minutes) {
  return (Math.max(0,Number(minutes)||0)/60).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ч';
}
function validMinutes(value,optional=false) {
  return optional && value == null || Number.isInteger(value) && value>=0 && value<=MAX_MINUTES;
}
export function validateTask(task) {
  if (!task || typeof task.title !== 'string' || !task.title.trim()) return 'Укажите название дела.';
  if (task.title.trim().length>120) return 'Название слишком длинное.';
  if (!parseDate(task.date)) return 'Выберите правильную дату.';
  if (task.scope && !['day','week','month'].includes(task.scope)) return 'Выберите срок выполнения.';
  if (['week','month'].includes(task.scope)) {
    if(task.date!==periodAnchor(task.date,task.scope))return 'Неверно указан период выполнения.';
    if(task.repeat&&task.repeat!=='none')return 'Повторение доступно только для задач на день.';
    if(task.start||task.end||task.measureMode==='interval')return 'Конкретный час доступен только для задач на день.';
  }
  if (task.start && Number.isNaN(timeMinutes(task.start))) return 'Укажите правильное время начала.';
  if (task.end && (Number.isNaN(timeMinutes(task.end)) || !task.start)) return 'Неверное время окончания.';
  if (task.start && task.end && timeMinutes(task.end)<=timeMinutes(task.start)) return 'Время окончания должно быть позже начала.';
  if (task.measureMode==='interval' && (!task.start || !task.end)) return 'Для интервала выберите время начала и окончания.';
  if (task.measureMode==='count' && (!Number.isInteger(task.targetCount) || task.targetCount<1 || task.targetCount>100000)) return 'Укажите количество повторений от 1 до 100000.';
  if (task.actualCount!=null && (!Number.isInteger(task.actualCount) || task.actualCount<0 || task.actualCount>100000)) return 'Укажите корректное количество выполненных повторений.';
  if (task.measureMode && !['duration','interval','count'].includes(task.measureMode)) return 'Выберите способ планирования.';
  if (task.status && !['todo','partial','done'].includes(task.status)) return 'Укажите корректный статус.';
  if (!validMinutes(task.plannedMinutes,true)) return 'Плановое время должно быть целым числом минут.';
  if (!validMinutes(task.actualMinutes,true)) return 'Фактическое время должно быть целым числом минут.';
  if (!Object.hasOwn(CATEGORIES,task.category)) return 'Выберите категорию.';
  if (!['low','normal','high'].includes(task.priority)) return 'Выберите важность.';
  if (!['none','daily','weekly','custom','interval','monthly'].includes(task.repeat)) return 'Выберите повторение.';
  if(task.repeat==='custom'&&(!Array.isArray(task.repeatDays)||!task.repeatDays.length
    ||task.repeatDays.some(day=>!Number.isInteger(day)||day<0||day>6)))return 'Выберите дни повторения.';
  if(task.repeat==='interval'&&(!Number.isInteger(task.repeatInterval)||task.repeatInterval<2||task.repeatInterval>365))return 'Период повторения должен быть от 2 до 365 дней.';
  if (typeof task.notes!=='string' || task.notes.length>5000) return 'Комментарий слишком длинный.';
  return null;
}
export function repeatsOn(task,date) {
  if(!task||!parseDate(date)||!parseDate(task.date)||date<task.date)return false;
  if(task.repeat==='daily')return true;
  if(task.repeat==='weekly')return parseDate(date).getDay()===parseDate(task.date).getDay();
  if(task.repeat==='custom')return Array.isArray(task.repeatDays)&&task.repeatDays.includes((parseDate(date).getDay()+6)%7);
  if(task.repeat==='interval'){
    const elapsed=Math.round((parseDate(date)-parseDate(task.date))/86400000);
    return Number.isInteger(task.repeatInterval)&&task.repeatInterval>1&&elapsed%task.repeatInterval===0;
  }
  if(task.repeat==='monthly'){
    const anchor=parseDate(task.date),d=parseDate(date);
    const lastDay=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();
    return d.getDate()===Math.min(anchor.getDate(),lastDay);
  }
  return false;
}
export function occurrencesForWeek(tasks,monday) {
  const sunday=addDays(monday,6),results=[];
  for(const task of tasks) {
    if(task.scope==='week'||task.scope==='month')continue;
    if(task.repeat && task.repeat!=='none') {
      for(let i=0;i<7;i++){
        const date=addDays(monday,i);
        if(!repeatsOn(task,date))continue;
        const status=task.statusByDate?.[date] ?? ((task.completedDates||[]).includes(date)?'done':'todo');
        const subtasks=(task.subtasks||[]).map(s=>({...s,done:task.subtaskByDate?.[date]?.[s.id]===true}));
        results.push({...task,subtasks,occurrenceDate:date,status,done:status==='done',
          actualMinutes:task.actualByDate?.[date]??null,
          actualCount:task.actualCountByDate?.[date]??null});
      }
    } else if(task.date>=monday && task.date<=sunday) {
      const status=task.status??(task.completed?'done':'todo');
      results.push({...task,occurrenceDate:task.date,status,done:status==='done'});
    }
  }
  return results.sort((a,b)=>a.occurrenceDate.localeCompare(b.occurrenceDate)
    || (a.start||'').localeCompare(b.start||'') || a.title.localeCompare(b.title));
}
export function weekStats(occurrences) {
  const total=occurrences.length,done=occurrences.filter(t=>t.done).length;
  const minutes=occurrences.reduce((sum,t)=>sum+Math.max(0,taskDuration(t)),0);
  return {total,done,minutes,percent:total?Math.round(100*done/total):0};
}
export function timeStats(occurrences) {
  const plan=occurrences.reduce((sum,t)=>sum+taskDuration(t),0);
  const fact=occurrences.reduce((sum,t)=>sum+(Number.isInteger(t.actualMinutes)?t.actualMinutes:0),0);
  const measured=occurrences.filter(t=>Number.isInteger(t.actualMinutes)).length;
  const done=occurrences.filter(t=>t.done).length;
  const partial=occurrences.filter(t=>t.status==='partial').length;
  const countPlan=occurrences.reduce((sum,t)=>sum+(t.measureMode==='count'?t.targetCount||0:0),0);
  const countFact=occurrences.reduce((sum,t)=>sum+(t.measureMode==='count'?t.actualCount||0:0),0);
  const countMeasured=occurrences.filter(t=>t.measureMode==='count'&&Number.isInteger(t.actualCount)).length;
  return {plan,fact,measured,total:occurrences.length,done,partial,countPlan,countFact,countMeasured,
    completion:occurrences.length?Math.round((done+partial*0.5)/occurrences.length*100):0,
    timeRatio:plan>0&&measured>0?Math.round(fact/plan*100):null};
}
export function createFromTemplate(template,date,id) {
  return {id,title:template.title,date,scope:'day',start:'',end:'',plannedMinutes:template.plannedMinutes??0,
    actualMinutes:null,actualByDate:{},category:template.category||'other',
    priority:template.priority||'normal',repeat:'none',notes:template.notes||'',completed:false,
    status:'todo',statusByDate:{},completedDates:[],repeatDays:[],repeatInterval:2,
    subtasks:[],subtaskByDate:{},measureMode:template.measureMode||'duration',
    targetCount:template.targetCount??null,actualCount:null,actualCountByDate:{}};
}
function plainNotesMap(value) {
  if (!value || typeof value!=='object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([key,val])=>parseDate(key)&&typeof val==='string')
    .map(([key,val])=>[key,val.slice(0,10000)]));
}
function sanitizedActualByDate(value) {
  if(!value || typeof value!=='object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([date,minutes])=>parseDate(date)&&validMinutes(minutes)).slice(-520));
}
function sanitizeSubtasks(value) {
  if(!Array.isArray(value))return [];
  const ids=new Set();
  return value.slice(0,100).map((s,i)=>{
    const title=typeof s?.title==='string'?s.title.trim().slice(0,180):'';
    if(!title)return null;
    let id=typeof s?.id==='string'&&s.id.length<150?s.id:'';
    if(!id||ids.has(id))id='sub-'+i+'-'+Math.random().toString(36).slice(2);
    ids.add(id);return {id,title,done:s.done===true};
  }).filter(Boolean);
}
function sanitizeSubtaskByDate(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).filter(([d,v])=>parseDate(d)&&v&&typeof v==='object'&&!Array.isArray(v))
    .slice(-520).map(([d,v])=>[d,Object.fromEntries(Object.entries(v).slice(0,100)
      .filter(([id,done])=>id.length<150&&typeof done==='boolean'))]));
}
function sanitizeTrash(value) {
  if(!Array.isArray(value))return [];
  const cutoff=Date.now()-30*86400000;
  return value.filter(item=>item&&['task','inbox','template'].includes(item.kind)
    &&Number.isFinite(item.deletedAt)&&item.deletedAt>=cutoff
    &&item.value&&typeof item.value==='object').slice(-300)
    .map(item=>({kind:item.kind,deletedAt:item.deletedAt,value:item.value}));
}
function sanitizeRolloverLog(value) {
  if(!Array.isArray(value))return [];
  return value.filter(x=>typeof x?.id==='string'&&parseDate(x.from)&&parseDate(x.to)
    &&typeof x.title==='string').slice(-2000)
    .map(x=>({id:x.id,from:x.from,to:x.to,title:x.title.slice(0,120)}));
}
function sanitizeTemplate(template,index,ids) {
  const t={id:typeof template?.id==='string'&&template.id.length<150&&template.id&&!ids.has(template.id)
      ?template.id:'template-'+index+'-'+Date.now(),
    title:typeof template?.title==='string'?template.title.trim().slice(0,120):'',
    notes:typeof template?.notes==='string'?template.notes.slice(0,5000):'',
    plannedMinutes: template?.plannedMinutes??0,measureMode:template?.measureMode||'duration',
    targetCount:template?.targetCount??null,
    category:template?.category||'other',priority:template?.priority||'normal'};
  if(!t.title || !validMinutes(t.plannedMinutes) || !Object.hasOwn(CATEGORIES,t.category)
    || !['low','normal','high'].includes(t.priority)
    || (t.measureMode==='count'&&(!Number.isInteger(t.targetCount)||t.targetCount<1||t.targetCount>100000))) throw new Error('Некорректное дело из общего списка.');
  ids.add(t.id);return t;
}
function sanitizeStatusByDate(value) {
  if(!value || typeof value!=='object' || Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).filter(([date,status])=>
    parseDate(date)&&['todo','partial','done'].includes(status)).slice(-520));
}
function sanitizeCountByDate(value) {
  if(!value || typeof value!=='object' || Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).filter(([date,count])=>
    parseDate(date)&&Number.isInteger(count)&&count>=0&&count<=100000).slice(-520));
}
function sanitizeInbox(value) {
  if(!Array.isArray(value))return [];
  if(value.length>3000)throw new Error('Слишком много дел без даты.');
  const ids=new Set();
  return value.map((item,i)=>{
    const title=typeof item?.title==='string'?item.title.trim().slice(0,120):'';
    const plannedMinutes=item?.plannedMinutes??0;
    const category=Object.hasOwn(CATEGORIES,item?.category)?item.category:'personal';
    const priority=['low','normal','high'].includes(item?.priority)?item.priority:'normal';
    if(!title || !validMinutes(plannedMinutes))throw new Error('Некорректное дело без даты.');
    let id=typeof item?.id==='string' && item.id.length<150?item.id:'';
    if(!id||ids.has(id))id='inbox-'+i+'-'+Date.now();
    ids.add(id);
    return {id,title,plannedMinutes,category,priority,
      notes:typeof item?.notes==='string'?item.notes.slice(0,5000):''};
  });
}
function sanitizeReviews(value) {
  if(!value || typeof value!=='object' || Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).filter(([day,v])=>parseDate(day)&&
    typeof v==='string').slice(-1200).map(([day,v])=>[day,v.slice(0,5000)]));
}
export function sanitizeBackup(value) {
  if(!value || typeof value!=='object' || value.version!==1
    || !Array.isArray(value.tasks) || value.tasks.length>10000) throw new Error('Неизвестный формат резервной копии.');
  const ids=new Set();
  const tasks=value.tasks.map((task,index)=>{
    const start=typeof task?.start==='string'?task.start:'';
    const end=typeof task?.end==='string'?task.end:'';
    const legacyMinutes=start && end && !Number.isNaN(timeMinutes(start)) && !Number.isNaN(timeMinutes(end))
      ?Math.max(0,timeMinutes(end)-timeMinutes(start)):0;
    const t={
      id:typeof task?.id==='string'&&task.id.length<150&&task.id&&!ids.has(task.id)?task.id:'imported-'+index+'-'+Date.now(),
      title:typeof task?.title==='string'?task.title.slice(0,121).trim():'',
      date:task?.date,scope:task?.scope??'day',start,end,plannedMinutes:task?.plannedMinutes??legacyMinutes,
      actualMinutes:task?.actualMinutes??null,actualByDate:sanitizedActualByDate(task?.actualByDate),
      measureMode:task?.measureMode??(start&&end?'interval':'duration'),
      targetCount:task?.targetCount??null,actualCount:task?.actualCount??null,
      actualCountByDate:sanitizeCountByDate(task?.actualCountByDate),
      category:task?.category,priority:task?.priority,repeat:task?.repeat||'none',
      repeatDays:Array.isArray(task?.repeatDays)?[...new Set(task.repeatDays.filter(n=>Number.isInteger(n)&&n>=0&&n<=6))]:[],
      repeatInterval:task?.repeatInterval??2,
      subtasks:sanitizeSubtasks(task?.subtasks),subtaskByDate:sanitizeSubtaskByDate(task?.subtaskByDate),
      notes:typeof task?.notes==='string'?task.notes:'',
      completed:task?.completed===true,status:task?.status??(task?.completed===true?'done':'todo'),
      statusByDate:sanitizeStatusByDate(task?.statusByDate),
      completedDates:Array.isArray(task?.completedDates)
        ?[...new Set(task.completedDates.filter(date=>parseDate(date)))].slice(-520):[]
    };
    ids.add(t.id);
    const error=validateTask(t);
    if(error) throw new Error('Дело №'+(index+1)+': '+error);
    return t;
  });
  const rawTemplates=Array.isArray(value.templates)?value.templates:[];
  if(rawTemplates.length>2000)throw new Error('Слишком много дел в общем списке.');
  const templateIDs=new Set();
  const templates=rawTemplates.map((t,i)=>sanitizeTemplate(t,i,templateIDs));
  return {version:1,tasks,templates,inbox:sanitizeInbox(value.inbox),
    reviews:sanitizeReviews(value.reviews),dayNotes:plainNotesMap(value.dayNotes),
    weekNotes:plainNotesMap(value.weekNotes),theme:'dark',
    trash:sanitizeTrash(value.trash),rolloverLog:sanitizeRolloverLog(value.rolloverLog),
    settings:{autoCarry:value.settings?.autoCarry===true}};
}
export function blankData() {
  return {version:1,tasks:[],templates:[],inbox:[],reviews:{},dayNotes:{},weekNotes:{},theme:'dark',trash:[],rolloverLog:[],settings:{autoCarry:false}};
}
