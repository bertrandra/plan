import { describe, it, expect, beforeAll } from 'vitest';
import { aDesDetails, contourBaie, flecheCintre, poserDetailsOuvertures, DETAILS_OUVERTURE } from '../../../src/three/detailsOuvertures.js';
import { ajouterDetailsBatiment } from '../../../src/three/detailsBatiment.js';
import { ajouterReleve3d } from '../../../src/three/releve3d.js';
import { facadesDuContour } from '../../../src/facade/geometrie.js';
import type { DetailsOuverture, Fenetre3d, ObjetPolygone, OuvertureFacade, PtBrut } from '../../../src/model/types.js';

// Les details des ouvertures en 3D (lot G17), verifies en structure avec un THREE minimal : quelles
// mailles, ou sont leurs sommets dans le repere du mur, et qu'une ouverture sans details ne change rien.

class Attr {
  constructor(public array: number[], public itemSize: number) {}
}
class Geo {
  attributes: Record<string, Attr> = {};
  index: number[] = [];
  groups: { start: number; count: number; materialIndex: number }[] = [];
  setAttribute(n: string, a: Attr) { this.attributes[n] = a; }
  setIndex(i: number[]) { this.index = i; }
  addGroup(start: number, count: number, materialIndex: number) { this.groups.push({ start, count, materialIndex }); }
  computeVertexNormals() {}
}
class Box extends Geo {}
class Mesh {
  name = '';
  position = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } };
  rotation = { y: 0 };
  constructor(public geometry: Geo, public material: unknown) {}
}
class Couleur {
  constructor(public c: unknown) {}
  multiplyScalar() { return this; }
}

beforeAll(() => {
  (globalThis as Record<string, unknown>).THREE = {
    BufferGeometry: Geo, Float32BufferAttribute: Attr, BoxGeometry: Box, Mesh, LineSegments: Mesh, Color: Couleur,
    MeshStandardMaterial: class { constructor(public p: Record<string, unknown>) {} },
    LineBasicMaterial: class { constructor(public p: unknown) {} },
    TextureLoader: class { load() { return { anisotropy: 1 }; } },
    DoubleSide: 2,
  };
});

const p = (x: number, y: number): PtBrut => ({ x, y });
// Le mur du bas (cote 0), de (0, 0) a (12, 0) : vu de dehors (depuis le sud), sa gauche est en x = 0.
const contour = [p(0, 0), p(12, 0), p(12, 8), p(0, 8)];
const maison = (): ObjetPolygone => ({ key: 'maison', name: 'Maison', type: 'polygon', fonction: 'batiment', pts: contour });
const mur = () => facadesDuContour(contour, 6).find((f) => f.cote === 0)!;

function scene() {
  const ajoutes: Mesh[] = [];
  return { ajoutes, ctx: { scene: { add: (m: Mesh) => ajoutes.push(m) } as never, toLocal: (q: PtBrut) => ({ x: q.x, z: -q.y }), couleurMur: '#ccc', textures: false, distance: 0 } };
}
/** Les sommets d'une maille dans le repere du mur du bas : x le long du mur, y en hauteur, s en saillie (vers le sud). */
const sommets = (m: Mesh, groupe?: number) => {
  const a = m.geometry.attributes.position!.array;
  const idx = groupe === undefined ? m.geometry.index : (() => {
    const g = m.geometry.groups.find((q) => q.materialIndex === groupe);
    return g ? m.geometry.index.slice(g.start, g.start + g.count) : [];
  })();
  return [...new Set(idx)].map((i) => ({ x: a[3 * i]!, y: a[3 * i + 1]!, s: a[3 * i + 2]! }));
};
const borne = (pts: { x: number; y: number; s: number }[]) => ({
  x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)),
  y0: Math.min(...pts.map((q) => q.y)), y1: Math.max(...pts.map((q) => q.y)),
  s0: Math.min(...pts.map((q) => q.s)), s1: Math.max(...pts.map((q) => q.s)),
});
const fenetre = (details?: DetailsOuverture, y = 3.5, h = 1.35): Fenetre3d => ({ type: 'fenetre', cote: 0, x: 4, y, l: 1.2, h, ...(details ? { details } : {}) });

