import { describe, it, expect } from 'vitest';
import {
  altitudeNGF, zLocal, penteParcelle, textePente, profilRelief, equidistanceAuto, equidistanceRelief, niveauxCourbes,
  estCourbeMaitresse, pasPourEmprise, dimensionsGrille, empriseRelief, zRefPour, pointDeReference, ligneDePlusGrandePente,
  libelleSource, resumeRelief, affichageRelief, reliefDe, texteOrientation, MAX_CELLULES_RELIEF
} from '../../../src/model/relief.js';
import type { ObjetPlan, Relief } from '../../../src/model/types.js';

// Le modele du relief (MD/spec-relief.md §3, §9.2) : la lecture bilineaire, la pente par moindres
// carres, le profil, l'equidistance, le zero du plan — sur des grilles planes dont on connait tout.

/** Une grille plane z = a·x + b·y + c, `nx × ny` au pas donne, coin nord-ouest en (x0, y0). */
function plane(a: number, b: number, c: number, nx = 10, ny = 8, pas = 1, x0 = 0.5, y0 = 7.5, bruit?: (k: number) => number): Relief {
  const z: (number | null)[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * pas, y = y0 - j * pas;
    z.push(Math.round((a * x + b * y + c + (bruit ? bruit(j * nx + i) : 0)) * 100) / 100);
  }
  return { source: 'rge-alti', couche: 'test', dateLecture: '2026-10-06', origine: 'test', precision: 'Emq < 30 cm', systemeAltimetrique: 'NGF-IGN69', pas, x0, y0, nx, ny, z, zRef: c };
}
const parcellePts = [{ x: 1, y: 1 }, { x: 8, y: 1 }, { x: 8, y: 6 }, { x: 1, y: 6 }];
const parcelle: ObjetPlan = { key: 'parcelle', type: 'polygon', name: 'Parcelle', fonction: 'terrain', pts: parcellePts, relief: null } as ObjetPlan;
const terrasse: ObjetPlan = { key: 't', type: 'polygon', name: 'T', fonction: 'terrasse', pts: [{ x: 2, y: 2 }, { x: 4, y: 2 }, { x: 4, y: 4 }, { x: 2, y: 4 }] } as ObjetPlan;

describe('la lecture bilineaire', () => {
  it('est exacte sur un plan, entre les cellules comme dessus', () => {
    // Des coefficients qui tombent au centimetre sur chaque cellule : la grille est arrondie au cm.
    const r = plane(0.1, -0.04, 100);
    expect(altitudeNGF(r, 0.5, 7.5)).toBeCloseTo(100 + 0.05 - 0.3, 9);
    expect(altitudeNGF(r, 3.25, 4.1)).toBeCloseTo(100 + 0.325 - 0.164, 6);
    expect(zLocal(r, 3.25, 4.1)).toBeCloseTo(0.325 - 0.164, 6);
  });

  it('rend null hors de l emprise et sur un trou', () => {
    const r = plane(0, 0, 50);
    expect(altitudeNGF(r, -1, 3)).toBeNull();
    expect(altitudeNGF(r, 3, 9)).toBeNull();
    // Au bord des cellules, encore dedans.
    expect(altitudeNGF(r, 0.01, 7.99)).toBe(50);
    r.z[3 * r.nx + 4] = null;
    expect(altitudeNGF(r, 4.5, 4.5)).toBeNull();
    expect(altitudeNGF(r, 4.2, 4.2)).toBeNull();
    expect(altitudeNGF(r, 1.5, 1.5)).toBe(50);
  });
});

describe('la pente de la parcelle', () => {
  it('retrouve la pente et l orientation d un plan a 0,1 % et 1 degre pres', () => {
    // Descend vers le sud-est : z baisse quand x monte et quand y monte... non : z = -0,03·x + 0,04·y
    // descend vers l'est (x) et vers le sud (-y).
    const r = plane(-0.03, 0.04, 120);
    const p = penteParcelle(r, parcellePts)!;
    expect(p.pentePct).toBeCloseTo(5, 1);
    expect(p.azimutDeg).toBeCloseTo(Math.atan2(0.03, -0.04) * 180 / Math.PI, 0);
    expect(p.orientation).toBe('SE');
    expect(textePente(p)).toBe('5,0 % vers le SE');
  });

  it('tient le bruit : ± 2 cm donnent la pente a ± 0,2 %', () => {
    const r = plane(0.04, 0, 100, 40, 40, 0.5, 0.25, 19.75, (k) => ((k * 7919) % 5 - 2) / 100);
    const p = penteParcelle(r, [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }])!;
    expect(Math.abs(p.pentePct - 4)).toBeLessThan(0.2);
    expect(p.orientation).toBe('O');
  });

  it('dit « sensiblement plat » sous 1 %, et rend null sous trois cellules', () => {
    expect(textePente(penteParcelle(plane(0.005, 0, 10), parcellePts)!)).toBe('sensiblement plat');
    expect(penteParcelle(plane(0.1, 0, 10), [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 0.1 }])).toBeNull();
  });

  it('nomme les huit orientations', () => {
    expect(['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'].map((_, i) => texteOrientation(i * 45))).toEqual(['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']);
    expect(texteOrientation(-10)).toBe('N');
  });
});

