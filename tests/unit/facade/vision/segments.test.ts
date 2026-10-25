import { describe, it, expect } from 'vitest';
import { detecterSegments } from '../../../../src/facade/vision/segments.js';
import type { Image } from '../../../../src/facade/vision/homographie.js';

// Les segments de droite (calage fin, lot L7) : une arete nette se retrouve a sa place, au pixel
// pres, et une image sans aretes n'en donne aucune.

/** Une image peinte par une fonction de la position (centre du pixel) vers une couleur. */
function peindre(l: number, h: number, f: (x: number, y: number) => [number, number, number]): Image {
  const d = new Uint8ClampedArray(l * h * 4);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < l; i++) {
      const c = f(i + 0.5, j + 0.5);
      const o = (j * l + i) * 4;
      d[o] = c[0];
      d[o + 1] = c[1];
      d[o + 2] = c[2];
      d[o + 3] = 255;
    }
  return { largeur: l, hauteur: h, donnees: d };
}

describe('detecterSegments', () => {
  it('retrouve les quatre bords d un rectangle sombre, au pixel pres', () => {
    const img = peindre(400, 300, (x, y) => (x > 100 && x < 300 && y > 80 && y < 220 ? [60, 60, 70] : [220, 210, 190]));
    const segs = detecterSegments(img).filter((s) => s.longueur > 100);
    // Chaque bord donne un segment (le gradient a un sens : un bord, une region).
    expect(segs.length).toBe(4);
    const verticaux = segs.filter((s) => Math.abs(s.x2 - s.x1) < 2).map((s) => (s.x1 + s.x2) / 2).sort((a, b) => a - b);
    const horizontaux = segs.filter((s) => Math.abs(s.y2 - s.y1) < 2).map((s) => (s.y1 + s.y2) / 2).sort((a, b) => a - b);
    expect(verticaux[0]).toBeCloseTo(100, 0);
    expect(verticaux[1]).toBeCloseTo(300, 0);
    expect(horizontaux[0]).toBeCloseTo(80, 0);
    expect(horizontaux[1]).toBeCloseTo(220, 0);
    for (const s of segs) expect(s.longueur).toBeGreaterThan(120);
  });

  it('suit une arete penchee, et rend ses bouts dans l image d origine meme reduite', () => {
    // 1 600 px de large : reduite d'un facteur 2 pour l'analyse, coordonnees rendues a pleine taille.
    const pente = Math.tan((10 * Math.PI) / 180);
    const img = peindre(1600, 600, (x, y) => (y > 300 + (x - 800) * pente ? [90, 140, 70] : [140, 185, 235]));
    const segs = detecterSegments(img);
    const s = segs[0];
    expect(s).toBeDefined();
    if (!s) return;
    expect(s.longueur).toBeGreaterThan(1000);
    const angle = (Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI;
    expect(Math.abs(Math.abs(angle) - 10) < 0.3 || Math.abs(Math.abs(angle) - 170) < 0.3).toBe(true);
    // Le milieu du segment est sur l'arete vraie.
    const mx = (s.x1 + s.x2) / 2,
      my = (s.y1 + s.y2) / 2;
    expect(Math.abs(my - (300 + (mx - 800) * pente)) * Math.cos((10 * Math.PI) / 180)).toBeLessThan(1);
  });

  it('distingue un mur beige d un ciel bleu pale de meme luminance', () => {
    // Meme luminance (environ 190) : seule la couleur les separe.
    const img = peindre(300, 200, (x) => (x < 150 ? [214, 186, 150] : [150, 195, 232]));
    const segs = detecterSegments(img);
    expect(segs.some((s) => s.longueur > 150 && Math.abs((s.x1 + s.x2) / 2 - 150) < 1)).toBe(true);
  });

  it('ne trouve rien sur une image unie', () => {
    expect(detecterSegments(peindre(200, 150, () => [128, 128, 128]))).toEqual([]);
  });
});
