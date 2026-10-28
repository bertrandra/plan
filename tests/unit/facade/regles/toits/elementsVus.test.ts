import { describe, it, expect } from 'vitest';
import { reporterElements } from '../../../../../src/facade/regles/toits/elementsVus.js';
import type { CorpsToit, PtBrut } from '../../../../../src/model/types.js';

// Ce que portait un corps du toit, reporte sur les corps d'une forme relue (facade/regles/toits/elementsVus.ts::reporterElements) :
// la ou cela tient encore, et sans toucher a la forme ni aux hauteurs du corps neuf.

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const DEUX_PANS: CorpsToit = {
  pts: rect(0, 0, 10, 8), posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.2,
  cheminees: [{ x: 5, y: 4, largeurM: 0.6, profondeurM: 0.5, sommetM: 9.4, position: 'faitage', source: 'observation' }],
  lucarnes: [{ type: 'jacobine', pan: 0, debutM: 2, finM: 3.2, faitageM: 7.8, profondeurM: 1.2, source: 'observation' }],
};

describe('reporterElements', () => {
  it('un corps relu dans le meme sens recoit la cheminee et la lucarne, a la hauteur de son faitage', () => {
    const neuf: CorpsToit = { pts: rect(0, 0, 10, 8), posFaitage: 4, faitage: 10, egouts: [6.5, 6.5], pignons: [], croupes: [3, 3], ecart: 0.1 };
    const [r] = reporterElements([DEUX_PANS], [neuf]);
    expect(r?.croupes).toEqual([3, 3]);
    expect(r?.faitage).toBe(10);
    expect(r?.cheminees).toEqual([{ ...DEUX_PANS.cheminees![0], sommetM: 10.4 }]);
    expect(r?.lucarnes).toEqual([{ ...DEUX_PANS.lucarnes![0], faitageM: 8.6 }]);
    expect(neuf.cheminees).toBeUndefined();
  });

  it('un faitage qui a tourne laisse la lucarne (elle suivait son pan) ; une cheminee hors du corps neuf reste aussi', () => {
    // Le meme rectangle, repris par son deuxieme sommet : le faitage va de (10, 0) a (10, 8).
    const tourne: CorpsToit = { pts: [{ x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }, { x: 0, y: 0 }], posFaitage: 5, faitage: 10, egouts: [6, 6], pignons: [], ecart: 0.1 };
    const [r] = reporterElements([DEUX_PANS], [tourne]);
    expect(r?.lucarnes).toBeUndefined();
    expect(r?.cheminees).toHaveLength(1);
    const petit: CorpsToit = { pts: rect(0, 0, 4, 8), posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };
    const loin = { ...DEUX_PANS, pts: rect(0, 0, 4, 8), cheminees: [{ ...DEUX_PANS.cheminees![0]!, x: 9 }] };
    expect(reporterElements([loin], [petit])[0]?.cheminees).toBeUndefined();
  });

  it('un appentis ouvert le reste s il est relu en appentis ; un corps garde ce qu il porte deja', () => {
    const galerie: CorpsToit = { pts: rect(0, 8, 10, 10), posFaitage: 0, faitage: 3.5, egouts: [3.5, 2.5], pignons: [], ecart: 0.1, ouvert: true, retraitM: 0.3 };
    const relu: CorpsToit = { pts: rect(0, 8, 10, 10), posFaitage: 0, faitage: 3.6, egouts: [3.6, 2.6], pignons: [], ecart: 0.05 };
    expect(reporterElements([galerie], [relu])[0]).toMatchObject({ ouvert: true, retraitM: 0.3, faitage: 3.6 });
    const plat: CorpsToit = { ...relu, faitage: 2.6, egouts: [2.6, 2.6] };
    expect(reporterElements([galerie], [plat])[0]?.ouvert).toBeUndefined();
    // Le corps d'avant, reste tel quel dans la liste neuve : rien ne se double.
    expect(reporterElements([DEUX_PANS], [DEUX_PANS])[0]).toBe(DEUX_PANS);
  });
});
