import { describe, it, expect } from 'vitest';
import { analyserMosaique, rapportRectangle, type MorceauPhoto } from '../../../src/facade/mosaique.js';
import { homographie, appliquer } from '../../../src/facade/homographie.js';
import { focalePx } from '../../../src/facade/cadrage.js';

const p = (x: number, y: number) => ({ x, y });

/**
 * La maison des tests d'analyse : mur de 8 x 4 m, pignon de 3 m au-dessus, ciel bleu, deux fenetres
 * et une porte. Elevation a 50 px/m, de 8 m de haut (le faite en haut), 8 m de large.
 */
function elevation() {
  const px = 50,
    L = 8 * px,
    H = 8 * px;
  const d = new Uint8ClampedArray(L * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++) {
      const xm = (x + 0.5) / px,
        ym = 8 - (y + 0.5) / px;
      let c = [140, 185, 235];
      const pignon = 4 + 3 * (1 - Math.abs((2 * xm) / 8 - 1));
      if (ym <= 4 || ym <= pignon) c = [222, 205, 176];
      if ((xm >= 1 && xm < 2.2 && ym >= 0.9 && ym < 2.25) || (xm >= 5.6 && xm < 6.8 && ym >= 0.9 && ym < 2.25)) c = [55, 62, 70];
      if (xm >= 3.5 && xm < 4.4 && ym < 2.15) c = [120, 70, 40];
      // Un grain d'enduit, deterministe : un mur parfaitement uni ne se recale pas.
      const g = ((x * 7919 + y * 104729) % 17) - 8;
      const o = (y * L + x) * 4;
      d[o] = c[0]! + g;
      d[o + 1] = c[1]! + g;
      d[o + 2] = c[2]! + g;
      d[o + 3] = 255;
    }
  return { L, H, d, px };
}

/**
 * Un appareil photo a stenope devant le mur (plan z = 0, x vers la droite, y = hauteur) : centre a
 * (cx, 1,5 m, -distance), tourne de \`lacet\` degres autour de la verticale, image 1200 x 1600.
 */
function camera(cx: number, distance: number, lacet: number) {
  const W = 1200,
    Hp = 1600,
    f = focalePx(W, Hp, 67);
  const a = (lacet * Math.PI) / 180;
  const projeter = (x: number, y: number) => {
    const X = x - cx,
      Y = y - 1.5,
      Z = distance;
    const xc = Math.cos(a) * X - Math.sin(a) * Z,
      zc = Math.sin(a) * X + Math.cos(a) * Z;
    return p(W / 2 + (f * xc) / zc, Hp / 2 - (f * Y) / zc);
  };
  return { W, Hp, f, projeter };
}

/** Photographie le mur : chaque pixel va chercher le point du mur qu'il voit. */
function photographier(cam: ReturnType<typeof camera>, e: ReturnType<typeof elevation>) {
  const coinsMur = [p(0, 8), p(8, 8), p(8, 0), p(0, 0)];
  const versImage = homographie(coinsMur, coinsMur.map((q) => cam.projeter(q.x, q.y)))!;
  const versMur = homographie(coinsMur.map((q) => appliquer(versImage, q)), coinsMur)!;
  const d = new Uint8ClampedArray(cam.W * cam.Hp * 4);
  for (let y = 0; y < cam.Hp; y++)
    for (let x = 0; x < cam.W; x++) {
      const m = appliquer(versMur, p(x + 0.5, y + 0.5));
      const xi = Math.floor(m.x * e.px),
        yi = Math.floor((8 - m.y) * e.px);
      const o = (y * cam.W + x) * 4;
      let c = [140, 185, 235];
      if (m.y < 0) c = [110, 160, 80];
      else if (xi >= 0 && xi < e.L && yi >= 0 && yi < e.H) {
        const s = (yi * e.L + xi) * 4;
        c = [e.d[s]!, e.d[s + 1]!, e.d[s + 2]!];
      }
      d[o] = c[0]!;
      d[o + 1] = c[1]!;
      d[o + 2] = c[2]!;
      d[o + 3] = 255;
    }
  return { largeur: cam.W, hauteur: cam.Hp, donnees: d };
}

describe('rapportRectangle', () => {
  it('retrouve les proportions d un rectangle vu de biais, la focale connue', () => {
    const cam = camera(1, 4, 20);
    const coins = [p(0, 4), p(2, 4), p(2, 0), p(0, 0)].map((q) => cam.projeter(q.x, q.y));
    expect(rapportRectangle(coins, cam.f, cam.W / 2, cam.Hp / 2)).toBeCloseTo(0.5, 6);
  });

  it('marche aussi de face, cotes paralleles', () => {
    const cam = camera(4, 4, 0);
    const coins = [p(2, 4), p(6, 4), p(6, 0), p(2, 0)].map((q) => cam.projeter(q.x, q.y));
    expect(rapportRectangle(coins, cam.f, cam.W / 2, cam.Hp / 2)).toBeCloseTo(1, 6);
  });
});

describe('analyserMosaique', () => {
  const e = elevation();
  // Trois prises a 4 m : chacune voit ~4 m de mur. La premiere et la derniere tiennent un coin.
  const prises = [
    { cam: camera(1.6, 4, -4), de: 0, a: 3.4 },
    { cam: camera(4.0, 4, 2), de: 2.2, a: 5.8 },
    { cam: camera(6.4, 4, 5), de: 4.6, a: 8 },
  ];
  const morceaux: MorceauPhoto[] = prises.map(({ cam, de, a }) => ({
    photo: photographier(cam, e),
    coins: [p(de, 4), p(a, 4), p(a, 0), p(de, 0)].map((q) => cam.projeter(q.x, q.y)),
    focalePx: cam.f,
  }));
  const r = analyserMosaique({ morceaux, largeur: 8, hauteur: 4, contour: [p(0, 0), p(8, 0), p(8, 6), p(0, 6)], cote: 0, distance: 4 })!;

  it('assemble les trois photos a la bonne largeur, sans recalage notable', () => {
    expect(r.rapportLargeur).toBeGreaterThan(0.97);
    expect(r.rapportLargeur).toBeLessThan(1.03);
    expect(r.jointures).toHaveLength(2);
    r.jointures.forEach((s) => expect(s).toBeGreaterThan(0.8));
    expect(r.couverture).toBeGreaterThan(0.97);
  });

  it('retrouve les ouvertures sur l assemblage', () => {
    expect(r.ouvertures.map((o) => o.type)).toEqual(['fenetre', 'porte', 'fenetre']);
    const [f1, porte, f2] = r.ouvertures;
    expect(Math.abs(f1!.x - 1)).toBeLessThan(0.06);
    expect(Math.abs(f1!.l - 1.2)).toBeLessThan(0.06);
    expect(Math.abs(porte!.x - 3.5)).toBeLessThan(0.06);
    expect(Math.abs(porte!.h - 2.15)).toBeLessThan(0.06);
    expect(Math.abs(f2!.x - 5.6)).toBeLessThan(0.06);
  });

  it('ne propose pas de toit qu elle n a pas vu', () => {
    // A 4 m, telephone d'aplomb, l'image s'arrete a 4,15 m de haut : le pignon est hors cadre. Plan
    // ne conclut pas a un toit plat, il ne propose rien - celui du batiment reste tel quel.
    expect(r.toitPropose).toBeNull();
  });
});
