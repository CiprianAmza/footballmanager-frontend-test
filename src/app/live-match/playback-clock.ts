/**
 * The single playback clock for the live-match viewer.
 *
 * One `requestAnimationFrame` loop drives everything that moves: the match
 * minute advancement and the clip playback inside `<app-match-pitch>`. There is
 * no second timer anywhere — pausing (sub modal, shot suspense, lineup preview,
 * full time) is a flag on this clock, not a cleared interval.
 *
 * `timeScale` multiplies elapsed real time for the match-clock consumer; clip
 * playback deliberately reads the *unscaled* delta so highlights always run at
 * their authored 30fps, exactly as the old 33ms interval did.
 */
export class PlaybackClock {

  /** Accumulated scaled time in ms, excluding paused stretches. */
  now = 0;

  /** While true the scaled delta is 0 — the match clock stands still. */
  paused = true;

  /** Multiplier applied to real elapsed time before it reaches `now`. */
  timeScale = 1;

  private rafId: number | null = null;
  private lastTimestamp = 0;
  private handler: ((scaledDt: number, realDt: number) => void) | null = null;

  /** Longest real delta we accept in one frame. A backgrounded tab stops
   *  producing frames entirely; without this cap the first frame after
   *  returning would carry the whole absence and fast-forward the match. */
  private static readonly MAX_FRAME_MS = 100;

  get running(): boolean {
    return this.rafId !== null;
  }

  start(handler: (scaledDt: number, realDt: number) => void): void {
    this.stop();
    this.handler = handler;
    this.lastTimestamp = 0;
    this.rafId = requestAnimationFrame(timestamp => this.frame(timestamp));
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.handler = null;
  }

  private frame(timestamp: number): void {
    if (this.lastTimestamp === 0) this.lastTimestamp = timestamp;
    const realDt = Math.min(PlaybackClock.MAX_FRAME_MS, Math.max(0, timestamp - this.lastTimestamp));
    this.lastTimestamp = timestamp;

    const scaledDt = this.paused ? 0 : realDt * this.timeScale;
    this.now += scaledDt;
    this.handler?.(scaledDt, realDt);

    this.rafId = requestAnimationFrame(next => this.frame(next));
  }
}
