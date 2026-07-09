import { Component, Input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Procedural player face rendered as inline cel-shaded SVG from the backend
 * "face descriptor" (baseFaceId / skinTone / hairStyle / hairColor / eyeColor).
 * No external art assets are needed; the descriptor indices pick colours and a
 * hair silhouette so the same player always renders the same face (deterministic).
 *
 * MATURE / SERIOUS ANIME STYLES
 * -----------------------------
 * (demo galleries + screenshots in /tmp/face-variants):
 *   - 'seinen'  : Seinen / Serious Anime — long angular face, narrow deep-set eyes,
 *                 hard flat upper lid, defined jaw, calm/focused expression (DEFAULT).
 *   - 'sports'  : Sharp Sports Anime — intense gaze, firmer angled brows, crisper ink,
 *                 sharper jaw, dynamic two-tone hair; competitive look.
 *   - 'premium' : Clean Premium Anime — minimalist, elegant proportions, thin clean
 *                 ink, controlled colour, no comic exaggeration.
 *
 * Palettes: indices 0-5 realistic, 6-11 vivid-but-controlled, so any skin/hair
 * colour the backend sends still reads as a serious cel-shaded portrait.
 */
/** Head geometry knobs produced by geom() and threaded through the draw helpers. */
interface Geom {
  rx: number; jaw: number; jawW: number; cheek: number;
  crown: number; taper: number; chinBlunt: number; topY: number;
  /** non-zero selects a hand-built exaggerated silhouette in headPath():
   *  1 = STRONG CRESCENT-MOON, 2 = ONION / DOMED-BULB. 0 = parametric default. */
  special?: number;
}

/**
 * Favored STRUCTURAL index subsets per nation — the small biased pool a player
 * generator should draw the head / brow / hair indices from to make each nation
 * recognisable WITHOUT forcing a single shape (so per-player variety survives).
 *   head : faceShape indices (0-17)  — see geom() catalog
 *   brow : browShape indices (0-8)   — see browShapeIdx() catalog
 *   hair : hairStyle indices (0-19)  — see hair() catalog
 * This is a BIAS table only. The component itself still renders purely from its
 * explicit shape @Inputs (the existing Gallactick signature aside); the profile
 * is applied by the GENERATOR (gallery / backend) when it picks those inputs.
 * Exported so the backend can mirror the exact same weights.
 */
export interface NationStructProfile { head: number[]; brow: number[]; hair: number[]; }

export const NATION_STRUCTURE: NationStructProfile[] = [
  // 0 International — NEUTRAL: balanced everyman pool (grounded human shapes)
  { head: [0, 1, 2, 4],      brow: [0, 2, 4],    hair: [0, 1, 3, 5, 8] },
  // 1 Gallactick — ALIEN: elongated/diamond/broad skulls + exotic alien hair
  { head: [5, 6, 7, 8, 9],   brow: [4, 8, 1],    hair: [14, 15, 17, 18, 19] },
  // 2 Dong — squat power: very-wide + wide-cheek bruiser, heavy long brows, crests
  { head: [14, 3, 0, 11],    brow: [3, 5, 7],    hair: [2, 13, 14, 4] },
  // 3 Khess — angular warrior: hexagonal + angular/diamond, long-angled brows, mohawk/spikes
  { head: [15, 2, 6, 12],    brow: [6, 1, 5],    hair: [14, 2, 15, 11] },
  // 4 FootieCup — domed nobles: semicircle/dome + crescent, thick-straight brows, slick/swept
  { head: [11, 10, 0, 1],    brow: [7, 0, 5],    hair: [8, 1, 5, 17] },
  // 5 Cards — sharp tall: very-tall + narrow-tall + heart, thin-sharp/thin-long brows, neat
  { head: [13, 4, 12, 1],    brow: [4, 8, 2],    hair: [0, 3, 6, 10] },
  // 6 Literature — UNMISTAKABLE lunar/domed heads: strong crescent-moon (16) + onion-dome (17)
  //   + crescent (10) + semicircle-dome (11). Thin-long brows, curtains/wavy hair.
  { head: [16, 17, 10, 11],  brow: [8, 5, 2],    hair: [5, 7, 9, 10] },
  // 7 Eleven — cyber-angular: hexagonal + very-tall + diamond, long-flat/thin-sharp brows, undercut/spikes
  { head: [15, 13, 2, 6],    brow: [5, 4, 6],    hair: [3, 2, 11, 14] },
];

@Component({
  selector: 'app-player-face',
  templateUrl: './player-face.component.html',
  styleUrls: ['./player-face.component.css']
})
export class PlayerFaceComponent {
  @Input() baseFaceId = 0;
  @Input() skinTone = 0;
  @Input() hairStyle = 0;
  @Input() hairColor = 0;
  @Input() eyeColor = 0;
  @Input() size = 64;
  /**
   * Explicit per-player shape indices (0..4) supplied by the backend. When >= 0
   * they OVERRIDE the legacy baseFaceId-derived selection; -1 keeps the old
   * deterministic fallback so callers that don't pass them still render.
   */
  @Input() faceShape = -1;
  @Input() noseShape = -1;
  @Input() eyeShape = -1;
  @Input() mouthShape = -1;
  /**
   * Additional masculine variety dimensions, each OPTIONAL and defaulting to -1.
   * When >= 0 they OVERRIDE the baseFaceId-derived selection (so the backend DB
   * can drive them per-player later); -1 derives deterministically from a
   * DISTINCT baseFaceId offset so each face still gets its own brow/ear/wrinkle.
   *   browShape  0..4  — straight-thick / angled-down stern / arched / bushy / thin-sharp
   *   earShape   0..2  — small-tucked / standard / large-protruding
   *   wrinkle    0..2  — none / light forehead+brow / heavy veteran (faint nasolabial)
   */
  @Input() browShape = -1;
  @Input() earShape = -1;
  @Input() wrinkle = -1;
  /** 'seinen' | 'sports' | 'premium' — mature anime style. */
  @Input() style: 'seinen' | 'sports' | 'premium' = 'sports';

  /**
   * BRAND-NEW EXOTIC SPECIES selector. DEFAULT 'human' keeps every existing face,
   * style and signature byte-for-byte unchanged. When set to 'crystalline' the
   * head / eyes / signature features are drawn by a fully self-contained renderer
   * (drawCrystalline) — NONE of the human draw helpers run, so nothing existing
   * is touched. The backend can later assign this per-player / per-nation / rarity.
   *
   * CRYSTALLINE GEM-GOLEM ("Prismatic"): a faceted living-crystal being.
   *   - HEAD: hard faceted gemstone skull — flat-topped crown, beveled temples,
   *           angular planed cheeks narrowing to a sharp crystalline chin.
   *   - EYES: two GLOWING horizontal SLIT eyes (no sclera/iris), a hard energy line.
   *   - SIGNATURE FEATURES: a large glowing GEM THIRD-EYE on the forehead + a pair
   *           of swept-back CRYSTAL SHARD HORNS, plus internal cel facet planes that
   *           catch light. A faint refraction glow rings the whole head.
   * Colour inputs still drive it: skinTone -> crystal body tint (cool palette band),
   * eyeColor -> gem / slit-eye / facet glow hue, hairColor -> horn crystal tint.
   *
   * SAURIAN REPTILIAN / DRACONIC ("Saurian"): a scaled, fanged lizard-folk being,
   * drawn by a fully self-contained renderer (drawSaurian) — NONE of the human or
   * crystalline helpers run, so everything else stays byte-for-byte unchanged.
   *   - HEAD: a forward-thrusting WEDGE skull — low sloped brow, scaled cheeks
   *           tapering to a fanged SNOUT / lower mandible (a profile-ish muzzle),
   *           clearly different from the round human head, the elongated almond-eyed
   *           Gallactick alien, and the faceted crystal gem-golem.
   *   - EYES: reptile SLIT-PUPIL eyes — a coloured glowing sclera with a hard
   *           VERTICAL black pupil slit (not the crystalline's energy line, not
   *           the alien's big almond eye).
   *   - SIGNATURE FEATURES: a row of dorsal CREST SPIKES along the crown + a
   *           swept-back bony FRILL behind the head, scale-stipple texture, nostril
   *           slits + a fanged jaw.
   * Colour inputs still drive it: skinTone -> scaled HIDE tint (warm/earthy band),
   * eyeColor -> slit-eye sclera glow, hairColor -> crest spike / frill tint.
   *
   * MONUMENT ("Indimenticabili" / "The Eternal"): a LIVING CLASSICAL MONUMENT —
   * a face like an animated Greco-Roman marble & bronze statue (a legend immortalised
   * forever). Drawn by a fully self-contained renderer (drawMonument) — NONE of the
   * human / crystalline / saurian helpers run, so everything else stays byte-for-byte
   * unchanged whenever species !== 'monument'.
   *   - SKIN: smooth carved white-MARBLE or patinated BRONZE statue surface (two
   *           material looks chosen by skinTone), with subtle sculpted plane shading
   *           and a hard carved profile-ish nose ridge — clearly stone, not flesh.
   *   - EYES: blank carved / hollow statue eyes (no iris), softly GLOWING from within
   *           (the legend "still watching") — distinct from the crystalline energy
   *           line and the saurian slit pupil.
   *   - SIGNATURE FEATURES: a GOLDEN LAUREL WREATH crowning the head, fine GOLD-LEAF
   *           crack veins (kintsugi-like) tracing across the face, and a noble timeless
   *           closed-mouth expression. Reads monumental, iconic, "unforgettable".
   * Colour inputs still drive it: skinTone -> material (low = marble/pale, higher =
   * bronze/darker patina), eyeColor -> eye/glow hue, hairColor -> laurel/gold accent
   * tint, baseFaceId -> deterministic silhouette jitter.
   *
   * ROKYKARIO ("Rokykario" — root "Roky" -> ROCK / VOLCANIC): a LIVING VOLCANIC
   * MAGMA-ROCK being, the elemental OPPOSITE of the monument. Drawn by a fully
   * self-contained renderer (drawRokykario) — NONE of the human / crystalline /
   * saurian / monument helpers run, so everything else stays byte-for-byte unchanged
   * whenever species !== 'rokykario'.
   *   - SKIN: jagged cracked BASALT / OBSIDIAN skin — irregular dark rocky PLATES
   *           with sharp angular edges (not the monument's smooth carved marble, not
   *           the crystalline's clean refractive facets) — rough, broken, chaotic.
   *   - LAVA: glowing molten LAVA cracks / veins shot through the plates, with
   *           internal magma GLOW leaking from the seams (a hot core under the crust).
   *   - EYES: smouldering EMBER eyes — a hot glowing molten orb with a bright core
   *           (distinct from the monument's hollow glow, the saurian slit pupil and
   *           the crystalline energy line).
   *   - SIGNATURE FEATURES: a rough CREST of jagged rock SPIKES / shards along the
   *           crown, smoke / ember motes rising, and a cracked molten mouth-seam.
   * Colour inputs still drive it: skinTone -> rock tone (low = dark basalt/obsidian,
   * higher = lighter ash / grey rock), eyeColor -> lava / ember GLOW hue (orange /
   * red / blue-hot / toxic-green), hairColor -> crest / ember accent tint,
   * baseFaceId -> deterministic silhouette + crack-layout jitter.
   *
   * ELEFTAMIDE ("Eleftamide" — root "Eleft-" -> Greek eleftheria/eleutheria =
   * FREEDOM/LIBERTY): a WINGED / AVIAN "free spirit" species embodying flight and
   * freedom. Drawn by a fully self-contained renderer (drawEleftamide) — NONE of the
   * human / crystalline / saurian / monument / rokykario helpers run, so everything
   * stays byte-for-byte unchanged whenever species !== 'eleftamide'.
   *   - FACE: light, airy, aerodynamic AVIAN face — a narrow aquiline head framed by
   *           sleek swept-back FEATHERS (not human skin/hair, crystal facets, saurian
   *           scales, carved marble or jagged magma rock).
   *   - PLUMAGE: small wing-like plumage CRESTS swept back at the brow/temples (folded
   *           wings) + a few floating loose feathers — the DEFINING colour.
   *   - NOSE: a subtle aquiline BEAK-like nose ridge (soft beak, not a fanged snout).
   *   - EYES: keen, bright, far-seeing raptor eyes (large round iris + hot catch-light).
   *   - SIGNATURE: a faint WIND motif (streaming air lines) and drifting feathers.
   * Colour inputs drive it: skinTone -> face/base-plumage tone, eyeColor -> eye hue,
   * hairColor -> feather/plumage crest tint (the DEFINING colour), baseFaceId ->
   * deterministic silhouette + feather-layout jitter.
   */
  // Allowed values: 'human' | 'crystalline' | 'saurian' | 'monument' | 'rokykario' | 'eleftamide'.
  // Typed as string so backend-driven model fields bind cleanly; unknown values fall back to human in dispatch.
  @Input() species: string = 'human';

  /**
   * Per-NATION distinctive facial SIGNATURE (0..7). Layered ON TOP of the normal
   * (still-random) face so a player's nation is instantly recognisable:
   *   0 International → NEUTRAL (no signature)
   *   1 Gallactick    → ALIEN bias (elongated cranium + big almond eyes, cool tint,
   *                     brow-ridge antenna nub) — forced even on a human random shape
   *   2 Dong          → glowing solid-colour eyes + bold tribal cheek stripes
   *   3 Khess         → war-paint visor stripe across the eyes + pointed ears
   *   4 FootieCup     → golden/metallic eye sheen + small forehead emblem dot
   *   5 Cards         → star/hexagon iris-pupil + tiny card-suit mark on a cheek
   *   6 Literature    → small serif letter glyph on forehead + calm narrow eyes
   *   7 Eleven        → "11"/binary forehead mark + cybernetic eye glint
   */
  @Input() nationId = 0;

  /** Per-nation favored structural index subsets (head/brow/hair) — see NATION_STRUCTURE. */
  static readonly NATION_STRUCTURE = NATION_STRUCTURE;

  constructor(private sanitizer: DomSanitizer) {}

  private nationIdx(): number {
    return ((this.nationId % 8) + 8) % 8;
  }

  // ---- PALETTES (0-5 realistic, 6-11 vivid but controlled) ----
  private static readonly SKIN = [
    '#f3d2b3', '#e8b98c', '#d49b6a', '#b07a4e', '#8a5a37', '#603b22',
    '#e6a98f', '#f0c9a0', '#c9b48f', '#a89bc4', '#9fb0c9', '#d3a9b0'
  ];
  private static readonly SKIN_SHADE = [
    '#dcb892', '#cf9d6f', '#bc8351', '#94613b', '#6e4527', '#48290f',
    '#cd8c72', '#d8ab80', '#ab9670', '#8d7ea8', '#8394ad', '#b78b92'
  ];
  private static readonly SKIN_CORE = [
    '#c9a47e', '#bb8a5e', '#a87044', '#7e5230', '#5b3720', '#371e0b',
    '#b6785f', '#c4986d', '#97825d', '#776892', '#6f8098', '#a3787f'
  ];
  private static readonly HAIR = [
    '#15110d', '#3a2a1a', '#6e4a2a', '#c9a24a', '#9a3a1c', '#9aa0ab',
    '#c4304a', '#1f8f6b', '#2f6bbf', '#7a4fbf', '#cf7430', '#2f9fb0'
  ];
  private static readonly HAIR_SHADE = [
    '#000000', '#241608', '#4e3119', '#9a7728', '#6e2410', '#6f757f',
    '#8c1d31', '#0f5f44', '#1c4683', '#522f86', '#9a4d18', '#1c6c78'
  ];
  private static readonly HAIR_HL = [
    '#3a342c', '#5a4329', '#946838', '#ecd072', '#c25a36', '#cfd4dc',
    '#e85c74', '#46c39a', '#5a93dd', '#a37fe0', '#eda05a', '#5ec7d6'
  ];
  private static readonly EYE = ['#4a2e16', '#7a5a22', '#2f7a4a', '#235e96',
    '#7a2f3a', '#3a3f6e', '#2f6e6e', '#5a3a6e'];

  // ---- CRYSTALLINE GEM-GOLEM palettes (cool, faceted, refractive) ----
  // Indexed by skinTone (body crystal), eyeColor (gem/slit glow), hairColor (horns).
  /** crystal body: bright facet / mid plane / deep shadow plane / edge highlight */
  private static readonly XTAL_BODY = [
    { lt: '#bfeaff', md: '#7fc4ee', dk: '#3f78b0', hl: '#eafaff' }, // 0 sapphire-ice
    { lt: '#c8f3e6', md: '#7fd9bf', dk: '#3f9a82', hl: '#ecfff8' }, // 1 emerald-jade
    { lt: '#e6cffb', md: '#b48fe0', dk: '#6f4bb0', hl: '#f7ecff' }, // 2 amethyst
    { lt: '#ffd7e6', md: '#f08fb4', dk: '#b0476e', hl: '#ffecf3' }, // 3 rose-quartz
    { lt: '#ffe9b8', md: '#f0c860', dk: '#b08a1e', hl: '#fff8e0' }, // 4 citrine-gold
    { lt: '#d6dde6', md: '#9aa6b6', dk: '#5a6678', hl: '#f0f3f7' }, // 5 smoky-quartz
    { lt: '#bff6ef', md: '#5fd8d0', dk: '#2f9088', hl: '#eafffd' }, // 6 aquamarine
    { lt: '#ffcdb0', md: '#f0905f', dk: '#b0502a', hl: '#ffeadf' }, // 7 fire-opal
    { lt: '#d4f0ff', md: '#8fc8ee', dk: '#4f86b6', hl: '#ecf9ff' }, // 8 frost
    { lt: '#cfe0ff', md: '#8f9fe0', dk: '#4f5ab0', hl: '#ecf0ff' }, // 9 lapis
    { lt: '#e0ffe6', md: '#8fe0a0', dk: '#4fb060', hl: '#ecffef' }, // 10 peridot
    { lt: '#f3d6ff', md: '#cf8fe6', dk: '#9a4fb0', hl: '#fcecff' }, // 11 spinel
  ];
  /** gem / slit-eye glow core colours (by eyeColor) */
  private static readonly XTAL_GLOW = [
    '#36e0ff', '#7CFC8C', '#c66bff', '#ff6ba6', '#ffd24a', '#bfe6ff',
    '#3affd0', '#ff8a4a', '#5ad0ff', '#6b8aff', '#7CFFA0', '#e07cff'
  ];

  // ---- SAURIAN (reptilian / draconic) palettes (scaly, warm/earthy + jewel slits) ----
  // Indexed by skinTone (scale hide), eyeColor (slit-pupil sclera glow), hairColor (crest/frill).
  /** scaled hide: lit scale / mid plane / deep shadow / scale-edge highlight */
  private static readonly SAUR_HIDE = [
    { lt: '#9bd47a', md: '#5fa047', dk: '#356b2c', hl: '#c4f0a0' }, // 0 forest-scale
    { lt: '#7fd6c0', md: '#3f9a86', dk: '#236155', hl: '#b0f0e4' }, // 1 teal-serpent
    { lt: '#d6b478', md: '#a8823f', dk: '#6b4f1e', hl: '#f0dca0' }, // 2 desert-sand
    { lt: '#d68a6a', md: '#a85230', dk: '#6b2e16', hl: '#f0b294' }, // 3 rust-drake
    { lt: '#9aa6b6', md: '#5f6b7c', dk: '#363f4e', hl: '#c0cbd9' }, // 4 ash-grey
    { lt: '#c69ad6', md: '#8a4fa8', dk: '#56286b', hl: '#e4c0f0' }, // 5 violet-wyrm
    { lt: '#7fb6d6', md: '#3f7aa8', dk: '#23476b', hl: '#b0d8f0' }, // 6 azure-lizard
    { lt: '#d6c47a', md: '#a8963f', dk: '#6b5d1e', hl: '#f0e4a0' }, // 7 olive-croc
    { lt: '#d67a8a', md: '#a83f56', dk: '#6b2333', hl: '#f0b0bf' }, // 8 crimson-naga
    { lt: '#8a9ad6', md: '#4f5fa8', dk: '#28366b', hl: '#b6c0f0' }, // 9 cobalt-skink
    { lt: '#7fd68a', md: '#3fa84f', dk: '#236b28', hl: '#b0f0bf' }, // 10 emerald-basilisk
    { lt: '#d6a07f', md: '#a8603f', dk: '#6b3523', hl: '#f0c4b0' }, // 11 terra-gecko
  ];
  /** slit-pupil sclera / eye glow colours (by eyeColor) */
  private static readonly SAUR_EYE = [
    '#ffd24a', '#9bff5f', '#ff8a3a', '#ff5f6b', '#5fd0ff', '#c66bff',
    '#3affd0', '#ffb03a', '#5fffa0', '#ff6bd0', '#d0ff3a', '#ff9b5f'
  ];

  // ---- MONUMENT ("Indimenticabili" / The Eternal) palettes — carved statue stone ----
  // Indexed by skinTone (material: low = marble/pale, higher = bronze/darker patina),
  // eyeColor (hollow-eye glow), hairColor (laurel / gold-leaf accent tint).
  /** statue material: lit plane / mid plane / deep shadow plane / edge highlight + marble flag */
  private static readonly MON_MAT = [
    { lt: '#f6f2ea', md: '#ddd6c8', dk: '#a89f8c', hl: '#fffdf7', marble: true },  // 0 white marble
    { lt: '#f3ece0', md: '#d8cdb8', dk: '#a0937a', hl: '#fffaf0', marble: true },  // 1 ivory marble
    { lt: '#eee7df', md: '#cfc6ba', dk: '#968d80', hl: '#fbf7f1', marble: true },  // 2 grey marble
    { lt: '#f2e8d2', md: '#d6c79e', dk: '#9c8a5e', hl: '#fdf6e6', marble: true },  // 3 honey alabaster
    { lt: '#ecd9c0', md: '#cdb38c', dk: '#917451', hl: '#f8ecda', marble: true },  // 4 weathered limestone
    { lt: '#e6c9a0', md: '#c79e6c', dk: '#8a6438', hl: '#f2dcbe', marble: false }, // 5 pale bronze
    { lt: '#d8a86a', md: '#b07f40', dk: '#724e1f', hl: '#ecc890', marble: false }, // 6 golden bronze
    { lt: '#c79a52', md: '#9c722e', dk: '#5f4214', hl: '#e2bd78', marble: false }, // 7 antique bronze
    { lt: '#9fb89a', md: '#6f9068', dk: '#3f5c3a', hl: '#c2d6bc', marble: false }, // 8 verdigris patina
    { lt: '#8fb6ac', md: '#5c8a7e', dk: '#345650', hl: '#b6d6cd', marble: false }, // 9 sea-green patina
    { lt: '#b89a86', md: '#8a6b56', dk: '#523c2e', hl: '#d6bca8', marble: false }, // 10 dark bronze
    { lt: '#a8a29a', md: '#7c766c', dk: '#494540', hl: '#cac4ba', marble: false }, // 11 oxidised iron-grey
  ];
  /** hollow-eye inner glow colours (by eyeColor) */
  private static readonly MON_GLOW = [
    '#fff4cf', '#ffe39a', '#cfe9ff', '#bfffe0', '#ffd0e0', '#e6d0ff',
    '#fff0d0', '#d0fff0', '#d6e0ff', '#ffe0c0', '#f0ffd0', '#ffffff'
  ];
  /** laurel / gold-leaf accent tints (by hairColor): leaf / vein-gold / shadow */
  private static readonly MON_GOLD = [
    { leaf: '#d4af37', vein: '#f0d264', dk: '#8a6a18' }, // 0 classic gold
    { leaf: '#e6c200', vein: '#ffe34a', dk: '#9a8200' }, // 1 bright gold
    { leaf: '#c0a060', vein: '#e6cf8c', dk: '#7c6630' }, // 2 pale gold
    { leaf: '#b8860b', vein: '#e0b94a', dk: '#705208' }, // 3 dark goldenrod
    { leaf: '#cd9b4a', vein: '#f0c878', dk: '#82601e', }, // 4 antique gold
    { leaf: '#e8d28a', vein: '#fff2c0', dk: '#9c8444' }, // 5 champagne gold
    { leaf: '#caa84a', vein: '#ecd07a', dk: '#7e6420' }, // 6 olive gold
    { leaf: '#d6b24a', vein: '#f2d278', dk: '#866a1e' }, // 7 honey gold
    { leaf: '#bfa05a', vein: '#e0c888', dk: '#766030' }, // 8 brass
    { leaf: '#e0c050', vein: '#ffe080', dk: '#947c20' }, // 9 amber gold
    { leaf: '#c8b070', vein: '#ecd8a0', dk: '#7c6838' }, // 10 wheat gold
    { leaf: '#d4af37', vein: '#f0d264', dk: '#8a6a18' }, // 11 classic gold (alt)
  ];

  // ---- ROKYKARIO (volcanic magma-rock) palettes — jagged basalt / obsidian crust ----
  // Indexed by skinTone (rock tone: low = dark basalt/obsidian, high = lighter ash/grey),
  // eyeColor (lava/ember glow hue), hairColor (crest / ember accent tint).
  /** rock plate: lit face / mid plane / deep shadow plane / edge highlight */
  private static readonly ROK_ROCK = [
    { lt: '#3a322e', md: '#241e1b', dk: '#120e0c', hl: '#4e433c' }, // 0 black obsidian
    { lt: '#403732', md: '#2a221e', dk: '#15100d', hl: '#564943' }, // 1 dark basalt
    { lt: '#4a403a', md: '#322823', dk: '#1c1512', hl: '#60524a' }, // 2 charcoal basalt
    { lt: '#564a43', md: '#3a2f29', dk: '#221a15', hl: '#6e5d53' }, // 3 dark stone
    { lt: '#62554c', md: '#443830', dk: '#2a201a', hl: '#7c685c' }, // 4 brown basalt
    { lt: '#6e6058', md: '#4e4138', dk: '#322822', hl: '#887468' }, // 5 weathered rock
    { lt: '#7a6b62', md: '#574941', dk: '#3a2e27', hl: '#948076' }, // 6 grey-brown stone
    { lt: '#857770', md: '#605249', dk: '#42352d', hl: '#a08c82' }, // 7 grey stone
    { lt: '#928680', md: '#6c5e55', dk: '#4a3d35', hl: '#ac9a90' }, // 8 ash grey
    { lt: '#9f948e', md: '#766860', dk: '#52453c', hl: '#baa9a0' }, // 9 light ash
    { lt: '#ab9f96', md: '#807168', dk: '#5a4c42', hl: '#c6b6ac' }, // 10 pale ash rock
    { lt: '#b8aaa0', md: '#8a7a70', dk: '#62534a', hl: '#d2c2b8' }, // 11 pumice grey
  ];
  /** molten lava / ember GLOW colours (by eyeColor): bright core / mid vein / deep glow */
  private static readonly ROK_LAVA = [
    { bright: '#fff0a0', mid: '#ff8a1e', dk: '#c43a08' }, // 0 classic orange lava
    { bright: '#ffd060', mid: '#ff6a10', dk: '#b42a04' }, // 1 amber-orange
    { bright: '#ffe070', mid: '#ffb020', dk: '#c46a00' }, // 2 yellow-gold molten
    { bright: '#ffb060', mid: '#ff4a12', dk: '#a81e04' }, // 3 deep orange-red
    { bright: '#ff9a8a', mid: '#ff2a2a', dk: '#9a0808' }, // 4 hot red
    { bright: '#ff8aa0', mid: '#ff1e5a', dk: '#9a0830' }, // 5 magma pink-red
    { bright: '#a0e0ff', mid: '#2aa0ff', dk: '#0850c4' }, // 6 blue-hot
    { bright: '#80ffff', mid: '#20d0ff', dk: '#0888c4' }, // 7 cyan-hot
    { bright: '#c0a0ff', mid: '#7a3aff', dk: '#4a08c4' }, // 8 violet-hot
    { bright: '#a0ff90', mid: '#3aff2a', dk: '#0a9a08' }, // 9 toxic green
    { bright: '#d0ff60', mid: '#9aff10', dk: '#5a9a00' }, // 10 acid lime
    { bright: '#ffffff', mid: '#ffc040', dk: '#d46000' }, // 11 white-hot
  ];
  /** crest spike / ember accent tints (by hairColor): bright / mid / shadow */
  private static readonly ROK_CREST = [
    { bright: '#ff9a3a', mid: '#c4501a', dk: '#5a200a' }, // 0 ember orange
    { bright: '#ffb84a', mid: '#d46a1a', dk: '#6a3008' }, // 1 hot ember
    { bright: '#ff7a2a', mid: '#b03a10', dk: '#4a1606' }, // 2 deep ember
    { bright: '#ff5a3a', mid: '#a82a1a', dk: '#481008' }, // 3 red-hot ember
    { bright: '#ffd060', mid: '#d49a20', dk: '#6a4a08' }, // 4 gold ember
    { bright: '#8a7a72', mid: '#4e413a', dk: '#241c18' }, // 5 cold basalt spikes
    { bright: '#ff6a8a', mid: '#b02a4a', dk: '#4a0820' }, // 6 magma pink
    { bright: '#6ad0ff', mid: '#2080c4', dk: '#08406a' }, // 7 blue ember
    { bright: '#5affff', mid: '#20b0c4', dk: '#08606a' }, // 8 cyan ember
    { bright: '#9a7aff', mid: '#5a2ac4', dk: '#28086a' }, // 9 violet ember
    { bright: '#7aff5a', mid: '#2ac42a', dk: '#086a08' }, // 10 toxic green ember
    { bright: '#ffe0a0', mid: '#d49a4a', dk: '#6a4a1a' }, // 11 ash ember
  ];

  /** ELEFTAMIDE base SKIN / plumage-base tone (by skinTone): light airy avian skin.
   *  lt = lit highlight, md = base, dk = shadow, hl = bright catch-light. */
  private static readonly ELF_SKIN = [
    { lt: '#fbeede', md: '#eed8c0', dk: '#cdb094', hl: '#fff7ee' }, // 0 pale ivory
    { lt: '#f6e2cc', md: '#e6c8a8', dk: '#c2a07e', hl: '#fdf2e2' }, // 1 warm cream
    { lt: '#f0d8c0', md: '#ddba98', dk: '#b6906c', hl: '#faecda' }, // 2 soft tan
    { lt: '#ecceb4', md: '#d4ac88', dk: '#aa825e', hl: '#f7e4cf' }, // 3 light fawn
    { lt: '#e4c0a4', md: '#c89a74', dk: '#9c704e', hl: '#f2dcc6' }, // 4 sand
    { lt: '#d8b094', md: '#ba8862', dk: '#8c6040', hl: '#ead0b8' }, // 5 dusk fawn
    { lt: '#ece6e0', md: '#d6cdc4', dk: '#aaa098', hl: '#f8f4f0' }, // 6 ash-dove grey
    { lt: '#e0dde6', md: '#c6c2cf', dk: '#9a96a4', hl: '#f2f0f6' }, // 7 cool pearl
    { lt: '#dceaec', md: '#bcd2d6', dk: '#8ea6aa', hl: '#eef6f8' }, // 8 sky-tinted
    { lt: '#f4ece2', md: '#e2d4c2', dk: '#b6a48e', hl: '#fcf6ee' }, // 9 fair down
    { lt: '#f8f2ea', md: '#e8ddce', dk: '#bcae9a', hl: '#fffaf3' }, // 10 snow down
    { lt: '#cfe0e8', md: '#aac2ce', dk: '#7c96a2', hl: '#e6f0f4' }, // 11 storm-grey blue
  ];
  /** keen far-seeing EYE iris colours (by eyeColor): bright iris / mid ring / deep rim. */
  private static readonly ELF_EYE = [
    { bright: '#ffe88a', mid: '#f0b020', dk: '#9a6a08' }, // 0 golden eagle
    { bright: '#ffd860', mid: '#e89a18', dk: '#8a5604' }, // 1 amber raptor
    { bright: '#ffb84a', mid: '#e07210', dk: '#8a3e04' }, // 2 falcon orange
    { bright: '#bfe8ff', mid: '#4aa6e8', dk: '#1860a8' }, // 3 sky blue
    { bright: '#a0f0e0', mid: '#28c0a8', dk: '#0a7a68' }, // 4 teal hawk
    { bright: '#c8f0a0', mid: '#7ac838', dk: '#3a7a10' }, // 5 spring green
    { bright: '#ffc0d0', mid: '#f06a92', dk: '#a82a52' }, // 6 dawn rose
    { bright: '#e0c8ff', mid: '#9a6ae8', dk: '#5a28a8' }, // 7 violet sight
    { bright: '#ffffff', mid: '#cfe2f0', dk: '#88a4b8' }, // 8 silver-white
    { bright: '#fff0c0', mid: '#f0d060', dk: '#a89020' }, // 9 pale gold
    { bright: '#d0fff0', mid: '#60e8c8', dk: '#188a70' }, // 10 mint sight
    { bright: '#ffd0a0', mid: '#f09040', dk: '#a85610' }, // 11 sunfire
  ];
  /** PLUMAGE / feather-crest tint (by hairColor) — the DEFINING colour. */
  private static readonly ELF_PLUME = [
    { bright: '#ffffff', mid: '#dfe6ec', dk: '#9fb0bc', tip: '#f4faff' }, // 0 swan white
    { bright: '#e8eef4', mid: '#b8c6d4', dk: '#7c8ea0', tip: '#ffffff' }, // 1 dove grey
    { bright: '#9fd8ff', mid: '#4aa0e8', dk: '#1c5ea8', tip: '#d8f0ff' }, // 2 azure jay
    { bright: '#7ae0e0', mid: '#28b0c0', dk: '#0a6878', tip: '#c8f8f8' }, // 3 teal kingfisher
    { bright: '#9af0b0', mid: '#3ac868', dk: '#0e7a34', tip: '#d8ffe4' }, // 4 emerald wing
    { bright: '#ffe070', mid: '#f0b020', dk: '#9a6a08', tip: '#fff6c8' }, // 5 golden oriole
    { bright: '#ffb060', mid: '#f07a18', dk: '#a84204', tip: '#ffe0b8' }, // 6 amber kite
    { bright: '#ff8a72', mid: '#e84a30', dk: '#a01808', tip: '#ffd0c4' }, // 7 scarlet macaw
    { bright: '#ff9ad0', mid: '#f04a98', dk: '#a81258', tip: '#ffd8ec' }, // 8 flamingo rose
    { bright: '#c8a0ff', mid: '#8a4ae8', dk: '#4a18a8', tip: '#e8d8ff' }, // 9 violet plume
    { bright: '#80ccff', mid: '#3a78d8', dk: '#103a8a', tip: '#cce6ff' }, // 10 cobalt feather
    { bright: '#5a6e82', mid: '#28384a', dk: '#101820', tip: '#7a90a4' }, // 11 raven black
  ];

  // ===================== AQUANIMENTI (deep-sea merfolk) palettes =====================
  /** scaled aquatic SKIN (by skinTone): lt face / md body / dk scale-shadow / hl wet sheen. */
  private static readonly AQUA_SKIN = [
    { lt: '#bfeef0', md: '#7fd2d8', dk: '#3f9aa2', hl: '#e6fbfc' }, // 0 seafoam
    { lt: '#a6e4ea', md: '#5fc2cc', dk: '#2c8a94', hl: '#dcf7fa' }, // 1 aqua
    { lt: '#8fd6e2', md: '#46aebe', dk: '#1f7886', hl: '#d2f2f8' }, // 2 teal
    { lt: '#72c2d6', md: '#2f93a8', dk: '#136274', hl: '#c4ecf4' }, // 3 deep teal
    { lt: '#6fb6cc', md: '#2c80a0', dk: '#11516a', hl: '#bfe6f2' }, // 4 lagoon
    { lt: '#86d0c4', md: '#46a896', dk: '#1f7460', hl: '#cef2ea' }, // 5 jade-aqua
    { lt: '#7ec0c0', md: '#3c9494', dk: '#176262', hl: '#c8ecec' }, // 6 viridian
    { lt: '#9ab8cc', md: '#5a90c0', dk: '#27608e', hl: '#d2e6f6' }, // 7 slate-teal
    { lt: '#6aa8c8', md: '#2a749c', dk: '#0f4a68', hl: '#bce0f0' }, // 8 abyss blue
    { lt: '#a0dcd0', md: '#5cb6a4', dk: '#287e6c', hl: '#d6f4ec' }, // 9 deep-sea green
    { lt: '#d2eef2', md: '#a6d6e0', dk: '#6ea2b0', hl: '#f0fbfd' }, // 10 pale ice
    { lt: '#9cb0d8', md: '#5c70b0', dk: '#2c3e7a', hl: '#d6def0' }, // 11 violet-abyss
  ];
  /** large bioluminescent EYE iris (by eyeColor): bright glow / mid ring / deep rim. */
  private static readonly AQUA_EYE = [
    { bright: '#a8fff4', mid: '#28d8c4', dk: '#0a7a70' }, // 0 cyan glow
    { bright: '#88f0ff', mid: '#1eb0d8', dk: '#0a607a' }, // 1 aqua light
    { bright: '#b8ffe0', mid: '#2ce0a0', dk: '#0a8050' }, // 2 biolum green
    { bright: '#fff0a0', mid: '#f0c020', dk: '#9a7a08' }, // 3 lantern gold
    { bright: '#ffc8a0', mid: '#f08040', dk: '#a04a10' }, // 4 anglerfish amber
    { bright: '#e0c0ff', mid: '#9a5ce8', dk: '#5a20a8' }, // 5 violet glow
    { bright: '#ffb0d8', mid: '#f04a98', dk: '#a01258' }, // 6 rose pulse
    { bright: '#e8feff', mid: '#9cdce8', dk: '#5a8a98' }, // 7 pearl-white
    { bright: '#c0ffe8', mid: '#48e0b0', dk: '#108060' }, // 8 mint biolum
    { bright: '#a0d8ff', mid: '#3a86e8', dk: '#0f4aa0' }, // 9 azure glow
    { bright: '#ffd0ff', mid: '#e060e0', dk: '#902090' }, // 10 magenta glow
    { bright: '#d8fff0', mid: '#70e8c0', dk: '#1c8a64' }, // 11 spring abyss
  ];
  /** translucent FIN / dorsal-crest membrane tint (by hairColor) — the DEFINING colour. */
  private static readonly AQUA_FIN = [
    { bright: '#cfeff4', mid: '#6fbcc8', dk: '#2a7a88', edge: '#eafafd' }, // 0 pale teal
    { bright: '#aee6ef', mid: '#4aa6c0', dk: '#1c6a86', edge: '#dcf4fa' }, // 1 aqua
    { bright: '#9ad8e8', mid: '#3a8ec0', dk: '#125a8a', edge: '#cceaf6' }, // 2 azure
    { bright: '#8ee6d2', mid: '#2eb696', dk: '#0e7660', edge: '#c8f4ea' }, // 3 jade
    { bright: '#a6f0b8', mid: '#3cc868', dk: '#0e7a38', edge: '#d6ffe2' }, // 4 kelp green
    { bright: '#ffe88a', mid: '#f0c030', dk: '#9a7a10', edge: '#fff6c8' }, // 5 lantern gold
    { bright: '#ffb878', mid: '#f08030', dk: '#a04810', edge: '#ffe0c0' }, // 6 amber fin
    { bright: '#ff9aa8', mid: '#e84a60', dk: '#a01830', edge: '#ffd0d8' }, // 7 coral red
    { bright: '#ffa6e0', mid: '#f04ab0', dk: '#a01270', edge: '#ffd8f2' }, // 8 magenta fin
    { bright: '#c8a8ff', mid: '#8a4ae8', dk: '#4a18a8', edge: '#e8d8ff' }, // 9 violet fin
    { bright: '#8cc8ff', mid: '#3a78e0', dk: '#103a90', edge: '#cce4ff' }, // 10 cobalt fin
    { bright: '#7fe8e0', mid: '#28b0b0', dk: '#0a6a6a', edge: '#caf6f4' }, // 11 deep cyan
  ];

  private pick(arr: string[], i: number): string {
    return arr[(((i % arr.length) + arr.length) % arr.length)];
  }

  /** Rendered SVG inner markup, sanitised once per change. */
  get innerSvg(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.buildInner());
  }

  private ink(): string {
    return this.style === 'sports' ? '#1a1620' : (this.style === 'premium' ? '#2a2530' : '#211b22');
  }
  private inkW(): number {
    return this.style === 'sports' ? 1.7 : (this.style === 'premium' ? 1.2 : 1.5);
  }

  // -------- HEAD GEOMETRY (mature MALE + GALACTIK ALIEN + EXAGGERATED forms) --------
  // 18 DISTINCT head silhouettes. 0-4 grounded masculine (as approved), 5-9 are
  // "Galactik Football"-style humanoid-alien skulls, 10-15 are EXAGGERATED
  // parametric silhouettes; 16-17 are HAND-BUILT lunar/onion outlines (Literature):
  //   0 SQUARE/BROAD     — wide cranium, full cheek, wide blunt chin (classic strong)
  //   1 LONG/OVAL        — narrower, taller face, longer mild taper, softer chin
  //   2 ANGULAR/DIAMOND  — narrow cranium, very wide cheekbone, tapered firm chin
  //   3 WIDE-CHEEK       — broad cheek + heavy wide jaw, short face (bruiser)
  //   4 NARROW-TALL      — slim cranium, modest cheek, long narrow jaw, blunt chin
  //   5 ELONGATED-TALL   — very tall raised cranium, slim, long pointed-ish chin (alien)
  //   6 ANGULAR-ALIEN    — sharp narrow skull, hyper-wide cheekbone, knife-tapered chin
  //   7 DIAMOND-ALIEN    — extreme diamond, tiny crown, huge cheek, very pointed chin
  //   8 NARROW-TAPERED   — extremely slim cranium, long face, sharply tapered chin
  //   9 BROAD-CRANIUM    — oversized bulbous cranium, wide temple, small tapered jaw (alien)
  //  10 CRESCENT/MOON    — strongly curved cranium + receding pulled-back chin (lunar)
  //  11 SEMICIRCLE/DOME  — flat-topped dome cranium, very rounded, full short jaw
  //  12 HEART/TEARDROP   — wide forehead/temple, sharply narrowing to a small point chin
  //  13 VERY-TALL        — extreme vertical face, raised crown, long straight jaw
  //  14 VERY-WIDE        — squat extra-wide cranium + cheek, short stout face
  //  15 HEXAGONAL/ANGULAR— hard angular hexagon: flat temples, hard cheek, flat wide chin
  //  16 STRONG CRESCENT  — hand-built lunar profile: big rounded cranium arc + jutting chin
  //  17 ONION/DOMED-BULB — hand-built bulbous dome swelling past temples to a small chin
  private geom() {
    const b = ((this.baseFaceId % 18) + 18) % 18;
    let shape = this.faceShape >= 0 ? (((this.faceShape % 18) + 18) % 18) : b;
    // Gallactick (nation 1) FORCES an elongated alien cranium even on a human roll.
    // (the alien skull family is indices 5-9; any non-alien roll snaps into it).
    if (this.nationIdx() === 1 && (shape < 5 || shape > 9)) shape = 5 + (shape % 2 === 0 ? 0 : 4); // 5 ELONGATED-TALL or 9 BROAD-CRANIUM
    // base sliver of within-shape jitter so faces sharing a shape differ a touch
    const j = (b % 2);
    let rx: number, jaw: number, jawW: number, cheek: number, crown: number, taper: number, chinBlunt: number, topY: number;
    let special = 0;
    const baseTopY = this.style === 'premium' ? 21 : 20;
    topY = baseTopY;
    switch (shape) {
      case 1: // LONG / OVAL
        rx = 27 + j * 0.6; jaw = 80 + j; jawW = 15.5 + j * 0.4;
        cheek = 0.9; crown = 1.0; taper = 1.04; chinBlunt = 0.6;
        break;
      case 2: // ANGULAR / DIAMOND (wide cheekbone, tapered chin)
        rx = 27.5 + j * 0.5; jaw = 78 + j; jawW = 14.5 + j * 0.4;
        cheek = 1.12; crown = 0.92; taper = 1.12; chinBlunt = 0.5;
        break;
      case 3: // WIDE-CHEEK BRUISER (broad, short, heavy jaw)
        rx = 30.5 + j * 0.6; jaw = 76 + j; jawW = 19 + j * 0.5;
        cheek = 1.08; crown = 1.04; taper = 0.95; chinBlunt = 0.8;
        break;
      case 4: // NARROW-TALL (slim, long, blunt chin)
        rx = 26 + j * 0.5; jaw = 81 + j; jawW = 15 + j * 0.4;
        cheek = 0.86; crown = 0.95; taper = 1.0; chinBlunt = 0.78;
        break;
      case 5: // ELONGATED-TALL ALIEN (tall raised cranium, long slim face)
        rx = 25 + j * 0.4; jaw = 84 + j; jawW = 13.5 + j * 0.3;
        cheek = 0.84; crown = 0.96; taper = 1.16; chinBlunt = 0.42; topY = baseTopY - 5;
        break;
      case 6: // ANGULAR-ALIEN (knife skull, hyper-wide cheek, tapered chin)
        rx = 25.5 + j * 0.4; jaw = 82 + j; jawW = 12.5 + j * 0.3;
        cheek = 1.28; crown = 0.82; taper = 1.34; chinBlunt = 0.34; topY = baseTopY - 2;
        break;
      case 7: // DIAMOND-ALIEN (tiny crown, huge cheek, very pointed chin)
        rx = 24 + j * 0.4; jaw = 83 + j; jawW = 11 + j * 0.3;
        cheek = 1.42; crown = 0.74; taper = 1.5; chinBlunt = 0.26; topY = baseTopY - 1;
        break;
      case 8: // NARROW-TAPERED ALIEN (very slim, long, sharply tapered chin)
        rx = 22.5 + j * 0.4; jaw = 85 + j; jawW = 11.5 + j * 0.3;
        cheek = 0.92; crown = 0.86; taper = 1.42; chinBlunt = 0.3; topY = baseTopY - 4;
        break;
      case 9: // BROAD-CRANIUM ALIEN (bulbous big skull, small tapered jaw)
        rx = 33 + j * 0.5; jaw = 80 + j; jawW = 12.5 + j * 0.3;
        cheek = 0.92; crown = 1.18; taper = 1.4; chinBlunt = 0.38; topY = baseTopY - 3;
        break;
      case 10: // CRESCENT / MOON (curved cranium + receding small chin)
        rx = 28 + j * 0.5; jaw = 79 + j; jawW = 13 + j * 0.3;
        cheek = 1.06; crown = 1.06; taper = 1.28; chinBlunt = 0.34; topY = baseTopY - 2;
        break;
      case 11: // SEMICIRCLE / DOME (flat-topped rounded dome, full short jaw)
        rx = 31 + j * 0.5; jaw = 75 + j; jawW = 18 + j * 0.4;
        cheek = 1.04; crown = 1.1; taper = 0.92; chinBlunt = 0.9; topY = baseTopY + 1;
        break;
      case 12: // HEART / TEARDROP (wide temple, sharp narrowing to point chin)
        rx = 31 + j * 0.5; jaw = 81 + j; jawW = 10.5 + j * 0.3;
        cheek = 1.14; crown = 1.08; taper = 1.46; chinBlunt = 0.24;
        break;
      case 13: // VERY-TALL (extreme vertical face, long straight jaw)
        rx = 26.5 + j * 0.4; jaw = 86 + j; jawW = 15.5 + j * 0.4;
        cheek = 0.92; crown = 0.98; taper = 1.02; chinBlunt = 0.7; topY = baseTopY - 4;
        break;
      case 14: // VERY-WIDE (squat extra-wide cranium + cheek, short stout face)
        rx = 34 + j * 0.6; jaw = 74 + j; jawW = 21 + j * 0.5;
        cheek = 1.06; crown = 1.06; taper = 0.9; chinBlunt = 0.86; topY = baseTopY + 1;
        break;
      case 15: // HEXAGONAL / ANGULAR (flat temples, hard cheek, flat wide chin)
        rx = 29 + j * 0.5; jaw = 78 + j; jawW = 17.5 + j * 0.4;
        cheek = 1.2; crown = 0.9; taper = 1.0; chinBlunt = 0.92;
        break;
      case 16: // STRONG CRESCENT-MOON (hand-built lunar profile: big rounded cranium
               // arc sweeping to a pronounced jutting chin — unmistakable moon outline)
        rx = 28 + j * 0.5; jaw = 80 + j; jawW = 12 + j * 0.3;
        cheek = 1.05; crown = 1.08; taper = 1.3; chinBlunt = 0.3; topY = baseTopY - 3;
        special = 1;
        break;
      case 17: // ONION / DOMED-BULB (hand-built: bulbous wide-shouldered dome cranium
               // swelling out above the temples, tucking to a small rounded chin)
        rx = 31 + j * 0.5; jaw = 76 + j; jawW = 13 + j * 0.3;
        cheek = 1.0; crown = 1.16; taper = 1.18; chinBlunt = 0.5; topY = baseTopY - 1;
        special = 2;
        break;
      default: // 0 SQUARE / BROAD (classic strong)
        rx = 30 + j * 0.7; jaw = 78 + j; jawW = 18.5 + j * 0.5;
        cheek = 1.0; crown = 1.0; taper = 0.97; chinBlunt = 0.82;
        break;
    }
    return { rx, jaw, jawW, cheek, crown, taper, chinBlunt, topY, special };
  }

  private headPath(g: Geom): string {
    const cw = g.rx * g.crown;                // cranium half-width (varies head/skull width)
    const L = 50 - cw, R = 50 + cw;
    const topY = g.topY;
    const cbY = 54, cbX = g.rx * g.cheek;
    const chinY = g.jaw, chinW = g.jawW;
    // ---- HAND-BUILT EXAGGERATED SILHOUETTES (Literature) ----
    if (g.special === 1) {
      // STRONG CRESCENT-MOON — a big circular cranium arc on the left swinging round
      // to a pronounced forward-jutting chin: the classic side-lit "moon man" profile.
      const chinX = 50 + chinW * 1.05;          // chin pushed forward (to the right)
      return (
        `M 50 ${topY} ` +
        // right cranium: tighter, pulled in (the "lit" inner edge of the crescent)
        `C ${R - 3} ${topY} ${50 + cbX * 0.78} ${cbY - 18} ${50 + cbX * 0.74} ${cbY} ` +
        `C ${50 + cbX * 0.78} ${cbY + 11} ${50 + chinW * 1.1} ${chinY - 9} ${chinX} ${chinY - 2} ` +
        // jutting rounded chin
        `C ${chinX} ${chinY + 4} ${50 + chinW * 0.35} ${chinY + 5} 50 ${chinY + 4.5} ` +
        `C ${50 - chinW * 0.8} ${chinY + 4} ${50 - chinW * 1.15} ${chinY + 1} ${50 - chinW} ${chinY - 5} ` +
        // left cheek pulls up into the big bulging lunar cranium
        `C ${50 - cbX * 1.18} ${chinY - 12} ${50 - cbX * 1.34} ${cbY + 6} ${50 - cbX * 1.3} ${cbY} ` +
        `C ${50 - cbX * 1.3} ${cbY - 22} ${L - 4} ${topY - 4} 50 ${topY} Z`
      );
    }
    if (g.special === 2) {
      // ONION / DOMED-BULB — cranium swells OUT past the temples into a bulbous dome,
      // then tucks sharply inward to a small rounded chin (onion-bulb outline).
      const bulgeX = cbX * 1.34, bulgeY = cbY - 6;
      const chinX = 50 + chinW;
      return (
        `M 50 ${topY} ` +
        `C ${R + 5} ${topY - 1} ${50 + bulgeX} ${topY + 6} ${50 + bulgeX} ${bulgeY} ` +     // swell out right
        `C ${50 + bulgeX} ${cbY + 7} ${50 + chinW * 1.25} ${chinY - 8} ${chinX} ${chinY - 3} ` + // tuck to jaw
        `C ${chinX} ${chinY + 2} ${50 + chinW * 0.5} ${chinY + 4} 50 ${chinY + 4.2} ` +         // small chin
        `C ${50 - chinW * 0.5} ${chinY + 4} ${50 - chinW} ${chinY + 2} ${50 - chinW} ${chinY - 3} ` +
        `C ${50 - chinW * 1.25} ${chinY - 8} ${50 - bulgeX} ${cbY + 7} ${50 - bulgeX} ${bulgeY} ` +
        `C ${50 - bulgeX} ${topY + 6} ${L - 5} ${topY - 1} 50 ${topY} Z`
      );
    }
    // taper drives cheek->jaw narrowing: <1 keeps jaw wide/square, >1 tapers toward chin.
    const jawPull = (this.style === 'sports' ? 0.97 : (this.style === 'premium' ? 1.02 : 0.99)) * g.taper;
    const jx = chinW / jawPull;
    // chinBlunt: high => wide flat chin, low => narrower tapered chin.
    const cb = g.chinBlunt;
    return (
      `M 50 ${topY} ` +
      `C ${R} ${topY} ${R + 1} ${cbY - 16} ${50 + cbX} ${cbY} ` +
      `C ${50 + cbX} ${cbY + 9} ${50 + jx} ${chinY - 7} ${50 + chinW} ${chinY - 4} ` +
      `C ${50 + chinW} ${chinY + 1.5} ${50 + chinW * cb} ${chinY + 3} 50 ${chinY + 3.2} ` +
      `C ${50 - chinW * cb} ${chinY + 3} ${50 - chinW} ${chinY + 1.5} ${50 - chinW} ${chinY - 4} ` +
      `C ${50 - jx} ${chinY - 7} ${50 - cbX} ${cbY + 9} ${50 - cbX} ${cbY} ` +
      `C ${L - 1} ${cbY - 16} ${L} ${topY} 50 ${topY} Z`
    );
  }

  private faceShadowPath(g: Geom): string {
    const cbX = g.rx * g.cheek, chinW = g.jawW, chinY = g.jaw;
    return (
      `M 53 ${chinY - 30} ` +
      `C ${50 + cbX * 0.55} ${chinY - 32} ${50 + cbX} 52 ${50 + cbX} 56 ` +
      `C ${50 + cbX} ${chinY - 11} ${50 + chinW * 1.1} ${chinY - 7} ${50 + chinW * 0.6} ${chinY - 2} ` +
      `C 56 ${chinY - 6} 54 ${chinY - 16} 53 ${chinY - 30} Z`
    );
  }

  // -------- HAIR: 20 DISTINCT SILHOUETTES --------
  //   0-9   realistic (short/swept/spiky/undercut/messy/curtains/ponytail/wavy/slick/long)
  //   10-13 fringe / buzz-line / top-knot / afro
  //   14-19 EXOTIC / GALACTIK-ALIEN: mohawk-crest / long-spikes / twin-tails /
  //         slicked-exotic-fin / bald-with-ridge / horn-spikes
  private hair(g: Geom):
      { back: string; front: string; part: string } {
    const idx = ((this.hairStyle % 20) + 20) % 20;
    const L = 50 - g.rx, R = 50 + g.rx;
    const browY = 47;
    const sharp = this.style === 'sports';
    switch (idx) {
      case 0: // SHORT NEAT crop
        return {
          back: '',
          front: `M ${L - 2} 50 C ${L - 3} ${browY - 24} ${L + 4} 17 50 16 C ${R - 4} 17 ${R + 3} ${browY - 24} ${R + 2} 50 ` +
                 `C ${R - 2} 40 ${R - 6} 33 ${R - 11} 34 C ${R - 14} 28 56 26 50 27 C 44 26 ${L + 14} 28 ${L + 11} 34 ` +
                 `C ${L + 6} 33 ${L + 2} 40 ${L - 2} 50 Z`,
          part: `M 50 18 L 47 33`
        };
      case 1: // SWEPT side part
        return {
          back: '',
          front: `M ${L - 3} 52 C ${L - 4} 18 30 12 ${R} 16 C ${R + 4} 26 ${R + 3} 40 ${R + 1} 52 ` +
                 `C ${R - 3} 38 ${R - 9} 33 ${R - 16} 35 C ${R - 22} 26 40 24 ${L + 6} 32 ` +
                 `C ${L + 2} 36 ${L - 1} 44 ${L - 3} 52 Z`,
          part: ''
        };
      case 2: { // CONTROLLED SPIKES
        const tip = sharp ? 15 : 18;
        return {
          back: '',
          front: `M ${L - 1} 50 ` +
                 `C ${L - 2} 34 ${L} 30 ${L + 3} 30 ` +
                 `L ${L + 6} ${tip + 4} L ${L + 10} 29 L ${L + 14} ${tip + 1} L 50 28 ` +
                 `L 50 ${tip} L ${R - 14} 28 L ${R - 14} ${tip + 1} L ${R - 10} 29 ` +
                 `L ${R - 6} ${tip + 4} L ${R - 3} 30 C ${R} 30 ${R + 2} 34 ${R + 1} 50 ` +
                 `C ${R - 4} 40 56 33 50 33 C 44 33 ${L + 4} 40 ${L - 1} 50 Z`,
          part: ''
        };
      }
      case 3: // UNDERCUT
        return {
          back: '',
          front: `M ${L + 5} 50 C ${L + 3} 30 ${L + 2} 18 50 16 C ${R - 2} 18 ${R - 3} 30 ${R - 5} 50 ` +
                 `C ${R - 7} 40 ${R - 10} 34 ${R - 13} 35 C ${R - 18} 26 42 24 ${L + 12} 33 ` +
                 `C ${L + 9} 35 ${L + 7} 40 ${L + 5} 50 Z`,
          part: `M ${R - 5} 22 L ${R - 9} 40`
        };
      case 4: // MESSY LAYERED
        return {
          back: '',
          front: `M ${L - 2} 52 C ${L - 4} 22 ${L + 6} 14 50 15 C ${R - 6} 14 ${R + 4} 22 ${R + 2} 52 ` +
                 `L ${R - 4} 40 L ${R - 8} 47 L ${R - 13} 36 L ${R - 18} 45 L 53 35 L 50 44 L 47 35 ` +
                 `L ${L + 18} 45 L ${L + 13} 36 L ${L + 8} 47 L ${L + 4} 40 L ${L - 2} 52 Z`,
          part: ''
        };
      case 5: // CURTAINS / centre part
        return {
          back: '',
          front: `M ${L - 2} 54 C ${L - 3} 20 28 13 50 16 C 72 13 ${R + 3} 20 ${R + 2} 54 ` +
                 `C ${R - 2} 40 ${R - 8} 32 56 30 C 53 38 51 40 50 40 C 49 40 47 38 44 30 ` +
                 `C ${L + 8} 32 ${L + 2} 40 ${L - 2} 54 Z`,
          part: `M 50 17 L 50 30`
        };
      case 6: // PONYTAIL / tied back
        return {
          back: `M ${R - 6} 40 C ${R + 8} 44 ${R + 12} 64 ${R + 6} 84 C ${R + 2} 76 ${R - 1} 64 ${R - 4} 56 Z`,
          front: `M ${L - 1} 48 C ${L - 2} 22 ${L + 6} 14 50 15 C ${R - 6} 14 ${R + 2} 24 ${R + 1} 48 ` +
                 `C ${R - 3} 36 ${R - 9} 31 ${R - 14} 33 C ${R - 19} 26 42 25 ${L + 8} 31 ` +
                 `C ${L + 3} 35 ${L} 40 ${L - 1} 48 Z`,
          part: `M ${L + 10} 18 C 30 22 ${R - 8} 22 ${R - 2} 30`
        };
      case 7: // WAVY medium
        return {
          back: `M ${L} 44 C ${L - 6} 60 ${L - 3} 72 ${L + 3} 78 C ${L + 1} 66 ${L + 2} 56 ${L + 4} 50 Z ` +
                `M ${R} 44 C ${R + 6} 60 ${R + 3} 72 ${R - 3} 78 C ${R - 1} 66 ${R - 2} 56 ${R - 4} 50 Z`,
          front: `M ${L - 3} 56 C ${L - 5} 22 30 14 50 15 C 70 14 ${R + 5} 22 ${R + 3} 56 ` +
                 `C ${R - 1} 44 ${R - 5} 36 ${R - 11} 36 C ${R - 14} 30 56 28 50 29 C 44 28 ${L + 14} 30 ${L + 11} 36 ` +
                 `C ${L + 5} 36 ${L + 1} 44 ${L - 3} 56 Z`,
          part: `M 49 18 C 40 24 ${L + 6} 30 ${L + 4} 40`
        };
      case 8: // SLICKED-BACK / pompadour
        return {
          back: '',
          front: `M ${L} 50 C ${L - 2} 28 ${L + 2} 14 50 12 C ${R - 4} 11 ${R + 4} 18 ${R + 1} 50 ` +
                 `C ${R - 3} 40 ${R - 8} 34 ${R - 12} 35 C ${R - 14} 30 ${R - 20} 26 ${L + 16} 26 ` +
                 `C ${L + 10} 26 ${L + 4} 30 ${L} 50 Z`,
          part: `M ${L + 6} 26 C 40 20 60 20 ${R - 8} 28`
        };
      case 9: // LONG STRAIGHT, asymmetric bangs
        return {
          back: `M ${L - 4} 40 C ${L - 8} 64 ${L - 6} 82 ${L - 1} 88 C ${L} 70 ${L + 1} 56 ${L + 3} 50 Z ` +
                `M ${R + 4} 40 C ${R + 8} 64 ${R + 6} 82 ${R + 1} 88 C ${R} 70 ${R - 1} 56 ${R - 3} 50 Z`,
          front: `M ${L - 4} 58 C ${L - 6} 20 32 12 50 14 C 70 12 ${R + 6} 20 ${R + 4} 58 ` +
                 `C ${R - 1} 42 ${R - 6} 34 ${R - 12} 35 C ${R - 16} 28 54 26 46 28 ` +
                 `C ${L + 14} 30 ${L + 6} 40 ${L + 3} 50 C ${L + 1} 53 ${L - 2} 54 ${L - 4} 58 Z`,
          part: `M 44 16 L 40 40`
        };
      case 10: // FRINGE / CENTRE-PART LONG (straight curtain bangs, longer sides)
        return {
          back: `M ${L - 3} 42 C ${L - 7} 62 ${L - 5} 78 ${L} 84 C ${L + 1} 68 ${L + 2} 56 ${L + 4} 50 Z ` +
                `M ${R + 3} 42 C ${R + 7} 62 ${R + 5} 78 ${R} 84 C ${R - 1} 68 ${R - 2} 56 ${R - 4} 50 Z`,
          front: `M ${L - 3} 55 C ${L - 5} 20 30 13 50 15 C 70 13 ${R + 5} 20 ${R + 3} 55 ` +
                 `C ${R - 1} 42 ${R - 6} 33 56 31 C 53.5 38 51.5 41 50 41 C 48.5 41 46.5 38 44 31 ` +
                 `C ${L + 6} 33 ${L + 1} 42 ${L - 3} 55 Z`,
          part: `M 50 16 L 50 32`
        };
      case 11: // BUZZ-WITH-LINE (very short crop, hard hairline + shaved part line)
        return {
          back: '',
          front: `M ${L + 1} 46 C ${L} 33 ${L + 3} 25 50 24 C ${R - 3} 25 ${R} 33 ${R - 1} 46 ` +
                 `C ${R - 3} 40 ${R - 7} 36 ${R - 11} 36.5 C ${R - 14} 31 56 30 50 30.5 ` +
                 `C 44 30 ${L + 14} 31 ${L + 11} 36.5 C ${L + 7} 36 ${L + 3} 40 ${L + 1} 46 Z`,
          part: `M ${L + 8} 27 L ${L + 11} 45`
        };
      case 12: // TOP-KNOT / man-bun (tied knot above crown + shaved-ish sides)
        return {
          back: `M 46 16 C 42 9 58 9 54 16 C 57 18 57 23 53 24 C 51 25 49 25 47 24 C 43 23 43 18 46 16 Z`,
          front: `M ${L + 4} 47 C ${L + 2} 32 ${L + 3} 21 50 19 C ${R - 3} 21 ${R - 2} 32 ${R - 4} 47 ` +
                 `C ${R - 6} 40 ${R - 9} 36 ${R - 12} 36.5 C ${R - 16} 28 44 26 ${L + 12} 33 ` +
                 `C ${L + 9} 36 ${L + 6} 40 ${L + 4} 47 Z`,
          part: `M 50 20 C 44 22 56 22 50 30`
        };
      case 13: // AFRO / CURLY VOLUME (big rounded scalloped mass)
        return {
          back: '',
          front: `M ${L - 5} 48 ` +
                 `C ${L - 9} 30 ${L - 4} 16 ${L + 4} 13 ` +
                 `C ${L + 8} 7 60 7 ${R - 4} 13 ` +
                 `C ${R + 4} 16 ${R + 9} 30 ${R + 5} 48 ` +
                 `C ${R + 1} 41 ${R - 4} 37 ${R - 9} 38 ` +
                 `C ${R - 12} 33 ${R - 16} 31 56 31.5 ` +
                 `C 53 27 47 27 44 31.5 ` +
                 `C ${L + 16} 31 ${L + 12} 33 ${L + 9} 38 ` +
                 `C ${L + 4} 37 ${L - 1} 41 ${L - 5} 48 Z`,
          part: ''
        };
      case 14: // MOHAWK / CREST — shaved sides, a tall central fin running back
        return {
          back: '',
          front: `M 46 50 C 45 38 45 30 46 24 ` +
                 `L 47.5 12 L 49 22 L 50 8 L 51 22 L 52.5 12 L 54 24 ` +
                 `C 55 30 55 38 54 50 ` +
                 `C 53 40 52 35 50 35 C 48 35 47 40 46 50 Z`,
          part: ''
        };
      case 15: { // LONG SPIKES — dramatic tall jagged spikes fanning out (alien)
        const t = sharp ? 4 : 6;
        return {
          back: `M ${L - 2} 44 C ${L - 8} 60 ${L - 5} 76 ${L} 82 C ${L + 1} 66 ${L + 2} 54 ${L + 4} 48 Z ` +
                `M ${R + 2} 44 C ${R + 8} 60 ${R + 5} 76 ${R} 82 C ${R - 1} 66 ${R - 2} 54 ${R - 4} 48 Z`,
          front: `M ${L - 2} 50 ` +
                 `L ${L - 4} ${t + 4} L ${L + 4} 26 L ${L + 7} ${t} L ${L + 13} 24 L ${L + 17} ${t - 2} ` +
                 `L 50 22 L 50 ${t - 4} L ${R - 17} 22 L ${R - 17} ${t - 2} L ${R - 13} 24 ` +
                 `L ${R - 7} ${t} L ${R - 4} 26 L ${R + 4} ${t + 4} L ${R + 2} 50 ` +
                 `C ${R - 4} 40 56 34 50 34 C 44 34 ${L + 4} 40 ${L - 2} 50 Z`,
          part: ''
        };
      }
      case 16: // TWIN TAILS — two side bunches hanging down + neat front
        return {
          back: `M ${L - 4} 42 C ${L - 12} 50 ${L - 11} 70 ${L - 5} 86 C ${L - 1} 72 ${L} 56 ${L + 3} 48 Z ` +
                `M ${R + 4} 42 C ${R + 12} 50 ${R + 11} 70 ${R + 5} 86 C ${R + 1} 72 ${R} 56 ${R - 3} 48 Z`,
          front: `M ${L - 2} 48 C ${L - 3} 22 ${L + 6} 14 50 15 C ${R - 6} 14 ${R + 3} 22 ${R + 2} 48 ` +
                 `C ${R - 2} 38 ${R - 8} 32 ${R - 12} 33 C ${R - 16} 27 44 26 ${L + 12} 33 ` +
                 `C ${L + 8} 32 ${L + 2} 38 ${L - 2} 48 Z`,
          part: `M 50 16 L 50 30`
        };
      case 17: // SLICKED EXOTIC FIN — sleek swept-back with a raised crest ridge
        return {
          back: '',
          front: `M ${L} 50 C ${L - 2} 26 ${L + 2} 12 50 9 ` +
                 `L 51 4 L 53 11 ` +
                 `C ${R - 2} 12 ${R + 4} 20 ${R + 1} 50 ` +
                 `C ${R - 3} 40 ${R - 8} 34 ${R - 12} 35 C ${R - 16} 28 ${R - 22} 25 ${L + 14} 25 ` +
                 `C ${L + 8} 25 ${L + 3} 30 ${L} 50 Z`,
          part: `M ${L + 6} 24 C 42 16 60 16 ${R - 8} 26`
        };
      case 18: // BALD WITH RIDGE — hairless dome + a raised central skull ridge (alien)
        return {
          back: '',
          front: `M 47 36 C 46.5 28 47.5 18 50 12 C 52.5 18 53.5 28 53 36 ` +
                 `C 52 30 51 27 50 27 C 49 27 48 30 47 36 Z`,
          part: ''
        };
      default: // 19 = HORN-SPIKES — two swept-back horn-like spikes + tight cap
        return {
          back: '',
          front: `M ${L + 2} 48 ` +
                 `C ${L} 30 ${L + 2} 20 ${L + 6} 18 ` +
                 `L ${L - 1} 6 L ${L + 12} 16 ` +
                 `C ${L + 16} 14 ${R - 16} 14 ${R - 12} 16 ` +
                 `L ${R + 1} 6 L ${R - 6} 18 ` +
                 `C ${R - 2} 20 ${R} 30 ${R - 2} 48 ` +
                 `C ${R - 5} 38 56 33 50 33 C 44 33 ${L + 5} 38 ${L + 2} 48 Z`,
          part: ''
        };
    }
  }

  // -------- EYES (masculine: flat almond, hard upper lid, small low iris, no
  //          sparkle, no lashes). 5 DISTINCT but still-MASCULINE eye SHAPES
  //          selected by (baseFaceId+1) % 5 — only the lid geometry varies, the
  //          hard narrow gender-neutral-no-lashes treatment stays constant:
  //   0 STRAIGHT ALMOND — near-flat upper lid, level corners (calm, default)
  //   1 DOWN-SLANTED     — outer corner pulled further DOWN (stern/weary)
  //   2 UP-SLANTED       — outer corner lifts UP (sharp/aggressive)
  //   3 HOODED           — heavy lid pushes top edge down, less sclera (brooding)
  //   4 DEEP-SET NARROW  — shorter + flatter, slightly raised, recessed (intense)
  private eyeShapeIdx(): number {
    const n = this.nationIdx();
    let v = this.eyeShape >= 0 ? ((this.eyeShape % 10) + 10) % 10 : ((((this.baseFaceId + 1) % 5) + 5) % 5);
    // Gallactick (1) FORCES a big almond / wide-set alien eye look.
    if (n === 1 && v < 5) v = 5;
    // Literature (6) prefers calm narrow eyes (deep-set / slit).
    if (n === 6) v = (v % 2 === 0) ? 4 : 7;
    return v;
  }
  private eyeGroup(eyeHex: string, uid: string): string {
    const sports = this.style === 'sports', premium = this.style === 'premium';
    const seinen = this.style === 'seinen';
    const shape = this.eyeShapeIdx();
    // Shorter + more horizontal than before (height cut harder than width).
    const cyL = 56.8, cxL = 39.5, cxR = 60.5;
    let ew = sports ? 5.8 : (premium ? 5.3 : 5.5);     // half-width
    let eh = sports ? 1.4 : (premium ? 1.3 : 1.45);    // half-height (flatness)
    let drop = sports ? 1.6 : (premium ? 1.0 : 1.3);   // +ve = outer corner DOWN
    let irisR = premium ? 1.9 : 2.0;                   // smaller iris
    const lidW = sports ? 2.2 : (premium ? 1.5 : 1.9); // hard lid line weight
    const lid = '#15121a';
    // per-shape geometry knobs (all keep narrow/hard masculine read)
    let topCurve = 0.45;   // upper-lid control X spread (lower => flatter/harder)
    let lidShift = 0;      // push whole upper lid DOWN over the eye (hooding)
    let irisDy = 0.9;      // iris vertical seat
    let spread = 0;        // shift eyes APART (+) or together (-) for wide/close-set
    let glow = false;      // alien eyes get a faint coloured glow ring
    switch (shape) {
      case 1: // DOWN-SLANTED (stern)
        drop += 1.4; ew += 0.2; topCurve = 0.5;
        break;
      case 2: // UP-SLANTED (sharp)
        drop -= 2.0; ew += 0.1; topCurve = 0.5; irisDy = 0.7;
        break;
      case 3: // HOODED (heavy lid, less sclera)
        lidShift = 1.1; eh -= 0.15; topCurve = 0.7; irisDy = 0.6;
        break;
      case 4: // DEEP-SET NARROW (recessed, intense)
        ew -= 0.6; eh -= 0.25; drop -= 0.4; topCurve = 0.35;
        break;
      case 5: // BIG ALMOND ALIEN (large, tall, glowing — anime-alien)
        ew += 1.6; eh += 1.9; irisR += 0.9; drop += 0.3; topCurve = 0.85; irisDy = 0.2; glow = true;
        break;
      case 6: // SHARP UPTURNED ALIEN (large + strongly lifted outer corner)
        ew += 1.3; eh += 1.2; irisR += 0.6; drop -= 3.4; topCurve = 0.8; irisDy = 0.1; glow = true;
        break;
      case 7: // VERY NARROW SLIT (tiny height, long, cold/reptilian)
        ew += 1.0; eh -= 0.7; irisR -= 0.4; drop -= 0.6; topCurve = 0.25; irisDy = 0.5;
        break;
      case 8: // WIDE-SET LARGE (pushed apart, big rounded — exotic)
        ew += 1.2; eh += 1.4; irisR += 0.7; spread = 2.2; topCurve = 0.8; irisDy = 0.3; glow = true;
        break;
      case 9: // TALL OVAL ALIEN (very tall, narrow width, big glowing iris)
        ew -= 0.4; eh += 2.4; irisR += 1.0; topCurve = 1.0; irisDy = 0.0; glow = true;
        break;
      default: // 0 STRAIGHT ALMOND (calm)
        break;
    }

    const one = (cx0: number, s: number, tag: string): string => {
      const cx = cx0 + s * spread;           // wide-set / close-set offset
      const inX = cx - s * (ew * 0.9), outX = cx + s * (ew * 1.05);
      const inY = cyL - 0.2 + lidShift;      // inner corner (+ hooding shift)
      const outY = cyL + drop + lidShift;    // outer corner angle + hooding
      const top = cyL - eh + lidShift;
      // Hard, near-straight upper lid: low control points keep it flat/angular.
      const upper = `M ${inX} ${inY} C ${cx - s * ew * topCurve} ${top} ${cx + s * ew * 0.35} ${top + 0.2} ${outX} ${outY} `;
      const lower = `C ${cx + s * ew * 0.35} ${cyL + eh} ${cx - s * ew * 0.4} ${cyL + eh} ${inX} ${inY}`;
      const sclera = `<path d="${upper} ${lower} Z" fill="#f1ede4"/>`;
      const iy = cyL + irisDy;               // iris seated LOW, tucked under lid
      const glint = premium
        ? `<rect x="${cx - 0.45}" y="${iy - 1.0}" width="0.7" height="0.5" rx="0.2" fill="#cfcfcf" opacity="0.5"/>`
        : '';
      // alien eyes get a faint coloured glow halo behind the iris
      const glowRing = glow
        ? `<circle cx="${cx}" cy="${iy}" r="${irisR * 1.35}" fill="${eyeHex}" opacity="0.25"/>`
        : '';
      const iris = glowRing +
        `<circle cx="${cx}" cy="${iy}" r="${irisR}" fill="${eyeHex}"/>` +
        `<circle cx="${cx}" cy="${iy}" r="${irisR * 0.46}" fill="#0e0c12"/>` +
        glint;
      const cid = 'ec' + tag + uid;
      // Single hard upper-lid stroke (a crease, NOT lashes); no outer flick.
      const lidLine =
        `<path d="${upper}" fill="none" stroke="${lid}" stroke-width="${lidW}" stroke-linecap="round"/>`;
      // hooded shape gets an extra heavy lid-fold line above for the brooding read
      const fold = shape === 3
        ? `<path d="M ${inX + s * 0.4} ${inY - 1.6} C ${cx - s * ew * 0.4} ${top - 1.5} ${cx + s * ew * 0.3} ${top - 1.3} ${outX - s * 0.4} ${outY - 1.4}" fill="none" stroke="#6a5a4c" stroke-width="0.8" opacity="0.5"/>`
        : '';
      const lowerLid = (premium || seinen)
        ? `<path d="M ${inX} ${inY} ${lower}" fill="none" stroke="#7a6a5a" stroke-width="0.7" opacity="0.45"/>`
        : '';
      return `<g>${sclera}<clipPath id="${cid}"><path d="${upper} ${lower} Z"/></clipPath>` +
             `<g clip-path="url(#${cid})">${iris}</g>${lowerLid}${fold}${lidLine}</g>`;
    };
    return one(cxL, -1, 'L') + one(cxR, 1, 'R');
  }

  // -------- BROWS: 9 DISTINCT masculine shapes selected by (baseFaceId+4) % 9 --------
  //   0 STRAIGHT THICK — flat heavy bar, low-set (default male)
  //   1 ANGLED-DOWN STERN — inner ends pulled down toward the nose (frown/stern)
  //   2 SLIGHTLY ARCHED — gentle peak mid-brow, outer ends drop (still hard)
  //   3 BUSHY — thicker + a touch longer/rougher, heavy mass
  //   4 THIN-SHARP — thinner, crisp, slightly tapered (sharp/clean)
  //   5 LONG-FLAT — extra-long flat bar reaching further to the temple (wide brow)
  //   6 LONG-ANGLED — long bar with a stronger downward inner angle (intense/wide)
  //   7 THICK-STRAIGHT — very heavy, perfectly level slab (dominant)
  //   8 THIN-LONG — thin but long and level (refined, elongated)
  // (all stay heavy-ish, low and masculine — no high thin feminine arches)
  private browShapeIdx(): number {
    if (this.browShape >= 0) return ((this.browShape % 9) + 9) % 9;
    return ((((this.baseFaceId + 4) % 9) + 9) % 9);
  }
  private brows(hairShade: string): string {
    const sports = this.style === 'sports', premium = this.style === 'premium';
    let w = sports ? 3.8 : (premium ? 2.8 : 3.3);
    // base anchor Ys: yIn = inner end (near nose), yOut = outer end (near temple)
    let yIn = sports ? 51.5 : 51.0, yOut = sports ? 50.0 : 49.8;  // lower + flatter
    const shape = this.browShapeIdx();
    // inner/outer X anchors (mirrored around 50); peak controls the mid arch.
    // outX lower => brow reaches further out toward the temple (longer brow).
    const inX = 46.5;
    let outX = 32;
    let peak = 0;        // -ve raises the mid (arch up), +ve lowers it (flat/sag)
    let cap: 'round' | 'square' = 'round';
    switch (shape) {
      case 1: // ANGLED-DOWN STERN — inner ends dip toward nose
        yIn += 1.4; yOut -= 0.6; peak = 0.4; w += 0.1;
        break;
      case 2: // SLIGHTLY ARCHED — gentle mid peak, outer tail drops
        yOut += 1.2; peak = -1.3; w -= 0.2;
        break;
      case 3: // BUSHY — heavier, rougher, a touch longer
        w += 1.0; yIn += 0.3; peak = 0.2;
        break;
      case 4: // THIN-SHARP — thinner crisp bar, square ends
        w -= 1.1; yOut -= 0.3; cap = 'square'; peak = -0.3;
        break;
      case 5: // LONG-FLAT — extra-long flat bar reaching toward the temple
        outX = 28.5; yOut += 0.4; peak = 0.05; cap = 'square';
        break;
      case 6: // LONG-ANGLED — long bar with a stronger downward inner angle
        outX = 28.5; yIn += 1.7; yOut -= 0.4; peak = 0.5; w += 0.2;
        break;
      case 7: // THICK-STRAIGHT — very heavy perfectly-level slab
        w += 1.4; yOut = yIn; peak = 0; cap = 'square';
        break;
      case 8: // THIN-LONG — thin but long and level (refined, elongated)
        outX = 29; w -= 0.9; yOut = yIn; peak = -0.1; cap = 'square';
        break;
      default: // 0 STRAIGHT THICK
        break;
    }
    // Quadratic through a mid control point so arch/sag reads clearly.
    const midXL = (inX + outX) / 2, midYL = (yIn + yOut) / 2 + peak;
    const midXR = 100 - midXL;
    const draw = (x1: number, y1: number, mx: number, my: number, x2: number, y2: number) =>
      `<path d="M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}" fill="none" stroke="${hairShade}" stroke-width="${w}" stroke-linecap="${cap}"/>`;
    return (
      draw(outX, yOut, midXL, midYL, inX, yIn) +
      draw(100 - outX, yOut, midXR, midYL, 100 - inX, yIn)
    );
  }

  // -------- WRINKLES: 3 levels selected by (baseFaceId+6) % 3 (subtle) --------
  //   0 NONE  1 LIGHT (forehead + glabella crease)  2 HEAVY (+ faint nasolabial)
  private wrinkleIdx(): number {
    if (this.wrinkle >= 0) return this.wrinkle % 3;
    return ((((this.baseFaceId + 6) % 3) + 3) % 3);
  }
  private wrinkles(): string {
    const lvl = this.wrinkleIdx();
    if (lvl === 0) return '';
    const ln = '#6a5446';
    // forehead horizontal lines (above brows) + a short glabella crease between brows
    let s =
      `<path d="M 37 43.5 Q 50 42.4 63 43.5" fill="none" stroke="${ln}" stroke-width="0.7" opacity="0.32" stroke-linecap="round"/>` +
      `<path d="M 39 46.5 Q 50 45.6 61 46.5" fill="none" stroke="${ln}" stroke-width="0.7" opacity="0.28" stroke-linecap="round"/>` +
      `<path d="M 49 48.5 L 48.4 52" fill="none" stroke="${ln}" stroke-width="0.6" opacity="0.3" stroke-linecap="round"/>`;
    if (lvl === 2) {
      // heavier veteran: extra forehead line + faint nasolabial folds beside the nose
      s += `<path d="M 40 40.6 Q 50 39.6 60 40.6" fill="none" stroke="${ln}" stroke-width="0.7" opacity="0.26" stroke-linecap="round"/>`;
      s += `<path d="M 51.6 50.5 L 51 52.4" fill="none" stroke="${ln}" stroke-width="0.6" opacity="0.3" stroke-linecap="round"/>`;
      s += `<path d="M 43 64 Q 41.5 68 44 71" fill="none" stroke="${ln}" stroke-width="0.8" opacity="0.22" stroke-linecap="round"/>`;
      s += `<path d="M 57 64 Q 58.5 68 56 71" fill="none" stroke="${ln}" stroke-width="0.8" opacity="0.22" stroke-linecap="round"/>`;
    }
    return s;
  }

  // -------- NOSE: 10 DISTINCT shapes selected by (baseFaceId+2) % 5 (fallback) --------
  //   0 STRAIGHT     — clean vertical bridge, modest nostril wing (default male)
  //   1 AQUILINE     — slight hook/convex bridge, prominent tip (Roman)
  //   2 BROAD/WIDE   — wider base, fuller nostril wing, shorter bridge
  //   3 NARROW LONG  — long thin bridge, small tip, low-set nostril
  //   4 SMALL FLAT   — short bridge, minimal projection, soft tip
  //   5 TINY ALIEN   — barely-there nub, ultra-minimal (Galactik-alien)
  //   6 SHARP ANGULAR— hard knife-edge bridge with an angular tip (alien)
  //   7 WIDE-BRIDGE  — flat very wide bridge, low broad base (exotic)
  //   8 UPTURNED     — short bridge tilting UP to a lifted tip (pixie/alien)
  //   9 LONG-POINTED — extra long straight bridge ending in a fine point (alien)
  private nose(skinShade: string): string {
    const premium = this.style === 'premium';
    const w = premium ? 1.3 : 1.5;
    const cap = `stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
    const idx = this.noseShape >= 0 ? (((this.noseShape % 10) + 10) % 10) : ((((this.baseFaceId + 2) % 5) + 5) % 5);
    let d: string;
    switch (idx) {
      case 1: // AQUILINE — convex bridge bulging out, hooked tip
        d = `M 52.3 57.5 C 53.4 61 53.6 64 51.6 66.6 C 49.8 68.2 48.4 67.4 47.6 66.8 C 49.4 66.8 50.6 66.4 51.2 65.4`;
        break;
      case 2: // BROAD / WIDE — short bridge, wide flaring nostril wings
        d = `M 51.6 59 C 51.2 62.5 52.2 65 47.4 66.6 C 49 67.4 51 67.4 52.6 66.6 C 53 65.4 52.6 64 52 62.8`;
        break;
      case 3: // NARROW LONG — long thin bridge dropping low, tiny tip
        d = `M 51.4 56.5 C 51 61 51.4 66.5 50.6 68.4 C 49.8 69 48.8 68.6 48.2 68 C 49.6 68 50.4 67.4 50.8 66.6`;
        break;
      case 4: // SMALL FLAT — short bridge, soft minimal tip
        d = premium
          ? `M 51.4 59.5 C 51 62.5 51.6 64.6 49.4 65.4`
          : `M 51.6 59.5 C 51.2 62.5 52 64.6 49 65.4 C 49.9 65.2 50.4 64.9 50.7 64.4`;
        break;
      case 5: // TINY ALIEN — barely-there nub, ultra-minimal
        d = `M 51 62.5 C 51 64 51.2 65 49.8 65.4 C 50.4 65.3 50.8 65 51 64.5`;
        break;
      case 6: // SHARP ANGULAR — knife-edge straight bridge to an angular tip
        d = `M 52.2 57 L 51.6 64.5 L 48 66.6 L 50.6 66.4 L 51.4 65.4`;
        break;
      case 7: // WIDE-BRIDGE — flat wide bridge, low broad base
        d = `M 53 59.5 C 53.2 63 53.4 65 47 66.8 C 48.6 67.6 51 67.6 53.4 66.8 C 53.8 65.4 53.4 63.6 52.8 62`;
        break;
      case 8: // UPTURNED — short bridge tilting up to a lifted tip
        d = `M 51.4 60 C 51 62.5 50.6 64.5 49 64.6 C 49.8 65.2 51 65.4 52 64.8 C 52.2 64.2 52 63.4 51.6 62.6`;
        break;
      case 9: // LONG-POINTED — extra long straight bridge to a fine point
        d = `M 51.6 55.5 C 51.2 61 51.4 67 50.4 69.6 C 50 70.2 49.4 70 49 69.4 C 50 69.2 50.6 68.4 50.9 67.4`;
        break;
      default: // 0 STRAIGHT — clean vertical bridge, modest wing
        d = premium
          ? `M 51.5 58.5 C 51 63 52 66 49 66.5`
          : `M 52 58 C 51.4 63 52.4 66.2 48.8 67 C 50 66.5 50.6 66 51 65.5`;
        break;
    }
    return `<path d="${d}" fill="none" stroke="${skinShade}" ${cap}/>`;
  }

  // -------- MOUTH: 5 DISTINCT masculine shapes selected by (baseFaceId+3) % 5 --------
  //   0 FLAT NEUTRAL  — straight restrained line (default male)
  //   1 SERIOUS DOWN  — slight symmetric downturn at both corners (grim)
  //   2 SMIRK         — one corner lifts, the other flat (wry/confident)
  //   3 PRESSED/TIGHT — short compressed line + faint lower-lip shade (tense)
  //   4 PARTED FIRM   — slightly open, firm — thin gap line under the lip
  // (no soft/full lips, no big smiles — all stay thin and restrained)
  private mouthShapeIdx(): number {
    if (this.mouthShape >= 0) return this.mouthShape % 5;
    return ((((this.baseFaceId + 3) % 5) + 5) % 5);
  }
  private mouth(): string {
    const sports = this.style === 'sports', premium = this.style === 'premium';
    const col = sports ? '#7e463a' : (premium ? '#8a4a40' : '#7f463b');
    const w = sports ? 1.7 : (premium ? 1.4 : 1.5);
    const cap = `fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"`;
    const shape = this.mouthShapeIdx();
    switch (shape) {
      case 1: // SERIOUS DOWNTURN
        return `<path d="M 44.8 71.0 Q 50 72.4 55.2 71.0" ${cap}/>`;
      case 2: // SMIRK (left corner lifts, right stays flat)
        return `<path d="M 44.6 71.6 Q 48 70.4 50.2 71.3 L 55.4 71.4" ${cap}/>`;
      case 3: // PRESSED / TIGHT (shorter compressed line + lower-lip shade)
        return `<path d="M 45.8 71.3 L 54.2 71.3" ${cap}/>` +
               `<path d="M 46.6 72.5 Q 50 73.0 53.4 72.5" fill="none" stroke="${col}" stroke-width="${w * 0.6}" stroke-linecap="round" opacity="0.4"/>`;
      case 4: // PARTED FIRM (slight gap, firm lips top + bottom)
        return `<path d="M 45 70.8 Q 50 71.4 55 70.8" ${cap}/>` +
               `<path d="M 45.6 72.4 Q 50 72.9 54.4 72.4" fill="none" stroke="${col}" stroke-width="${w * 0.8}" stroke-linecap="round" opacity="0.7"/>`;
      default: // 0 FLAT NEUTRAL
        return sports
          ? `<path d="M 44.5 71.4 L 55.5 71.4" ${cap}/>`
          : (premium
            ? `<path d="M 45.5 71.2 L 54.5 71.2" ${cap}/>`
            : `<path d="M 45 71.3 Q 50 71.9 55 71.3" ${cap}/>`);
    }
  }

  private noseMouth(skinShade: string): string {
    // flat, thin, restrained mouth (no full soft lips).
    return this.nose(skinShade) + this.mouth();
  }

  /** Faint shaded stubble region along the jaw/chin on a subset of faces. */
  private stubble(g: Geom, shade: string): string {
    const b = ((this.baseFaceId % 10) + 10) % 10;
    if (b % 3 === 2) return '';                 // ~1/3 of faces clean-shaven
    const heavy = b % 3 === 0;                   // ~1/3 heavier, ~1/3 light
    const opa = heavy ? 0.34 : 0.2;
    const cbX = g.rx * g.cheek, w = g.jawW, y = g.jaw;
    // band hugging the lower jaw + chin + a touch up toward the cheeks
    const band =
      `M ${50 - w - 1} ${y - 9} ` +
      `C ${50 - cbX * 0.7} ${y - 13} ${50 - cbX * 0.55} ${y - 11} ${50 - w * 0.5} ${y - 1} ` +
      `C ${50 - w * 0.3} ${y + 2} ${50 + w * 0.3} ${y + 2} ${50 + w * 0.5} ${y - 1} ` +
      `C ${50 + cbX * 0.55} ${y - 11} ${50 + cbX * 0.7} ${y - 13} ${50 + w + 1} ${y - 9} ` +
      `C ${50 + w + 2} ${y - 3} ${50 + w * 0.6} ${y + 4} 50 ${y + 4.4} ` +
      `C ${50 - w * 0.6} ${y + 4} ${50 - w - 2} ${y - 3} ${50 - w - 1} ${y - 9} Z`;
    // moustache/upper-lip shadow hint for heavier stubble
    const mo = heavy
      ? `<path d="M 44 69.5 Q 50 70.6 56 69.5 Q 50 71.6 44 69.5 Z" fill="${shade}" opacity="${opa * 0.9}"/>`
      : '';
    return `<path d="${band}" fill="${shade}" opacity="${opa}"/>${mo}`;
  }

  // -------- EARS: 5 shapes selected by (baseFaceId+5) % 3 (fallback) --------
  //   0 SMALL TUCKED  1 STANDARD  2 LARGE PROTRUDING
  //   3 POINTED-ELF   — tall pointed tip (Galactik-alien), tucked-ish
  //   4 OVERSIZED     — very large, tall pointed, protruding (alien)
  private earShapeIdx(): number {
    if (this.earShape >= 0) return ((this.earShape % 5) + 5) % 5;
    return ((((this.baseFaceId + 5) % 3) + 3) % 3);
  }
  private earDims(): { rx: number; ry: number; out: number; point: number } {
    switch (this.earShapeIdx()) {
      case 1:  return { rx: 3.4, ry: 6.0, out: 1.5, point: 0 };   // STANDARD
      case 2:  return { rx: 4.1, ry: 6.8, out: 0.2, point: 0 };   // LARGE PROTRUDING
      case 3:  return { rx: 2.9, ry: 6.4, out: 1.6, point: 5.5 }; // POINTED-ELF (pointed tip)
      case 4:  return { rx: 3.8, ry: 7.6, out: -0.4, point: 7.5 };// OVERSIZED pointed alien
      default: return { rx: 2.8, ry: 5.2, out: 2.4, point: 0 };   // SMALL TUCKED
    }
  }

  // ============================================================================
  // PER-NATION SIGNATURES — distinctive, exaggerated traits layered ON TOP of the
  // finished (still-random) face so a player's nation is instantly recognisable.
  // Eye anchors match eyeGroup(): cxL=39.5, cxR=60.5, eye centre band ~cy 56.8.
  // All deterministic (driven only by nationId + the existing descriptor).
  // ============================================================================
  private static readonly NATION_EYE = { cxL: 39.5, cxR: 60.5, cy: 57.7 };

  /** Glowing solid-colour eye discs (Dong) / metallic sheen (FootieCup). */
  private sigEyeOverlay(fill: string, glow: boolean, sheen: boolean): string {
    const e = PlayerFaceComponent.NATION_EYE;
    const one = (cx: number): string => {
      const halo = glow ? `<circle cx="${cx}" cy="${e.cy}" r="3.4" fill="${fill}" opacity="0.45"/>` : '';
      const disc = `<circle cx="${cx}" cy="${e.cy}" r="2.0" fill="${fill}"/>`;
      const sh = sheen
        ? `<ellipse cx="${cx + 0.7}" cy="${e.cy - 0.7}" rx="0.9" ry="0.5" fill="#fff6c8" opacity="0.85"/>`
        : `<rect x="${cx - 0.5}" y="${e.cy - 1.2}" width="0.8" height="0.6" rx="0.2" fill="#ffffff" opacity="0.7"/>`;
      return halo + disc + sh;
    };
    return one(e.cxL) + one(e.cxR);
  }

  /** Star / hexagon shaped iris-pupil (Cards). */
  private sigShapedIris(shape: 'star' | 'hex', fill: string): string {
    const e = PlayerFaceComponent.NATION_EYE;
    const poly = (cx: number): string => {
      const pts: string[] = [];
      if (shape === 'star') {
        for (let k = 0; k < 10; k++) {
          const r = k % 2 === 0 ? 2.2 : 0.95;
          const a = -Math.PI / 2 + k * Math.PI / 5;
          pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(e.cy + r * Math.sin(a)).toFixed(2)}`);
        }
      } else {
        for (let k = 0; k < 6; k++) {
          const a = -Math.PI / 2 + k * Math.PI / 3;
          pts.push(`${(cx + 2.0 * Math.cos(a)).toFixed(2)},${(e.cy + 2.0 * Math.sin(a)).toFixed(2)}`);
        }
      }
      return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="#0e0c12" stroke-width="0.4"/>`;
    };
    return poly(e.cxL) + poly(e.cxR);
  }

  /** Cybernetic eye glint — a hard scan-line + corner spark on one eye (Eleven). */
  private sigCyberEye(): string {
    const e = PlayerFaceComponent.NATION_EYE;
    return `<line x1="${e.cxR - 2.4}" y1="${e.cy - 0.6}" x2="${e.cxR + 2.4}" y2="${e.cy - 0.6}" stroke="#36e0ff" stroke-width="0.6" opacity="0.9"/>` +
           `<circle cx="${e.cxR + 1.6}" cy="${e.cy - 0.6}" r="0.7" fill="#bff6ff"/>` +
           `<rect x="${e.cxR + 2.2}" y="${e.cy - 1.4}" width="1.6" height="1.6" rx="0.2" fill="none" stroke="#36e0ff" stroke-width="0.4" opacity="0.8"/>`;
  }

  /** Bold tribal cheek stripes (Dong). */
  private sigTribalStripes(col: string): string {
    const stripe = (x: number, s: number) =>
      `<path d="M ${x} 60 q ${s * 1.5} 4 ${s * 0.6} 9" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round" opacity="0.92"/>` +
      `<path d="M ${x + s * 3} 60.5 q ${s * 1.4} 4 ${s * 0.5} 8.5" fill="none" stroke="${col}" stroke-width="1.4" stroke-linecap="round" opacity="0.85"/>`;
    return stripe(34, -1) + stripe(66, 1);
  }

  /** War-paint visor stripe across the eyes (Khess). */
  private sigWarVisor(col: string): string {
    return `<path d="M 30 55 L 70 55 L 70 60 L 30 60 Z" fill="${col}" opacity="0.82"/>` +
           `<path d="M 30 55 L 70 55" stroke="#0e0c12" stroke-width="0.5" opacity="0.5"/>` +
           `<path d="M 30 60 L 70 60" stroke="#0e0c12" stroke-width="0.5" opacity="0.5"/>` +
           `<path d="M 40 55 L 38 60 M 50 55 L 50 60 M 60 55 L 62 60" stroke="#ffffff" stroke-width="0.5" opacity="0.4"/>`;
  }

  /** Small forehead emblem dot (FootieCup) / serif glyph (Literature) / "11" mark (Eleven). */
  private sigForehead(kind: 'dot' | 'glyph' | 'eleven'): string {
    if (kind === 'dot') {
      return `<circle cx="50" cy="40" r="2.1" fill="#e8c34a" stroke="#8a6a16" stroke-width="0.5"/>` +
             `<circle cx="50" cy="40" r="0.9" fill="#fff3c0"/>`;
    }
    if (kind === 'eleven') {
      // "11" numerals over a faint binary tick row.
      return `<text x="50" y="42.4" font-family="monospace" font-size="6.5" font-weight="700" text-anchor="middle" fill="#36e0ff" stroke="#0e3a44" stroke-width="0.3">11</text>` +
             `<text x="50" y="46.6" font-family="monospace" font-size="2.6" text-anchor="middle" fill="#7fd6e6" opacity="0.7">1011</text>`;
    }
    // serif letter glyph
    return `<text x="50" y="42.6" font-family="Georgia, 'Times New Roman', serif" font-size="7" font-weight="700" text-anchor="middle" fill="#caa15a" stroke="#5a3f15" stroke-width="0.25">A</text>`;
  }

  /** Small card-suit mark on one cheek (Cards). */
  private sigSuitMark(): string {
    // a small spade on the right cheek.
    return `<path d="M 64 64 C 61 66 61 68.5 63 69 C 62.6 69.6 63.4 70 64 69.8 C 64.6 70 65.4 69.6 65 69 C 67 68.5 67 66 64 64 Z" fill="#15121a"/>` +
           `<path d="M 64 69.4 L 63.2 71 L 64.8 71 Z" fill="#15121a"/>`;
    }

  /** Small brow-ridge / antenna nub above the brow (Gallactick). */
  private sigAntennaNub(skin: string, ink: string): string {
    return `<path d="M 43 41 Q 50 37.5 57 41" fill="none" stroke="${skin}" stroke-width="2.2" stroke-linecap="round" opacity="0.9"/>` +
           `<ellipse cx="50" cy="35.5" rx="1.3" ry="2.0" fill="${skin}" stroke="${ink}" stroke-width="0.8"/>` +
           `<circle cx="50" cy="34" r="0.8" fill="#9fe6ff" opacity="0.85"/>`;
  }

  /** Builds the full per-nation signature overlay drawn last (on top of everything). */
  private nationSignature(skin: string, ink: string): string {
    switch (this.nationIdx()) {
      case 1: // Gallactick — antenna nub (shape + eyes already biased alien in geom/eyeShapeIdx)
        return this.sigAntennaNub(skin, ink);
      case 2: // Dong — glowing solid-colour eyes + tribal cheek stripes
        return this.sigEyeOverlay('#39e08a', true, false) + this.sigTribalStripes('#c4304a');
      case 3: // Khess — war-paint visor across the eyes (ears forced pointed in buildInner)
        return this.sigWarVisor('#9a3a1c');
      case 4: // FootieCup — golden metallic eye sheen + forehead emblem dot
        return this.sigEyeOverlay('#d9a72e', false, true) + this.sigForehead('dot');
      case 5: // Cards — star iris/pupil + card-suit cheek mark
        return this.sigShapedIris(this.baseFaceId % 2 === 0 ? 'star' : 'hex', '#c4304a') + this.sigSuitMark();
      case 6: // Literature — serif glyph on forehead (calm narrow eyes forced in eyeShapeIdx)
        return this.sigForehead('glyph');
      case 7: // Eleven — "11"/binary forehead mark + cybernetic eye glint
        return this.sigForehead('eleven') + this.sigCyberEye();
      default: // 0 International — NEUTRAL
        return '';
    }
  }

  // ============================================================================
  // CRYSTALLINE GEM-GOLEM ("Prismatic") — a fully SELF-CONTAINED renderer for the
  // new exotic species. It does NOT call any human helper (geom/hair/eyeGroup/...),
  // so the existing faces, the 3 styles and the nation signatures are untouched
  // whenever species !== 'crystalline'. Deterministic from the descriptor indices.
  // ============================================================================
  private drawCrystalline(): string {
    const C = PlayerFaceComponent;
    const body = C.XTAL_BODY[(((this.skinTone % C.XTAL_BODY.length) + C.XTAL_BODY.length) % C.XTAL_BODY.length)];
    const glow = C.XTAL_GLOW[(((this.eyeColor % C.XTAL_GLOW.length) + C.XTAL_GLOW.length) % C.XTAL_GLOW.length)];
    const horn = C.XTAL_BODY[(((this.hairColor % C.XTAL_BODY.length) + C.XTAL_BODY.length) % C.XTAL_BODY.length)];
    const I = '#15121a', IW = this.style === 'sports' ? 1.7 : (this.style === 'premium' ? 1.2 : 1.5);
    const uid = 'x' + this.skinTone + '_' + this.eyeColor + '_' + this.hairColor + '_' + this.baseFaceId + this.style;

    // small deterministic silhouette jitter so two crystals differ a touch
    const j = (((this.baseFaceId % 4) + 4) % 4);
    const tw = 19 + j;          // half-width at the crown (flat top)
    const cw = 24 + j * 0.6;    // half-width at the widest faceted temple
    const chinY = 80 + (j % 2); // chin depth
    const topY = 16;

    let s = '';
    // ---- refraction halo behind the whole crystal head ----
    s += `<ellipse cx="50" cy="54" rx="34" ry="40" fill="${glow}" opacity="0.12"/>`;

    // ---- crystalline neck (faceted column) ----
    s += `<path d="M 41 ${chinY - 7} L 39 93 L 61 93 L 59 ${chinY - 7} Z" fill="${body.dk}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    s += `<path d="M 50 ${chinY - 7} L 50 93" stroke="${body.hl}" stroke-width="0.8" opacity="0.5"/>`;
    s += `<path d="M 41 ${chinY - 7} L 50 89 L 59 ${chinY - 7} Z" fill="${body.md}" opacity="0.6"/>`;

    // ---- CRYSTAL SHARD HORNS: swept-back faceted shards from the upper temples ----
    const hornL = `M ${50 - tw - 1} ${topY + 4} L ${50 - tw - 11} ${topY - 12} L ${50 - tw + 4} ${topY - 1} Z`;
    const hornR = `M ${50 + tw + 1} ${topY + 4} L ${50 + tw + 11} ${topY - 12} L ${50 + tw - 4} ${topY - 1} Z`;
    s += `<path d="${hornL}" fill="${horn.md}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    s += `<path d="${hornR}" fill="${horn.md}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    s += `<path d="M ${50 - tw - 1} ${topY + 4} L ${50 - tw - 11} ${topY - 12}" stroke="${horn.hl}" stroke-width="0.9" opacity="0.7"/>`;
    s += `<path d="M ${50 + tw + 1} ${topY + 4} L ${50 + tw + 11} ${topY - 12}" stroke="${horn.hl}" stroke-width="0.9" opacity="0.7"/>`;

    // ---- FACETED GEM SKULL outline (hard angular planes) ----
    // top crown (flat-ish), beveled temples, planed cheeks, sharp crystal chin.
    const head =
      `M ${50 - tw} ${topY} L ${50 + tw} ${topY} ` +          // flat crown
      `L ${50 + cw} ${topY + 16} ` +                          // bevel out to temple
      `L ${50 + cw - 1} 50 ` +                                // straight temple
      `L ${50 + cw - 7} 64 ` +                                // cheek plane in
      `L ${50 + 7} ${chinY - 6} ` +                           // jaw to chin
      `L 50 ${chinY} ` +                                      // sharp chin point
      `L ${50 - 7} ${chinY - 6} ` +
      `L ${50 - cw + 7} 64 ` +
      `L ${50 - cw + 1} 50 ` +
      `L ${50 - cw} ${topY + 16} Z`;
    s += `<path d="${head}" fill="${body.md}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    s += `<clipPath id="hx${uid}"><path d="${head}"/></clipPath>`;

    // ---- internal cel FACET planes (catch light / cast shadow) ----
    s += `<g clip-path="url(#hx${uid})">`;
    // bright lit facet (left forehead/cheek)
    s += `<path d="M ${50 - tw} ${topY} L 50 ${topY + 4} L ${50 - cw + 3} 52 L ${50 - cw} ${topY + 16} Z" fill="${body.lt}" opacity="0.85"/>`;
    // bright lit facet (centre nose ridge)
    s += `<path d="M 50 ${topY + 4} L 53 50 L 50 ${chinY - 4} L 47 50 Z" fill="${body.lt}" opacity="0.55"/>`;
    // deep shadow facet (right cheek/jaw)
    s += `<path d="M 53 50 L ${50 + cw - 1} 50 L ${50 + cw - 7} 64 L ${50 + 7} ${chinY - 6} L 50 ${chinY - 4} Z" fill="${body.dk}" opacity="0.7"/>`;
    // shadow facet (lower-left jaw)
    s += `<path d="M 47 56 L ${50 - cw + 4} 56 L ${50 - cw + 7} 64 L ${50 - 7} ${chinY - 6} L 50 ${chinY - 4} Z" fill="${body.dk}" opacity="0.45"/>`;
    // thin inner facet edges (crisp crystal seams)
    s += `<path d="M 50 ${topY + 4} L 50 ${chinY - 4} M ${50 - cw + 2} 50 L 47 56 M ${50 + cw - 2} 50 L 53 56" stroke="${body.hl}" stroke-width="0.7" fill="none" opacity="0.6"/>`;
    s += `</g>`;

    // ---- GLOWING SLIT EYES (hard energy lines, no sclera/iris) ----
    const eyeY = 54;
    const slit = (cx: number, dir: number): string => {
      const x0 = cx - dir * 6, x1 = cx + dir * 6;
      return `<path d="M ${x0} ${eyeY + dir * 0} L ${cx} ${eyeY - 2.2} L ${x1} ${eyeY - dir * 0}" fill="none" stroke="${glow}" stroke-width="2.6" stroke-linecap="round" opacity="0.35"/>` +
             `<path d="M ${x0} ${eyeY} L ${cx} ${eyeY - 2.0} L ${x1} ${eyeY}" fill="none" stroke="${glow}" stroke-width="1.4" stroke-linecap="round"/>` +
             `<path d="M ${x0} ${eyeY} L ${cx} ${eyeY - 2.0} L ${x1} ${eyeY}" fill="none" stroke="#ffffff" stroke-width="0.5" stroke-linecap="round" opacity="0.85"/>`;
    };
    s += slit(40, 1) + slit(60, -1);
    // angular brow ridges over the slits (hard crystal edges)
    s += `<path d="M 33 49 L 46 50.5" stroke="${body.dk}" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>`;
    s += `<path d="M 67 49 L 54 50.5" stroke="${body.dk}" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>`;

    // ---- hard angular mouth seam (a thin etched crystal line) ----
    s += `<path d="M 45 ${chinY - 11} L 50 ${chinY - 10} L 55 ${chinY - 11}" fill="none" stroke="${body.dk}" stroke-width="1.2" stroke-linecap="round" opacity="0.75"/>`;

    // ---- GEM THIRD-EYE: a faceted glowing diamond gem on the forehead ----
    const gx = 50, gy = 40, gr = 4.2;
    const gem =
      `M ${gx} ${gy - gr} L ${gx + gr * 0.7} ${gy} L ${gx} ${gy + gr} L ${gx - gr * 0.7} ${gy} Z`;
    s += `<circle cx="${gx}" cy="${gy}" r="${gr * 1.8}" fill="${glow}" opacity="0.28"/>`;        // gem halo
    s += `<path d="${gem}" fill="${glow}" stroke="${I}" stroke-width="0.8" stroke-linejoin="round"/>`;
    // inner gem facets
    s += `<path d="M ${gx} ${gy - gr} L ${gx} ${gy + gr} M ${gx - gr * 0.7} ${gy} L ${gx + gr * 0.7} ${gy}" stroke="#ffffff" stroke-width="0.5" opacity="0.7"/>`;
    s += `<path d="M ${gx} ${gy - gr} L ${gx - gr * 0.35} ${gy - gr * 0.4} L ${gx} ${gy} Z" fill="#ffffff" opacity="0.55"/>`; // top-left sparkle facet
    // tiny gem-row dots flanking the third eye (forehead crystal studs)
    s += `<circle cx="${gx - 9}" cy="${gy + 1}" r="1.0" fill="${glow}" opacity="0.85"/>`;
    s += `<circle cx="${gx + 9}" cy="${gy + 1}" r="1.0" fill="${glow}" opacity="0.85"/>`;

    return s;
  }

  // ============================================================================
  // SAURIAN REPTILIAN / DRACONIC ("Saurian") — a fully SELF-CONTAINED renderer for
  // the new exotic species. It does NOT call any human or crystalline helper, so
  // existing faces, the 3 styles, the 8 nation signatures and crystalline stay
  // byte-for-byte unchanged whenever species !== 'saurian'. Deterministic.
  //   skinTone  -> scaled HIDE tint, eyeColor -> slit-eye sclera glow,
  //   hairColor -> crest spike / frill tint, baseFaceId -> silhouette jitter.
  // ============================================================================
  private drawSaurian(): string {
    const C = PlayerFaceComponent;
    const hide = C.SAUR_HIDE[(((this.skinTone % C.SAUR_HIDE.length) + C.SAUR_HIDE.length) % C.SAUR_HIDE.length)];
    const eye = C.SAUR_EYE[(((this.eyeColor % C.SAUR_EYE.length) + C.SAUR_EYE.length) % C.SAUR_EYE.length)];
    const crest = C.SAUR_HIDE[(((this.hairColor % C.SAUR_HIDE.length) + C.SAUR_HIDE.length) % C.SAUR_HIDE.length)];
    const I = '#160f0a', IW = this.style === 'sports' ? 1.7 : (this.style === 'premium' ? 1.2 : 1.5);
    const uid = 's' + this.skinTone + '_' + this.eyeColor + '_' + this.hairColor + '_' + this.baseFaceId + this.style;

    // deterministic silhouette jitter (snout length / skull width / frill spread)
    const j = (((this.baseFaceId % 4) + 4) % 4);
    const snout = 8 + j;        // how far the muzzle juts to the right
    const sw = 22 + j * 0.7;    // half-width across the temples
    const browY = 42 - (j % 2); // brow-ridge height
    const topY = 22;

    let s = '';

    // ---- swept-back bony FRILL behind the head (a fanned reptilian crest) ----
    const frill = `M 30 ${topY + 8} ` +
      `Q 6 30 8 56 Q 6 76 26 80 ` +     // outer fan sweep (back-left)
      `L 34 70 Q 22 60 26 44 Q 24 34 36 30 Z`;
    s += `<path d="${frill}" fill="${crest.dk}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    // frill ribs
    s += `<path d="M 30 36 Q 18 44 20 56 M 30 46 Q 16 54 24 68" fill="none" stroke="${crest.hl}" stroke-width="0.9" opacity="0.6"/>`;

    // ---- scaly NECK column ----
    s += `<path d="M 40 78 L 36 93 L 60 93 L 56 78 Z" fill="${hide.dk}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    s += `<path d="M 44 80 q 3 3 0 6 M 50 80 q 3 3 0 6" fill="none" stroke="${hide.hl}" stroke-width="0.7" opacity="0.5"/>`;

    // ---- WEDGE SKULL with a forward-thrusting fanged SNOUT (muzzle to the right) ----
    const head =
      `M ${50 - sw} ${topY + 6} ` +                         // back crown
      `Q 50 ${topY - 2} ${50 + sw * 0.5} ${browY - 6} ` +   // crown sweeping forward
      `L ${50 + sw * 0.55 + snout} ${browY + 2} ` +         // brow over the eye, out toward snout
      `L ${52 + snout + 6} 54 ` +                           // top of snout tip
      `L ${52 + snout + 7} 60 ` +                           // snout front
      `L ${52 + snout} 63 ` +                               // nostril dip
      `L ${48 + snout} 66 ` +                               // upper-lip line back
      `L 56 70 ` +                                          // lower jaw / mandible
      `L 50 72 L ${50 - sw * 0.5} 70 ` +                    // chin / jaw underside
      `L ${50 - sw + 4} 60 ` +                              // back jaw up
      `L ${50 - sw} ${topY + 6} Z`;                         // back to crown
    s += `<path d="${head}" fill="${hide.md}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    s += `<clipPath id="hs${uid}"><path d="${head}"/></clipPath>`;

    // ---- scale shading + stipple texture inside the head ----
    s += `<g clip-path="url(#hs${uid})">`;
    // lit upper crown / brow plane
    s += `<path d="M ${50 - sw} ${topY + 6} Q 50 ${topY - 2} ${50 + sw * 0.5} ${browY - 6} L ${50 + sw * 0.55 + snout} ${browY + 2} L ${50 + 4} ${browY + 4} L ${50 - sw + 2} ${browY} Z" fill="${hide.lt}" opacity="0.55"/>`;
    // shadow under the jaw / muzzle
    s += `<path d="M ${48 + snout} 66 L 56 70 L 50 72 L ${50 - sw * 0.5} 70 L ${50 - sw + 4} 60 L ${50 + 6} 64 Z" fill="${hide.dk}" opacity="0.55"/>`;
    // scale stipple rows (small arcs) across the cheek
    let scales = '';
    for (let r = 0; r < 4; r++) {
      const sy = browY + 8 + r * 5;
      for (let cx = 50 - sw + 6; cx < 56 + snout; cx += 6) {
        scales += `M ${cx} ${sy} q 2.4 2 4.8 0 `;
      }
    }
    s += `<path d="${scales}" fill="none" stroke="${hide.dk}" stroke-width="0.5" opacity="0.4"/>`;
    s += `</g>`;

    // ---- dorsal CREST SPIKES along the crown (a row of bony triangles) ----
    let spikes = '';
    for (let k = 0; k < 5; k++) {
      const bx = 50 - sw + 4 + k * (sw * 0.35);
      const by = topY + 2 - k * 0.4;
      const hgt = 8 - k * 0.8;
      spikes += `<path d="M ${bx - 3} ${by + 4} L ${bx} ${by - hgt} L ${bx + 3} ${by + 4} Z" fill="${crest.md}" stroke="${I}" stroke-width="${IW * 0.8}" stroke-linejoin="round"/>`;
      spikes += `<path d="M ${bx} ${by - hgt} L ${bx} ${by + 3}" stroke="${crest.hl}" stroke-width="0.7" opacity="0.7"/>`;
    }
    s += spikes;

    // ---- low brow ridge over the eye (a hard scaled ridge) ----
    s += `<path d="M ${50 - sw + 6} ${browY + 1} Q ${50 + 6} ${browY - 4} ${50 + sw * 0.55} ${browY} " fill="none" stroke="${hide.dk}" stroke-width="2.2" stroke-linecap="round" opacity="0.85"/>`;

    // ---- reptile SLIT-PUPIL EYE (glowing sclera + hard vertical black pupil) ----
    const ex = 50 + sw * 0.12, ey = browY + 6, erx = 7.5, ery = 5.2;
    s += `<ellipse cx="${ex}" cy="${ey}" rx="${erx + 1.6}" ry="${ery + 1.2}" fill="${eye}" opacity="0.22"/>`;     // eye glow halo
    s += `<path d="M ${ex - erx} ${ey} Q ${ex} ${ey - ery} ${ex + erx} ${ey} Q ${ex} ${ey + ery} ${ex - erx} ${ey} Z" fill="${eye}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`; // almond sclera
    s += `<path d="M ${ex} ${ey - ery + 0.6} Q ${ex + 1.6} ${ey} ${ex} ${ey + ery - 0.6} Q ${ex - 1.6} ${ey} ${ex} ${ey - ery + 0.6} Z" fill="#0c0805"/>`; // vertical slit pupil
    s += `<circle cx="${ex - 1.6}" cy="${ey - 1.4}" r="0.9" fill="#ffffff" opacity="0.85"/>`; // catch-light

    // ---- NOSTRIL slits on the snout ----
    s += `<path d="M ${52 + snout + 2} 57 q -1.5 1.5 0 3" fill="none" stroke="${I}" stroke-width="1.0" stroke-linecap="round" opacity="0.8"/>`;

    // ---- fanged JAW line + two upper FANGS ----
    s += `<path d="M ${48 + snout} 66 L 56 70 L 50 71.5 L ${50 - sw * 0.4} 70" fill="none" stroke="${I}" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>`;
    s += `<path d="M ${52 + snout} 66 L ${50 + snout} 70 L ${49 + snout} 66 Z" fill="#fff6ec" stroke="${I}" stroke-width="0.6" stroke-linejoin="round"/>`; // front fang
    s += `<path d="M ${44 + snout} 66.5 L ${42.5 + snout} 69.5 L ${41.5 + snout} 66.5 Z" fill="#fff6ec" stroke="${I}" stroke-width="0.6" stroke-linejoin="round"/>`; // rear fang

    return s;
  }

  // ============================================================================
  // MONUMENT ("Indimenticabili" / The Eternal) — a fully SELF-CONTAINED renderer
  // for the new exotic species: a LIVING CLASSICAL MONUMENT, a face like an animated
  // Greco-Roman marble / bronze statue (a legend immortalised forever). It does NOT
  // call any human / crystalline / saurian helper, so everything else stays
  // byte-for-byte unchanged whenever species !== 'monument'. Deterministic.
  //   skinTone -> material (marble vs bronze/patina), eyeColor -> hollow-eye glow,
  //   hairColor -> laurel / gold-leaf accent, baseFaceId -> silhouette jitter.
  // ============================================================================
  private drawMonument(): string {
    const C = PlayerFaceComponent;
    const mat = C.MON_MAT[(((this.skinTone % C.MON_MAT.length) + C.MON_MAT.length) % C.MON_MAT.length)];
    const glow = C.MON_GLOW[(((this.eyeColor % C.MON_GLOW.length) + C.MON_GLOW.length) % C.MON_GLOW.length)];
    const gold = C.MON_GOLD[(((this.hairColor % C.MON_GOLD.length) + C.MON_GOLD.length) % C.MON_GOLD.length)];
    const I = mat.marble ? '#8a8174' : '#3a2c18';
    const IW = this.style === 'sports' ? 1.7 : (this.style === 'premium' ? 1.2 : 1.5);
    const uid = 'm' + this.skinTone + '_' + this.eyeColor + '_' + this.hairColor + '_' + this.baseFaceId + this.style;

    // deterministic silhouette jitter (face width / jaw depth / brow height)
    const j = (((this.baseFaceId % 4) + 4) % 4);
    const fw = 25 + j * 0.7;      // half-width across the temples
    const chinY = 82 + (j % 2);   // chin depth
    const browY = 44 - (j % 2);   // brow / eye band height
    const topY = 18;

    let s = '';

    // ---- soft monumental aura behind the statue (eternal presence) ----
    s += `<ellipse cx="50" cy="54" rx="35" ry="42" fill="${glow}" opacity="0.10"/>`;

    // ---- carved statue PLINTH neck (a stone column) ----
    s += `<path d="M 40 ${chinY - 6} L 38 93 L 62 93 L 60 ${chinY - 6} Z" fill="${mat.dk}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    s += `<path d="M 40 ${chinY - 6} Q 50 ${chinY - 1} 60 ${chinY - 6} L 60 88 Q 50 91 40 88 Z" fill="${mat.md}" opacity="0.6"/>`;
    s += `<path d="M 43 89 L 57 89" stroke="${mat.hl}" stroke-width="0.8" opacity="0.4"/>`;

    // ---- carved CLASSICAL HEAD outline: smooth oval cranium, sculpted cheeks,
    //      noble squared jaw, with a hard straight "Grecian" nose-ridge profile bump.
    const head =
      `M 50 ${topY} ` +
      `C ${50 + fw * 0.7} ${topY} ${50 + fw} ${topY + 14} ${50 + fw} ${browY + 2} ` +   // crown to temple (right)
      `C ${50 + fw} ${browY + 16} ${50 + fw - 4} ${chinY - 16} ${50 + 11} ${chinY - 6} ` + // cheek down to jaw (right)
      `Q 50 ${chinY} ${50 - 11} ${chinY - 6} ` +                                          // squared noble chin
      `C ${50 - fw + 4} ${chinY - 16} ${50 - fw} ${browY + 16} ${50 - fw} ${browY + 2} ` + // jaw up cheek (left)
      `C ${50 - fw} ${topY + 14} ${50 - fw * 0.7} ${topY} 50 ${topY} Z`;
    s += `<path d="${head}" fill="${mat.md}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    s += `<clipPath id="hm${uid}"><path d="${head}"/></clipPath>`;

    // ---- sculpted PLANE shading inside the head (marble/bronze modelling) ----
    s += `<g clip-path="url(#hm${uid})">`;
    // lit left plane (forehead + cheek)
    s += `<path d="M 50 ${topY} C ${50 - fw * 0.7} ${topY} ${50 - fw} ${topY + 14} ${50 - fw} ${browY + 2} L ${50 - fw + 6} ${chinY - 14} L 48 ${chinY - 8} L 49 ${topY + 6} Z" fill="${mat.lt}" opacity="0.7"/>`;
    // bright forehead highlight
    s += `<path d="M ${50 - fw * 0.5} ${topY + 6} Q 50 ${topY + 2} ${50 + fw * 0.5} ${topY + 6} Q 50 ${topY + 14} ${50 - fw * 0.5} ${topY + 6} Z" fill="${mat.hl}" opacity="0.65"/>`;
    // shadowed right cheek / jaw plane
    s += `<path d="M 52 ${browY} L ${50 + fw - 2} ${browY + 2} L ${50 + fw - 4} ${chinY - 14} L ${50 + 9} ${chinY - 7} L 52 ${chinY - 9} Z" fill="${mat.dk}" opacity="0.5"/>`;
    // under-chin / jaw shadow
    s += `<path d="M ${50 - 11} ${chinY - 7} Q 50 ${chinY} ${50 + 11} ${chinY - 7} Q 50 ${chinY - 3} ${50 - 11} ${chinY - 7} Z" fill="${mat.dk}" opacity="0.4"/>`;

    // ---- hard carved NOSE RIDGE (a straight Grecian profile line + nostril shadow) ----
    s += `<path d="M 50 ${browY - 1} L 50 ${browY + 16}" stroke="${mat.dk}" stroke-width="1.4" stroke-linecap="round" opacity="0.55"/>`;
    s += `<path d="M 50 ${browY - 1} L 50 ${browY + 16}" stroke="${mat.hl}" stroke-width="0.7" stroke-linecap="round" transform="translate(-1.4,0)" opacity="0.7"/>`;
    s += `<path d="M ${50 - 3.6} ${browY + 17} Q 50 ${browY + 20} ${50 + 3.6} ${browY + 17}" fill="none" stroke="${mat.dk}" stroke-width="1.0" stroke-linecap="round" opacity="0.5"/>`;
    s += `<ellipse cx="${50 - 2.2}" cy="${browY + 17}" rx="0.7" ry="0.5" fill="${mat.dk}" opacity="0.6"/>`;
    s += `<ellipse cx="${50 + 2.2}" cy="${browY + 17}" rx="0.7" ry="0.5" fill="${mat.dk}" opacity="0.6"/>`;

    // ---- GOLD-LEAF crack VEINS (kintsugi-like) tracing across the carved face ----
    const veinSeed = (((this.baseFaceId * 3 + this.skinTone) % 3) + 3) % 3;
    let veins = '';
    if (veinSeed === 0) {
      veins = `M ${50 - fw + 5} ${browY - 4} Q ${50 - 10} ${browY + 6} ${50 - 4} ${browY + 22} L ${50 - 7} ${chinY - 14} ` +
              `M ${50 + 8} ${topY + 12} L ${50 + 5} ${browY} L ${50 + 12} ${browY + 12}`;
    } else if (veinSeed === 1) {
      veins = `M ${50 + fw - 6} ${browY - 2} Q ${50 + 8} ${browY + 10} ${50 + 3} ${chinY - 12} ` +
              `M ${50 - 9} ${topY + 14} L ${50 - 4} ${browY + 4} L ${50 - 13} ${browY + 16}`;
    } else {
      veins = `M ${50 - 2} ${topY + 8} L ${50 - 6} ${browY + 2} L ${50 + 2} ${browY + 18} L ${50 - 4} ${chinY - 12} ` +
              `M ${50 + fw - 7} ${browY + 6} L ${50 + 9} ${browY + 14}`;
    }
    s += `<path d="${veins}" fill="none" stroke="${gold.dk}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>`;
    s += `<path d="${veins}" fill="none" stroke="${gold.leaf}" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round"/>`;
    s += `<path d="${veins}" fill="none" stroke="${gold.vein}" stroke-width="0.35" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
    s += `</g>`;

    // ---- carved brow ridge (a soft sculpted arch over each eye) ----
    s += `<path d="M ${50 - 17} ${browY - 2} Q ${50 - 9} ${browY - 5} ${50 - 2} ${browY - 1}" fill="none" stroke="${mat.dk}" stroke-width="1.4" stroke-linecap="round" opacity="0.5"/>`;
    s += `<path d="M ${50 + 17} ${browY - 2} Q ${50 + 9} ${browY - 5} ${50 + 2} ${browY - 1}" fill="none" stroke="${mat.dk}" stroke-width="1.4" stroke-linecap="round" opacity="0.5"/>`;

    // ---- BLANK CARVED / HOLLOW statue EYES, softly glowing from within ----
    const eyeY = browY + 4;
    const blankEye = (cx: number): string => {
      const erx = 5.4, ery = 3.4;
      // carved hollow socket (recessed shadow)
      let e = `<ellipse cx="${cx}" cy="${eyeY}" rx="${erx + 1.2}" ry="${ery + 1.0}" fill="${mat.dk}" opacity="0.45"/>`;
      // inner glow well
      e += `<ellipse cx="${cx}" cy="${eyeY}" rx="${erx}" ry="${ery}" fill="${glow}" opacity="0.22"/>`;
      // smooth blank carved eyeball (no iris) — same material, lit
      e += `<ellipse cx="${cx}" cy="${eyeY}" rx="${erx - 0.6}" ry="${ery - 0.4}" fill="${mat.lt}" stroke="${I}" stroke-width="${IW * 0.7}" opacity="0.95"/>`;
      // soft inner glow core (the legend "still watching")
      e += `<ellipse cx="${cx}" cy="${eyeY}" rx="2.2" ry="1.7" fill="${glow}" opacity="0.55"/>`;
      e += `<ellipse cx="${cx}" cy="${eyeY}" rx="1.0" ry="0.8" fill="#ffffff" opacity="0.85"/>`;
      // carved upper-lid line
      e += `<path d="M ${cx - erx} ${eyeY - 0.5} Q ${cx} ${eyeY - ery - 0.8} ${cx + erx} ${eyeY - 0.5}" fill="none" stroke="${mat.dk}" stroke-width="0.9" stroke-linecap="round" opacity="0.6"/>`;
      return e;
    };
    s += blankEye(50 - 9.5) + blankEye(50 + 9.5);

    // ---- noble timeless closed MOUTH (a calm carved line, slight serene set) ----
    const mY = chinY - 13;
    s += `<path d="M ${50 - 6.5} ${mY} Q 50 ${mY + 1.6} ${50 + 6.5} ${mY}" fill="none" stroke="${mat.dk}" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>`;
    s += `<path d="M ${50 - 6.5} ${mY} Q 50 ${mY - 1.2} ${50 + 6.5} ${mY}" fill="none" stroke="${mat.hl}" stroke-width="0.6" stroke-linecap="round" opacity="0.5"/>`;

    // ---- GOLDEN LAUREL WREATH crowning the head (two sweeping leafed branches) ----
    const leaf = (cx: number, cy: number, ang: number, len: number): string => {
      const r = ang * Math.PI / 180;
      const tx = cx + Math.cos(r) * len, ty = cy + Math.sin(r) * len;
      const nx = -Math.sin(r), ny = Math.cos(r);
      const wid = len * 0.42;
      const mx = (cx + tx) / 2, my = (cy + ty) / 2;
      return `<path d="M ${cx} ${cy} Q ${mx + nx * wid} ${my + ny * wid} ${tx} ${ty} Q ${mx - nx * wid} ${my - ny * wid} ${cx} ${cy} Z" fill="${gold.leaf}" stroke="${gold.dk}" stroke-width="0.4" stroke-linejoin="round"/>` +
             `<path d="M ${cx} ${cy} L ${tx} ${ty}" stroke="${gold.vein}" stroke-width="0.4" opacity="0.8"/>`;
    };
    // wreath base band arcing across the brow/temples
    const wlx = 50 - fw + 2, wrx = 50 + fw - 2, wTopY = topY + 5;
    s += `<path d="M ${wlx} ${browY - 4} Q 50 ${wTopY - 4} ${wrx} ${browY - 4}" fill="none" stroke="${gold.dk}" stroke-width="3.4" stroke-linecap="round" opacity="0.55"/>`;
    s += `<path d="M ${wlx} ${browY - 4} Q 50 ${wTopY - 4} ${wrx} ${browY - 4}" fill="none" stroke="${gold.leaf}" stroke-width="2.0" stroke-linecap="round"/>`;
    // leaves fanning along each branch (left branch leaves point up-back, right up-back)
    let lv = '';
    for (let k = 0; k < 5; k++) {
      const t = k / 4;
      // left branch
      const lxc = wlx + (50 - wlx) * t * 0.85;
      const lyc = (browY - 4) + (wTopY - 4 - (browY - 4)) * (t * t);
      lv += leaf(lxc, lyc, 235 - k * 8, 7.5 - k * 0.7);
      // right branch (mirror)
      const rxc = wrx - (wrx - 50) * t * 0.85;
      const ryc = (browY - 4) + (wTopY - 4 - (browY - 4)) * (t * t);
      lv += leaf(rxc, ryc, 305 + k * 8, 7.5 - k * 0.7);
    }
    s += lv;
    // small berry / tie-knot where the two branches meet at the brow centre-front
    s += `<circle cx="50" cy="${wTopY - 4}" r="1.6" fill="${gold.vein}" stroke="${gold.dk}" stroke-width="0.5"/>`;
    s += `<circle cx="50" cy="${wTopY - 4}" r="0.6" fill="#ffffff" opacity="0.7"/>`;

    return s;
  }

  // ============================================================================
  // ROKYKARIO (volcanic magma-rock) — a fully SELF-CONTAINED renderer for the new
  // exotic species: a LIVING VOLCANIC MAGMA-ROCK being, the elemental OPPOSITE of the
  // monument. Jagged cracked BASALT / OBSIDIAN plates shot through with glowing molten
  // LAVA cracks, smouldering EMBER eyes, internal magma glow leaking from the seams, a
  // rough crest of rock spikes. It does NOT call any human / crystalline / saurian /
  // monument helper, so everything else stays byte-for-byte unchanged whenever
  // species !== 'rokykario'. Deterministic from the descriptor indices.
  //   skinTone -> rock tone (dark basalt -> light ash), eyeColor -> lava/ember glow,
  //   hairColor -> crest / ember accent, baseFaceId -> silhouette + crack jitter.
  // ============================================================================
  private drawRokykario(): string {
    const C = PlayerFaceComponent;
    const rock = C.ROK_ROCK[(((this.skinTone % C.ROK_ROCK.length) + C.ROK_ROCK.length) % C.ROK_ROCK.length)];
    const lava = C.ROK_LAVA[(((this.eyeColor % C.ROK_LAVA.length) + C.ROK_LAVA.length) % C.ROK_LAVA.length)];
    const crest = C.ROK_CREST[(((this.hairColor % C.ROK_CREST.length) + C.ROK_CREST.length) % C.ROK_CREST.length)];
    const I = '#0b0806';
    const IW = this.style === 'sports' ? 1.9 : (this.style === 'premium' ? 1.3 : 1.6);
    const uid = 'r' + this.skinTone + '_' + this.eyeColor + '_' + this.hairColor + '_' + this.baseFaceId + this.style;

    // deterministic silhouette + crack-layout jitter
    const j = (((this.baseFaceId % 4) + 4) % 4);
    const fw = 26 + j * 0.8;       // half-width across the temples
    const chinY = 84 + (j % 2);    // chin depth (heavy slab jaw)
    const browY = 45 - (j % 2);    // brow / eye band height
    const topY = 16;
    const crackSeed = (((this.baseFaceId * 5 + this.skinTone) % 4) + 4) % 4;

    let s = '';

    // ---- hot magma aura behind the rock (radiating heat) ----
    s += `<ellipse cx="50" cy="56" rx="38" ry="44" fill="${lava.mid}" opacity="0.07"/>`;
    s += `<ellipse cx="50" cy="58" rx="30" ry="36" fill="${lava.bright}" opacity="0.05"/>`;

    // ---- rough rocky NECK / shoulders column (broken slab, not a smooth plinth) ----
    s += `<path d="M 41 ${chinY - 5} L 36 93 L 64 93 L 59 ${chinY - 5} L 56 ${chinY - 8} L 50 ${chinY - 3} L 44 ${chinY - 8} Z" fill="${rock.dk}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    s += `<path d="M 44 ${chinY - 6} L 47 90 M 56 ${chinY - 6} L 53 90" stroke="${lava.mid}" stroke-width="1.1" stroke-linecap="round" opacity="0.6"/>`;
    s += `<path d="M 44 ${chinY - 6} L 47 90 M 56 ${chinY - 6} L 53 90" stroke="${lava.bright}" stroke-width="0.4" stroke-linecap="round" opacity="0.85"/>`;

    // ---- jagged ROCK HEAD outline: an angular broken-slab skull (NOT a smooth oval).
    //      Built from straight chamfered facets so the silhouette reads as cracked rock.
    const head =
      `M 50 ${topY} ` +
      `L ${50 + fw * 0.55} ${topY + 2} L ${50 + fw} ${topY + 13} ` +              // top-right chamfer
      `L ${50 + fw + 1} ${browY + 1} L ${50 + fw - 2} ${browY + 14} ` +            // right temple slab
      `L ${50 + fw - 5} ${chinY - 18} L ${50 + 13} ${chinY - 7} ` +                // right cheek facet
      `L ${50 + 6} ${chinY - 1} L 50 ${chinY + 1} L ${50 - 6} ${chinY - 1} ` +     // heavy slab chin
      `L ${50 - 13} ${chinY - 7} L ${50 - fw + 5} ${chinY - 18} ` +                // left cheek facet
      `L ${50 - fw + 2} ${browY + 14} L ${50 - fw - 1} ${browY + 1} ` +            // left temple slab
      `L ${50 - fw} ${topY + 13} L ${50 - fw * 0.55} ${topY + 2} Z`;               // top-left chamfer
    s += `<path d="${head}" fill="${rock.md}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    s += `<clipPath id="hr${uid}"><path d="${head}"/></clipPath>`;

    // ---- faceted PLANE shading: angular lit / shadow rock plates ----
    s += `<g clip-path="url(#hr${uid})">`;
    // lit upper-left forehead plate
    s += `<path d="M 50 ${topY} L ${50 - fw * 0.55} ${topY + 2} L ${50 - fw} ${topY + 13} L ${50 - fw + 4} ${browY + 4} L ${50 - 3} ${browY + 2} L ${50 - 2} ${topY + 6} Z" fill="${rock.lt}" opacity="0.85"/>`;
    // bright forehead crest edge
    s += `<path d="M ${50 - fw * 0.5} ${topY + 4} L 50 ${topY + 1} L ${50 + fw * 0.5} ${topY + 4} L 50 ${topY + 10} Z" fill="${rock.hl}" opacity="0.7"/>`;
    // shadow right cheek / jaw plate
    s += `<path d="M ${50 + 3} ${browY + 2} L ${50 + fw - 2} ${browY + 14} L ${50 + fw - 5} ${chinY - 18} L ${50 + 13} ${chinY - 7} L ${50 + 4} ${chinY - 4} Z" fill="${rock.dk}" opacity="0.55"/>`;
    // lower jaw-slab shadow
    s += `<path d="M ${50 - 13} ${chinY - 7} L 50 ${chinY + 1} L ${50 + 13} ${chinY - 7} L 50 ${chinY - 5} Z" fill="${rock.dk}" opacity="0.5"/>`;
    // mid cheek facet (left)
    s += `<path d="M ${50 - fw + 4} ${browY + 4} L ${50 - fw + 5} ${chinY - 18} L ${50 - 13} ${chinY - 7} L ${50 - 5} ${browY + 8} Z" fill="${rock.lt}" opacity="0.4"/>`;

    // ---- glowing molten LAVA CRACKS / veins shot through the plates ----
    let cracks = '';
    if (crackSeed === 0) {
      cracks = `M ${50 - fw + 6} ${topY + 12} L ${50 - 8} ${browY - 2} L ${50 - 3} ${browY + 12} L ${50 - 9} ${chinY - 14} ` +
               `M ${50 + 4} ${topY + 9} L ${50 + 10} ${browY + 4} L ${50 + 6} ${browY + 18} ` +
               `M ${50 + fw - 7} ${browY + 8} L ${50 + 11} ${chinY - 10}`;
    } else if (crackSeed === 1) {
      cracks = `M ${50 + fw - 6} ${topY + 11} L ${50 + 7} ${browY} L ${50 + 12} ${browY + 16} L ${50 + 4} ${chinY - 12} ` +
               `M ${50 - 5} ${topY + 8} L ${50 - 11} ${browY + 6} L ${50 - 5} ${browY + 20} ` +
               `M ${50 - fw + 7} ${browY + 10} L ${50 - 10} ${chinY - 9}`;
    } else if (crackSeed === 2) {
      cracks = `M 50 ${topY + 6} L ${50 - 4} ${browY - 2} L ${50 + 4} ${browY + 14} L ${50 - 3} ${chinY - 11} ` +
               `M ${50 - fw + 6} ${browY - 2} L ${50 - 10} ${browY + 14} ` +
               `M ${50 + fw - 6} ${browY} L ${50 + 9} ${browY + 16} L ${50 + 13} ${chinY - 12}`;
    } else {
      cracks = `M ${50 - fw + 5} ${topY + 14} L ${50 - 7} ${browY + 2} L ${50 + 2} ${browY + 10} L ${50 - 4} ${browY + 22} ` +
               `M ${50 + 6} ${topY + 10} L ${50 + 13} ${browY + 8} ` +
               `M ${50 - 9} ${chinY - 14} L ${50 + 8} ${chinY - 9}`;
    }
    // wide deep-glow underlay -> mid lava -> bright hot core line (a hot seam look)
    s += `<path d="${cracks}" fill="none" stroke="${lava.dk}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>`;
    s += `<path d="${cracks}" fill="none" stroke="${lava.mid}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`;
    s += `<path d="${cracks}" fill="none" stroke="${lava.bright}" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/>`;
    // a few molten glow blobs where cracks meet (magma leaking from the core)
    s += `<circle cx="${50 - 8}" cy="${browY - 2}" r="1.6" fill="${lava.mid}" opacity="0.5"/>`;
    s += `<circle cx="${50 - 8}" cy="${browY - 2}" r="0.7" fill="${lava.bright}" opacity="0.9"/>`;
    s += `<circle cx="${50 + 10}" cy="${browY + 6}" r="1.3" fill="${lava.mid}" opacity="0.45"/>`;
    s += `</g>`;

    // ---- heavy stone BROW ridge (a hard angular shelf over each eye) ----
    s += `<path d="M ${50 - 18} ${browY - 1} L ${50 - 9} ${browY - 4} L ${50 - 2} ${browY} L ${50 - 9} ${browY - 1.5} Z" fill="${rock.dk}" stroke="${I}" stroke-width="${IW * 0.7}" stroke-linejoin="round" opacity="0.9"/>`;
    s += `<path d="M ${50 + 18} ${browY - 1} L ${50 + 9} ${browY - 4} L ${50 + 2} ${browY} L ${50 + 9} ${browY - 1.5} Z" fill="${rock.dk}" stroke="${I}" stroke-width="${IW * 0.7}" stroke-linejoin="round" opacity="0.9"/>`;

    // ---- smouldering EMBER EYES — a hot molten orb sunk in a dark rocky socket ----
    const eyeY = browY + 5;
    const emberEye = (cx: number): string => {
      const erx = 5.2, ery = 3.6;
      // dark recessed rock socket
      let e = `<path d="M ${cx - erx - 1.5} ${eyeY - 0.5} L ${cx - 1} ${eyeY - ery - 1.5} L ${cx + erx + 1.5} ${eyeY - 1} L ${cx + erx} ${eyeY + ery + 1} L ${cx - erx} ${eyeY + ery} Z" fill="${rock.dk}" stroke="${I}" stroke-width="${IW * 0.6}" stroke-linejoin="round"/>`;
      // outer ember glow
      e += `<ellipse cx="${cx}" cy="${eyeY}" rx="${erx}" ry="${ery}" fill="${lava.dk}" opacity="0.6"/>`;
      // molten mid ring
      e += `<ellipse cx="${cx}" cy="${eyeY}" rx="${erx - 1.4}" ry="${ery - 1.0}" fill="${lava.mid}" opacity="0.95"/>`;
      // bright hot core
      e += `<ellipse cx="${cx}" cy="${eyeY}" rx="2.0" ry="1.6" fill="${lava.bright}"/>`;
      e += `<ellipse cx="${cx - 0.6}" cy="${eyeY - 0.5}" rx="0.8" ry="0.6" fill="#ffffff" opacity="0.9"/>`;
      // faint heat haze rising from the eye
      e += `<path d="M ${cx} ${eyeY - ery - 1} q -1 -2 0 -4 q 1 -2 0 -4" fill="none" stroke="${lava.mid}" stroke-width="0.5" opacity="0.35"/>`;
      return e;
    };
    s += emberEye(50 - 9.5) + emberEye(50 + 9.5);

    // ---- cracked molten MOUTH-seam (a glowing fissure, not a calm carved line) ----
    const mY = chinY - 14;
    s += `<path d="M ${50 - 7} ${mY} L ${50 - 3} ${mY + 1.6} L 50 ${mY - 0.4} L ${50 + 4} ${mY + 1.8} L ${50 + 7} ${mY}" fill="none" stroke="${lava.dk}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>`;
    s += `<path d="M ${50 - 7} ${mY} L ${50 - 3} ${mY + 1.6} L 50 ${mY - 0.4} L ${50 + 4} ${mY + 1.8} L ${50 + 7} ${mY}" fill="none" stroke="${lava.mid}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`;
    s += `<path d="M ${50 - 7} ${mY} L ${50 - 3} ${mY + 1.6} L 50 ${mY - 0.4} L ${50 + 4} ${mY + 1.8} L ${50 + 7} ${mY}" fill="none" stroke="${lava.bright}" stroke-width="0.4" stroke-linecap="round" stroke-linejoin="round"/>`;

    // ---- rough CREST of jagged rock SPIKES / shards along the crown ----
    const spike = (bx: number, by: number, h: number, lean: number): string => {
      const tx = bx + lean, ty = by - h;
      return `<path d="M ${bx - 2.4} ${by} L ${tx} ${ty} L ${bx + 2.4} ${by} Z" fill="${crest.dk}" stroke="${I}" stroke-width="${IW * 0.6}" stroke-linejoin="round"/>` +
             `<path d="M ${bx - 0.6} ${by} L ${tx} ${ty} L ${bx + 0.8} ${by - h * 0.45} Z" fill="${crest.mid}" opacity="0.9"/>` +
             `<path d="M ${tx} ${ty} L ${tx - 0.4} ${ty + h * 0.4}" stroke="${crest.bright}" stroke-width="0.6" stroke-linecap="round" opacity="0.85"/>`;
    };
    let cr = '';
    const baseTopY = topY + 3;
    const spikeDefs = [
      { x: 50 - fw * 0.62, h: 7,  lean: -3 },
      { x: 50 - fw * 0.32, h: 11, lean: -2 },
      { x: 50,             h: 14, lean: 0 },
      { x: 50 + fw * 0.32, h: 11, lean: 2 },
      { x: 50 + fw * 0.62, h: 7,  lean: 3 },
    ];
    // crown arc: spikes sit slightly lower toward the temples
    for (let k = 0; k < spikeDefs.length; k++) {
      const sd = spikeDefs[k];
      const dy = Math.abs(sd.x - 50) / fw * 6;  // temple spikes start lower
      cr += spike(sd.x, baseTopY + dy + (k % 2), sd.h + ((this.baseFaceId + k) % 3), sd.lean);
    }
    s += cr;
    // a couple of small back shard tips peeking behind the temples
    s += `<path d="M ${50 - fw - 1} ${browY + 2} L ${50 - fw - 5} ${browY - 6} L ${50 - fw + 2} ${browY - 1} Z" fill="${crest.dk}" stroke="${I}" stroke-width="${IW * 0.5}" stroke-linejoin="round" opacity="0.9"/>`;
    s += `<path d="M ${50 + fw + 1} ${browY + 2} L ${50 + fw + 5} ${browY - 6} L ${50 + fw - 2} ${browY - 1} Z" fill="${crest.dk}" stroke="${I}" stroke-width="${IW * 0.5}" stroke-linejoin="round" opacity="0.9"/>`;

    // ---- rising ember / smoke MOTES (smouldering element) ----
    const moteX = [50 - fw * 0.4, 50 + fw * 0.5, 50 - 4, 50 + fw * 0.2];
    const moteY = [topY - 2, topY + 1, topY - 5, browY - 8];
    for (let k = 0; k < moteX.length; k++) {
      const r = 0.7 + ((this.baseFaceId + k) % 2) * 0.5;
      s += `<circle cx="${moteX[k]}" cy="${moteY[k]}" r="${r}" fill="${crest.bright}" opacity="${0.5 - k * 0.08}"/>`;
    }

    return s;
  }

  // ============================================================================
  // ELEFTAMIDE — a fully SELF-CONTAINED renderer for the WINGED / AVIAN "free spirit"
  // species ("Eleft-" -> Greek eleftheria = FREEDOM). A light, airy, aerodynamic avian
  // face: a narrow aquiline head framed by sleek swept-back FEATHERS, small wing-like
  // plumage CRESTS at the brow/temples, a subtle BEAK-like nose ridge, keen far-seeing
  // raptor eyes, drifting loose feathers and a faint WIND motif. It does NOT call any
  // human / crystalline / saurian / monument / rokykario helper, so everything else
  // stays byte-for-byte unchanged whenever species !== 'eleftamide'. Deterministic.
  //   skinTone -> face/base-plumage tone, eyeColor -> eye hue,
  //   hairColor -> feather/plumage crest tint (defining), baseFaceId -> silhouette jitter.
  // ============================================================================
  private drawEleftamide(): string {
    const C = PlayerFaceComponent;
    const skin = C.ELF_SKIN[(((this.skinTone % C.ELF_SKIN.length) + C.ELF_SKIN.length) % C.ELF_SKIN.length)];
    const eye = C.ELF_EYE[(((this.eyeColor % C.ELF_EYE.length) + C.ELF_EYE.length) % C.ELF_EYE.length)];
    const plume = C.ELF_PLUME[(((this.hairColor % C.ELF_PLUME.length) + C.ELF_PLUME.length) % C.ELF_PLUME.length)];
    const I = this.style === 'sports' ? '#2a2418' : (this.style === 'premium' ? '#352e22' : '#2e281c');
    const IW = this.style === 'sports' ? 1.6 : (this.style === 'premium' ? 1.1 : 1.4);
    const uid = 'e' + this.skinTone + '_' + this.eyeColor + '_' + this.hairColor + '_' + this.baseFaceId + this.style;

    // deterministic silhouette + feather-layout jitter
    const j = (((this.baseFaceId % 4) + 4) % 4);
    const fw = 21 + j * 0.7;        // half-width across the temples (narrow, aerodynamic)
    const chinY = 82 + (j % 2);     // chin depth (tapered, pointed)
    const browY = 46 - (j % 2);     // brow / eye band height
    const topY = 17;
    const layout = (((this.baseFaceId * 3 + this.hairColor) % 4) + 4) % 4;

    let s = '';

    // ---- faint WIND motif behind the head (streaming air lines — freedom/flight) ----
    s += `<g opacity="0.5">`;
    s += `<path d="M 8 40 Q 24 36 40 40" fill="none" stroke="${plume.mid}" stroke-width="1.1" stroke-linecap="round" opacity="0.35"/>`;
    s += `<path d="M 6 52 Q 22 49 36 53" fill="none" stroke="${plume.bright}" stroke-width="0.9" stroke-linecap="round" opacity="0.3"/>`;
    s += `<path d="M 92 44 Q 76 40 60 44" fill="none" stroke="${plume.mid}" stroke-width="1.1" stroke-linecap="round" opacity="0.35"/>`;
    s += `<path d="M 94 56 Q 78 53 64 57" fill="none" stroke="${plume.bright}" stroke-width="0.9" stroke-linecap="round" opacity="0.3"/>`;
    s += `</g>`;

    // ---- swept-back WING-like plumage CRESTS at the temples (folded wings) ----
    // a feather: a leaf-like blade with a central rachis quill and a bright tip.
    const feather = (bx: number, by: number, len: number, ang: number, w: number, col: { bright: string; mid: string; dk: string; tip: string }): string => {
      const rad = ang * Math.PI / 180;
      const tx = bx + Math.cos(rad) * len, ty = by + Math.sin(rad) * len;
      const px = -Math.sin(rad) * w, py = Math.cos(rad) * w;          // perpendicular spread
      const mx = bx + Math.cos(rad) * len * 0.5, my = by + Math.sin(rad) * len * 0.5;
      const blade =
        `M ${bx} ${by} ` +
        `Q ${mx + px} ${my + py} ${tx} ${ty} ` +
        `Q ${mx - px} ${my - py} ${bx} ${by} Z`;
      let f = `<path d="${blade}" fill="${col.mid}" stroke="${I}" stroke-width="${IW * 0.55}" stroke-linejoin="round"/>`;
      f += `<path d="${blade}" fill="${col.dk}" opacity="0.28"/>`;     // soft shadow lobe
      f += `<path d="M ${bx} ${by} Q ${mx + px * 0.5} ${my + py * 0.5} ${tx} ${ty}" fill="none" stroke="${col.bright}" stroke-width="${IW * 0.4}" stroke-linecap="round" opacity="0.8"/>`;
      f += `<path d="M ${bx} ${by} L ${tx} ${ty}" fill="none" stroke="${col.tip}" stroke-width="0.5" stroke-linecap="round" opacity="0.85"/>`; // rachis
      f += `<circle cx="${tx}" cy="${ty}" r="0.9" fill="${col.tip}" opacity="0.9"/>`; // bright tip
      return f;
    };
    // each side: 3 swept-back feathers fanning up-and-out from the temple, longest in middle
    const sideCrest = (sign: number): string => {
      let c = '';
      const bx = 50 + sign * (fw - 3);
      const defs = [
        { by: browY - 4,  len: 16 + (j % 2) * 2, ang: -22, w: 4.0 },
        { by: browY - 1,  len: 21 + ((this.baseFaceId) % 3), ang: -8,  w: 5.0 },
        { by: browY + 4,  len: 17 + (j % 2) * 2, ang: 6,   w: 4.2 },
      ];
      for (const d of defs) {
        c += feather(bx, d.by, d.len, d.ang * sign + (sign < 0 ? 180 : 0), d.w, plume);
      }
      return c;
    };
    // back layer of crest (drawn before the head so they tuck behind the face)
    s += sideCrest(-1) + sideCrest(1);

    // ---- airy NECK / shoulders — slender, feathered collar (not a heavy slab) ----
    s += `<path d="M ${50 - 7} ${chinY - 4} L ${50 - 11} 93 L ${50 + 11} 93 L ${50 + 7} ${chinY - 4} Z" fill="${skin.dk}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    // small downy collar feathers across the chest
    for (let k = -2; k <= 2; k++) {
      const cx = 50 + k * 4.6;
      s += `<path d="M ${cx} ${chinY + 1} q ${k} 4 0 7 q ${-k} -4 0 -7 Z" fill="${plume.mid}" stroke="${I}" stroke-width="${IW * 0.45}" stroke-linejoin="round" opacity="0.9"/>`;
      s += `<path d="M ${cx} ${chinY + 1} l 0 5.5" stroke="${plume.bright}" stroke-width="0.4" stroke-linecap="round" opacity="0.7"/>`;
    }

    // ---- narrow AQUILINE avian HEAD: a tapered teardrop skull (points to the chin) ----
    const head =
      `M 50 ${topY} ` +
      `C ${50 + fw * 0.7} ${topY} ${50 + fw} ${topY + 9} ${50 + fw} ${browY - 2} ` +     // upper right curve
      `C ${50 + fw} ${browY + 12} ${50 + fw - 4} ${chinY - 16} ${50 + 7} ${chinY - 4} ` + // right cheek -> tapered jaw
      `Q 50 ${chinY + 2} ${50 - 7} ${chinY - 4} ` +                                       // pointed chin
      `C ${50 - fw + 4} ${chinY - 16} ${50 - fw} ${browY + 12} ${50 - fw} ${browY - 2} ` +
      `C ${50 - fw} ${topY + 9} ${50 - fw * 0.7} ${topY} 50 ${topY} Z`;
    s += `<path d="${head}" fill="${skin.md}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    s += `<clipPath id="he${uid}"><path d="${head}"/></clipPath>`;

    // ---- soft feather-down shading on the face ----
    s += `<g clip-path="url(#he${uid})">`;
    // lit upper-left
    s += `<path d="M 50 ${topY} C ${50 - fw * 0.7} ${topY} ${50 - fw} ${topY + 9} ${50 - fw} ${browY - 2} L ${50 - 4} ${browY} L ${50 - 2} ${topY + 6} Z" fill="${skin.lt}" opacity="0.7"/>`;
    // bright forehead crown
    s += `<path d="M ${50 - fw * 0.5} ${topY + 3} Q 50 ${topY - 1} ${50 + fw * 0.5} ${topY + 3} Q 50 ${topY + 9} ${50 - fw * 0.5} ${topY + 3} Z" fill="${skin.hl}" opacity="0.55"/>`;
    // soft cheek shadow (right)
    s += `<path d="M ${50 + 2} ${browY + 6} C ${50 + fw} ${browY + 12} ${50 + fw - 4} ${chinY - 16} ${50 + 7} ${chinY - 4} L ${50 + 2} ${chinY - 8} Z" fill="${skin.dk}" opacity="0.4"/>`;
    // faint fine FEATHER-DOWN texture lines fanning down the cheeks (avian, not human pores)
    for (let k = 0; k < 4; k++) {
      const fx = 50 - 10 + k * 6.5;
      s += `<path d="M ${fx} ${browY + 9} q ${(k - 1.5) * 0.6} 7 0 13" fill="none" stroke="${skin.dk}" stroke-width="0.4" stroke-linecap="round" opacity="0.35"/>`;
    }
    s += `</g>`;

    // ---- small swept brow-feather tufts just above each eye (defining plumage) ----
    const browTuft = (sign: number): string => {
      const bx = 50 + sign * 4, by = browY - 2;
      let t = '';
      for (let k = 0; k < 3; k++) {
        const len = 7 + k * 2 + (layout % 2);
        t += feather(bx + sign * k * 2.2, by - k * 0.6, len, (-18 - k * 6) * sign + (sign < 0 ? 180 : 0), 2.2, plume);
      }
      return t;
    };
    s += browTuft(-1) + browTuft(1);

    // ---- keen far-seeing RAPTOR EYES (large round bright iris, hot catch-light) ----
    const eyeY = browY + 6;
    const raptorEye = (cx: number): string => {
      const erx = 5.6, ery = 4.6;
      // pale feather-rimmed socket
      let e = `<ellipse cx="${cx}" cy="${eyeY}" rx="${erx + 0.8}" ry="${ery + 0.6}" fill="${skin.lt}" stroke="${I}" stroke-width="${IW * 0.5}"/>`;
      // sharp avian upper lid line (gives the keen aquiline look)
      e += `<path d="M ${cx - erx - 0.5} ${eyeY - 1} Q ${cx} ${eyeY - ery - 1.6} ${cx + erx + 0.8} ${eyeY - 0.4}" fill="none" stroke="${I}" stroke-width="${IW * 0.7}" stroke-linecap="round"/>`;
      // white sclera
      e += `<ellipse cx="${cx}" cy="${eyeY}" rx="${erx}" ry="${ery}" fill="#fbfdff"/>`;
      // large bright iris (raptor)
      e += `<circle cx="${cx}" cy="${eyeY}" r="${ery - 0.4}" fill="${eye.dk}"/>`;
      e += `<circle cx="${cx}" cy="${eyeY}" r="${ery - 1.2}" fill="${eye.mid}"/>`;
      e += `<circle cx="${cx}" cy="${eyeY}" r="${ery - 2.2}" fill="${eye.bright}" opacity="0.85"/>`;
      // crisp dark pupil + hot catch-light
      e += `<circle cx="${cx}" cy="${eyeY}" r="1.4" fill="#0a0c10"/>`;
      e += `<circle cx="${cx - 1}" cy="${eyeY - 1.3}" r="0.9" fill="#ffffff"/>`;
      return e;
    };
    s += raptorEye(50 - 8) + raptorEye(50 + 8);

    // ---- subtle aquiline BEAK-like NOSE ridge (soft beak, not a fanged snout) ----
    const nY = eyeY + 4;
    s += `<path d="M ${50 - 1.5} ${nY} L 50 ${nY + 9} L ${50 + 3.5} ${nY + 8} L ${50 + 1.5} ${nY - 1} Z" fill="${skin.dk}" stroke="${I}" stroke-width="${IW * 0.6}" stroke-linejoin="round" opacity="0.85"/>`;
    // bright ridge highlight down the beak
    s += `<path d="M ${50 + 0.6} ${nY} L ${50 + 1.4} ${nY + 8}" stroke="${skin.hl}" stroke-width="0.7" stroke-linecap="round" opacity="0.8"/>`;
    // a small downward beak hook at the tip (avian)
    s += `<path d="M 50 ${nY + 9} q 2.4 1.4 1.6 3.4 q -0.8 -1 -2.6 -1.6 Z" fill="${skin.dk}" stroke="${I}" stroke-width="${IW * 0.5}" stroke-linejoin="round" opacity="0.85"/>`;
    // soft nostril notch
    s += `<circle cx="${50 + 0.6}" cy="${nY + 4}" r="0.7" fill="${I}" opacity="0.45"/>`;

    // ---- calm, fine mouth-line below the beak (noble, understated) ----
    const mY = nY + 13;
    s += `<path d="M ${50 - 4} ${mY} Q 50 ${mY + 1.8} ${50 + 4} ${mY}" fill="none" stroke="${I}" stroke-width="${IW * 0.7}" stroke-linecap="round" opacity="0.8"/>`;

    // ---- a swept CROWN crest of feathers along the top of the head (signature) ----
    let crown = '';
    const crownDefs = [
      { x: 50 - fw * 0.34, len: 10, ang: -86, w: 2.4 },
      { x: 50 - fw * 0.12, len: 14, ang: -90, w: 2.8 },
      { x: 50 + fw * 0.12, len: 14, ang: -90, w: 2.8 },
      { x: 50 + fw * 0.34, len: 10, ang: -94, w: 2.4 },
    ];
    for (let k = 0; k < crownDefs.length; k++) {
      const cd = crownDefs[k];
      crown += feather(cd.x, topY + 1, cd.len + ((this.baseFaceId + k) % 3), cd.ang, cd.w, plume);
    }
    s += crown;

    // ---- a few FLOATING loose feathers drifting around the head (freedom motif) ----
    const driftX = [50 - fw - 6, 50 + fw + 5, 50 - fw - 2, 50 + fw + 9];
    const driftY = [topY + 24, topY + 12, chinY - 20, browY + 18];
    const driftA = [layout === 0 ? 150 : 120, 40, 200, 24];
    for (let k = 0; k < driftX.length; k++) {
      if (((this.baseFaceId + k) % 4) === 3 && k > 1) continue; // light jitter on count
      s += feather(driftX[k], driftY[k], 7 + (k % 2) * 2, driftA[k], 2.3, plume);
    }

    return s;
  }

  private drawAquanimenti(): string {
    const C = PlayerFaceComponent;
    const skin = C.AQUA_SKIN[(((this.skinTone % C.AQUA_SKIN.length) + C.AQUA_SKIN.length) % C.AQUA_SKIN.length)];
    const eye = C.AQUA_EYE[(((this.eyeColor % C.AQUA_EYE.length) + C.AQUA_EYE.length) % C.AQUA_EYE.length)];
    const fin = C.AQUA_FIN[(((this.hairColor % C.AQUA_FIN.length) + C.AQUA_FIN.length) % C.AQUA_FIN.length)];
    const I = this.style === 'sports' ? '#06222c' : (this.style === 'premium' ? '#0a2832' : '#08242e');
    const IW = this.style === 'sports' ? 1.6 : (this.style === 'premium' ? 1.1 : 1.4);
    const uid = 'aq' + this.skinTone + '_' + this.eyeColor + '_' + this.hairColor + '_' + this.baseFaceId + this.style;

    // distinct AQUATIC proportions: a BROAD domed cranium tapering to a SMALL chin
    // (deliberately the inverse of the avian eleftamide teardrop).
    const j = (((this.baseFaceId % 4) + 4) % 4);
    const topY = 14;
    const cranY = 30;
    const browY = 45 - (j % 2);
    const chinY = 85 + (j % 2);
    const fw = 25 + j * 0.6;        // wide cranium half-width
    const eyeY = browY + 8;
    const layout = (((this.baseFaceId * 3 + this.hairColor) % 4) + 4) % 4;

    let s = '';

    // ---- deep-water light shafts + drifting bubbles behind the head ----
    s += `<g opacity="0.45">`;
    s += `<path d="M 18 6 L 30 44" stroke="${fin.bright}" stroke-width="2.4" stroke-linecap="round" opacity="0.12"/>`;
    s += `<path d="M 74 4 L 66 40" stroke="${fin.bright}" stroke-width="3.0" stroke-linecap="round" opacity="0.1"/>`;
    s += `<path d="M 6 50 Q 22 47 36 52" fill="none" stroke="${fin.mid}" stroke-width="1.0" stroke-linecap="round" opacity="0.3"/>`;
    s += `<path d="M 94 54 Q 78 51 64 56" fill="none" stroke="${fin.mid}" stroke-width="1.0" stroke-linecap="round" opacity="0.3"/>`;
    s += `</g>`;

    // ---- EXTERNAL feathery GILL FRONDS (axolotl-style) flaring OUT to the sides — signature ----
    const frond = (bx: number, by: number, ang: number, len: number, sign: number): string => {
      const rad = ang * Math.PI / 180;
      const tx = bx + Math.cos(rad) * len, ty = by + Math.sin(rad) * len;
      const cx1 = bx + Math.cos(rad) * len * 0.45 - Math.sin(rad) * 4 * sign;
      const cy1 = by + Math.sin(rad) * len * 0.45 + Math.cos(rad) * 4 * sign;
      let f = `<path d="M ${bx} ${by} Q ${cx1 + 3 * sign} ${cy1} ${tx} ${ty} Q ${cx1 - sign} ${cy1} ${bx} ${by} Z" fill="${fin.mid}" opacity="0.42"/>`;
      f += `<path d="M ${bx} ${by} Q ${cx1} ${cy1} ${tx} ${ty}" fill="none" stroke="${fin.dk}" stroke-width="${IW * 0.5}" stroke-linecap="round"/>`;
      for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        const px = bx + (tx - bx) * t, py = by + (ty - by) * t;
        const bl = 4 + (k === 2 ? 1.6 : 0);
        f += `<path d="M ${px} ${py} l ${-Math.sin(rad) * bl * sign - Math.cos(rad)} ${Math.cos(rad) * bl * sign + 0.6}" stroke="${fin.bright}" stroke-width="0.7" stroke-linecap="round" opacity="0.85"/>`;
        f += `<path d="M ${px} ${py} l ${-Math.sin(rad) * bl * 0.7 * sign} ${Math.cos(rad) * bl * 0.7 * sign + 1.4}" stroke="${fin.mid}" stroke-width="0.6" stroke-linecap="round" opacity="0.7"/>`;
      }
      f += `<circle cx="${tx}" cy="${ty}" r="1.1" fill="${fin.edge}" opacity="0.9"/>`;
      return f;
    };
    const sideGills = (sign: number): string => {
      const bx = 50 + sign * (fw * 0.8);
      const defs = [
        { by: browY - 5, ang: -36, len: 14 },
        { by: browY + 1, ang: -12, len: 18 },
        { by: browY + 8, ang: 12, len: 15 },
      ];
      let g = '';
      for (const d of defs) {
        g += frond(bx, d.by, d.ang * sign + (sign < 0 ? 180 : 0), d.len + ((this.baseFaceId + d.by) % 3), sign);
      }
      return g;
    };
    s += sideGills(-1) + sideGills(1);

    // ---- slim NECK + translucent THROAT-FAN fin ----
    s += `<path d="M ${50 - 6} ${chinY - 4} L ${50 - 9} 93 L ${50 + 9} 93 L ${50 + 6} ${chinY - 4} Z" fill="${skin.dk}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    s += `<path d="M ${50 - 6} ${chinY - 2} Q ${50 - 16} ${chinY + 4} ${50 - 11} ${chinY + 13} Q ${50 - 5} ${chinY + 6} 50 ${chinY + 8} Q ${50 + 5} ${chinY + 6} ${50 + 11} ${chinY + 13} Q ${50 + 16} ${chinY + 4} ${50 + 6} ${chinY - 2} Z" fill="${fin.mid}" stroke="${I}" stroke-width="${IW * 0.4}" stroke-linejoin="round" opacity="0.5"/>`;

    // ---- broad domed HEAD (wide cranium, small chin) ----
    const head =
      `M 50 ${topY} ` +
      `C ${50 + fw * 0.95} ${topY} ${50 + fw} ${cranY - 4} ${50 + fw * 0.96} ${browY} ` +
      `C ${50 + fw * 0.84} ${browY + 20} ${50 + 13} ${chinY - 14} ${50 + 6} ${chinY - 2} ` +
      `Q 50 ${chinY + 3} ${50 - 6} ${chinY - 2} ` +
      `C ${50 - 13} ${chinY - 14} ${50 - fw * 0.84} ${browY + 20} ${50 - fw * 0.96} ${browY} ` +
      `C ${50 - fw} ${cranY - 4} ${50 - fw * 0.95} ${topY} 50 ${topY} Z`;
    s += `<path d="${head}" fill="${skin.md}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    s += `<clipPath id="he${uid}"><path d="${head}"/></clipPath>`;

    // ---- smooth wet shading: dome highlight, central sheen ridge, cheek shadow ----
    s += `<g clip-path="url(#he${uid})">`;
    s += `<path d="M ${50 - fw * 0.8} ${cranY - 2} Q 50 ${topY - 2} ${50 + fw * 0.8} ${cranY - 2} Q 50 ${cranY + 8} ${50 - fw * 0.8} ${cranY - 2} Z" fill="${skin.hl}" opacity="0.5"/>`;
    s += `<path d="M 50 ${topY + 5} L 50 ${chinY - 6}" stroke="${skin.hl}" stroke-width="2.6" stroke-linecap="round" opacity="0.16"/>`;
    s += `<path d="M 50 ${topY} C ${50 - fw * 0.95} ${topY} ${50 - fw} ${cranY - 4} ${50 - fw * 0.96} ${browY} L ${50 - 6} ${browY} L ${50 - 3} ${cranY} Z" fill="${skin.lt}" opacity="0.5"/>`;
    s += `<path d="M ${50 + 3} ${browY} C ${50 + fw * 0.84} ${browY + 20} ${50 + 13} ${chinY - 14} ${50 + 6} ${chinY - 2} L ${50 + 2} ${chinY - 8} Z" fill="${skin.dk}" opacity="0.42"/>`;
    for (let b = 0; b < 3; b++) {
      const by2 = browY + 4 + b * 8;
      s += `<ellipse cx="50" cy="${by2}" rx="${fw * 0.7}" ry="1.4" fill="${skin.hl}" opacity="0.1"/>`;
    }
    s += `</g>`;

    // ---- LATERAL LINE: sensory pit dots curving from under each eye toward the jaw ----
    const lateral = (sign: number): string => {
      let l = '';
      for (let k = 0; k < 5; k++) {
        const t = k / 4;
        const lx = 50 + sign * (10 + t * 7);
        const ly = eyeY + 5 + t * 14;
        l += `<circle cx="${lx}" cy="${ly}" r="0.8" fill="${I}" opacity="0.4"/>`;
        l += `<circle cx="${lx}" cy="${ly}" r="0.4" fill="${eye.bright}" opacity="0.5"/>`;
      }
      return l;
    };
    s += lateral(-1) + lateral(1);

    // ---- large LIDLESS spherical BIOLUMINESCENT eyes (wide-set, vertical slit pupil) ----
    const bulgeEye = (cx: number): string => {
      const er = 6.8;
      let e = `<circle cx="${cx}" cy="${eyeY}" r="${er + 1.4}" fill="none" stroke="${eye.bright}" stroke-width="0.7" opacity="0.32"/>`;
      e += `<circle cx="${cx}" cy="${eyeY}" r="${er + 0.6}" fill="${skin.dk}" stroke="${I}" stroke-width="${IW * 0.45}"/>`;
      e += `<circle cx="${cx}" cy="${eyeY}" r="${er}" fill="#061418"/>`;
      e += `<circle cx="${cx}" cy="${eyeY}" r="${er - 0.6}" fill="${eye.dk}"/>`;
      e += `<circle cx="${cx}" cy="${eyeY}" r="${er - 1.8}" fill="${eye.mid}"/>`;
      e += `<circle cx="${cx}" cy="${eyeY}" r="${er - 3.0}" fill="${eye.bright}" opacity="0.9"/>`;
      // vertical slit pupil
      e += `<ellipse cx="${cx}" cy="${eyeY}" rx="0.9" ry="${er - 1.6}" fill="#02080a"/>`;
      // wet sphere highlight (top-left crescent)
      e += `<path d="M ${cx - er * 0.6} ${eyeY - er * 0.5} a ${er * 0.7} ${er * 0.7} 0 0 1 ${er * 0.8} ${-er * 0.2}" fill="none" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round" opacity="0.7"/>`;
      e += `<circle cx="${cx - er * 0.4}" cy="${eyeY - er * 0.45}" r="1.0" fill="#ffffff" opacity="0.85"/>`;
      return e;
    };
    s += bulgeEye(50 - 10.5) + bulgeEye(50 + 10.5);

    // ---- tiny flat nostril pits (no protruding bridge) ----
    const nY = eyeY + 9;
    s += `<circle cx="${50 - 2}" cy="${nY}" r="0.6" fill="${I}" opacity="0.55"/>`;
    s += `<circle cx="${50 + 2}" cy="${nY}" r="0.6" fill="${I}" opacity="0.55"/>`;

    // ---- wide downturned FISH mouth with small fangs + corner BARBELS ----
    const mY = eyeY + 17;
    s += `<path d="M ${50 - 7.5} ${mY - 1.5} Q 50 ${mY + 3.5} ${50 + 7.5} ${mY - 1.5}" fill="none" stroke="${I}" stroke-width="${IW * 0.8}" stroke-linecap="round"/>`;
    s += `<path d="M ${50 - 3} ${mY + 0.8} l 0.5 2.2 l 0.8 -1.9 Z" fill="${skin.lt}" stroke="${I}" stroke-width="0.3"/>`;
    s += `<path d="M ${50 + 3} ${mY + 0.8} l -0.5 2.2 l -0.8 -1.9 Z" fill="${skin.lt}" stroke="${I}" stroke-width="0.3"/>`;
    s += `<path d="M ${50 - 7.5} ${mY - 1.5} q -5 4 -7 12" fill="none" stroke="${skin.dk}" stroke-width="${IW * 0.5}" stroke-linecap="round" opacity="0.7"/>`;
    s += `<path d="M ${50 + 7.5} ${mY - 1.5} q 5 4 7 12" fill="none" stroke="${skin.dk}" stroke-width="${IW * 0.5}" stroke-linecap="round" opacity="0.7"/>`;

    // ---- ANGLERFISH ESCA: a stalk from the forehead arching forward to a glowing lure (signature) ----
    const bend = (layout - 1.5) * 5;
    const tipX = 50 + bend, tipY = topY - 11;
    const ctrlX = 50 + bend * 0.4 + 7, ctrlY = topY - 3;
    s += `<path d="M 50 ${topY + 5} Q ${ctrlX} ${ctrlY} ${tipX} ${tipY}" fill="none" stroke="${fin.dk}" stroke-width="${IW * 0.85}" stroke-linecap="round"/>`;
    s += `<path d="M 50 ${topY + 5} Q ${ctrlX} ${ctrlY} ${tipX} ${tipY}" fill="none" stroke="${fin.bright}" stroke-width="${IW * 0.3}" stroke-linecap="round" opacity="0.8"/>`;
    s += `<circle cx="${tipX}" cy="${tipY}" r="4.4" fill="${eye.bright}" opacity="0.22"/>`;
    s += `<circle cx="${tipX}" cy="${tipY}" r="2.6" fill="${eye.bright}" opacity="0.55"/>`;
    s += `<circle cx="${tipX}" cy="${tipY}" r="1.4" fill="#ffffff" opacity="0.95"/>`;

    // ---- a few biolum spots + drifting bubbles ----
    const dotX = [50 - fw * 0.55, 50 + fw * 0.55, 50];
    const dotY = [browY + 2, browY + 2, cranY + 4];
    for (let k = 0; k < dotX.length; k++) {
      if (((this.baseFaceId + k) % 4) === 3) continue;
      s += `<circle cx="${dotX[k]}" cy="${dotY[k]}" r="1.3" fill="${eye.bright}" opacity="0.5"/>`;
      s += `<circle cx="${dotX[k]}" cy="${dotY[k]}" r="0.7" fill="${eye.bright}" opacity="0.95"/>`;
    }
    const bubX = [50 - fw - 5, 50 + fw + 4, 50 + fw + 9];
    const bubY = [cranY + 6, browY + 2, chinY - 16];
    const bubR = [2.3, 1.5, 1.8];
    for (let k = 0; k < bubX.length; k++) {
      if (((this.baseFaceId + k) % 3) === 2 && k > 0) continue;
      const r = bubR[(k + layout) % bubR.length];
      s += `<circle cx="${bubX[k]}" cy="${bubY[k]}" r="${r}" fill="none" stroke="${skin.hl}" stroke-width="0.7" opacity="0.6"/>`;
      s += `<circle cx="${bubX[k] - r * 0.35}" cy="${bubY[k] - r * 0.35}" r="${r * 0.3}" fill="${skin.hl}" opacity="0.7"/>`;
    }

    return s;
  }

  private buildInner(): string {
    if (this.species === 'crystalline') return this.drawCrystalline();
    if (this.species === 'saurian') return this.drawSaurian();
    if (this.species === 'monument') return this.drawMonument();
    if (this.species === 'rokykario') return this.drawRokykario();
    if (this.species === 'eleftamide') return this.drawEleftamide();
    if (this.species === 'aquanimenti') return this.drawAquanimenti();
    const C = PlayerFaceComponent;
    const g = this.geom();
    const uid = this.style + this.baseFaceId + '_' + this.skinTone + this.hairColor + this.eyeColor + this.hairStyle;
    const n = this.nationIdx();
    // Gallactick (1) forces a COOL alien skin tint regardless of the random skinTone.
    const skinIdx = n === 1 ? (this.skinTone % 2 === 0 ? 10 : 9) : this.skinTone;
    const skin = this.pick(C.SKIN, skinIdx);
    const sh = this.pick(C.SKIN_SHADE, skinIdx);
    const core = this.pick(C.SKIN_CORE, skinIdx);
    const hC = this.pick(C.HAIR, this.hairColor);
    const hS = this.pick(C.HAIR_SHADE, this.hairColor);
    const hH = this.pick(C.HAIR_HL, this.hairColor);
    const eyeHex = this.pick(C.EYE, this.eyeColor);
    const hp = this.hair(g);
    const I = this.ink(), IW = this.inkW();
    const head = this.headPath(g);
    // Khess (3) FORCES pointed ears; Gallactick (1) leans pointed-elf too.
    const ear = (n === 3) ? { rx: 3.0, ry: 6.6, out: 1.4, point: 6.5 }
              : (n === 1 && this.earShape < 0) ? { rx: 2.9, ry: 6.4, out: 1.6, point: 5.5 }
              : this.earDims();
    const earY = 58, earL = 50 - g.rx + ear.out, earR = 50 + g.rx - ear.out;

    let s = '';
    if (hp.back) s += `<path d="${hp.back}" fill="${hS}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    const nckY = g.jaw - 6, nckW = g.jawW * 0.95;  // thicker male neck
    s += `<path d="M ${50 - nckW} ${nckY} L ${50 - nckW - 1} 93 L ${50 + nckW + 1} 93 L ${50 + nckW} ${nckY} Z" fill="${sh}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    s += `<path d="M ${50 - nckW} ${nckY} Q 50 ${nckY + 6} ${50 + nckW} ${nckY} L ${50 + nckW + 0.6} 88 L ${50 - nckW - 0.6} 88 Z" fill="${core}" opacity="0.5"/>`;
    if (ear.point > 0) {
      // pointed/elf tip rising up-and-out from the top of each ear (alien)
      const tipY = earY - ear.ry - ear.point;
      s += `<path d="M ${earL - ear.rx * 0.7} ${earY - ear.ry * 0.5} L ${earL - ear.rx * 1.4} ${tipY} L ${earL + ear.rx * 0.6} ${earY - ear.ry * 0.7} Z" fill="${skin}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
      s += `<path d="M ${earR + ear.rx * 0.7} ${earY - ear.ry * 0.5} L ${earR + ear.rx * 1.4} ${tipY} L ${earR - ear.rx * 0.6} ${earY - ear.ry * 0.7} Z" fill="${skin}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    }
    s += `<ellipse cx="${earL}" cy="${earY}" rx="${ear.rx}" ry="${ear.ry}" fill="${skin}" stroke="${I}" stroke-width="${IW}"/>`;
    s += `<ellipse cx="${earR}" cy="${earY}" rx="${ear.rx}" ry="${ear.ry}" fill="${skin}" stroke="${I}" stroke-width="${IW}"/>`;
    s += `<path d="M ${earL} ${earY - 2} q 1.6 2 0 4" fill="none" stroke="${sh}" stroke-width="0.9"/>`;
    s += `<path d="M ${earR} ${earY - 2} q -1.6 2 0 4" fill="none" stroke="${sh}" stroke-width="0.9"/>`;
    s += `<path d="${head}" fill="${skin}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    s += `<clipPath id="hc${uid}"><path d="${head}"/></clipPath>`;
    s += `<g clip-path="url(#hc${uid})">` +
         `<path d="${this.faceShadowPath(g)}" fill="${sh}" opacity="0.45"/>` +
         `<path d="M ${50 - g.jawW - 6} ${g.jaw - 8} Q 50 ${g.jaw + 6} ${50 + g.jawW + 6} ${g.jaw - 8} Q 50 ${g.jaw} ${50 - g.jawW - 6} ${g.jaw - 8} Z" fill="${core}" opacity="0.4"/>` +
         this.stubble(g, '#3a2c24') +
         `</g>`;
    s += this.brows(hS);
    s += this.wrinkles();
    s += this.eyeGroup(eyeHex, uid);
    s += this.noseMouth(sh);
    if (this.style === 'sports') {
      s += `<path d="${hp.front}" fill="${hS}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
      s += `<path d="${hp.front}" fill="${hC}" stroke="none" transform="translate(0,-1.2)" opacity="0.96"/>`;
    } else {
      s += `<path d="${hp.front}" fill="${hC}" stroke="${I}" stroke-width="${IW}" stroke-linejoin="round"/>`;
    }
    s += `<clipPath id="hh${uid}"><path d="${hp.front}"/></clipPath>`;
    s += `<g clip-path="url(#hh${uid})">`;
    if (hp.part) s += `<path d="${hp.part}" fill="none" stroke="${hS}" stroke-width="${this.style === 'premium' ? 1.2 : 1.6}" stroke-linecap="round" opacity="0.8"/>`;
    if (this.style !== 'sports') {
      s += `<path d="M 36 26 Q 50 ${this.style === 'premium' ? 18 : 20} 64 27" fill="none" stroke="${hH}" stroke-width="${this.style === 'premium' ? 2.2 : 2.8}" stroke-linecap="round" opacity="0.85"/>`;
    } else {
      s += `<path d="M 35 24 Q 50 16 65 25" fill="none" stroke="${hH}" stroke-width="3.2" stroke-linecap="round" opacity="0.9"/>`;
    }
    s += `<path d="M 64 16 L 80 22 L 80 60 L 64 60 Z" fill="${hS}" opacity="0.32"/>`;
    s += `</g>`;
    // PER-NATION SIGNATURE drawn LAST so it reads clearly over face/hair/colour.
    s += this.nationSignature(skin, I);
    return s;
  }
}
