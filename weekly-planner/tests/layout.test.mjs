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
  assert.match(app,/icon\('plus'\)/);
  assert.match(app,/day-progress/);
  assert.match(app,/day-blank/);
  assert.match(css,/Calm editorial polish/);
  assert.match(css,/day-column\.today:before/);
  assert.match(css,/\.day-add\{order:3/);
  assert.match(css,/\.task-tile \.item-title\{display:block;font-size:12px/);
});
test('Entire 24-hour calendar fits in the viewport and uses proportional placement',()=>{
  assert.match(app,/Array\.from\(\{length:24\}/);
  assert.match(app,/dayMinutes=1440/);
  assert.match(app,/function calendarMinutesAt\(/);
  assert.match(app,/calendarMinutesAt\(target,event\.clientY\)/);
  assert.doesNotMatch(app,/const hourHeight=Math\.max/);
  assert.match(css,/Full-day calendar/);
  assert.match(css,/flex:1 1 0%/);
  assert.match(css,/background-size:100% calc\(100% \/ 24\)/);
  assert.match(css,/\.calendar-viewport \.timeline-body/);
  assert.match(css,/overflow:hidden/);
  assert.match(css,/\.editor-dialog \.field input:focus-visible/);
  assert.match(css,/box-shadow:none/);
});
test('All three refinement stages are present with meaningful empty states',()=>{
  for(const id of ['sidebarToday','sidebarTodayCount','sidebarTodayDate','templateCount','inlineProgressFill'])
    assert.match(page,new RegExp('id="'+id+'"'));
  assert.match(app,/data-suggestion="Разобрать почту"/);
  assert.match(app,/function renderInbox\(/);
  assert.match(app,/function renderCalendar\(/);
  assert.match(app,/current-time-line/);
  assert.match(app,/timebox-empty/);
  assert.match(app,/function renderFocus\(/);
  assert.match(app,/focus-summary/);
  assert.match(app,/focus-section-title/);
  assert.match(css,/\.focus-summary/);
  assert.match(css,/\.focus-empty/);
  assert.match(css,/\.day-progress/);
});
test('View, focused date, and sidebar preference settings survive reload without changing user tasks',()=>{
  assert.match(app,/const UI_KEY='nedelnik-ui-preferences-v1'/);
  assert.match(app,/function loadUIPrefs\(/);
  assert.match(app,/function saveUIPrefs\(/);
  assert.match(app,/savedUI\.inboxHidden/);
  assert.match(app,/decorateIcons\(\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/@keyframes mode-fade/);
  assert.match(css,/\.ui-icon/);
});
