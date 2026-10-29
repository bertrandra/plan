import { describe, it, expect } from 'vitest';
import { cibleDesPoignees, murLePlusVisible, murVersLOeil, partVisibleDuMur } from '../../../../src/facade/modeToit/poignees.js';
import type { CorpsToit } from '../../../../src/model/types.js';

// Le mur que montre un corps choisi dans le mode Toit (silhouette et poignees) : le plus visible, pas seulement le plus tourne vers
// la camera. Sur une maison a deux corps, le mur le plus tourne de l'aile (« Corps 2 ») peut etre cache derriere l'autre corps.

// La maison 10 x 6 m, faitage a 9 m ; l'aile 5 x 4 m contre son bout est, faitage a 5 m.
const maison: CorpsToit = { pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], posFaitage: 3, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0 };
const aile: CorpsToit = { pts: [{ x: 10, y: 1 }, { x: 15, y: 1 }, { x: 15, y: 5 }, { x: 10, y: 5 }], posFaitage: 2, faitage: 5, egouts: [3, 3], pignons: [], ecart: 0 };
const corps = [maison, aile];
/** Les murs de l'aile : 0 sud (y = 1), 1 est (x = 15), 2 nord (y = 5), 3 ouest (x = 10, contre la maison). */
const OUEST = 3, NORD = 2, SUD = 0, EST = 1;

describe('le mur le plus visible d un corps choisi', () => {
  it('le mur le plus tourne vers l oeil, cache par l autre corps, cede la place au mur qu on voit', () => {
    const oeil = { x: -30, y: 25, z: 1.6 };
    expect(murVersLOeil(aile, oeil)).toBe(OUEST);
    expect(partVisibleDuMur(corps, 1, OUEST, oeil)).toBeLessThan(0.1);
    expect(partVisibleDuMur(corps, 1, NORD, oeil)).toBeGreaterThan(0.4);
    expect(murLePlusVisible(corps, 1, oeil)).toBe(NORD);
    // Les poignees, et donc la silhouette (tracee sur leur mur), suivent ce mur.
    expect(cibleDesPoignees(corps, { type: 'corps', rang: 1, i: 0 }, { dessus: false, facade: null, oeil })).toEqual({ type: 'facade', rang: 1, i: 0, mur: NORD });
  });

  it('rien ne cache : le plus tourne vers l oeil, comme avant', () => {
    for (const oeil of [{ x: 40, y: 3 }, { x: 12, y: -30 }, { x: 30, y: 30 }, { x: 13, y: 40, z: 10 }]) {
      expect(murLePlusVisible(corps, 1, oeil)).toBe(murVersLOeil(aile, oeil));
    }
    // Un corps seul : toujours le plus tourne.
    for (const oeil of [{ x: 5, y: 60 }, { x: -20, y: 20 }, { x: 40, y: -5 }, { x: 5, y: -30, z: 5 }]) {
      expect(murLePlusVisible([maison], 0, oeil)).toBe(murVersLOeil(maison, oeil));
    }
  });

  it('un mur vu de chant ne l emporte pas sur un mur de face a moitie visible', () => {
    // De l'est presque dans l'axe : le mur est de l'aile est de face et entier.
    expect(murLePlusVisible(corps, 1, { x: 60, y: 2 })).toBe(EST);
    expect(partVisibleDuMur(corps, 1, SUD, { x: 60, y: 2 })).toBe(0);
  });
});
