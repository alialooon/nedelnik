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


test('Native launcher goes straight to planner and exposes trusted in-app update bridge',()=>{
  const program=readFileSync(new URL('../../windows/launcher/Program.cs',import.meta.url),'utf8');
  const native=readFileSync(new URL('../../windows/launcher/PlannerWindow.cs',import.meta.url),'utf8');
  assert.match(program,/Application\.Run\(new PlannerWindow\(\)\);/);
  assert.doesNotMatch(program,/Application\.Run\(new LauncherForm\(\)\);/);
  assert.match(program,/"Arguments", "--planner"/);
  assert.match(native,/WebMessageReceived \+= OnPlannerMessage/);
  assert.match(native,/string\.Equals\(args\.Source, expected, StringComparison\.OrdinalIgnoreCase\)/);
  assert.match(native,/request == "nedelnik:check-updates"/);
  assert.match(native,/request == "nedelnik:ready"/);
  assert.match(native,/Opacity = 0/);
  assert.match(native,/Opacity = 1/);
  assert.match(native,/TryRevealPlanner/);
  assert.match(native,/startupTimer\.Interval = 25000/);
  assert.doesNotMatch(native,/message\.Text = "Opening planner/);
  assert.match(app,/webview\.postMessage\('nedelnik:ready'\)/);
  assert.match(css,/Center each of 24 hour captions inside its hour row/);
  assert.match(app,/percent\(i\*60\+30\)/);
  assert.match(css,/\.calendar-viewport \.hour-label\{[\s\S]*?text-align:right/);
  assert.match(css,/font-variant-numeric:tabular-nums/);
  assert.doesNotMatch(css,/\.calendar-viewport \.hour-label:nth-last-child\(2\)/);
  assert.match(native,/PostWebMessageAsString/);
  assert.match(native,/CoreWebView2\.Reload\(\)/);
  assert.match(native,/Path\.Combine\(Program\.Home, "webview-profile"\)/);
});
test('Update command is only displayed with native WebView2 host support',()=>{
  assert.match(page,/id="checkUpdates"[^>]*hidden/);
  assert.match(page,/id="updateStatus"/);
  assert.match(app,/function setupNativeUpdates\(\)/);
  assert.match(app,/window\.chrome\?\.webview/);
  assert.match(app,/nedelnik:check-updates/);
  assert.match(app,/nedelnik:update:\(checking\|current\|updated\|failed\)/);
});


test('iOS-inspired calendar icon replaces the old four-dot header without affecting controls',()=>{
  assert.match(page,/<svg class="identity-calendar"/);
  assert.match(page,/id="iosIconBlue"/);
  assert.match(page,/id="iosCalendarPaper"/);
  assert.doesNotMatch(page,/class="identity-icon"/);
  assert.match(css,/\.identity-calendar\{/);
  assert.match(standalone,/<svg class="identity-calendar"/);
  for(const action of ['openReview','openStats','moreMenu','inboxToggle'])
    assert.match(page,new RegExp('id="'+action+'"'));
});


test('Soft macOS design keeps the original controls and all three views without fake Mac window buttons',()=>{
  assert.match(page,/class="app-header app-header-macos"/);
  assert.match(page,/class="mode-picker header-mode-picker"/);
  assert.match(page,/class="work-area work-area-macos"/);
  assert.match(page,/class="planner planner-macos"/);
  assert.equal((page.match(/data-view="board"/g)||[]).length,1);
  assert.equal((page.match(/data-view="calendar"/g)||[]).length,1);
  assert.equal((page.match(/data-view="focus"/g)||[]).length,1);
  assert.ok(page.indexOf('class="mode-picker header-mode-picker"')<page.indexOf('class="header-actions"'));
  for(const action of ['openReview','openStats','moreMenu','checkUpdates','openTemplates',
      'exportButton','importButton','taskDialog','reviewDialog','statsDialog']){
    assert.match(page,new RegExp('id="'+action+'"'));
  }
  assert.doesNotMatch(page,/<button[^>]*id="search"/i);
  assert.doesNotMatch(page,/traffic-light|window-dot|mac-control-dot/);
  assert.match(page,/<svg class="identity-calendar"/);
});
test('Soft macOS visual tokens apply consistently to task, calendar, focus and editor',()=>{
  for(const selector of ['.app-header.app-header-macos','.app-header .header-mode-picker button.active',
     '.planner .day-column.today','.planner .day-column.weekend','.planner .task-tile.category-work',
     '.planner .calendar-viewport','.planner .focus-list','.planner .focus-timer','dialog .dialog-header',
     'dialog .field input:focus']){
    assert.ok(css.includes(selector),'Missing style '+selector);
  }
  assert.match(css,/Soft macOS \| iOS calendar palette/);
  assert.match(app,/category-'\+escapeHTML\(t\.category\|\|'other'\)/);
  assert.match(app,/function saveUIPrefs\(\)/);
  assert.match(app,/function setupNativeUpdates\(\)/);
  assert.match(app,/function renderCalendar\(\)/);
  assert.match(app,/function renderFocus\(\)/);
});


test('Template deletion preserves scheduled tasks and uses an explicit confirmation',()=>{
  assert.match(app,/function renderTemplates\(/);
  assert.match(app,/function deleteTemplate\(id\)/);
  assert.match(app,/data-template-delete/);
  assert.match(app,/confirm\('Удалить шаблон/);
  assert.match(app,/state\.templates=state\.templates\.filter\(t=>t\.id!==id\)/);
  assert.match(app,/renderTemplates\(\)/);
  assert.match(app,/save\(\)/);
  assert.match(app,/icon\('trash'\)/);
  assert.match(css,/\.template-row \.template-delete/);
});
test('Typing never adds a highlight to text, date, time or notes fields',()=>{
  assert.match(css,/Text-entry focus is visually neutral everywhere/);
  assert.match(css,/\.inbox-panel \.quick-add:focus-within/);
  assert.match(css,/outline:none!important/);
  assert.match(css,/box-shadow:none!important/);
  assert.match(css,/dialog \.field input:is\(:focus,:focus-visible\)/);
  assert.match(css,/#focusDate:is\(:focus,:focus-visible\)/);
  assert.match(css,/#jumpDate:is\(:focus,:focus-visible\)/);
});
