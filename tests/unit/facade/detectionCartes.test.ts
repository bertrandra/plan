import { describe, it, expect } from 'vitest';
import { medianeGlissante, medianeMasquee, completerRangs, completer } from '../../../src/facade/detectionCartes.js';

// Les medianes glissantes donnent le fond local du mur (spec-facades §9 A, lot L14) : elles doivent
// rendre la meme valeur qu'un calcul direct, quelle que soit la taille de la fenetre.

/** Un tirage reproductible de [0, 1). */
const hasard = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function directe(v: Float32Array, k: number, garder: Uint8Array, l: number, h: number, rx: number, ry: number, partMin: number, q: number) {
  const res = new Float32Array(l * h * k),
    ok = new Uint8Array(l * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < l; x++) {
      const vals: number[][] = Array.from({ length: k }, () => []);
      let surface = 0;
      for (let yy = Math.max(0, y - ry); yy <= Math.min(h - 1, y + ry); yy++)
        for (let xx = Math.max(0, x - rx); xx <= Math.min(l - 1, x + rx); xx++) {
          surface++;
          const i = yy * l + xx;
          if (!garder[i]) continue;
          for (let c = 0; c < k; c++) vals[c]!.push(Math.max(0, Math.min(255, Math.round(v[i * k + c]!))));
        }
      const n = vals[0]!.length;
      if (n < 1 || n < partMin * surface) continue;
      ok[y * l + x] = 1;
      for (let c = 0; c < k; c++) {
        const s = vals[c]!.sort((a, b) => a - b);
        // La plus petite valeur dont le cumul depasse n x q.
        let cumul = 0;
        for (const val of s) {
          cumul++;
          if (cumul > n * q) {
            res[(y * l + x) * k + c] = val;
            break;
          }
        }
      }
    }
  return { v: res, ok };
}

describe('medianeGlissante', () => {
  const l = 23,
    h = 17,
    k = 3;
  const v = new Float32Array(l * h * k).map((_, i) => hasard(i) * 260 - 2);
  const garder = new Uint8Array(l * h).map((_, i) => (hasard(i + 999) > 0.3 ? 1 : 0));

  it('rend la mediane directe de chaque fenetre, canal par canal', () => {
    for (const [rx, ry] of [
      [2, 2],
      [5, 1],
      [l, 3],
    ] as const) {
      const g = medianeGlissante(v, k, garder, l, h, rx, ry, 0.25);
      const d = directe(v, k, garder, l, h, Math.min(rx, l), ry, 0.25, 0.5);
      expect(Array.from(g.ok)).toEqual(Array.from(d.ok));
      for (let i = 0; i < l * h; i++) if (g.ok[i]) for (let c = 0; c < k; c++) expect(g.v[i * k + c], `${rx},${ry} @${i}`).toBe(d.v[i * k + c]);
    }
  });

  it('rend aussi un autre quantile', () => {
    const g = medianeGlissante(v, k, garder, l, h, 3, 3, 0.1, 0.9);
    const d = directe(v, k, garder, l, h, 3, 3, 0.1, 0.9);
    for (let i = 0; i < l * h; i++) if (g.ok[i]) for (let c = 0; c < k; c++) expect(g.v[i * k + c]).toBe(d.v[i * k + c]);
  });

  it('laisse inconnu un pixel dont la fenetre manque de pixels gardes', () => {
    const vide = new Uint8Array(l * h);
    vide[0] = 1;
    const g = medianeGlissante(v, k, vide, l, h, 2, 2, 0.25);
    expect(g.ok.reduce((s, x) => s + x, 0)).toBe(0);
  });
});

describe('medianes et completions', () => {
  it('medianeMasquee ne compte que les pixels gardes', () => {
    const v = new Float32Array([10, 200, 20, 210, 30, 220, 250, 0]);
    expect(medianeMasquee(v, 2, new Uint8Array([1, 1, 1, 0]))).toEqual([20, 210]);
  });

  it('completerRangs reprend la ligne connue la plus proche', () => {
    const ok = new Uint8Array([0, 0, 1, 1, 0, 0]);
    const v = new Float32Array([0, 0, 7, 7, 0, 0]);
    expect(Array.from(completerRangs({ v, ok }, 1, 2, 3, [5]))).toEqual([7, 7, 7, 7, 7, 7]);
    expect(Array.from(completerRangs({ v, ok: new Uint8Array(6) }, 1, 2, 3, [5]))).toEqual([5, 5, 5, 5, 5, 5]);
  });

  it('completer prend la carte par defaut la ou rien n est connu', () => {
    const r = completer({ v: new Float32Array([1, 2]), ok: new Uint8Array([1, 0]) }, 1, new Float32Array([9, 9]));
    expect(Array.from(r)).toEqual([1, 9]);
  });
});
