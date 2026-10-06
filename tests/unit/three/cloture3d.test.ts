import { describe, it, expect, beforeAll } from 'vitest';
import { ajouterCloture3d, type ContexteCloture3d } from '../../../src/three/cloture3d.js';
import { clotureDe, nouveauPortail, reglerCote } from '../../../src/model/cloture.js';
import type { ObjetPlan, Portail, PtBrut } from '../../../src/model/types.js';

// La cloture en 3D (three/cloture3d.ts, MD/spec-cloture.md §4) : on ne verifie pas le rendu mais la
// structure - combien de prismes par type, les piliers, les vantaux, et rien sans cloture active.
// Un THREE minimal suffit aux vantaux ; les bandes passent par un `addPrism` qui compte.

class Attr { constructor(public array: number[], public itemSize: number) {} }
class Geo {
  attributes: Record<string, Attr> = {};
  index: number[] = [];
  setAttribute(n: string, a: Attr) { this.attributes[n] = a; }
  setIndex(i: number[]) { this.index = i; }
  computeVertexNormals() {}
}
class Mesh {
  name = '';
  constructor(public geometry: Geo, public material: unknown) {}
}

beforeAll(() => {
  (globalThis as Record<string, unknown>).THREE = {
    BufferGeometry: Geo,
    Float32BufferAttribute: Attr,
    Mesh,
    MeshStandardMaterial: class { constructor(public p: unknown) {} },
    DoubleSide: 2,
  };
});

interface Prisme { pts: PtBrut[]; base: number; h: number; couleur: string | number; opacite?: number | undefined; textures: unknown }

function contexte() {
  const ajouts: Mesh[] = [];
  const prismes: Prisme[] = [];
  const ctx: ContexteCloture3d = {
    scene: { add: (m: Mesh) => { ajouts.push(m); } } as unknown as ContexteCloture3d['scene'],
    toLocal: (p) => ({ x: p.x, z: -p.y }),
    prim: { addPrism: (pts, base, h, couleur, _f, opacite, textures) => { if (pts) prismes.push({ pts, base, h, couleur, opacite, textures }); } },
    textures: true,
    chargerTexture: () => ({}) as never,
  };
  return { ctx, ajouts, prismes };
}

const parcelle = (plus: Partial<ObjetPlan> = {}): ObjetPlan => ({
  key: 'parcelle', type: 'polygon', name: 'Parcelle', fonction: 'terrain',
  pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }],
  clotureActive: true, clotureHauteur: 1.8,
  ...plus,
} as ObjetPlan);

const vantaux = (ajouts: Mesh[]) => ajouts.filter(m => m.name === 'cloture-vantail');
const positions = (m: Mesh) => m.geometry.attributes.position?.array ?? [];

