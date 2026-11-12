// La fusion de plusieurs photos d'un mur (fusion.ts, l'algorithme de la mosaique de Plan) : des morceaux d'une meme facade de synthese,
// l'un un peu plus haut et plus grand, se retrouvent a leur place.
import { describe, expect, it } from 'vitest';
import { fusionner, vuDe } from '../src/fusion.js';
import type { Image } from '../src/plan/facade/vision/homographie.js';

/** Une facade de synthese : un enduit bruite, des fenetres sombres a des places irregulieres. */
function facade(L: number, H: number): Image {
  const d = new Uint8ClampedArray(L * H * 4);
  let g = 7;
  const alea = () => { g = (g * 1103515245 + 12345) % 2147483648; return g / 2147483648; };
  const baies = Array.from({ length: 9 }, (_, k) => ({ x: 40 + k * 95 + Math.round(alea() * 30), y: 40 + Math.round(alea() * 80), l: 30 + Math.round(alea() * 25), h: 50 + Math.round(alea() * 30) }));
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    const dans = baies.some((b) => x >= b.x && x < b.x + b.l && y >= b.y && y < b.y + b.h);
    const v = dans ? 40 + alea() * 20 : 190 + alea() * 30 + 20 * Math.sin(x / 13) * Math.cos(y / 17);
    const i = (y * L + x) * 4;
    d[i] = v; d[i + 1] = v * 0.95; d[i + 2] = v * 0.9; d[i + 3] = 255;
  }
  return { largeur: L, hauteur: H, donnees: d };
}

/** Le morceau [x0, x0 + l[ x [y0, y0 + h[, agrandi d'un facteur e (au plus proche). */
function morceau(img: Image, x0: number, y0: number, l: number, h: number, e = 1): Image {
  const L = Math.round(l * e), H = Math.round(h * e), d = new Uint8ClampedArray(L * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    const sx = x0 + Math.floor(x / e), sy = y0 + Math.floor(y / e), i = (sy * img.largeur + sx) * 4, o = (y * L + x) * 4;
    for (let c = 0; c < 4; c++) d[o + c] = img.donnees[i + c] ?? 0;
  }
  return { largeur: L, hauteur: H, donnees: d };
}

describe('la fusion de photos d’un même mur', () => {
  it('trois morceaux qui se recouvrent, le dernier cadré plus haut et plus serré, redonnent la façade', () => {
    const f = facade(900, 240);
    const a = morceau(f, 0, 20, 380, 200), b = morceau(f, 270, 20, 380, 200), c = morceau(f, 540, 5, 340, 189, 1.06);
    const r = fusionner([a, b, c]);
    expect(r).not.toBeNull();
    if (!r) return;
    expect(r.jointures.map((j) => j.score).every((s) => s > 0.8)).toBe(true);
    // A pleine taille : b commence a 270 px de a ; c, cadre 15 px plus haut et agrandi de 1,06, se pose a l'echelle 0,94.
    expect(Math.abs((r.jointures[0]?.dx ?? 0) * (200 / 360) - 270)).toBeLessThan(6);
    expect(Math.abs((r.jointures[1]?.echelle ?? 0) - 1 / 1.06)).toBeLessThan(0.015);
    expect(r.jointures[1]?.dy).toBeLessThan(0);
    // La largeur fusionnee couvre la facade jusqu'au bout de c (880 px), au decalage pres.
    expect(Math.abs(r.image.largeur - 880)).toBeLessThan(10);
  }, 30_000);
  it('le noir autour d’une photo redressée n’est pas vu ; une seule photo ne se fusionne pas', () => {
    const img: Image = { largeur: 2, hauteur: 1, donnees: new Uint8ClampedArray([0, 0, 0, 255, 120, 110, 100, 255]) };
    expect([...vuDe(img)]).toEqual([0, 1]);
    expect(fusionner([img])).toBeNull();
  });
});

import { composer, inverse, moindresCarres, plausible, ransac, type Paire } from '../src/fusionAlignement.js';
import { appliquer, homographie, type Homographie } from '../src/plan/facade/vision/homographie.js';

