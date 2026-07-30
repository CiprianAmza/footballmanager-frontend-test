/**
 * FACE LAB — the parametric GENOME that spans every exotic-species face.
 *
 * The production renderers (`drawCrystalline`, `drawSaurian`, … in
 * player-face.component.ts) are hand-frozen `drawX()` functions that all repeat the
 * same 7-step skeleton and differ only on three visual AXES (silhouette / eyes /
 * signature) plus their palettes. This module encodes those axes as data, so a
 * "species" becomes a point in genome space that `drawParametric()` (face-parametric.ts)
 * can express, a GA can mix, and `codegen.py` can freeze back into a classic `drawX()`.
 *
 * NOTHING here is imported by the production face component — the lab is additive.
 */

// ============================================================================
// colour helpers (kept tiny: the palette banks below are derived, not hand-typed)
// ============================================================================

function clamp255(v: number): number { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => clamp255(v).toString(16).padStart(2, '0')).join('');
}

/** t > 0 lightens toward white, t < 0 darkens toward black. */
export function shade(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const target = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  return rgbToHex(r + (target - r) * k, g + (target - g) * k, b + (target - b) * k);
}

/** Perceptual-ish relative luminance 0..1 — used by the palette contrast constraint. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// ============================================================================
// palette banks — one "family" per existing species + 2 new ones
// ============================================================================

/** A 4-stop cel ramp: lit plane / base / shadow plane / edge highlight. */
export interface Ramp { lt: string; md: string; dk: string; hl: string; }
/** A 3-stop emissive ramp for eyes / lava / gem glow. */
export interface Glow { bright: string; mid: string; dk: string; }

/** Flat hex list -> emissive ramp (the older renderers stored glow as plain hex). */
function glowsFrom(flat: string[]): Glow[] {
  return flat.map(h => ({ bright: shade(h, 0.4), mid: h, dk: shade(h, -0.45) }));
}
/** {bright,mid,dk[,tip/edge]} accent list -> canonical Ramp. */
function rampsFrom(list: { bright: string; mid: string; dk: string; tip?: string; edge?: string }[]): Ramp[] {
  return list.map(c => ({ lt: c.bright, md: c.mid, dk: c.dk, hl: c.tip || c.edge || shade(c.bright, 0.35) }));
}

export type PaletteFamilyId =
  'crystal' | 'saurian' | 'marble' | 'basalt' | 'plumage' | 'abyssal' | 'fungal' | 'chrome';

export interface PaletteFamily {
  id: PaletteFamilyId;
  label: string;
  /** 12 body/skin ramps (indexed by palette.skinIdx). */
  body: Ramp[];
  /** 12 signature/crest ramps (indexed by palette.accentIdx). */
  accent: Ramp[];
  /** 12 emissive glows (indexed by palette.glowIdx). */
  glow: Glow[];
  /** Ink (outline) colour for this material family. */
  ink: string;
}

// --- crystalline (XTAL_BODY / XTAL_GLOW) -----------------------------------
const XTAL_BODY: Ramp[] = [
  { lt: '#bfeaff', md: '#7fc4ee', dk: '#3f78b0', hl: '#eafaff' },
  { lt: '#c8f3e6', md: '#7fd9bf', dk: '#3f9a82', hl: '#ecfff8' },
  { lt: '#e6cffb', md: '#b48fe0', dk: '#6f4bb0', hl: '#f7ecff' },
  { lt: '#ffd7e6', md: '#f08fb4', dk: '#b0476e', hl: '#ffecf3' },
  { lt: '#ffe9b8', md: '#f0c860', dk: '#b08a1e', hl: '#fff8e0' },
  { lt: '#d6dde6', md: '#9aa6b6', dk: '#5a6678', hl: '#f0f3f7' },
  { lt: '#bff6ef', md: '#5fd8d0', dk: '#2f9088', hl: '#eafffd' },
  { lt: '#ffcdb0', md: '#f0905f', dk: '#b0502a', hl: '#ffeadf' },
  { lt: '#d4f0ff', md: '#8fc8ee', dk: '#4f86b6', hl: '#ecf9ff' },
  { lt: '#cfe0ff', md: '#8f9fe0', dk: '#4f5ab0', hl: '#ecf0ff' },
  { lt: '#e0ffe6', md: '#8fe0a0', dk: '#4fb060', hl: '#ecffef' },
  { lt: '#f3d6ff', md: '#cf8fe6', dk: '#9a4fb0', hl: '#fcecff' },
];
const XTAL_GLOW = ['#36e0ff', '#7CFC8C', '#c66bff', '#ff6ba6', '#ffd24a', '#bfe6ff',
  '#3affd0', '#ff8a4a', '#5ad0ff', '#6b8aff', '#7CFFA0', '#e07cff'];

// --- saurian (SAUR_HIDE / SAUR_EYE) ----------------------------------------
const SAUR_HIDE: Ramp[] = [
  { lt: '#9bd47a', md: '#5fa047', dk: '#356b2c', hl: '#c4f0a0' },
  { lt: '#7fd6c0', md: '#3f9a86', dk: '#236155', hl: '#b0f0e4' },
  { lt: '#d6b478', md: '#a8823f', dk: '#6b4f1e', hl: '#f0dca0' },
  { lt: '#d68a6a', md: '#a85230', dk: '#6b2e16', hl: '#f0b294' },
  { lt: '#9aa6b6', md: '#5f6b7c', dk: '#363f4e', hl: '#c0cbd9' },
  { lt: '#c69ad6', md: '#8a4fa8', dk: '#56286b', hl: '#e4c0f0' },
  { lt: '#7fb6d6', md: '#3f7aa8', dk: '#23476b', hl: '#b0d8f0' },
  { lt: '#d6c47a', md: '#a8963f', dk: '#6b5d1e', hl: '#f0e4a0' },
  { lt: '#d67a8a', md: '#a83f56', dk: '#6b2333', hl: '#f0b0bf' },
  { lt: '#8a9ad6', md: '#4f5fa8', dk: '#28366b', hl: '#b6c0f0' },
  { lt: '#7fd68a', md: '#3fa84f', dk: '#236b28', hl: '#b0f0bf' },
  { lt: '#d6a07f', md: '#a8603f', dk: '#6b3523', hl: '#f0c4b0' },
];
const SAUR_EYE = ['#ffd24a', '#9bff5f', '#ff8a3a', '#ff5f6b', '#5fd0ff', '#c66bff',
  '#3affd0', '#ffb03a', '#5fffa0', '#ff6bd0', '#d0ff3a', '#ff9b5f'];

