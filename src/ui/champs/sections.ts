// Les sections de l'inspecteur pour un objet, dans l'ordre ou il les montre (ui/champs/).
//
// Ce qui sert a concevoir l'ouvrage selectionne, et rien d'autre (MD/spec-ouvrages.md, « L'inspecteur
// de chaque ouvrage ») : ses reglages communs (objet.ts), les etapes d'une terrasse (construction.ts)
// avant sa geometrie, les facades et le toit d'un batiment (facade.ts). Une fonction pure : le service
// de l'inspecteur (app/inspecteur.ts) la rend, et le test de l'inventaire la lit sur chaque ouvrage.

import { aParticularite } from '../../model/fonctions.js';
import { sectionsObjet } from './objet.js';
import { sectionsConstruction } from './construction.js';
import { sectionReleve, estBatiment } from './facade.js';
import type { ContexteChamps, Section } from './types.js';

export function sectionsInspecteur(c: ContexteChamps): Section[] {
  const sections = sectionsObjet(c);
  // Comme celles d'une piscine, les etapes d'une terrasse viennent avant sa geometrie (cotes,
  // coins) : c'est l'ouvrage qu'on regle, sa forme se reprend sur le plan.
  if (aParticularite(c.obj, 'construction')) {
    const geometrie = sections.findIndex(s => s.id === 'cotes');
    sections.splice(geometrie < 0 ? sections.length : geometrie, 0, ...sectionsConstruction(c));
  }
  if (estBatiment(c.obj)) sections.push(sectionReleve(c));
  return sections;
}
