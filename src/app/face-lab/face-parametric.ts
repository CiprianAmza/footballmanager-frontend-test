/**
 * FACE LAB — `drawParametric(genome)`: ONE renderer that can express any point in
 * genome space (see face-genome.ts). It follows the exact same 7-step skeleton the
 * frozen production renderers use:
 *
 *   1. resolve palettes (modulo-wrapped)      5. head path + clipPath
 *   2. ink colour + ink width                 6. shading planes (lt / md / dk / hl)
 *   3. uid for the clipPath                   7. eyes, then the signature LAST
 *   4. geometry jittered from jitterSeed
 *
 * DEV-ONLY: production keeps the frozen `drawX()` functions in player-face.component.ts.
 *
 * SYMBOLIC MODE (`opts.symbolic`) renders the same markup but substitutes TypeScript
 * template-literal placeholders (`${body.md}`, `${IW}`, `${uid}` …) for every palette,
 * ink and uid value. face-codegen.ts uses it to freeze a winning genome into a classic
 * `drawX()` without a second renderer implementation ever existing.
 */

import {
  FaceGenome, Glow, Ramp, PALETTE_FAMILIES, SilhouetteFamily, EyeType,
} from './face-genome';

const CX = 50;

/** Ink pen: colour plus a width accessor, so symbolic mode can emit `${(IW*0.8).toFixed(2)}`. */
interface Pen {
  I: string;
  /** Stroke width scaled by k (default 1). */
  w(k?: number): string;
}

// ============================================================================
// geometry
// ============================================================================

export interface PGeom {
  topY: number;   // crown
  cranY: number;  // cranium widest band
  browY: number;  // brow / eye band
  chinY: number;  // chin bottom
  eyeY: number;
  halfW: number;  // half-width across the temples
  cranW: number;  // half-width at the crown
  jawW: number;   // half-width at the chin
  snout: number;  // forward muzzle projection (beaked only)
  j: number;      // 0..3 deterministic jitter
}

/** Per-family vertical layout, mirroring the frozen renderers' constants. */
const FAMILY_Y: Record<SilhouetteFamily, { topY: number; browY: number; chinY: number }> = {
  faceted: { topY: 16, browY: 48, chinY: 80 },
  beaked: { topY: 22, browY: 42, chinY: 72 },
  carved: { topY: 18, browY: 44, chinY: 82 },
  plated: { topY: 16, browY: 45, chinY: 84 },
  teardrop: { topY: 17, browY: 46, chinY: 82 },
  dome: { topY: 14, browY: 45, chinY: 85 },
  smooth: { topY: 18, browY: 46, chinY: 83 },
  spire: { topY: 10, browY: 48, chinY: 80 },
};

export function geomFor(g: FaceGenome): PGeom {
  const s = g.silhouette;
  const j = ((s.jitterSeed % 4) + 4) % 4;
  const base = FAMILY_Y[s.family] || FAMILY_Y.smooth;
  const halfW = 19 + s.width * 11 + j * 0.6;
  const jawW = halfW * (0.22 + s.jawRatio * 0.45);
  const cranW = halfW * (0.45 + s.cranFlat * 0.5);
  const topY = base.topY;
  const browY = base.browY - (j % 2);
  const chinY = base.chinY + (j % 2);
  return {
    topY, browY, chinY,
    cranY: topY + (browY - topY) * 0.45,
    eyeY: browY + 6,
    halfW, cranW, jawW,
    snout: 8 + j,
    j,
  };
}

const n = (v: number) => Math.round(v * 100) / 100;

