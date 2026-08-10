/**
 * Card-face → match-sprite alignment.
 *
 * The player CARD renders a portrait from a backend FaceDescriptor; the pitch
 * SPRITES historically derived their look from a playerId hash, so the two
 * could disagree. This module maps the SAME descriptor onto the tiny sprite
 * appearance (skin hex + hair hex + one of 8 hair silhouettes), so a player's
 * pitch figure matches his card whenever the backend ships the descriptor —
 * and reproduces the old hash look byte-for-byte when it does not.
 *
 * Framework-free on purpose: imported both by the model layer (for the type)
 * and by the canvas renderer (for the colours), and must never drag Angular in.
 */

// ------------------------------------------------------------- descriptor

/**
 * Shape of the backend face descriptor — copied from the private interface in
 * player-card.component.ts (which mirrors what /humans/{id}/card returns).
 * Every field is optional because the card treats a missing descriptor as {}.
 */
export interface FaceDescriptor {
  baseFaceId?: number;
  skinTone?: number;
  hairStyle?: number;
  hairColor?: number;
  eyeColor?: number;
  faceShape?: number;
  noseShape?: number;
  eyeShape?: number;
  mouthShape?: number;
  browShape?: number;
  species?: string;
}

// -------------------------------------------------------- card palettes
//
// The hex values below are copied VERBATIM from the private palettes in
// player-face.component.ts (SKIN / HAIR and the per-species body + crest
// palettes). The two files MUST stay in sync: if the card palettes change,
// change these too, or cards and sprites drift apart again. For the species
// palettes the card stores light/mid/dark/highlight planes; the sprite is a
// flat fill, so only the MID (base) plane of each entry is mirrored here —
// the source array and field are named on every palette.

/** player-face.component.ts SKIN — indices 0-5 realistic, 6-11 vivid. */
export const FACE_SKIN: readonly string[] = [
  '#f3d2b3', '#e8b98c', '#d49b6a', '#b07a4e', '#8a5a37', '#603b22',
  '#e6a98f', '#f0c9a0', '#c9b48f', '#a89bc4', '#9fb0c9', '#d3a9b0'
];

/** player-face.component.ts HAIR — indices 0-5 realistic, 6-11 vivid. */
export const FACE_HAIR: readonly string[] = [
  '#15110d', '#3a2a1a', '#6e4a2a', '#c9a24a', '#9a3a1c', '#9aa0ab',
  '#c4304a', '#1f8f6b', '#2f6bbf', '#7a4fbf', '#cf7430', '#2f9fb0'
];

/** XTAL_BODY[].md — crystal body tint, indexed by skinTone. The card has no
 *  separate horn palette: horns reuse XTAL_BODY indexed by hairColor, so the
 *  crest palette for crystalline is this same array. */
export const XTAL_BODY_MID: readonly string[] = [
  '#7fc4ee', '#7fd9bf', '#b48fe0', '#f08fb4', '#f0c860', '#9aa6b6',
  '#5fd8d0', '#f0905f', '#8fc8ee', '#8f9fe0', '#8fe0a0', '#cf8fe6'
];

/** SAUR_HIDE[].md — scaled hide, indexed by skinTone. As with crystalline,
 *  the card's crest/frill reuses SAUR_HIDE indexed by hairColor. */
export const SAUR_HIDE_MID: readonly string[] = [
  '#5fa047', '#3f9a86', '#a8823f', '#a85230', '#5f6b7c', '#8a4fa8',
  '#3f7aa8', '#a8963f', '#a83f56', '#4f5fa8', '#3fa84f', '#a8603f'
];

/** MON_MAT[].md — statue material (marble → bronze → patina), by skinTone. */
export const MON_MAT_MID: readonly string[] = [
  '#ddd6c8', '#d8cdb8', '#cfc6ba', '#d6c79e', '#cdb38c', '#c79e6c',
  '#b07f40', '#9c722e', '#6f9068', '#5c8a7e', '#8a6b56', '#7c766c'
];

