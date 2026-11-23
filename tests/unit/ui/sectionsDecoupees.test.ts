import { describe, it, expect } from 'vitest';
import { sectionsInspecteur } from '../../../src/ui/champs/sections.js';
import { champsVisibles, groupesDeChamps } from '../../../src/ui/champs/types.js';
import { contexte, parNom, projet } from './projetDemo.js';

// Audit de l'inspecteur, decision B2 (22 novembre 2026) : les longues sections se decoupent, par la mecanique des groupes de la
// terrasse. Pergola et carport en trois groupes puis la note de calcul ; « Façades et toit » en « Toit » et « Façades ».

describe('les longues sections decoupees (B2)', () => {
  it('une pergola et un carport en trois groupes, comme la terrasse, puis la note', () => {
    const objets = projet();
    for (const [nom, titre] of [['Pergola 1', 'Pergola · Forme et toit'], ['Carport 1', 'Carport · Forme et toit']] as const) {
      const c = contexte(objets, parNom(objets, nom), false);
      const propres = sectionsInspecteur(c).filter(s => /^pergola|^noteCalcul$/.test(s.id));
      expect(propres.map(s => s.titre)).toEqual([titre, 'Structure', 'Couleurs', 'Note de calcul']);
      expect(propres.filter(s => s.principale).map(s => s.id)).toEqual(['pergola']);
      // Plus de pli dans les trois groupes : chacun est court.
      expect(propres.slice(0, 3).flatMap(s => s.champs.filter(ch => ch.repli))).toEqual([]);
    }
  });

  it('aucun reglage de l abri ne se perd ni ne se double dans le decoupage', () => {
    const objets = projet();
    const c = contexte(objets, parNom(objets, 'Pergola 1'), false);
    const cles = sectionsInspecteur(c).filter(s => /^pergola/.test(s.id)).flatMap(s => s.champs.map(ch => ch.cle));
    expect([...cles].sort()).toEqual(['adossee', 'avecContrefiches', 'coteMur', 'coteReference', 'couleurBois', 'couleurCouverture', 'couleurToile', 'debord', 'entraxeChevrons', 'entraxePoteaux',
      'hauteur', 'longueurContrefiche', 'longueursBois', 'materiau', 'pente', 'sectionChevron', 'sectionContrefiche', 'sectionPoteau', 'sectionPoutre', 'toit']);
  });

  it('un batiment : « Toit », sa section d arrivee, puis « Façades »', () => {
    const objets = projet();
    const c = contexte(objets, parNom(objets, 'Maison'), false);
    const s = sectionsInspecteur(c);
    expect(s.filter(x => x.id === 'toit' || x.id === 'releve').map(x => x.titre)).toEqual(['Toit', 'Façades']);
    expect(s.find(x => x.id === 'toit')?.principale).toBe(true);
    expect(s.find(x => x.id === 'releve')?.champs.some(ch => ch.cle.startsWith('toit'))).toBe(false);
    expect(s.find(x => x.id === 'toit')?.champs.map(ch => ch.cle)).toEqual(expect.arrayContaining(['toit3d', 'toitMode', 'toitForme', 'toitHauteur', 'toitCouleur']));
  });

  it('la note de calcul : la neige, le vent et l altitude, que l alerte demande de choisir, sortent du pli ferme', () => {
    const objets = projet();
    const c = contexte(objets, parNom(objets, 'Pergola 1'), true);
    const note = sectionsInspecteur(c).find(s => s.id === 'noteCalcul');
    const groupes = groupesDeChamps(champsVisibles(note!, c));
    const ouverts = groupes.filter(g => g.repli === null).flatMap(g => g.champs.map(ch => ch.cle));
    expect(ouverts).toEqual(expect.arrayContaining(['calcul-manque', 'zoneNeige', 'zoneVent', 'altitude']));
    // L'alerte precede ce qu'elle demande.
    expect(ouverts.indexOf('calcul-manque')).toBeLessThan(ouverts.indexOf('zoneNeige'));
  });
});
