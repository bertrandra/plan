// L'identifiant de la parcelle d'un audit : lu par les commandes (commande.ts) et par la session (controleur.ts), qui ne suit les
// contours que du projet de sa parcelle.

import { parcelleDuProjet } from '../../../model/fonctions.js';
import type { ObjetPlan } from '../../../model/types.js';

/**
 * L'identifiant de la parcelle cadastrale du projet : son IDU, sinon son point de calage. Null pour
 * un plan dessine a la main, que rien ne situe : ni le GPS ni le brouillon n'auraient de repere.
 */
export function parcelleCadastrale(objets: readonly ObjetPlan[]): string | null {
  const cad = parcelleDuProjet(objets as ObjetPlan[])?.cadastre as { idu?: unknown; origineLat?: unknown; origineLon?: unknown } | null | undefined;
  if (typeof cad?.origineLat !== 'number' || typeof cad.origineLon !== 'number') return null;
  return typeof cad.idu === 'string' && cad.idu ? cad.idu : cad.origineLat.toFixed(6) + ',' + cad.origineLon.toFixed(6);
}
