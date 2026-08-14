// Boots the app: tab routing, theme, global settings, data import/export.

import { state, save, exportJSON, importJSON, eraseAll, installProgram } from './storage.js';
import { initStudy, refreshStats as refreshStudy, studyRunning, toggleStudy } from './study.js';
import {
  initWorkout,
  refreshStats as refreshWorkout,
  refreshWorkoutList,
  workoutRunning,
  toggleWorkout,
} from './workout.js';
import { initCalendar, renderCalendar } from './calendar.js';
import { initPlan, refreshPlan } from './plan.js';
import { initEditor, renderList } from './editor.js';
import { askNotifyPermission, toast } from './notify.js';
import { $, $$ } from './ui.js';

let view = 'study';

function showView(name) {
  view = name;
  $$('.view').forEach((section) => section.classList.toggle('is-active', section.id === `view-${name}`));
  $$('.tab').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.view === name)));
  if (name === 'calendar') renderCalendar();
}

function initTabs() {
  $$('.tab').forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));
}

function initTheme() {
  const apply = () => document.documentElement.setAttribute('data-theme', state.settings.theme);
  apply();
  $('#theme-toggle').addEventListener('click', () => {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    save();
    apply();
  });
}

function initSettings() {
  const sound = $('#cfg-sound');
  sound.checked = state.settings.sound;
  sound.addEventListener('change', () => {
    state.settings.sound = sound.checked;
    save();
  });

  const notifyBox = $('#cfg-notify');
  notifyBox.checked = state.settings.notify;
  notifyBox.addEventListener('change', async () => {
    if (notifyBox.checked) {
      const granted = await askNotifyPermission();
      notifyBox.checked = granted;
      if (!granted) toast('Your browser blocked notifications');
    }
    state.settings.notify = notifyBox.checked;
    save();
  });

  const wake = $('#cfg-wakelock');
  wake.checked = state.settings.wakeLock;
  wake.addEventListener('change', () => {
    state.settings.wakeLock = wake.checked;
    save();
  });

  const list = $('#default-checklist');
  const input = $('#default-checklist-input');
  const draw = () =>
    renderList(list, state.settings.defaultChecklist, (next) => {
      state.settings.defaultChecklist = next;
      save();
      draw();
    });
  draw();

  const add = () => {
    const text = input.value.trim();
    if (!text) return;
    state.settings.defaultChecklist.push(text);
    input.value = '';
    save();
    draw();
  };
  $('#default-checklist-add').addEventListener('click', add);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  });

  initDataButtons();
}

function initDataButtons() {
  $('#data-program').addEventListener('click', () => {
    const added = installProgram();
    refreshWorkoutList();
    refreshWorkout();
    toast(added ? `Added ${added} workout${added === 1 ? '' : 's'}` : 'Already got all of them');
  });

  $('#data-export').addEventListener('click', () => {
    const blob = new Blob([exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focus-and-lift-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported');
  });

  const file = $('#data-file');
  $('#data-import').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    try {
      importJSON(await chosen.text());
      toast('Imported — reloading');
      setTimeout(() => location.reload(), 700);
    } catch {
      toast("That file didn't look like an export");
    }
    file.value = '';
  });

  $('#data-clear').addEventListener('click', () => {
    if (!confirm('Erase every session, workout and setting? This cannot be undone.')) return;
    eraseAll();
    location.reload();
  });
}

function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable;
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.code === 'Space') {
      if (view === 'study') {
        e.preventDefault();
        toggleStudy();
      } else if (view === 'workout') {
        e.preventDefault();
        toggleWorkout();
      }
      return;
    }
    const jump = { Digit1: 'study', Digit2: 'workout', Digit3: 'calendar', Digit4: 'settings' }[e.code];
    if (jump) showView(jump);
  });
}

function initUnloadGuard() {
  window.addEventListener('beforeunload', (e) => {
    if (studyRunning() || workoutRunning()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

function initServiceWorker() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* offline support is a bonus, not a requirement */
  });
}

function refreshEverything() {
  refreshStudy();
  refreshWorkout();
  refreshPlan();
  renderCalendar();
}

initTheme();
initTabs();
initEditor();
initStudy({ onSessionLogged: refreshEverything });
initWorkout({ onSessionLogged: refreshEverything });
initCalendar();
initPlan({
  onPlanChanged: () => {
    refreshWorkoutList();
    refreshWorkout();
    renderCalendar();
  },
});
initSettings();
initShortcuts();
initUnloadGuard();
initServiceWorker();
showView('study');
