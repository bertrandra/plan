// Les sections de l'inspecteur pour un objet, dans l'ordre ou il les montre (ui/champs/).
//
// Ce qui sert a concevoir l'ouvrage selectionne, et rien d'autre (MD/spec-ouvrages.md, « L'inspecteur
// de chaque ouvrage ») : ses reglages communs (objet.ts), les etapes d'une terrasse (construction.ts),
// les facades et le toit d'un batiment (facade.ts). Une fonction pure : le service
// de l'inspecteur (app/inspecteur.ts) la rend, et le test de l'inventaire la lit sur chaque ouvrage.
//
// Le meme ordre pour tous les objets (audit de l'inspecteur, 22 novembre 2026, lot A6) : « Objet », puis ce qui est propre a
// l'ouvrage (ses etapes, sa section), puis « Apparence », puis la geometrie (cotes, coins). Jusque-la, une terrasse mettait ses
// etapes apres l'apparence, un batiment ses facades apres ses coins, un parasol sa section en dernier.

import { aParticularite } from '../../model/fonctions.js';
import { sectionsObjet } from './objet.js';
import { sectionsConstruction } from './construction.js';
import { sectionReleve, sectionToit, estBatiment } from './facade.js';
import type { ContexteChamps, Section } from './types.js';

export function sectionsInspecteur(c: ContexteChamps): Section[] {
  const sections = sectionsObjet(c);
  // Comme celles d'une piscine, les etapes d'une terrasse viennent avant sa geometrie (cotes,
  // coins) : c'est l'ouvrage qu'on regle, sa forme se reprend sur le plan.
  if (aParticularite(c.obj, 'construction')) {
    const geometrie = sections.findIndex(s => s.id === 'cotes');
    sections.splice(geometrie < 0 ? sections.length : geometrie, 0, ...sectionsConstruction(c));
  }
  // Le toit puis les facades d'un batiment, avant ses fenetres en 3D : ce qu'on regle d'abord vient d'abord.
  if (estBatiment(c.obj)) {
    const fenetres = sections.findIndex(s => s.id === 'fenetres3d');
    sections.splice(fenetres < 0 ? sections.length : fenetres, 0, sectionToit(), sectionReleve(c));
  }
  return dansLOrdre(sections);
}

/**
 * Le rang d'une section : l'objet (0), ce qui lui est propre (1), son apparence (2), sa geometrie (3). « Parcelle » dit ce qu'est
 * le terrain (son lieu, sa reference cadastrale, rien a regler) : elle va avec « Objet ». Au doigt, les onglets de l'inspecteur
 * suivent ce rang (`familleDeSection`), sans autre liste a tenir.
 */
export const rangDeSection = (id: string): number => (id === 'objet' || id === 'parcelle') ? 0 : id === 'apparence' ? 2 : (id === 'cotes' || id === 'coins') ? 3 : 1;
const rang = rangDeSection;

/**
 * Les trois onglets de l'inspecteur au doigt (zones/Inspecteur.tsx), une regle unique (audit de l'inspecteur, decision B3) : ce qui
 * est propre a l'ouvrage (ses etapes, sa section, la cloture d'une parcelle, son relief, les fenetres d'un batiment) est toujours
 * sous « Réglages » ; « Objet » porte ce qu'il est et son apparence ; « Géométrie », ses cotes et ses coins.
 */
export type Famille = 'reglages' | 'objet' | 'geometrie';
export function familleDeSection(id: string): Famille {
  const r = rangDeSection(id);
  return r === 1 ? 'reglages' : r === 3 ? 'geometrie' : 'objet';
}

/** Les sections par rang ; a rang egal, l'ordre ou elles ont ete composees (les etapes d'une terrasse, d'une piscine). */
function dansLOrdre(sections: Section[]): Section[] {
  return sections.map((s, i) => ({ s, i })).sort((a, b) => rang(a.s.id) - rang(b.s.id) || a.i - b.i).map(x => x.s);
}
