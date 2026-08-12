// Workout side. Each workout runs one of two ways:
//
//   tick mode (the default) — the workout is a list you check off, one line per
//     exercise. Lives in ticklist.js.
//   timer mode — every set and rest runs on the clock, with a form checklist
//     gating the move to the next set. That's the state machine below.
//
// Stages: idle → ready → work → (rest | hold) → work … → done
//   work  — the set itself is timed
//   rest  — recovery clock; the checklist card is open at the same time
//   hold  — rest is over (or there is none) and we are waiting on the checklist

import { state, save, addSession, dateKey, activeWorkout, blankWorkout } from './storage.js';
import { Timer, formatClock, formatDuration } from './timer.js';
import { chime, notify, keepAwake, toast, unlockAudio } from './notify.js';
import { $, el, clear, setRing, clockTime } from './ui.js';
import { openEditor } from './editor.js';
import { initTickList, renderTickList, resetTickList, tickListBusy } from './ticklist.js';

const READY_SEC = 5;

let steps = [];          // flattened [{ exIndex, exercise, setNum }]
let idx = 0;
let stage = 'idle';
let startedAt = null;
let setLogs = [];
let checklistResolved = false;
let onLogged = () => {};

const timer = new Timer({ onTick: render, onDone: intervalDone });
const dom = {};

export function initWorkout({ onSessionLogged = () => {} } = {}) {
  onLogged = onSessionLogged;
  Object.assign(dom, {
    select: $('#workout-select'),
    edit: $('#workout-edit'),
    new: $('#workout-new'),
    mode: $('#workout-mode'),
    timerPanel: $('#timer-mode'),
    tickPanel: $('#tick-mode'),
    clock: $('#workout-clock'),
    ring: $('#workout-ring'),
    status: $('#workout-status'),
    now: $('#workout-now'),
    next: $('#workout-next'),
    goal: $('#workout-goal'),
    start: $('#workout-start'),
    skip: $('#workout-skip'),
    reset: $('#workout-reset'),
    card: $('#set-checklist'),
    items: $('#checklist-items'),
    count: $('#checklist-count'),
    continue: $('#checklist-continue'),
    reps: $('#log-reps'),
    weight: $('#log-weight'),
    rpe: $('#log-rpe'),
    progress: $('#workout-progress'),
    log: $('#workout-log'),
    dial: $('#view-workout .dial'),
    todaySets: $('#workout-today-sets'),
    todayMin: $('#workout-today-min'),
  });

  dom.select.addEventListener('change', () => {
    state.activeWorkoutId = dom.select.value;
    save();
    resetTickList();
    reset();
    applyMode();
  });
  dom.mode.addEventListener('click', switchMode);
  dom.edit.addEventListener('click', () => {
    const workout = activeWorkout();
    if (workout) openEditor(structuredClone(workout), { isNew: false, onClose: afterEdit });
  });
  dom.new.addEventListener('click', () => openEditor(blankWorkout(), { isNew: true, onClose: afterEdit }));

  dom.start.addEventListener('click', () => {
    unlockAudio();
    toggle();
  });
  dom.skip.addEventListener('click', skip);
  dom.reset.addEventListener('click', () => reset(true));
  dom.continue.addEventListener('click', resolveChecklist);

  initTickList({
    onSessionLogged: () => {
      refreshStats();
      onLogged();
    },
  });

  renderWorkoutOptions();
  reset();
  applyMode();
  refreshStats();
}

function afterEdit() {
  renderWorkoutOptions();
  resetTickList();
  reset();
  applyMode();
}

/* ── which mode this workout runs in ──────────────────────────────────── */

// Anything without an explicit mode is a tick list — that's the default.
const workoutMode = () => (activeWorkout()?.mode === 'timer' ? 'timer' : 'checklist');

function applyMode() {
  const ticks = workoutMode() === 'checklist';
  dom.tickPanel.hidden = !ticks;
  dom.timerPanel.hidden = ticks;
  dom.mode.textContent = ticks ? '☑ Ticks' : '⏱ Timer';
  if (ticks) renderTickList();
  else render();
  renderGoal();
}

