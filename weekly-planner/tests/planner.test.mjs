import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, startOfWeek, parseDate, occurrencesForWeek, repeatsOn, weekStats, validateTask, sanitizeBackup, blankData, periodAnchor, periodTasksForWeek, periodTasksForMonth, timeStats } from '../logic.mjs';
const make = (overrides = {}) => ({id:'a', title:'Встреча', date:'2026-10-12', start:'09:00',end:'10:00',category:'work',priority:'normal',repeat:'none',notes:'',completed:false,completedDates:[],...overrides});
test('Понедельник считается началом недели, включая воскресенье',()=>{
  assert.equal(startOfWeek('2026-10-11'),'2026-10-05');
  assert.equal(startOfWeek('2026-10-12'),'2026-10-12');
  assert.equal(addDays('2026-12-31',1),'2027-01-01');
});
test('Проверка корректной даты и времени',()=>{
  assert.equal(parseDate('2026-02-30'),null);
  assert.match(validateTask(make({end:'08:30'})),/позже/);
  assert.equal(validateTask(make({end:'11:00'})),null);
});
test('Обычное дело показывается только на своей неделе',()=>{
  assert.equal(occurrencesForWeek([make()],'2026-10-12').length,1);
  assert.equal(occurrencesForWeek([make()],'2026-10-19').length,0);
});
test('Еженедельная задача повторяется, но не ранее даты создания',()=>{
  const task=make({repeat:'weekly',completedDates:['2026-10-19']});
  assert.equal(occurrencesForWeek([task],'2026-10-05').length,0);
  assert.equal(occurrencesForWeek([task],'2026-10-12')[0].done,false);
  const recurring=occurrencesForWeek([task],'2026-10-19');
  assert.equal(recurring[0].occurrenceDate,'2026-10-19');
  assert.equal(recurring[0].done,true);
});
test('Статистика по неделе учитывает выполненные и продолжительность',()=>{
  const tasks=[make({completed:true}),make({id:'b',start:'11:00',end:'12:30'})];
  const stats=weekStats(occurrencesForWeek(tasks,'2026-10-12'));
  assert.deepEqual(stats,{total:2,done:1,minutes:150,percent:50});
});
test('Импорт отклоняет опасные и испорченные данные',()=>{
  assert.throws(()=>sanitizeBackup({version:99,tasks:[]}),/формат/);
  assert.throws(()=>sanitizeBackup({version:1,tasks:[make({title:''})]}),/Название|название/);
  const value=sanitizeBackup({...blankData(),tasks:[make()],dayNotes:{'2026-10-13':'Не забыть','bad':'oops'}});
  assert.equal(value.tasks.length,1);
  assert.deepEqual(value.dayNotes,{'2026-10-13':'Не забыть'});
});

test('Flexible repeat days preserve per-day completion and subtask checks',()=>{
  const t=make({repeat:'custom',repeatDays:[0,2,4],subtasks:[{id:'s1',title:'Проверить',done:false}],
    subtaskByDate:{'2026-10-14':{s1:true}},statusByDate:{'2026-10-14':'done'}});
  const week=occurrencesForWeek([t],'2026-10-12');
  assert.deepEqual(week.map(x=>x.occurrenceDate),['2026-10-12','2026-10-14','2026-10-16']);
  assert.equal(week[1].done,true);
  assert.equal(week[1].subtasks[0].done,true);
  assert.equal(week[0].subtasks[0].done,false);
  assert.equal(validateTask(t),null);
});
test('Every-N-days and monthly recurrence behave at month boundaries',()=>{
  const every3=make({date:'2026-10-12',repeat:'interval',repeatInterval:3});
  assert.deepEqual(occurrencesForWeek([every3],'2026-10-12')
    .map(t=>t.occurrenceDate),['2026-10-12','2026-10-15','2026-10-18']);
  assert.equal(repeatsOn(every3,'2026-10-21'),true);
  const monthly=make({date:'2026-01-31',repeat:'monthly'});
  assert.equal(repeatsOn(monthly,'2026-02-28'),true);
  assert.equal(repeatsOn(monthly,'2026-03-31'),true);
  assert.equal(repeatsOn(monthly,'2026-03-30'),false);
});
test('Count targets and new metadata survive backups without breaking earlier records',()=>{
  const item=make({measureMode:'count',targetCount:50,actualCount:20,plannedMinutes:0,
    start:'',end:'',subtasks:[{id:'check',title:'Разминка',done:true}]});
  assert.equal(validateTask(item),null);
  const data=sanitizeBackup({...blankData(),tasks:[item],settings:{autoCarry:true},
    trash:[{kind:'task',deletedAt:Date.now(),value:item}],
    rolloverLog:[{id:'a',from:'2026-10-12',to:'2026-10-13',title:'Встреча'}]});
  assert.equal(data.tasks[0].targetCount,50);
  assert.equal(data.tasks[0].subtasks[0].done,true);
  assert.equal(data.settings.autoCarry,true);
  assert.equal(data.trash.length,1);
  assert.equal(data.rolloverLog.length,1);
  const legacy=sanitizeBackup({version:1,tasks:[make()]});
  assert.deepEqual(legacy.tasks[0].subtasks,[]);
  assert.equal(legacy.settings.autoCarry,false);
  assert.deepEqual(legacy.trash,[]);
});