export function headPath(g: FaceGenome, p: PGeom): string {
  const { topY, cranY, browY, chinY, halfW, cranW, jawW, snout } = p;
  switch (g.silhouette.family) {
    case 'faceted':
      return `M ${n(CX - cranW)} ${topY} L ${n(CX + cranW)} ${topY} ` +
        `L ${n(CX + halfW)} ${n(topY + 16)} L ${n(CX + halfW - 1)} ${n(browY + 2)} ` +
        `L ${n(CX + halfW - 7)} ${n(browY + 16)} L ${n(CX + jawW)} ${n(chinY - 6)} ` +
        `L ${CX} ${chinY} L ${n(CX - jawW)} ${n(chinY - 6)} ` +
        `L ${n(CX - halfW + 7)} ${n(browY + 16)} L ${n(CX - halfW + 1)} ${n(browY + 2)} ` +
        `L ${n(CX - halfW)} ${n(topY + 16)} Z`;

    case 'beaked':
      return `M ${n(CX - halfW)} ${n(topY + 6)} ` +
        `Q ${CX} ${n(topY - 2)} ${n(CX + halfW * 0.5)} ${n(browY - 6)} ` +
        `L ${n(CX + halfW * 0.55 + snout)} ${n(browY + 2)} ` +
        `L ${n(CX + 2 + snout + 6)} ${n(browY + 12)} ` +
        `L ${n(CX + 2 + snout + 7)} ${n(browY + 18)} ` +
        `L ${n(CX + 2 + snout)} ${n(browY + 21)} ` +
        `L ${n(CX - 2 + snout)} ${n(browY + 24)} ` +
        // the mandible must never reach past the upper lip, or the outline notches back
        // out over the snout and the silhouette folds on itself.
        `L ${n(Math.min(CX + jawW, CX - 4 + snout))} ${n(chinY - 2)} ` +
        `L ${CX} ${chinY} L ${n(CX - halfW * 0.5)} ${n(chinY - 2)} ` +
        `L ${n(CX - halfW + 4)} ${n(browY + 18)} L ${n(CX - halfW)} ${n(topY + 6)} Z`;

    case 'carved':
      return `M ${CX} ${topY} ` +
        `C ${n(CX + cranW)} ${topY} ${n(CX + halfW)} ${n(topY + 14)} ${n(CX + halfW)} ${n(browY + 2)} ` +
        `C ${n(CX + halfW)} ${n(browY + 16)} ${n(CX + halfW - 4)} ${n(chinY - 16)} ${n(CX + jawW)} ${n(chinY - 6)} ` +
        `Q ${CX} ${chinY} ${n(CX - jawW)} ${n(chinY - 6)} ` +
        `C ${n(CX - halfW + 4)} ${n(chinY - 16)} ${n(CX - halfW)} ${n(browY + 16)} ${n(CX - halfW)} ${n(browY + 2)} ` +
        `C ${n(CX - halfW)} ${n(topY + 14)} ${n(CX - cranW)} ${topY} ${CX} ${topY} Z`;

    case 'plated':
      return `M ${CX} ${topY} ` +
        `L ${n(CX + cranW)} ${n(topY + 2)} L ${n(CX + halfW)} ${n(topY + 13)} ` +
        `L ${n(CX + halfW + 1)} ${n(browY + 1)} L ${n(CX + halfW - 2)} ${n(browY + 14)} ` +
        `L ${n(CX + halfW - 5)} ${n(chinY - 18)} L ${n(CX + jawW)} ${n(chinY - 7)} ` +
        `L ${n(CX + jawW * 0.46)} ${n(chinY - 1)} L ${CX} ${n(chinY + 1)} L ${n(CX - jawW * 0.46)} ${n(chinY - 1)} ` +
        `L ${n(CX - jawW)} ${n(chinY - 7)} L ${n(CX - halfW + 5)} ${n(chinY - 18)} ` +
        `L ${n(CX - halfW + 2)} ${n(browY + 14)} L ${n(CX - halfW - 1)} ${n(browY + 1)} ` +
        `L ${n(CX - halfW)} ${n(topY + 13)} L ${n(CX - cranW)} ${n(topY + 2)} Z`;

    case 'teardrop':
      return `M ${CX} ${topY} ` +
        `C ${n(CX + cranW)} ${topY} ${n(CX + halfW)} ${n(topY + 9)} ${n(CX + halfW)} ${n(browY - 2)} ` +
        `C ${n(CX + halfW)} ${n(browY + 12)} ${n(CX + halfW - 4)} ${n(chinY - 16)} ${n(CX + jawW)} ${n(chinY - 4)} ` +
        `Q ${CX} ${n(chinY + 2)} ${n(CX - jawW)} ${n(chinY - 4)} ` +
        `C ${n(CX - halfW + 4)} ${n(chinY - 16)} ${n(CX - halfW)} ${n(browY + 12)} ${n(CX - halfW)} ${n(browY - 2)} ` +
        `C ${n(CX - halfW)} ${n(topY + 9)} ${n(CX - cranW)} ${topY} ${CX} ${topY} Z`;

    case 'dome':
      return `M ${CX} ${topY} ` +
        `C ${n(CX + cranW)} ${topY} ${n(CX + halfW)} ${n(cranY - 4)} ${n(CX + halfW * 0.96)} ${browY} ` +
        `C ${n(CX + halfW * 0.84)} ${n(browY + 20)} ${n(CX + jawW * 2.1)} ${n(chinY - 14)} ${n(CX + jawW)} ${n(chinY - 2)} ` +
        `Q ${CX} ${n(chinY + 3)} ${n(CX - jawW)} ${n(chinY - 2)} ` +
        `C ${n(CX - jawW * 2.1)} ${n(chinY - 14)} ${n(CX - halfW * 0.84)} ${n(browY + 20)} ${n(CX - halfW * 0.96)} ${browY} ` +
        `C ${n(CX - halfW)} ${n(cranY - 4)} ${n(CX - cranW)} ${topY} ${CX} ${topY} Z`;

    case 'spire':
      return `M ${CX} ${topY} ` +
        `L ${n(CX + cranW * 0.6)} ${n(topY + 8)} L ${n(CX + halfW)} ${n(browY - 6)} ` +
        `L ${n(CX + halfW - 2)} ${n(browY + 10)} L ${n(CX + halfW - 6)} ${n(chinY - 16)} ` +
        `L ${n(CX + jawW)} ${n(chinY - 6)} L ${CX} ${chinY} L ${n(CX - jawW)} ${n(chinY - 6)} ` +
        `L ${n(CX - halfW + 6)} ${n(chinY - 16)} L ${n(CX - halfW + 2)} ${n(browY + 10)} ` +
        `L ${n(CX - halfW)} ${n(browY - 6)} L ${n(CX - cranW * 0.6)} ${n(topY + 8)} Z`;

    case 'smooth':
    default:
      return `M ${CX} ${topY} ` +
        `C ${n(CX + cranW)} ${n(topY + 1)} ${n(CX + halfW)} ${n(topY + 12)} ${n(CX + halfW)} ${browY} ` +
        `C ${n(CX + halfW)} ${n(browY + 14)} ${n(CX + halfW - 3)} ${n(chinY - 14)} ${n(CX + jawW)} ${n(chinY - 5)} ` +
        `Q ${CX} ${n(chinY + 2)} ${n(CX - jawW)} ${n(chinY - 5)} ` +
        `C ${n(CX - halfW + 3)} ${n(chinY - 14)} ${n(CX - halfW)} ${n(browY + 14)} ${n(CX - halfW)} ${browY} ` +
        `C ${n(CX - halfW)} ${n(topY + 12)} ${n(CX - cranW)} ${n(topY + 1)} ${CX} ${topY} Z`;
  }
}

/** Families whose surface reads as hard/faceted — they get crisp seams, not soft gradients. */
const HARD_FAMILIES: SilhouetteFamily[] = ['faceted', 'plated', 'spire'];

// ============================================================================
// step 1 — background
// ============================================================================

function background(g: FaceGenome, p: PGeom, accent: Ramp, glow: Glow): string {
  switch (g.background) {
    case 'aura':
      return `<ellipse cx="${CX}" cy="54" rx="${n(p.halfW + 9)}" ry="42" fill="${glow.mid}" opacity="0.12"/>`;
    case 'heatHaze':
      return `<ellipse cx="${CX}" cy="56" rx="${n(p.halfW + 12)}" ry="44" fill="${glow.mid}" opacity="0.07"/>` +
        `<ellipse cx="${CX}" cy="58" rx="${n(p.halfW + 4)}" ry="36" fill="${glow.bright}" opacity="0.05"/>`;
    case 'windLines':
      return `<g opacity="0.5">` +
        `<path d="M 8 40 Q 24 36 40 40" fill="none" stroke="${accent.md}" stroke-width="1.1" stroke-linecap="round" opacity="0.35"/>` +
        `<path d="M 6 52 Q 22 49 36 53" fill="none" stroke="${accent.lt}" stroke-width="0.9" stroke-linecap="round" opacity="0.3"/>` +
        `<path d="M 92 44 Q 76 40 60 44" fill="none" stroke="${accent.md}" stroke-width="1.1" stroke-linecap="round" opacity="0.35"/>` +
        `<path d="M 94 56 Q 78 53 64 57" fill="none" stroke="${accent.lt}" stroke-width="0.9" stroke-linecap="round" opacity="0.3"/>` +
        `</g>`;
    case 'lightShafts':
      return `<g opacity="0.45">` +
        `<path d="M 18 6 L 30 44" stroke="${accent.lt}" stroke-width="2.4" stroke-linecap="round" opacity="0.12"/>` +
        `<path d="M 74 4 L 66 40" stroke="${accent.lt}" stroke-width="3.0" stroke-linecap="round" opacity="0.1"/>` +
        `<path d="M 6 50 Q 22 47 36 52" fill="none" stroke="${accent.md}" stroke-width="1.0" stroke-linecap="round" opacity="0.3"/>` +
        `<path d="M 94 54 Q 78 51 64 56" fill="none" stroke="${accent.md}" stroke-width="1.0" stroke-linecap="round" opacity="0.3"/>` +
        `</g>`;
    default:
      return '';
  }
}

