// Local-storage backed state. Everything the app knows lives in one JSON blob.

import { programWorkouts } from './program.js';

const KEY = 'focus-and-lift/v1';

export const DEFAULT_CHECKLIST = [
  'Logged the reps',
  'Form held to the last rep',
  'Nothing hurts that shouldn’t',
  'Breathing back under control',
];

function defaultState() {
  return {
    version: 1,
    settings: {
      theme: 'dark',
      sound: true,
      notify: false,
      wakeLock: true,
      study: { focusMin: 25, shortMin: 5, longMin: 15, cycles: 4, autoStart: true },
      defaultChecklist: [...DEFAULT_CHECKLIST],
    },
    workouts: programWorkouts(),
    activeWorkoutId: null,
    sessions: [],
  };
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Merge a loaded blob onto the defaults so older/partial data still boots. */
function hydrate(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    settings: {
      ...base.settings,
      ...(raw.settings || {}),
      study: { ...base.settings.study, ...((raw.settings || {}).study || {}) },
      defaultChecklist: (raw.settings || {}).defaultChecklist || base.settings.defaultChecklist,
    },
    workouts: Array.isArray(raw.workouts) && raw.workouts.length ? raw.workouts : base.workouts,
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
  };
}

function read() {
  try {
    return hydrate(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return defaultState();
  }
}

export const state = read();

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Could not save — storage may be full or blocked.', err);
    }
  }, 120);
}

/* ── sessions ─────────────────────────────────────────────────────────── */

export function addSession(session) {
  state.sessions.unshift({ id: uid(), ...session });
  // keep the log from growing without bound
  if (state.sessions.length > 2000) state.sessions.length = 2000;
  save();
  return session;
}

export function sessionsOn(dateKey) {
  return state.sessions.filter((s) => s.date === dateKey);
}

export function dateKey(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Consecutive days (ending today or yesterday) with at least one session. */
export function streak() {
  const days = new Set(state.sessions.map((s) => s.date));
  if (!days.size) return 0;
  const cursor = new Date();
  if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let count = 0;
  while (days.has(dateKey(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

/* ── workouts ─────────────────────────────────────────────────────────── */

export function activeWorkout() {
  return state.workouts.find((w) => w.id === state.activeWorkoutId) || state.workouts[0] || null;
}

export function saveWorkout(workout) {
  const i = state.workouts.findIndex((w) => w.id === workout.id);
  if (i >= 0) state.workouts[i] = workout;
  else state.workouts.push(workout);
  state.activeWorkoutId = workout.id;
  save();
}

export function deleteWorkout(id) {
  state.workouts = state.workouts.filter((w) => w.id !== id);
  if (state.activeWorkoutId === id) state.activeWorkoutId = state.workouts[0]?.id ?? null;
  save();
}

export function blankWorkout() {
  return {
    id: uid(),
    name: 'New workout',
    goal: '',
    checklist: [...state.settings.defaultChecklist],
    exercises: [{ id: uid(), name: 'Exercise 1', sets: 3, workSec: 45, restSec: 60, targetReps: 10, cue: '' }],
  };
}

/**
 * Add any program workouts that aren't already here, matched on programId, so
 * it's safe to run twice. Your own workouts and your whole log are untouched;
 * edits you've made to a stage you already have are kept.
 */
export function installProgram() {
  const have = new Set(state.workouts.map((w) => w.programId).filter(Boolean));
  const missing = programWorkouts().filter((w) => !have.has(w.programId));
  state.workouts.push(...missing);
  if (!state.activeWorkoutId) state.activeWorkoutId = state.workouts[0]?.id ?? null;
  save();
  return missing.length;
}

/* ── import / export ──────────────────────────────────────────────────── */

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  const incoming = hydrate(JSON.parse(text));
  Object.assign(state, incoming);
  save();
}

export function eraseAll() {
  Object.assign(state, defaultState());
  save();
}