describe('contourBaie', () => {
  it('rectangle : quatre sommets, elargis de la marge', () => {
    expect(contourBaie({ x: 1, y: 2, l: 1, h: 1.5 }, 0.1)).toEqual([p(0.9, 1.9), p(2.1, 1.9), p(2.1, 3.6), p(0.9, 3.6)]);
    expect(contourBaie({ x: 1, y: 2, l: 1, h: 1.5 }, 0.1, true)[0]).toEqual(p(0.9, 2));
  });
  it('cintre : la cle au haut de la baie, les tableaux droits jusqu a la naissance de l arc', () => {
    const o = { x: 0, y: 1, l: 1.2, h: 2, details: { forme: 'cintre' as const } };
    const c = contourBaie(o);
    expect(flecheCintre(1.2, 2)).toBeCloseTo(0.6, 9); // plein cintre
    expect(c).toHaveLength(2 + DETAILS_OUVERTURE.segments + 1);
    expect(Math.max(...c.map((q) => q.y))).toBeCloseTo(3, 9);
    expect(c[2]!.x).toBeCloseTo(1.2, 9);
    expect(c[2]!.y).toBeCloseTo(2.4, 9);
    // Elargi de la marge : meme nombre de sommets, la cle relevee d'autant.
    const e = contourBaie(o, 0.08);
    expect(e).toHaveLength(c.length);
    expect(Math.max(...e.map((q) => q.y))).toBeCloseTo(3.08, 9);
    // Une baie basse : un arc surbaisse, 60 % de tableaux droits.
    expect(flecheCintre(1.2, 1)).toBeCloseTo(0.4, 9);
  });
  it('rond : une ellipse inscrite dans la boite', () => {
    const c = contourBaie({ x: 0, y: 4, l: 0.8, h: 0.8, details: { forme: 'rond' } });
    expect(Math.min(...c.map((q) => q.x))).toBeCloseTo(0, 9);
    expect(Math.max(...c.map((q) => q.x))).toBeCloseTo(0.8, 9);
    expect(Math.min(...c.map((q) => q.y))).toBeCloseTo(4, 9);
    expect(Math.max(...c.map((q) => q.y))).toBeCloseTo(4.8, 9);
  });
});

describe('aDesDetails', () => {
  it('ce qui ne se dessine pas n est pas un detail', () => {
    expect(aDesDetails(undefined)).toBe(false);
    expect(aDesDetails({ volets: 'aucun', allege: 'pleine', forme: 'rect' })).toBe(false);
    expect(aDesDetails({ ferme: true })).toBe(false);
    expect(aDesDetails({ volets: 'battants' })).toBe(true);
    expect(aDesDetails({ forme: 'rond' })).toBe(true);
  });
});