// --- monument (MON_MAT / MON_GLOW / MON_GOLD) ------------------------------
const MON_MAT: Ramp[] = [
  { lt: '#f6f2ea', md: '#ddd6c8', dk: '#a89f8c', hl: '#fffdf7' },
  { lt: '#f3ece0', md: '#d8cdb8', dk: '#a0937a', hl: '#fffaf0' },
  { lt: '#eee7df', md: '#cfc6ba', dk: '#968d80', hl: '#fbf7f1' },
  { lt: '#f2e8d2', md: '#d6c79e', dk: '#9c8a5e', hl: '#fdf6e6' },
  { lt: '#ecd9c0', md: '#cdb38c', dk: '#917451', hl: '#f8ecda' },
  { lt: '#e6c9a0', md: '#c79e6c', dk: '#8a6438', hl: '#f2dcbe' },
  { lt: '#d8a86a', md: '#b07f40', dk: '#724e1f', hl: '#ecc890' },
  { lt: '#c79a52', md: '#9c722e', dk: '#5f4214', hl: '#e2bd78' },
  { lt: '#9fb89a', md: '#6f9068', dk: '#3f5c3a', hl: '#c2d6bc' },
  { lt: '#8fb6ac', md: '#5c8a7e', dk: '#345650', hl: '#b6d6cd' },
  { lt: '#b89a86', md: '#8a6b56', dk: '#523c2e', hl: '#d6bca8' },
  { lt: '#a8a29a', md: '#7c766c', dk: '#494540', hl: '#cac4ba' },
];
const MON_GLOW = ['#fff4cf', '#ffe39a', '#cfe9ff', '#bfffe0', '#ffd0e0', '#e6d0ff',
  '#fff0d0', '#d0fff0', '#d6e0ff', '#ffe0c0', '#f0ffd0', '#ffffff'];
const MON_GOLD: Ramp[] = [
  { lt: '#f0d264', md: '#d4af37', dk: '#8a6a18', hl: '#fff0b0' },
  { lt: '#ffe34a', md: '#e6c200', dk: '#9a8200', hl: '#fff6a8' },
  { lt: '#e6cf8c', md: '#c0a060', dk: '#7c6630', hl: '#f7ecc8' },
  { lt: '#e0b94a', md: '#b8860b', dk: '#705208', hl: '#f4dc9a' },
  { lt: '#f0c878', md: '#cd9b4a', dk: '#82601e', hl: '#ffe6ba' },
  { lt: '#fff2c0', md: '#e8d28a', dk: '#9c8444', hl: '#fffae6' },
  { lt: '#ecd07a', md: '#caa84a', dk: '#7e6420', hl: '#f8ecc0' },
  { lt: '#f2d278', md: '#d6b24a', dk: '#866a1e', hl: '#fcecbe' },
  { lt: '#e0c888', md: '#bfa05a', dk: '#766030', hl: '#f2e4c4' },
  { lt: '#ffe080', md: '#e0c050', dk: '#947c20', hl: '#fff2bc' },
  { lt: '#ecd8a0', md: '#c8b070', dk: '#7c6838', hl: '#f8eed0' },
  { lt: '#f0d264', md: '#d4af37', dk: '#8a6a18', hl: '#fff0b0' },
];

