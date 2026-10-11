import test from 'node:test';
import assert from 'node:assert/strict';
import { blankData, validateTask, sanitizeBackup, taskDuration, timeStats,
  minutesFromParts, formatMinutes, formatDecimalHours,
  createFromTemplate, occurrencesForWeek } from '../logic.mjs';

const example={id:'old',title:'Старое дело',date:'2026-10-12',start:'09:00',end:'10:30',
  category:'work',priority:'normal',repeat:'none',notes:'Важно',completed:true,completedDates:[]};

test('Old backups migrate without losing tasks or weekly completion',()=>{
  const raw={...blankData(),tasks:[example,{...example,id:'repeat',repeat:'weekly',
    completedDates:['2026-10-19']}],weekNotes:{'2026-10-12':'План недели'}};
  const data=sanitizeBackup(raw);
  assert.equal(data.tasks[0].plannedMinutes,90);
  assert.equal(data.tasks[0].title,'Старое дело');
  assert.equal(data.weekNotes['2026-10-12'],'План недели');
  assert.equal(data.tasks[1].completedDates[0],'2026-10-19');
  assert.deepEqual(data.templates,[]);
});

test('No clock interval is required and new tasks can have a planned duration',()=>{
  const task={...example,start:'',end:'',plannedMinutes:75,actualMinutes:null};
  assert.equal(validateTask(task),null);
  assert.equal(taskDuration(task),75);
  assert.equal(minutesFromParts(0,90),90);
  assert.equal(formatMinutes(90),'1 ч 30 мин');
  assert.equal(formatDecimalHours(90),'1,5 ч');
  assert.ok(Number.isNaN(minutesFromParts(-1,30)));
  assert.match(validateTask({...task,plannedMinutes:-4}),/минут/);
});

test('Plan and fact are recorded separately including per-week actuals',()=>{
  const task={...example,start:'',end:'',repeat:'weekly',plannedMinutes:120,
    actualMinutes:null,actualByDate:{'2026-10-12':90,'2026-10-19':45},
    completedDates:['2026-10-12']};
  const data=sanitizeBackup({...blankData(),tasks:[task]});
  const first=timeStats(occurrencesForWeek(data.tasks,'2026-10-12'));
  assert.equal(first.plan,120);
  assert.equal(first.fact,90);
  assert.equal(first.done,1);
  assert.equal(first.timeRatio,75);
  const next=timeStats(occurrencesForWeek(data.tasks,'2026-10-19'));
  assert.equal(next.fact,45);
  assert.equal(next.done,0);
  assert.equal(next.timeRatio,38);
});

test('Reusable tasks are assigned to one date independently and restored in backups',()=>{
  const template={id:'template-1',title:'Спорт',plannedMinutes:80,category:'health',
    priority:'normal',notes:'Тренировка'};
  const task=createFromTemplate(template,'2026-10-16','assigned');
  assert.equal(task.date,'2026-10-16');
  assert.equal(task.repeat,'none');
  assert.equal(task.plannedMinutes,80);
  const data=sanitizeBackup({...blankData(),tasks:[task],templates:[template]});
  assert.equal(data.templates[0].title,'Спорт');
  assert.equal(data.tasks[0].notes,'Тренировка');
  assert.equal(occurrencesForWeek(data.tasks,'2026-10-19').length,0);
});
