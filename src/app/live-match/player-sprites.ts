/**
 * Procedural player sprites — the pixel-art-ish figures the pitch renderer can
 * draw instead of numbered discs.
 *
 * Two things live here, both deliberately free of Angular and of the frame
 * model so the renderer keeps owning the drawing decisions:
 *
 *   - `PlayerSpriteCache` bakes one small offscreen canvas per
 *     (kit x facing x animation phase) combination. A figure is a couple of
 *     dozen path operations; doing that 22 times a frame at 60fps would be
 *     wasteful, so every combination is drawn ONCE and every later frame is a
 *     single `drawImage`. The bitmaps are supersampled (`SS`) and drawn back
 *     down at the projector's depth scale, so they stay clean both in the flat
 *     pitch (scale 1) and at the near touchline of the broadcast camera.
 *
 *   - `SpriteMotionTracker` derives facing and the run cycle from consecutive
 *     painted positions. The backend contract is untouched: nothing about
 *     direction or animation is transported, it is all inferred from where a
 *     player was last frame. The cycle is advanced by DISTANCE TRAVELLED, not
 *     by wall time, so a sprinting player's legs move faster than a jogging
 *     one's and a frozen frame freezes the cycle instead of running on the
 *     spot.
 *
 * Geometry is expressed in "logical" sprite pixels at depth scale 1; the
 * renderer multiplies by the projected scale. The origin the renderer pins to
 * the pitch is the FEET (`SPRITE_FOOT_X/Y`), because that is the point that
 * actually touches the grass — the ground shadow and the painter's ordering
 * both key off it.
 */

// ------------------------------------------------------------ persistence

/** Independent of `PitchStyle`: all four combinations are valid. */
export type PitchDetail = 'discs' | 'sprites';

export const PITCH_DETAIL_KEY = 'fm_pitchDetail';

/** Read the persisted figure style. Presentation only — never affects
 *  playback, never hits the API. */
export function readPitchDetail(): PitchDetail {
  try {
    return localStorage.getItem(PITCH_DETAIL_KEY) === 'sprites' ? 'sprites' : 'discs';
  } catch {
    return 'discs';
  }
}

export function writePitchDetail(detail: PitchDetail): void {
  try {
    localStorage.setItem(PITCH_DETAIL_KEY, detail);
  } catch { /* storage disabled */ }
}

// --------------------------------------------------------------- geometry

/** Cell size in logical pixels at depth scale 1. */
export const SPRITE_W = 18;
export const SPRITE_H = 24;
/** Where inside the cell the ground contact point sits. */
export const SPRITE_FOOT_X = 9;
export const SPRITE_FOOT_Y = 21;
/** Height of the torso centre above the feet — the shirt-number anchor. */
export const SPRITE_NUMBER_LIFT = 9.4;
/** Height of the top of the head above the feet — the name-label anchor. */
export const SPRITE_HEAD_LIFT = 19;

/** Supersample factor of the baked bitmap. */
const SS = 3;

/** Phase value meaning "standing still". */
export const IDLE_PHASE = -1;
/** Number of frames in the run cycle. */
export const RUN_PHASES = 4;

// ---------------------------------------------------------------- palette

const SKIN = '#d3a06d';
const HAIR = '#2c2118';
const BOOT = '#15181c';
/** The 1px readability outline: sprites sit on green, and a mid-tone kit on
 *  grass loses its silhouette without it. */
const OUTLINE = 'rgba(0, 0, 0, 0.55)';

/**
 * Run cycle, 4 phases, as `[swing, lift]` per leg:
 *   0  contact   — leg A forward, leg B trailing
 *   1  pass      — legs together, B swinging through (lifted)
 *   2  contact   — mirrored
 *   3  pass      — mirrored
 * `swing` is signed along the facing direction, `lift` raises the foot off the
 * grass. Arms take the opposite leg's swing, which is what makes a run read as
 * a run rather than a shuffle.
 */
const LEG_A: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 0], [-1, 0], [0, 1.5]];
const LEG_B: ReadonlyArray<readonly [number, number]> = [[-1, 0], [0, 1.5], [1, 0], [0, 0]];
/** Idle stance: feet a touch apart, no lift. */
const IDLE_A: readonly [number, number] = [0.32, 0];
const IDLE_B: readonly [number, number] = [-0.32, 0];

// ------------------------------------------------------------ the drawing