// --- rokykario (ROK_ROCK / ROK_LAVA / ROK_CREST) ---------------------------
const ROK_ROCK: Ramp[] = [
  { lt: '#3a322e', md: '#241e1b', dk: '#120e0c', hl: '#4e433c' },
  { lt: '#403732', md: '#2a221e', dk: '#15100d', hl: '#564943' },
  { lt: '#4a403a', md: '#322823', dk: '#1c1512', hl: '#60524a' },
  { lt: '#564a43', md: '#3a2f29', dk: '#221a15', hl: '#6e5d53' },
  { lt: '#62554c', md: '#443830', dk: '#2a201a', hl: '#7c685c' },
  { lt: '#6e6058', md: '#4e4138', dk: '#322822', hl: '#887468' },
  { lt: '#7a6b62', md: '#574941', dk: '#3a2e27', hl: '#948076' },
  { lt: '#857770', md: '#605249', dk: '#42352d', hl: '#a08c82' },
  { lt: '#928680', md: '#6c5e55', dk: '#4a3d35', hl: '#ac9a90' },
  { lt: '#9f948e', md: '#766860', dk: '#52453c', hl: '#baa9a0' },
  { lt: '#ab9f96', md: '#807168', dk: '#5a4c42', hl: '#c6b6ac' },
  { lt: '#b8aaa0', md: '#8a7a70', dk: '#62534a', hl: '#d2c2b8' },
];
const ROK_LAVA: Glow[] = [
  { bright: '#fff0a0', mid: '#ff8a1e', dk: '#c43a08' }, { bright: '#ffd060', mid: '#ff6a10', dk: '#b42a04' },
  { bright: '#ffe070', mid: '#ffb020', dk: '#c46a00' }, { bright: '#ffb060', mid: '#ff4a12', dk: '#a81e04' },
  { bright: '#ff9a8a', mid: '#ff2a2a', dk: '#9a0808' }, { bright: '#ff8aa0', mid: '#ff1e5a', dk: '#9a0830' },
  { bright: '#a0e0ff', mid: '#2aa0ff', dk: '#0850c4' }, { bright: '#80ffff', mid: '#20d0ff', dk: '#0888c4' },
  { bright: '#c0a0ff', mid: '#7a3aff', dk: '#4a08c4' }, { bright: '#a0ff90', mid: '#3aff2a', dk: '#0a9a08' },
  { bright: '#d0ff60', mid: '#9aff10', dk: '#5a9a00' }, { bright: '#ffffff', mid: '#ffc040', dk: '#d46000' },
];
const ROK_CREST = rampsFrom([
  { bright: '#ff9a3a', mid: '#c4501a', dk: '#5a200a' }, { bright: '#ffb84a', mid: '#d46a1a', dk: '#6a3008' },
  { bright: '#ff7a2a', mid: '#b03a10', dk: '#4a1606' }, { bright: '#ff5a3a', mid: '#a82a1a', dk: '#481008' },
  { bright: '#ffd060', mid: '#d49a20', dk: '#6a4a08' }, { bright: '#8a7a72', mid: '#4e413a', dk: '#241c18' },
  { bright: '#ff6a8a', mid: '#b02a4a', dk: '#4a0820' }, { bright: '#6ad0ff', mid: '#2080c4', dk: '#08406a' },
  { bright: '#5affff', mid: '#20b0c4', dk: '#08606a' }, { bright: '#9a7aff', mid: '#5a2ac4', dk: '#28086a' },
  { bright: '#7aff5a', mid: '#2ac42a', dk: '#086a08' }, { bright: '#ffe0a0', mid: '#d49a4a', dk: '#6a4a1a' },
]);

// --- eleftamide (ELF_SKIN / ELF_EYE / ELF_PLUME) ---------------------------
const ELF_SKIN: Ramp[] = [
  { lt: '#fbeede', md: '#eed8c0', dk: '#cdb094', hl: '#fff7ee' },
  { lt: '#f6e2cc', md: '#e6c8a8', dk: '#c2a07e', hl: '#fdf2e2' },
  { lt: '#f0d8c0', md: '#ddba98', dk: '#b6906c', hl: '#faecda' },
  { lt: '#ecceb4', md: '#d4ac88', dk: '#aa825e', hl: '#f7e4cf' },
  { lt: '#e4c0a4', md: '#c89a74', dk: '#9c704e', hl: '#f2dcc6' },
  { lt: '#d8b094', md: '#ba8862', dk: '#8c6040', hl: '#ead0b8' },
  { lt: '#ece6e0', md: '#d6cdc4', dk: '#aaa098', hl: '#f8f4f0' },
  { lt: '#e0dde6', md: '#c6c2cf', dk: '#9a96a4', hl: '#f2f0f6' },
  { lt: '#dceaec', md: '#bcd2d6', dk: '#8ea6aa', hl: '#eef6f8' },
  { lt: '#f4ece2', md: '#e2d4c2', dk: '#b6a48e', hl: '#fcf6ee' },
  { lt: '#f8f2ea', md: '#e8ddce', dk: '#bcae9a', hl: '#fffaf3' },
  { lt: '#cfe0e8', md: '#aac2ce', dk: '#7c96a2', hl: '#e6f0f4' },
];
const ELF_EYE: Glow[] = [
  { bright: '#ffe88a', mid: '#f0b020', dk: '#9a6a08' }, { bright: '#ffd860', mid: '#e89a18', dk: '#8a5604' },
  { bright: '#ffb84a', mid: '#e07210', dk: '#8a3e04' }, { bright: '#bfe8ff', mid: '#4aa6e8', dk: '#1860a8' },
  { bright: '#a0f0e0', mid: '#28c0a8', dk: '#0a7a68' }, { bright: '#c8f0a0', mid: '#7ac838', dk: '#3a7a10' },
  { bright: '#ffc0d0', mid: '#f06a92', dk: '#a82a52' }, { bright: '#e0c8ff', mid: '#9a6ae8', dk: '#5a28a8' },
  { bright: '#ffffff', mid: '#cfe2f0', dk: '#88a4b8' }, { bright: '#fff0c0', mid: '#f0d060', dk: '#a89020' },
  { bright: '#d0fff0', mid: '#60e8c8', dk: '#188a70' }, { bright: '#ffd0a0', mid: '#f09040', dk: '#a85610' },
];
const ELF_PLUME = rampsFrom([
  { bright: '#ffffff', mid: '#dfe6ec', dk: '#9fb0bc', tip: '#f4faff' },
  { bright: '#e8eef4', mid: '#b8c6d4', dk: '#7c8ea0', tip: '#ffffff' },
  { bright: '#9fd8ff', mid: '#4aa0e8', dk: '#1c5ea8', tip: '#d8f0ff' },
  { bright: '#7ae0e0', mid: '#28b0c0', dk: '#0a6878', tip: '#c8f8f8' },
  { bright: '#9af0b0', mid: '#3ac868', dk: '#0e7a34', tip: '#d8ffe4' },
  { bright: '#ffe070', mid: '#f0b020', dk: '#9a6a08', tip: '#fff6c8' },
  { bright: '#ffb060', mid: '#f07a18', dk: '#a84204', tip: '#ffe0b8' },
  { bright: '#ff8a72', mid: '#e84a30', dk: '#a01808', tip: '#ffd0c4' },
  { bright: '#ff9ad0', mid: '#f04a98', dk: '#a81258', tip: '#ffd8ec' },
  { bright: '#c8a0ff', mid: '#8a4ae8', dk: '#4a18a8', tip: '#e8d8ff' },
  { bright: '#80ccff', mid: '#3a78d8', dk: '#103a8a', tip: '#cce6ff' },
  { bright: '#5a6e82', mid: '#28384a', dk: '#101820', tip: '#7a90a4' },
]);

