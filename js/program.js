// The built-in training program: a staged push progression aimed at 30
// consecutive pushups, plus an alternating day for pulling, legs and hips.
//
// Every workout carries a stable `programId` so it can be installed once and
// re-installed later without duplicating. `goal` is the rule for graduating to
// the next stage — it is shown on the workout tab before you start.
//
// Work seconds are deliberately generous: hit your reps and press "Set done →"
// rather than waiting out the clock. The clock only matters for holds.

// Local id generator rather than importing storage's — storage seeds its
// defaults from here, and a one-way dependency keeps that from being a cycle.
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const PUSH_CHECKS = [
  'Logged the reps',
  'Elbows tucked, body straight',
  'Low back still pain-free',
  'Breathing back under control',
];

const PULL_CHECKS = [
  'Logged the reps',
  'Braced — ribs down, no arching',
  'Both sides done evenly',
  'Breathing back under control',
];

const ex = (name, sets, targetReps, workSec, restSec, cue = '') => ({
  id: uid(),
  name,
  sets,
  workSec,
  restSec,
  targetReps,
  cue,
});

const ROWS = (sets, reps) =>
  ex('Table Row', sets, reps, 50, 75, 'Lie under a sturdy table, pull your chest to the edge. Balances all the pushing.');

const PLANK = (sets, seconds) =>
  ex('Plank Hold', sets, 0, seconds, 60, 'Ribs down, glutes squeezed, no sagging. Stop the set if the low back complains.');

const SIDE_PLANK = (sets, seconds) =>
  ex('Side Plank — alternate sides', sets, 0, seconds, 45, 'One set per side. Hips stacked and lifted.');

const BRIDGE = (sets, reps) =>
  ex('Glute Bridge', sets, reps, 45, 45, 'Drive through the heels, squeeze at the top. This is the one that helps your back.');

/* ── the program ──────────────────────────────────────────────────────── */