// ============================================================================
// neck
// ============================================================================

function neck(g: FaceGenome, p: PGeom, body: Ramp, P: Pen): string {
  const y = p.chinY - 6;
  // Wide enough to carry the head even on a needle chin, never wider than half the skull.
  const w = Math.min(Math.max(7.5, p.jawW * 1.05), p.halfW * 0.55);
  if (HARD_FAMILIES.indexOf(g.silhouette.family) >= 0) {
    return `<path d="M ${n(CX - w)} ${n(y)} L ${n(CX - w - 2)} 93 L ${n(CX + w + 2)} 93 L ${n(CX + w)} ${n(y)} Z" ` +
      `fill="${body.dk}" stroke="${P.I}" stroke-width="${P.w()}" stroke-linejoin="round"/>` +
      `<path d="M ${CX} ${n(y)} L ${CX} 93" stroke="${body.hl}" stroke-width="0.8" opacity="0.5"/>`;
  }
  return `<path d="M ${n(CX - w)} ${n(y)} L ${n(CX - w - 3)} 93 L ${n(CX + w + 3)} 93 L ${n(CX + w)} ${n(y)} Z" ` +
    `fill="${body.dk}" stroke="${P.I}" stroke-width="${P.w()}" stroke-linejoin="round"/>` +
    `<path d="M ${n(CX - w)} ${n(y)} Q ${CX} ${n(y + 5)} ${n(CX + w)} ${n(y)} L ${n(CX + w + 1)} 89 L ${n(CX - w - 1)} 89 Z" ` +
    `fill="${body.md}" opacity="0.55"/>`;
}

// ============================================================================
// step 6 — shading planes (clipped to the head)
// ============================================================================

function shadingPlanes(g: FaceGenome, p: PGeom, body: Ramp): string {
  const { topY, browY, chinY, halfW, jawW } = p;
  const k = g.shading.contrast;
  const planes: string[] = [];

  // 1. lit left plane (forehead down the cheek)
  planes.push(`<path d="M ${CX} ${topY} L ${n(CX - halfW * 0.85)} ${n(topY + 8)} L ${n(CX - halfW)} ${n(browY + 4)} ` +
    `L ${n(CX - halfW * 0.55)} ${n(chinY - 14)} L ${n(CX - 2)} ${n(chinY - 9)} L ${n(CX - 1)} ${n(topY + 5)} Z" ` +
    `fill="${body.lt}" opacity="${n(0.78 * k)}"/>`);

  // 2. bright crown highlight
  planes.push(`<path d="M ${n(CX - halfW * 0.5)} ${n(topY + 5)} Q ${CX} ${n(topY + 1)} ${n(CX + halfW * 0.5)} ${n(topY + 5)} ` +
    `Q ${CX} ${n(topY + 12)} ${n(CX - halfW * 0.5)} ${n(topY + 5)} Z" fill="${body.hl}" opacity="${n(0.65 * k)}"/>`);

  // 3. shadowed right cheek / jaw plane
  planes.push(`<path d="M ${n(CX + 2)} ${n(browY)} L ${n(CX + halfW - 2)} ${n(browY + 2)} L ${n(CX + halfW - 5)} ${n(chinY - 14)} ` +
    `L ${n(CX + jawW * 0.85)} ${n(chinY - 6)} L ${n(CX + 2)} ${n(chinY - 9)} Z" fill="${body.dk}" opacity="${n(0.58 * k)}"/>`);

  // 4. under-chin shadow
  planes.push(`<path d="M ${n(CX - jawW)} ${n(chinY - 6)} Q ${CX} ${n(chinY + 1)} ${n(CX + jawW)} ${n(chinY - 6)} ` +
    `Q ${CX} ${n(chinY - 3)} ${n(CX - jawW)} ${n(chinY - 6)} Z" fill="${body.dk}" opacity="${n(0.45 * k)}"/>`);

  let s = planes.slice(0, Math.max(2, Math.min(4, g.shading.planes))).join('');

  // crisp seams on the hard/faceted materials only
  if (HARD_FAMILIES.indexOf(g.silhouette.family) >= 0) {
    s += `<path d="M ${CX} ${n(topY + 4)} L ${CX} ${n(chinY - 5)} ` +
      `M ${n(CX - halfW + 2)} ${n(browY + 2)} L ${n(CX - 3)} ${n(browY + 10)} ` +
      `M ${n(CX + halfW - 2)} ${n(browY + 2)} L ${n(CX + 3)} ${n(browY + 10)}" ` +
      `stroke="${body.hl}" stroke-width="0.7" fill="none" opacity="${n(0.6 * k)}"/>`;
  }
  return s;
}

// ============================================================================
// step 7a — eyes
// ============================================================================

function eyeCentres(g: FaceGenome, p: PGeom): { lx: number; rx: number; y: number; r: number } {
  const spread = 7 + g.eyes.spacing * 7;
  const forward = g.silhouette.family === 'beaked' ? p.snout * 0.35 : 0;  // wedge skulls sit eyes forward
  return {
    lx: CX - spread + forward,
    rx: CX + spread + forward,
    y: p.eyeY,
    r: 3.2 + g.eyes.size * 4.2,
  };
}

/** Outer-corner tilt in degrees; +ve lifts the outer corner (fierce). */
function tiltDeg(g: FaceGenome, sign: number): number {
  return n((g.eyes.tilt - 0.5) * 2 * 14 * sign);
}

