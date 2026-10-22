import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {blankData,sanitizeBackup,occurrencesForWeek,timeStats} from '../logic.mjs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const css=read('ellie-style.css'),html=read('index.html');

test('Ellie-inspired layout uses an airy white design and separate panels',()=>{
  assert.match(css,/--surface:#fff/);
  assert.match(css,/--canvas:#fafbfc/);
  assert.match(css,/\.inbox-panel/);
  assert.match(css,/\.day-column/);
  assert.match(html,/name="theme-color" content="#ffffff"/);
  assert.doesNotMatch(html,/<script[^>]+src="\.\/app\.js"/);
});
test('Legacy saved tasks, notes and theme are preserved when upgrading',()=>{
  const restored=sanitizeBackup({...blankData(),theme:'dark',
    tasks:[{id:'old',title:'Встреча',date:'2026-10-12',
      start:'09:00',end:'10:00',category:'work',priority:'normal',
      repeat:'none',notes:'Старые данные',completed:false,completedDates:[]}],
    weekNotes:{'2026-10-12':'Заметка'}});
  assert.equal(restored.tasks[0].title,'Встреча');
  assert.equal(restored.tasks[0].notes,'Старые данные');
  assert.equal(restored.weekNotes['2026-10-12'],'Заметка');
  assert.deepEqual(restored.inbox,[]);
  assert.deepEqual(restored.reviews,{});
});
test('Daily repeating tasks appear all seven days and store individual completion statuses',()=>{
  const task={id:'daily',title:'Привычка',date:'2026-10-12',
    start:'',end:'',plannedMinutes:15,category:'health',priority:'normal',
    repeat:'daily',notes:'',completed:false,completedDates:['2026-10-12'],
    statusByDate:{'2026-10-14':'partial'}};
  const tasks=occurrencesForWeek([task],'2026-10-12');
  assert.equal(tasks.length,7);
  assert.equal(tasks[0].done,true);
  assert.equal(tasks[2].status,'partial');
  assert.equal(timeStats(tasks).completion,Math.round((1+.5)/7*100));
});