export function programWorkouts() {
  return [
    {
      id: uid(),
      programId: 'warmup',
      name: 'Warm-up (3 min)',
      goal: 'Run this before either training day. Never skip the shoulder and wrist prep.',
      checklist: ['Done — joints feel warm'],
      exercises: [
        ex('Arm Circles', 1, 0, 40, 10, 'Small to big, both directions.'),
        ex('Scapular Pushups', 1, 10, 40, 10, 'On knees, arms locked. Only the shoulder blades move.'),
        ex('Wrist Rocks', 1, 0, 40, 10, 'Palms down, rock forward and back. Your wrists take the load in every pushup.'),
        ex('Cat–Cow', 1, 0, 40, 10, 'Slow, through the whole spine. No forcing the range.'),
        ex('Glute Bridge', 1, 10, 40, 10, 'Wakes the hips up so the low back stops doing their job.'),
      ],
    },

    {
      id: uid(),
      programId: 'push-1',
      name: 'Push · Stage 1 — Knee foundation',
      goal: 'Move to Stage 2 when knee pushups are a comfortable 3×15 and the plank holds 3×45s.',
      checklist: [...PUSH_CHECKS],
      exercises: [
        ex('Toe-to-Knee Eccentric', 3, 5, 60, 90, '4–5 seconds lowering on your toes, then drop to the knees to push back up.'),
        ex('Knee Pushup', 3, 10, 60, 90, 'Continuous smooth motion — no resting at the top.'),
        PLANK(3, 30),
        BRIDGE(3, 12),
        ex('Dead Bug', 2, 8, 45, 45, 'Low back stays glued to the floor. Slow. This is your ab work — no sit-ups.'),
      ],
    },

    {
      id: uid(),
      programId: 'push-2',
      name: 'Push · Stage 2 — Counter incline',
      goal: 'Move to Stage 3 when counter pushups hit 3×15 clean and the negatives are still controlled at a full 5 seconds.',
      checklist: [...PUSH_CHECKS],
      exercises: [
        ex('Incline Pushup — counter height', 3, 10, 60, 90, 'Hands on a kitchen counter. Body dead straight, heels to head.'),
        ex('Full Pushup Negative', 3, 5, 60, 120, '5 seconds down on your toes, knees down to reset. This is what builds the full pushup.'),
        ex('Knee Pushup', 2, 15, 60, 75, 'Volume work — keep it smooth.'),
        PLANK(3, 45),
        ROWS(3, 8),
      ],
    },

    {
      id: uid(),
      programId: 'push-3',
      name: 'Push · Stage 3 — Chair incline',
      goal: 'Move to Stage 4 when chair-height pushups reach 3×15.',
      checklist: [...PUSH_CHECKS],
      exercises: [
        ex('Incline Pushup — chair or bench', 3, 10, 60, 90, 'About knee-to-hip height. Lower than last stage, so expect fewer reps at first.'),
        ex('Full Pushup Negative', 3, 6, 60, 120, 'Still 5 seconds down. If it turns into a fall, you are done for that set.'),
        PLANK(3, 60),
        SIDE_PLANK(2, 20),
        ROWS(3, 10),
      ],
    },

    {
      id: uid(),
      programId: 'push-4',
      name: 'Push · Stage 4 — First full pushups',
      goal: 'Move to Stage 5 when you can do 4 sets of 8 full pushups in one session.',
      checklist: [...PUSH_CHECKS],
      exercises: [
        ex('Full Pushup', 4, 4, 45, 150, 'Chest to fist height, full lockout. Stop the set the moment your hips sag. Long rests are the point.'),
        ex('Incline Pushup — chair', 2, 12, 60, 90, 'Tops the volume up once the full sets are done.'),
        ex('Full Pushup Negative', 2, 5, 60, 90, 'Finisher. Still slow.'),
        PLANK(3, 60),
        ROWS(3, 10),
      ],
    },

    {
      id: uid(),
      programId: 'push-5',
      name: 'Push · Stage 5 — Build to 15',
      goal: 'Move to Stage 6 once a single all-out set reaches 15 full pushups.',
      checklist: [...PUSH_CHECKS],
      exercises: [
        ex('Full Pushup', 5, 8, 60, 120, 'Leave 2 reps in the tank on every set. Add a rep per set when all five feel easy.'),
        ex('Incline Pushup — chair', 2, 12, 60, 90, 'Backoff volume.'),
        SIDE_PLANK(4, 30),
        ROWS(3, 12),
      ],
    },

    {
      id: uid(),
      programId: 'push-6',
      name: 'Push · Stage 6 — 15 to 30',
      goal: 'The target is the test set hitting 30. After that, keep this workout and chase 40, or start slowing the tempo down.',
      checklist: [...PUSH_CHECKS],
      exercises: [
        ex('Full Pushup', 5, 12, 75, 90, 'Roughly 60% of your best set. Stop 2 short of failure — the volume is what moves the number.'),
        ex('Full Pushup — TEST SET', 1, 30, 120, 60, 'Once a week only. Go until form breaks and log the number. That is your score.'),
        PLANK(3, 75),
        ROWS(3, 12),
      ],
    },

    {
      id: uid(),
      programId: 'pull-legs',
      name: 'Day B — Pull, legs & hips',
      goal: 'Runs on the days between push sessions. Nothing here loads your spine into flexion.',
      checklist: [...PULL_CHECKS],
      exercises: [
        ROWS(3, 10),
        ex('Bodyweight Squat', 3, 15, 60, 60, 'Heels down, knees tracking over the toes. Full depth if it is pain-free.'),
        ex('Split Squat — alternate legs', 4, 8, 50, 60, 'One set per leg. Hold a wall if you need the balance.'),
        BRIDGE(3, 15),
        ex('Bird Dog — alternate sides', 4, 8, 45, 45, 'Opposite arm and leg, slow. Direct low-back work that does not compress anything.'),
        SIDE_PLANK(4, 25),
      ],
    },
  ];
}

/** The push stages in order, for the "what am I working towards" text. */
export const PUSH_STAGES = ['push-1', 'push-2', 'push-3', 'push-4', 'push-5', 'push-6'];
