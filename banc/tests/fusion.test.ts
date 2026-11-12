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
  });
  it('le noir autour d’une photo redressée n’est pas vu ; une seule photo ne se fusionne pas', () => {
    const img: Image = { largeur: 2, hauteur: 1, donnees: new Uint8ClampedArray([0, 0, 0, 255, 120, 110, 100, 255]) };
    expect([...vuDe(img)]).toEqual([0, 1]);
    expect(fusionner([img])).toBeNull();
  });
});
