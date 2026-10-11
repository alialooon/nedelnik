import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, startOfWeek, parseDate, occurrencesForWeek, weekStats, validateTask, sanitizeBackup, blankData } from '../logic.mjs';
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
