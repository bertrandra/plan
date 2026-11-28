import { describe, it, expect } from 'vitest';
import { insererSommet, supprimerSommet, minimumSommets } from '../../../src/model/sommets.js';

// Ce qui compte ici n'est pas la geometrie mais la mise en phase des quatre tableaux : un splice
// oublie decale tous les noms suivants, et le plan affiche « Coin 3 » sur le quatrieme coin sans
// que rien ne signale l'erreur.

const carre = () => ({
  type: 'polygon',
  pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
  vertexNames: ['Coin 1', 'Coin 2', 'Coin 3', 'Coin 4'],
  segmentNames: ['Cote 1', 'Cote 2', 'Cote 3', 'Cote 4'],
  frozenVertices: [false, true, false, false]
});

const enPhase = (f: ReturnType<typeof carre>) =>
  f.vertexNames.length === f.pts.length &&
  f.segmentNames.length === f.pts.length &&
  f.frozenVertices.length === f.pts.length;

describe('minimumSommets', () => {
  it('laisse une aire a un polygone', () => {
    expect(minimumSommets('polygon')).toBe(3);
  });
  it('laisse une direction a un chemin ouvert', () => {
    expect(minimumSommets('path')).toBe(2);
  });
  it('traite toute forme non declaree comme un polygone', () => {
    expect(minimumSommets(undefined)).toBe(3);
  });
});

describe('insererSommet', () => {
  it('pose le point sur le cote, pas la ou on a clique', () => {
    // Un double-clic vise un trait : un sommet pose a cote deformerait la forme.
    const f = carre();
    const p = insererSommet(f, 0, { x: 4, y: 3 });
    expect(p).toEqual({ x: 4, y: 0 });
    expect(f.pts[1]).toEqual({ x: 4, y: 0 });
  });

  it('garde les quatre tableaux en phase', () => {
    const f = carre();
    insererSommet(f, 1, { x: 10, y: 5 });
    expect(f.pts).toHaveLength(5);
    expect(enPhase(f)).toBe(true);
  });

  it('n insere jamais un sommet deja gele', () => {
    const f = carre();
    insererSommet(f, 1, { x: 10, y: 5 });
    expect(f.frozenVertices[2]).toBe(false);
  });

  it('decale l etat gele des sommets suivants au lieu de le laisser sur place', () => {
    // Le sommet gele du carre est l'indice 1. En inserant avant lui, il devient l'indice 2.
    const f = carre();
    insererSommet(f, 0, { x: 4, y: 0 });
    expect(f.frozenVertices).toEqual([false, false, true, false, false]);
  });

  it('referme la boucle : le dernier cote relie le dernier point au premier', () => {
    const f = carre();
    const p = insererSommet(f, 3, { x: 0, y: 4 });
    expect(p).toEqual({ x: 0, y: 4 });
    expect(f.pts[4]).toEqual({ x: 0, y: 4 });
  });

  it('renumerote les noms par defaut d apres la place, et garde un nom saisi (audit UX de la 5.45.0, constat 8)', () => {
    // Jusqu'a la 5.45.0, le nom neuf suivait le total (« Coin 5 » au deuxieme rang) : les listes lisaient 1, 5, 2, 3, 4.
    const f = carre();
    f.segmentNames[2] = 'Rue';
    insererSommet(f, 0, { x: 3, y: 0 });
    insererSommet(f, 3, { x: 10, y: 5 });
    expect(f.vertexNames).toEqual(['Coin 1', 'Coin 2', 'Coin 3', 'Coin 4', 'Coin 5', 'Coin 6']);
    expect(f.segmentNames).toEqual(['Cote 1', 'Cote 2', 'Cote 3', 'Rue', 'Cote 5', 'Cote 6']);
    supprimerSommet(f, 1);
    expect(f.segmentNames).toEqual(['Cote 1', 'Cote 2', 'Rue', 'Cote 4', 'Cote 5']);
  });
});

describe('supprimerSommet', () => {
  it('retire le sommet et garde les tableaux en phase', () => {
    const f = carre();
    expect(supprimerSommet(f, 1)).toBe(true);
    expect(f.pts).toEqual([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
    expect(enPhase(f)).toBe(true);
    expect(f.frozenVertices).toEqual([false, false, false]);
  });

  it('refuse de reduire un polygone sous trois sommets, sans rien modifier', () => {
    const f = carre();
    supprimerSommet(f, 0);
    const avant = JSON.stringify(f);
    expect(supprimerSommet(f, 0)).toBe(false);
    expect(JSON.stringify(f)).toBe(avant);
  });

  it('laisse un chemin descendre a deux points', () => {
    const f = { ...carre(), type: 'path' };
    expect(supprimerSommet(f, 0)).toBe(true);
    expect(supprimerSommet(f, 0)).toBe(true);
    expect(f.pts).toHaveLength(2);
    expect(supprimerSommet(f, 0)).toBe(false);
  });

  it('retire le nom de fin quand on supprime le dernier sommet', () => {
    // Le dernier cote referme la boucle : il n'y a pas de nom a la position demandee.
    const f = carre();
    supprimerSommet(f, 3);
    expect(f.segmentNames).toEqual(['Cote 1', 'Cote 2', 'Cote 3']);
    expect(enPhase(f)).toBe(true);
  });
});

describe('le nom d un cote a l ecran (audit UX de la 5.45.0, constat 8)', () => {
  it('lit un nom par defaut d apres la place, garde un nom saisi', async () => {
    const { nomAfficheDuCote, nomAfficheDuCoin } = await import('../../../src/model/formes.js');
    // La terrasse de la demonstration : « Cote 1, 2, 5, 3, 6, 4 » enregistres, lus 1 a 6 dans l'ordre.
    expect(['Cote 1', 'Cote 2', 'Cote 5', 'Cote 3', 'Cote 6', 'Cote 4'].map(nomAfficheDuCote)).toEqual(['Côté 1', 'Côté 2', 'Côté 3', 'Côté 4', 'Côté 5', 'Côté 6']);
    expect(nomAfficheDuCote('Sud-Ouest (rue)', 0)).toBe('Sud-Ouest (rue)');
    expect(nomAfficheDuCote(undefined, 2)).toBe('Côté 3');
    expect(nomAfficheDuCoin('Coin 7', 2)).toBe('Coin 3');
    expect(nomAfficheDuCoin('Coin Nord', 2)).toBe('Coin Nord');
  });
});