// --- aquanimenti (AQUA_SKIN / AQUA_EYE / AQUA_FIN) -------------------------
const AQUA_SKIN: Ramp[] = [
  { lt: '#bfeef0', md: '#7fd2d8', dk: '#3f9aa2', hl: '#e6fbfc' },
  { lt: '#a6e4ea', md: '#5fc2cc', dk: '#2c8a94', hl: '#dcf7fa' },
  { lt: '#8fd6e2', md: '#46aebe', dk: '#1f7886', hl: '#d2f2f8' },
  { lt: '#72c2d6', md: '#2f93a8', dk: '#136274', hl: '#c4ecf4' },
  { lt: '#6fb6cc', md: '#2c80a0', dk: '#11516a', hl: '#bfe6f2' },
  { lt: '#86d0c4', md: '#46a896', dk: '#1f7460', hl: '#cef2ea' },
  { lt: '#7ec0c0', md: '#3c9494', dk: '#176262', hl: '#c8ecec' },
  { lt: '#9ab8cc', md: '#5a90c0', dk: '#27608e', hl: '#d2e6f6' },
  { lt: '#6aa8c8', md: '#2a749c', dk: '#0f4a68', hl: '#bce0f0' },
  { lt: '#a0dcd0', md: '#5cb6a4', dk: '#287e6c', hl: '#d6f4ec' },
  { lt: '#d2eef2', md: '#a6d6e0', dk: '#6ea2b0', hl: '#f0fbfd' },
  { lt: '#9cb0d8', md: '#5c70b0', dk: '#2c3e7a', hl: '#d6def0' },
];
const AQUA_EYE: Glow[] = [
  { bright: '#a8fff4', mid: '#28d8c4', dk: '#0a7a70' }, { bright: '#88f0ff', mid: '#1eb0d8', dk: '#0a607a' },
  { bright: '#b8ffe0', mid: '#2ce0a0', dk: '#0a8050' }, { bright: '#fff0a0', mid: '#f0c020', dk: '#9a7a08' },
  { bright: '#ffc8a0', mid: '#f08040', dk: '#a04a10' }, { bright: '#e0c0ff', mid: '#9a5ce8', dk: '#5a20a8' },
  { bright: '#ffb0d8', mid: '#f04a98', dk: '#a01258' }, { bright: '#e8feff', mid: '#9cdce8', dk: '#5a8a98' },
  { bright: '#c0ffe8', mid: '#48e0b0', dk: '#108060' }, { bright: '#a0d8ff', mid: '#3a86e8', dk: '#0f4aa0' },
  { bright: '#ffd0ff', mid: '#e060e0', dk: '#902090' }, { bright: '#d8fff0', mid: '#70e8c0', dk: '#1c8a64' },
];
const AQUA_FIN = rampsFrom([
  { bright: '#cfeff4', mid: '#6fbcc8', dk: '#2a7a88', edge: '#eafafd' },
  { bright: '#aee6ef', mid: '#4aa6c0', dk: '#1c6a86', edge: '#dcf4fa' },
  { bright: '#9ad8e8', mid: '#3a8ec0', dk: '#125a8a', edge: '#cceaf6' },
  { bright: '#8ee6d2', mid: '#2eb696', dk: '#0e7660', edge: '#c8f4ea' },
  { bright: '#a6f0b8', mid: '#3cc868', dk: '#0e7a38', edge: '#d6ffe2' },
  { bright: '#ffe88a', mid: '#f0c030', dk: '#9a7a10', edge: '#fff6c8' },
  { bright: '#ffb878', mid: '#f08030', dk: '#a04810', edge: '#ffe0c0' },
  { bright: '#ff9aa8', mid: '#e84a60', dk: '#a01830', edge: '#ffd0d8' },
  { bright: '#ffa6e0', mid: '#f04ab0', dk: '#a01270', edge: '#ffd8f2' },
  { bright: '#c8a8ff', mid: '#8a4ae8', dk: '#4a18a8', edge: '#e8d8ff' },
  { bright: '#8cc8ff', mid: '#3a78e0', dk: '#103a90', edge: '#cce4ff' },
  { bright: '#7fe8e0', mid: '#28b0b0', dk: '#0a6a6a', edge: '#caf6f4' },
]);

