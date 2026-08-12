// Chimes, desktop notifications, screen wake lock and toasts — all optional,
// all degrade quietly when the browser says no.

import { state } from './storage.js';

let audioCtx = null;

function ctx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

/** Warm the audio context up from a user gesture so later chimes are allowed. */
export function unlockAudio() {
  ctx();
}

function tone(freq, startAt, length, gainPeak) {
  const ac = ctx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t = ac.currentTime + startAt;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(gainPeak, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

/** `kind` shapes the chime so you can tell phases apart without looking. */
export function chime(kind = 'done') {
  if (!state.settings.sound) return;
  try {
    if (kind === 'work') {
      tone(660, 0, 0.18, 0.25);
      tone(990, 0.16, 0.3, 0.22);
    } else if (kind === 'rest') {
      tone(520, 0, 0.22, 0.2);
      tone(390, 0.2, 0.36, 0.18);
    } else if (kind === 'finish') {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.13, 0.34, 0.2));
    } else {
      tone(880, 0, 0.22, 0.22);
      tone(880, 0.28, 0.3, 0.2);
    }
  } catch (err) {
    console.warn('Chime failed', err);
  }
}

export async function askNotifyPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

export function notify(title, body) {
  if (!state.settings.notify || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag: 'focus-and-lift', renotify: true });
  } catch (err) {
    console.warn('Notification failed', err);
  }
}

/* ── wake lock ───────────────────────────────────────────────────────── */

let lock = null;

export async function keepAwake(on) {
  if (!('wakeLock' in navigator)) return;
  try {
    if (on && state.settings.wakeLock) {
      if (!lock) lock = await navigator.wakeLock.request('screen');
    } else if (lock) {
      await lock.release();
      lock = null;
    }
  } catch {
    lock = null; // denied or not visible — not worth surfacing
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && lock === null) return;
});

/* ── toast ───────────────────────────────────────────────────────────── */

let toastTimer = null;

export function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
