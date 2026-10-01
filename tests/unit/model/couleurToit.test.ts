import { describe, it, expect } from 'vitest';
import { couleurToitDepuisPixels, couvertureRepli, materiauCouverture, COULEURS_TOIT_REPLI, PIXELS_MIN } from '../../../src/model/couleurToit.js';

type Rgb = [number, number, number];
/** `n` pixels opaques de la couleur `c`, en RGBA a plat. */
const pixels = (c: Rgb, n: number): number[] => Array.from({ length: n }, () => [...c, 255]).flat();
/** Un leger grain, pour qu'une couverture uniforme ressemble a une photo. */
const grain = (c: Rgb, n: number): number[] =>
  Array.from({ length: n }, (_, i) => [c[0] + ((i * 7) % 11) - 5, c[1] + ((i * 5) % 9) - 4, c[2] + ((i * 3) % 7) - 3, 255]).flat();

describe('la couleur d une couverture lue sur l orthophoto (spec-toit-ign §6.1)', () => {
  it('retient la teinte d une couverture uniforme', () => {
    const r = couleurToitDepuisPixels(grain([150, 80, 60], 200));
    expect(r.origine).toBe('orthophoto');
    expect(r.couleur).toMatch(/^#[0-9A-F]{6}$/);
    const [rr, gg, bb] = [1, 3, 5].map((i) => parseInt(r.couleur.slice(i, i + 2), 16));
    expect(Math.abs(rr! - 150) + Math.abs(gg! - 80) + Math.abs(bb! - 60)).toBeLessThan(6);
  });

  it('ignore les pixels transparents, hors tuile', () => {
    const transparents = Array.from({ length: 500 }, () => [0, 0, 0, 0]).flat();
    expect(couleurToitDepuisPixels([...grain([90, 90, 95], 200), ...transparents]).origine).toBe('orthophoto');
  });

  it('se rabat sur la tuile rouge quand il n y a aucun pixel', () => {
    expect(couleurToitDepuisPixels([])).toEqual({ couleur: COULEURS_TOIT_REPLI.rouge, origine: 'rouge' });
  });

  it('se rabat sur une couverture de repli quand la photo est incoherente (deux pans, l un a l ombre)', () => {
    const r = couleurToitDepuisPixels([...pixels([170, 70, 50], 100), ...pixels([60, 30, 25], 100)]);
    expect(['rouge', 'brun', 'gris']).toContain(r.origine);
    expect(r.couleur).toBe(COULEURS_TOIT_REPLI[r.origine as 'rouge' | 'brun' | 'gris']);
  });

  it('se rabat quand des arbres couvrent le toit, sur la teinte de ce qui reste visible', () => {
    const r = couleurToitDepuisPixels([...pixels([175, 65, 45], 100), ...pixels([60, 110, 50], 60)]);
    expect(r).toEqual({ couleur: COULEURS_TOIT_REPLI.rouge, origine: 'rouge' });
  });

  it('se rabat quand il y a trop peu de pixels pour juger', () => {
    expect(couleurToitDepuisPixels(pixels([100, 100, 104], PIXELS_MIN - 1)).origine).toBe('gris');
  });

  it('se rabat sur une ombre ou un eblouissement', () => {
    expect(couleurToitDepuisPixels(pixels([25, 22, 24], 200)).origine).toBe('gris');
    expect(couleurToitDepuisPixels(pixels([250, 250, 250], 200)).origine).toBe('gris');
  });
});

describe('la couverture de repli', () => {
  it('rouge pour une terre cuite vive, brune pour une terre cuite sombre ou ocre, grise sinon', () => {
    expect(couvertureRepli([176, 67, 47])).toBe('rouge');
    expect(couvertureRepli([110, 75, 54])).toBe('brun');
    expect(couvertureRepli([160, 110, 60])).toBe('brun');
    expect(couvertureRepli([110, 112, 117])).toBe('gris');
    expect(couvertureRepli([60, 90, 140])).toBe('gris');
  });
});

describe('tuile ou ardoise en 3D (spec-toit-ign §6.2)', () => {
  it('ardoise pour le repli gris, tuile pour le rouge et le brun', () => {
    expect(materiauCouverture({ couleur: COULEURS_TOIT_REPLI.gris, origineCouleur: 'gris' })).toBe('ardoise');
    expect(materiauCouverture({ couleur: COULEURS_TOIT_REPLI.rouge, origineCouleur: 'rouge' })).toBe('tuile');
    expect(materiauCouverture({ couleur: COULEURS_TOIT_REPLI.brun, origineCouleur: 'brun' })).toBe('tuile');
  });

  it('classe une couleur lue ou choisie comme son repli ; sans couleur, la tuile rouge', () => {
    expect(materiauCouverture({ couleur: '#575D66', origineCouleur: 'orthophoto' })).toBe('ardoise');
    expect(materiauCouverture({ couleur: '#A3553E', origineCouleur: 'orthophoto' })).toBe('tuile');
    expect(materiauCouverture({ couleur: '#2E4A62' })).toBe('ardoise');
    expect(materiauCouverture({})).toBe('tuile');
    expect(materiauCouverture(null)).toBe('tuile');
  });
});
