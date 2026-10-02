import { describe, it, expect } from 'vitest';
import { aplatir, type Noeud } from '../../../src/app/controleurs.js';
import { ancetres, filtrer, ouvrablesSous, profondeurMax } from '../../../src/zones/navigationArbre.js';

// La navigation dans l'arbre des controleurs : niveaux, filtres, branches.

const arbre: Noeud = { cle: 'plan', nom: 'Plan', genre: 'racine', enfants: [
  { cle: 'commandes', nom: 'Registre', genre: 'branche', enfants: [
    { cle: 'projet', nom: 'Projet', genre: 'groupe', enfants: [
      { cle: 'projet.enregistrer', nom: 'Enregistrer', genre: 'commande' },
      { cle: 'projet.nouveau', nom: 'Nouveau projet', genre: 'commande' }
    ] }
  ] },
  { cle: 'inspecteur', nom: 'Inspecteur', genre: 'branche', enfants: [
    { cle: 'lames', nom: 'Lames', genre: 'section', enfants: [{ cle: 'essence', nom: 'Essence', genre: 'champ', enfants: [{ cle: 'ipe', nom: 'Ipé', genre: 'option' }] }] }
  ] }
] };
const tous = aplatir(arbre);

describe('navigation dans l arbre', () => {
  it('ancetres et profondeur', () => {
    expect(ancetres('plan/commandes/projet')).toEqual(['plan', 'plan/commandes', 'plan/commandes/projet']);
    expect(profondeurMax(tous)).toBe(5);
  });

  it('deplier jusqu a un niveau ouvre les noeuds des niveaux au-dessus', () => {
    expect(ouvrablesSous(tous, 'plan', 2).sort()).toEqual(['plan']);
    expect(ouvrablesSous(tous, 'plan', 3).sort()).toEqual(['plan', 'plan/commandes', 'plan/inspecteur']);
    expect(ouvrablesSous(tous, 'plan/inspecteur').sort()).toEqual(['plan/inspecteur', 'plan/inspecteur/lames', 'plan/inspecteur/lames/essence']);
  });

  it('sans filtre : rien a garder', () => {
    expect(filtrer(tous, undefined, { texte: '', genre: '', changementsSeuls: false })).toBe(null);
  });

  it('filtre par texte (cle ou nom) et par genre, dans l ordre de l arbre, ancetres gardes', () => {
    const r = filtrer(tous, undefined, { texte: 'nouv', genre: '', changementsSeuls: false });
    expect(r?.trouves).toEqual(['plan/commandes/projet/projet.nouveau']);
    expect(r?.garde.has('plan/commandes/projet')).toBe(true);
    expect(r?.garde.has('plan/inspecteur')).toBe(false);
    expect(filtrer(tous, undefined, { texte: '', genre: 'commande', changementsSeuls: false })?.trouves).toHaveLength(2);
    expect(filtrer(tous, undefined, { texte: 'ipé', genre: 'option', changementsSeuls: false })?.trouves).toEqual(['plan/inspecteur/lames/essence/ipe']);
  });

  it('seulement les changements', () => {
    const statuts = new Map([['plan/commandes/projet/projet.nouveau', 'nouveau' as const]]);
    expect(filtrer(tous, statuts, { texte: '', genre: '', changementsSeuls: true })?.trouves).toEqual(['plan/commandes/projet/projet.nouveau']);
  });
});
