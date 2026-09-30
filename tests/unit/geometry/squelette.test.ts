import { describe, it, expect } from 'vitest';
import { squeletteDroit, demiLargeurApprochee, type Squelette } from '../../../src/geometry/squelette.js';
import { signedArea } from '../../../src/geometry/basic.js';
import type { PtBrut } from '../../../src/model/types.js';

const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = (l: number, h: number) => [p(0, 0), p(l, 0), p(l, h), p(0, h)];

/** Le point le plus haut, et la liste de ses pans : la forme se lit la. */
const sommet = (s: Squelette) => Math.max(...s.pans.flatMap((pan) => pan.contour.map((q) => q.t)));
const aire = (s: Squelette) => s.pans.reduce((a, pan) => a + signedArea(pan.contour), 0);
/** Hauteur d'un point du contour d'un pan, qui est aussi sa distance a son cote. */
const tEn = (s: Squelette, x: number, y: number) => s.pans.flatMap((pan) => pan.contour).find((q) => Math.hypot(q.x - x, q.y - y) < 1e-6)?.t;

describe('le squelette droit', () => {
  it('rectangle : le quatre pans, faitage a mi-largeur, croupes a 45°', () => {
    const s = squeletteDroit(rect(10, 6))!;
    expect(s).not.toBeNull();
    expect(s.dmax).toBeCloseTo(3, 9);
    expect(s.pans).toHaveLength(4);
    expect(aire(s)).toBeCloseTo(60, 6);
    expect(tEn(s, 3, 3)).toBeCloseTo(3, 9);
    expect(tEn(s, 7, 3)).toBeCloseTo(3, 9);
    // Long pan : un trapeze ; croupe : un triangle.
    expect(s.pans.find((pan) => pan.cote === 0)!.contour).toHaveLength(4);
    expect(s.pans.find((pan) => pan.cote === 1)!.contour).toHaveLength(3);
  });

  it('carre : une pyramide', () => {
    const s = squeletteDroit(rect(8, 8))!;
    expect(s.dmax).toBeCloseTo(4, 9);
    expect(tEn(s, 4, 4)).toBeCloseTo(4, 9);
    s.pans.forEach((pan) => expect(pan.contour).toHaveLength(3));
  });

  it('le sens de parcours ne change rien, et chaque pan garde l indice de son cote', () => {
    const direct = squeletteDroit(rect(10, 6))!;
    const inverse = squeletteDroit([...rect(10, 6)].reverse())!;
    expect(inverse.dmax).toBeCloseTo(direct.dmax, 9);
    expect(aire(inverse)).toBeCloseTo(60, 6);
    // Dans l'entree inversee [ (0,6) (10,6) (10,0) (0,0) ], le cote 0 est le long pan du haut.
    const haut = inverse.pans.find((pan) => pan.cote === 0)!;
    expect(haut.contour.some((q) => q.y === 6 && q.x === 0)).toBe(true);
    expect(haut.contour.some((q) => q.y === 6 && q.x === 10)).toBe(true);
  });

  it('L a ailes egales : deux faitages, une noue, un aretier', () => {
    const L = [p(0, 0), p(10, 0), p(10, 4), p(4, 4), p(4, 10), p(0, 10)];
    const s = squeletteDroit(L)!;
    expect(s).not.toBeNull();
    expect(s.dmax).toBeCloseTo(2, 9);
    expect(s.pans).toHaveLength(6);
    expect(aire(s)).toBeCloseTo(64, 6);
    // Bouts de faitage, et la rencontre des deux faitages.
    expect(tEn(s, 8, 2)).toBeCloseTo(2, 9);
    expect(tEn(s, 2, 8)).toBeCloseTo(2, 9);
    expect(tEn(s, 2, 2)).toBeCloseTo(2, 9);
  });

  it('L a ailes inegales : l aile etroite a un faitage plus bas', () => {
    const L = [p(0, 0), p(12, 0), p(12, 6), p(3, 6), p(3, 12), p(0, 12)];
    const s = squeletteDroit(L)!;
    expect(s).not.toBeNull();
    expect(s.dmax).toBeCloseTo(3, 9);
    expect(aire(s)).toBeCloseTo(12 * 6 + 3 * 6, 6);
    expect(tEn(s, 1.5, 10.5)).toBeCloseTo(1.5, 9);
    expect(sommet(s)).toBeCloseTo(3, 9);
  });

  it('T et U', () => {
    const T = [p(0, 0), p(12, 0), p(12, 4), p(8, 4), p(8, 12), p(4, 12), p(4, 4), p(0, 4)];
    const sT = squeletteDroit(T)!;
    expect(sT).not.toBeNull();
    expect(aire(sT)).toBeCloseTo(48 + 32, 6);
    expect(sT.dmax).toBeCloseTo(2, 9);
    const U = [p(0, 0), p(12, 0), p(12, 10), p(8, 10), p(8, 4), p(4, 4), p(4, 10), p(0, 10)];
    const sU = squeletteDroit(U)!;
    expect(sU).not.toBeNull();
    expect(aire(sU)).toBeCloseTo(120 - 24, 6);
    expect(sU.dmax).toBeCloseTo(2, 9);
  });

  it('contours irreguliers : pentagone, trapeze, maison en biais, sommet plat', () => {
    const cas: PtBrut[][] = [
      [p(0, 0), p(8, 0), p(10, 5), p(4, 9), p(-1, 5)],
      [p(0, 0), p(12, 0), p(9, 5), p(2, 5)],
      rect(11, 7).map((q) => ({ x: q.x * Math.cos(0.4) - q.y * Math.sin(0.4) + 100, y: q.x * Math.sin(0.4) + q.y * Math.cos(0.4) - 50 })),
      [p(0, 0), p(5, 0), p(10, 0), p(10, 6), p(0, 6)],
      [p(0, 0), p(14, 0), p(14, 5), p(9, 5), p(9, 9), p(3, 9), p(3, 5), p(0, 5)],
      [p(0, 0), p(9, 1), p(10, 7), p(6, 6), p(5, 11), p(-1, 9)]
    ];
    cas.forEach((c) => {
      const s = squeletteDroit(c);
      expect(s, JSON.stringify(c)).not.toBeNull();
      expect(aire(s!)).toBeCloseTo(Math.abs(signedArea(c)), 5);
    });
  });

  it('tient sur des centaines de contours de maisons, tournes et loin de l origine', () => {
    // Des empreintes orthogonales en escalier (L, T, U, creneaux), dans un repere quelconque : les
    // calculs n'y sont plus exacts. Un generateur deterministe, pour qu'un echec se rejoue.
    let graine = 7;
    const hasard = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 300; i++) {
      const bas: PtBrut[] = [],
        haut: PtBrut[] = [];
      let x = 0;
      for (let k = 1 + Math.floor(hasard() * 5); k > 0; k--) {
        const l = 2 + Math.round(hasard() * 6),
          yb = -Math.round(hasard() * 4),
          yh = 4 + Math.round(hasard() * 5);
        bas.push(p(x, yb), p(x + l, yb));
        haut.push(p(x, yh), p(x + l, yh));
        x += l;
      }
      const th = hasard() * 6;
      const c = [...bas, ...haut.reverse()].map((q) => p(q.x * Math.cos(th) - q.y * Math.sin(th) + 651234.5, q.x * Math.sin(th) + q.y * Math.cos(th) - 12.3));
      const s = squeletteDroit(c);
      expect(s, JSON.stringify(c)).not.toBeNull();
      expect(aire(s!)).toBeCloseTo(Math.abs(signedArea(c)), 4);
    }
  });

  it('rend null sur un contour degenere', () => {
    expect(squeletteDroit([p(0, 0), p(1, 0)])).toBeNull();
    expect(squeletteDroit([p(0, 0), p(1, 0), p(2, 0)])).toBeNull();
  });

  it('demi-largeur approchee : la moitie de la plus petite etendue', () => {
    expect(demiLargeurApprochee(rect(10, 6))).toBeCloseTo(3, 9);
  });
});
