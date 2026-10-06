import { describe, it, expect } from 'vitest';
import { dist, shoelace, signedArea, centroid, pointInPolygon } from '../../../src/geometry/basic.js';

const p = (x: number, y: number) => ({ x, y });
const carre = [p(0, 0), p(10, 0), p(10, 10), p(0, 10)];

describe('dist', () => {
  it('mesure l hypotenuse du triangle 3-4-5', () => {
    expect(dist(p(0, 0), p(3, 4))).toBe(5);
  });
  it('vaut zero sur un point confondu', () => {
    expect(dist(p(2.5, -7), p(2.5, -7))).toBe(0);
  });
});

describe('shoelace', () => {
  it('donne l aire d un carre de 10 m', () => {
    expect(shoelace(carre)).toBe(100);
  });
  it('ignore le sens de parcours', () => {
    expect(shoelace([...carre].reverse())).toBe(100);
  });
  it('rend zero sur des points alignes', () => {
    expect(shoelace([p(0, 0), p(5, 5), p(10, 10)])).toBe(0);
  });
  it('gere un polygone concave (L de 3 x 3 moins 1)', () => {
    const enL = [p(0, 0), p(3, 0), p(3, 1), p(1, 1), p(1, 3), p(0, 3)];
    expect(shoelace(enL)).toBe(5);
  });
});

describe('signedArea', () => {
  // C'est le signe qui donne le sens de parcours, donc la normale sortante d'un cote : une cote
  // de PDF placee du mauvais cote vient toujours d'un signe pris a l'envers.
  it('est positive dans le sens trigonometrique', () => {
    expect(signedArea(carre)).toBe(100);
  });
  it('est negative dans le sens horaire', () => {
    expect(signedArea([...carre].reverse())).toBe(-100);
  });
  it('garde la meme valeur absolue que shoelace', () => {
    const enL = [p(0, 0), p(3, 0), p(3, 1), p(1, 1), p(1, 3), p(0, 3)];
    expect(Math.abs(signedArea(enL))).toBe(shoelace(enL));
  });
});

describe('centroid', () => {
  it('est le barycentre des sommets, pas le centre de masse', () => {
    // Sur ce triangle, le barycentre des sommets vaut (1, 1) ; un centre de masse pondere par
    // l'aire donnerait autre chose. La distinction compte : plusieurs appelants s'en servent
    // comme point d'ancrage d'etiquette.
    expect(centroid([p(0, 0), p(3, 0), p(0, 3)])).toEqual({ x: 1, y: 1 });
  });
  it('centre un carre', () => {
    expect(centroid(carre)).toEqual({ x: 5, y: 5 });
  });
});

describe('pointInPolygon', () => {
  it('accepte un point interieur', () => {
    expect(pointInPolygon(p(5, 5), carre)).toBe(true);
  });
  it('refuse un point exterieur', () => {
    expect(pointInPolygon(p(15, 5), carre)).toBe(false);
  });
  it('refuse un point exterieur aligne avec un cote', () => {
    expect(pointInPolygon(p(-1, 0), carre)).toBe(false);
  });
  it('distingue le creux d un polygone concave', () => {
    const enL = [p(0, 0), p(3, 0), p(3, 1), p(1, 1), p(1, 3), p(0, 3)];
    expect(pointInPolygon(p(0.5, 2), enL)).toBe(true);
    expect(pointInPolygon(p(2, 2), enL)).toBe(false);
  });
});

describe('centreDeSurface', () => {
  it('donne le centre de gravite, pas le barycentre des sommets', async () => {
    const { centreDeSurface, centroid } = await import('../../../src/geometry/basic.js');
    // Un carre dont un cote porte des sommets en plus : le barycentre glisse, pas le centre de surface.
    const carre = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
    expect(centreDeSurface(carre)).toEqual({ x: 2, y: 2 });
    expect(centroid(carre).y).toBeLessThan(2);
    // Sens de parcours indifferent ; un polygone degenere retombe sur le barycentre.
    expect(centreDeSurface([...carre].reverse())).toEqual({ x: 2, y: 2 });
    expect(centreDeSurface([{ x: 0, y: 0 }, { x: 2, y: 0 }])).toEqual({ x: 1, y: 0 });
  });
});