function oneEye(type: EyeType, cx: number, cy: number, r: number,
                body: Ramp, glow: Glow, P: Pen): string {
  const rx = r * 1.25, ry = r * 0.85;
  switch (type) {
    case 'slit': {
      const x0 = cx - rx, x1 = cx + rx;
      return `<path d="M ${n(x0)} ${n(cy)} L ${n(cx)} ${n(cy - 2.2)} L ${n(x1)} ${n(cy)}" fill="none" stroke="${glow.mid}" stroke-width="2.6" stroke-linecap="round" opacity="0.35"/>` +
        `<path d="M ${n(x0)} ${n(cy)} L ${n(cx)} ${n(cy - 2)} L ${n(x1)} ${n(cy)}" fill="none" stroke="${glow.mid}" stroke-width="1.4" stroke-linecap="round"/>` +
        `<path d="M ${n(x0)} ${n(cy)} L ${n(cx)} ${n(cy - 2)} L ${n(x1)} ${n(cy)}" fill="none" stroke="#ffffff" stroke-width="0.5" stroke-linecap="round" opacity="0.85"/>` +
        `<path d="M ${n(cx - rx - 2)} ${n(cy - 5)} L ${n(cx + rx * 0.3)} ${n(cy - 3.5)}" stroke="${body.dk}" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>`;
    }
    case 'verticalPupil':
      return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx + 1.6)}" ry="${n(ry + 1.2)}" fill="${glow.mid}" opacity="0.22"/>` +
        `<path d="M ${n(cx - rx)} ${n(cy)} Q ${n(cx)} ${n(cy - ry)} ${n(cx + rx)} ${n(cy)} Q ${n(cx)} ${n(cy + ry)} ${n(cx - rx)} ${n(cy)} Z" fill="${glow.mid}" stroke="${P.I}" stroke-width="${P.w()}" stroke-linejoin="round"/>` +
        `<path d="M ${n(cx)} ${n(cy - ry + 0.6)} Q ${n(cx + 1.6)} ${n(cy)} ${n(cx)} ${n(cy + ry - 0.6)} Q ${n(cx - 1.6)} ${n(cy)} ${n(cx)} ${n(cy - ry + 0.6)} Z" fill="#0c0805"/>` +
        `<circle cx="${n(cx - 1.6)}" cy="${n(cy - 1.4)}" r="0.9" fill="#ffffff" opacity="0.85"/>`;

    case 'hollowGlow':
      return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx + 1.2)}" ry="${n(ry + 1)}" fill="${body.dk}" opacity="0.45"/>` +
        `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${glow.bright}" opacity="0.22"/>` +
        `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx - 0.6)}" ry="${n(ry - 0.4)}" fill="${body.lt}" stroke="${P.I}" stroke-width="${P.w(0.7)}" opacity="0.95"/>` +
        `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx * 0.4)}" ry="${n(ry * 0.5)}" fill="${glow.bright}" opacity="0.55"/>` +
        `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="1" ry="0.8" fill="#ffffff" opacity="0.85"/>` +
        `<path d="M ${n(cx - rx)} ${n(cy - 0.5)} Q ${n(cx)} ${n(cy - ry - 0.8)} ${n(cx + rx)} ${n(cy - 0.5)}" fill="none" stroke="${body.dk}" stroke-width="0.9" stroke-linecap="round" opacity="0.6"/>`;

    case 'molten':
      return `<path d="M ${n(cx - rx - 1.5)} ${n(cy - 0.5)} L ${n(cx - 1)} ${n(cy - ry - 1.5)} L ${n(cx + rx + 1.5)} ${n(cy - 1)} L ${n(cx + rx)} ${n(cy + ry + 1)} L ${n(cx - rx)} ${n(cy + ry)} Z" fill="${body.dk}" stroke="${P.I}" stroke-width="${P.w(0.6)}" stroke-linejoin="round"/>` +
        `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${glow.dk}" opacity="0.6"/>` +
        `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx - 1.4)}" ry="${n(ry - 1)}" fill="${glow.mid}" opacity="0.95"/>` +
        `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx * 0.4)}" ry="${n(ry * 0.45)}" fill="${glow.bright}"/>` +
        `<ellipse cx="${n(cx - 0.6)}" cy="${n(cy - 0.5)}" rx="0.8" ry="0.6" fill="#ffffff" opacity="0.9"/>`;

    case 'raptorRound': {
      const er = r;
      return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(er + 1.4)}" ry="${n(er + 1.1)}" fill="${body.lt}" stroke="${P.I}" stroke-width="${P.w(0.5)}"/>` +
        `<path d="M ${n(cx - er - 1)} ${n(cy - 1)} Q ${n(cx)} ${n(cy - er - 2.2)} ${n(cx + er + 1.2)} ${n(cy - 0.4)}" fill="none" stroke="${P.I}" stroke-width="${P.w(0.7)}" stroke-linecap="round"/>` +
        `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(er)}" ry="${n(er * 0.86)}" fill="#fbfdff"/>` +
        `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(er * 0.78)}" fill="${glow.dk}"/>` +
        `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(er * 0.6)}" fill="${glow.mid}"/>` +
        `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(er * 0.38)}" fill="${glow.bright}" opacity="0.85"/>` +
        `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(Math.max(1, er * 0.26))}" fill="#0a0c10"/>` +
        `<circle cx="${n(cx - er * 0.3)}" cy="${n(cy - er * 0.35)}" r="0.9" fill="#ffffff"/>`;
    }
    case 'sphericalLidless': {
      const er = r * 1.25;
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(er + 1.4)}" fill="none" stroke="${glow.bright}" stroke-width="0.7" opacity="0.32"/>` +
        `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(er + 0.6)}" fill="${body.dk}" stroke="${P.I}" stroke-width="${P.w(0.45)}"/>` +
        `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(er)}" fill="#061418"/>` +
        `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(er - 0.6)}" fill="${glow.dk}"/>` +
        `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(er * 0.74)}" fill="${glow.mid}"/>` +
        `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(er * 0.56)}" fill="${glow.bright}" opacity="0.9"/>` +
        `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="0.9" ry="${n(er - 1.6)}" fill="#02080a"/>` +
        `<circle cx="${n(cx - er * 0.4)}" cy="${n(cy - er * 0.45)}" r="1" fill="#ffffff" opacity="0.85"/>`;
    }
    case 'compound': {
      // insectoid: a cluster of hex facets inside a domed lens
      const er = r * 1.15;
      let e = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(er + 0.6)}" fill="${body.dk}" stroke="${P.I}" stroke-width="${P.w(0.6)}"/>`;
      e += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(er)}" fill="${glow.dk}"/>`;
      const hex = (hx: number, hy: number, hr: number, fill: string, op: number) => {
        let d = '';
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k - Math.PI / 6;
          d += `${k === 0 ? 'M' : 'L'} ${n(hx + Math.cos(a) * hr)} ${n(hy + Math.sin(a) * hr)} `;
        }
        return `<path d="${d}Z" fill="${fill}" opacity="${op}"/>`;
      };
      const cell = er * 0.34;
      const offs: [number, number][] = [[0, 0], [1, 0], [-1, 0], [0.5, 0.9], [-0.5, 0.9], [0.5, -0.9], [-0.5, -0.9]];
      offs.forEach((o, k) => {
        e += hex(cx + o[0] * cell * 1.75, cy + o[1] * cell, cell,
          k % 3 === 0 ? glow.bright : glow.mid, k === 0 ? 0.95 : 0.7);
      });
      e += `<circle cx="${n(cx - er * 0.4)}" cy="${n(cy - er * 0.45)}" r="0.9" fill="#ffffff" opacity="0.8"/>`;
      return e;
    }
    default:
      return '';
  }
}