/** MON_GOLD[].leaf — laurel / gold-leaf accent, by hairColor. */
export const MON_GOLD_LEAF: readonly string[] = [
  '#d4af37', '#e6c200', '#c0a060', '#b8860b', '#cd9b4a', '#e8d28a',
  '#caa84a', '#d6b24a', '#bfa05a', '#e0c050', '#c8b070', '#d4af37'
];

/** ROK_ROCK[].md — basalt/obsidian rock plates, by skinTone. */
export const ROK_ROCK_MID: readonly string[] = [
  '#241e1b', '#2a221e', '#322823', '#3a2f29', '#443830', '#4e4138',
  '#574941', '#605249', '#6c5e55', '#766860', '#807168', '#8a7a70'
];

/** ROK_CREST[].mid — crest spike / ember accent, by hairColor. */
export const ROK_CREST_MID: readonly string[] = [
  '#c4501a', '#d46a1a', '#b03a10', '#a82a1a', '#d49a20', '#4e413a',
  '#b02a4a', '#2080c4', '#20b0c4', '#5a2ac4', '#2ac42a', '#d49a4a'
];

/** ELF_SKIN[].md — airy avian skin / base plumage, by skinTone. */
export const ELF_SKIN_MID: readonly string[] = [
  '#eed8c0', '#e6c8a8', '#ddba98', '#d4ac88', '#c89a74', '#ba8862',
  '#d6cdc4', '#c6c2cf', '#bcd2d6', '#e2d4c2', '#e8ddce', '#aac2ce'
];

/** ELF_PLUME[].mid — feather crest, the species' defining hue, by hairColor. */
export const ELF_PLUME_MID: readonly string[] = [
  '#dfe6ec', '#b8c6d4', '#4aa0e8', '#28b0c0', '#3ac868', '#f0b020',
  '#f07a18', '#e84a30', '#f04a98', '#8a4ae8', '#3a78d8', '#28384a'
];

/** AQUA_SKIN[].md — scaled aquatic skin, by skinTone. */
export const AQUA_SKIN_MID: readonly string[] = [
  '#7fd2d8', '#5fc2cc', '#46aebe', '#2f93a8', '#2c80a0', '#46a896',
  '#3c9494', '#5a90c0', '#2a749c', '#5cb6a4', '#a6d6e0', '#5c70b0'
];

/** AQUA_FIN[].mid — fin / dorsal-crest membrane, by hairColor. */
export const AQUA_FIN_MID: readonly string[] = [
  '#6fbcc8', '#4aa6c0', '#3a8ec0', '#2eb696', '#3cc868', '#f0c030',
  '#f08030', '#e84a60', '#f04ab0', '#8a4ae8', '#3a78e0', '#28b0b0'
];

// ------------------------------------------------------------ hair styles

/** The 8 silhouettes the sprite renderer can draw at a 3px head radius. */
export type SpriteHairStyle =
  'short' | 'buzz' | 'bald' | 'curly' | 'long' | 'mohawk' | 'spiky' | 'bun';

/** Canonical order — index into this array is the style's variant digit. */
export const SPRITE_HAIR_STYLES: readonly SpriteHairStyle[] =
  ['short', 'buzz', 'bald', 'curly', 'long', 'mohawk', 'spiky', 'bun'];

/**
 * Card hairStyle (0-19, the 20-entry hair catalog of player-face.component.ts)
 * collapsed onto the 8 sprite silhouettes. Lossy by design — a sprite head is
 * 6 logical pixels wide — but stable, so the same card hair always yields the
 * same sprite hair.
 */
export const CARD_HAIR_TO_SPRITE: readonly SpriteHairStyle[] = [
  'short',  // 0
  'short',  // 1
  'spiky',  // 2
  'buzz',   // 3
  'short',  // 4
  'short',  // 5
  'bun',    // 6
  'curly',  // 7
  'short',  // 8
  'long',   // 9
  'long',   // 10
  'buzz',   // 11
  'bun',    // 12
  'curly',  // 13
  'mohawk', // 14
  'spiky',  // 15
  'long',   // 16
  'mohawk', // 17
  'bald',   // 18
  'spiky'   // 19
];

// -------------------------------------------------- species → sprite tint