describe('l’alignement fin des photos d’un mur (homographie)', () => {
  const H: Homographie = [1.04, 0.02, 31, -0.015, 0.97, -12, 0.00002, -0.00001, 1];
  const grille = Array.from({ length: 60 }, (_, i) => ({ x: (i % 10) * 70 + 10, y: Math.floor(i / 10) * 90 + 15 }));
  it('les moindres carrés retrouvent une homographie connue ; inverse et composition s’annulent', () => {
    const paires: Paire[] = grille.map((b) => ({ b, a: appliquer(H, b) }));
    const E = moindresCarres(paires) as Homographie;
    for (const p of paires) { const e = appliquer(E, p.b); expect(Math.hypot(e.x - p.a.x, e.y - p.a.y)).toBeLessThan(1e-6); }
    const I = composer(inverse(H), H);
    const q = appliquer(I, { x: 123, y: 456 });
    expect(q.x).toBeCloseTo(123, 6); expect(q.y).toBeCloseTo(456, 6);
  });
  it('RANSAC écarte les fausses correspondances (un quart des paires)', () => {
    const paires: Paire[] = grille.map((b, i) => ({ b, a: i % 4 === 0 ? { x: b.x + 80 - i, y: b.y - 40 + i } : appliquer(H, b) }));
    const r = ransac(paires, 1.5);
    expect(r?.accord.length).toBe(45);
    const e = appliquer(r?.H as Homographie, { x: 300, y: 200 }), v = appliquer(H, { x: 300, y: 200 });
    expect(Math.hypot(e.x - v.x, e.y - v.y)).toBeLessThan(1e-3);
  });
  it('une homographie qui écrase ou retourne la photo n’est pas plausible', () => {
    expect(plausible(H, 800, 600)).toBe(true);
    expect(plausible([0.3, 0, 0, 0, 1, 0, 0, 0, 1], 800, 600)).toBe(false);
    expect(plausible(homographie([{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 600 }, { x: 0, y: 600 }], [{ x: 0, y: 0 }, { x: 800, y: 200 }, { x: 800, y: 400 }, { x: 0, y: 600 }]) as Homographie, 800, 600)).toBe(false);
  });
  it('deux prises d’une façade, la seconde tournée de 1,5° et en fuite, se posent au pixel près', () => {
    // Une facade sans bruit au pixel (une photo n'en a pas autant) : un enduit ondule, des baies aux places irregulieres.
    const f = facade(900, 240), lisse = (x: number, y: number) => 150 + 40 * Math.sin(x / 7) * Math.cos(y / 9) + 30 * Math.sin((x + 2 * y) / 13);
    for (let y = 0; y < f.hauteur; y++) for (let x = 0; x < f.largeur; x++) { const i = (y * f.largeur + x) * 4; if ((f.donnees[i] ?? 0) > 120) { const v = lisse(x, y); f.donnees[i] = v; f.donnees[i + 1] = v * 0.95; f.donnees[i + 2] = v * 0.9; } }
    // La prise : chaque pixel (u, v) de la vue vient du point G(u, v) de la facade.
    const prise = (G: Homographie, l: number, h: number): Image => {
      const d = new Uint8ClampedArray(l * h * 4);
      for (let v = 0; v < h; v++) for (let u = 0; u < l; u++) {
        const p = appliquer(G, { x: u, y: v }), o = (v * l + u) * 4, x = Math.round(p.x), y = Math.round(p.y);
        if (x < 0 || y < 0 || x >= f.largeur || y >= f.hauteur) continue;
        for (let c = 0; c < 4; c++) d[o + c] = f.donnees[(y * f.largeur + x) * 4 + c] ?? 0;
      }
      return { largeur: l, hauteur: h, donnees: d };
    };
    const a = 1.5 * Math.PI / 180, cx = 640, cy = 120;
    const rot = (p: { x: number; y: number }) => ({ x: cx + (p.x - cx) * Math.cos(a) - (p.y - cy) * Math.sin(a), y: cy + (p.x - cx) * Math.sin(a) + (p.y - cy) * Math.cos(a) });
    const GA: Homographie = [1, 0, 0, 0, 1, 20, 0, 0, 1];
    const GB = homographie([{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 }, { x: 0, y: 200 }], [rot({ x: 450, y: 22 }), rot({ x: 880, y: 28 }), rot({ x: 880, y: 216 }), rot({ x: 450, y: 222 })]) as Homographie;
    const A = prise(GA, 560, 200), B = prise(GB, 400, 200);
    const r = fusionner([A, B]);
    expect(r?.jointures[0]?.paires).toBeGreaterThan(8);
    // La vraie pose de B dans A : GA^-1 GB.
    const vrai = composer(inverse(GA), GB), P = r?.poses[1] as Homographie;
    for (const q of [{ x: 30, y: 40 }, { x: 90, y: 160 }, { x: 60, y: 100 }]) {
      const e = appliquer(P, q), v = appliquer(vrai, q);
      expect(Math.hypot(e.x - v.x, e.y - v.y)).toBeLessThan(1);
    }
  }, 30_000);
});