function eyes(g: FaceGenome, p: PGeom, body: Ramp, glow: Glow, P: Pen): string {
  const e = eyeCentres(g, p);

  if (g.eyes.type === 'visor') {
    // one cyclopean energy band spanning both sockets — no per-eye pair
    const x0 = e.lx - e.r * 1.2, x1 = e.rx + e.r * 1.2, h = e.r * 0.9;
    const drop = (g.eyes.tilt - 0.5) * 4;
    return `<path d="M ${n(x0)} ${n(e.y - h + drop)} L ${n(x1)} ${n(e.y - h - drop)} L ${n(x1)} ${n(e.y + h - drop)} L ${n(x0)} ${n(e.y + h + drop)} Z" fill="${body.dk}" stroke="${P.I}" stroke-width="${P.w()}" stroke-linejoin="round"/>` +
      `<path d="M ${n(x0 + 1)} ${n(e.y + drop)} L ${n(x1 - 1)} ${n(e.y - drop)}" stroke="${glow.mid}" stroke-width="${n(h * 1.1)}" stroke-linecap="round" opacity="0.55"/>` +
      `<path d="M ${n(x0 + 1)} ${n(e.y + drop)} L ${n(x1 - 1)} ${n(e.y - drop)}" stroke="${glow.bright}" stroke-width="${n(h * 0.4)}" stroke-linecap="round"/>` +
      `<path d="M ${n(x0 + 2)} ${n(e.y + drop - h * 0.4)} L ${n(x0 + (x1 - x0) * 0.4)} ${n(e.y - h * 0.4)}" stroke="#ffffff" stroke-width="0.6" stroke-linecap="round" opacity="0.8"/>`;
  }

  const l = oneEye(g.eyes.type, e.lx, e.y, e.r, body, glow, P);
  const r = oneEye(g.eyes.type, e.rx, e.y, e.r, body, glow, P);
  return `<g transform="rotate(${tiltDeg(g, 1)} ${n(e.lx)} ${n(e.y)})">${l}</g>` +
    `<g transform="rotate(${tiltDeg(g, -1)} ${n(e.rx)} ${n(e.y)})">${r}</g>`;
}

// ============================================================================
// nose + mouth (kept generic and quiet — the three axes carry the identity)
// ============================================================================

function noseMouth(g: FaceGenome, p: PGeom, body: Ramp, P: Pen): string {
  const nY = p.eyeY + 6;
  const mY = p.chinY - 12;
  const w = Math.max(4, p.jawW * 0.55);
  let s = '';
  if (g.silhouette.family === 'beaked') {
    s += `<path d="M ${n(CX + p.snout - 1)} ${n(p.browY + 15)} q -1.5 1.5 0 3" fill="none" stroke="${P.I}" stroke-width="1" stroke-linecap="round" opacity="0.8"/>`;
  } else if (g.silhouette.family === 'teardrop') {
    s += `<path d="M ${n(CX - 1.5)} ${n(nY)} L ${CX} ${n(nY + 8)} L ${n(CX + 3.5)} ${n(nY + 7)} L ${n(CX + 1.5)} ${n(nY - 1)} Z" fill="${body.dk}" stroke="${P.I}" stroke-width="${P.w(0.6)}" stroke-linejoin="round" opacity="0.85"/>`;
  } else if (HARD_FAMILIES.indexOf(g.silhouette.family) >= 0) {
    s += `<path d="M ${CX} ${n(nY - 2)} L ${CX} ${n(nY + 7)}" stroke="${body.dk}" stroke-width="1.3" stroke-linecap="round" opacity="0.5"/>`;
  } else {
    s += `<path d="M ${CX} ${n(nY - 2)} L ${CX} ${n(nY + 7)}" stroke="${body.dk}" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>` +
      `<ellipse cx="${n(CX - 2.2)}" cy="${n(nY + 8)}" rx="0.7" ry="0.5" fill="${body.dk}" opacity="0.6"/>` +
      `<ellipse cx="${n(CX + 2.2)}" cy="${n(nY + 8)}" rx="0.7" ry="0.5" fill="${body.dk}" opacity="0.6"/>`;
  }
  s += `<path d="M ${n(CX - w)} ${n(mY)} Q ${CX} ${n(mY + 1.6)} ${n(CX + w)} ${n(mY)}" fill="none" stroke="${body.dk}" stroke-width="1.3" stroke-linecap="round" opacity="0.65"/>`;
  return s;
}

// ============================================================================
// step 7b — signature features, always drawn LAST
// ============================================================================

/**
 * A leaf/feather blade: used by laurel, featherCrest and gills. The shadow lobe is what
 * makes it read as a feather rather than a needle — without it the crests look like spikes.
 */
function blade(bx: number, by: number, len: number, angDeg: number, wid: number,
               ramp: Ramp, P: Pen): string {
  const rad = angDeg * Math.PI / 180;
  const tx = bx + Math.cos(rad) * len, ty = by + Math.sin(rad) * len;
  const px = -Math.sin(rad) * wid, py = Math.cos(rad) * wid;
  const mx = bx + Math.cos(rad) * len * 0.5, my = by + Math.sin(rad) * len * 0.5;
  const d = `M ${n(bx)} ${n(by)} Q ${n(mx + px)} ${n(my + py)} ${n(tx)} ${n(ty)} Q ${n(mx - px)} ${n(my - py)} ${n(bx)} ${n(by)} Z`;
  return `<path d="${d}" fill="${ramp.md}" stroke="${P.I}" stroke-width="${P.w(0.5)}" stroke-linejoin="round"/>` +
    `<path d="M ${n(bx)} ${n(by)} Q ${n(mx - px)} ${n(my - py)} ${n(tx)} ${n(ty)} Q ${n(mx)} ${n(my)} ${n(bx)} ${n(by)} Z" fill="${ramp.dk}" opacity="0.28"/>` +
    `<path d="M ${n(bx)} ${n(by)} Q ${n(mx + px * 0.5)} ${n(my + py * 0.5)} ${n(tx)} ${n(ty)}" fill="none" stroke="${ramp.lt}" stroke-width="${P.w(0.4)}" stroke-linecap="round" opacity="0.8"/>` +
    `<path d="M ${n(bx)} ${n(by)} L ${n(tx)} ${n(ty)}" stroke="${ramp.hl}" stroke-width="0.5" stroke-linecap="round" opacity="0.85"/>` +
    `<circle cx="${n(tx)}" cy="${n(ty)}" r="0.9" fill="${ramp.hl}" opacity="0.9"/>`;
}