/** Per-species flat tints: body fill (by skinTone) + crest/hair fill (by
 *  hairColor) + an optional forced silhouette that overrides the hair map. */
interface SpeciesTint {
  body: readonly string[];
  crest: readonly string[];
  forcedStyle?: SpriteHairStyle;
}

/**
 * Order matters: the index of a species here (offset by 1, human = 0) is baked
 * into the variant id, so appending is safe but reordering would silently
 * repaint cached looks.
 */
const SPECIES_ORDER: readonly string[] =
  ['crystalline', 'saurian', 'monument', 'rokykario', 'eleftamide', 'aquanimenti'];

const SPECIES_TINTS: { [species: string]: SpeciesTint } = {
  // Horns/crest on the card reuse the body palette indexed by hairColor.
  crystalline: { body: XTAL_BODY_MID, crest: XTAL_BODY_MID },
  // Dorsal crest spikes → the mohawk strip is the closest sprite read.
  saurian:     { body: SAUR_HIDE_MID, crest: SAUR_HIDE_MID, forcedStyle: 'mohawk' },
  // A statue has no hair; the laurel would be sub-pixel at this size.
  monument:    { body: MON_MAT_MID,   crest: MON_GOLD_LEAF, forcedStyle: 'bald' },
  // Jagged rock crest → mohawk, tinted with the ember accent.
  rokykario:   { body: ROK_ROCK_MID,  crest: ROK_CREST_MID, forcedStyle: 'mohawk' },
  eleftamide:  { body: ELF_SKIN_MID,  crest: ELF_PLUME_MID },
  aquanimenti: { body: AQUA_SKIN_MID, crest: AQUA_FIN_MID }
};

// --------------------------------------------- legacy playerId-hash look
//
// The pre-descriptor system, moved here (from player-sprites.ts) so both the
// descriptor path and the fallback live in one module without an import cycle;
// player-sprites.ts re-exports them, so its public API is unchanged.

/** Legacy sprite skin tones — the playerId hash picks from these 6. */
export const LEGACY_SKIN_TONES: readonly string[] = [
  '#f1cfae', '#e2b58c', '#d3a06d', '#b98454', '#8d5c38', '#63402a'
];

/** Legacy style + colour together, so "blond curls" vs "dark buzz" costs one
 *  index. */
export const LEGACY_HAIR_VARIANTS:
  ReadonlyArray<{ style: SpriteHairStyle; color: string }> = [
  { style: 'short', color: '#2c2118' },
  { style: 'short', color: '#5a3a22' },
  { style: 'short', color: '#c9a24f' },
  { style: 'buzz',  color: '#241c14' },
  { style: 'bald',  color: '#000000' },
  { style: 'curly', color: '#1d1712' }
];

/** Upper bound of the LEGACY variant id band: 6 skins x 6 hairs = 36. */
export const APPEARANCE_VARIANTS =
  LEGACY_SKIN_TONES.length * LEGACY_HAIR_VARIANTS.length;

/** The pre-variety figure: mid skin tone + short dark hair. Callers that pass
 *  neither a descriptor nor a playerId keep rendering exactly this. */
export const LEGACY_VARIANT = 2 * LEGACY_HAIR_VARIANTS.length;

