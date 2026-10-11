import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Script } from 'node:vm';

const root = new URL('../', import.meta.url);
const projectRoot = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const page = read('index.html');
const app = read('app.js');
const css = read('style.css');
const standalone = read('planner-standalone.html');

test('Week List replaces the dashboard and retains seven editable days', () => {
  assert.match(page, /class="week-list" id="weekBoard"/);
  assert.doesNotMatch(page, /class="sidebar"|class="stats-row"|statTotal|statPercent|welcome-subtitle/);
  assert.match(app, /Array\.from\(\{length:7\}/);
  assert.match(app, /class="day-row/);
  assert.match(app, /class="task-card/);
  assert.match(app, /data-action="toggle"/);
  assert.match(app, /data-action="add"/);
  assert.match(app, /data-action="edit"/);
  assert.match(css, /\.week-list\{/);
  assert.match(css, /\.day-row\{/);
});

test('All static elements used by the planner JavaScript exist', () => {
  const ids = [...app.matchAll(/\$\('([a-zA-Z][a-zA-Z0-9]*)'\)/g)].map(match => match[1]);
  for (const id of new Set(ids)) {
    assert.match(page, new RegExp('id="' + id + '"'), 'Missing UI element: ' + id);
  }
});

test('Advanced task fields and data transfer remain available', () => {
  for (const id of ['taskNotes', 'taskCategory', 'taskPriority', 'taskRepeat', 'taskDate',
                    'taskStart', 'planHours', 'planMinutes', 'actualHours', 'actualMinutes',
                    'jumpDate', 'libraryDialog', 'libraryList', 'statsDialog', 'statsContent',
                    'exportButton', 'importButton', 'importFile',
                    'weekNote', 'advancedFields', 'categoryFilter']) {
    assert.ok(page.includes('id="' + id + '"'), 'Missing feature ' + id);
  }
  assert.match(page, /id="filtersPanel" hidden/);
  assert.match(app, /nedelnik-planner-v1/);
  assert.match(app, /sanitizeBackup/);
  assert.match(app, /completedDates/);
});

test('Standalone version matches source and its inline script parses', () => {
  const result = spawnSync(process.execPath, ['tools/build-standalone.mjs', '--check'], {
    cwd: new URL('.', projectRoot), encoding:'utf8'
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(standalone, /class="week-list" id="weekBoard"/);
  const script = standalone.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(script, 'Missing standalone application script');
  assert.doesNotMatch(script[1], /^import /m);
  new Script(script[1]);
});

test('Logo does not navigate into a local directory listing', () => {
  assert.doesNotMatch(page, /<a[^>]*class="brand"[^>]*href=/);
  assert.match(page, /<div class="brand" aria-label="Задачи на неделю">/);
  assert.match(page, /id="jumpDate"/);
  assert.match(app, /goToWeek\(/);
});

test('Separate dialogs protect calendar scrolling and keep extra features out of the list', () => {
  assert.match(css, /html\.overlay-open,body\.overlay-open/);
  assert.match(css, /overscroll-behavior:contain/);
  assert.match(app, /syncScrollLock/);
  assert.match(page, /id="libraryButton"/);
  assert.match(page, /id="statsButton"/);
});
