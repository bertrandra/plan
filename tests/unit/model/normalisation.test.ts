import { describe, it, expect } from 'vitest';
import { normalizeObjects } from '../../../src/model/normalisation.js';

// Deux dangers, et un seul module pour les tenir : le partage de reference (un instantane
// d'annulation qui bouge quand le plan bouge) et les tableaux incomplets (que le reste du programme
// indexe sans verifier).

describe('clonage', () => {
  it('ne partage aucun point avec la source', () => {
    const src = [{ type: 'polygon', pts: [{ x: 1, y: 2 }] }];
    const out = normalizeObjects(src);
    out[0].pts[0].x = 99;
    expect(src[0].pts[0].x).toBe(1);
  });

  it('ne partage pas non plus le centre d un cercle', () => {
    const src = [{ type: 'circle', center: { x: 3, y: 4 }, r: 1 }];
    const out = normalizeObjects(src);
    out[0].center.y = 99;
    expect(src[0].center.y).toBe(4);
  });

  it('clone la construction en profondeur', () => {
    const src = [{ type: 'polygon', pts: [], construction: { bom: [{ ref: 'a' }] } }];
    const out = normalizeObjects(src);
    out[0].construction.bom[0].ref = 'b';
    expect(src[0].construction.bom[0].ref).toBe('a');
  });

  it('clone les metadonnees, geometrie WGS84 comprise', () => {
    // C'est ce clonage qui empeche un instantane d'annulation de trainer la geometrie source d'un
    // import cadastre et de la voir bouger avec l'objet vivant.
    const src = [{ type: 'polygon', pts: [],
      cadastre: { geom: { coordinates: [[1, 2]] } }, bdtopo: { h: 3 }, plu: { zone: 'UB' },
      ortho: { url: 'x' }, affichage: { grille: true } }];
    const out = normalizeObjects(src);
    out[0].cadastre.geom.coordinates[0][0] = 99;
    out[0].bdtopo.h = 99; out[0].plu.zone = 'AU'; out[0].ortho.url = 'y'; out[0].affichage.grille = false;
    expect(src[0].cadastre.geom.coordinates[0][0]).toBe(1);
    expect(src[0].bdtopo.h).toBe(3);
    expect(src[0].plu.zone).toBe('UB');
    expect(src[0].ortho.url).toBe('x');
    expect(src[0].affichage.grille).toBe(true);
  });

  it('laisse tranquille ce qui est absent', () => {
    const out = normalizeObjects([{ type: 'polygon', pts: [] }]);
    expect('construction' in out[0]).toBe(false);
    expect('cadastre' in out[0]).toBe(false);
  });

  it('recopie les champs simples tels quels', () => {
    const out = normalizeObjects([{ key: 'k', type: 'polygon', pts: [], name: 'Abri', priority: 2 }]);
    expect(out[0].key).toBe('k');
    expect(out[0].name).toBe('Abri');
    expect(out[0].priority).toBe(2);
  });
});

describe('completion des tableaux', () => {
  it('nomme les points et les cotes quand la source ne le fait pas', () => {
    const out = normalizeObjects([{ type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }]);
    expect(out[0].vertexNames).toEqual(['Point 1', 'Point 2', 'Point 3']);
    expect(out[0].segmentNames).toEqual(['Cote 1', 'Cote 2', 'Cote 3']);
  });

  it('garde les noms fournis, sans les partager', () => {
    const src = [{ type: 'polygon', pts: [{ x: 0, y: 0 }], vertexNames: ['Apex'], segmentNames: ['Nord'] }];
    const out = normalizeObjects(src);
    out[0].vertexNames[0] = 'Autre';
    expect(src[0].vertexNames[0]).toBe('Apex');
  });

  it('degele tout quand la source ne dit rien', () => {
    const out = normalizeObjects([{ type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }]);
    expect(out[0].frozenVertices).toEqual([false, false]);
  });

  it('refuse un tableau de gel qui n a pas la bonne longueur', () => {
    // Un sommet ajoute sans que frozenVertices suive donnerait sinon `undefined` a la question
    // « es-tu gele ? » sur les sommets en trop.
    const out = normalizeObjects([{ type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], frozenVertices: [true, true] }]);
    expect(out[0].frozenVertices).toEqual([false, false, false]);
  });

  it('garde un tableau de gel de la bonne longueur', () => {
    const out = normalizeObjects([{ type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }], frozenVertices: [true, false] }]);
    expect(out[0].frozenVertices).toEqual([true, false]);
  });

  it('ne pose aucun tableau sur un cercle, qui n a pas de sommets', () => {
    const out = normalizeObjects([{ type: 'circle', center: { x: 0, y: 0 }, r: 1 }]);
    expect(out[0].vertexNames).toBeUndefined();
    expect(out[0].frozenVertices).toBeUndefined();
  });

  it('traite un chemin comme un objet a points', () => {
    const out = normalizeObjects([{ type: 'path', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }]);
    expect(out[0].vertexNames).toEqual(['Point 1', 'Point 2']);
  });
});
