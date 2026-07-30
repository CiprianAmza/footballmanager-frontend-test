/**
 * Pitch projection — how renderer-neutral pitch coordinates become screen
 * pixels.
 *
 * The renderer (`<app-match-pitch>`) keeps expressing every position in the
 * ORIGINAL linear "classic" pixel space: `px = x/100 * w`, `py = y/100 * h`.
 * A projector then maps that classic pixel to the screen. This is deliberate:
 *
 *   - the `classic` projector is a literal pass-through (no arithmetic at all),
 *     so the 2D pitch renders byte-for-byte the same drawing calls it always
 *     did — the abstraction cannot regress it;
 *   - the `broadcast` projector reinterprets the vertical axis as DEPTH and
 *     produces a TV-camera style 2.5D view.
 *
 * Broadcast geometry (world x = goal-to-goal → screen X, world y = sideline
 * to sideline → depth):
 *
 *      y=0   far sideline   ── narrow (78% of canvas width), high on screen
 *      y=100 near sideline  ── full canvas width, at the bottom
 *
 * The taper is a real projective mapping rather than a hand-waved lerp: the
 * horizontal span factor `k` is `1/z` for a depth `z` that varies linearly
 * between the two sidelines, and the screen row is linear in `k` (which is
 * what a pinhole camera looking at a ground plane actually does). Far rows
 * therefore bunch up slightly, which is what sells the perspective.
 */

export type PitchStyle = 'classic' | 'broadcast';

/** A classic-space pixel mapped to the screen, with the depth scale that
 *  applies to anything drawn at that point (radii, fonts, line widths). */
export interface ProjectedPoint {
  x: number;
  y: number;
  scale: number;
}

export interface PitchProjector {
  readonly style: PitchStyle;
  /** True when the projection has depth: enables ground shadows, painter's
   *  algorithm ordering, curved (polyline) circles and the stand band. */
  readonly perspective: boolean;
  /** Map a classic-space pixel to the screen. */
  project(px: number, py: number): ProjectedPoint;
  /** Depth scale at a classic-space row. Always exactly 1 for `classic`, so
   *  call sites can write `8 * scaleAt(py)` without branching. */
  scaleAt(py: number): number;
}

// ---------------------------------------------------------------- classic

/** Identity projection: the classic-space pixel IS the screen pixel. */
class ClassicProjector implements PitchProjector {
  readonly style: PitchStyle = 'classic';
  readonly perspective = false;

  project(px: number, py: number): ProjectedPoint {
    return { x: px, y: py, scale: 1 };
  }

  scaleAt(): number {
    return 1;
  }
}

// -------------------------------------------------------------- broadcast

/** Horizontal span at the far sideline, as a fraction of canvas width. */
const FAR_WIDTH = 0.78;
/** Horizontal span at the near sideline (the full canvas). */
const NEAR_WIDTH = 1.0;
/** Top of the grass — everything above is the stand band. */
const TOP_FRACTION = 0.28;
/** Bottom of the grass (a hair off the canvas edge). */
const BOTTOM_FRACTION = 0.995;
/** Depth scale applied to players/ball/fonts at each sideline. */
const FAR_SCALE = 0.72;
const NEAR_SCALE = 1.15;

class BroadcastProjector implements PitchProjector {
  readonly style: PitchStyle = 'broadcast';
  readonly perspective = true;

  private readonly topY: number;
  private readonly bottomY: number;
  /** Camera depth at the far sideline; the near sideline sits at z = 1. */
  private readonly zFar: number;

  constructor(private readonly w: number, private readonly h: number) {
    this.topY = h * TOP_FRACTION;
    this.bottomY = h * BOTTOM_FRACTION;
    this.zFar = NEAR_WIDTH / FAR_WIDTH;
  }

  /** Normalised 0 (far sideline) → 1 (near sideline) position along the
   *  perspective ramp for a classic-space row. */
  private ramp(py: number): number {
    // Clamp the DEPTH, not the result: points a little outside the pitch
    // (labels, markers, confetti) still project sensibly, but a wild value
    // can never push z through zero.
    const d = Math.max(-0.5, Math.min(1.5, py / this.h));
    const k = 1 / (this.zFar + (1 - this.zFar) * d);
    return (k - FAR_WIDTH) / (NEAR_WIDTH - FAR_WIDTH);
  }

