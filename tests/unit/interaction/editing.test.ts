import { describe, it, expect } from 'vitest';
import { editerAngle, editerLongueur, contourDeContrainte } from '../../../src/interaction/editing.js';

const carre = () => [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
const parcelle = { key: 'parcelle', pts: [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 50, y: 50 }, { x: -50, y: 50 }] };
const longueur = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y);

describe('contourDeContrainte', () => {
  it('rend la parcelle pour un objet contraint', () => {
    expect(contourDeContrainte([parcelle], { pts: carre(), constrained: true })).toBe(parcelle.pts);
  });
  it('rend null pour un objet libre', () => {
    expect(contourDeContrainte([parcelle], { pts: carre(), constrained: false })).toBeNull();
  });
  it('rend null quand il n y a pas de parcelle', () => {
    expect(contourDeContrainte([], { pts: carre(), constrained: true })).toBeNull();
  });
});

describe('editerLongueur', () => {
  it('allonge le cote en deplacant son extremite libre', () => {
    const obj = { pts: carre() };
    expect(editerLongueur(obj, 0, 15, null)).toBe(true);
    expect(obj.pts[1]).toEqual({ x: 15, y: 0 });
    expect(obj.pts[0]).toEqual({ x: 0, y: 0 });
  });

  it('deplace l autre extremite quand la seconde est gelee', () => {
    // Le cote garde sa direction et atteint la longueur voulue, sans toucher au sommet verrouille.
    const obj = { pts: carre(), frozenVertices: [false, true, false, false] };
    expect(editerLongueur(obj, 0, 4, null)).toBe(true);
    expect(obj.pts[1]).toEqual({ x: 10, y: 0 });
    expect(obj.pts[0]).toEqual({ x: 6, y: 0 });
  });

  it('refuse quand les deux extremites sont gelees', () => {
    const obj = { pts: carre(), frozenVertices: [true, true, false, false] };
    const avant = JSON.stringify(obj.pts);
    expect(editerLongueur(obj, 0, 4, null)).toBe(false);
    expect(JSON.stringify(obj.pts)).toBe(avant);
  });

  it('refuse de sortir du contour, sans tronquer la valeur', () => {
    // Tronquer produirait une forme fausse sans le dire : mieux vaut refuser.
    const obj = { pts: carre(), constrained: true };
    const avant = JSON.stringify(obj.pts);
    expect(editerLongueur(obj, 0, 500, parcelle.pts)).toBe(false);
    expect(JSON.stringify(obj.pts)).toBe(avant);
  });

  it('ne divise pas par zero sur un cote de longueur nulle', () => {
    const obj = { pts: [{ x: 3, y: 3 }, { x: 3, y: 3 }, { x: 6, y: 6 }] };
    expect(() => editerLongueur(obj, 0, 5, null)).not.toThrow();
  });
});

describe('editerAngle', () => {
  it('impose l angle interieur en pivotant le sommet suivant', () => {
    const obj = { pts: carre() };
    const avantL = longueur(obj.pts[1], obj.pts[2]);
    expect(editerAngle(obj, 1, 45, null)).toBe(true);
    // La longueur du cote pivote est conservee : on change l'angle, pas la dimension.
    expect(longueur(obj.pts[1], obj.pts[2])).toBeCloseTo(avantL, 9);
  });

  it('tient compte du sens de parcours', () => {
    // Le meme angle demande fait tourner dans l'autre sens sur un polygone horaire : c'est
    // l'aire signee qui le decide, pas un sondage des voisins.
    const direct = { pts: carre() };
    const inverse = { pts: carre().reverse() };
    editerAngle(direct, 1, 60, null);
    editerAngle(inverse, 1, 60, null);
    expect(direct.pts[2]).not.toEqual(inverse.pts[2]);
  });

  it('refuse de bouger un sommet gele', () => {
    const obj = { pts: carre(), frozenVertices: [false, false, true, false] };
    const avant = JSON.stringify(obj.pts);
    expect(editerAngle(obj, 1, 45, null)).toBe(false);
    expect(JSON.stringify(obj.pts)).toBe(avant);
  });

  it('refuse de sortir du contour', () => {
    const petit = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const obj = { pts: carre(), constrained: true };
    expect(editerAngle(obj, 1, 170, petit)).toBe(false);
  });
});
