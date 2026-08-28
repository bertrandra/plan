import { describe, it, expect } from 'vitest';
import { geometrieMesure, coordonneesCote, coordonneesPoint, ancrageHorsContour, distanceSortiePolygone } from '../../../src/render/measures.js';
import { pointInPolygon } from '../../../src/geometry/basic.js';

// Une terrasse carree de 10 m, et un point a coter.
const objets = [
  { key: 'parcelle', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
  { key: 'spa', type: 'circle', center: { x: 3, y: 4 } },
  { key: 'table', type: 'polygon', pts: [{ x: 4, y: 7 }, { x: 6, y: 7 }, { x: 6, y: 9 }] }
];

const mesure = (p: Partial<Parameters<typeof geometrieMesure>[1]> = {}) => ({
  refObjKey: 'parcelle', refSegIndex: 0, startEnd: 'A',
  targetObjKey: 'table', targetPtIndex: 0, ...p
});

describe('coordonneesCote', () => {
  it('rend les deux extremites du cote demande', () => {
    expect(coordonneesCote(objets, { objKey: 'parcelle', segIndex: 0 })).toEqual({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } });
  });
  it('referme le polygone sur le dernier cote', () => {
    expect(coordonneesCote(objets, { objKey: 'parcelle', segIndex: 3 })).toEqual({ a: { x: 0, y: 10 }, b: { x: 0, y: 0 } });
  });
  it('rend null sur un objet disparu', () => {
    expect(coordonneesCote(objets, { objKey: 'efface', segIndex: 0 })).toBeNull();
  });
});

describe('coordonneesPoint', () => {
  it('rend le sommet demande', () => {
    expect(coordonneesPoint(objets, { objKey: 'table', ptIndex: 1 })).toEqual({ x: 6, y: 7 });
  });
  it('rend le centre pour un cercle, quel que soit l indice', () => {
    expect(coordonneesPoint(objets, { objKey: 'spa', ptIndex: 3 })).toEqual({ x: 3, y: 4 });
  });
});

describe('geometrieMesure', () => {
  it('mesure la perpendiculaire et la distance le long du cote', () => {
    const g = geometrieMesure(objets, mesure())!;
    expect(g.along).toBeCloseTo(4, 12);
    expect(g.perp).toBeCloseTo(7, 12);
    expect(g.foot).toEqual({ x: 4, y: 0 });
  });

  it('change d origine avec startEnd, ce qui change la distance le long', () => {
    // Coter « a 4 m du coin ouest » ou « a 6 m du coin est » decrit le meme point.
    const depuisA = geometrieMesure(objets, mesure({ startEnd: 'A' }))!;
    const depuisB = geometrieMesure(objets, mesure({ startEnd: 'B' }))!;
    expect(depuisA.along + depuisB.along).toBeCloseTo(10, 12);
    expect(depuisB.perp).toBeCloseTo(depuisA.perp, 12);
  });

  it('cote aussi le centre d un cercle', () => {
    const g = geometrieMesure(objets, mesure({ targetObjKey: 'spa' }))!;
    expect(g.along).toBeCloseTo(3, 12);
    expect(g.perp).toBeCloseTo(4, 12);
  });

  it('rend null quand la cible a ete supprimee, au lieu d echouer', () => {
    // Une cote survit a la suppression de son objet : le rendu doit l'ignorer, pas planter.
    expect(geometrieMesure(objets, mesure({ targetObjKey: 'disparu' }))).toBeNull();
    expect(geometrieMesure(objets, mesure({ refObjKey: 'disparu' }))).toBeNull();
  });

  it('ne divise pas par zero sur un cote degenere', () => {
    const plat = [{ key: 'plat', type: 'polygon', pts: [{ x: 5, y: 5 }, { x: 5, y: 5 }] }, ...objets];
    const g = geometrieMesure(plat, mesure({ refObjKey: 'plat', refSegIndex: 0 }))!;
    expect(Number.isFinite(g.perp)).toBe(true);
    expect(Number.isFinite(g.along)).toBe(true);
  });
});

describe('ancrage des etiquettes de cote', () => {
  const parcelle = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];

  it('mesure la distance de sortie du contour', () => {
    expect(distanceSortiePolygone({ x: 10, y: 10 }, { x: 1, y: 0 }, parcelle)).toBeCloseTo(10, 9);
    expect(distanceSortiePolygone({ x: 10, y: 10 }, { x: 0, y: 1 }, parcelle)).toBeCloseTo(10, 9);
  });

  it('prend la DERNIERE sortie quand le rayon ressort puis rentre', () => {
    // Un C couche : deux bandes pleines reliees a droite. Un rayon vertical en x = 5 traverse la
    // bande basse (y 0-2), le vide (2-5), puis la bande haute (5-7). L'etiquette doit se poser
    // au-dela de la DERNIERE sortie, sinon elle atterrit dans le vide entre les deux bandes.
    const enC = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 7 }, { x: 0, y: 7 },
      { x: 0, y: 5 }, { x: 8, y: 5 }, { x: 8, y: 2 }, { x: 0, y: 2 }
    ];
    expect(distanceSortiePolygone({ x: 5, y: 1 }, { x: 0, y: 1 }, enC)).toBeCloseTo(6, 9);
  });

  it('pose l etiquette hors du contour, du cote oppose au centre', () => {
    // Point sur le bord sud, cote de reference horizontal : l'etiquette part vers le sud.
    const a = ancrageHorsContour({ x: 10, y: 0 }, parcelle, 2, { x: 1, y: 0 });
    expect(a.y).toBeLessThan(0);
    expect(pointInPolygon(a, parcelle)).toBe(false);
  });

  it('laisse exactement le degagement demande au-dela du contour', () => {
    const a = ancrageHorsContour({ x: 10, y: 10 }, parcelle, 2, { x: 1, y: 0 });
    // Depuis le centre, la sortie est a 10 m ; l'etiquette se pose a 12 m.
    expect(Math.abs(a.y - 10)).toBeCloseTo(12, 9);
  });

  it('rend aussi la direction suivie, pour orienter le trait de rappel', () => {
    const a = ancrageHorsContour({ x: 10, y: 0 }, parcelle, 2, { x: 1, y: 0 });
    expect(Math.hypot(a.dirX, a.dirY)).toBeCloseTo(1, 9);
  });
});