// --- NEW: fungal (mycelial spore-folk) -------------------------------------
const FUNGAL_BODY: Ramp[] = [
  { lt: '#e8dcc4', md: '#c9b795', dk: '#8a7a5c', hl: '#f6efe0' },
  { lt: '#d9c8b0', md: '#b39c7e', dk: '#786248', hl: '#eee2d0' },
  { lt: '#cdd6c0', md: '#a3b294', dk: '#68765a', hl: '#e7edde' },
  { lt: '#c8bcd0', md: '#a08fae', dk: '#655678', hl: '#e4dcec' },
  { lt: '#e0c8cc', md: '#bc9aa0', dk: '#7a5c62', hl: '#f2e2e5' },
  { lt: '#b9c9c4', md: '#8fa39c', dk: '#566863', hl: '#dae6e2' },
  { lt: '#d8ccb4', md: '#b2a184', dk: '#736450', hl: '#ece4d2' },
  { lt: '#c4c0a8', md: '#9a957a', dk: '#605c48', hl: '#e0dcc8' },
  { lt: '#dcd0e0', md: '#b6a6bc', dk: '#756882', hl: '#efe8f2' },
  { lt: '#cfe0d4', md: '#a2b8a8', dk: '#647668', hl: '#e6f0e9' },
  { lt: '#e4d4bc', md: '#c0aa8a', dk: '#7e6c50', hl: '#f2e8d8' },
  { lt: '#b6aec0', md: '#8d849c', dk: '#565060', hl: '#d8d2e2' },
];
const FUNGAL_ACCENT = rampsFrom([
  { bright: '#f0a0c0', mid: '#c44a80', dk: '#6a1840' }, { bright: '#ffcf80', mid: '#d48a20', dk: '#6a4408' },
  { bright: '#b0e08a', mid: '#5fa030', dk: '#2a5410' },
  { bright: '#a0d8e8', mid: '#3f8ea8', dk: '#164a5c' }, { bright: '#dca8f0', mid: '#9040c0', dk: '#4a1268' },
  { bright: '#f09a90', mid: '#c04430', dk: '#661a10' }, { bright: '#e8e0a0', mid: '#b8ab40', dk: '#5e5510' },
  { bright: '#90e0c0', mid: '#2fa07a', dk: '#0e5240' }, { bright: '#f0b8d8', mid: '#c05088', dk: '#661a44' },
  { bright: '#c0c8f0', mid: '#6070c0', dk: '#283468' }, { bright: '#f8d8b0', mid: '#c89a58', dk: '#6a4c20' },
  { bright: '#a8b0a0', mid: '#6c7464', dk: '#343a2e' },
]);
const FUNGAL_GLOW = glowsFrom(['#8affc0', '#c0ff70', '#70e0ff', '#ff9ad0', '#ffe070', '#b090ff',
  '#60ffd8', '#ffb060', '#d0ff90', '#90c0ff', '#ff80a0', '#e0ffff']);

// --- NEW: chrome (polished machine-alloy) ----------------------------------
const CHROME_BODY: Ramp[] = [
  { lt: '#e6ecf2', md: '#b4c0cc', dk: '#69737e', hl: '#fbfdff' },
  { lt: '#dbe2ea', md: '#a6b2c0', dk: '#5c6673', hl: '#f4f8fc' },
  { lt: '#e8e2d6', md: '#bcb2a0', dk: '#6f665a', hl: '#fbf8f2' },
  { lt: '#f0dcc0', md: '#c8a878', dk: '#7a6240', hl: '#fdf2e0' },
  { lt: '#f0d0c0', md: '#c89678', dk: '#7a5440', hl: '#fdeae0' },
  { lt: '#d4dce4', md: '#9fabb8', dk: '#565f6a', hl: '#eef4f8' },
  { lt: '#cfd8e6', md: '#96a4bc', dk: '#4e5a70', hl: '#eaf0f8' },
  { lt: '#e0d8e8', md: '#aea4bc', dk: '#645a72', hl: '#f4f0f8' },
  { lt: '#c8d4d0', md: '#8fa09a', dk: '#4c5854', hl: '#e6eeeb' },
  { lt: '#e8e8e8', md: '#b8b8b8', dk: '#6c6c6c', hl: '#fcfcfc' },
  { lt: '#d0c8b8', md: '#9a9280', dk: '#585244', hl: '#eae4d8' },
  { lt: '#bcc4cc', md: '#8b939c', dk: '#4a5158', hl: '#dde3e8' },
];
const CHROME_ACCENT = rampsFrom([
  { bright: '#ff7a5a', mid: '#c43a1a', dk: '#5e1406' }, { bright: '#5ad0ff', mid: '#1a86c4', dk: '#063a5e' },
  { bright: '#ffd05a', mid: '#c49a1a', dk: '#5e4606' }, { bright: '#7aff9a', mid: '#1ac44a', dk: '#065e1e' },
  { bright: '#d07aff', mid: '#8a1ac4', dk: '#3c065e' }, { bright: '#ff7ac0', mid: '#c41a7a', dk: '#5e063a' },
  { bright: '#f0f4f8', mid: '#aab4c0', dk: '#5a6470' }, { bright: '#5affe8', mid: '#1ac4b0', dk: '#065e54' },
  { bright: '#ffa05a', mid: '#c4601a', dk: '#5e2806' }, { bright: '#9aa0ff', mid: '#3a42c4', dk: '#12185e' },
  { bright: '#e0ff5a', mid: '#a0c41a', dk: '#485e06' }, { bright: '#ff5a5a', mid: '#c41a1a', dk: '#5e0606' },
]);
const CHROME_GLOW = glowsFrom(['#43f5ff', '#ff4a4a', '#7dff4a', '#ffc94a', '#c04aff', '#4a7dff',
  '#ff4ac0', '#4affd0', '#ffffff', '#ff8a20', '#a0ff20', '#20a0ff']);

export const PALETTE_FAMILIES: Record<PaletteFamilyId, PaletteFamily> = {
  crystal: { id: 'crystal', label: 'Crystal', body: XTAL_BODY, accent: XTAL_BODY, glow: glowsFrom(XTAL_GLOW), ink: '#15121a' },
  saurian: { id: 'saurian', label: 'Saurian hide', body: SAUR_HIDE, accent: SAUR_HIDE, glow: glowsFrom(SAUR_EYE), ink: '#160f0a' },
  marble: { id: 'marble', label: 'Marble & bronze', body: MON_MAT, accent: MON_GOLD, glow: glowsFrom(MON_GLOW), ink: '#6a6154' },
  basalt: { id: 'basalt', label: 'Basalt & lava', body: ROK_ROCK, accent: ROK_CREST, glow: ROK_LAVA, ink: '#0b0806' },
  plumage: { id: 'plumage', label: 'Plumage', body: ELF_SKIN, accent: ELF_PLUME, glow: ELF_EYE, ink: '#2a2418' },
  abyssal: { id: 'abyssal', label: 'Abyssal', body: AQUA_SKIN, accent: AQUA_FIN, glow: AQUA_EYE, ink: '#06222c' },
  fungal: { id: 'fungal', label: 'Fungal spore', body: FUNGAL_BODY, accent: FUNGAL_ACCENT, glow: FUNGAL_GLOW, ink: '#231d18' },
  chrome: { id: 'chrome', label: 'Chrome alloy', body: CHROME_BODY, accent: CHROME_ACCENT, glow: CHROME_GLOW, ink: '#121820' },
};

