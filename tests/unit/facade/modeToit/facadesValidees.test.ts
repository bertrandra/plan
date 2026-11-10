import { describe, it, expect } from 'vitest';
import { facadesDuBatiment, facadeValideeDuMur, texteDeLaPhoto } from '../../../../src/facade/modeToit/facadesDesCorps.js';
import type { CorpsToit, ReleveFacade } from '../../../../src/model/types.js';

// Le Mode Toit lit la Facade validee (lot F5) : le mur d'un corps qui longe un cote du contour photographie et valide, ou que la
// forme de la facade designe parmi ses corps, dit ce que la photo en a lu.

const contour = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }];
const corps = (pts: { x: number; y: number }[]): CorpsToit => ({ pts, posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0 });
const valide = (cote: number, plus: Partial<ReleveFacade> = {}): ReleveFacade => ({
  cote, largeur: 12, hauteur: 6, texture: null, ouvertures: [], distance: null, sourceDistance: null, releveLe: '',
  dimensions: { largeurM: 12, egoutM: 6, source: 'lidar' },
  forme: { gabarit: [{ u: 0, v: 1 }, { u: 1, v: 1 }], silhouetteLue: 'triangle', pointes: [{ u: 0.3, v: 1.5, source: 'deterministe' }, { u: 0.7, v: 1.5, source: 'ia' }], source: 'ia' },
  ...plus,
});

describe('la Facade validee dans le Mode Toit', () => {
  it('le mur d un corps qui longe le cote photographie la porte ; les autres murs, non ; un releve non valide, jamais', () => {
    // Deux corps : le principal (0 a 8 m) et une aile (8 a 12 m) un peu en retrait au sud (y de 0,3), tous deux le long du cote 0.
    const murs = facadesDuBatiment([corps([{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }]), corps([{ x: 8, y: 0.3 }, { x: 12, y: 0.3 }, { x: 12, y: 8 }, { x: 8, y: 8 }])], contour);
    const releves = [valide(0)];
    const portent = murs.filter((f) => facadeValideeDuMur(f, releves, contour)).map((f) => f.rang + ':' + f.mur);
    expect(portent).toEqual(['0:0', '1:0']);
    expect(murs.filter((f) => facadeValideeDuMur(f, [{ ...valide(0), dimensions: undefined } as unknown as ReleveFacade], contour))).toEqual([]);
  });

  it('un mur designe par la forme parmi ses corps la porte aussi, et sans corps le cote du contour', () => {
    const recule = [corps([{ x: 2, y: 3 }, { x: 10, y: 3 }, { x: 10, y: 8 }, { x: 2, y: 8 }])];
    const [m] = facadesDuBatiment(recule, contour);
    const designe = valide(0, { forme: { ...valide(0).forme!, corps: [{ mur: { gauche: { x: 2, y: 3 }, droite: { x: 10, y: 3 } }, u0: 0.1, u1: 0.9 }] } });
    expect(facadeValideeDuMur(m!, [valide(0)], contour)).toBeNull();
    expect(facadeValideeDuMur(m!, [designe], contour)).toBe(designe);
    const sansCorps = facadesDuBatiment(null, contour);
    expect(sansCorps.filter((f) => facadeValideeDuMur(f, [valide(2)], contour)).map((f) => f.mur)).toEqual([2]);
    expect(texteDeLaPhoto(valide(0))).toBe('vue sur la photo (triangle, 2 pointes)');
  });
});
