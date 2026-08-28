import { describe, it, expect } from 'vitest';
import { estRectangle, rectangleDepuisCoin, rectangleDepuisCote, RECT_MIN_M } from '../../../src/geometry/rect.js';
import { memePoint, fusionnerAnneaux, simplifierContour } from '../../../src/geometry/rings.js';
import { parseSvgPathPoints, pathD, polyStr } from '../../../src/geometry/path.js';
import { shoelace } from '../../../src/geometry/basic.js';

const p = (x: number, y: number) => ({ x, y });
const carre = [p(0, 0), p(10, 0), p(10, 10), p(0, 10)];

describe('estRectangle', () => {
  // Le mode rectangle se lit sur l'etat de gel des 4 coins : pas de drapeau separe, donc pas de
  // migration a prevoir pour les projets deja enregistres.
  it('reconnait quatre coins geles', () => {
    expect(estRectangle({ type: 'polygon', pts: carre, frozenVertices: [true, true, true, true] })).toBe(true);
  });
  it('refuse un coin non gele', () => {
    expect(estRectangle({ type: 'polygon', pts: carre, frozenVertices: [true, true, false, true] })).toBe(false);
  });
  it('refuse autre chose que quatre sommets', () => {
    expect(estRectangle({ type: 'polygon', pts: carre.slice(0, 3), frozenVertices: [true, true, true] })).toBe(false);
  });
  it('refuse null sans lever', () => {
    expect(estRectangle(null)).toBeFalsy();
  });
});

describe('rectangleDepuisCoin', () => {
  it('garde un rectangle rectangle quand on tire un coin', () => {
    const r = rectangleDepuisCoin(carre, 0, p(-2, -3));
    expect(r).toHaveLength(4);
    const cotes = r.map((a, i) => ({ x: r[(i + 1) % 4].x - a.x, y: r[(i + 1) % 4].y - a.y }));
    for (let i = 0; i < 4; i++) {
      const u = cotes[i], v = cotes[(i + 1) % 4];
      expect(u.x * v.x + u.y * v.y).toBeCloseTo(0, 9); // produit scalaire nul = angle droit
    }
  });
});

describe('rectangleDepuisCote', () => {
  it('refuse de degenerer le rectangle sous la cote minimale', () => {
    // Tirer le cote 0 vers le cote oppose de presque 10 m ne doit pas produire un rectangle plat.
    expect(rectangleDepuisCote(carre, 0, 1, carre[0], 0, 10 - RECT_MIN_M / 2)).toBeNull();
  });
  it('deplace le cote quand le rectangle reste valide', () => {
    const r = rectangleDepuisCote(carre, 0, 1, carre[0], 0, 3);
    expect(r).not.toBeNull();
    expect(shoelace(r)).toBeCloseTo(70, 9);
  });
});

describe('memePoint', () => {
  it('compare a la tolerance pres', () => {
    expect(memePoint(p(0, 0), p(0.004, 0), 0.005)).toBe(true);
    expect(memePoint(p(0, 0), p(0.006, 0), 0.005)).toBe(false);
  });
});

describe('fusionnerAnneaux', () => {
  it('fusionne deux carres mitoyens en un rectangle, et retient la limite interne', () => {
    // C'est le cas d'usage reel : deux parcelles voisines qui forment une seule propriete. Le
    // cote partage doit disparaitre du contour mais rester dessinable en pointille.
    const gauche = [p(0, 0), p(10, 0), p(10, 10), p(0, 10)];
    const droite = [p(10, 0), p(20, 0), p(20, 10), p(10, 10)];
    const r = fusionnerAnneaux([gauche, droite], 0.01);
    expect(r).not.toBeNull();
    expect(shoelace(r!.contour)).toBeCloseTo(200, 6);
    expect(r!.limites.length).toBeGreaterThanOrEqual(1);
  });
  it('rend l anneau seul tel quel', () => {
    const r = fusionnerAnneaux([carre], 0.01);
    expect(shoelace(r!.contour)).toBeCloseTo(100, 9);
    expect(r!.limites).toEqual([]);
  });
  it('rend null sur deux anneaux disjoints', () => {
    const loin = [p(100, 100), p(110, 100), p(110, 110), p(100, 110)];
    expect(fusionnerAnneaux([carre, loin], 0.01)).toBeNull();
  });
});

describe('simplifierContour', () => {
  it('retire les points parfaitement alignes', () => {
    const avecMilieu = [p(0, 0), p(5, 0), p(10, 0), p(10, 10), p(0, 10)];
    expect(simplifierContour(avecMilieu, 0.01)).toHaveLength(4);
  });
  it('ne descend jamais sous un triangle', () => {
    const alignes = [p(0, 0), p(5, 0), p(10, 0), p(15, 0), p(20, 0)];
    expect(simplifierContour(alignes, 0.01).length).toBeGreaterThanOrEqual(3);
  });
});

describe('parseSvgPathPoints', () => {
  it('lit les commandes absolues et referme sur Z', () => {
    const pts = parseSvgPathPoints('M 0,0 L 10,0 L 10,10 Z');
    expect(pts.slice(0, 3)).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    expect(pts[pts.length - 1]).toEqual({ x: 0, y: 0 });
  });
  it('lit les commandes relatives', () => {
    expect(parseSvgPathPoints('m 1,1 l 2,0 l 0,2')).toEqual([{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }]);
  });
  it('applique la repetition implicite : une lettre inconnue laisse la commande precedente active', () => {
    // Regle SVG : des paires de coordonnees qui suivent sans lettre rejouent la derniere commande.
    expect(parseSvgPathPoints('M 0,0 L 5,5 X 9,9')).toEqual([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 9, y: 9 }]);
  });
});

describe('trace a l ecran', () => {
  const scene = { scale: 10, origine: { x: 100, y: 200 }, W: 800, H: 600 };

  it('ecrit une polyligne en pixels, Y inverse', () => {
    // Le plan a Y+ vers le nord, l'ecran Y+ vers le bas : un point a 5 m au nord monte de 50 px.
    expect(polyStr(scene, [p(0, 0), p(1, 5)])).toBe('100,200 110,150');
  });

  it('ecrit un chemin droit quand le lissage est absent', () => {
    expect(pathD(scene, [p(0, 0), p(2, 0)])).toBe('M 100.0,200.0 L 120.0,200.0');
  });

  it('rend une chaine vide sous deux points', () => {
    expect(pathD(scene, [p(0, 0)])).toBe('');
  });

  it('passe en Bezier cubiques des qu on lisse trois points ou plus', () => {
    const d = pathD(scene, [p(0, 0), p(2, 2), p(4, 0)], true);
    expect(d.startsWith('M ')).toBe(true);
    expect((d.match(/C /g) || []).length).toBe(2);
  });

  it('ne lisse pas deux points, meme si on le demande', () => {
    expect(pathD(scene, [p(0, 0), p(2, 0)], true)).not.toContain('C ');
  });
});