export const PALETTE_FAMILY_IDS = Object.keys(PALETTE_FAMILIES) as PaletteFamilyId[];

// ============================================================================
// the genome
// ============================================================================

/** 6 silhouette families lifted from the existing renderers + 2 new. */
export type SilhouetteFamily =
  'faceted' | 'beaked' | 'carved' | 'plated' | 'teardrop' | 'dome' | 'smooth' | 'spire';
/** 6 eye types lifted from the existing renderers + 2 new. */
export type EyeType =
  'slit' | 'verticalPupil' | 'hollowGlow' | 'molten' | 'raptorRound' | 'sphericalLidless' | 'compound' | 'visor';
/** 6 signature features lifted from the existing renderers + 3 new (incl. none). */
export type SignatureType =
  'thirdEyeGem' | 'dorsalCrest' | 'laurel' | 'rockCrest' | 'featherCrest' | 'gills' | 'hornPair' | 'anglerLure' | 'none';
export type BackgroundType = 'none' | 'aura' | 'windLines' | 'lightShafts' | 'heatHaze';

export const SILHOUETTE_FAMILIES: SilhouetteFamily[] =
  ['faceted', 'beaked', 'carved', 'plated', 'teardrop', 'dome', 'smooth', 'spire'];
export const EYE_TYPES: EyeType[] =
  ['slit', 'verticalPupil', 'hollowGlow', 'molten', 'raptorRound', 'sphericalLidless', 'compound', 'visor'];
export const SIGNATURE_TYPES: SignatureType[] =
  ['thirdEyeGem', 'dorsalCrest', 'laurel', 'rockCrest', 'featherCrest', 'gills', 'hornPair', 'anglerLure', 'none'];
export const BACKGROUND_TYPES: BackgroundType[] = ['none', 'aura', 'windLines', 'lightShafts', 'heatHaze'];

/** Eye types whose whole read is "emissive". Used by the max-one-glow constraint. */
export const GLOWING_EYES: EyeType[] = ['slit', 'hollowGlow', 'molten', 'sphericalLidless', 'visor'];
/** Signatures whose whole read is "emissive". */
export const GLOWING_SIGNATURES: SignatureType[] = ['thirdEyeGem', 'anglerLure'];

export interface FaceGenome {
  /** Stable id — the GA keeps it across generations so votes can be joined back. */
  id: string;
  silhouette: {
    family: SilhouetteFamily;
    /** 0..1 -> temple half-width 19..30 */
    width: number;
    /** 0..1 -> jaw/chin width as a fraction of the temple width */
    jawRatio: number;
    /** 0..1 -> round dome (0) .. flat plateau crown (1) */
    cranFlat: number;
    /** 0..3 integer — the same deterministic per-face wobble the frozen renderers use */
    jitterSeed: number;
  };
  eyes: {
    type: EyeType;
    /** 0..1 -> eye radius scale */
    size: number;
    /** 0..1 -> centre-to-centre spacing */
    spacing: number;
    /** 0..1 -> -1 (outer-down, weary) .. +1 (outer-up, fierce) */
    tilt: number;
  };
  signature: {
    type: SignatureType;
    /** 0..1 -> how far the feature projects / how many elements */
    intensity: number;
  };
  shading: {
    /** 2..4 cel planes inside the head clip */
    planes: number;
    /** 0..1 -> plane opacity multiplier */
    contrast: number;
  };
  palette: {
    family: PaletteFamilyId;
    skinIdx: number;   // 0..11
    accentIdx: number; // 0..11
    glowIdx: number;   // 0..11
  };
  background: BackgroundType;
  /** Free-form provenance the GA writes (parents, operator, generation). Never rendered. */
  meta?: Record<string, any>;
}

// ============================================================================
// reference genomes — the 6 shipped species (+ a neutral human-ish baseline)
// expressed in genome space. They double as the parametric renderer's sanity check.
// ============================================================================

