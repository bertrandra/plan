import { describe, it, expect } from 'vitest';
import { pixelsTextureMur, TAILLE_M } from '../../../src/three/textureMur.js';
import { uvDuMur } from '../../../src/three/toitCorps3d.js';
import { textureDesMurs } from '../../../src/model/couleurMur.js';

// Les textures des murs d'apres leur materiau (MD/spec-toit-ign.md §6.6) : en niveaux de clair, sans
// couture d'une tuile a l'autre, a l'echelle reelle, et posees en metres sur les murs hauts.

const MATERIAUX = ['brique', 'pierre', 'meuliere', 'beton', 'enduit', 'bois'] as const;
const N = 128;
const gris = (px: Uint8ClampedArray, x: number, y: number) => px[(y * N + x) * 4] as number;

describe('pixelsTextureMur', () => {
  for (const m of MATERIAUX) {
    it(m + ' : en gris, assez claire pour etre teintee, et sans couture sur ses bords', () => {
      const px = pixelsTextureMur(m, N);
      let somme = 0;
      for (let k = 0; k < N * N; k++) {
        expect(px[k * 4]).toBe(px[k * 4 + 1]);
        expect(px[k * 4 + 3]).toBe(255);
        somme += px[k * 4] as number;
      }
      const moyenne = somme / (N * N) / 255;
      expect(moyenne).toBeGreaterThan(0.6);
      expect(moyenne).toBeLessThan(0.97);
      // L'ecart entre le dernier et le premier pixel d'une ligne (le raccord) reste de l'ordre de
      // l'ecart entre deux pixels voisins quelconques.
      let raccord = 0, voisins = 0;
      for (let y = 0; y < N; y++) { raccord += Math.abs(gris(px, N - 1, y) - gris(px, 0, y)); voisins += Math.abs(gris(px, N / 2, y) - gris(px, N / 2 - 1, y)); }
      expect(raccord).toBeLessThan(voisins * 3 + 4 * N);
    });
  }

  it('des joints de mortier clairs entre les briques, un joint sombre entre les planches', () => {
    const brique = pixelsTextureMur('brique', 256);
    const ligne = (px: Uint8ClampedArray, y: number, c = 256) => Array.from({ length: c }, (_, x) => px[(y * c + x) * 4] as number);
    // Le bas de la texture est un joint d'assise : plus clair, en moyenne, qu'une ligne au milieu des briques.
    const moy = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    expect(moy(ligne(brique, 255))).toBeGreaterThan(moy(ligne(brique, 245)) + 10);
    const bois = pixelsTextureMur('bois', 256);
    expect(Math.min(...ligne(bois, 100))).toBeLessThan(120);
    expect(TAILLE_M.brique).toBe(1);
  });
});

describe('les murs et leur materiau', () => {
  it('la texture du materiau principal ; aucune avec la couleur du plan ou sans materiau connu', () => {
    expect(textureDesMurs({ bdtopo: { materiauxMurs: '24' } })).toBe('meuliere');
    expect(textureDesMurs({ bdtopo: { materiauxMurs: '40' }, batiment: { couleurMurs: { photo: { couleur: '#A0523B', id: 'p', date: null, auteur: null, licence: null } } } })).toBe('brique');
    expect(textureDesMurs({ bdtopo: { materiauxMurs: '40' }, batiment: { couleurMurs: { source: 'plan' } } })).toBeNull();
    expect(textureDesMurs({ bdtopo: { materiauxMurs: '90' } })).toBeNull();
    expect(textureDesMurs({})).toBeNull();
  });

  it('un mur haut recoit des coordonnees en metres : le long du mur, et la hauteur', () => {
    const uv = uvDuMur([{ x: 2, y: 1, z: 5 }, { x: 6, y: 4, z: 5 }, { x: 4, y: 2.5, z: 7 }]);
    expect(uv).toEqual([0, 5, 5, 5, 2.5, 7]);
  });
});
