import { describe, it, expect } from 'vitest';
import { carteOmbre, baieEntreVolets, affiner } from '../../../../src/facade/detection/detectionIndices.js';
import { reduire } from '../../../../src/facade/detection/detectionCartes.js';
import { reglagesDetection } from '../../../../src/facade/regles/facades/detection.js';
import type { Image } from '../../../../src/facade/vision/homographie.js';

// Les indices d'une ouverture au-dela de l'ecart de teinte (spec-facades §9, lot L14).

type RGB = [number, number, number];
const rg = reglagesDetection();

/** Une image unie de `l` x `h` pixels, et des rectangles peints par-dessus. */
function peindre(l: number, h: number, fond: RGB, rects: { x: number; y: number; l: number; h: number; c: RGB }[]): Image {
  const d = new Uint8ClampedArray(l * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < l; x++) {
      let c = fond;
      for (const r of rects) if (x >= r.x && x < r.x + r.l && y >= r.y && y < r.y + r.h) c = r.c;
      d.set([c[0], c[1], c[2], 255], (y * l + x) * 4);
    }
  return { largeur: l, hauteur: h, donnees: d };
}

describe('carteOmbre', () => {
  it('voit une ombre (plus sombre, meme teinte), pas un vitrage ni une menuiserie', () => {
    const mur: RGB = [220, 200, 170];
    const img = peindre(40, 20, mur, [
      { x: 0, y: 0, l: 10, h: 20, c: [132, 120, 102] }, // ombre : x 0,6
      { x: 10, y: 0, l: 10, h: 20, c: [55, 62, 70] }, // vitrage
      { x: 20, y: 0, l: 10, h: 20, c: [120, 70, 40] }, // porte brune
    ]);
    const R = reduire(img, 20, null);
    const fond = new Float32Array(R.l * R.h * 3);
    for (let i = 0; i < R.l * R.h; i++) fond.set(mur, i * 3);
    const o = carteOmbre(R, fond, rg);
    expect(o[5]).toBe(1);
    expect(o[15]).toBe(0);
    expect(o[25]).toBe(0);
    expect(o[35]).toBe(0);
  });
});

describe('baieEntreVolets', () => {
  // A 100 px/m : volets verts de 60 cm de part et d'autre d'une baie de 1,20 m (dormant blanc de 6 cm,
  // vitrage sombre, meneau blanc).
  const VERT: RGB = [70, 112, 92];
  const BLANC: RGB = [242, 242, 238];
  const VITRE: RGB = [58, 66, 76];
  const baie = (x: number) => [
    { x, y: 0, l: 120, h: 130, c: BLANC },
    { x: x + 6, y: 6, l: 108, h: 118, c: VITRE },
    { x: x + 56, y: 6, l: 8, h: 118, c: BLANC },
  ];

  it('rend les colonnes de la baie, sans ses volets', () => {
    const img = peindre(240, 130, [200, 100, 80], [{ x: 0, y: 0, l: 60, h: 130, c: VERT }, { x: 180, y: 0, l: 60, h: 130, c: VERT }, ...baie(60)]);
    const r = baieEntreVolets(img, null, { X0: 0, X1: 240, Y0: 0, Y1: 130 }, 100, rg);
    expect(r).not.toBeNull();
    expect(Math.abs(r!.X0 - 60)).toBeLessThanOrEqual(1);
    expect(Math.abs(r!.X1 - 180)).toBeLessThanOrEqual(1);
  });

  it('ne coupe pas une fenetre a deux vantaux', () => {
    const img = peindre(120, 130, [200, 100, 80], baie(0));
    expect(baieEntreVolets(img, null, { X0: 0, X1: 120, Y0: 0, Y1: 130 }, 100, rg)).toBeNull();
  });

  it('ne coupe pas une porte unie', () => {
    const img = peindre(100, 215, [220, 200, 170], [{ x: 0, y: 0, l: 100, h: 215, c: [120, 70, 40] }]);
    expect(baieEntreVolets(img, null, { X0: 0, X1: 100, Y0: 0, Y1: 215 }, 100, rg)).toBeNull();
  });
});

describe('affiner', () => {
  it('ne prend pas un joint d un centimetre pour le bord de la baie', () => {
    // Une baie sombre de 50 a 150 px de large, 40 a 140 de haut ; un joint clair d'1 px a 4 px au-dessus.
    const mur: RGB = [180, 90, 70];
    const img = peindre(200, 180, mur, [
      { x: 0, y: 36, l: 200, h: 1, c: [235, 230, 220] },
      { x: 50, y: 40, l: 100, h: 100, c: [55, 62, 70] },
    ]);
    const l = 40,
      h = 36;
    const fond = new Float32Array(l * h * 3);
    for (let i = 0; i < l * h; i++) fond.set(mur, i * 3);
    const b = affiner(img, { fond, seuil: new Float32Array(l * h).fill(40), l, h, f: 5, franc: 40 }, { X0: 50, X1: 150, Y0: 35, Y1: 140 });
    expect(b).toEqual({ X0: 50, X1: 150, Y0: 40, Y1: 140 });
  });
});
