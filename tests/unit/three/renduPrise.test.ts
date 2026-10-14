import { describe, it, expect } from 'vitest';
import { champVertical, ciblePrise, HAUTEUR_PRISE_M, rendreDepuisPrise } from '../../../src/three/renduPrise.js';

// Le rendu du modele depuis une prise de vue (MD/spec-regles-toits.md §14.1) : la camera posee la ou le
// telephone etait, dans son axe ; sans Vue 3D ouverte, pas d'image.

describe('le rendu depuis une prise de vue', () => {
  it('convertit le champ horizontal de l objectif en champ vertical de la camera', () => {
    // Un 4:3 a 66 degres de large : 2 x atan(tan(33) x 0,75) = 51,9 degres de haut.
    expect(champVertical(66, 1024, 768)).toBeCloseTo(51.96, 1);
    expect(champVertical(90, 100, 100)).toBeCloseTo(90, 6);
  });

  it('vise devant la prise : vers le nord, l est, le sud, et au-dessus de l horizon', () => {
    const l = { x: 0, z: 0 };
    expect(ciblePrise({ x: 0, y: 0, azimutDeg: 0 }, l)).toEqual({ x: 0, y: HAUTEUR_PRISE_M, z: -10 });
    const est = ciblePrise({ x: 0, y: 0, azimutDeg: 90 }, l);
    expect(est.x).toBeCloseTo(10, 6);
    expect(est.z).toBeCloseTo(0, 6);
    const sud = ciblePrise({ x: 0, y: 0, azimutDeg: 180 }, l);
    expect(sud.z).toBeCloseTo(10, 6);
    const haut = ciblePrise({ x: 0, y: 0, azimutDeg: 0, inclinaisonDeg: 30 }, l);
    expect(haut.y).toBeCloseTo(HAUTEUR_PRISE_M + 5, 6);
    expect(haut.z).toBeCloseTo(-10 * Math.cos(Math.PI / 6), 6);
  });

  it('ne rend rien sans Vue 3D ouverte', () => {
    expect(rendreDepuisPrise({ x: 0, y: 0, azimutDeg: 0 })).toBe(null);
  });
});
