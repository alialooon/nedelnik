export const CATEGORIES = {
  work:'Работа', personal:'Личное', study:'Учёба', health:'Здоровье', other:'Другое'
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
  if (task.start && Number.isNaN(timeMinutes(task.start))) return 'Укажите правильное время начала.';
  if (task.end && (Number.isNaN(timeMinutes(task.end)) || !task.start)) return 'Неверное время окончания.';
  if (task.start && task.end && timeMinutes(task.end)<=timeMinutes(task.start)) return 'Время окончания должно быть позже начала.';
  if (!validMinutes(task.plannedMinutes,true)) return 'Плановое время должно быть целым числом минут.';
  if (!validMinutes(task.actualMinutes,true)) return 'Фактическое время должно быть целым числом минут.';
  if (!Object.hasOwn(CATEGORIES,task.category)) return 'Выберите категорию.';
  if (!['normal','high'].includes(task.priority)) return 'Выберите важность.';
  if (!['none','weekly'].includes(task.repeat)) return 'Выберите повторение.';
  if (typeof task.notes!=='string' || task.notes.length>5000) return 'Комментарий слишком длинный.';
  return null;
}
export function occurrencesForWeek(tasks,monday) {
  const sunday=addDays(monday,6),results=[];
  for(const task of tasks) {
    if(task.repeat==='weekly') {
      const day=(parseDate(task.date).getDay()+6)%7;
      const date=addDays(monday,day);
      if(date>=task.date) results.push({
        ...task,occurrenceDate:date,done:(task.completedDates||[]).includes(date),
        actualMinutes: task.actualByDate?.[date] ?? null
      });
    } else if(task.date>=monday && task.date<=sunday) {
      results.push({...task,occurrenceDate:task.date,done:Boolean(task.completed)});
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
  return {plan,fact,measured,total:occurrences.length,done,completion:occurrences.length?Math.round(done/occurrences.length*100):0,
    timeRatio:plan>0?Math.round(fact/plan*100):null};
}
export function createFromTemplate(template,date,id) {
  return {id,title:template.title,date,start:'',end:'',plannedMinutes:template.plannedMinutes??0,
    actualMinutes:null,actualByDate:{},category:template.category||'other',
    priority:template.priority||'normal',repeat:'none',notes:template.notes||'',completed:false,
    completedDates:[]};
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
function sanitizeTemplate(template,index,ids) {
  const t={id:typeof template?.id==='string'&&template.id.length<150&&template.id&&!ids.has(template.id)
      ?template.id:'template-'+index+'-'+Date.now(),
    title:typeof template?.title==='string'?template.title.trim().slice(0,120):'',
    notes:typeof template?.notes==='string'?template.notes.slice(0,5000):'',
    plannedMinutes: template?.plannedMinutes??0,
    category:template?.category||'other',priority:template?.priority||'normal'};
  if(!t.title || !validMinutes(t.plannedMinutes) || !Object.hasOwn(CATEGORIES,t.category)
    || !['normal','high'].includes(t.priority)) throw new Error('Некорректное дело из общего списка.');
  ids.add(t.id);return t;
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
      date:task?.date,start,end,plannedMinutes:task?.plannedMinutes??legacyMinutes,
      actualMinutes:task?.actualMinutes??null,actualByDate:sanitizedActualByDate(task?.actualByDate),
      category:task?.category,priority:task?.priority,repeat:task?.repeat,
      notes:typeof task?.notes==='string'?task.notes:'',
      completed:task?.completed===true,
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
  return {version:1,tasks,templates,dayNotes:plainNotesMap(value.dayNotes),
    weekNotes:plainNotesMap(value.weekNotes),theme:'dark'};
}
export function blankData() {
  return {version:1,tasks:[],templates:[],dayNotes:{},weekNotes:{},theme:'dark'};
}
