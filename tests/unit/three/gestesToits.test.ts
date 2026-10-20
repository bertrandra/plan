import { describe, it, expect } from 'vitest';
import { PIECES, piecesDe, appliquerPiece, raisonIndisponible, reprendreLectureAuto, corpsPrincipal } from '../../../src/three/gestesToits.js';
import { vueIsometrique, EXEMPLES_TOITS } from '../../../src/three/catalogueToits.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Un batiment rectangulaire de 10 x 6 m, egout a 3 m, toit simple de 2,5 m.
const batiment = (extra: Partial<ObjetPlan> = {}): ObjetPlan => ({
  key: 'b', name: 'Maison', type: 'polygon', fonction: 'batiment', elevation: 3,
  pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }],
  toit: { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 0, source: 'bdtopo' },
  ...extra
} as unknown as ObjetPlan);

describe('le catalogue du toit', () => {
  it('a une image pour chaque forme et chaque lucarne', () => {
    for (const p of PIECES.filter((x) => x.exemple)) {
      const e = EXEMPLES_TOITS.find((x) => x.id === p.exemple);
      expect(e, p.id).toBeDefined();
      expect(vueIsometrique(e!).facettes.length, p.id).toBeGreaterThan(0);
    }
  });
  it('a trois familles non vides', () => {
    for (const f of ['toit', 'sur', 'facade'] as const) expect(piecesDe(f).length).toBeGreaterThan(0);
  });
});

describe('poser un geste', () => {
  it('une forme remet le corps a l echelle du batiment, fige le toit', () => {
    const o = batiment();
    expect(appliquerPiece(o, 'forme:croupes')).toBe(true);
    const c = corpsPrincipal(o)!;
    const xs = c.pts.map((p) => p.x), ys = c.pts.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10, 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(6, 1);
    expect(Math.min(...c.egouts)).toBeCloseTo(3, 1);
    expect(c.faitage).toBeCloseTo(5.5, 1);
    expect(o.toitFige).toBe(true);
    expect(o.modeToit).toBe('corps');
  });
  it('une cheminee se pose sur un batiment sans corps, en creant le corps', () => {
    const o = batiment();
    expect(appliquerPiece(o, 'sur:cheminee')).toBe(true);
    expect(corpsPrincipal(o)!.cheminees?.length).toBe(1);
  });
  it('une lucarne s ajoute au corps', () => {
    const o = batiment();
    const id = piecesDe('sur').find((p) => p.exemple)!.id;
    expect(appliquerPiece(o, id)).toBe(true);
    expect(corpsPrincipal(o)!.lucarnes?.length).toBe(1);
  });
  it('une galerie neuve est un appentis ouvert adosse a un mur', () => {
    const o = batiment();
    expect(raisonIndisponible(o, 'facade:galerie')).toBeNull();
    expect(appliquerPiece(o, 'facade:galerie')).toBe(true);
    expect(o.corpsToit).toHaveLength(2);
    const g = o.corpsToit![1]!;
    expect(g.ouvert).toBe(true);
    expect(g.saillie?.genre).toBe('galerie');
    expect(g.posFaitage).toBe(0);
    expect(o.toitFige).toBe(true);
    // Le corps principal reste le premier, et reste le principal.
    expect(corpsPrincipal(o)).toBe(o.corpsToit![0]);
  });
  it('un appentis ferme est ferme', () => {
    const o = batiment();
    appliquerPiece(o, 'facade:appentis-ferme');
    expect(o.corpsToit![1]!.ouvert).toBe(false);
  });
  it('deux elements se posent sur deux murs differents', () => {
    const o = batiment();
    appliquerPiece(o, 'facade:bow-rectangle');
    appliquerPiece(o, 'facade:bow-arc');
    const [a, b] = [o.corpsToit![1]!.saillie!, o.corpsToit![2]!.saillie!];
    expect(a.mur).not.toBe(b.mur);
  });
  it('refuse un geste inconnu', () => {
    expect(appliquerPiece(batiment(), 'forme:nexistepas')).toBe(false);
  });
});

describe('rallumer les regles', () => {
  it('rend le batiment a la lecture automatique', () => {
    const o = batiment();
    appliquerPiece(o, 'forme:pavillon');
    reprendreLectureAuto(o);
    expect(o.toitFige).toBeUndefined();
    expect(o.corpsToit).toBeUndefined();
    expect(o.modeToit).toBeUndefined();
  });
});

describe('le pignon sur la facade choisie', () => {
  it('refuse un cote court et un toit sans pignon, le dit, et se pose du cote du mur choisi', () => {
    const o = batiment();
    appliquerPiece(o, 'forme:deux-pans');
    expect(raisonIndisponible(o, 'sur:pignon', { rang: 0, mur: 1 })).toBe('Pas de pignon sur cette façade.');
    expect(raisonIndisponible(o, 'sur:pignon', { rang: 0, mur: 3 })).toBe('Pas de pignon sur cette façade.');
    expect(raisonIndisponible(o, 'sur:pignon', { rang: 0, mur: 0 })).toBeNull();
    // Un refus ne pose rien.
    expect(appliquerPiece(o, 'sur:pignon', { rang: 0, mur: 1 })).toBe(false);
    expect(o.corpsToit![0]!.pignons).toHaveLength(0);
    // Le long pan d'en face : le pignon est du pan 1.
    expect(appliquerPiece(o, 'sur:pignon', { rang: 0, mur: 2 })).toBe(true);
    expect(o.corpsToit![0]!.pignons[0]!.pan).toBe(1);
    const plat = batiment();
    appliquerPiece(plat, 'forme:plat');
    expect(raisonIndisponible(plat, 'sur:pignon', { rang: 0, mur: 0 })).toBe('Pas de pignon sur cette façade.');
    // Sans facade choisie, rien ne change : le geste d'avant.
    expect(raisonIndisponible(o, 'sur:pignon')).toBeNull();
  });
});