describe('poserDetailsOuvertures', () => {
  const poser = (o: OuvertureFacade, hMur = 6) => {
    const { ajoutes, ctx } = scene();
    poserDetailsOuvertures(ctx, [{ f: mur(), o, hMur, cadre: 0.08 }]);
    return ajoutes;
  };

  it('n ajoute rien sans details', () => {
    expect(poser(fenetre())).toHaveLength(0);
    expect(poser(fenetre({ volets: 'aucun', allege: 'pleine' }))).toHaveLength(0);
  });

  it('volets battants ouverts : deux vantaux d une demi-baie, contre le mur, de part et d autre du cadre', () => {
    const [m] = poser(fenetre({ volets: 'battants' }));
    expect(m!.name).toBe('batiment-details-ouvertures');
    const pts = sommets(m!, 0);
    const gauche = borne(pts.filter((q) => q.x < 4)),
      droite = borne(pts.filter((q) => q.x > 5.2));
    expect(gauche.x0).toBeCloseTo(4 - 0.08 - 0.6, 9);
    expect(gauche.x1).toBeCloseTo(4 - 0.08, 9);
    expect(droite.x0).toBeCloseTo(5.2 + 0.08, 9);
    expect(droite.x1).toBeCloseTo(5.2 + 0.08 + 0.6, 9);
    expect(gauche.y0).toBeCloseTo(3.5, 9);
    expect(gauche.y1).toBeCloseTo(4.85, 9);
    // Rien devant la vitre.
    expect(pts.filter((q) => q.x > 4.01 && q.x < 5.19)).toHaveLength(0);
    // Saillie vers la rue (le sud : -y du plan, +z en Three).
    expect(gauche.s0).toBeCloseTo(DETAILS_OUVERTURE.saillieVolet, 9);
  });

  it('volets fermes, persiennes : devant la vitre ; ouvertes : des lames inclinees', () => {
    const fermes = borne(sommets(poser(fenetre({ volets: 'battants', ferme: true }))[0]!, 0));
    expect(fermes.x0).toBeCloseTo(4, 9);
    expect(fermes.x1).toBeCloseTo(5.2, 9);
    const [m] = poser(fenetre({ volets: 'persiennes' }));
    const s = sommets(m!, 0).map((q) => q.s);
    expect(new Set(s.map((v) => v.toFixed(4))).size).toBe(2);
    expect(m!.geometry.index.length / 6).toBeGreaterThan(2 * 10);
  });

  it('volet roulant : le coffre au-dessus du cadre, le tablier baisse s il est ferme', () => {
    const coffre = borne(sommets(poser(fenetre({ volets: 'roulant' }))[0]!, 1));
    expect(coffre.y0).toBeCloseTo(4.85 + 0.08, 9);
    expect(coffre.y1).toBeCloseTo(4.85 + 0.08 + DETAILS_OUVERTURE.coffre.hauteur, 9);
    expect(coffre.s1).toBeCloseTo(DETAILS_OUVERTURE.coffre.saillie, 9);
    // Sous l'egout : le coffre est borne par le mur, et omis s'il n'y tient pas.
    expect(poser(fenetre({ volets: 'roulant' }), 4.9)).toHaveLength(0);
    const ferme = borne(sommets(poser(fenetre({ volets: 'roulant', ferme: true }))[0]!, 1));
    expect(ferme.y0).toBeCloseTo(3.5, 9);
  });

  it('balcon : une dalle au niveau de l appui qui deborde des tableaux, et son garde-corps sur trois cotes', () => {
    const [m] = poser({ type: 'porte-fenetre', x: 4, y: 3, l: 1.4, h: 2.15, details: { allege: 'balcon' } });
    const dalle = borne(sommets(m!, 2));
    const B = DETAILS_OUVERTURE.balcon;
    expect(dalle.x0).toBeCloseTo(4 - B.debord, 9);
    expect(dalle.x1).toBeCloseTo(5.4 + B.debord, 9);
    expect(dalle.y1).toBeCloseTo(3, 9);
    expect(dalle.y0).toBeCloseTo(3 - B.epaisseur, 9);
    expect(dalle.s1).toBeCloseTo(B.portee, 9);
    const gc = borne(sommets(m!, 3));
    expect(gc.y1).toBeCloseTo(3 + DETAILS_OUVERTURE.gardeCorps.hauteur, 9);
    expect(gc.s1).toBeGreaterThan(B.portee - 0.1);
  });

  it('garde-corps seul : devant la baie, a mi-hauteur au plus ; rien sous une baie au sol', () => {
    const gc = borne(sommets(poser(fenetre({ allege: 'garde-corps' }, 3.5, 2.2))[0]!, 3));
    // Les barreaux de bout sont centres sur les tableaux.
    expect(gc.x0).toBeCloseTo(4 - DETAILS_OUVERTURE.gardeCorps.barreau / 2, 9);
    expect(gc.x1).toBeCloseTo(5.2 + DETAILS_OUVERTURE.gardeCorps.barreau / 2, 9);
    expect(gc.y1).toBeCloseTo(3.5 + 1, 9);
    expect(poser({ type: 'porte-fenetre', x: 4, y: 0, l: 1.4, h: 2.15, details: { allege: 'balcon' } })).toHaveLength(0);
  });
});

