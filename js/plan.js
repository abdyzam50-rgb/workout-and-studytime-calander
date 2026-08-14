// The plan panel on the calendar tab, and the "today" banner on the workout tab.

import { state, save, dateKey, activeWorkout } from './storage.js';
import { planToday, planFor, slotLabel, buildICS, REST, PUSH, trainedOn } from './schedule.js';
import { notify, toast, askNotifyPermission } from './notify.js';
import { $, el, clear } from './ui.js';

let onChange = () => {};
const dom = {};

export function initPlan({ onPlanChanged = () => {} } = {}) {
  onChange = onPlanChanged;
  Object.assign(dom, {
    banner: $('#today-plan'),
    enabled: $('#plan-enabled'),
    body: $('#plan-body'),
    pattern: $('#plan-pattern'),
    addSlot: $('#plan-add-slot'),
    add: $('#plan-add'),
    start: $('#plan-start'),
    stage: $('#plan-stage'),
    time: $('#plan-time'),
    restEvents: $('#plan-rest-events'),
    ics: $('#plan-ics'),
  });

  const plan = () => state.settings.schedule;

  dom.enabled.addEventListener('change', () => {
    plan().enabled = dom.enabled.checked;
    commit();
  });

  dom.add.addEventListener('click', () => {
    plan().pattern.push(dom.addSlot.value);
    commit();
  });

  dom.start.addEventListener('change', () => {
    if (dom.start.value) plan().startDate = dom.start.value;
    commit();
  });

  dom.stage.addEventListener('change', () => {
    plan().pushStageId = dom.stage.value;
    commit();
  });

  dom.time.addEventListener('change', () => {
    plan().time = dom.time.value || '18:00';
    commit();
  });

  dom.restEvents.addEventListener('change', () => {
    plan().includeRest = dom.restEvents.checked;
    save();
  });

  dom.ics.addEventListener('click', downloadICS);

  renderPlan();
  renderBanner();
  nagIfTrainingDay();
}

function commit() {
  save();
  renderPlan();
  renderBanner();
  onChange();
}

/* ── the editor ───────────────────────────────────────────────────────── */

export function renderPlan() {
  const plan = state.settings.schedule;
  dom.enabled.checked = plan.enabled;
  dom.body.hidden = !plan.enabled;
  dom.start.value = plan.startDate;
  dom.time.value = plan.time;
  dom.restEvents.checked = plan.includeRest;

  // the loop itself
  clear(dom.pattern);
  plan.pattern.forEach((slot, i) => {
    const del = el('button', { type: 'button', class: 'del', title: 'Remove this day' }, '✕');
    del.addEventListener('click', () => {
      plan.pattern.splice(i, 1);
      commit();
    });
    dom.pattern.append(
      el('li', { class: slot === REST ? 'is-rest' : '' }, [
        el('b', { class: 'day-num' }, `${i + 1}`),
        el('span', {}, slotLabel(slot)),
        del,
      ]),
    );
  });
  if (!plan.pattern.length) dom.pattern.append(el('li', { class: 'empty' }, 'Add some days below.'));

  // what you can add
  const slots = [
    { value: PUSH, label: 'Push — current stage' },
    { value: REST, label: 'Rest day' },
    ...state.workouts.map((w) => ({ value: w.programId || w.id, label: w.name })),
  ];
  fillSelect(dom.addSlot, slots, dom.addSlot.value);

  // which push stage the plan points at
  const stages = state.workouts
    .filter((w) => String(w.programId).startsWith('push-'))
    .map((w) => ({ value: w.id, label: w.name }));
  const fallback = stages[0]?.value ?? '';
  fillSelect(dom.stage, stages.length ? stages : [{ value: '', label: 'No push stages' }],
    plan.pushStageId || fallback);
  if (!plan.pushStageId && fallback) plan.pushStageId = fallback;
}

function fillSelect(select, options, selected) {
  clear(select);
  for (const o of options) select.append(el('option', { value: o.value }, o.label));
  if (selected != null && options.some((o) => o.value === selected)) select.value = selected;
}

/* ── today's banner ───────────────────────────────────────────────────── */

export function renderBanner() {
  const today = planToday();
  if (!today) {
    dom.banner.hidden = true;
    return;
  }
  dom.banner.hidden = false;
  dom.banner.className = `today-plan ${today.kind}`;
  clear(dom.banner);

  if (today.kind === 'rest') {
    dom.banner.append(
      el('b', {}, 'Today is a rest day'),
      el('span', {}, 'That is the plan working. Train anyway if you feel great, but you do not owe it anything.'),
    );
    return;
  }

  const done = trainedOn(dateKey());
  dom.banner.append(
    el('b', {}, done ? `Done today — ${today.workout.name}` : `Today: ${today.workout.name}`),
  );
  if (!done && activeWorkout()?.id !== today.workout.id) {
    const jump = el('button', { class: 'btn btn-sm' }, 'Load it');
    jump.addEventListener('click', () => {
      state.activeWorkoutId = today.workout.id;
      save();
      onChange();
      renderBanner();
    });
    dom.banner.append(jump);
  }
}

/** One nudge per day, and only while the app is actually open. */
function nagIfTrainingDay() {
  const today = planToday();
  if (!today || today.kind !== 'workout' || trainedOn(dateKey())) return;
  const key = 'focus-and-lift/nagged';
  if (localStorage.getItem(key) === dateKey()) return;
  localStorage.setItem(key, dateKey());
  notify('Training day', `${today.workout.name} is on the plan for today.`);
}

/* ── calendar file ────────────────────────────────────────────────────── */

async function downloadICS() {
  const plan = state.settings.schedule;
  if (!plan.enabled || !plan.pattern.length) {
    toast('Turn the loop on first');
    return;
  }
  const text = buildICS({ days: 180, includeRest: plan.includeRest });
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'focus-and-lift-plan.ics';
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Calendar file ready — open it to add the alerts');
  // The alerts live in the calendar; in-app notifications are the bonus.
  if (!state.settings.notify && (await askNotifyPermission())) {
    state.settings.notify = true;
    save();
  }
}

export function refreshPlan() {
  renderPlan();
  renderBanner();
}
