# Focus & Lift

Study timers and workout timers in one small web app. No build step, no server, no
account — open `index.html` and it runs. Everything you log stays in your browser.

## Study side

A Pomodoro-style cycle: a focus block, a short break, another focus block, and a
long break once you've done a full set of them.

- Focus / short break / long break lengths are all adjustable, with `25·5·15`,
  `50·10·30` and `90·20·30` presets one click away.
- Auto-start rolls straight into the next phase; turn it off if you'd rather press
  start yourself.
- Label what you're working on ("Chemistry — Ch. 7") and it lands in the log.
- The dots under the timer show how many focus blocks are left before the long break.
- Bail out early and it still credits whatever you did, as long as you got past a
  minute.
- Every finished focus block is logged with its length, label and time of day.

## Workout side

Every workout runs one of two ways. The button next to the workout name switches
between them, per workout, and remembers your choice.

### ☑ Ticks — the default

The workout is a list you check off, one line per exercise:

```
☑  Knee Pushup          3 sets × 10 reps                    [ 10 ]
☐  Plank Hold           3 × 30s hold                        [ ▶ 30s ]
```

Do the thing, tick the line, move on. Nothing is counting at you. A session
clock starts quietly on your first tick so the log still gets a duration, and
**Finish** writes the whole session — every ticked exercise, expanded into its
sets — to the calendar.

- The box on the right of each line takes the reps you actually managed. Leave
  it blank and it logs the target instead.
- Timed holds get a **▶ 30s** button that counts down and chimes, so planks
  don't need a separate timer. Tap it again to cancel.
- **Clear** wipes the ticks and starts the workout over.

### ⏱ Timer — every set on the clock

Hit start and it runs the whole thing: a 5-second lead-in, then each set timed,
then rest, all the way to the last set. **After every single set a form
checklist appears and the workout will not move on until you've ticked all of
it.** Rest keeps counting down underneath, so ticking things off early doesn't
cut your rest short — but an unfinished checklist holds the workout at 0:00
until you deal with it. That card is also where reps, weight and RPE go.

Useful for interval work and for days you want to be pushed. The work clock is a
ceiling, not a target: finish your reps and press **Set done →** to go straight
to rest.

### Both modes

- It ships with a **staged pushup program** — a warm-up, six push stages from
  knee pushups to 30 in a row, and an alternating pull/legs day. See
  [ROUTINE.md](ROUTINE.md) for the plan and how to move between stages. Fresh
  installs start with it; **Settings → Load the training program** adds it to an
  existing setup without touching your log.
- Each workout carries a goal line — the standard for graduating to the next
  stage — shown above the workout.
- Exercises can carry a cue ("5 seconds down, knees to reset"), shown on the
  line in tick mode and while the set runs in timer mode.
- Workouts are built in the editor: exercises with sets, work seconds, rest
  seconds, a target rep count and that cue, reorderable with the ↑ button.
- The timer-mode form checklist is per-workout. New workouts start from the
  default list you keep in Settings.
- Reset mid-session logs the sets you actually did rather than throwing them away.

## Calendar

A month grid of everything: an indigo dot for a day you studied, an orange one for
a day you trained, and a bar scaled against a two-hour daily study target. Click
any day for the sessions, with per-set reps and weights spelled out. The side panel
carries this week's totals, your day streak, and all-time numbers.

## Everything else

- **Alerts** — a chime when an interval ends (different tones for work, rest and
  finishing), optional desktop notifications, and an optional screen wake lock so
  your phone doesn't sleep mid-set.
- **Keyboard** — `space` starts/pauses the timer on the current tab, `1`–`4` jump
  between tabs.
- **Data** — export everything to JSON, import it back, or erase the lot. It lives
  in this browser's local storage, so clearing site data clears your history:
  export first if you care about it.
- **Offline** — a service worker caches the app, and there's a web manifest, so you
  can install it to a phone home screen and use it with no signal.
- Dark and light themes, toggled top-right.

## Running it

Open `index.html` in a browser. Because the code is split into ES modules, some
browsers block `file://` imports — if the page comes up blank, serve the folder:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Any static host works too (GitHub Pages, Netlify, a folder on a NAS). The service
worker and install-to-home-screen only kick in over `http`/`https`.

## Layout

```
index.html      markup for all four tabs and the workout editor dialog
styles.css      tokens, layout, both themes
js/app.js       boot, tab routing, theme, settings, import/export
js/storage.js   the single localStorage blob and everything that touches it
js/timer.js     deadline-based countdown (survives backgrounded tabs)
js/study.js     the focus/break state machine
js/workout.js   mode switching + the set → checklist → rest state machine
js/ticklist.js  tick mode: the workout as a list you check off
js/program.js   the built-in training program (data only)
js/editor.js    workout editor dialog
js/calendar.js  month grid and stats
js/notify.js    chimes, notifications, wake lock, toasts
sw.js           offline cache
```
