import { describe, it, expect } from 'vitest';
import { CHAINE, construireArbre, duGenre, repartitionDesModes, verifierChaine, type NoeudChaine } from '../../../src/model/chaine.js';
import { EXEMPLES_TOITS } from '../../../src/three/catalogueToits.js';

// La chaine de l'IGN a ma maison, a plat : une liste de noeuds dont l'arbre se deduit.

const n = (id: string, parent: string | null, plus: Partial<NoeudChaine> = {}): NoeudChaine => ({ id, parent, genre: 'objet', titre: id, ...plus });

describe('la liste de la chaine', () => {
  it('fait un arbre : identifiants uniques, parents connus, pas de cycle, ecrans en « ? »', () => {
    expect(verifierChaine()).toEqual([]);
  });
  it('dit ce qui casserait l arbre', () => {
    expect(verifierChaine([n('a', null), n('a', null)])).toEqual(['identifiant repete : a']);
    expect(verifierChaine([n('a', 'x')])).toEqual(['a : parent inconnu (x)']);
    expect(verifierChaine([n('a', null, { voir: 'z' })])).toEqual(['a : renvoi inconnu (z)']);
    expect(verifierChaine([n('a', null, { ecran: 'regles' })])[0]).toMatch(/commence par « \? »/);
    expect(verifierChaine([n('a', 'b'), n('b', 'a')]).some((e) => e.startsWith('cycle'))).toBe(true);
  });
  it('se lit de l IGN a la maison : sept etapes, dans l ordre', () => {
    expect(construireArbre().map((a) => a.noeud.id)).toEqual(['sources', 'objet', 'toit', 'objets3d', 'textures', 'decision', 'audit']);
  });
  it('deplacer une branche ne change qu un parent', () => {
    const liste = [n('r', null), n('a', 'r'), n('b', 'r'), n('c', 'a')];
    const deplace = liste.map((x) => (x.id === 'c' ? { ...x, parent: 'b' } : x));
    expect(construireArbre(deplace)[0]?.enfants.map((e) => e.enfants.map((f) => f.noeud.id))).toEqual([[], ['c']]);
  });
  it('compte les modes et filtre par genre sans recursion', () => {
    const m = repartitionDesModes();
    expect(m.auto).toBeGreaterThan(0); expect(m.manuel).toBeGreaterThan(0); expect(m.mixte).toBeGreaterThan(0);
    expect(duGenre('source').length).toBe(7);
  });
  it('chaque objet 3D écrit renvoie vers un exemple du catalogue (ceux que la liste n’écrit pas viennent des données)', () => {
    const formes = duGenre('objet3d').map((x) => x.forme);
    expect(formes.every((f) => EXEMPLES_TOITS.some((e) => e.id === f))).toBe(true);
  });
  it('les ecrans cites sont des ecrans qui existent', () => {
    const connus = ['?admin&ecran=regles', '?admin&ecran=arbres', '?admin&ecran=conformite', '?palette'];
    expect(CHAINE.filter((x) => x.ecran).every((x) => connus.includes(x.ecran as string))).toBe(true);
  });
});
