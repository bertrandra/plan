import { describe, it, expect } from 'vitest';
import { avecBoutsDesMurs, avecPignons, boutAuMur, pignonsAuxPlaces, pignonsManquants } from '../../../../../src/facade/regles/toits/pignons.js';
import type { PignonsFait } from '../../../../../src/regles/toits/faits.js';
import type { CorpsToit, PtBrut, ToitMesure } from '../../../../../src/model/types.js';

// Les pignons et les bouts qu'une observation pose sur un corps (lot F4, MD/spec-facade-calage-audit.md §5 ter) : n'importe quel corps,
// designe par son mur ou par le cote en facade qui regarde vers l'azimut du fait ; plus de corps principal suppose. Les hauteurs du
// corps ne bougent pas (decision 12).

const p = (x: number, y: number): PtBrut => ({ x, y });
const corps = (pts: PtBrut[], posFaitage: number, faitage: number, egouts: [number, number], extra: Partial<CorpsToit> = {}): CorpsToit =>
  ({ pts, posFaitage, faitage, egouts, pignons: [], ecart: 0, ...extra }) as CorpsToit;
// Un long corps de 12 m sur 4, faitage est-ouest (le long de pts[0] -> pts[1]) : ses longs pans regardent au nord et au sud.
const long = corps([p(0, 4), p(12, 4), p(12, 0), p(0, 0)], 2, 7, [5, 5]);
// Un corps carre de 8 m, plus grand (64 m2 contre 48), faitage nord-sud, derriere lui au nord.
const carre = corps([p(2, 4), p(2, 12), p(10, 12), p(10, 4)], 4, 9, [6, 6]);
const contour = [p(0, 0), p(12, 0), p(12, 4), p(10, 4), p(10, 12), p(2, 12), p(2, 4), p(0, 4)];
const m = {} as ToitMesure;

describe('pignonsAuxPlaces : exactement les pignons que montre un long pan', () => {
  it('ajoute, retire, deplace ; chaque pignon monte au faitage, le pan ne bouge pas', () => {
    const c = pignonsAuxPlaces(long, 1, [{ debut: 0, fin: 3 }, { debut: 8, fin: 12 }]);
    expect(c.pignons).toEqual([{ pan: 1, debut: 0, fin: 3, faitage: 7, profondeur: 2 }, { pan: 1, debut: 8, fin: 12, faitage: 7, profondeur: 2 }]);
    expect({ pts: c.pts, posFaitage: c.posFaitage, faitage: c.faitage, egouts: c.egouts }).toEqual({ pts: long.pts, posFaitage: 2, faitage: 7, egouts: [5, 5] });
    // Un pignon de moins, l'autre deplace.
    expect(pignonsAuxPlaces(c, 1, [{ debut: 7, fin: 12 }]).pignons).toEqual([{ pan: 1, debut: 7, fin: 12, faitage: 7, profondeur: 2 }]);
    // Plus aucun : le pan nu.
    expect(pignonsAuxPlaces(c, 1, []).pignons).toEqual([]);
  });

  it('garde un pignon deja la a 25 cm pres, rend le corps tel quel quand rien ne change, ignore une place trop etroite', () => {
    const lu = { ...long, pignons: [{ pan: 1 as const, debut: 0, fin: 3, faitage: 6.6, profondeur: 1.8 }] };
    expect(pignonsAuxPlaces(lu, 1, [{ debut: 0.2, fin: 3.1 }])).toBe(lu);
    expect(pignonsAuxPlaces(lu, 1, [{ debut: 0.2, fin: 3.1 }, { debut: 6, fin: 6.5 }])).toBe(lu);
    // L'autre pan n'est pas touche.
    expect(pignonsAuxPlaces(lu, 0, [{ debut: 4, fin: 7 }]).pignons).toHaveLength(2);
  });

  it('un appentis ou un plat n a pas de faitage dont partirait un pignon', () => {
    const ap = corps(long.pts, 0, 4, [4, 2.6]);
    expect(pignonsAuxPlaces(ap, 1, [{ debut: 0, fin: 3 }])).toBe(ap);
  });
});

describe('boutAuMur : ce que montre le mur de bout', () => {
  it('une croupe a la place du pignon, a la pente des pans, du bon cote ; un pignon la retire ; les hauteurs restent', () => {
    const c = boutAuMur(long, 3, 'croupe');
    expect(c.croupes).toEqual([2, 0]);
    expect([c.faitage, c.egouts]).toEqual([7, [5, 5]]);
    expect(boutAuMur(long, 1, 'croupe').croupes).toEqual([0, 2]);
    expect(boutAuMur(c, 3, 'pignon').croupes).toBeUndefined();
    expect(boutAuMur(long, 0, 'croupe')).toBe(long);
    expect(boutAuMur(long, 3, 'pignon')).toBe(long);
  });
});

describe('avecPignons : n importe quel corps, par son mur', () => {
  it('le mur designe l emporte : les pignons se posent sur le corps qui le porte, meme s il n est pas le plus grand', () => {
    const pf: PignonsFait = { facade: { azimutDeg: 180 }, mur: { gauche: p(0, 0), droite: p(12, 0) }, position: 'places', places: [{ de: 1, a: 4 }], haut: 'faitage' };
    const [a, b] = avecPignons([pf], [long, carre], m, contour)!;
    expect(b).toBe(carre);
    // Le mur sud va de x 0 a 12, le faitage du corps de x 0 a 12 : la place de 1 a 4 m le long du mur.
    expect(a!.pignons).toEqual([{ pan: 1, debut: 1, fin: 4, faitage: 7, profondeur: 2 }]);
    expect(pignonsManquants(pf, [a!, carre], contour)).toBe(0);
    expect(pignonsManquants(pf, [long, carre], contour)).toBe(1);
  });

  it('par l azimut : le cote en facade le plus long qui regarde par la, quel que soit le corps (plus de corps principal suppose)', () => {
    const pf: PignonsFait = { facade: { azimutDeg: 180 }, position: 'bouts', haut: 'faitage', largeurM: 3 };
    const [a, b] = avecPignons([pf], [long, carre], m, contour)!;
    expect(b).toBe(carre);
    expect(a!.pignons.map((x) => [x.pan, x.debut, x.fin])).toEqual([[1, 0, 3], [1, 9, 12]]);
  });

  it('avecBoutsDesMurs : le bout que montre un mur de bout, sur son corps', () => {
    // Le mur nord du corps carre (son bout s = L), vu de dehors : de l'est a l'ouest.
    const [a, b] = avecBoutsDesMurs([{ mur: { gauche: p(10, 12), droite: p(2, 12) }, bout: 'croupe' }], [long, carre])!;
    expect(a).toBe(long);
    expect(b!.croupes).toEqual([0, 4]);
  });
});
