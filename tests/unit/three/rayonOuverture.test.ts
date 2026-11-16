import { describe, it, expect } from 'vitest';
import { rayonDOuverture } from '../../../src/three/scene.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// La Vue 3D s'ouvre sur la terrasse (lot 2 de la simplification, 16 novembre 2026) : le recul de la camera se regle sur la terrasse et
// la maison qu'elle touche, pas sur la parcelle et ses mitoyennes.

const carre = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const parcelle = { key: 'parcelle', name: 'P', fonction: 'terrain', type: 'polygon', pts: carre(0, 0, 60, 60) } as ObjetPlan;
const terrasse = { key: 't', name: 'T', fonction: 'terrasse', type: 'polygon', pts: carre(20, 10, 24, 13) } as ObjetPlan;
const cen = { x: 22, y: 11.5 };

describe('le rayon d ouverture de la Vue 3D', () => {
  it('prend la terrasse et la maison qu elle touche', () => {
    const maison = { key: 'm', name: 'Maison', fonction: 'batiment', type: 'polygon', pts: carre(16, 13.1, 28, 23) } as ObjetPlan;
    const r = rayonDOuverture(terrasse, [parcelle, maison, terrasse], cen)!;
    expect(r).toBeCloseTo(Math.hypot(6, 11.5), 6);
  });

  it('laisse une maison lointaine hors du cadre, et garde au moins 4 m', () => {
    const loin = { key: 'm', name: 'Maison', fonction: 'batiment', type: 'polygon', pts: carre(40, 40, 52, 50) } as ObjetPlan;
    expect(rayonDOuverture(terrasse, [parcelle, loin, terrasse], cen)).toBe(4);
  });

  it('rend null sans terrasse : le plan entier', () => {
    expect(rayonDOuverture(null, [parcelle], cen)).toBeNull();
  });
});

describe('le cadrage du plan a l ouverture', () => {
  // La demonstration sans compte, et celle que le premier pas vient de creer (demande du proprietaire, 16 novembre 2026) ;
  // un projet rouvert garde le cadrage du terrain (io/api.ts, `ouvrirSurLaTerrasse`, teste dans tests/unit/io/api.test.ts).
  it('se pose sur la terrasse pour la demonstration seulement (essai sans compte, premier pas)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const boot = readFileSync(resolve(__dirname, '../../../src/app/boot.ts'), 'utf8');
    expect(boot).toContain('if (options.essai || seed.ouvrirSurLaTerrasse) cadrage.cadrerTerrasse();');
    expect(boot.match(/cadrerTerrasse\(\)/g)).toHaveLength(1);
  });
});
