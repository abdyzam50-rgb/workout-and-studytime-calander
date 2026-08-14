// The training plan: a repeating loop of days, e.g. train / rest / train / rest.
//
// The pattern is a list of slots. Each slot is either the string 'rest', the
// string 'push' (whichever push stage you're currently on, so the plan follows
// you up the stages without being rewritten), or a workout id.
//
// It also builds an .ics file, because a phone can only be relied on to nag you
// from its own calendar app — a web app can't wake itself up.

import { state, dateKey } from './storage.js';

export const REST = 'rest';
export const PUSH = 'push';

/** Local-noon Date for a YYYY-MM-DD key, so DST can't shift the day. */
export function dayFromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function daysBetween(fromKey, toKey) {
  return Math.round((dayFromKey(toKey) - dayFromKey(fromKey)) / 86_400_000);
}

export function addDays(key, n) {
  const d = dayFromKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** The push stage the plan should point at right now. */
export function currentPushWorkout() {
  const { pushStageId } = state.settings.schedule;
  return (
    state.workouts.find((w) => w.id === pushStageId) ||
    state.workouts.find((w) => String(w.programId).startsWith('push-')) ||
    null
  );
}

function resolveSlot(slot) {
  if (slot === REST) return null;
  if (slot === PUSH) return currentPushWorkout();
  // ids for workouts you made; programIds so the shipped defaults survive a reinstall
  return state.workouts.find((w) => w.id === slot || w.programId === slot) || null;
}

/**
 * What's scheduled on a given day.
 * @returns {{kind:'rest'|'workout', workout?:object, slot:string}|null}
 *          null when there's no plan, or the day is before it starts.
 */
export function planFor(key) {
  const plan = state.settings.schedule;
  if (!plan?.enabled || !plan.pattern?.length || !plan.startDate) return null;
  const offset = daysBetween(plan.startDate, key);
  if (offset < 0) return null;
  const slot = plan.pattern[((offset % plan.pattern.length) + plan.pattern.length) % plan.pattern.length];
  const workout = resolveSlot(slot);
  return workout ? { kind: 'workout', workout, slot } : { kind: 'rest', slot };
}

export function planToday() {
  return planFor(dateKey());
}

/** Was anything actually logged on this day? Used to mark the plan as met. */
export function trainedOn(key) {
  return state.sessions.some((s) => s.type === 'workout' && s.date === key);
}

/** Human-readable name for a slot, for the pattern editor. */
export function slotLabel(slot) {
  if (slot === REST) return 'Rest day';
  if (slot === PUSH) return 'Push — current stage';
  return resolveSlot(slot)?.name || 'Missing workout';
}

/* ── calendar export ──────────────────────────────────────────────────── */

const pad = (n) => String(n).padStart(2, '0');

function escapeText(value) {
  return String(value).replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');
}

/**
 * iCalendar lines must be <=75 *octets*, and continuations start with a space.
 * Counting characters isn't enough — an em dash or an emoji is several bytes,
 * and splitting one in half corrupts the file.
 */
const encoder = new TextEncoder();

function fold(line) {
  if (encoder.encode(line).length <= 75) return line;
  const parts = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > 75) {
      parts.push(current);
      current = ' ' + ch; // the leading space counts toward the next 75
      bytes = 1 + size;
    } else {
      current += ch;
      bytes += size;
    }
  }
  if (current) parts.push(current);
  return parts.join('\r\n');
}

function stamp(date = new Date()) {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Build an .ics covering the next `days` days of the plan.
 * Times are floating (no timezone), so they mean the same clock time wherever
 * the phone happens to be.
 */
export function buildICS({ days = 180, includeRest = true } = {}) {
  const plan = state.settings.schedule;
  const [hour, minute] = (plan.time || '18:00').split(':').map(Number);
  const now = stamp();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Focus & Lift//Training plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Focus & Lift — training plan',
    'X-WR-TIMEZONE:',
  ];

  let key = dateKey();
  for (let i = 0; i < days; i++, key = addDays(key, 1)) {
    const day = planFor(key);
    if (!day) continue;
    const ymd = key.replace(/-/g, '');

    if (day.kind === 'workout') {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${ymd}-train@focus-and-lift`,
        `DTSTAMP:${now}`,
        `DTSTART:${ymd}T${pad(hour)}${pad(minute)}00`,
        'DURATION:PT45M',
        `SUMMARY:🏋 ${escapeText(day.workout.name)}`,
        `DESCRIPTION:${escapeText(
          `Warm-up first, then:\n${day.workout.exercises
            .map((e) => `• ${e.name} — ${e.targetReps ? `${e.sets}×${e.targetReps}` : `${e.sets}×${e.workSec}s`}`)
            .join('\n')}`,
        )}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'DESCRIPTION:Training in 15 minutes',
        'TRIGGER:-PT15M',
        'END:VALARM',
        'END:VEVENT',
      );
    } else if (includeRest) {
      const next = addDays(key, 1).replace(/-/g, '');
      lines.push(
        'BEGIN:VEVENT',
        `UID:${ymd}-rest@focus-and-lift`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${ymd}`,
        `DTEND;VALUE=DATE:${next}`,
        'SUMMARY:😴 Rest day',
        'DESCRIPTION:Recovery is where the adaptation happens. Walk if you want to move.',
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      );
    }
  }

  lines.push('END:VCALENDAR');
  // fold once, at the end, so every line is covered exactly once
  return lines.map(fold).join('\r\n') + '\r\n';
}
