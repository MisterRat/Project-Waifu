// Idle behavior scheduler. Ported from the Waifu Pet desktop app (renderer/idle.js)
// so both apps behave the same; keep the two in sync when changing timings.
//
// Pure logic (no DOM). It schedules discrete events only:
//   - blinks (optional; Project-Waifu's tracking engine blinks on its own),
//   - while the avatar is idle (canIdle() is true): small fidget motions, brief
//     sideways glances, and occasional mild expression changes.
// Due times keep advancing while she is busy, so she never fires a backlog
// the moment she goes idle.

export interface IdleSchedulerOptions {
  onBlink?: () => void;
  onExpression?: (name: string) => void;
  expressionNames?: string[];
  minBlinkMs?: number;
  maxBlinkMs?: number;
  minExprMs?: number;
  maxExprMs?: number;
  onFidget?: () => void;
  onGlance?: () => void;
  canIdle?: () => boolean;
  minFidgetMs?: number;
  maxFidgetMs?: number;
  minGlanceMs?: number;
  maxGlanceMs?: number;
  now?: () => number;
  rand?: () => number;
}

export class IdleScheduler {
  private onBlink: () => void;
  private onExpression: (name: string) => void;
  private expressionNames: string[];
  private minBlinkMs: number;
  private maxBlinkMs: number;
  private minExprMs: number;
  private maxExprMs: number;
  private onFidget: (() => void) | null;
  private onGlance: (() => void) | null;
  private canIdle: () => boolean;
  private minFidgetMs: number;
  private maxFidgetMs: number;
  private minGlanceMs: number;
  private maxGlanceMs: number;
  private now: () => number;
  private rand: () => number;
  private running = false;
  private nextBlink = 0;
  private nextExpr = 0;
  private nextFidget = 0;
  private nextGlance = 0;
  private lastExpr = "";

  constructor(opts: IdleSchedulerOptions = {}) {
    this.onBlink = opts.onBlink || (() => {});
    this.onExpression = opts.onExpression || (() => {});
    this.expressionNames = (opts.expressionNames || []).slice();
    this.minBlinkMs = opts.minBlinkMs ?? 2200;
    this.maxBlinkMs = opts.maxBlinkMs ?? 6500;
    this.minExprMs = opts.minExprMs ?? 9000;
    this.maxExprMs = opts.maxExprMs ?? 24000;
    this.onFidget = opts.onFidget || null;
    this.onGlance = opts.onGlance || null;
    this.canIdle = opts.canIdle || (() => true);
    this.minFidgetMs = opts.minFidgetMs ?? 25000;
    this.maxFidgetMs = opts.maxFidgetMs ?? 70000;
    this.minGlanceMs = opts.minGlanceMs ?? 4000;
    this.maxGlanceMs = opts.maxGlanceMs ?? 11000;
    this.now = opts.now || (() => Date.now());
    this.rand = opts.rand || Math.random;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const t = this.now();
    this.nextBlink = t + this.randBetween(this.minBlinkMs, this.maxBlinkMs);
    this.nextExpr = t + this.randBetween(this.minExprMs, this.maxExprMs);
    this.nextFidget = t + this.randBetween(this.minFidgetMs, this.maxFidgetMs);
    this.nextGlance = t + this.randBetween(this.minGlanceMs, this.maxGlanceMs);
  }

  stop() {
    this.running = false;
  }

  private randBetween(a: number, b: number) {
    return a + (b - a) * this.rand();
  }

  /** Call once per frame. Fires due events. Returns true if anything fired. */
  tick(): boolean {
    if (!this.running) return false;
    const t = this.now();
    let fired = false;

    if (t >= this.nextBlink) {
      this.onBlink();
      fired = true;
      this.nextBlink = t + this.randBetween(this.minBlinkMs, this.maxBlinkMs);
    }

    if (t >= this.nextFidget) {
      this.nextFidget = t + this.randBetween(this.minFidgetMs, this.maxFidgetMs);
      if (this.onFidget && this.canIdle()) {
        this.onFidget();
        fired = true;
      }
    }
    if (t >= this.nextGlance) {
      this.nextGlance = t + this.randBetween(this.minGlanceMs, this.maxGlanceMs);
      if (this.onGlance && this.canIdle()) {
        this.onGlance();
        fired = true;
      }
    }

    if (t >= this.nextExpr && this.expressionNames.length > 0) {
      this.nextExpr = t + this.randBetween(this.minExprMs, this.maxExprMs);
      if (this.canIdle()) {
        let name: string;
        let guard = 0;
        do {
          name = this.expressionNames[Math.floor(this.rand() * this.expressionNames.length)];
          guard++;
        } while (name === this.lastExpr && guard < 8);
        this.lastExpr = name;
        this.onExpression(name);
        fired = true;
      }
    }

    return fired;
  }
}
