/**
 * FACE LAB — distillation (F4): freeze a winning genome into a classic `drawX()`.
 *
 * The output has the exact shape of the shipped species renderers — the 7-step skeleton,
 * constants where the genome had parameters, correct `uid`, and three 12-entry palettes
 * still indexed by `skinTone` / `hairColor` / `eyeColor`. The parametric renderer itself
 * never ships: it is only used HERE, in symbolic mode, to emit the frozen markup, so the
 * generated species can never drift from what the user actually voted on.
 *
 * The palette banks are ROTATED so the winning indices land on slot 0 — `skinTone=0`
 * reproduces the voted face byte-for-byte, and slots 1..11 keep the family's variety.
 */

import {
  FaceGenome, Glow, Ramp, PALETTE_FAMILIES, describeGenome,
} from './face-genome';
import { drawParametricParts, geomFor, ParametricParts } from './face-parametric';

export interface FrozenSpecies {
  speciesId: string;
  methodName: string;
  constPrefix: string;
  /** The three `private static readonly` palette banks. */
  palettes: string;
  /** The `private drawX(): string { … }` method. */
  method: string;
  /** Markdown with the two plumbing lines. */
  plumbing: string;
  /** Everything concatenated — ready to save next to the plan. */
  full: string;
}

function slug(name: string): string {
  return (name || 'newspecies').toLowerCase().replace(/[^a-z0-9]/g, '') || 'newspecies';
}