/** Signature parts that must sit BEHIND the head (frills, side crests, gill fronds). */
function signatureBack(g: FaceGenome, p: PGeom, accent: Ramp, P: Pen): string {
  const t = g.signature.intensity;
  const { browY, halfW, topY, chinY } = p;
  switch (g.signature.type) {
    case 'dorsalCrest': {
      // Swept-back bony frill. It has to READ as attached to the skull, so it is anchored
      // on the back temple and clamped inside the canvas — an unclamped sweep just becomes
      // a detached blob at the left edge.
      const x0 = CX - halfW + 2;
      const reach = Math.min(halfW * 0.95, 9 + t * 11);
      const xo = Math.max(3, x0 - reach);
      const d = `M ${n(x0)} ${n(topY + 7)} ` +
        `Q ${n(xo)} ${n(topY + 15)} ${n(xo)} ${n(browY + 10)} ` +
        `Q ${n(xo + 1)} ${n(chinY - 13)} ${n(x0 + 7)} ${n(chinY - 9)} ` +
        `L ${n(x0 + 5)} ${n(browY + 8)} Q ${n(x0 - 2)} ${n(browY - 1)} ${n(x0)} ${n(topY + 7)} Z`;
      let s = `<path d="${d}" fill="${accent.dk}" stroke="${P.I}" stroke-width="${P.w()}" stroke-linejoin="round"/>`;
      for (let k = 1; k <= 2; k++) {
        const q = k / 3;
        s += `<path d="M ${n(x0 + 1)} ${n(topY + 9 + q * 14)} Q ${n(xo + reach * 0.25)} ${n(browY + 4 + q * 10)} ` +
          `${n(xo + reach * 0.15)} ${n(browY + 12 + q * 14)}" fill="none" stroke="${accent.hl}" stroke-width="0.9" opacity="0.55"/>`;
      }
      return s;
    }
    case 'featherCrest': {
      // folded wing plumage sweeping back from both temples
      let s = '';
      for (const sign of [-1, 1]) {
        const bx = CX + sign * (halfW - 3);
        const defs = [
          { by: browY - 4, len: 12 + t * 8, ang: -22, w: 4.0 },
          { by: browY - 1, len: 16 + t * 10, ang: -8, w: 5.0 },
          { by: browY + 4, len: 13 + t * 8, ang: 6, w: 4.2 },
        ];
        for (const d of defs) {
          s += blade(bx, d.by, d.len, d.ang * sign + (sign < 0 ? 180 : 0), d.w, accent, P);
        }
      }
      return s;
    }
    case 'gills': {
      // axolotl-style feathery fronds flaring out to both sides
      let s = '';
      for (const sign of [-1, 1]) {
        const bx = CX + sign * (halfW * 0.8);
        const defs = [
          { by: browY - 5, ang: -36, len: 10 + t * 8 },
          { by: browY + 1, ang: -12, len: 13 + t * 9 },
          { by: browY + 8, ang: 12, len: 11 + t * 8 },
        ];
        for (const d of defs) {
          const ang = d.ang * sign + (sign < 0 ? 180 : 0);
          const rad = ang * Math.PI / 180;
          const tx = bx + Math.cos(rad) * d.len, ty = d.by + Math.sin(rad) * d.len;
          const mx = (bx + tx) / 2, my = (d.by + ty) / 2;
          s += `<path d="M ${n(bx)} ${n(d.by)} Q ${n(mx - Math.sin(rad) * 4 * sign)} ${n(my + Math.cos(rad) * 4 * sign)} ${n(tx)} ${n(ty)} Q ${n(mx)} ${n(my)} ${n(bx)} ${n(d.by)} Z" fill="${accent.md}" opacity="0.42"/>`;
          s += `<path d="M ${n(bx)} ${n(d.by)} Q ${n(mx)} ${n(my)} ${n(tx)} ${n(ty)}" fill="none" stroke="${accent.dk}" stroke-width="${P.w(0.5)}" stroke-linecap="round"/>`;
          for (let k = 1; k <= 3; k++) {
            const q = k / 4;
            const qx = bx + (tx - bx) * q, qy = d.by + (ty - d.by) * q;
            const bl = 4 + (k === 2 ? 1.6 : 0);
            s += `<path d="M ${n(qx)} ${n(qy)} l ${n(-Math.sin(rad) * bl * sign)} ${n(Math.cos(rad) * bl * sign + 0.6)}" stroke="${accent.lt}" stroke-width="0.7" stroke-linecap="round" opacity="0.85"/>`;
          }
          s += `<circle cx="${n(tx)}" cy="${n(ty)}" r="1.1" fill="${accent.hl}" opacity="0.9"/>`;
        }
      }
      return s;
    }
    default:
      return '';
  }
}

