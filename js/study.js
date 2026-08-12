// Study side: a Pomodoro-style cycle of focus blocks separated by breaks.

import { state, save, addSession, dateKey, streak } from './storage.js';
import { Timer, formatClock, formatDuration } from './timer.js';
import { chime, notify, keepAwake, toast, unlockAudio } from './notify.js';
import { $, $$, el, clear, setRing, clockTime } from './ui.js';

const PHASES = {
  focus: { label: 'Focus', minutes: () => state.settings.study.focusMin, blurb: 'Head down.' },
  short: { label: 'Short break', minutes: () => state.settings.study.shortMin, blurb: 'Stand up, look away from the screen.' },
  long: { label: 'Long break', minutes: () => state.settings.study.longMin, blurb: 'Proper break. Walk around.' },
};

let phase = 'focus';
let cycle = 1;          // which focus block of the current set we're on
let startedAt = null;   // ISO timestamp of the running focus block
let onLogged = () => {};

const timer = new Timer({ onTick: render, onDone: complete });

const dom = {};

export function initStudy({ onSessionLogged = () => {} } = {}) {
  onLogged = onSessionLogged;
  Object.assign(dom, {
    clock: $('#study-clock'),
    ring: $('#study-ring'),
    status: $('#study-status'),
    start: $('#study-start'),
    skip: $('#study-skip'),
    reset: $('#study-reset'),
    subject: $('#study-subject'),
    dots: $('#study-dots'),
    cycle: $('#study-cycle'),
    cycleTotal: $('#study-cycle-total'),
    log: $('#study-log'),
    dial: $('#view-study .dial'),
    todayMin: $('#study-today-min'),
    todaySessions: $('#study-today-sessions'),
    streak: $('#study-streak'),
  });

  dom.start.addEventListener('click', () => {
    unlockAudio();
    toggle();
  });
  dom.skip.addEventListener('click', () => skip());
  dom.reset.addEventListener('click', () => reset());

  $$('#study-phases .pill').forEach((pill) =>
    pill.addEventListener('click', () => switchPhase(pill.dataset.phase)),
  );

  bindSettings();
  reset();
  refreshStats();
}

/* ── settings inputs ──────────────────────────────────────────────────── */

function bindSettings() {
  const cfg = state.settings.study;
  const fields = [
    ['#cfg-focus', 'focusMin'],
    ['#cfg-short', 'shortMin'],
    ['#cfg-long', 'longMin'],
    ['#cfg-cycles', 'cycles'],
  ];
  for (const [sel, key] of fields) {
    const input = $(sel);
    input.value = cfg[key];
    input.addEventListener('change', () => {
      const min = Number(input.min) || 1;
      const max = Number(input.max) || 999;
      const value = Math.min(max, Math.max(min, Math.round(Number(input.value) || min)));
      input.value = value;
      cfg[key] = value;
      save();
      if (!timer.running) reset();
      renderDots();
    });
  }

  const auto = $('#cfg-autostart');
  auto.checked = cfg.autoStart;
  auto.addEventListener('change', () => {
    cfg.autoStart = auto.checked;
    save();
  });

  $$('[data-preset]').forEach((chip) =>
    chip.addEventListener('click', () => {
      const [focus, short, long] = chip.dataset.preset.split('/').map(Number);
      Object.assign(cfg, { focusMin: focus, shortMin: short, longMin: long });
      $('#cfg-focus').value = focus;
      $('#cfg-short').value = short;
      $('#cfg-long').value = long;
      save();
      if (!timer.running) reset();
      toast(`Set to ${focus} / ${short} / ${long} minutes`);
    }),
  );
}

/* ── flow ─────────────────────────────────────────────────────────────── */

function phaseMs(name = phase) {
  return PHASES[name].minutes() * 60_000;
}

function toggle() {
  if (timer.elapsed <= 0) {
    begin();
  } else if (timer.running) {
    timer.pause();
    keepAwake(false);
    render();
  } else {
    timer.resume();
    keepAwake(true);
    render();
  }
}

function begin() {
  startedAt = new Date().toISOString();
  timer.start(phaseMs());
  keepAwake(true);
  render();
}

