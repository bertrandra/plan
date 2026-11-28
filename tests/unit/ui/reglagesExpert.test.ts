import { describe, it, expect } from 'vitest';
import { sectionsInspecteur } from '../../../src/ui/champs/sections.js';
import { reglagesAvancesMasques } from '../../../src/ui/champs/types.js';
import { ensureConstruction } from '../../../src/engine/construction.js';
import { calculerPergola } from '../../../src/engine/abri/pergola.js';
import { noteDeCalcul } from '../../../src/engine/abri/noteCalcul.js';
import { contexte, DEUX_CORPS, montrees, parNom, projet } from './projetDemo.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Audit de l'inspecteur, decision B1 (22 novembre 2026) : hors terrasse, les reglages techniques passent en mode expert. Rien n'est
// supprime : le mode expert montre tout. Garde-fou : un reglage qu'une alerte demande de toucher, ou dont le projet porte une valeur
// reglee, reste montre en mode simple.

/** Ce que le mode simple cache : montre en expert, pas en simple. */
function caches(objets: ObjetPlan[], nom: string): string[] {
  const simple = new Set(montrees(objets, nom, true));
  return montrees(objets, nom, false).filter(k => !simple.has(k));
}

describe('les reglages passes en mode expert (B1)', () => {
  it('une pergola : contrefiches, chevrons, longueurs achetables et hypotheses fines du calcul', () => {
    expect(caches(projet(), 'Pergola 1')).toEqual([
      'pergolaStructure/avecContrefiches', 'pergolaStructure/longueurContrefiche', 'pergolaStructure/sectionContrefiche',
      'pergolaStructure/sectionChevron', 'pergolaStructure/entraxeChevrons', 'pergolaStructure/longueursBois',
      'noteCalcul/terrain', 'noteCalcul/obstruction', 'noteCalcul/poidsCouverture', 'noteCalcul/classeBois', 'noteCalcul/classeService'
    ]);
  });

  it('un carport : les memes', () => {
    expect(caches(projet(), 'Carport 1')).toEqual(caches(projet(), 'Pergola 1'));
  });

  it('un batiment : « Murs en 3D », l appui et l entraxe des fenetres (« Toit en 3D » est dans l atelier du toit)', () => {
    const objets = projet();
    const maison = parNom(objets, 'Maison');
    // Un batiment lu par le LiDAR et une photo de rue : les deux choix existent.
    maison.batiment = { ...(maison.batiment ?? {}), volumesToit: DEUX_CORPS,
      couleurMurs: { photo: { couleur: '#ddccbb', date: '2025-05-01' } } as never };
    const c = caches(objets, 'Maison');
    expect(c).toEqual(expect.arrayContaining(['fenetres3d/appui', 'fenetres3d/entraxe', 'apparence/sourceCouleurMurs']));
    expect(c.filter(k => !['fenetres3d/appui', 'fenetres3d/entraxe', 'apparence/sourceCouleurMurs'].includes(k))).toEqual([]);
    // La largeur et la hauteur des fenetres, et la couleur lue, restent a tous.
    expect(montrees(objets, 'Maison', true)).toEqual(expect.arrayContaining(['fenetres3d/largeur', 'fenetres3d/hauteur', 'apparence/couleurMursLue']));
  });

  it('la parcelle : les reglages techniques du relief', () => {
    const objets = projet();
    // La demonstration porte un plafond de points regle : « Points max » y reste montre. Sans lui, les quatre lignes se cachent.
    expect(caches(objets, 'Parcelle AE 101')).toEqual(['relief/grille', 'relief/paysage', 'relief/zRef']);
    delete parNom(objets, 'Parcelle AE 101').relief!.maxCellules;
    expect(caches(objets, 'Parcelle AE 101')).toEqual(['relief/grille', 'relief/paysage', 'relief/pointsMax', 'relief/zRef']);
  });

  it('la terrasse sur vis : « Portée max entre vis » suit la case qui la libere', () => {
    const objets = projet();
    expect(caches(objets, 'Terrasse')).toContain('structure/visEntraxe');
    // Une portee reglee a la main dans le projet : le champ reste montre, et actif.
    ensureConstruction(parNom(objets, 'Terrasse')).visModeAuto = false;
    expect(montrees(objets, 'Terrasse', true)).toContain('structure/visEntraxe');
  });
});

