import { describe, it, expect } from 'vitest';
import { sommetDe, indiceValide } from '../../../src/geometry/anneau.js';
import { editerAngle, editerLongueur } from '../../../src/interaction/editing.js';
import { rectangleDepuisCoin } from '../../../src/geometry/rect.js';
import { alignerSurCote } from '../../../src/geometry/alignement.js';

const carre = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];

describe('lire un sommet d un contour ferme (D-4)', () => {
  it('prend l indice modulo la longueur, negatifs compris', () => {
    expect(sommetDe(carre, 4)).toBe(carre[0]);
    expect(sommetDe(carre, -1)).toBe(carre[3]);
    expect(sommetDe(carre, 5)).toBe(carre[1]);
  });

  it('refuse un anneau vide ou un indice qui n est pas un entier', () => {
    expect(() => sommetDe([], 0)).toThrow(RangeError);
    expect(() => sommetDe(carre, NaN)).toThrow(RangeError);
    expect(() => sommetDe(carre, 1.5)).toThrow(RangeError);
  });

  it('borne un indice saisi sans modulo', () => {
    expect(indiceValide(carre, 3)).toBe(true);
    expect(indiceValide(carre, 4)).toBe(false);
    expect(indiceValide(carre, -1)).toBe(false);
  });

  it('un indice hors de la forme ne s edite pas, au lieu de lire undefined', () => {
    const obj = { pts: carre.map(p => ({ ...p })) };
    expect(editerAngle(obj, 7, 90, null)).toBe(false);
    expect(editerLongueur(obj, -2, 3, null)).toBe(false);
    expect(obj.pts).toEqual(carre);
  });

  it('un cote qui n existe pas laisse la forme telle quelle', () => {
    const cible = { a: { x: 0, y: 0 }, b: { x: 1, y: 1 } };
    expect(alignerSurCote(carre, 9, cible)).toEqual(carre);
  });

  it('un rectangle qui n a pas quatre coins n est pas redimensionne', () => {
    expect(rectangleDepuisCoin(carre.slice(0, 3), 0, { x: 5, y: 5 })).toBeNull();
    expect(rectangleDepuisCoin(carre, 2, { x: 3, y: 4 })).toEqual([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }, { x: 0, y: 4 }]);
  });
});