function complete() {
  if (phase === 'focus') {
    logFocus(phaseMs() / 60_000);
    chime('rest');
    notify('Focus block done', 'Take your break — you earned it.');
    advanceAfterFocus();
  } else {
    chime('work');
    notify('Break over', 'Back to it.');
    setPhase('focus');
  }

  if (state.settings.study.autoStart) begin();
  else {
    keepAwake(false);
    render();
  }
}

function advanceAfterFocus() {
  const total = state.settings.study.cycles;
  if (cycle >= total) {
    cycle = 1;
    setPhase('long');
  } else {
    cycle += 1;
    setPhase('short');
  }
}

function setPhase(name) {
  phase = name;
  timer.duration = phaseMs();
  timer.remaining = timer.duration;
  render();
}

function switchPhase(name) {
  if (timer.running && !confirm('Switch phase and drop the running timer?')) return;
  logPartialFocus();
  timer.stop();
  keepAwake(false);
  setPhase(name);
}

function skip() {
  const wasFocus = phase === 'focus';
  logPartialFocus();
  timer.stop();
  keepAwake(false);
  if (wasFocus) advanceAfterFocus();
  else setPhase('focus');
  render();
}

function reset() {
  logPartialFocus();
  timer.stop();
  keepAwake(false);
  setPhase(phase);
}

/** Credit unfinished focus time when the user bails out mid-block. */
function logPartialFocus() {
  if (phase !== 'focus' || !startedAt) return;
  const minutes = timer.elapsed / 60_000;
  startedAt = null;
  if (minutes >= 1) {
    logFocus(minutes);
    toast(`Logged ${formatDuration(minutes)} of focus`);
  }
}

function logFocus(minutes) {
  const label = dom.subject.value.trim() || 'Study';
  addSession({
    type: 'study',
    date: dateKey(),
    startedAt: startedAt || new Date().toISOString(),
    endedAt: new Date().toISOString(),
    minutes: Math.round(minutes * 10) / 10,
    label,
  });
  startedAt = null;
  refreshStats();
  onLogged();
}

/* ── render ───────────────────────────────────────────────────────────── */

function render() {
  const ms = timer.duration === 0 ? phaseMs() : timer.remaining;
  dom.clock.textContent = formatClock(ms);
  setRing(dom.ring, timer.duration === 0 ? 0 : timer.progress);
  dom.dial.classList.toggle('is-running', timer.running);

  dom.start.textContent = timer.running ? 'Pause' : timer.elapsed > 0 && timer.remaining > 0 ? 'Resume' : 'Start';
  dom.status.textContent = timer.running
    ? PHASES[phase].blurb
    : timer.elapsed > 0
      ? `${PHASES[phase].label} paused`
      : `Ready — ${PHASES[phase].label.toLowerCase()}`;

  $$('#study-phases .pill').forEach((p) => p.classList.toggle('is-active', p.dataset.phase === phase));
  document.title = timer.running
    ? `${formatClock(ms)} · ${PHASES[phase].label}`
    : 'Focus & Lift — Study and Workout Timers';

  renderDots();
}

function renderDots() {
  const total = state.settings.study.cycles;
  dom.cycle.textContent = Math.min(cycle, total);
  dom.cycleTotal.textContent = total;
  clear(dom.dots);
  for (let i = 1; i <= total; i++) {
    dom.dots.append(el('i', { class: i < cycle || (i === cycle && phase !== 'focus') ? 'done' : '' }));
  }
}

export function refreshStats() {
  const today = state.sessions.filter((s) => s.type === 'study' && s.date === dateKey());
  const minutes = today.reduce((sum, s) => sum + s.minutes, 0);
  dom.todayMin.textContent = formatDuration(minutes);
  dom.todaySessions.textContent = today.length;
  dom.streak.textContent = streak();
  renderLog();
}

function renderLog() {
  const recent = state.sessions.filter((s) => s.type === 'study').slice(0, 12);
  clear(dom.log);
  if (!recent.length) {
    dom.log.append(el('li', { class: 'empty' }, 'No sessions logged yet.'));
    return;
  }
  for (const s of recent) {
    dom.log.append(
      el('li', {}, [
        el('b', { title: s.label }, s.label),
        el('span', {}, `${formatDuration(s.minutes)} · ${clockTime(s.endedAt)}`),
      ]),
    );
  }
}

export function studyRunning() {
  return timer.running;
}

export function toggleStudy() {
  toggle();
}
