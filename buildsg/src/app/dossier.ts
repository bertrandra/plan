// Les terrasses retenues pour le dossier PDF (app/).
//
// Cocher une terrasse pour le dossier n'est pas une donnee du plan : la selection ne s'enregistre
// pas. Elle se coche dans l'explorateur (zones/Explorateur.tsx) et se lit a l'export.

import type { ObjetPlan } from '../model/types.js';
import { estTerrasse } from '../model/fonctions.js';

/** Terrasses cochees pour le dossier PDF. Par defaut, toutes. */
export const dossierSelection = new Set<string>();

/**
 * Les cles des terrasses retenues, apres reparation : une terrasse disparue sort de la selection,
 * et rien de coche veut dire toutes — un dossier vide n'est pas un dossier.
 */
export function clesDossier(objects: ObjetPlan[]): string[] {
  const terrasses = objects.filter(estTerrasse);
  const cles = new Set(terrasses.map((t: ObjetPlan)=>t.key));
  [...dossierSelection].forEach(k=>{ if(!cles.has(k)) dossierSelection.delete(k); });
  if(!dossierSelection.size) terrasses.forEach((t: ObjetPlan)=>dossierSelection.add(t.key));
  return [...dossierSelection];
}
