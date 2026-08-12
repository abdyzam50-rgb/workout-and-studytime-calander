// A countdown that survives background tabs: it tracks a wall-clock deadline
// rather than accumulating setInterval ticks, so drift never builds up.

const TICK_MS = 200;

export class Timer {
  constructor({ onTick = () => {}, onDone = () => {} } = {}) {
    this.onTick = onTick;
    this.onDone = onDone;
    this.duration = 0;
    this.remaining = 0;
    this.deadline = 0;
    this.running = false;
    this._handle = null;
  }

  start(ms) {
    this.duration = ms;
    this.remaining = ms;
    this.deadline = Date.now() + ms;
    this.running = true;
    this._loop();
    this.onTick(this);
  }

  pause() {
    if (!this.running) return;
    this.remaining = Math.max(0, this.deadline - Date.now());
    this.running = false;
    clearInterval(this._handle);
    this.onTick(this);
  }

  resume() {
    if (this.running || this.remaining <= 0) return;
    this.deadline = Date.now() + this.remaining;
    this.running = true;
    this._loop();
    this.onTick(this);
  }

  toggle() {
    this.running ? this.pause() : this.resume();
  }

  stop() {
    clearInterval(this._handle);
    this.running = false;
    this.duration = 0;
    this.remaining = 0;
    this.onTick(this);
  }

  /** Nudge the deadline by ms (negative shortens). */
  adjust(ms) {
    if (this.duration === 0) return;
    this.duration = Math.max(0, this.duration + ms);
    if (this.running) this.deadline += ms;
    else this.remaining = Math.max(0, this.remaining + ms);
    this.onTick(this);
  }

  get elapsed() {
    return this.duration - this.remaining;
  }

  /** 0 → 1 across the current interval. */
  get progress() {
    return this.duration > 0 ? 1 - this.remaining / this.duration : 0;
  }

  _loop() {
    clearInterval(this._handle);
    this._handle = setInterval(() => {
      this.remaining = Math.max(0, this.deadline - Date.now());
      this.onTick(this);
      if (this.remaining <= 0) {
        clearInterval(this._handle);
        this.running = false;
        this.onDone(this);
      }
    }, TICK_MS);
  }
}

export function formatClock(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatDuration(minutes) {
  const mins = Math.round(minutes);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
