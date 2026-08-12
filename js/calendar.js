// Month calendar over the session log, plus week and all-time totals.

import { state, dateKey, streak } from './storage.js';
import { formatDuration } from './timer.js';
import { $, el, clear, clockTime } from './ui.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAILY_GOAL_MIN = 120; // scales the little study bar in each cell

let cursor = new Date();
let selected = dateKey();
const dom = {};

export function initCalendar() {
  Object.assign(dom, {
    title: $('#cal-title'),
    grid: $('#cal-grid'),
    detail: $('#cal-detail'),
    prev: $('#cal-prev'),
    next: $('#cal-next'),
    today: $('#cal-today'),
    wkStudy: $('#wk-study'),
    wkWorkouts: $('#wk-workouts'),
    wkSets: $('#wk-sets'),
    wkStreak: $('#wk-streak'),
    allStudy: $('#all-study'),
    allWorkouts: $('#all-workouts'),
  });

  dom.prev.addEventListener('click', () => shiftMonth(-1));
  dom.next.addEventListener('click', () => shiftMonth(1));
  dom.today.addEventListener('click', () => {
    cursor = new Date();
    selected = dateKey();
    renderCalendar();
  });

  renderCalendar();
}

function shiftMonth(delta) {
  cursor = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
  renderCalendar();
}

/** Totals per day for the whole log, keyed by YYYY-MM-DD. */
function dayTotals() {
  const map = new Map();
  for (const s of state.sessions) {
    const day = map.get(s.date) || { studyMin: 0, workouts: 0, sets: 0 };
    if (s.type === 'study') day.studyMin += s.minutes;
    else {
      day.workouts += 1;
      day.sets += s.sets?.length || 0;
    }
    map.set(s.date, day);
  }
  return map;
}

export function renderCalendar() {
  if (!dom.grid) return;
  const totals = dayTotals();
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  dom.title.textContent = cursor.toLocaleDateString([], { month: 'long', year: 'numeric' });

  clear(dom.grid);
  for (const label of DOW) dom.grid.append(el('div', { class: 'cal-dow' }, label));

  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first grid
  const days = new Date(year, month + 1, 0).getDate();
  const todayKey = dateKey();

  for (let i = 0; i < lead; i++) dom.grid.append(el('div', { class: 'cal-day is-blank' }));

  for (let d = 1; d <= days; d++) {
    const key = dateKey(new Date(year, month, d));
    const totalsForDay = totals.get(key);
    const classes = ['cal-day'];
    if (key === todayKey) classes.push('is-today');
    if (key === selected) classes.push('is-selected');

    const marks = el('div', { class: 'marks' }, [
      totalsForDay?.studyMin ? el('i', { class: 'dot study' }) : null,
      totalsForDay?.workouts ? el('i', { class: 'dot workout' }) : null,
    ]);
    const fill = Math.min(100, ((totalsForDay?.studyMin || 0) / DAILY_GOAL_MIN) * 100);
    const bar = fill > 0 ? el('div', { class: 'bar', title: `${Math.round(totalsForDay.studyMin)} min studied` },
      el('i', { style: `width:${fill}%` })) : null;

    const cell = el('button', { class: classes.join(' '), type: 'button' }, [String(d), marks, bar]);
    cell.addEventListener('click', () => {
      selected = key;
      renderCalendar();
    });
    dom.grid.append(cell);
  }

  renderDetail(totals);
  renderStats();
}

function renderDetail(totals) {
  clear(dom.detail);
  const day = new Date(`${selected}T00:00:00`);
  const heading = day.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  dom.detail.append(el('h3', {}, heading));

  const sessions = state.sessions
    .filter((s) => s.date === selected)
    .slice()
    .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));

  if (!sessions.length) {
    dom.detail.append(el('p', { class: 'empty' }, 'Nothing logged on this day.'));
    return;
  }

  const t = totals.get(selected);
  dom.detail.append(
    el('p', { class: 'hint' }, `${formatDuration(t.studyMin)} studied · ${t.workouts} workout${t.workouts === 1 ? '' : 's'} · ${t.sets} sets`),
  );

  for (const s of sessions) {
    const body =
      s.type === 'study'
        ? `${formatDuration(s.minutes)} — ${s.label}`
        : `${s.label} — ${s.sets?.length || 0} sets in ${formatDuration(s.minutes)}`;
    const item = el('div', { class: `detail-item ${s.type}` }, [
      el('div', { class: 'tag' }, `${s.type} · ${clockTime(s.startedAt)}`),
      el('div', {}, body),
    ]);
    if (s.type === 'workout' && s.sets?.length) {
      const detail = s.sets
        .map((l) => [l.exercise, l.reps ? `${l.reps} reps` : null, l.weight ? `@ ${l.weight}` : null].filter(Boolean).join(' '))
        .join(' · ');
      item.append(el('div', { class: 'hint' }, detail));
    }
    dom.detail.append(item);
  }
}

function renderStats() {
  const start = new Date();
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday of this week
  start.setHours(0, 0, 0, 0);

  const week = state.sessions.filter((s) => new Date(`${s.date}T00:00:00`) >= start);
  dom.wkStudy.textContent = formatDuration(week.filter((s) => s.type === 'study').reduce((n, s) => n + s.minutes, 0));
  dom.wkWorkouts.textContent = week.filter((s) => s.type === 'workout').length;
  dom.wkSets.textContent = week.reduce((n, s) => n + (s.sets?.length || 0), 0);
  dom.wkStreak.textContent = streak();

  const allStudyMin = state.sessions.filter((s) => s.type === 'study').reduce((n, s) => n + s.minutes, 0);
  dom.allStudy.textContent = formatDuration(allStudyMin);
  dom.allWorkouts.textContent = state.sessions.filter((s) => s.type === 'workout').length;
}