describe('ajouterCloture3d', () => {
  it('n ajoute rien sans cloture active, ni sur une parcelle sans sommets', () => {
    const { ctx, ajouts, prismes } = contexte();
    ajouterCloture3d(ctx, parcelle({ clotureActive: false }));
    ajouterCloture3d(ctx, null);
    expect(ajouts).toHaveLength(0);
    expect(prismes).toHaveLength(0);
  });

  it('une palissade par defaut : une bande et ses poteaux sur chaque cote, texturee', () => {
    const { ctx, prismes } = contexte();
    ajouterCloture3d(ctx, parcelle({ clotureTexture: { id: 't', nom: 'T', url: 'u' } }));
    const bandes = prismes.filter(p => p.h === 1.8);
    expect(bandes).toHaveLength(4);
    expect(bandes[0]?.textures).toEqual({ vertical: { id: 't', nom: 'T', url: 'u' } });
    // 20 m : 11 poteaux ; 10 m : 6 ; deux fois chacun.
    const poteaux = prismes.filter(p => p.h === 1.85);
    expect(poteaux).toHaveLength(2 * 11 + 2 * 6);
    // Les bandes ferment l'angle : le coin interieur du cote 0 est celui du cote 3.
    const coin0 = bandes[0]?.pts[3], coin3 = bandes[3]?.pts[2];
    expect(coin0?.x).toBeCloseTo(coin3?.x ?? NaN, 6);
    expect(coin0?.y).toBeCloseTo(coin3?.y ?? NaN, 6);
  });

  it('un mur avec couvertine : deux prismes par cote, sans poteau ; un grillage est translucide', () => {
    const p = parcelle();
    const cl = clotureDe(p, true);
    cl.defaut = { type: 'mur', hauteur: 2, epaisseur: 0.2, couvertine: true, couleur: '#ddd' };
    const grillage = reglerCote(cl, 2);
    Object.assign(grillage, { type: 'grillage', hauteur: 1.5, soubassement: { hauteur: 0.5, parement: 'enduit' } });
    const { ctx, prismes } = contexte();
    ajouterCloture3d(ctx, p);
    const murs = prismes.filter(p => p.h === 2);
    expect(murs).toHaveLength(3);
    expect(prismes.filter(p => p.base === 2 && p.h === 0.04)).toHaveLength(3);
    // Le grillage : son soubassement, sa bande au-dessus, translucide, et ses poteaux.
    const bande = prismes.find(p => p.h === 1.5);
    expect(bande).toMatchObject({ base: 0.5, opacite: 0.35 });
    expect(prismes.filter(p => p.h === 0.5 && p.base === 0)).toHaveLength(1);
    expect(prismes.filter(p => p.h === 1.55)).toHaveLength(9);
  });

  it('un portail a deux battants : la bande coupee, deux piliers a chapeau, deux vantaux', () => {
    const p = parcelle();
    const cl = clotureDe(p, true);
    cl.portails.push({ ...nouveauPortail('portail', 0, 20), x: 5 });
    const { ctx, ajouts, prismes } = contexte();
    ajouterCloture3d(ctx, p);
    // Cote 0 en deux troncons, trois autres cotes, et les deux piliers, a 1,80 m eux aussi.
    expect(prismes.filter(p => p.h === 1.8).length).toBe(2 + 3 + 2);
    const etendue = (q: Prisme) => Math.max(...q.pts.map(pt => pt.x)) - Math.min(...q.pts.map(pt => pt.x)) + Math.max(...q.pts.map(pt => pt.y)) - Math.min(...q.pts.map(pt => pt.y));
    expect(prismes.filter(p => p.h === 1.8 && p.base === 0 && etendue(p) < 0.61)).toHaveLength(2);
    expect(prismes.filter(p => p.base === 1.8 && p.h === 0.04)).toHaveLength(2);
    const v = vantaux(ajouts);
    expect(v).toHaveLength(2);
    // Chaque vantail : deux faces de 4 sommets et un chant.
    expect(positions(v[0]!)).toHaveLength(8 * 3);
    expect(v[0]!.geometry.index.length).toBe(2 * 2 * 3 + 4 * 6);
  });

  it('ouvert, un battant se deploie le long de la normale ; un coulissant glisse de sa largeur', () => {
    const p = parcelle();
    const cl = clotureDe(p, true);
    const a: Portail = { ...nouveauPortail('portail', 0, 20), x: 5, ouverture: 'battant-1', piliers: null };
    cl.portails.push(a);
    const ferme = contexte();
    ajouterCloture3d(ferme.ctx, p);
    const xsFerme = positions(vantaux(ferme.ajouts)[0]!).filter((_, i) => i % 3 === 0);
    expect(Math.max(...xsFerme) - Math.min(...xsFerme)).toBeCloseTo(3.5, 2);
    a.ouvert = true;
    const ouvert = contexte();
    ajouterCloture3d(ouvert.ctx, p);
    const zsOuvert = positions(vantaux(ouvert.ajouts)[0]!).filter((_, i) => i % 3 === 2);
    expect(Math.max(...zsOuvert) - Math.min(...zsOuvert)).toBeCloseTo(3.5, 2);
    a.ouverture = 'coulissant';
    a.refoulement = 'droite';
    const glisse = contexte();
    ajouterCloture3d(glisse.ctx, p);
    const xsGlisse = positions(vantaux(glisse.ajouts)[0]!).filter((_, i) => i % 3 === 0);
    expect(Math.min(...xsGlisse)).toBeCloseTo(5 + 3.5, 2);
  });

  it('sur un sol en relief, chaque panneau se pose sur le sol : du plus bas sous ses bouts au sol en son milieu plus sa hauteur', () => {
    // Le sol monte de 10 cm par metre vers l'est : les deux cotes est-ouest sont en pente, les deux
    // autres de niveau.
    const sol = (p: PtBrut) => 0.1 * p.x;
    const { ctx, prismes } = contexte();
    ctx.sol = sol;
    ajouterCloture3d(ctx, parcelle());
    const poteau = (q: Prisme) => Math.max(...q.pts.map(pt => pt.x)) - Math.min(...q.pts.map(pt => pt.x)) < 0.2 && Math.max(...q.pts.map(pt => pt.y)) - Math.min(...q.pts.map(pt => pt.y)) < 0.2;
    const bandes = prismes.filter(p => !poteau(p));
    // 20 m en 8 panneaux de 2,5 m, 10 m en 4, deux fois chacun.
    expect(bandes).toHaveLength(2 * 8 + 2 * 4);
    bandes.forEach(b => {
      // Les deux premiers points sont sur l'alignement ; les deux autres, a l'interieur, sont mitres aux angles.
      const xs = b.pts.slice(0, 2).map(pt => pt.x);
      const milieu = ((xs[0] ?? 0) + (xs[1] ?? 0)) / 2;
      // Le haut est a 1,80 m au-dessus du sol au milieu du panneau ; le bas n'est jamais au-dessus du sol a ses bouts.
      expect(b.base + b.h).toBeCloseTo(0.1 * milieu + 1.8, 6);
      expect(b.base).toBeLessThanOrEqual(0.1 * Math.min(...xs) + 1e-9);
    });
    const enPente = bandes.filter(b => Math.abs(b.h - (1.8 + 0.125)) < 1e-6);
    expect(enPente).toHaveLength(16);
    // Un poteau se pose sur son propre sol : son haut est a 1,85 m au-dessus du sol en son centre.
    prismes.filter(poteau).forEach(p => {
      const xs = p.pts.map(pt => pt.x);
      expect(p.base + p.h).toBeCloseTo(0.1 * (Math.min(...xs) + Math.max(...xs)) / 2 + 1.85, 6);
    });
  });

  it('semi-ajoure : un soubassement plein par vantail ; chapeau de gendarme : un profil courbe', () => {
    const p = parcelle();
    const cl = clotureDe(p, true);
    cl.portails.push({ ...nouveauPortail('portail', 0, 20), x: 5, remplissage: 'semi', forme: 'chapeau-de-gendarme', fleche: 0.3 });
    const { ctx, ajouts } = contexte();
    ajouterCloture3d(ctx, p);
    const v = vantaux(ajouts);
    expect(v).toHaveLength(4);
    const ys = positions(v[0]!).filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeCloseTo(1.9, 2);
  });
});
