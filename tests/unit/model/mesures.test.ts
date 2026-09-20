import { describe, it, expect } from 'vitest';
import { referencesDeCote } from '../../../src/model/mesures.js';

// Le juge unique des cotes lues d'un fichier (SVG comme JSON). Jusqu'au 20 septembre 2026, les
// deux imports ne verifiaient que l'existence des deux objets : ces tests figent ce que le rendu
// exige en plus, et que le validateur doit refuser.

const carre = { key: 'carre', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] };
const triangle = { key: 'tri', type: 'polygon', pts: [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }] };
const rond = { key: 'rond', type: 'circle', center: { x: 3, y: 3 }, r: 1 };
const objets = [carre, triangle, rond];

const valide = { refObjKey: 'carre', refSegIndex: 3, startEnd: 'B', targetObjKey: 'tri', targetPtIndex: 2 };

describe('referencesDeCote', () => {
  it('accepte une cote dont les deux indices tombent dans leurs polygones', () => {
    expect(referencesDeCote(valide, objets)).toEqual(valide);
  });

  it('refuse ce qui n est pas un objet, ou dont les cles ne sont pas des chaines', () => {
    expect(referencesDeCote(null, objets)).toBeNull();
    expect(referencesDeCote('cote', objets)).toBeNull();
    expect(referencesDeCote({ ...valide, refObjKey: 12 }, objets)).toBeNull();
    expect(referencesDeCote({ ...valide, targetObjKey: undefined }, objets)).toBeNull();
  });

  it('refuse une cote dont un des deux objets est absent', () => {
    expect(referencesDeCote({ ...valide, refObjKey: 'disparu' }, objets)).toBeNull();
    expect(referencesDeCote({ ...valide, targetObjKey: 'disparu' }, objets)).toBeNull();
  });

  it('refuse un indice de cote hors du polygone de reference, ou qui n est pas un entier positif', () => {
    expect(referencesDeCote({ ...valide, refSegIndex: 4 }, objets)).toBeNull();
    expect(referencesDeCote({ ...valide, refSegIndex: -1 }, objets)).toBeNull();
    expect(referencesDeCote({ ...valide, refSegIndex: 1.5 }, objets)).toBeNull();
    expect(referencesDeCote({ ...valide, refSegIndex: '2' }, objets)).toBeNull();
    expect(referencesDeCote({ ...valide, refSegIndex: undefined }, objets)).toBeNull();
  });

  it('refuse un cercle comme reference : il n a pas de cote', () => {
    expect(referencesDeCote({ ...valide, refObjKey: 'rond', refSegIndex: 0 }, objets)).toBeNull();
  });

  it('refuse un indice de sommet hors du polygone cible', () => {
    expect(referencesDeCote({ ...valide, targetPtIndex: 3 }, objets)).toBeNull();
    expect(referencesDeCote({ ...valide, targetPtIndex: undefined }, objets)).toBeNull();
  });

  it('accepte un cercle comme cible avec n importe quel indice entier : le point cote est son centre', () => {
    expect(referencesDeCote({ ...valide, targetObjKey: 'rond', targetPtIndex: 7 }, objets)).toEqual({ ...valide, targetObjKey: 'rond', targetPtIndex: 7 });
    expect(referencesDeCote({ ...valide, targetObjKey: 'rond', targetPtIndex: -1 }, objets)).toBeNull();
  });

  it('normalise startEnd : B reste B, tout le reste devient A, comme le rendu le lit', () => {
    expect(referencesDeCote({ ...valide, startEnd: 'A' }, objets)!.startEnd).toBe('A');
    expect(referencesDeCote({ ...valide, startEnd: 'B' }, objets)!.startEnd).toBe('B');
    expect(referencesDeCote({ ...valide, startEnd: 'fin' }, objets)!.startEnd).toBe('A');
    expect(referencesDeCote({ ...valide, startEnd: undefined }, objets)!.startEnd).toBe('A');
  });

  it('ne recopie que les cinq references, pas le reste du brut', () => {
    const refs = referencesDeCote({ ...valide, id: 'm1', show: true, autre: 42 }, objets);
    expect(Object.keys(refs!).sort()).toEqual(['refObjKey', 'refSegIndex', 'startEnd', 'targetObjKey', 'targetPtIndex']);
  });
});