function switchMode() {
  const workout = activeWorkout();
  if (!workout) return;
  if (stage !== 'idle' && stage !== 'done' && !confirm('Switch mode and drop the running workout?')) return;
  if (tickListBusy() && !confirm('Switch mode and drop the ticks you have so far?')) return;
  workout.mode = workoutMode() === 'checklist' ? 'timer' : 'checklist';
  save();
  resetTickList();
  reset();
  applyMode();
}

function renderGoal() {
  const workout = activeWorkout();
  // In timer mode the graduation rule is only useful before you start.
  const show = workout?.goal && (workoutMode() === 'checklist' || stage === 'idle' || stage === 'done');
  dom.goal.hidden = !show;
  if (show) dom.goal.textContent = workout.goal;
}

/* ── plan ─────────────────────────────────────────────────────────────── */

function buildSteps() {
  const workout = activeWorkout();
  steps = [];
  if (!workout) return;
  workout.exercises.forEach((exercise, exIndex) => {
    const count = Math.max(1, Number(exercise.sets) || 1);
    for (let setNum = 1; setNum <= count; setNum++) steps.push({ exIndex, exercise, setNum });
  });
}

const current = () => steps[idx] || null;
const isLastStep = () => idx >= steps.length - 1;

/* ── flow ─────────────────────────────────────────────────────────────── */

function toggle() {
  if (stage === 'idle' || stage === 'done') return begin();
  if (stage === 'hold') return void toast('Finish the checklist to carry on.');
  timer.toggle();
  keepAwake(timer.running);
  render();
}

function begin() {
  if (!steps.length) return void toast('This workout has no exercises yet — hit Edit to add some.');
  idx = 0;
  setLogs = [];
  startedAt = new Date().toISOString();
  stage = 'ready';
  timer.start(READY_SEC * 1000);
  keepAwake(true);
  render();
}

function startWork() {
  stage = 'work';
  checklistResolved = false;
  hideChecklist();
  chime('work');
  notify(`${current().exercise.name} — set ${current().setNum}`, 'Go.');
  timer.start(Math.max(1, Number(current().exercise.workSec) || 30) * 1000);
  render();
}

function startRestOrHold() {
  const step = current();
  const restMs = Math.max(0, Number(step.exercise.restSec) || 0) * 1000;
  showChecklist(step);
  chime('rest');
  notify('Set done', 'Run your checklist, then rest.');
  if (isLastStep() || restMs === 0) {
    stage = 'hold';
    timer.stop();
  } else {
    stage = 'rest';
    timer.start(restMs);
  }
  render();
}

function intervalDone() {
  if (stage === 'ready') return startWork();
  if (stage === 'work') return startRestOrHold();
  if (stage === 'rest') {
    if (checklistResolved) return advance();
    stage = 'hold';
    chime('done');
    render();
  }
}

function advance() {
  if (isLastStep()) return finish();
  idx += 1;
  startWork();
}

function skip() {
  if (stage === 'idle' || stage === 'done') return;
  if (stage === 'ready') return startWork();
  if (stage === 'work') return startRestOrHold();
  // resting or holding: the checklist still has to be cleared first
  if (!checklistResolved) return void toast('Tick the checklist before moving on.');
  timer.stop();
  advance();
}

function finish() {
  timer.stop();
  hideChecklist();
  stage = 'done';
  keepAwake(false);
  chime('finish');
  notify('Workout complete', `${setLogs.length} sets done. Nice.`);
  logWorkout();
  render();
}

function reset(manual = false) {
  if (manual && setLogs.length) logWorkout();
  timer.stop();
  hideChecklist();
  buildSteps();
  idx = 0;
  stage = 'idle';
  setLogs = [];
  startedAt = null;
  checklistResolved = false;
  keepAwake(false);
  render();
}

