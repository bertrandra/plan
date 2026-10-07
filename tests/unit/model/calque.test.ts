import { describe, it, expect } from 'vitest';
import { empriseDuCalque, intersectionEmprises, contientEmprise, MARGE_CALQUE_M } from '../../../src/model/calque.js';
import type { ObjetPlan, PtBrut } from '../../../src/model/types.js';

// Le calque : les parcelles affichees plus 10 m. Le sol 3D, l'orthophoto (2D et 3D) et le cadrage
// d'ouverture du plan partagent cette emprise.

const carre = (x0: number, y0: number, l: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x0 + l, y: y0 }, { x: x0 + l, y: y0 + l }, { x: x0, y: y0 + l }];
const objets = [
  { key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: carre(0, 0, 20) },
  { key: 'v', type: 'polygon', fonction: 'terrain', voisinage: true, pts: carre(100, 50, 10) },
  { key: 'm', type: 'polygon', fonction: 'batiment', pts: carre(-300, -300, 10) }
] as unknown as ObjetPlan[];

describe('le calque du plan', () => {
  it('couvre les parcelles, et elles seules, plus 10 m de chaque cote', () => {
    expect(MARGE_CALQUE_M).toBe(10);
    expect(empriseDuCalque(objets)).toEqual({ xMin: -10, xMax: 120, yMin: -10, yMax: 70 });
  });

  it('suit les parcelles masquees, et vaut null sans parcelle', () => {
    expect(empriseDuCalque(objets, o => !!o.voisinage)).toEqual({ xMin: -10, xMax: 30, yMin: -10, yMax: 30 });
    expect(empriseDuCalque([objets[2]!])).toBeNull();
  });

  it('coupe et compare deux emprises', () => {
    const a = { xMin: 0, xMax: 10, yMin: 0, yMax: 10 };
    expect(intersectionEmprises(a, { xMin: 5, xMax: 20, yMin: -5, yMax: 5 })).toEqual({ xMin: 5, xMax: 10, yMin: 0, yMax: 5 });
    expect(intersectionEmprises(a, { xMin: 11, xMax: 20, yMin: 0, yMax: 5 })).toBeNull();
    expect(contientEmprise(a, { xMin: 1, xMax: 9, yMin: 1, yMax: 9 })).toBe(true);
    expect(contientEmprise(a, { xMin: 1, xMax: 11, yMin: 1, yMax: 9 })).toBe(false);
  });
});