describe('ajouterDetailsBatiment, ouvertures detaillees', () => {
  const ouvertures = (liste: Fenetre3d[]) => {
    const { ajoutes, ctx } = scene();
    ajouterDetailsBatiment(ctx, maison(), 6, { ouvertures: liste });
    return ajoutes;
  };

  it('une ouverture sans details : exactement les memes mailles et les memes sommets qu avant', () => {
    const sans = ouvertures([fenetre()]);
    const vides = ouvertures([fenetre({ volets: 'aucun', allege: 'pleine', forme: 'rect' })]);
    expect(vides.map((m) => m.name)).toEqual(sans.map((m) => m.name));
    const ouv = (a: Mesh[]) => a.find((m) => m.name === 'batiment-ouvertures')!.geometry;
    expect(ouv(vides).attributes.position!.array).toEqual(ouv(sans).attributes.position!.array);
    expect(ouv(vides).index).toEqual(ouv(sans).index);
    expect(sans.some((m) => m.name === 'batiment-details-ouvertures')).toBe(false);
  });

  it('volets et balcon : une maille de details en plus, les ouvertures inchangees', () => {
    const sans = ouvertures([fenetre()]);
    const avec = ouvertures([fenetre({ volets: 'battants', allege: 'balcon' })]);
    expect(avec.map((m) => m.name).sort()).toEqual([...sans.map((m) => m.name), 'batiment-details-ouvertures'].sort());
    const ouv = (a: Mesh[]) => a.find((m) => m.name === 'batiment-ouvertures')!.geometry;
    expect(ouv(avec).attributes.position!.array).toEqual(ouv(sans).attributes.position!.array);
  });

  it('baie cintree : le cadre et la vitre suivent l arc, la cle au haut de la baie', () => {
    const [ouv] = ouvertures([fenetre({ forme: 'cintre' })]).filter((m) => m.name === 'batiment-ouvertures');
    const vitre = borne(sommets(ouv!, 1));
    expect(vitre.y1).toBeCloseTo(4.85, 9);
    expect(sommets(ouv!, 1).length).toBe(2 + DETAILS_OUVERTURE.segments + 1);
    const cadre = borne(sommets(ouv!, 0));
    expect(cadre.y1).toBeCloseTo(4.85 + 0.08, 9);
  });
});

describe('ajouterReleve3d, details du releve', () => {
  const releve = (ouvertures: OuvertureFacade[], texture: string | null = null) => {
    const { ajoutes, ctx } = scene();
    ajouterReleve3d({ ...ctx, textures: true }, { ...maison(), facades: [{ cote: 0, largeur: 12, hauteur: 6, texture, ouvertures, distance: null, sourceDistance: null, releveLe: '' }] }, 6);
    return ajoutes;
  };

  it('une baie ronde : une bande d encadrement et sa vitre, au lieu des quatre pieces droites', () => {
    const a = releve([{ type: 'fenetre', x: 4, y: 4, l: 0.8, h: 0.8, details: { forme: 'rond' } }]);
    expect(a.map((m) => m.name)).toEqual(['releve-ouverture-forme']);
    expect(a[0]!.geometry.groups.map((g) => g.materialIndex)).toEqual([0, 1]);
    // Avec une photo, pas de vitre : la photo la montre.
    const b = releve([{ type: 'fenetre', x: 4, y: 4, l: 0.8, h: 0.8, details: { forme: 'rond' } }], 'data:image/jpeg;base64,');
    expect(b.find((m) => m.name === 'releve-ouverture-forme')!.geometry.groups).toHaveLength(1);
  });

  it('des volets roulants reconnus : le coffre en plus de l encadrement', () => {
    const sans = releve([{ type: 'fenetre', x: 4, y: 1, l: 1.2, h: 1.35 }]);
    const avec = releve([{ type: 'fenetre', x: 4, y: 1, l: 1.2, h: 1.35, details: { volets: 'roulant' } }]);
    expect(avec).toHaveLength(sans.length + 1);
    expect(avec.at(-1)!.name).toBe('batiment-details-ouvertures');
  });
});