describe('le profil et la coupe proposee', () => {
  it('echantillonne une droite tous les demi-pas, les deux bouts compris', () => {
    const r = plane(0.1, 0, 100);
    const prof = profilRelief(r, { x: 1, y: 4 }, { x: 7, y: 4 });
    expect(prof).toHaveLength(13);
    expect(prof[0]!.s).toBe(0);
    expect(prof[12]!.s).toBeCloseTo(6, 9);
    prof.forEach(p => expect(p.z).toBeCloseTo(100 + 0.1 * p.x, 6));
  });

  it('propose la ligne de plus grande pente par le point de reference, du haut vers le bas, coupee a la grille', () => {
    const r = plane(0.1, 0, 100);   // monte vers l'est : descend vers l'ouest
    const l = ligneDePlusGrandePente(r, parcellePts, { x: 4, y: 4 });
    expect(l.a.x).toBeCloseTo(10, 6);  // le haut (est) a gauche du profil
    expect(l.b.x).toBeCloseTo(0, 6);
    expect(l.a.y).toBeCloseTo(4, 6);
  });
});

describe('equidistance et niveaux', () => {
  it('choisit l equidistance d apres le denivele', () => {
    expect([0.5, 2, 6, 15].map(equidistanceAuto)).toEqual([0.1, 0.25, 0.5, 1]);
  });

  it('prefere l equidistance reglee, et enumere les multiples entre le bas et le haut', () => {
    const r = plane(0.1, 0, 100);   // de 100,05 a 100,95
    expect(equidistanceRelief(r, parcellePts)).toBe(0.1);
    r.affichage = { equidistance: 0.25 };
    expect(equidistanceRelief(r)).toBe(0.25);
    expect(niveauxCourbes(r, 0.25)).toEqual([100.25, 100.5, 100.75]);
    expect(estCourbeMaitresse(101, 0.25)).toBe(true);
    expect(estCourbeMaitresse(100.75, 0.25)).toBe(false);
  });
});

describe('emprise, pas et zero du plan', () => {
  it('elargit la parcelle de 10 m et double le pas jusqu a tenir en 40 000 cellules', () => {
    const e = empriseRelief(parcellePts);
    expect(e).toEqual({ xMin: -9, xMax: 18, yMin: -9, yMax: 16 });
    expect(pasPourEmprise(0.5, e)).toBe(0.5);
    expect(dimensionsGrille(e, 0.5)).toEqual({ x0: -8.75, y0: 15.75, nx: 54, ny: 50 });
    const grand = { xMin: 0, xMax: 150, yMin: 0, yMax: 150 };   // 90 000 cellules a 0,5 m
    expect(pasPourEmprise(0.5, grand)).toBe(1);
    expect(pasPourEmprise(1, grand)).toBe(1);
    expect(pasPourEmprise(0.5, { xMin: 0, xMax: 1200, yMin: 0, yMax: 1200 })).toBeNull();
    expect(MAX_CELLULES_RELIEF).toBe(40000);
  });

  it('lit zRef au centroide de la terrasse, sinon de la parcelle, sinon la mediane', () => {
    const r = plane(0.1, 0, 100);
    expect(pointDeReference([parcelle, terrasse])).toEqual({ x: 3, y: 3 });
    expect(zRefPour(r, [parcelle, terrasse])).toBeCloseTo(100.3, 9);
    expect(zRefPour(r, [parcelle])).toBeCloseTo(100.45, 9);
    const vide = plane(0.1, 0, 100); vide.z = vide.z.map((z, k) => (k % 2 ? null : z));
    expect(zRefPour(vide, [])).toBeGreaterThan(100);
  });

  it('retrouve le relief du projet sur la parcelle et complete ses preferences', () => {
    const r = plane(0, 0, 10);
    expect(reliefDe([terrasse, { ...parcelle, relief: r } as ObjetPlan])).toBe(r);
    expect(reliefDe([terrasse])).toBeNull();
    expect(affichageRelief(r)).toEqual({ courbes: true, equidistance: 0, sol3d: true });
    expect(affichageRelief({ ...r, affichage: { sol3d: false } })).toEqual({ courbes: true, equidistance: 0, sol3d: false });
  });

  it('resume la source et la precision', () => {
    const r = plane(0, 0, 10);
    expect(libelleSource(r)).toBe('RGE ALTI, 1 m');
    expect(resumeRelief(r)).toBe('RGE ALTI, 1 m · lu en 2026 · Emq < 30 cm');
    expect(resumeRelief({ ...r, source: 'lidar-hd', pas: 0.5, dateDonnees: '2021-09-24', precision: 'de l’ordre de 10 cm (IGN)' })).toBe('LiDAR HD, 50 cm · acquis en 2021 · de l’ordre de 10 cm (IGN)');
  });
});
