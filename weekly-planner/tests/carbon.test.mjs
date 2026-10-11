import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blankData, sanitizeBackup } from '../logic.mjs';

const at = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const css = at('style.css');
const html = at('index.html');
const app = at('app.js');

test('Carbon+ is dark by default, with a monochrome palette', () => {
  assert.match(css, /:root\{color-scheme:dark;/);
  assert.match(css, /--bg:#101214;/);
  assert.match(css, /--accent:#c6ced3;/);
  assert.match(css, /\/\* Carbon\+/);
  assert.doesNotMatch(css, /#7061d9|#ad9dff|#5c4dc4|#7463da/i);
  assert.match(html, /<html lang="ru" data-theme="dark">/);
  assert.match(html, /<meta name="theme-color" content="#101214"/);
  assert.doesNotMatch(html, /id="themeToggle"/);
});

test('Existing plans survive import with old light theme', () => {
  assert.equal(blankData().theme, 'dark');
  const imported = sanitizeBackup({
    ...blankData(), theme: 'light',
    tasks: [{
      id: 'task1', title: 'Встреча', date: '2026-10-12',
      start: '09:00', end: '10:00', category: 'work',
      priority: 'normal', repeat: 'none', notes: 'Без потери данных',
      completed: false, completedDates: []
    }],
    weekNotes: {'2026-10-12': 'Мои заметки'}
  });
  assert.equal(imported.theme, 'dark');
  assert.equal(imported.tasks.length, 1);
  assert.equal(imported.tasks[0].notes, 'Без потери данных');
  assert.equal(imported.weekNotes['2026-10-12'], 'Мои заметки');
  assert.match(app, /theme:'dark'/);
});

test('Week List uses abbreviated days with prominent day numbers', () => {
  assert.match(app, /SHORT_WEEKDAYS = \['Пн','Вт','Ср','Чт','Пт','Сб','Вс'\]/);
  assert.match(app, /class="day-number"/);
  assert.match(css, /\.day-row\.is-today:before/);
  assert.match(css, /\.day-number\{/);
  assert.match(css, /@media\(max-width:680px\)/);
});
