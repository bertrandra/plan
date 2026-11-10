// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { geometrieMesure, coordonneesCote, coordonneesPoint, ancrageHorsContour, distanceSortiePolygone, deniveleCote, texteDenivele, dessinerCotes } from '../../../src/render/measures.js';
import { pointInPolygon } from '../../../src/geometry/basic.js';

// Une terrasse carree de 10 m, et un point a coter.
const objets = [
  { key: 'parcelle', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
  { key: 'spa', type: 'circle', center: { x: 3, y: 4 } },
  { key: 'table', type: 'polygon', pts: [{ x: 4, y: 7 }, { x: 6, y: 7 }, { x: 6, y: 9 }] }
];

const mesure = (p: Partial<Parameters<typeof geometrieMesure>[1]> = {}) => ({
  id: 'm-test', refObjKey: 'parcelle', refSegIndex: 0, startEnd: 'A',
  targetObjKey: 'table', targetPtIndex: 0, ...p
}) as Parameters<typeof geometrieMesure>[1];

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

describe('le denivele d une cote avec un relief (MD/spec-relief.md §5.2)', () => {
  // Une grille plane z = 100 + 0,1·y sur 0..12 m : le sol monte de 10 cm par metre vers le nord.
  const grille = () => {
    const nx = 14, ny = 14, z: number[] = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z.push(Math.round((100 + 0.1 * (12.5 - j)) * 100) / 100);
    return { source: 'rge-alti' as const, couche: 'c', dateLecture: '2026-10-06', origine: 't', precision: 'p', systemeAltimetrique: 'NGF-IGN69', pas: 1, x0: -0.5, y0: 12.5, nx, ny, z, zRef: 100 };
  };
  const avecRelief = [{ ...objets[0], relief: grille() }, ...objets.slice(1)] as Parameters<typeof geometrieMesure>[0];

  it('est nul sans relief : rien ne change pour un plan plat', () => {
    const g = geometrieMesure(objets, mesure())!;
    expect(deniveleCote(objets, g, 'perp')).toBeNull();
    expect(deniveleCote(objets, g, 'along')).toBeNull();
  });

  it('mesure la hauteur du sol du pied de la perpendiculaire au point, et de l origine au pied', () => {
    const g = geometrieMesure(avecRelief, mesure())!;
    // Perpendiculaire : du pied (4, 0) au point (4, 7) : +0,70 m. Le long : de A (0, 0) au pied (4, 0) : 0.
    expect(deniveleCote(avecRelief, g, 'perp')).toBeCloseTo(0.7, 6);
    expect(deniveleCote(avecRelief, g, 'along')).toBeCloseTo(0, 6);
    expect(texteDenivele(0.7)).toBe('Δ +0,70 m');
    expect(texteDenivele(-1.234)).toBe('Δ −1,23 m');
  });

  it('rend null des qu un bout sort de la grille', () => {
    const loin = [...avecRelief, { key: 'loin', type: 'polygon', pts: [{ x: 4, y: 40 }] }];
    const g = geometrieMesure(loin, mesure({ targetObjKey: 'loin' }))!;
    expect(deniveleCote(loin, g, 'perp')).toBeNull();
  });

  it('ecrit le denivele sur l etiquette de la cote, et seulement avec un relief', () => {
    const dessiner = (objs: Parameters<typeof geometrieMesure>[0]) => {
      const groupe = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      dessinerCotes(groupe, { scene: { scale: 10, origine: { x: 0, y: 0 }, W: 400, H: 400 }, objets: objs, mesures: [{ ...mesure(), show: true, displayMode: 'perp' }], brouillonRef: null, brouillonCibles: [] });
      return groupe.querySelector('text')?.textContent;
    };
    expect(dessiner(objets)).toBe('⊥ 7,00 m');
    expect(dessiner(avecRelief)).toBe('⊥ 7,00 m · Δ +0,70 m');
  });
});