  project(px: number, py: number): ProjectedPoint {
    const t = this.ramp(py);
    const k = FAR_WIDTH + (NEAR_WIDTH - FAR_WIDTH) * t;
    const half = this.w / 2;
    return {
      x: half + (px - half) * k,
      y: this.topY + (this.bottomY - this.topY) * t,
      scale: FAR_SCALE + (NEAR_SCALE - FAR_SCALE) * t
    };
  }

  scaleAt(py: number): number {
    return FAR_SCALE + (NEAR_SCALE - FAR_SCALE) * this.ramp(py);
  }
}

export function createProjector(style: PitchStyle, w: number, h: number): PitchProjector {
  return style === 'broadcast' ? new BroadcastProjector(w, h) : new ClassicProjector();
}

// ------------------------------------------------------------- stand band

/** Cached crowd texture, keyed by canvas size — regenerating the speckle every
 *  frame would make the stand shimmer (and cost thousands of fillRects). */
let crowdCache: { key: string; canvas: HTMLCanvasElement } | null = null;

/** Deterministic tiny LCG so the crowd is stable across repaints. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function crowdTexture(w: number, bandH: number): HTMLCanvasElement {
  const key = `${w}x${bandH}`;
  if (crowdCache && crowdCache.key === key) return crowdCache.canvas;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(bandH));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const rand = seeded(20260731);
    const rows = Math.max(3, Math.floor(canvas.height / 6));
    for (let row = 0; row < rows; row++) {
      // Rows further up the stand are dimmer and denser — cheap depth cue.
      const y = (row / rows) * canvas.height;
      const dim = 0.10 + 0.22 * (row / rows);
      const step = 5 + Math.floor(rand() * 3);
      for (let x = 0; x < canvas.width; x += step) {
        const shade = Math.floor(120 + rand() * 110);
        ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade + 12}, ${dim * (0.4 + rand() * 0.6)})`;
        ctx.fillRect(x + rand() * 2, y, 2, 2);
      }
    }
  }
  crowdCache = { key, canvas };
  return canvas;
}

/**
 * Draw the stand / skyline impression above the far sideline. Pure canvas: a
 * dark vertical gradient, a couple of tier separators and a cached speckle
 * that reads as a crowd. No assets, no external colours.
 */
export function drawStandBand(ctx: CanvasRenderingContext2D, w: number, bandH: number): void {
  if (bandH <= 0) return;
  ctx.save();

  const gradient = ctx.createLinearGradient(0, 0, 0, bandH);
  gradient.addColorStop(0, '#05080d');
  gradient.addColorStop(0.55, '#111b26');
  gradient.addColorStop(1, '#1c2a33');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, bandH);

  ctx.drawImage(crowdTexture(w, bandH), 0, 0);

  // Tier separators + the dark lip where the stand meets the grass.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  for (const frac of [0.42, 0.72]) {
    ctx.beginPath();
    ctx.moveTo(0, Math.round(bandH * frac) + 0.5);
    ctx.lineTo(w, Math.round(bandH * frac) + 0.5);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, bandH - Math.max(2, bandH * 0.05), w, Math.max(2, bandH * 0.05));

  ctx.restore();
}

// ------------------------------------------------------------- persistence

export const PITCH_STYLE_KEY = 'fm_pitchStyle';

/** Read the persisted render style. Presentation only — never affects
 *  playback, never hits the API. */
export function readPitchStyle(): PitchStyle {
  try {
    return localStorage.getItem(PITCH_STYLE_KEY) === 'broadcast' ? 'broadcast' : 'classic';
  } catch {
    return 'classic';
  }
}

export function writePitchStyle(style: PitchStyle): void {
  try {
    localStorage.setItem(PITCH_STYLE_KEY, style);
  } catch { /* storage disabled */ }
}
