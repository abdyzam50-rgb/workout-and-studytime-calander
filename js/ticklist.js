// Tick mode: the workout as a list you check off.
//
// One line per exercise — "Knee Pushup · 3 sets × 10 reps" — and you tick it
// when you've done it. No clock driving you. A session clock runs quietly in
// the background from your first tick so the log still gets a duration, and
// timed holds get their own little countdown button.

import { addSession, dateKey, activeWorkout } from './storage.js';
import { Timer, formatClock } from './timer.js';
import { chime, notify, toast, unlockAudio } from './notify.js';
import { $, el, clear } from './ui.js';

let onLogged = () => {};
let startedAt = null;      // ISO time of the first tick
let elapsedHandle = null;
let rows = new Map();      // exercise id → { done, reps }
let holdFor = null;        // exercise id whose hold countdown is running

const holdTimer = new Timer({
  onTick: () => renderRows(),
  onDone: () => {
    chime('rest');
    notify('Hold done', 'Time.');
    holdFor = null;
    renderRows();
  },
});

const dom = {};

export function initTickList({ onSessionLogged = () => {} } = {}) {
  onLogged = onSessionLogged;
  Object.assign(dom, {
    panel: $('#tick-mode'),
    title: $('#tick-title'),
    sub: $('#tick-sub'),
    clock: $('#tick-clock'),
    items: $('#tick-items'),
    finish: $('#tick-finish'),
    clear: $('#tick-clear'),
  });

  dom.finish.addEventListener('click', finish);
  dom.clear.addEventListener('click', () => {
    if (progress().done && !confirm('Clear the ticks and start this workout over?')) return;
    reset();
    renderTickList();
  });
}

/** Anything ticked, or a hold running? Used to warn before leaving. */
export function tickListBusy() {
  return progress().done > 0;
}

export function resetTickList() {
  reset();
}

function reset() {
  rows = new Map();
  startedAt = null;
  holdFor = null;
  holdTimer.stop();
  stopElapsed();
}

/* ── rendering ────────────────────────────────────────────────────────── */

export function renderTickList() {
  const workout = activeWorkout();
  if (!workout) return;
  dom.title.textContent = workout.name;
  clear(dom.items);

  for (const exercise of workout.exercises) {
    if (!rows.has(exercise.id)) rows.set(exercise.id, { done: false, reps: '' });
    dom.items.append(buildRow(exercise));
  }
  renderSummary();
}

function buildRow(exercise) {
  const row = rows.get(exercise.id);
  const isHold = !exercise.targetReps;

  const box = el('input', { type: 'checkbox', checked: row.done });
  box.addEventListener('change', () => {
    row.done = box.checked;
    if (row.done && !startedAt) startElapsed();
    if (row.done) chime('work');
    renderTickList();
  });

  const body = el('div', { class: 'tick-body' }, [
    el('div', { class: 'tick-name' }, exercise.name),
    el(
      'div',
      { class: 'tick-meta' },
      isHold
        ? `${exercise.sets} × ${exercise.workSec}s hold`
        : `${exercise.sets} sets × ${exercise.targetReps} reps`,
    ),
    exercise.cue ? el('div', { class: 'tick-cue' }, exercise.cue) : null,
  ]);

  const side = el('div', { class: 'tick-side' });

  if (!isHold) {
    const reps = el('input', {
      type: 'number',
      class: 'tick-reps',
      min: 0,
      max: 999,
      inputMode: 'numeric',
      value: row.reps,
      placeholder: exercise.targetReps,
      title: 'Reps you actually managed — leave blank to log the target',
    });
    reps.addEventListener('input', () => {
      row.reps = reps.value;
    });
    side.append(reps);
  } else {
    const running = holdFor === exercise.id;
    const chip = el(
      'button',
      { type: 'button', class: `chip hold${running ? ' is-running' : ''}` },
      running ? formatClock(holdTimer.remaining) : `▶ ${exercise.workSec}s`,
    );
    chip.addEventListener('click', () => {
      unlockAudio();
      if (running) {
        holdTimer.stop();
        holdFor = null;
      } else {
        holdFor = exercise.id;
        holdTimer.start(exercise.workSec * 1000);
      }
      renderRows();
    });
    side.append(chip);
  }

  return el('li', { class: `tick-row${row.done ? ' is-done' : ''}` }, [
    el('label', {}, [box, body]),
    side,
  ]);
}

/** Cheap re-render used by the hold countdown — same thing, kept named for clarity. */
function renderRows() {
  renderTickList();
}

function progress() {
  const workout = activeWorkout();
  const total = workout?.exercises.length || 0;
  let done = 0;
  for (const exercise of workout?.exercises || []) {
    if (rows.get(exercise.id)?.done) done++;
  }
  return { done, total };
}

function renderSummary() {
  const { done, total } = progress();
  dom.sub.textContent = done
    ? `${done} of ${total} done${done === total ? ' — nice, hit finish' : ''}`
    : 'Tick each line as you finish it.';
  dom.finish.disabled = done === 0;
  dom.finish.textContent = done && done === total ? 'Finish workout' : `Finish (${done} of ${total})`;
}

/* ── session clock ────────────────────────────────────────────────────── */

function startElapsed() {
  startedAt = new Date().toISOString();
  stopElapsed();
  elapsedHandle = setInterval(paintElapsed, 1000);
  paintElapsed();
}

function stopElapsed() {
  clearInterval(elapsedHandle);
  elapsedHandle = null;
}

function paintElapsed() {
  dom.clock.textContent = startedAt ? formatClock(Date.now() - new Date(startedAt)) : '00:00';
}

/* ── finishing ────────────────────────────────────────────────────────── */

function finish() {
  const workout = activeWorkout();
  const { done } = progress();
  if (!workout || !done) return;

  const sets = [];
  for (const exercise of workout.exercises) {
    const row = rows.get(exercise.id);
    if (!row?.done) continue;
    const reps = row.reps === '' ? exercise.targetReps || null : Number(row.reps);
    // one entry per set, so set counts line up with timer-mode sessions
    for (let n = 1; n <= Math.max(1, Number(exercise.sets) || 1); n++) {
      sets.push({ exercise: exercise.name, set: n, reps, weight: null, rpe: null, at: new Date().toISOString() });
    }
  }

  const endedAt = new Date().toISOString();
  const minutes = startedAt ? (new Date(endedAt) - new Date(startedAt)) / 60_000 : 0;
  addSession({
    type: 'workout',
    date: dateKey(),
    startedAt: startedAt || endedAt,
    endedAt,
    minutes: Math.max(0.1, Math.round(minutes * 10) / 10),
    label: workout.name,
    sets,
  });

  chime('finish');
  toast(`Logged — ${sets.length} sets`);
  reset();
  renderTickList();
  paintElapsed();
  onLogged();
}