function pascal(name: string): string {
  const s = slug(name);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** SCREAMING prefix for the static palette constants, e.g. 'noctilume' -> 'NOCT'. */
function prefixFor(name: string): string {
  return slug(name).slice(0, 4).toUpperCase();
}

/** Rotate so `winning` becomes index 0, preserving the family's ordering after it. */
function rotate<T>(arr: T[], winning: number): T[] {
  const k = ((winning % arr.length) + arr.length) % arr.length;
  return arr.slice(k).concat(arr.slice(0, k));
}

function rampLine(r: Ramp, i: number): string {
  return `    { lt: '${r.lt}', md: '${r.md}', dk: '${r.dk}', hl: '${r.hl}' },${i === 0 ? '  // 0 = the voted face' : ''}`;
}

function glowLine(g: Glow, i: number): string {
  return `    { bright: '${g.bright}', mid: '${g.mid}', dk: '${g.dk}' },${i === 0 ? '  // 0 = the voted face' : ''}`;
}

/** Freeze one genome into production-shaped TypeScript. */
export function freezeGenome(g: FaceGenome, speciesName: string, nationId: number | null = null): FrozenSpecies {
  const id = slug(speciesName);
  const method = 'draw' + pascal(speciesName);
  const PFX = prefixFor(speciesName);
  const uidPrefix = id.slice(0, 2);
  const fam = PALETTE_FAMILIES[g.palette.family] || PALETTE_FAMILIES.crystal;

  const body = rotate(fam.body, g.palette.skinIdx);
  const accent = rotate(fam.accent, g.palette.accentIdx);
  const glow = rotate(fam.glow, g.palette.glowIdx);

  // ---- palette banks -------------------------------------------------------
  const palettes =
    `  // ---- ${pascal(speciesName)} palettes — distilled from Face Lab genome ${g.id}\n` +
    `  //      (family '${fam.id}', rotated so slot 0 is the voted combination).\n` +
    `  /** body material: lit plane / base / shadow plane / edge highlight (by skinTone) */\n` +
    `  private static readonly ${PFX}_BODY = [\n${body.map(rampLine).join('\n')}\n  ];\n` +
    `  /** signature / crest accent (by hairColor) */\n` +
    `  private static readonly ${PFX}_ACCENT = [\n${accent.map(rampLine).join('\n')}\n  ];\n` +
    `  /** emissive eye / feature glow (by eyeColor) */\n` +
    `  private static readonly ${PFX}_GLOW = [\n${glow.map(glowLine).join('\n')}\n  ];\n`;

  // ---- the four jitter variants of each skeleton step -----------------------
  const variants = [0, 1, 2, 3].map(j => {
    const gj: FaceGenome = JSON.parse(JSON.stringify(g));
    gj.silhouette.jitterSeed = j;
    return drawParametricParts(gj, { symbolic: true });
  });

  const arr = (pick: (v: ParametricParts) => string) =>
    '[\n' + variants.map(v => '      `' + pick(v) + '`').join(',\n') + '\n    ][j]';

  const geom0 = geomFor(g);

  const methodSrc =
`  /**
   * ${pascal(speciesName)} — frozen from Face Lab genome ${g.id}
   * (${describeGenome(g)}; silhouette w=${g.silhouette.width.toFixed(2)} jaw=${g.silhouette.jawRatio.toFixed(2)} cran=${g.silhouette.cranFlat.toFixed(2)},
   * eyes size=${g.eyes.size.toFixed(2)} spacing=${g.eyes.spacing.toFixed(2)} tilt=${g.eyes.tilt.toFixed(2)},
   * signature intensity=${g.signature.intensity.toFixed(2)}, shading ${g.shading.planes} planes @ ${g.shading.contrast.toFixed(2)}).
   *
   * Self-contained like every other species renderer: it calls no human / crystalline /
   * saurian / … helper, so everything else stays byte-for-byte unchanged whenever
   * species !== '${id}'. Deterministic from the descriptor indices.
   *   skinTone -> body material, eyeColor -> glow, hairColor -> accent,
   *   baseFaceId -> silhouette jitter (halfW ${geom0.halfW.toFixed(1)} + j*0.6, brow ${geom0.browY}, chin ${geom0.chinY}).
   */
  private ${method}(): string {
    const C = PlayerFaceComponent;
    // 1. palettes (modulo-wrapped, exactly like every other species)
    const body = C.${PFX}_BODY[(((this.skinTone % C.${PFX}_BODY.length) + C.${PFX}_BODY.length) % C.${PFX}_BODY.length)];
    const accent = C.${PFX}_ACCENT[(((this.hairColor % C.${PFX}_ACCENT.length) + C.${PFX}_ACCENT.length) % C.${PFX}_ACCENT.length)];
    const glow = C.${PFX}_GLOW[(((this.eyeColor % C.${PFX}_GLOW.length) + C.${PFX}_GLOW.length) % C.${PFX}_GLOW.length)];
    // 2. ink colour + ink width
    const I = '${fam.ink}';
    const IW = this.style === 'sports' ? 1.7 : (this.style === 'premium' ? 1.2 : 1.5);
    // 3. uid for the clipPath
    const uid = '${uidPrefix}' + this.skinTone + '_' + this.eyeColor + '_' + this.hairColor + '_' + this.baseFaceId + this.style;
    // 4. deterministic silhouette jitter
    const j = (((this.baseFaceId % 4) + 4) % 4);

    let s = '';
    // 5. background, back-layer signature, neck, head path + clipPath
    s += ${arr(v => v.background + v.signatureBack + v.neck + v.headAndClip)};
    // 6. cel shading planes (clipped to the head)
    s += ${arr(v => v.shading)};
    // 7. eyes + nose/mouth, then the SIGNATURE drawn last
    s += ${arr(v => v.eyes + v.noseMouth + v.signatureFront)};
    return s;
  }
`;

  const nationLine = nationId === null
    ? `            <NATION_ID>L, "${id}",   // pick a nation that currently has no species`
    : `            ${nationId}L, "${id}",`;

  const plumbing =
`## Plumbing — 2 lines

**1. Backend** — \`src/main/java/com/footballmanagergamesimulator/service/FaceGenerator.java\`,
in \`NATION_SPECIES\` (around line 101):

\`\`\`java
${nationLine}
\`\`\`

\`Map.of\` takes at most 10 pairs — switch to \`Map.ofEntries(Map.entry(…), …)\` once the
mapping outgrows that.

**2. Frontend** — \`src/app/player-face/player-face.component.ts\`, in \`buildInner()\`
(around line 2183), above the human fallback:

\`\`\`ts
    if (this.species === '${id}') return this.${method}();
\`\`\`

Then paste the palette banks next to the other \`private static readonly\` palettes and the
\`${method}()\` method next to the other \`drawX()\` renderers. Nothing else changes: the
parametric renderer stays in \`src/app/face-lab/\` and never enters the production path.
`;

  const full =
`<!-- Generated by Face Lab (face-codegen.ts) from genome ${g.id} -->
# Species: ${id}

${describeGenome(g)}

## Genome

\`\`\`json
${JSON.stringify(g, null, 2)}
\`\`\`

## Palettes — paste into PlayerFaceComponent

\`\`\`ts
${palettes}\`\`\`

## Renderer — paste next to the other drawX() methods

\`\`\`ts
${methodSrc}\`\`\`

${plumbing}`;

  return { speciesId: id, methodName: method, constPrefix: PFX, palettes, method: methodSrc, plumbing, full };
}
