// Le calage du mur par les pignons (facade/releve/calagePignons.ts) : sur une facade a plusieurs plans dessinee a la main (deux pignons
// au fond, un toit bas devant, comme AE 101), les pignons du plan posent le mur ; sans eux, ou quand l'image ne les montre pas a leurs
// places, rien n'est pose.
import { describe, expect, it } from 'vitest';
import { pignonsDuGabarit, poserParLesPignons } from '../../../../src/facade/releve/calagePignons.js';
import type { Segment } from '../../../../src/facade/vision/segments.js';
import type { GabaritMur } from '../../../../src/facade/gabaritMur.js';

const W = 1000, H = 800;
/** Le gabarit : deux pignons (u 0,11 et 0,80), leurs pieds a 2,1 hauteurs de mur, les rives exterieures coupees aux bouts. */
const GABARIT: GabaritMur = [{ u: 0, v: 2.58 }, { u: 0.11, v: 3.16 }, { u: 0.31, v: 2.1 }, { u: 0.6, v: 2.1 }, { u: 0.8, v: 3.14 }, { u: 1, v: 2.15 }];
/** La verite de la scene : le mur de x 200 a 850, l'egout du toit bas a y 470, le sol a 690 ; les pieds des pignons a y 240. */
const X0 = 200, LARGEUR = 650, EGOUT = 470, SOL = 690, PIEDS = 240, RAPPORT = 0.27;

const seg = (x1: number, y1: number, x2: number, y2: number): Segment => ({ x1, y1, x2, y2, longueur: Math.hypot(x2 - x1, y2 - y1), force: 30 });

/** Un pignon : deux rives du sommet a ses pieds, deborde compris. */
function pignon(u: number, demi: number, ySommet: number): Segment[] {
  const x = X0 + u * LARGEUR, d = demi * LARGEUR * 1.15, y = ySommet + (PIEDS - ySommet) * 1.15;
  return [seg(x - 2, ySommet + 2, x - d, y), seg(x + 2, ySommet + 2, x + d, y)];
}

/** Les verticales du rez-de-chaussee, posees au sol, et des appuis de fenetre plus haut. */
const verticales = (sol: number): Segment[] => [220, 330, 480, 560, 700, 830].map((x) => seg(x, EGOUT + 20, x, sol)).concat([260, 380].map((x) => seg(x, EGOUT + 30, x, sol - 90)));

/** L'image : le mur clair, la couverture du toit bas sombre au-dessus de son egout. */
function image(): { largeur: number; hauteur: number; donnees: Uint8ClampedArray } {
  const donnees = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let y = 390; y < EGOUT; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; donnees[i] = donnees[i + 1] = donnees[i + 2] = 60; }
  return { largeur: W, hauteur: H, donnees };
}

const scene = (): Segment[] => [...pignon(0.11, 0.2, 40), ...pignon(0.8, 0.2, 45), ...verticales(SOL)];

describe('le calage du mur par les pignons', () => {
  it('lit les pignons du gabarit, et le pied des rives qu il montre entieres', () => {
    const p = pignonsDuGabarit(GABARIT);
    expect(p.map((x) => x.u)).toEqual([0.11, 0.8]);
    expect(p[0]?.piedG).toBeNull();
    expect(p[0]?.piedD).toEqual({ u: 0.31, v: 2.1 });
    expect(p[1]?.piedG).toEqual({ u: 0.6, v: 2.1 });
    expect(p[1]?.piedD).toBeNull();
  });

  it('ne compte pas une ride du faitage pour un pignon', () => {
    expect(pignonsDuGabarit([{ u: 0, v: 1 }, { u: 0.5, v: 1.1 }, { u: 1, v: 1 }])).toEqual([]);
  });

  it('pose le mur d une facade a deux pignons et un toit bas : bouts, egout et sol a 2 % de la largeur', () => {
    const r = poserParLesPignons({ image: image() }, scene(), GABARIT, RAPPORT);
    expect(r).not.toBeNull();
    if (!r) return;
    const tol = 0.02 * LARGEUR;
    expect(Math.abs(r.x0 - X0)).toBeLessThan(tol);
    expect(Math.abs(r.x1 - (X0 + LARGEUR))).toBeLessThan(tol);
    expect(Math.abs(r.y0 - EGOUT)).toBeLessThan(tol);
    expect(Math.abs(r.y1 - SOL)).toBeLessThan(tol);
    expect(r).toMatchObject({ egout: true, pied: true, cotes: true });
    expect(r.lecture).toMatchObject({ pignons: 2, egout: 'toit-bas' });
  });

  it('suppose le sol quand aucune verticale ne le donne', () => {
    const r = poserParLesPignons({ image: image() }, [...pignon(0.11, 0.2, 40), ...pignon(0.8, 0.2, 45)], GABARIT, RAPPORT);
    expect(r?.pied).toBe(false);
    expect(Math.abs((r?.y0 ?? 0) - EGOUT)).toBeLessThan(0.02 * LARGEUR);
  });

  it('ne pose rien quand l image ne montre qu un des deux pignons', () => {
    expect(poserParLesPignons({ image: image() }, [...pignon(0.11, 0.2, 40), ...verticales(SOL)], GABARIT, RAPPORT)).toBeNull();
  });

  it('ne pose rien quand les pignons vus n ont pas la taille de ceux du plan', () => {
    expect(poserParLesPignons({ image: image() }, [...pignon(0.11, 0.07, 40), ...pignon(0.8, 0.07, 45), ...verticales(SOL)], GABARIT, RAPPORT)).toBeNull();
  });

  it('ne pose rien sans gabarit, ni sur un gabarit sans pignon', () => {
    expect(poserParLesPignons({ image: image() }, scene(), null, RAPPORT)).toBeNull();
    expect(poserParLesPignons({ image: image() }, scene(), [{ u: 0, v: 1 }, { u: 1, v: 1 }], RAPPORT)).toBeNull();
  });
});