export const REFERENCE_GENOMES: Record<string, FaceGenome> = {
  crystalline: {
    id: 'ref-crystalline',
    silhouette: { family: 'faceted', width: 0.45, jawRatio: 0.16, cranFlat: 0.88, jitterSeed: 0 },
    eyes: { type: 'slit', size: 0.5, spacing: 0.55, tilt: 0.62 },
    signature: { type: 'thirdEyeGem', intensity: 0.55 },
    shading: { planes: 4, contrast: 0.75 },
    palette: { family: 'crystal', skinIdx: 0, accentIdx: 2, glowIdx: 0 },
    background: 'aura',
  },
  saurian: {
    id: 'ref-saurian',
    silhouette: { family: 'beaked', width: 0.27, jawRatio: 0.45, cranFlat: 0.5, jitterSeed: 0 },
    eyes: { type: 'verticalPupil', size: 0.58, spacing: 0.42, tilt: 0.55 },
    signature: { type: 'dorsalCrest', intensity: 0.6 },
    shading: { planes: 3, contrast: 0.55 },
    palette: { family: 'saurian', skinIdx: 0, accentIdx: 3, glowIdx: 0 },
    background: 'none',
  },
  monument: {
    id: 'ref-monument',
    silhouette: { family: 'carved', width: 0.55, jawRatio: 0.49, cranFlat: 0.25, jitterSeed: 0 },
    eyes: { type: 'hollowGlow', size: 0.45, spacing: 0.5, tilt: 0.5 },
    signature: { type: 'laurel', intensity: 0.6 },
    shading: { planes: 4, contrast: 0.6 },
    palette: { family: 'marble', skinIdx: 0, accentIdx: 0, glowIdx: 0 },
    background: 'aura',
  },
  rokykario: {
    id: 'ref-rokykario',
    silhouette: { family: 'plated', width: 0.64, jawRatio: 0.62, cranFlat: 0.65, jitterSeed: 0 },
    eyes: { type: 'molten', size: 0.44, spacing: 0.5, tilt: 0.5 },
    signature: { type: 'rockCrest', intensity: 0.7 },
    shading: { planes: 4, contrast: 0.7 },
    palette: { family: 'basalt', skinIdx: 1, accentIdx: 0, glowIdx: 0 },
    background: 'heatHaze',
  },
  eleftamide: {
    id: 'ref-eleftamide',
    silhouette: { family: 'teardrop', width: 0.18, jawRatio: 0.25, cranFlat: 0.2, jitterSeed: 0 },
    eyes: { type: 'raptorRound', size: 0.55, spacing: 0.42, tilt: 0.55 },
    signature: { type: 'featherCrest', intensity: 0.75 },
    shading: { planes: 3, contrast: 0.5 },
    palette: { family: 'plumage', skinIdx: 0, accentIdx: 0, glowIdx: 0 },
    background: 'windLines',
  },
  aquanimenti: {
    id: 'ref-aquanimenti',
    silhouette: { family: 'dome', width: 0.55, jawRatio: 0.05, cranFlat: 0.12, jitterSeed: 0 },
    eyes: { type: 'sphericalLidless', size: 0.72, spacing: 0.6, tilt: 0.5 },
    signature: { type: 'gills', intensity: 0.7 },
    shading: { planes: 3, contrast: 0.45 },
    palette: { family: 'abyssal', skinIdx: 0, accentIdx: 0, glowIdx: 0 },
    background: 'lightShafts',
  },
  human: {
    id: 'ref-human',
    silhouette: { family: 'smooth', width: 0.4, jawRatio: 0.45, cranFlat: 0.3, jitterSeed: 0 },
    eyes: { type: 'raptorRound', size: 0.42, spacing: 0.48, tilt: 0.5 },
    signature: { type: 'none', intensity: 0 },
    shading: { planes: 3, contrast: 0.45 },
    palette: { family: 'plumage', skinIdx: 2, accentIdx: 11, glowIdx: 0 },
    background: 'none',
  },
};

/** Species order used by the gallery's "existing species" tab. */
export const REFERENCE_ORDER = ['crystalline', 'saurian', 'monument', 'rokykario', 'eleftamide', 'aquanimenti', 'human'];

// ============================================================================
// deterministic RNG (seeded everywhere — a generation must be reproducible)
// ============================================================================

/** mulberry32 — small, fast, good enough, and identical to the Python mirror. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function choice<T>(rng: () => number, arr: T[]): T { return arr[Math.floor(rng() * arr.length) % arr.length]; }
function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

// ============================================================================
// hard constraints — applied at sampling time, never left to the model
// ============================================================================

/** Minimum luminance gap the body base and the signature accent must keep. */
export const MIN_BODY_ACCENT_CONTRAST = 0.14;

/** How far above the crown / beyond the sides a signature may project, per type. */
const SIGNATURE_HEADROOM: Record<SignatureType, number> = {
  thirdEyeGem: 1, dorsalCrest: 0.75, laurel: 0.8, rockCrest: 0.6,
  featherCrest: 0.7, gills: 0.85, hornPair: 0.65, anglerLure: 0.55, none: 1,
};

/** Silhouettes that already eat vertical headroom, so tall signatures must shrink. */
const TALL_FAMILIES: SilhouetteFamily[] = ['spire', 'faceted', 'plated'];

/**
 * Repair a genome (returns a corrected copy) so it always renders inside the 100x100
 * canvas with readable contrast and at most one glowing element.
 *
 * `mode`:
 *   'sampled'   — the full rule set. Everything the GA produces goes through this.
 *   'reference' — safety only (enum membership, numeric ranges, palette wrap). The
 *                 shipped species are the ground truth, not candidates: crystalline
 *                 legitimately pairs glowing slit eyes with a glowing gem, so the
 *                 aesthetic rules must not rewrite the very faces they were derived from.
 */
