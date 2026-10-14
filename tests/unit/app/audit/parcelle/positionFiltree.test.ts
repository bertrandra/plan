import { describe, it, expect } from 'vitest';
import { filtrePosition, surLaParcelle, PRECISION_IGNOREE_M, RECUL_DANS_PARCELLE_M } from '../../../../../src/app/audit/parcelle/positionFiltree.js';
import { pointInPolygon } from '../../../../../src/geometry/basic.js';
import type { ObjetPlan, PtBrut } from '../../../../../src/model/types.js';

// La position de la prise (app/audit/parcelle/positionFiltree.ts) : lissee selon la precision du GPS,
// et ramenee sur la parcelle du projet quand elle tombe dans le jardin d'un voisin (essai d'AE 101).

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const obj = (key: string, plus: Partial<ObjetPlan>): ObjetPlan => ({ key, name: key, type: 'polygon', ...plus } as ObjetPlan);
/** La parcelle de 20 x 30 m, une voisine a l'est ; la rue au sud (y < 0), sans parcelle. */
const objets = [
  obj('parcelle', { fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: 'x', origineLat: 48.9, origineLon: 2.13 } }),
  obj('voisine', { fonction: 'terrain', pts: rect(20, 0, 40, 30), voisinage: true }),
];

describe('le lissage du GPS', () => {
  it('prend la premiere position telle quelle, puis amortit un saut soudain', () => {
    const f = filtrePosition();
    expect(f.ajouter({ x: 10, y: 10 }, 5, 0).p).toEqual({ x: 10, y: 10 });
    // Une seconde plus tard, le GPS saute de 10 m : on ne fait qu'une partie du chemin.
    const p = f.ajouter({ x: 20, y: 10 }, 5, 1000).p;
    expect(p.x).toBeGreaterThan(10);
    expect(p.x).toBeLessThan(18);
  });

  it('suit un marcheur : dix secondes apres, la nouvelle position est presque atteinte', () => {
    const f = filtrePosition();
    f.ajouter({ x: 0, y: 0 }, 5, 0);
    expect(f.ajouter({ x: 12, y: 0 }, 5, 10000).p.x).toBeGreaterThan(11);
  });

  it('ne laisse pas une position tres imprecise remplacer une estimation meilleure', () => {
    const f = filtrePosition();
    f.ajouter({ x: 0, y: 0 }, 4, 0);
    const p = f.ajouter({ x: 60, y: 0 }, PRECISION_IGNOREE_M + 20, 1000).p;
    expect(p).toEqual({ x: 0, y: 0 });
  });

  it('repart de zero apres oublier', () => {
    const f = filtrePosition();
    f.ajouter({ x: 0, y: 0 }, 4, 0);
    f.oublier();
    expect(f.ajouter({ x: 30, y: 5 }, 4, 500).p).toEqual({ x: 30, y: 5 });
  });
});

describe('le recalage sur la parcelle', () => {
  it('laisse une position sur la parcelle, ou dans la rue', () => {
    expect(surLaParcelle(objets, { x: 5, y: 5 }, 8)).toEqual({ x: 5, y: 5 });
    expect(surLaParcelle(objets, { x: 10, y: -4 }, 8)).toEqual({ x: 10, y: -4 });
  });

  it('ramene juste a l interieur une position tombee chez le voisin, a portee de l erreur', () => {
    const p = surLaParcelle(objets, { x: 24, y: 12 }, 8);
    expect(pointInPolygon(p, rect(0, 0, 20, 30))).toBe(true);
    expect(p.x).toBeCloseTo(20 - RECUL_DANS_PARCELLE_M, 6);
    expect(p.y).toBeCloseTo(12, 6);
  });

  it('ne ramene pas une position trop loin pour etre une erreur', () => {
    expect(surLaParcelle(objets, { x: 35, y: 12 }, 6)).toEqual({ x: 35, y: 12 });
  });
});