/** Deterministic avalanche of a (possibly negative) integer id. */
function hashId(id: number): number {
  let h = id | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Bounded legacy variant id (0..35) — this, not the playerId, goes into the
 *  sprite cache key. Unchanged from the original player-sprites.ts hash. */
export function appearanceVariant(playerId: number): number {
  const h = hashId(playerId);
  const skin = h % LEGACY_SKIN_TONES.length;
  const hair = (h >>> 8) % LEGACY_HAIR_VARIANTS.length;
  return skin * LEGACY_HAIR_VARIANTS.length + hair;
}

// ------------------------------------------------------------ resolution

/** Modern boot colours — not part of the card face, so they derive from the
 *  playerId hash alone. Index 0 (classic black) is the no-playerId fallback. */
export const BOOT_COLORS: readonly string[] = [
  '#15181c', '#f2f2f2', '#e2571b', '#1f9d4e',
  '#2456c9', '#e33fa1', '#f5d327', '#8b39d9'
];

/** Deterministic boot pick; independent bits from the appearance hash so boots
 *  do not correlate with skin/hair. */
export function bootColorFor(playerId?: number): { color: string; index: number } {
  if (playerId === undefined) return { color: BOOT_COLORS[0], index: 0 };
  const index = (hashId(playerId) >>> 16) % BOOT_COLORS.length;
  return { color: BOOT_COLORS[index], index };
}

/** Everything the sprite baker needs for one look. `variantId` is bounded and
 *  collision-free across the legacy and descriptor bands, so it is safe as a
 *  cache-key component. */
export interface SpriteAppearance {
  skin: string;
  hairColor: string;
  hairStyle: SpriteHairStyle;
  boots: string;
  variantId: number;
}

/** Positive modulo — descriptor indices come from the backend and are not
 *  trusted to be in range (the card renderer wraps them the same way). */
function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/**
 * Resolve the sprite look for a player.
 *
 *   - With a descriptor: colours come from the SAME palettes the card uses,
 *     so pitch and card agree. Unknown species strings fall back to the human
 *     palettes, mirroring the card component's dispatch.
 *   - Without one: the exact legacy playerId-hash look (or the fixed legacy
 *     figure when there is no playerId either), so old payloads render
 *     pixel-identically to today.
 *
 * The returned variantId encodes (species, skinTone%12, hairColor%12, style):
 * the descriptor band starts at 1000 so it can NEVER collide with the legacy
 * 0-35 band, and hairColor keeps all 12 values (rather than %6) so two looks
 * with different hair hexes can never share a cache key.
 * Max id = 1000 + (6*144 + 143)*8 + 7 = 9063 — still bounded.
 */
export function spriteAppearance(face: FaceDescriptor | null | undefined,
                                 playerId?: number): SpriteAppearance {
  const boot = bootColorFor(playerId);

  if (!face) {
    const baseVariant =
      playerId === undefined ? LEGACY_VARIANT : appearanceVariant(playerId);
    const hair = LEGACY_HAIR_VARIANTS[baseVariant % LEGACY_HAIR_VARIANTS.length];
    return {
      skin: LEGACY_SKIN_TONES[Math.floor(baseVariant / LEGACY_HAIR_VARIANTS.length)],
      hairColor: hair.color,
      hairStyle: hair.style,
      boots: boot.color,
      // Boots widen the legacy band 0-35 → 0-287, still far below the
      // descriptor band's 1000 floor.
      variantId: baseVariant + boot.index * APPEARANCE_VARIANTS
    };
  }

  const skinTone = mod(face.skinTone ?? 0, 12);
  const hairColorIdx = mod(face.hairColor ?? 0, 12);
  const mappedStyle =
    CARD_HAIR_TO_SPRITE[mod(face.hairStyle ?? 0, CARD_HAIR_TO_SPRITE.length)];

  const species = face.species || 'human';
  const tint = SPECIES_TINTS[species];

  let skin: string;
  let hairColor: string;
  let hairStyle: SpriteHairStyle;
  if (tint) {
    skin = tint.body[skinTone];
    hairColor = tint.crest[hairColorIdx];
    hairStyle = tint.forcedStyle || mappedStyle;
  } else {
    // human (and any species string this build does not know yet)
    skin = FACE_SKIN[skinTone];
    hairColor = FACE_HAIR[hairColorIdx];
    hairStyle = mappedStyle;
  }

  const speciesIdx = SPECIES_ORDER.indexOf(species) + 1; // 0 = human/unknown
  const styleIdx = SPRITE_HAIR_STYLES.indexOf(hairStyle);
  // Boots multiply the descriptor band by 8 — max ≈ 1000 + 6919*8*8 ≈ 443k,
  // bounded and still collision-free against the (also boot-widened) legacy band.
  const variantId = 1000
    + ((((speciesIdx * 144) + skinTone * 12 + hairColorIdx) * 8 + styleIdx) * 8
        + boot.index);

  return { skin, hairColor, hairStyle, boots: boot.color, variantId };
}
