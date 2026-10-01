import { describe, it, expect } from 'vitest';
import { pixelsSousContour, versPixelMonde, couleurAResoudre, couleursToitsDepuisOrtho } from '../../../src/render/couleurToitOrtho.js';
import { projecteurLocal } from '../../../src/geo/projection.js';
import type { PtBrut, Toit } from '../../../src/model/types.js';

const proj = projecteurLocal(48.9, 2.13);
const p = (x: number, y: number): PtBrut => ({ x, y });
const maison = [p(0, 0), p(10, 0), p(10, 8), p(0, 8)];
const croupes: Toit = { forme: 'croupes', hauteur: 3, angleFaitage: 0, source: 'bdtopo' };

describe('la couleur des toits sur l orthophoto (spec-toit-ign §6.1)', () => {
  it('ne recalcule jamais une couleur choisie', () => {
    expect(couleurAResoudre(croupes)).toBe(true);
    expect(couleurAResoudre({ ...croupes, couleur: '#123456', origineCouleur: 'gris' })).toBe(true);
    expect(couleurAResoudre({ ...croupes, couleur: '#123456' })).toBe(false);
    expect(couleurAResoudre(null)).toBe(false);
  });

  it('ne garde que les pixels sous le contour, en retrait des murs', () => {
    const z = 19;
    // Une image de 80 x 80 pixels monde centree sur la maison : rouge dedans, vert dehors.
    const c = proj.versDegres(5, 4);
    const m = versPixelMonde(c.lon, c.lat, z);
    const largeur = 80, hauteur = 80, x0 = Math.floor(m.x) - 40, y0 = Math.floor(m.y) - 40;
    const data = new Uint8ClampedArray(largeur * hauteur * 4);
    for (let i = 0; i < largeur * hauteur; i++) data.set([0, 200, 0, 255], i * 4);
    const pris = pixelsSousContour({ data, largeur, hauteur, x0, y0, z }, maison, proj);
    // Environ (10 - 1,2) x (8 - 1,2) m a ~19 cm par pixel : quelques centaines de pixels.
    expect(pris.length / 4).toBeGreaterThan(800);
    expect(pris.length / 4).toBeLessThan(2400);
  });

  it('laisse le toit tel quel quand l orthophoto ne repond pas', async () => {
    const toit: Toit = { ...croupes };
    const bilan = await couleursToitsDepuisOrtho([{ pts: maison, toit }], proj, 1);
    expect(bilan).toEqual({ lus: 0, replis: 0 });
    expect(toit.couleur).toBeUndefined();
  });
});