/** Signature parts drawn OVER the finished face. */
function signatureFront(g: FaceGenome, p: PGeom, accent: Ramp, glow: Glow, P: Pen): string {
  const t = g.signature.intensity;
  const { topY, browY, halfW, cranW } = p;

  switch (g.signature.type) {
    case 'thirdEyeGem': {
      const gx = CX, gy = browY - 6, gr = 2.8 + t * 2.4;
      let s = `<circle cx="${gx}" cy="${n(gy)}" r="${n(gr * 1.8)}" fill="${glow.mid}" opacity="0.28"/>`;
      s += `<path d="M ${gx} ${n(gy - gr)} L ${n(gx + gr * 0.7)} ${n(gy)} L ${gx} ${n(gy + gr)} L ${n(gx - gr * 0.7)} ${n(gy)} Z" fill="${glow.mid}" stroke="${P.I}" stroke-width="0.8" stroke-linejoin="round"/>`;
      s += `<path d="M ${gx} ${n(gy - gr)} L ${gx} ${n(gy + gr)} M ${n(gx - gr * 0.7)} ${n(gy)} L ${n(gx + gr * 0.7)} ${n(gy)}" stroke="#ffffff" stroke-width="0.5" opacity="0.7"/>`;
      s += `<path d="M ${gx} ${n(gy - gr)} L ${n(gx - gr * 0.35)} ${n(gy - gr * 0.4)} L ${gx} ${n(gy)} Z" fill="#ffffff" opacity="0.55"/>`;
      s += `<circle cx="${n(gx - 9)}" cy="${n(gy + 1)}" r="1" fill="${glow.mid}" opacity="0.85"/>`;
      s += `<circle cx="${n(gx + 9)}" cy="${n(gy + 1)}" r="1" fill="${glow.mid}" opacity="0.85"/>`;
      return s;
    }
    case 'dorsalCrest': {
      // row of bony triangles marching along the crown
      let s = '';
      const count = 5;
      for (let k = 0; k < count; k++) {
        const bx = CX - cranW + k * (cranW * 2 / (count - 1));
        const dy = Math.abs(bx - CX) / Math.max(1, halfW) * 5;
        const by = topY + 2 + dy;
        const h = (5 + t * 8) * (1 - Math.abs(bx - CX) / (halfW * 1.6));
        s += `<path d="M ${n(bx - 3)} ${n(by + 4)} L ${n(bx)} ${n(by - h)} L ${n(bx + 3)} ${n(by + 4)} Z" fill="${accent.md}" stroke="${P.I}" stroke-width="${P.w(0.8)}" stroke-linejoin="round"/>`;
        s += `<path d="M ${n(bx)} ${n(by - h)} L ${n(bx)} ${n(by + 3)}" stroke="${accent.hl}" stroke-width="0.7" opacity="0.7"/>`;
      }
      return s;
    }
    case 'rockCrest': {
      // jagged shards, taller in the middle, plus two back tips at the temples
      let s = '';
      const defs = [
        { x: CX - halfW * 0.62, h: 5, lean: -3 }, { x: CX - halfW * 0.32, h: 8, lean: -2 },
        { x: CX, h: 10, lean: 0 },
        { x: CX + halfW * 0.32, h: 8, lean: 2 }, { x: CX + halfW * 0.62, h: 5, lean: 3 },
      ];
      for (let k = 0; k < defs.length; k++) {
        const d = defs[k];
        const dy = Math.abs(d.x - CX) / Math.max(1, halfW) * 6;
        const by = topY + 3 + dy + (k % 2);
        const h = d.h * (0.6 + t * 0.9);
        const tx = d.x + d.lean, ty = by - h;
        s += `<path d="M ${n(d.x - 2.4)} ${n(by)} L ${n(tx)} ${n(ty)} L ${n(d.x + 2.4)} ${n(by)} Z" fill="${accent.dk}" stroke="${P.I}" stroke-width="${P.w(0.6)}" stroke-linejoin="round"/>`;
        s += `<path d="M ${n(d.x - 0.6)} ${n(by)} L ${n(tx)} ${n(ty)} L ${n(d.x + 0.8)} ${n(by - h * 0.45)} Z" fill="${accent.md}" opacity="0.9"/>`;
        s += `<path d="M ${n(tx)} ${n(ty)} L ${n(tx - 0.4)} ${n(ty + h * 0.4)}" stroke="${accent.lt}" stroke-width="0.6" stroke-linecap="round" opacity="0.85"/>`;
      }
      for (const sign of [-1, 1]) {
        s += `<path d="M ${n(CX + sign * (halfW + 1))} ${n(browY + 2)} L ${n(CX + sign * (halfW + 5))} ${n(browY - 6)} L ${n(CX + sign * (halfW - 2))} ${n(browY - 1)} Z" fill="${accent.dk}" stroke="${P.I}" stroke-width="${P.w(0.5)}" stroke-linejoin="round" opacity="0.9"/>`;
      }
      return s;
    }
    case 'laurel': {
      const wlx = CX - halfW + 2, wrx = CX + halfW - 2, wTopY = topY + 5;
      let s = `<path d="M ${n(wlx)} ${n(browY - 4)} Q ${CX} ${n(wTopY - 4)} ${n(wrx)} ${n(browY - 4)}" fill="none" stroke="${accent.dk}" stroke-width="3.4" stroke-linecap="round" opacity="0.55"/>`;
      s += `<path d="M ${n(wlx)} ${n(browY - 4)} Q ${CX} ${n(wTopY - 4)} ${n(wrx)} ${n(browY - 4)}" fill="none" stroke="${accent.md}" stroke-width="2" stroke-linecap="round"/>`;
      // fewer, larger leaves — a dense fan of tiny ones just reads as scribble at 100px
      const leaves = 3 + Math.round(t * 2);
      for (let k = 0; k < leaves; k++) {
        const q = k / Math.max(1, leaves - 1);
        const ly = (browY - 4) + (wTopY - 4 - (browY - 4)) * (q * q);
        const len = (7 + t * 4) - k * 0.6;
        s += blade(wlx + (CX - wlx) * q * 0.85, ly, len, 235 - k * 10, len * 0.44, accent, P);
        s += blade(wrx - (wrx - CX) * q * 0.85, ly, len, 305 + k * 10, len * 0.44, accent, P);
      }
      s += `<circle cx="${CX}" cy="${n(wTopY - 4)}" r="1.6" fill="${accent.lt}" stroke="${accent.dk}" stroke-width="0.5"/>`;
      s += `<circle cx="${CX}" cy="${n(wTopY - 4)}" r="0.6" fill="#ffffff" opacity="0.7"/>`;
      return s;
    }
    case 'featherCrest': {
      let s = '';
      const defs = [
        { x: CX - cranW * 0.62, len: 7, ang: -84, w: 3.2 },
        { x: CX - cranW * 0.22, len: 10, ang: -89, w: 3.8 },
        { x: CX + cranW * 0.22, len: 10, ang: -91, w: 3.8 },
        { x: CX + cranW * 0.62, len: 7, ang: -96, w: 3.2 },
      ];
      for (const d of defs) {
        s += blade(d.x, topY + 1, d.len + t * 7, d.ang, d.w, accent, P);
      }
      return s;
    }
    case 'gills': {
      // front half: sensory pit dots curving down from each eye
      let s = '';
      for (const sign of [-1, 1]) {
        for (let k = 0; k < 5; k++) {
          const q = k / 4;
          const lx = CX + sign * (10 + q * 7);
          const ly = p.eyeY + 5 + q * 14;
          s += `<circle cx="${n(lx)}" cy="${n(ly)}" r="0.8" fill="${P.I}" opacity="0.4"/>`;
          s += `<circle cx="${n(lx)}" cy="${n(ly)}" r="0.4" fill="${glow.bright}" opacity="0.5"/>`;
        }
      }
      return s;
    }
    case 'hornPair': {
      // swept-back curved horns rising from the upper temples
      let s = '';
      const len = 8 + t * 12;
      for (const sign of [-1, 1]) {
        const bx = CX + sign * (halfW - 2), by = topY + 8;
        const tx = bx + sign * (len * 0.55), ty = Math.max(3, by - len);
        const c1x = bx + sign * (len * 0.9), c1y = by - len * 0.25;
        s += `<path d="M ${n(bx - sign * 3)} ${n(by + 3)} Q ${n(c1x)} ${n(c1y)} ${n(tx)} ${n(ty)} Q ${n(c1x - sign * 3.5)} ${n(c1y + 2)} ${n(bx + sign * 1.5)} ${n(by - 1)} Z" fill="${accent.md}" stroke="${P.I}" stroke-width="${P.w(0.8)}" stroke-linejoin="round"/>`;
        s += `<path d="M ${n(bx - sign * 1)} ${n(by + 1)} Q ${n(c1x - sign * 1)} ${n(c1y)} ${n(tx)} ${n(ty)}" fill="none" stroke="${accent.hl}" stroke-width="0.7" stroke-linecap="round" opacity="0.8"/>`;
      }
      return s;
    }
    case 'anglerLure': {
      const bend = (p.j - 1.5) * 4;
      const reach = 6 + t * 9;
      const tipX = CX + bend, tipY = Math.max(4, topY - reach);
      const ctrlX = CX + bend * 0.4 + 7, ctrlY = topY - reach * 0.3;
      let s = `<path d="M ${CX} ${n(topY + 5)} Q ${n(ctrlX)} ${n(ctrlY)} ${n(tipX)} ${n(tipY)}" fill="none" stroke="${accent.dk}" stroke-width="${P.w(0.85)}" stroke-linecap="round"/>`;
      s += `<path d="M ${CX} ${n(topY + 5)} Q ${n(ctrlX)} ${n(ctrlY)} ${n(tipX)} ${n(tipY)}" fill="none" stroke="${accent.lt}" stroke-width="${P.w(0.3)}" stroke-linecap="round" opacity="0.8"/>`;
      s += `<circle cx="${n(tipX)}" cy="${n(tipY)}" r="${n(2.6 + t * 2)}" fill="${glow.bright}" opacity="0.22"/>`;
      s += `<circle cx="${n(tipX)}" cy="${n(tipY)}" r="${n(1.6 + t * 1.2)}" fill="${glow.bright}" opacity="0.55"/>`;
      s += `<circle cx="${n(tipX)}" cy="${n(tipY)}" r="1.2" fill="#ffffff" opacity="0.95"/>`;
      return s;
    }
    default:
      return '';
  }
}

