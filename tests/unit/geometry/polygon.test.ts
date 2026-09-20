import { describe, it, expect } from 'vitest';
import { polygonOffset, offsetZone, clipLineToPolygon, clipPolygonByConvex, ringSegments, exteriorBisector } from '../../../src/geometry/polygon.js';
import { shoelace, pointInPolygon } from '../../../src/geometry/basic.js';
import { distancePointSegment } from '../../../src/geometry/segments.js';

const p = (x: number, y: number) => ({ x, y });
const carre = [p(0, 0), p(10, 0), p(10, 10), p(0, 10)];
const enL = [p(0, 0), p(6, 0), p(6, 2), p(2, 2), p(2, 6), p(0, 6)];

describe('polygonOffset', () => {
  it('retrecit un carre de la distance demandee sur chaque bord', () => {
    const petit = polygonOffset(carre, 1);
    expect(shoelace(petit)).toBeCloseTo(64, 9);
  });
  it('agrandit avec une distance negative', () => {
    expect(shoelace(polygonOffset(carre, -1))).toBeCloseTo(144, 9);
  });
  it('conserve les angles droits sur un rectangle (coins re-onglets)', () => {
    const r = polygonOffset(carre, 2);
    expect(r).toHaveLength(4);
    expect(r[0]!.x).toBeCloseTo(2, 9);
    expect(r[0]!.y).toBeCloseTo(2, 9);
  });
  it('ne depend pas du sens de parcours', () => {
    const direct = shoelace(polygonOffset(carre, 1));
    const inverse = shoelace(polygonOffset([...carre].reverse(), 1));
    expect(inverse).toBeCloseTo(direct, 9);
  });
});

describe('offsetZone', () => {
  // "30 cm autour de l'equipement" doit rester 30 cm partout : sur une pointe aigue, un onglet
  // etirerait la marge en dard. Les coins convexes sont donc arrondis.
  it('agrandit un carre de la somme de Minkowski avec un disque, aux arcs pres', () => {
    // Bords decales de la marge + quarts de disque aux quatre coins : 100 + perimetre*marge
    // + pi*marge^2. Les arcs etant approches par des cordes, l'aire obtenue est legerement
    // INFERIEURE a la valeur exacte (polygone inscrit) - ici de 0,007 %.
    const marge = 0.5;
    const exact = 100 + 40 * marge + Math.PI * marge * marge;
    const obtenue = shoelace(offsetZone(carre, marge));
    expect(obtenue).toBeLessThan(exact);
    expect(obtenue).toBeGreaterThan(exact * 0.999);
  });
  it('ne place aucun sommet a plus de la marge du contour d origine', () => {
    const marge = 0.5;
    const zone = offsetZone(carre, marge);
    for (const s of zone) {
      const d = Math.min(...carre.map((a, i) => distancePointSegment(s, a, carre[(i + 1) % carre.length]!)));
      expect(d).toBeLessThanOrEqual(marge + 1e-9);
    }
  });
  it('borne la pointe d un triangle tres aigu a la marge, pas au-dela', () => {
    const aigu = [p(0, 0), p(10, 0.4), p(10, -0.4)];
    const zone = offsetZone(aigu, 0.3);
    const debord = Math.max(...zone.map((s) => -s.x));
    expect(debord).toBeLessThanOrEqual(0.3 + 1e-9);
  });
  it('rend une copie quand la marge est nulle', () => {
    const zone = offsetZone(carre, 0);
    expect(zone).toEqual(carre);
    expect(zone[0]).not.toBe(carre[0]);
  });
});

describe('clipLineToPolygon', () => {
  it('rend un seul morceau dans un convexe', () => {
    const m = clipLineToPolygon(p(-5, 5), p(1, 0), carre);
    expect(m).toHaveLength(1);
    expect(m[0]!.a.x).toBeCloseTo(0, 9);
    expect(m[0]!.b.x).toBeCloseTo(10, 9);
  });
  it('coupe en deux morceaux de part et d autre du creux d un L', () => {
    // C'est le cas qui compte : ne garder que l'enveloppe ferait passer une lame en travers
    // de l'encoche, donc hors de la terrasse.
    const m = clipLineToPolygon(p(-1, 1), p(1, 0), enL);
    expect(m).toHaveLength(1);
    const vertical = clipLineToPolygon(p(1, -1), p(0, 1), enL);
    expect(vertical.length).toBeGreaterThanOrEqual(1);
    vertical.forEach((seg) => {
      const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
      expect(pointInPolygon(mid, enL)).toBe(true);
    });
  });
  it('rend une liste vide quand la droite manque le polygone', () => {
    expect(clipLineToPolygon(p(-5, 50), p(1, 0), carre)).toEqual([]);
  });
});

describe('clipPolygonByConvex', () => {
  it('rend l intersection de deux carres', () => {
    const autre = [p(5, 5), p(15, 5), p(15, 15), p(5, 15)];
    expect(shoelace(clipPolygonByConvex(carre, autre))).toBeCloseTo(25, 9);
  });
  it('rend le sujet entier quand il est contenu', () => {
    const grand = [p(-5, -5), p(15, -5), p(15, 15), p(-5, 15)];
    expect(shoelace(clipPolygonByConvex(carre, grand))).toBeCloseTo(100, 9);
  });
});

describe('ringSegments', () => {
  it('referme l anneau : autant de segments que de sommets', () => {
    const s = ringSegments(carre);
    expect(s).toHaveLength(4);
    expect(s[3]!.b).toEqual(carre[0]);
  });
});

describe('exteriorBisector', () => {
  it('pointe vers l exterieur du polygone', () => {
    const b = exteriorBisector({ pts: carre }, 0);
    const dehors = { x: carre[0]!.x + b.x * 0.1, y: carre[0]!.y + b.y * 0.1 };
    expect(pointInPolygon(dehors, carre)).toBe(false);
  });
  it('pointe encore vers l exterieur sur un sommet rentrant', () => {
    const b = exteriorBisector({ pts: enL }, 3);
    const dehors = { x: enL[3]!.x + b.x * 0.1, y: enL[3]!.y + b.y * 0.1 };
    expect(pointInPolygon(dehors, enL)).toBe(false);
  });
});
