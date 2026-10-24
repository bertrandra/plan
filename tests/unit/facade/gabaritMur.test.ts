import { describe, it, expect } from 'vitest';
import { GABARIT_RECTANGLE, gabaritDesCorps, gabaritDuHaut, gabaritSurLaPhoto, gabaritSurLaVue, hautDeLaFacade, hauteurEn, lireGabarit, relief } from '../../../src/facade/gabaritMur.js';
import { facadesDuContour } from '../../../src/facade/geometrie.js';
import type { CorpsToit, PtBrut } from '../../../src/model/types.js';

// Le gabarit du mur : la silhouette que donnent le plan et le LiDAR, une forme fixe posee sur l'image.

const p = (x: number, y: number): PtBrut => ({ x, y });
// Un deux-pans de 10 m sur 6 : faitage le long de x, au milieu de la largeur, a 8 m ; egouts a 5 m.
const corps: CorpsToit = { pts: [p(0, 0), p(10, 0), p(10, 6), p(0, 6)], posFaitage: 3, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0 };
const murs = facadesDuContour(corps.pts, 5);
const bout = murs.find((f) => Math.abs(f.gauche.x - f.droite.x) < 1e-9 && f.gauche.x === 0)!;
const longPan = murs.find((f) => Math.abs(f.gauche.y - f.droite.y) < 1e-9 && f.gauche.y === 0)!;

describe('le gabarit tire des corps du LiDAR', () => {
  it('un pignon : un triangle centre qui monte de 3 m sur 5 a l egout', () => {
    const g = gabaritDesCorps(bout, [corps], 5);
    expect(relief(g)).toBeCloseTo(0.6, 1);
    expect(hauteurEn(g, 0.5)).toBeCloseTo(1.6, 1);
    expect(g[0]).toEqual({ u: 0, v: 1 });
    expect(g[g.length - 1]?.v).toBeCloseTo(1, 6);
  });
  it('compte dans son relief un corps plus bas, qui descend sous l egout', () => {
    expect(relief([{ u: 0, v: 1 }, { u: 0.5, v: 1 }, { u: 0.5, v: 0.7 }, { u: 1, v: 0.7 }])).toBeCloseTo(0.3, 6);
  });
  it('un long pan, ou rien de lu : un rectangle', () => {
    expect(gabaritDesCorps(longPan, [corps], 5)).toBe(GABARIT_RECTANGLE);
    expect(gabaritDesCorps(bout, [], 5)).toBe(GABARIT_RECTANGLE);
  });
  it('se lit de gauche a droite vu de dehors : un appentis qui monte vers l est monte a droite de la facade sud', () => {
    // Un appentis de 6 x 4 : le faitage (5 m) sur le cote est, l'egout (3 m) a l'ouest.
    const appentis: CorpsToit = { pts: [p(6, 0), p(6, 4), p(0, 4), p(0, 0)], posFaitage: 0, faitage: 5, egouts: [5, 3], pignons: [], ecart: 0 };
    const sud = facadesDuContour(appentis.pts, 3).find((f) => f.orientation === 'Sud')!;
    const g = gabaritDesCorps(sud, [appentis], 3);
    expect(g[0]?.v).toBeCloseTo(1, 1);
    expect(g[g.length - 1]?.v).toBeCloseTo(5 / 3, 1);
  });
  it('prend toute la facade : un corps plus haut en retrait se voit au-dessus d un plus bas devant', () => {
    // Le deux-pans (egout 5 m) et, devant sa moitie gauche, une annexe plate a 3 m, 2 m en avant : la facade sud les longe tous deux.
    const annexe: CorpsToit = { pts: [p(0, -2), p(5, -2), p(5, 0), p(0, 0)], posFaitage: 0, faitage: 3, egouts: [3, 3], pignons: [], ecart: 0 };
    const sud = facadesDuContour([p(0, -2), p(5, -2), p(5, 0), p(10, 0), p(10, 6), p(0, 6)], 5).find((f) => f.orientation === 'Sud' && f.largeur > 4.9 && f.gauche.y === -2)!;
    const haut = hautDeLaFacade(sud, [corps, annexe]);
    // Le long pan a 5 m se voit au-dessus de l'annexe a 3 m.
    expect(Math.min(...haut.map((q) => q.y ?? 0))).toBeCloseTo(5, 1);
    // Sans le grand corps, l'annexe seule.
    expect(Math.max(...hautDeLaFacade(sud, [annexe]).map((q) => q.y ?? 0))).toBeCloseTo(3, 1);
  });
  it('se ramene a la hauteur du mur que pose la chaine, pas a son angle le plus bas', () => {
    const g = gabaritDuHaut([{ x: 0, y: 3 }, { x: 0.5, y: 3 }, { x: 0.5, y: 6 }, { x: 1, y: 6 }], 6);
    expect(g.map((q) => q.v)).toEqual([0.5, 0.5, 1, 1]);
  });
  it('une rampe : l egout est le plus bas des deux angles', () => {
    const g = gabaritDuHaut([{ x: 0, y: 3 }, { x: 1, y: 4.5 }]);
    expect(g).toEqual([{ u: 0, v: 1 }, { u: 1, v: 1.5 }]);
  });
});

describe('le gabarit pose', () => {
  const g = [{ u: 0, v: 1 }, { u: 0.4, v: 1.5 }, { u: 1, v: 1 }];
  it('sur une vue de face, entre les bouts, l egout et le sol : seule l echelle suit', () => {
    expect(gabaritSurLaVue(g, { x0: 100, x1: 300, y0: 100, y1: 300 })).toEqual([{ x: 100, y: 100 }, { x: 180, y: 0 }, { x: 300, y: 100 }]);
  });
  it('sur une photo, par les coins du mur', () => {
    const s = gabaritSurLaPhoto(g, [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }])!;
    expect(s[1]).toEqual({ x: 180, y: 0 });
  });
  it('se relit d un cas enregistre, et refuse ce qui n en est pas un', () => {
    expect(lireGabarit(g)).toEqual(g);
    expect(lireGabarit([{ u: 0, v: 1 }])).toBeNull();
    expect(lireGabarit([{ u: 0, v: 1 }, { u: 2, v: 1 }])).toBeNull();
    expect(lireGabarit('triangle')).toBeNull();
  });
});
