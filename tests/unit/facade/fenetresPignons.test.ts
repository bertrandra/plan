import { describe, it, expect } from 'vitest';
import { fenetresDesPignons, hauteurDuMur, HAUTEUR_PIGNON_FENETRE_M } from '../../../src/facade/ouvertures.js';
import { facadesDuContour } from '../../../src/facade/geometrie.js';
import type { CorpsToit, PtBrut } from '../../../src/model/types.js';

// Les fenetres hautes d'un corps (MD/spec-toit-ign.md §13.3) : une par pignon qui part du faitage,
// une dans chaque pignon de bout, dans le triangle, sur les murs du corps.

const p = (x: number, y: number): PtBrut => ({ x, y });
const corps = (plus: Partial<CorpsToit> = {}): CorpsToit => ({ pts: [p(0, 0), p(12, 0), p(12, 8), p(0, 8)], posFaitage: 4, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0.1, ...plus });

describe('fenetresDesPignons', () => {
  it('une fenetre dans chaque pignon de bout, au-dessus de l egout, qui tient dans le triangle', () => {
    const f = fenetresDesPignons(corps());
    expect(f.map((x) => x.cote).sort()).toEqual([1, 3]);
    f.forEach((x) => {
      expect(x.y).toBeCloseTo(5.25, 9);
      // Au linteau, le triangle (demi-base 4 m, 3 m de haut) est plus large que la fenetre.
      const demiTriangle = 4 * (1 - (x.y + x.h - 5) / 3);
      expect(x.l / 2).toBeLessThan(demiTriangle);
      // Centree sous le faitage (y = 4 dans le plan), sur un mur de 8 m.
      expect(x.x + x.l / 2).toBeCloseTo(4, 6);
    });
  });

  it('pas de fenetre de pignon sous une croupe', () => {
    expect(fenetresDesPignons(corps({ croupes: [4, 4] }))).toEqual([]);
    expect(fenetresDesPignons(corps({ croupes: [0, 4] })).map((x) => x.cote)).toEqual([3]);
  });

  it('une fenetre par pignon qui part du faitage, sur le mur de son pan ; rien sur un pignon trop bas', () => {
    const f = fenetresDesPignons(corps({ faitage: 6, pignons: [{ pan: 0, debut: 3, fin: 6, faitage: 7.6, profondeur: 4 }] }));
    // Le corps a 1 m de pignon de bout : trop bas ; le pignon, 2,6 m : une fenetre, mur 0 (y = 0).
    expect(f).toHaveLength(1);
    expect(f[0]!.cote).toBe(0);
    expect(f[0]!.x + f[0]!.l / 2).toBeCloseTo(4.5, 6);
    expect(HAUTEUR_PIGNON_FENETRE_M).toBe(1.8);
    // Un appentis n'a pas de pignon de bout fenetre.
    expect(fenetresDesPignons(corps({ posFaitage: 0, egouts: [8, 4] }))).toEqual([]);
  });
});

describe('hauteurDuMur d un corps', () => {
  it('prend la hauteur du mur le plus proche, decroche du contour compris', () => {
    // Le contour a un decroche de 50 cm au nord : son mur reste le mur nord du corps.
    const contour = [p(0, 0), p(12, 0), p(12, 8.5), p(0, 8.5)];
    const nord = facadesDuContour(contour, 5).find((f) => f.cote === 2)!;
    expect(hauteurDuMur(nord, [{ pts: corps().pts, hauteur: 5, hauteursMurs: [5, 5, 6.5, 5] }])).toBe(6.5);
  });
});