test('Weekly and monthly goals remain outside any particular day and preserve their status',()=>{
  const week=periodAnchor('2026-10-23','week'),month=periodAnchor('2026-10-23','month');
  assert.equal(week,'2026-10-19');
  assert.equal(month,'2026-10-01');
  const weekly=make({id:'w',date:week,scope:'week',repeat:'none',start:'',end:'',status:'todo'});
  const monthly=make({id:'m',date:month,scope:'month',repeat:'none',start:'',end:'',status:'done'});
  const dated=make({id:'d',date:'2026-10-23',scope:'day',repeat:'none',status:'todo'});
  assert.equal(validateTask(weekly),null);
  assert.equal(validateTask(monthly),null);
  assert.deepEqual(occurrencesForWeek([weekly,monthly,dated],week).map(t=>t.id),['d']);
  assert.deepEqual(periodTasksForWeek([weekly,monthly,dated],week).map(t=>t.id),['w','m']);
  assert.equal(periodTasksForWeek([weekly,monthly,dated],week)[1].done,true);
  assert.deepEqual(periodTasksForWeek([weekly,monthly,dated],'2026-10-26').map(t=>t.id),['m']);
  assert.deepEqual(periodTasksForMonth([weekly,monthly,dated],'2026-10-24').map(t=>t.id),['w','m']);
  const summary=timeStats(periodTasksForMonth([weekly,monthly,dated],'2026-10-24'));
  assert.equal(summary.total,2);
  assert.equal(summary.done,1);
});
test('Period tasks normalize dates and reject fixed-hour or recurring schedules',()=>{
  assert.equal(validateTask(make({date:'2026-10-23',scope:'week'})), 'Неверно указан период выполнения.');
  assert.equal(validateTask(make({date:'2026-10-23',scope:'month'})), 'Неверно указан период выполнения.');
  assert.equal(validateTask(make({date:'2026-10-19',scope:'week',repeat:'daily'})),
    'Повторение доступно только для задач на день.');
  assert.equal(validateTask(make({date:'2026-10-01',scope:'month',start:'09:00',end:'10:00'})),
    'Конкретный час доступен только для задач на день.');
  assert.equal(validateTask(make({date:'2026-10-23',scope:'banana'})),
    'Выберите срок выполнения.');
  assert.equal(periodAnchor('2026-02-28','month'),'2026-02-01');
  assert.equal(periodAnchor('invalid','week'),null);
});
test('Week/month scope survives JSON backup and older tasks keep daily planning',()=>{
  const week=make({id:'week-task',scope:'week',date:'2026-10-19',start:'',end:''});
  const month=make({id:'month-task',scope:'month',date:'2026-10-01',start:'',end:''});
  const normalized=sanitizeBackup({...blankData(),tasks:[week,month]});
  assert.equal(normalized.tasks[0].scope,'week');
  assert.equal(normalized.tasks[1].scope,'month');
  const legacy={...make({id:'older-task'})};delete legacy.scope;
  assert.equal(sanitizeBackup({...blankData(),tasks:[legacy]}).tasks[0].scope,'day');
});
