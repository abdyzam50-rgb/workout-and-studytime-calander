// The workout editor dialog: exercises, their timings, and the checklist that
// runs after every set.

import { saveWorkout, deleteWorkout, uid, state } from './storage.js';
import { $, el, clear } from './ui.js';
import { toast } from './notify.js';

let draft = null;
let onClose = () => {};
let isNew = false;
const dom = {};

export function initEditor() {
  Object.assign(dom, {
    dialog: $('#editor'),
    name: $('#ed-name'),
    goal: $('#ed-goal'),
    exercises: $('#ed-exercises'),
    addEx: $('#ed-add-ex'),
    checklist: $('#ed-checklist'),
    checkInput: $('#ed-checklist-input'),
    checkAdd: $('#ed-checklist-add'),
    save: $('#ed-save'),
    cancel: $('#ed-cancel'),
    close: $('#ed-close'),
    remove: $('#ed-delete'),
  });

  dom.addEx.addEventListener('click', () => {
    draft.exercises.push({
      id: uid(),
      name: `Exercise ${draft.exercises.length + 1}`,
      sets: 3,
      workSec: 45,
      restSec: 60,
      targetReps: 10,
      cue: '',
    });
    renderExercises();
  });

  dom.checkAdd.addEventListener('click', addChecklistItem);
  dom.checkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addChecklistItem();
    }
  });

  dom.save.addEventListener('click', commit);
  dom.cancel.addEventListener('click', () => dom.dialog.close());
  dom.close.addEventListener('click', () => dom.dialog.close());
  dom.remove.addEventListener('click', () => {
    if (!confirm(`Delete "${draft.name}"? This can't be undone.`)) return;
    deleteWorkout(draft.id);
    dom.dialog.close();
    toast('Workout deleted');
    onClose();
  });

  dom.dialog.addEventListener('close', () => {
    draft = null;
  });
}

export function openEditor(workout, options = {}) {
  draft = workout;
  isNew = options.isNew ?? false;
  onClose = options.onClose ?? (() => {});
  dom.name.value = workout.name;
  dom.goal.value = workout.goal || '';
  dom.remove.hidden = isNew || state.workouts.length <= 1;
  renderExercises();
  renderChecklist();
  dom.dialog.showModal();
  dom.name.focus();
  dom.name.select();
}

function renderExercises() {
  clear(dom.exercises);
  draft.exercises.forEach((exercise, i) => {
    const card = el('div', { class: 'ex-card' });

    const nameInput = el('input', { type: 'text', value: exercise.name, maxLength: 60, placeholder: 'Exercise name' });
    nameInput.addEventListener('input', () => {
      exercise.name = nameInput.value;
    });

    const del = el('button', { type: 'button', class: 'icon-btn', title: 'Remove exercise' }, '✕');
    del.addEventListener('click', () => {
      draft.exercises.splice(i, 1);
      renderExercises();
    });

    const up = el('button', { type: 'button', class: 'icon-btn', title: 'Move up' }, '↑');
    up.addEventListener('click', () => {
      if (i === 0) return;
      [draft.exercises[i - 1], draft.exercises[i]] = [draft.exercises[i], draft.exercises[i - 1]];
      renderExercises();
    });

    const cueInput = el('input', {
      type: 'text',
      class: 'ex-cue',
      value: exercise.cue || '',
      maxLength: 160,
      placeholder: 'Cue shown while the set runs (tempo, form, what to watch)',
    });
    cueInput.addEventListener('input', () => {
      exercise.cue = cueInput.value;
    });

    card.append(el('div', { class: 'ex-top' }, [nameInput, up, del]));
    card.append(cueInput);
    card.append(
      el('div', { class: 'ex-nums' }, [
        numField('Sets', exercise, 'sets', 1, 20),
        numField('Work (s)', exercise, 'workSec', 5, 3600),
        numField('Rest (s)', exercise, 'restSec', 0, 3600),
        numField('Target reps', exercise, 'targetReps', 0, 999),
      ]),
    );
    dom.exercises.append(card);
  });

  if (!draft.exercises.length) {
    dom.exercises.append(el('p', { class: 'hint' }, 'No exercises yet — add one below.'));
  }
}

function numField(label, target, key, min, max) {
  const input = el('input', { type: 'number', value: target[key] ?? min, min, max, step: 1, inputMode: 'numeric' });
  input.addEventListener('change', () => {
    const value = Math.min(max, Math.max(min, Math.round(Number(input.value) || min)));
    input.value = value;
    target[key] = value;
  });
  return el('label', {}, [label, input]);
}

function renderChecklist() {
  renderList(dom.checklist, draft.checklist, (next) => {
    draft.checklist = next;
    renderChecklist();
  });
}

function addChecklistItem() {
  const text = dom.checkInput.value.trim();
  if (!text) return;
  draft.checklist.push(text);
  dom.checkInput.value = '';
  renderChecklist();
  dom.checkInput.focus();
}

/** Shared renderer for the two editable string lists (editor + settings). */
export function renderList(container, items, onChange) {
  clear(container);
  items.forEach((text, i) => {
    const del = el('button', { type: 'button', class: 'del', title: 'Remove' }, '✕');
    del.addEventListener('click', () => onChange(items.filter((_, j) => j !== i)));
    container.append(el('li', {}, [el('span', {}, text), del]));
  });
  if (!items.length) container.append(el('li', { class: 'empty' }, 'Nothing here yet.'));
}

function commit() {
  const name = dom.name.value.trim();
  if (!name) {
    toast('Give the workout a name first');
    dom.name.focus();
    return;
  }
  if (!draft.exercises.length) {
    toast('Add at least one exercise');
    return;
  }
  draft.name = name;
  draft.goal = dom.goal.value.trim();
  draft.exercises = draft.exercises.map((e) => ({ ...e, name: e.name.trim() || 'Exercise' }));
  saveWorkout(draft);
  dom.dialog.close();
  toast(isNew ? 'Workout created' : 'Workout saved');
  onClose();
}