export function applyConstraints(g: FaceGenome, mode: 'sampled' | 'reference' = 'sampled'): FaceGenome {
  const out: FaceGenome = JSON.parse(JSON.stringify(g));
  const fam = PALETTE_FAMILIES[out.palette.family] || PALETTE_FAMILIES.crystal;
  out.palette.family = fam.id;
  out.palette.skinIdx = ((out.palette.skinIdx % 12) + 12) % 12;
  out.palette.accentIdx = ((out.palette.accentIdx % 12) + 12) % 12;
  out.palette.glowIdx = ((out.palette.glowIdx % 12) + 12) % 12;
  if (SILHOUETTE_FAMILIES.indexOf(out.silhouette.family) < 0) out.silhouette.family = 'smooth';
  if (EYE_TYPES.indexOf(out.eyes.type) < 0) out.eyes.type = 'raptorRound';
  if (SIGNATURE_TYPES.indexOf(out.signature.type) < 0) out.signature.type = 'none';
  if (BACKGROUND_TYPES.indexOf(out.background) < 0) out.background = 'none';

  if (mode === 'sampled') {
    // 1. contrast between body and accent — walk the accent bank until it separates.
    const bodyL = luminance(fam.body[out.palette.skinIdx].md);
    for (let k = 0; k < 12; k++) {
      const idx = (out.palette.accentIdx + k) % 12;
      if (Math.abs(luminance(fam.accent[idx].md) - bodyL) >= MIN_BODY_ACCENT_CONTRAST) {
        out.palette.accentIdx = idx;
        break;
      }
    }

    // 2. signature must stay on canvas: cap intensity by type and by silhouette height.
    let cap = SIGNATURE_HEADROOM[out.signature.type];
    if (TALL_FAMILIES.indexOf(out.silhouette.family) >= 0) cap *= 0.8;
    if (out.silhouette.width > 0.8) cap *= 0.9;   // wide heads leave less side room
    out.signature.intensity = clamp01(Math.min(out.signature.intensity, cap));

    // 3. at most ONE glowing element: emissive eyes win, the signature falls back.
    const eyeGlows = GLOWING_EYES.indexOf(out.eyes.type) >= 0;
    const sigGlows = GLOWING_SIGNATURES.indexOf(out.signature.type) >= 0;
    if (eyeGlows && sigGlows) {
      out.signature.type = out.signature.type === 'thirdEyeGem' ? 'hornPair' : 'dorsalCrest';
      out.signature.intensity = clamp01(Math.min(out.signature.intensity, SIGNATURE_HEADROOM[out.signature.type]));
    }
  }
  if (out.signature.type === 'none') out.signature.intensity = 0;

  // 4. numeric ranges
  out.silhouette.width = clamp01(out.silhouette.width);
  out.silhouette.jawRatio = clamp01(out.silhouette.jawRatio);
  out.silhouette.cranFlat = clamp01(out.silhouette.cranFlat);
  out.silhouette.jitterSeed = ((Math.round(out.silhouette.jitterSeed) % 4) + 4) % 4;
  out.eyes.size = clamp01(out.eyes.size);
  out.eyes.spacing = clamp01(out.eyes.spacing);
  out.eyes.tilt = clamp01(out.eyes.tilt);
  out.shading.planes = Math.max(2, Math.min(4, Math.round(out.shading.planes)));
  out.shading.contrast = clamp01(out.shading.contrast);
  return out;
}

// ============================================================================
// sampling + mixing (the JS mirror of face-lab/facelab/ga.py — keep in sync)
// ============================================================================

export function randomGenome(rng: () => number, id: string): FaceGenome {
  return applyConstraints({
    id,
    silhouette: {
      family: choice(rng, SILHOUETTE_FAMILIES),
      width: rng(), jawRatio: rng(), cranFlat: rng(),
      jitterSeed: Math.floor(rng() * 4),
    },
    eyes: { type: choice(rng, EYE_TYPES), size: rng(), spacing: rng(), tilt: rng() },
    signature: { type: choice(rng, SIGNATURE_TYPES), intensity: 0.35 + rng() * 0.65 },
    shading: { planes: 2 + Math.floor(rng() * 3), contrast: 0.3 + rng() * 0.7 },
    palette: {
      family: choice(rng, PALETTE_FAMILY_IDS),
      skinIdx: Math.floor(rng() * 12), accentIdx: Math.floor(rng() * 12), glowIdx: Math.floor(rng() * 12),
    },
    background: choice(rng, BACKGROUND_TYPES),
  });
}

/** Whole-axis inheritance — the "random mix" the lab is built around. */
export function crossover(a: FaceGenome, b: FaceGenome, rng: () => number, id: string): FaceGenome {
  return applyConstraints({
    id,
    silhouette: rng() < 0.5 ? { ...a.silhouette } : { ...b.silhouette },
    eyes: rng() < 0.5 ? { ...a.eyes } : { ...b.eyes },
    signature: rng() < 0.5 ? { ...a.signature } : { ...b.signature },
    shading: rng() < 0.5 ? { ...a.shading } : { ...b.shading },
    palette: rng() < 0.5 ? { ...a.palette } : { ...b.palette },
    background: rng() < 0.5 ? a.background : b.background,
    meta: { op: 'crossover', parents: [a.id, b.id] },
  });
}

/** Elite mutation: numerics drift ±10%, categoricals flip only rarely. */
export function mutate(a: FaceGenome, rng: () => number, id: string, strength = 0.1): FaceGenome {
  const jog = (v: number) => clamp01(v + (rng() * 2 - 1) * strength);
  const out: FaceGenome = JSON.parse(JSON.stringify(a));
  out.id = id;
  out.meta = { op: 'mutate', parents: [a.id] };
  out.silhouette.width = jog(out.silhouette.width);
  out.silhouette.jawRatio = jog(out.silhouette.jawRatio);
  out.silhouette.cranFlat = jog(out.silhouette.cranFlat);
  out.eyes.size = jog(out.eyes.size);
  out.eyes.spacing = jog(out.eyes.spacing);
  out.eyes.tilt = jog(out.eyes.tilt);
  out.signature.intensity = jog(out.signature.intensity);
  out.shading.contrast = jog(out.shading.contrast);
  if (rng() < strength) out.silhouette.jitterSeed = Math.floor(rng() * 4);
  if (rng() < strength) out.palette.skinIdx = Math.floor(rng() * 12);
  if (rng() < strength) out.palette.accentIdx = Math.floor(rng() * 12);
  if (rng() < strength) out.palette.glowIdx = Math.floor(rng() * 12);
  if (rng() < strength * 0.5) out.eyes.type = choice(rng, EYE_TYPES);
  if (rng() < strength * 0.5) out.signature.type = choice(rng, SIGNATURE_TYPES);
  if (rng() < strength * 0.3) out.silhouette.family = choice(rng, SILHOUETTE_FAMILIES);
  if (rng() < strength * 0.3) out.background = choice(rng, BACKGROUND_TYPES);
  return applyConstraints(out);
}

/** Short human-readable label — used on gallery cards and in export filenames. */
export function describeGenome(g: FaceGenome): string {
  return `${g.silhouette.family}/${g.eyes.type}/${g.signature.type} · ${g.palette.family}`;
}
