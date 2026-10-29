import { describe, it, expect } from 'vitest';
import { silhouetteDeFace, silhouetteDuCorps, silhouetteVersLOeil, tronconsDeFace } from '../../../src/facade/regles/toits/silhouetteDesCorps.js';
import { gabaritDesCorps } from '../../../src/facade/gabaritMur.js';
import { facadesDuContour, type Facade } from '../../../src/geometry/cotesVusDeDehors.js';
import { simplifierLigne } from '../../../src/geometry/simplifierLigne.js';
import type { CorpsToit, PtBrut } from '../../../src/model/types.js';

// La silhouette d'une facade vue de face : celle que trace le mode Toit, corps par corps, projetee sur le plan du mur. C'est le gabarit
// de l'audit, du releve et de la calibration (demande du proprietaire, 28 octobre 2026).

const p = (x: number, y: number): PtBrut => ({ x, y });
const corps = (pts: PtBrut[], posFaitage: number, faitage: number, egouts: [number, number], extra: Partial<CorpsToit> = {}): CorpsToit =>
  ({ pts, posFaitage, faitage, egouts, pignons: [], ecart: 0, ...extra }) as CorpsToit;
// Une maison de 8 m de facade au sud (y = 0), 9 m de profondeur : pignon au sud, faitage nord-sud a 8,8 m, egouts a 5,2 m.
const maison = corps([p(0, 0), p(0, 9), p(8, 9), p(8, 0)], 4, 8.8, [5.2, 5.2]);
const sudDe = (contour: PtBrut[], largeur?: number): Facade =>
  facadesDuContour(contour, 5.2).find((f) => f.normale.y < -0.99 && (largeur === undefined || Math.abs(f.largeur - largeur) < 1e-6))!;
const rect = [p(0, 0), p(8, 0), p(8, 9), p(0, 9)];
/** Le haut lu en `x` (metres depuis la gauche). */
const en = (s: ReturnType<typeof silhouetteDeFace>, x: number) => s.haut.reduce((m, q) => (Math.abs(q.x - x) < Math.abs(m.x - x) ? q : m)).y;

describe('silhouetteDeFace', () => {
  it('un pignon simple : le triangle, de l egout au faitage et retour', () => {
    const s = silhouetteDeFace(sudDe(rect), [maison]);
    expect([s.x0, s.x1]).toEqual([0, 8]);
    expect(en(s, 0)).toBeCloseTo(5.2, 6);
    expect(en(s, 4)).toBeCloseTo(8.8, 1);
    expect(en(s, 8)).toBeCloseTo(5.2, 6);
    expect(en(s, 2)).toBeCloseTo(7, 1);
  });
  it('une croupe : le bout est a l egout, un rectangle', () => {
    const s = silhouetteDeFace(sudDe(rect), [{ ...maison, croupes: [3, 3] }]);
    expect(s.haut.every((q) => Math.abs((q.y ?? 0) - 5.2) < 0.05)).toBe(true);
    expect(gabaritDesCorps(sudDe(rect), [{ ...maison, croupes: [3, 3] }], 5.2)).toEqual([{ u: 0, v: 1 }, { u: 1, v: 1 }]);
  });
  it('une maison en L : le pignon entier, au-dessus du toit de l aile qui avance devant sa moitie droite', () => {
    // L'aile, basse, avance de 4 m devant x de 4,5 a 8 : le cote du contour au nu de la maison ne fait que 4,5 m.
    const aile = corps([p(4.5, -4), p(8, -4), p(8, 0.01), p(4.5, 0.01)], 2, 4.6, [3, 3]);
    const contour = [p(0, 0), p(4.5, 0), p(4.5, -4), p(8, -4), p(8, 9), p(0, 9)];
    const f = sudDe(contour, 4.5);
    const s = silhouetteDeFace(f, [maison, aile]);
    // Le mur de la maison se voit entier, comme le mode Toit le trace ; l'aile, devant, n'en est pas.
    expect([s.x0, s.x1]).toEqual([0, 8]);
    expect(en(s, 4)).toBeCloseTo(8.8, 1);
    expect(en(s, 8)).toBeCloseTo(5.2, 6);
    const g = gabaritDesCorps(f, [maison, aile], 5.2);
    expect(g[0]).toEqual({ u: 0, v: 1 });
    expect(g[g.length - 1]?.u).toBeCloseTo(8 / 4.5, 6);
    expect(g[g.length - 1]?.v).toBeCloseTo(1, 6);
  });
  it('un appentis adosse au pignon : sa rampe a droite, sous le pignon', () => {
    // Un appentis de 3 m sur 6 contre le cote est : son mur haut (4 m) contre la maison, son egout (2,6 m) a l'est.
    const appentis = corps([p(8, 0), p(8, 6), p(11, 6), p(11, 0)], 0, 4, [4, 2.6]);
    const contour = [p(0, 0), p(11, 0), p(11, 6), p(8, 6), p(8, 9), p(0, 9)];
    const s = silhouetteDeFace(sudDe(contour), [maison, appentis]);
    expect([s.x0, s.x1]).toEqual([0, 11]);
    expect(en(s, 4)).toBeCloseTo(8.8, 1);
    expect(en(s, 8.5)).toBeCloseTo(4 - (1.4 * 0.5) / 3, 1);
    expect(en(s, 11)).toBeCloseTo(2.6, 1);
  });
  it('un corps plus haut en retrait se voit au-dessus d un plus bas devant', () => {
    const annexe = corps([p(0, -2), p(5, -2), p(5, 0), p(0, 0)], 0, 3, [3, 3]);
    const haut = corps([p(0, 0), p(10, 0), p(10, 6), p(0, 6)], 3, 8, [5, 5]);
    const f = facadesDuContour([p(0, -2), p(5, -2), p(5, 0), p(10, 0), p(10, 6), p(0, 6)], 5).find((x) => x.normale.y < -0.99 && x.gauche.y === -2)!;
    const s = silhouetteDeFace(f, [haut, annexe]);
    expect(Math.min(...s.haut.map((q) => q.y ?? 0))).toBeCloseTo(5, 1);
    // Sans le grand corps, l'annexe seule.
    expect(Math.max(...silhouetteDeFace(f, [annexe]).haut.map((q) => q.y ?? 0))).toBeCloseTo(3, 1);
  });
  it('le gabarit est la silhouette du mode Toit, a plat : la meme ligne, en parts du mur', () => {
    for (const c of [maison, { ...maison, croupes: [3, 3] as [number, number] }, corps([p(0, 0), p(0, 6), p(5, 6), p(5, 0)], 0, 5, [5, 3]), { ...maison, posFaitage: 2.5 }]) {
      const contour = c.pts.map((q) => ({ ...q }));
      const f = facadesDuContour(contour, 5.2).find((x) => x.normale.y < -0.99)!;
      // La silhouette du mode Toit vue du sud, a plat dans le repere du mur.
      const s3d = silhouetteVersLOeil(c, p(f.gauche.x + 3, -30))!;
      const haut3d = simplifierLigne(s3d.slice(2).reverse().map((q) => ({ x: q.x - f.gauche.x, y: q.z })), 0.02);
      const g = gabaritDesCorps(f, [c], 5.2);
      const plat = g.map((q) => ({ x: q.u * f.largeur, y: q.v * 5.2 }));
      if (g.length === 2 && g.every((q) => q.v === 1)) {
        expect(haut3d.every((q) => Math.abs(q.y - 5.2) < 0.2)).toBe(true);
        continue;
      }
      expect(plat.length).toBe(haut3d.length);
      plat.forEach((q, i) => { expect(q.x).toBeCloseTo(haut3d[i]!.x, 6); expect(q.y).toBeCloseTo(haut3d[i]!.y, 6); });
    }
  });
});

