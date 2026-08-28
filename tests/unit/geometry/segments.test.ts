import { describe, it, expect } from 'vitest';
import {
  projectOntoSegment, distancePointSegment, angleOfSegment,
  nearestSegmentIndex, lineSegIntersect, lineLineIntersect
} from '../../../src/geometry/segments.js';

const p = (x: number, y: number) => ({ x, y });

describe('projectOntoSegment', () => {
  it('projette au pied de la perpendiculaire', () => {
    expect(projectOntoSegment(p(5, 3), p(0, 0), p(10, 0))).toEqual({ x: 5, y: 0 });
  });
  it('borne le resultat a [0.02, 0.98] du segment, jamais sur un sommet', () => {
    // Le bornage evite qu'un point insere tombe exactement sur un coin existant, ce qui
    // creerait une arete de longueur nulle.
    expect(projectOntoSegment(p(-100, 0), p(0, 0), p(10, 0)).x).toBeCloseTo(0.2, 10);
    expect(projectOntoSegment(p(100, 0), p(0, 0), p(10, 0)).x).toBeCloseTo(9.8, 10);
  });
  it('ne divise pas par zero sur un segment degenere', () => {
    expect(Number.isFinite(projectOntoSegment(p(1, 1), p(2, 2), p(2, 2)).x)).toBe(true);
  });
});

describe('distancePointSegment', () => {
  it('mesure la perpendiculaire quand le pied tombe dans le segment', () => {
    expect(distancePointSegment(p(5, 4), p(0, 0), p(10, 0))).toBe(4);
  });
  it('mesure la distance au sommet quand le pied tombe dehors', () => {
    expect(distancePointSegment(p(-3, 4), p(0, 0), p(10, 0))).toBe(5);
  });
  it('traite un segment de longueur nulle comme un point', () => {
    expect(distancePointSegment(p(3, 4), p(0, 0), p(0, 0))).toBe(5);
  });
});

describe('angleOfSegment', () => {
  it('vaut zero vers l est et 90 degres vers le nord', () => {
    expect(angleOfSegment(p(0, 0), p(1, 0))).toBe(0);
    expect(angleOfSegment(p(0, 0), p(0, 1))).toBeCloseTo(Math.PI / 2, 12);
  });
});

describe('nearestSegmentIndex', () => {
  const carre = { type: 'polygon', pts: [p(0, 0), p(10, 0), p(10, 10), p(0, 10)] };
  it('trouve le cote dont le milieu est le plus proche', () => {
    expect(nearestSegmentIndex(carre, { a: p(0, -1), b: p(10, -1) })).toBe(0);
    expect(nearestSegmentIndex(carre, { a: p(11, 0), b: p(11, 10) })).toBe(1);
  });
  it('ne referme pas un chemin ouvert', () => {
    // Un `path` a n-1 cotes : le dernier point n'est pas relie au premier.
    const chemin = { type: 'path', pts: [p(0, 0), p(10, 0), p(10, 10)] };
    expect(nearestSegmentIndex(chemin, { a: p(0, 9), b: p(0, 1) })).toBeLessThan(2);
  });
});

describe('lineSegIntersect', () => {
  it('trouve le croisement d une demi-droite et d un segment', () => {
    const r = lineSegIntersect(p(0, 5), p(1, 0), p(4, 0), p(4, 10));
    expect(r?.point).toEqual({ x: 4, y: 5 });
    expect(r?.t).toBe(4);
  });
  it('rend null quand le segment est rate', () => {
    expect(lineSegIntersect(p(0, 50), p(1, 0), p(4, 0), p(4, 10))).toBeNull();
  });
  it('rend null sur des directions paralleles', () => {
    expect(lineSegIntersect(p(0, 5), p(1, 0), p(0, 0), p(10, 0))).toBeNull();
  });
});

describe('lineLineIntersect', () => {
  it('croise deux droites infinies, meme hors des segments', () => {
    expect(lineLineIntersect(p(0, 0), p(1, 0), p(5, -5), p(0, 1))).toEqual({ x: 5, y: 0 });
  });
  it('rend null sur des droites paralleles', () => {
    expect(lineLineIntersect(p(0, 0), p(1, 0), p(0, 3), p(1, 0))).toBeNull();
  });
});
