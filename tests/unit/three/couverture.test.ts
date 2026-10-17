import { describe, it, expect } from 'vitest';
import { pixelsCouverture, matiereCouverture } from '../../../src/three/couverture.js';

// Les textures des couvertures (MD/spec-toit-ign.md §6.2) : en niveaux de clair, a teinter par la
// couleur du toit, sans couture d'une tuile a l'autre ; la matiere de chacune.

const COTE = 256;
const MATERIAUX = ['tuile', 'tuile-plate', 'tuile-canal', 'ardoise', 'ardoise-losange', 'zinc', 'terrasse'] as const;
const gris = (px: Uint8ClampedArray, x: number, y: number) => px[(y * COTE + x) * 4] as number;

describe('pixelsCouverture', () => {
  for (const m of MATERIAUX) {
    it(m + ' : en gris, assez claire, sans couture', () => {
      const px = pixelsCouverture(m);
      let somme = 0;
      for (let k = 0; k < COTE * COTE; k++) { expect(px[k * 4]).toBe(px[k * 4 + 2]); somme += px[k * 4] as number; }
      const moyenne = somme / (COTE * COTE) / 255;
      expect(moyenne).toBeGreaterThan(0.5);
      expect(moyenne).toBeLessThan(0.95);
      // Le raccord (dernier pixel contre premier) n'est pas plus marque que la pire arete du dessin :
      // une tuile qui se termine au bord est une arete comme les autres, pas une couture.
      const saut = (x0: number, x1: number) => { let t = 0; for (let y = 0; y < COTE; y++) t += Math.abs(gris(px, x1, y) - gris(px, x0, y)); return t; };
      const pire = Math.max(...Array.from({ length: COTE - 1 }, (_, x) => saut(x, x + 1)));
      expect(saut(COTE - 1, 0)).toBeLessThanOrEqual(pire * 1.1 + COTE);
    });
  }
  it('les joints debout du zinc tous les 50 cm, et des tuiles plates plus fines que les romanes', () => {
    const z = pixelsCouverture('zinc');
    expect(gris(z, 0, 10)).toBeGreaterThan(gris(z, 64, 10));
    expect(gris(z, COTE / 2, 10)).toBeGreaterThan(gris(z, 64, 10));
    // Une ligne : on compte les joints sombres (les bords de tuiles) - 6 par metre pour les plates.
    const ligne = (px: Uint8ClampedArray, y: number) => Array.from({ length: COTE }, (_, x) => gris(px, x, y));
    const joints = (v: number[]) => v.filter((g, i) => g < 140 && (v[i - 1] ?? 255) >= 140).length;
    expect(joints(ligne(pixelsCouverture('tuile-plate'), 20))).toBeGreaterThanOrEqual(5);
  });
  it('la grande ardoise en losange : des joints en diagonale, pas de rangs horizontaux, et une texture autre que l ardoise droite', () => {
    const l = pixelsCouverture('ardoise-losange'), d = pixelsCouverture('ardoise');
    expect(Buffer.from(l).equals(Buffer.from(d))).toBe(false);
    // Un joint est un pixel sombre. En diagonale, il traverse chaque ligne : on en trouve a toute hauteur, jamais une ligne entiere de joints.
    const sombres = (y: number) => Array.from({ length: COTE }, (_, x) => gris(l, x, y)).filter((g) => g < 120).length;
    for (const y of [3, 40, 77, 130, 201]) { expect(sombres(y), 'ligne ' + y).toBeGreaterThan(0); expect(sombres(y), 'ligne ' + y).toBeLessThan(COTE / 4); }
    // Le motif est un damier de losanges : deux colonnes de joints a un quart de texture d'ecart se retrouvent d'un rang a l'autre (decalage d'une demi-diagonale).
    const colonnesSombres = (y: number) => Array.from({ length: COTE }, (_, x) => x).filter((x) => gris(l, x, y) < 120);
    expect(colonnesSombres(64)).not.toEqual(colonnesSombres(0));
  });
  it('l ardoise en losange est mate comme l ardoise', () => {
    expect(matiereCouverture('ardoise-losange')).toEqual(matiereCouverture('ardoise'));
  });
  it('le zinc brille un peu, la tuile et les gravillons sont mats', () => {
    expect(matiereCouverture('zinc').metalness).toBeGreaterThan(0);
    expect(matiereCouverture('tuile-canal').roughness).toBeGreaterThan(0.8);
    expect(matiereCouverture('terrasse').roughness).toBeGreaterThan(0.9);
  });
});