describe('silhouetteDuCorps', () => {
  it('est ce que trace le mode Toit pour ce mur', () => {
    for (let m = 0; m < 4; m++) expect(silhouetteVersLOeil(maison, p(0, 0), m)).toEqual(silhouetteDuCorps(maison, m));
  });
});

describe('tronconsDeFace : la facade decoupee en troncons de corps (lot F4)', () => {
  it('chaque part du haut et le mur du corps qui la porte, de gauche a droite', () => {
    const appentis = corps([p(8, 0), p(8, 6), p(11, 6), p(11, 0)], 0, 4, [4, 2.6]);
    const contour = [p(0, 0), p(11, 0), p(11, 6), p(8, 6), p(8, 9), p(0, 9)];
    const t = tronconsDeFace(silhouetteDeFace(sudDe(contour), [maison, appentis]));
    expect(t.map((x) => [x.corps, x.cote])).toEqual([[0, 3], [1, 3]]);
    expect(t[0]!.x0).toBeCloseTo(0, 6);
    expect(t[0]!.x1).toBeCloseTo(8, 1);
    expect(t[1]!.x1).toBeCloseTo(11, 6);
    // Le mur d'un troncon est celui du corps (ses bouts dans le plan) : murDuCorps le retrouve.
    expect([t[1]!.gauche, t[1]!.droite].map((q) => q.x).sort((a, b) => a - b)).toEqual([8, 11]);
  });
  it('un corps plus haut en retrait l emporte sur un plus bas devant : un seul troncon, le sien', () => {
    const annexe = corps([p(0, -2), p(5, -2), p(5, 0), p(0, 0)], 0, 3, [3, 3]);
    const haut = corps([p(0, 0), p(10, 0), p(10, 6), p(0, 6)], 3, 8, [5, 5]);
    const f = facadesDuContour([p(0, -2), p(5, -2), p(5, 0), p(10, 0), p(10, 6), p(0, 6)], 5).find((x) => x.normale.y < -0.99 && x.gauche.y === -2)!;
    expect(tronconsDeFace(silhouetteDeFace(f, [haut, annexe])).map((x) => x.corps)).toEqual([0]);
  });
});