// ============================================================================
// the renderer
// ============================================================================

let uidCounter = 0;

export interface ParametricOpts {
  /** Unique suffix for clipPath ids — REQUIRED to be unique per rendered face on a page. */
  uid?: string;
  /** Ink width, matching the component's style tiers (sports 1.7 / seinen 1.5 / premium 1.2). */
  inkWidth?: number;
  /**
   * Emit TypeScript template-literal placeholders instead of resolved colours / ink / uid.
   * Only face-codegen.ts sets this; the gallery always renders concrete.
   */
  symbolic?: boolean;
}

/** The 7 skeleton steps, kept separate so codegen can emit them as commented blocks. */
export interface ParametricParts {
  background: string;
  signatureBack: string;
  neck: string;
  head: string;      // the `d` attribute only
  headAndClip: string;
  shading: string;   // already wrapped in the clip group
  eyes: string;
  noseMouth: string;
  signatureFront: string;
}

const SYMBOLIC_BODY: Ramp = { lt: '${body.lt}', md: '${body.md}', dk: '${body.dk}', hl: '${body.hl}' };
const SYMBOLIC_ACCENT: Ramp = { lt: '${accent.lt}', md: '${accent.md}', dk: '${accent.dk}', hl: '${accent.hl}' };
const SYMBOLIC_GLOW: Glow = { bright: '${glow.bright}', mid: '${glow.mid}', dk: '${glow.dk}' };

function resolve(g: FaceGenome, opts: ParametricOpts) {
  const fam = PALETTE_FAMILIES[g.palette.family] || PALETTE_FAMILIES.crystal;
  const wrap = (i: number, len: number) => ((i % len) + len) % len;
  const IWnum = opts.inkWidth ?? 1.6;
  if (opts.symbolic) {
    const P: Pen = {
      I: '${I}',
      w: (k?: number) => (k === undefined || k === 1) ? '${IW}' : '${(IW * ' + k + ').toFixed(2)}',
    };
    return { body: SYMBOLIC_BODY, accent: SYMBOLIC_ACCENT, glow: SYMBOLIC_GLOW, P, uid: '${uid}', fam };
  }
  const P: Pen = { I: fam.ink, w: (k?: number) => String(n((k ?? 1) * IWnum)) };
  return {
    body: fam.body[wrap(g.palette.skinIdx, fam.body.length)],
    accent: fam.accent[wrap(g.palette.accentIdx, fam.accent.length)],
    glow: fam.glow[wrap(g.palette.glowIdx, fam.glow.length)],
    P,
    uid: (opts.uid || `pg${++uidCounter}`).replace(/[^A-Za-z0-9_-]/g, ''),
    fam,
  };
}

/** Render one genome as the 7 skeleton steps. */
export function drawParametricParts(g: FaceGenome, opts: ParametricOpts = {}): ParametricParts {
  const { body, accent, glow, P, uid } = resolve(g, opts);
  const p = geomFor(g);
  const head = headPath(g, p);
  return {
    background: background(g, p, accent, glow),
    signatureBack: signatureBack(g, p, accent, P),
    neck: neck(g, p, body, P),
    head,
    headAndClip: `<path d="${head}" fill="${body.md}" stroke="${P.I}" stroke-width="${P.w()}" stroke-linejoin="round"/>` +
      `<clipPath id="fp${uid}"><path d="${head}"/></clipPath>`,
    shading: `<g clip-path="url(#fp${uid})">${shadingPlanes(g, p, body)}</g>`,
    eyes: eyes(g, p, body, glow, P),
    noseMouth: noseMouth(g, p, body, P),
    signatureFront: signatureFront(g, p, accent, glow, P),
  };
}

/** Render one genome to SVG inner markup for the standard 100x100 face canvas. */
export function drawParametric(g: FaceGenome, opts: ParametricOpts = {}): string {
  const q = drawParametricParts(g, opts);
  return q.background + q.signatureBack + q.neck + q.headAndClip + q.shading +
    q.eyes + q.noseMouth + q.signatureFront;
}

/** Convenience: a full standalone `<svg>` string (used by the gallery and by exports). */
export function drawParametricSvg(g: FaceGenome, size = 100, opts: ParametricOpts = {}): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">` +
    drawParametric(g, opts) + `</svg>`;
}