/** One limb: hip/shoulder → joint → end, drawn as two round-capped strokes. */
function drawLimb(ctx: CanvasRenderingContext2D,
                  x0: number, y0: number, x1: number, y1: number,
                  upperColor: string, lowerColor: string,
                  width: number): void {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Dark backing stroke = the readability outline, for free.
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = width + 0.8;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(mx, my);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  ctx.strokeStyle = upperColor;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(mx, my);
  ctx.stroke();

  ctx.strokeStyle = lowerColor;
  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/**
 * Paint one figure into the current context, in logical sprite pixels, facing
 * `dir` (0 = +x/right, 2 = +y/towards the camera, 4 = left, 6 = away) at
 * animation `phase` (`IDLE_PHASE` or 0..3).
 */
function drawFigure(ctx: CanvasRenderingContext2D, dir: number, phase: number,
                    primary: string, accent: string): void {
  const angle = (dir * Math.PI) / 4;
  const fx = Math.cos(angle);
  const fy = Math.sin(angle);
  const running = phase >= 0;
  const legA = running ? LEG_A[phase % RUN_PHASES] : IDLE_A;
  const legB = running ? LEG_B[phase % RUN_PHASES] : IDLE_B;

  // Vertical bob on the pass phases, plus a lean into the direction of travel.
  const bob = running && (phase % 2 === 1) ? -0.7 : 0;
  const lean = fx * (running ? 1.0 : 0.4);
  /** 0 = square on to the camera, 1 = pure profile. */
  const side = Math.abs(fx);
  /** Facing away hides the face; facing the camera shows it. */
  const back = fy < -0.35;

  const cx = SPRITE_FOOT_X;
  const groundY = SPRITE_FOOT_Y;
  const hipY = 15.2 + bob;
  const shoulderY = 9.6 + bob;
  const headR = 3.0;
  const headX = cx + lean * 1.1;
  const headY = 5.6 + bob;
  const torsoHalf = 3.5 - 1.1 * side;

  // ---- legs (behind everything else) ----
  const legs: Array<{ sign: number; swing: number; lift: number }> = [
    { sign: 1, swing: legA[0], lift: legA[1] },
    { sign: -1, swing: legB[0], lift: legB[1] }
  ];
  // Under perspective the trailing leg should sit behind the leading one; a
  // stable order (leading leg last) is enough at this size.
  legs.sort((a, b) => a.swing - b.swing);
  for (const leg of legs) {
    const hipX = cx + lean * 0.5 + leg.sign * (1.5 - 0.9 * side);
    const footX = hipX + leg.swing * 2.4 * fx;
    const footY = groundY + leg.swing * 1.2 * fy - leg.lift;
    drawLimb(ctx, hipX, hipY, footX, footY, SKIN, accent, 2.1);
    // Boot.
    ctx.fillStyle = BOOT;
    ctx.beginPath();
    ctx.ellipse(footX + fx * 0.4, footY + 0.3, 1.5, 1.0, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- shorts ----
  const shortsHalf = torsoHalf * 0.98;
  ctx.beginPath();
  ctx.rect(cx + lean * 0.5 - shortsHalf, hipY - 2.4, shortsHalf * 2, 3.4);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.7;
  ctx.stroke();

  // ---- torso: shoulders slightly wider than the waist ----
  const shoulderX = cx + lean;
  const waistX = cx + lean * 0.5;
  ctx.beginPath();
  ctx.moveTo(shoulderX - torsoHalf, shoulderY);
  ctx.lineTo(shoulderX + torsoHalf, shoulderY);
  ctx.lineTo(waistX + torsoHalf * 0.86, hipY - 1.6);
  ctx.lineTo(waistX - torsoHalf * 0.86, hipY - 1.6);
  ctx.closePath();
  ctx.fillStyle = primary;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // ---- arms: counter-swing to the legs ----
  const armSwings = running
    ? [LEG_B[phase % RUN_PHASES][0], LEG_A[phase % RUN_PHASES][0]]
    : [0.15, -0.15];
  [1, -1].forEach((sign, index) => {
    const swing = armSwings[index];
    const sx = shoulderX + sign * (torsoHalf - 0.2);
    const sy = shoulderY + 0.6;
    const hx = sx + swing * 1.9 * fx + sign * 0.5 * (1 - side);
    const hy = sy + 4.2 - Math.abs(swing) * 0.9 + swing * 0.8 * fy;
    // Short sleeve in the kit colour, forearm in skin.
    drawLimb(ctx, sx, sy, hx, hy, primary, SKIN, 1.7);
  });

  // ---- head ----
  ctx.beginPath();
  ctx.arc(headX, headY, headR, 0, Math.PI * 2);
  ctx.fillStyle = back ? HAIR : SKIN;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 0.8;
  ctx.stroke();

  if (!back) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(headX, headY, headR, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = HAIR;
    // Cap over the top of the skull...
    ctx.fillRect(headX - headR, headY - headR, headR * 2, headR * 0.95);
    // ...and around the back of the head when seen from the side.
    if (side > 0.5) {
      const backSign = fx >= 0 ? -1 : 1;
      ctx.fillRect(headX + (backSign > 0 ? 0.6 : -headR), headY - headR,
                   headR - 0.6, headR * 1.7);
    }
    ctx.restore();

    ctx.fillStyle = '#1b1b1b';
    if (side > 0.5) {
      // Profile: one eye, biased towards the direction of travel.
      ctx.fillRect(headX + Math.sign(fx) * 0.9 - 0.35, headY + 0.05, 0.8, 0.8);
    } else {
      ctx.fillRect(headX - 1.35, headY + 0.05, 0.8, 0.8);
      ctx.fillRect(headX + 0.55, headY + 0.05, 0.8, 0.8);
    }
  }
}

// ----------------------------------------------------------------- cache

/**
 * Baked (kit x facing x phase) bitmaps. A match uses at most four kits
 * (home/away outfield + the two goalkeepers) x 8 facings x 5 phases = 160
 * cells of ~54x72 device pixels, and they are only created on first use, so a
 * typical clip ends up with a few dozen. Keys include the colours, so a kit
 * change simply misses the cache instead of showing the wrong shirt.
 */
export class PlayerSpriteCache {

  /** Hard ceiling: a pathological stream of colours can never grow this
   *  unbounded. Reaching it drops everything and starts again. */
  private static readonly MAX_ENTRIES = 240;

  private readonly cache = new Map<string, HTMLCanvasElement>();

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }

  /**
   * The bitmap for one pose. `phase` is `IDLE_PHASE` or 0..RUN_PHASES-1.
   * Returns null only if the browser refuses a 2D context.
   */
  get(primary: string, accent: string, dir: number, phase: number): HTMLCanvasElement | null {
    const key = `${primary}|${accent}|${dir}|${phase}`;
    const hit = this.cache.get(key);
    if (hit) return hit;

    const canvas = document.createElement('canvas');
    canvas.width = SPRITE_W * SS;
    canvas.height = SPRITE_H * SS;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(SS, SS);
    drawFigure(ctx, dir, phase, primary, accent);

    if (this.cache.size >= PlayerSpriteCache.MAX_ENTRIES) this.cache.clear();
    this.cache.set(key, canvas);
    return canvas;
  }
}

// ---------------------------------------------------------------- motion

export interface SpritePose {
  /** 0 = +x, 2 = +y (towards the camera), 4 = -x, 6 = -y. */
  dir: number;
  /** `IDLE_PHASE` when standing, otherwise 0..RUN_PHASES-1. */
  phase: number;
}

interface MotionState {
  x: number;
  y: number;
  dir: number;
  phase: number;
  /** Distance banked towards the next phase step. */
  accum: number;
  /** Smoothed per-paint distance — one duplicate repaint must not snap a
   *  sprinting player into an idle stance. */
  speed: number;
}

/** World units travelled per phase step (~a stride at this pitch scale). */
const STRIDE = 1.0;
/** Smoothed per-paint distance below which a player counts as standing. */
const MOVE_EPSILON = 0.012;
/** A jump this big is a cut (new clip, splice, teleport), not a sprint. */
const TELEPORT = 6;
/** Weight of the newest sample in the speed EMA. */
const SPEED_ALPHA = 0.4;

/**
 * Derives facing + run phase from consecutive painted positions.
 *
 * Everything is in world units (the 0-100 space the frame model uses), NOT in
 * screen pixels — so the animation is identical in every pitch style and at
 * every canvas size, and a style switch cannot make players break into a
 * sprint.
 */
export class SpriteMotionTracker {

  private readonly state = new Map<number, MotionState>();

  /** Forget everything — called when a new clip starts, so the jump from the
   *  old last frame to the new first frame is never read as movement. */
  reset(): void {
    this.state.clear();
  }

  /** Update `playerId` with its position in this paint and return the pose to
   *  draw. Must be called at most once per player per painted frame. */
  pose(playerId: number, x: number, y: number): SpritePose {
    const prev = this.state.get(playerId);
    if (!prev) {
      // First sighting: face the camera, stand still.
      this.state.set(playerId, { x, y, dir: 2, phase: 0, accum: 0, speed: 0 });
      return { dir: 2, phase: IDLE_PHASE };
    }

    const dx = x - prev.x;
    const dy = y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    prev.x = x;
    prev.y = y;

    if (dist > TELEPORT) {
      // A cut, not a run: keep the facing, drop the speed, freeze the cycle.
      prev.speed = 0;
      return { dir: prev.dir, phase: IDLE_PHASE };
    }

    prev.speed = prev.speed * (1 - SPEED_ALPHA) + dist * SPEED_ALPHA;

    if (dist > MOVE_EPSILON * 0.5) {
      prev.dir = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
    }
    // Distance drives the cycle: pauses freeze it, sprints spin it faster.
    prev.accum += dist;
    while (prev.accum >= STRIDE) {
      prev.accum -= STRIDE;
      prev.phase = (prev.phase + 1) % RUN_PHASES;
    }

    return {
      dir: prev.dir,
      phase: prev.speed >= MOVE_EPSILON ? prev.phase : IDLE_PHASE
    };
  }
}