function logWorkout() {
  if (!setLogs.length || !startedAt) return;
  const endedAt = new Date().toISOString();
  const minutes = Math.max(0.1, (new Date(endedAt) - new Date(startedAt)) / 60_000);
  addSession({
    type: 'workout',
    date: dateKey(),
    startedAt,
    endedAt,
    minutes: Math.round(minutes * 10) / 10,
    label: activeWorkout()?.name || 'Workout',
    sets: setLogs,
  });
  startedAt = null;
  setLogs = [];
  refreshStats();
  onLogged();
  toast('Workout logged');
}

/* ── checklist gate ───────────────────────────────────────────────────── */

function checklistItems() {
  const workout = activeWorkout();
  const items = workout?.checklist?.length ? workout.checklist : state.settings.defaultChecklist;
  return items.filter(Boolean);
}

function showChecklist(step) {
  const items = checklistItems();
  clear(dom.items);
  items.forEach((text, i) => {
    const input = el('input', { type: 'checkbox', id: `chk-${i}` });
    input.addEventListener('change', updateChecklistState);
    dom.items.append(el('li', {}, el('label', { htmlFor: `chk-${i}` }, [input, el('span', {}, text)])));
  });
  dom.reps.value = '';
  dom.weight.value = '';
  dom.rpe.value = '';
  dom.reps.placeholder = step.exercise.targetReps ? `target ${step.exercise.targetReps}` : '—';
  dom.card.hidden = false;
  updateChecklistState();
  dom.card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideChecklist() {
  dom.card.hidden = true;
}

function updateChecklistState() {
  const boxes = [...dom.items.querySelectorAll('input')];
  const done = boxes.filter((b) => b.checked).length;
  dom.count.textContent = `${done} / ${boxes.length}`;
  const ready = done === boxes.length;
  dom.continue.disabled = !ready;
  dom.continue.textContent = !ready
    ? 'Tick everything to continue'
    : stage === 'rest'
      ? 'Log set & keep resting'
      : isLastStep()
        ? 'Log set & finish workout'
        : 'Log set & start next set';
}

function resolveChecklist() {
  const step = current();
  if (!step) return;
  setLogs.push({
    exercise: step.exercise.name,
    set: step.setNum,
    reps: numberOrNull(dom.reps.value),
    weight: numberOrNull(dom.weight.value),
    rpe: numberOrNull(dom.rpe.value),
    at: new Date().toISOString(),
  });
  checklistResolved = true;
  hideChecklist();
  refreshStats();
  // Ticking the list early doesn't cut the rest short — sit out the clock.
  if (stage === 'rest' && timer.remaining > 0) return render();
  timer.stop();
  advance();
}

function numberOrNull(value) {
  const n = Number(value);
  return value === '' || Number.isNaN(n) ? null : n;
}

/* ── render ───────────────────────────────────────────────────────────── */

const STAGE_TEXT = {
  idle: 'Press start',
  ready: 'Get ready…',
  work: 'Work',
  rest: 'Rest',
  hold: 'Waiting on your checklist',
  done: 'Workout complete 🎉',
};

// The work clock is an upper bound, not a target: on rep work you finish your
// reps and press this rather than standing around waiting for zero.
const SKIP_TEXT = {
  idle: 'Skip',
  ready: 'Skip lead-in',
  work: 'Set done →',
  rest: 'Skip rest',
  hold: 'Skip rest',
  done: 'Skip',
};

function render() {
  const step = current();
  const idleMs = (Number(steps[0]?.exercise.workSec) || 0) * 1000;
  dom.clock.textContent = formatClock(stage === 'idle' ? idleMs : timer.remaining);
  setRing(dom.ring, stage === 'idle' || stage === 'done' ? 0 : timer.progress);
  dom.dial.classList.toggle('is-running', timer.running);

  dom.status.textContent = timer.running || stage === 'hold' || stage === 'done'
    ? STAGE_TEXT[stage]
    : stage === 'idle'
      ? STAGE_TEXT.idle
      : `${STAGE_TEXT[stage]} — paused`;

  dom.start.textContent =
    stage === 'idle' || stage === 'done' ? 'Start' : timer.running ? 'Pause' : 'Resume';
  dom.skip.textContent = SKIP_TEXT[stage];

  const workout = activeWorkout();
  if (stage === 'idle') {
    dom.now.textContent = workout ? workout.name : 'No workout yet';
    dom.next.textContent = workout
      ? `${steps.length} sets · about ${formatDuration(Math.max(1, plannedSeconds() / 60))}`
      : 'Create one with the New button.';
  } else if (stage === 'done') {
    dom.now.textContent = 'Done';
    dom.next.textContent = 'Reset to run it again.';
  } else if (step) {
    dom.now.textContent = `${step.exercise.name} · set ${step.setNum} of ${step.exercise.sets}`;
    const upcoming = steps[idx + 1];
    dom.next.textContent =
      stage === 'work' || stage === 'ready'
        ? [step.exercise.targetReps ? `Target ${step.exercise.targetReps} reps` : null, step.exercise.cue]
            .filter(Boolean)
            .join(' — ') || 'Give it everything'
        : upcoming
          ? `Next: ${upcoming.exercise.name} · set ${upcoming.setNum}`
          : 'Last set — finish strong';
  }

  renderGoal();

  if (!dom.card.hidden) updateChecklistState();
  renderProgress();
}

function plannedSeconds() {
  return steps.reduce(
    (total, s) => total + (Number(s.exercise.workSec) || 0) + (Number(s.exercise.restSec) || 0),
    0,
  );
}

function renderProgress() {
  const workout = activeWorkout();
  clear(dom.progress);
  if (!workout) return;
  const step = current();
  workout.exercises.forEach((exercise, exIndex) => {
    const count = Math.max(1, Number(exercise.sets) || 1);
    const isCurrent = stage !== 'idle' && stage !== 'done' && step && step.exIndex === exIndex;
    const doneSets = setLogs.filter((l) => l.exercise === exercise.name).length;
    const dots = el(
      'div',
      { class: 'prog-sets' },
      Array.from({ length: count }, (_, i) => el('i', { class: i < doneSets ? 'done' : '' })),
    );
    dom.progress.append(
      el(
        'div',
        {
          class: `prog-row${isCurrent ? ' is-current' : ''}${doneSets >= count ? ' is-done' : ''}`,
        },
        [
          el('span', { class: 'prog-name' }, exercise.name),
          dots,
          el('span', { class: 'prog-meta' }, `${exercise.workSec}s / ${exercise.restSec}s`),
        ],
      ),
    );
  });
}

function renderWorkoutOptions() {
  clear(dom.select);
  for (const workout of state.workouts) {
    dom.select.append(el('option', { value: workout.id }, workout.name));
  }
  const active = activeWorkout();
  if (active) {
    state.activeWorkoutId = active.id;
    dom.select.value = active.id;
  }
  buildSteps();
}

export function refreshStats() {
  const today = state.sessions.filter((s) => s.type === 'workout' && s.date === dateKey());
  const sets = today.reduce((sum, s) => sum + (s.sets?.length || 0), 0) + setLogs.length;
  const minutes = today.reduce((sum, s) => sum + s.minutes, 0);
  dom.todaySets.textContent = sets;
  dom.todayMin.textContent = formatDuration(minutes);
  renderLog();
}

function renderLog() {
  const recent = state.sessions.filter((s) => s.type === 'workout').slice(0, 12);
  clear(dom.log);
  if (!recent.length) {
    dom.log.append(el('li', { class: 'empty' }, 'No workouts logged yet.'));
    return;
  }
  for (const s of recent) {
    dom.log.append(
      el('li', {}, [
        el('b', { title: s.label }, s.label),
        el('span', {}, `${s.sets?.length || 0} sets · ${clockTime(s.endedAt)}`),
      ]),
    );
  }
}

/** Anything in flight that would be lost on a reload. */
export function workoutRunning() {
  return timer.running || tickListBusy();
}

export function toggleWorkout() {
  if (workoutMode() === 'checklist') return; // nothing for space to start here
  toggle();
}

export function refreshWorkoutList() {
  renderWorkoutOptions();
  applyMode();
}
