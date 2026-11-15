import { DomSanitizer } from '@angular/platform-browser';
import { PlayerFaceComponent } from './player-face.component';
import { spriteAppearance } from '../live-match/appearance';

describe('PlayerFaceComponent world species', () => {
  const sanitizer = { bypassSecurityTrustHtml: (value: string) => value } as unknown as DomSanitizer;
  const render = (face: PlayerFaceComponent): string => String(face.innerSvg);
  const svgDocument = (face: PlayerFaceComponent): Document => new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${render(face)}</svg>`, 'image/svg+xml');

  function player(species: string, nationId: number): PlayerFaceComponent {
    const face = new PlayerFaceComponent(sanitizer);
    Object.assign(face, {
      species, nationId, baseFaceId: 0, skinTone: 0, hairColor: 0,
      eyeColor: 0, faceShape: 1, hairStyle: 8, browShape: 0,
      eyeShape: 0, noseShape: 0, mouthShape: 0
    });
    return face;
  }

  it('gives Veyra two rounded ear lobes per side and Branik exactly three forehead arches', () => {
    const veyra = svgDocument(player('veyran', 10));
    expect(veyra.querySelector('parsererror')).toBeNull();
    expect(veyra.querySelectorAll('[data-feature="double-ear"]').length).toBe(2);
    expect(veyra.querySelectorAll('[data-feature="double-ear"] ellipse').length).toBe(4);
    const branik = svgDocument(player('branik', 11));
    expect(branik.querySelector('parsererror')).toBeNull();
    expect(branik.querySelectorAll('[data-feature="brow-arch"]').length).toBe(3);
  });

  it('renders four natural Sileth eyes with separate clipping paths and an unobstructed eye band', () => {
    const face = player('sileth', 12);
    face.hairStyle = 9; // Long fringe still must leave both pairs readable.
    const doc = svgDocument(face);
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelectorAll('[data-eye-pair]').length).toBe(2);
    expect(doc.querySelectorAll('[data-eye-pair] circle[fill="#0e0c12"]').length).toBe(4);
    const ids = Array.from(doc.querySelectorAll('clipPath')).map(path => path.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(doc.querySelector('mask rect[fill="black"]')).not.toBeNull();
  });

  for (const [species, nationId] of [['veyran', 10], ['branik', 11], ['sileth', 12]] as const) {
    it(`keeps ${species} card and match-sprite colours aligned`, () => {
      for (let index = 0; index < 12; index++) {
        const face = player(species, nationId);
        face.skinTone = index;
        face.hairColor = (index + 2) % 12;
        const appearance = spriteAppearance(face, 123);
        expect(appearance.skin).toMatch(/^#[0-9a-f]{6}$/);
        expect(appearance.hairColor).toMatch(/^#[0-9a-f]{6}$/);
        expect(render(face)).toContain(`fill="${appearance.skin}"`);
        expect(render(face)).toContain(`fill="${appearance.hairColor}"`);
        expect(appearance.variantId).not.toBe(spriteAppearance({ ...face, species: 'human' }, 123).variantId);
      }
    });

    it(`keeps every editor control functional for ${species}`, () => {
      const face = player(species, nationId);
      const baseline = render(face);
      const changes: Partial<PlayerFaceComponent> = {
        baseFaceId: 1, skinTone: 1, hairColor: 1, eyeColor: 1,
        faceShape: 3, hairStyle: 11, browShape: 2,
        eyeShape: 3, noseShape: 2, mouthShape: 2
      };
      for (const [key, value] of Object.entries(changes)) {
        const variant = player(species, nationId);
        Object.assign(variant, { [key]: value });
        // Compare drawings excluding IDs: a new clip ID by itself is not variety.
        const drawing = (svg: string) => svg.replace(/world_[\w-]+/g, 'descriptor');
        expect(drawing(render(variant))).withContext(key).not.toBe(drawing(baseline));
        expect(svgDocument(variant).querySelector('parsererror')).withContext(key).toBeNull();
      }
      expect(render(face)).toBe(baseline);
    });

    it(`preserves ${species} anatomy when a player moves to another nation's club`, () => {
      const face = player(species, nationId);
      const original = render(face);
      for (const otherNation of [0, 1, 3, 6, 7, 8, 9, 10, 11, 12]) {
        face.nationId = otherNation;
        expect(render(face)).withContext(`nation ${otherNation}`).toBe(original);
      }
    });
  }

  it('does not wrap new or unknown human nationalities onto old national signatures', () => {
    const face = player('human', 0);
    const neutral = render(face);
    for (const nationId of [10, 11, 12, 16, -1]) {
      face.nationId = nationId;
      expect(render(face)).withContext(`nation ${nationId}`).toBe(neutral);
    }
    face.nationId = 1;
    expect(render(face)).not.toBe(neutral);
  });
});
