export const CATEGORIES = {
  work: 'Работа', personal: 'Личное', study: 'Учёба', health: 'Здоровье', other: 'Другое'
};
export const WEEKDAYS = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseDate(iso) {
  if (typeof iso !== 'string' || !DATE_PATTERN.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}
export function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
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
  const mondayIndex = (d.getDay() + 6) % 7;
  return addDays(iso, -mondayIndex);
}
export function timeMinutes(time) {
  if (!TIME_PATTERN.test(time || '')) return NaN;
  const [h,m] = time.split(':').map(Number);
  return h * 60 + m;
}
export function taskDuration(task) { return timeMinutes(task.end) - timeMinutes(task.start); }
export function validateTask(task) {
  if (!task || typeof task.title !== 'string' || !task.title.trim()) return 'Укажите название дела.';
  if (task.title.trim().length > 120) return 'Название слишком длинное.';
  if (!parseDate(task.date)) return 'Выберите правильную дату.';
  if (Number.isNaN(timeMinutes(task.start)) || Number.isNaN(timeMinutes(task.end))) return 'Укажите время начала и окончания.';
  if (taskDuration(task) <= 0) return 'Время окончания должно быть позже начала.';
  if (!Object.hasOwn(CATEGORIES, task.category)) return 'Выберите категорию.';
  if (!['normal','high'].includes(task.priority)) return 'Выберите важность.';
  if (!['none','weekly'].includes(task.repeat)) return 'Выберите повторение.';
  if (typeof task.notes !== 'string' || task.notes.length > 5000) return 'Комментарий слишком длинный.';
  return null;
}
export function occurrencesForWeek(tasks, monday) {
  const sunday = addDays(monday, 6);
  const results = [];
  for (const task of tasks) {
    if (task.repeat === 'weekly') {
      const weekday = (parseDate(task.date).getDay() + 6) % 7;
      const date = addDays(monday, weekday);
      if (date >= task.date) {
        results.push({ ...task, occurrenceDate: date, done: (task.completedDates || []).includes(date) });
      }
    } else if (task.date >= monday && task.date <= sunday) {
      results.push({ ...task, occurrenceDate: task.date, done: Boolean(task.completed) });
    }
  }
  return results.sort((a,b) => a.occurrenceDate.localeCompare(b.occurrenceDate) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}
export function weekStats(occurrences) {
  const total = occurrences.length;
  const done = occurrences.filter(t => t.done).length;
  const minutes = occurrences.reduce((sum, t) => sum + Math.max(0, taskDuration(t)), 0);
  return { total, done, minutes, percent: total ? Math.round(100 * done / total) : 0 };
}
function plainNotesMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, val]) => parseDate(key) && typeof val === 'string').map(([key, val]) => [key, val.slice(0, 10000)]));
}
export function sanitizeBackup(value) {
  if (!value || typeof value !== 'object' || value.version !== 1 || !Array.isArray(value.tasks) || value.tasks.length > 10000) throw new Error('Неизвестный формат резервной копии.');
  const ids = new Set();
  const tasks = value.tasks.map((task, index) => {
    const t = {
      id: typeof task?.id === 'string' && task.id.length < 150 && task.id && !ids.has(task.id) ? task.id : `imported-${index}-${Date.now()}`,
      title: typeof task?.title === 'string' ? task.title.slice(0, 121).trim() : '',
      date: task?.date, start: task?.start, end: task?.end,
      category: task?.category, priority: task?.priority, repeat: task?.repeat,
      notes: typeof task?.notes === 'string' ? task.notes : '',
      completed: task?.completed === true,
      completedDates: Array.isArray(task?.completedDates) ? [...new Set(task.completedDates.filter(date => parseDate(date)))].slice(-520) : []
    };
    ids.add(t.id);
    const error = validateTask(t);
    if (error) throw new Error(`Дело №${index+1}: ${error}`);
    return t;
  });
  return { version:1, tasks, dayNotes: plainNotesMap(value.dayNotes), weekNotes: plainNotesMap(value.weekNotes), theme: 'dark' };
}
export function blankData() { return { version:1, tasks:[], dayNotes:{}, weekNotes:{}, theme:'dark' }; }