describe('un reglage expert reste montre quand il le faut', () => {
  it('une valeur reglee dans le projet, autre que celle par defaut', () => {
    const objets = projet();
    const pergola = parNom(objets, 'Pergola 1');
    pergola.pergola = { ...(pergola.pergola ?? {}), entraxeChevrons: 0.35, calcul: { obstruction: 0.5 } };
    const vues = montrees(objets, 'Pergola 1', true);
    expect(vues).toEqual(expect.arrayContaining(['pergolaStructure/entraxeChevrons', 'noteCalcul/obstruction']));
    expect(vues).not.toContain('pergolaStructure/sectionChevron');
  });

  it('une valeur ecrite mais egale a celle par defaut ne compte pas', () => {
    const objets = projet();
    const pergola = parNom(objets, 'Pergola 1');
    const defaut = calculerPergola(pergola)!.reglages;
    pergola.pergola = { ...(pergola.pergola ?? {}), entraxeChevrons: defaut.entraxeChevrons, sectionChevron: defaut.sectionChevron };
    expect(montrees(objets, 'Pergola 1', true)).not.toEqual(expect.arrayContaining(['pergolaStructure/entraxeChevrons']));
  });

  it('une piece que la note de calcul juge insuffisante : sa section et son entraxe se montrent', () => {
    const objets = projet();
    const pergola = parNom(objets, 'Pergola 1');
    // Une neige et un vent forts sur des chevrons tres ecartes : la note les refuse.
    pergola.pergola = { ...(pergola.pergola ?? {}), toit: 'appentis', calcul: { zoneNeige: 'E', zoneVent: 4, altitude: 1500 } };
    const insuffisants = (noteDeCalcul(pergola)?.verifs ?? []).filter(v => v.taux > 1).map(v => v.role);
    expect(insuffisants).toContain('chevron');
    expect(montrees(objets, 'Pergola 1', true)).toEqual(expect.arrayContaining(['pergolaStructure/sectionChevron', 'pergolaStructure/entraxeChevrons']));
  });

  it('un avertissement du metrage sur les contrefiches : leur longueur se montre', () => {
    const objets = projet();
    const pergola = parNom(objets, 'Pergola 1');
    pergola.pergola = { ...(pergola.pergola ?? {}), hauteur: 1.8, longueurContrefiche: 1.5 };
    // Le garde lit le texte de l'avertissement : s'il change, ce test le dit.
    expect(calculerPergola(pergola)!.avertissements.some(t => /contrefiche/i.test(t))).toBe(true);
    expect(montrees(objets, 'Pergola 1', true)).toEqual(expect.arrayContaining(['pergolaStructure/avecContrefiches', 'pergolaStructure/longueurContrefiche']));
  });

  it('une source de couleur, un plafond de points choisis a la main', () => {
    const objets = projet();
    const maison = parNom(objets, 'Maison');
    maison.batiment = { ...(maison.batiment ?? {}), volumesToit: DEUX_CORPS,
      modeToit: 'simple', couleurMurs: { source: 'plan', photo: { couleur: '#ddccbb', date: '2025-05-01' } } as never, fenetres3d: { mode: 'toutes', largeur: 1, hauteur: 1.2, appui: 0.4, entraxe: 2.5 } };
    expect(montrees(objets, 'Maison', true)).toEqual(expect.arrayContaining(['apparence/sourceCouleurMurs', 'fenetres3d/appui']));
    const parcelle = parNom(objets, 'Parcelle AE 101');
    parcelle.relief!.maxCellules = 20000;
    expect(montrees(objets, 'Parcelle AE 101', true)).toContain('relief/pointsMax');
  });
});

describe('le nombre de reglages avances masques, au pied d une section', () => {
  it('compte ce que le mode expert montrerait pour cet objet, et rien en mode expert', () => {
    const objets = projet();
    const compte = (nom: string, modeSimple: boolean) => {
      const c = contexte(objets, parNom(objets, nom), modeSimple);
      return Object.fromEntries(sectionsInspecteur(c).map(s => [s.id, reglagesAvancesMasques(s, c)]).filter(([, n]) => n));
    };
    expect(compte('Pergola 1', true)).toEqual({ pergolaStructure: 6, noteCalcul: 5 });
    expect(compte('Parcelle AE 101', true)).toEqual({ relief: 3 });
    expect(compte('Pergola 1', false)).toEqual({});
    // Une section entiere du mode expert se compte aussi (le pied du panneau le dit).
    expect(compte('Terrasse', true).parametres).toBeGreaterThan(5);
  });
});
