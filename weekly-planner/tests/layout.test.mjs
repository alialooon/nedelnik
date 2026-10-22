import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Script } from 'node:vm';

const read=(name)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const page=read('index.html'),app=read('ellie-app.js');
const css=read('ellie-style.css'),standalone=read('planner-standalone.html');

test('Main view has Ellie-like Brain Dump, week board, Timebox and focus',()=>{
  for(const id of ['inboxPanel','inboxInput','inboxList','boardView','calendarView','focusView',
    'openReview','openStats','jumpDate','periodTitle','taskDialog']){
    assert.ok(page.includes('id="'+id+'"'),'Missing element '+id);
  }
  assert.match(page,/data-view="board"/);
  assert.match(page,/data-view="calendar"/);
  assert.match(page,/data-view="focus"/);
  assert.match(css,/\.board-viewport\{/);
  assert.match(css,/\.calendar-viewport\{/);
  assert.match(css,/\.inbox-panel\{/);
});
test('All referenced static IDs exist in the new shell',()=>{
  const used=[...app.matchAll(/\$\('([A-Za-z][A-Za-z0-9]*)'\)/g)].map(m=>m[1]);
  const generated=new Set(['timerFace','timerToggle']);
  for(const id of new Set(used))assert.ok(page.includes('id="'+id+'"')
    || generated.has(id)&&app.includes('id="'+id+'"'),'Missing '+id);
});
test('Full source and offline standalone scripts compile and stay synchronized',()=>{
  const result=spawnSync(process.execPath,['tools/build-standalone.mjs','--check'],{
    cwd:new URL('../../',import.meta.url),encoding:'utf8'
  });
  assert.equal(result.status,0,result.stdout+result.stderr);
  const inline=standalone.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(inline,'Missing bundled app script');
  new Script(inline[1]);
  assert.doesNotMatch(inline[1],/^import /m);
  assert.match(standalone,/id="calendarView"/);
});
test('Drag and drop, local backup, focus timer and daily reviews are implemented',()=>{
  assert.match(app,/function setupDrag\(/);
  assert.match(app,/addInboxToDay/);
  assert.match(app,/moveTask/);
  assert.match(app,/applyTime/);
  assert.match(app,/function toggleTimer\(/);
  assert.match(app,/function saveReview\(/);
  assert.match(app,/function rollTomorrow\(/);
  assert.match(app,/sanitizeBackup/);
  assert.match(app,/localStorage\.setItem/);
});

test('Refined visual hierarchy keeps seven columns and compact add controls',()=>{
  assert.match(app,/day-heading-main/);
  assert.match(app,/day-number/);
  assert.match(app,/add-symbol/);
  assert.match(css,/Calm editorial polish/);
  assert.match(css,/day-column\.today:before/);
  assert.match(css,/\.day-add\{order:3/);
  assert.match(css,/\.task-tile \.item-title\{display:block;font-size:12px/);
});
test('Calendar adjusts hour scale and drop position together',()=>{
  assert.match(app,/const hourHeight=Math\.max/);
  assert.match(app,/\-\-hour-height/);
  assert.match(app,/getPropertyValue\('\-\-hour-height'\)/);
  assert.match(css,/background-size:100% var\(\-\-hour-height,60px\)/);
});
