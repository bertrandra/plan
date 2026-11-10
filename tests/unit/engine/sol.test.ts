import { describe, it, expect } from 'vitest';
import { solDuRelief, solDuProjet, solSousEmprise, zReferenceOuvrage, hauteurDepuisTerrainNaturel } from '../../../src/engine/sol.js';
import { appuisEnHauteur, dessusTerrasseM, hauteurAppuiMm, hauteurFinieMm } from '../../../src/engine/hauteurs.js';
import { ensureConstruction } from '../../../src/engine/construction.js';
import type { ObjetPlan, Relief } from '../../../src/model/types.js';

// Le sol en pente sous un ouvrage (MD/spec-relief.md §6) : la reference au point le plus haut,
// chaque appui plus long d'autant que le sol descend, et rien ne bouge sans relief.

/** Une grille plane z = a·x + b·y + c (NGF), zRef = c : le zero du plan est le sol en (0, 0). */
function plane(a: number, b: number, c: number, nx = 40, ny = 40, pas = 0.5): Relief {
  const x0 = -9.75, y0 = 9.75;
  const z: (number | null)[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z.push(Math.round((a * (x0 + i * pas) + b * (y0 - j * pas) + c) * 100) / 100);
  return { source: 'lidar-hd', couche: 't', dateLecture: '2026-10-06', origine: 'LiDAR HD', precision: '10 cm', systemeAltimetrique: 'NGF-IGN69', pas, x0, y0, nx, ny, z, zRef: c };
}
const carre = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
const terrasse = (typePose: 'plots' | 'vis-fondation', extra: Record<string, unknown> = {}): ObjetPlan =>
  ({ key: 't', type: 'polygon', name: 'T', fonction: 'terrasse', pts: carre, construction: { typePose, hauteurPlot: 10, depassementVis: 2, ...extra } } as unknown as ObjetPlan);

describe('le sol sous une emprise', () => {
  it('trouve le haut et le bas du sol sous un contour, au-dessus du zero du plan', () => {
    const sol = solDuRelief(plane(-0.1, 0, 100));   // descend vers l'est de 10 %
    const s = solSousEmprise(sol, carre);
    expect(s).not.toBeNull();
    expect(s!.zHaut).toBeCloseTo(0, 2);
    expect(s!.zBas).toBeCloseTo(-0.4, 2);
    expect(zReferenceOuvrage(sol, carre)).toBeCloseTo(0, 2);
    expect(hauteurDepuisTerrainNaturel(sol, carre, 2.5)).toBeCloseTo(2.9, 2);
  });

  it('rend null hors de la grille, et 0 ou la hauteur nue sans sol', () => {
    const sol = solDuRelief(plane(0, 0, 50));
    expect(solSousEmprise(sol, [{ x: 100, y: 100 }, { x: 104, y: 100 }, { x: 104, y: 104 }])).toBeNull();
    expect(zReferenceOuvrage(null, carre)).toBe(0);
    expect(hauteurDepuisTerrainNaturel(null, carre, 2.5)).toBe(2.5);
    expect(solDuProjet([terrasse('plots')])).toBeNull();
    const parcelle = { key: 'parcelle', type: 'polygon', name: 'P', fonction: 'terrain', pts: carre, relief: plane(0, 0, 50) } as ObjetPlan;
    expect(solDuProjet([parcelle])?.z({ x: 1, y: 1 })).toBe(0);
  });
});

describe('les appuis sur un sol en pente', () => {
  const appuis = [{ x: 0.2, y: 0.2, role: 'rive' }, { x: 2, y: 2, role: 'courant' }, { x: 3.8, y: 3.8, role: 'rive' }];

  it('garde la hauteur reglee au point haut et allonge les plots d aval', () => {
    const sol = solDuRelief(plane(-0.1, 0, 100));
    const t = terrasse('plots');
    const h = appuisEnHauteur(t, appuis, sol)!;
    expect(hauteurAppuiMm(ensureConstruction(t))).toBe(100);
    expect(h.appuis.map(a => a.hauteurMm)).toEqual([120, 300, 480]);
    expect(h.minMm).toBe(120);
    expect(h.maxMm).toBe(480);
    expect(h.zHaut).toBeCloseTo(0, 2);
  });

  it('fait de meme pour la tete d une vis, et rend null sans sol', () => {
    // Descend vers le nord de 4 % : des cotes exactes au centimetre sur chaque cellule.
    const sol = solDuRelief(plane(0, -0.04, 100));
    const t = terrasse('vis-fondation');
    const h = appuisEnHauteur(t, appuis, sol)!;
    expect(h.appuis.map(a => a.hauteurMm)).toEqual([28, 100, 172]);
    expect(appuisEnHauteur(t, appuis, null)).toBeNull();
  });

  it('pose le dessus de la terrasse sur le point haut du sol', () => {
    const sol = solDuRelief(plane(-0.1, 0, 100));
    const t = terrasse('plots');
    expect(dessusTerrasseM(t, null)).toBeCloseTo(hauteurFinieMm(t) / 1000, 9);
    expect(dessusTerrasseM(t, sol)).toBeCloseTo(hauteurFinieMm(t) / 1000, 2);
    // Une terrasse plus a l'ouest est plus haute dans le repere du plan : le sol y est plus haut.
    const ouest = { ...t, pts: carre.map(p => ({ x: p.x - 6, y: p.y })) } as ObjetPlan;
    expect(dessusTerrasseM(ouest, sol)).toBeCloseTo(0.6 + hauteurFinieMm(t) / 1000, 2);
  });
});
