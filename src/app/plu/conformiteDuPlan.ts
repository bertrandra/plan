// La conformite au PLU et la formalite d'urbanisme du plan ouvert, calculees une fois par ecriture (app/plu/).
//
// Trois lecteurs les demandent a chaque rendu : l'onglet PLU du tiroir, la pastille de cet onglet (app/tiroir.ts) et le calque des
// ecarts sur le plan (render/pluOverlay.ts). Les regles (engine/regles/plu/) relisent tout le plan : la reponse est gardee tant que
// rien n'a ete ecrit (core/controleurObjets.ts, `cleDesObjets`) et que le reglement lu n'a pas change (sa lecture, l'etat de chaque
// fait). Un objet deplace touche sa version : les verdicts se refont au rendu suivant.

import { cleDesObjets } from '../../core/controleurObjets.js';
import { conformitePlu, type ConformitePlu } from '../../engine/regles/plu/conformite.js';
import { formaliteDuProjet, type IndicationFormalite } from '../../engine/regles/plu/formalite.js';
import { parcelleDuProjet } from '../../model/fonctions.js';
import type { ObjetPlan } from '../../model/types.js';

/** Ce qui change la conformite sans toucher a un objet : la lecture du reglement, et chaque regle retenue ou rendue. */
export function cleDuReglement(objets: readonly ObjetPlan[]): string {
  const r = parcelleDuProjet(objets)?.reglementPlu;
  return r ? r.lecture.demandeeLe + ':' + r.faits.map((f) => f.id + f.statut[0]).join(',') : '';
}

let conformite: { objets: readonly ObjetPlan[]; cle: string; valeur: ConformitePlu } | null = null;
let formalite: { objets: readonly ObjetPlan[]; cle: string; valeur: IndicationFormalite } | null = null;

/** La conformite du plan aux regles du PLU retenues (engine/regles/plu/conformite.ts), reprise tant que rien n'a ete ecrit. */
export function conformiteDuPlan(objets: readonly ObjetPlan[]): ConformitePlu {
  const cle = cleDesObjets(objets) + '|' + cleDuReglement(objets);
  if (!conformite || conformite.objets !== objets || conformite.cle !== cle) {
    conformite = { objets, cle, valeur: conformitePlu(objets, parcelleDuProjet(objets)?.reglementPlu) };
  }
  return conformite.valeur;
}

/** La formalite d'urbanisme du plan (engine/regles/plu/formalite.ts), reprise tant que rien n'a ete ecrit. */
export function formaliteDuPlan(objets: readonly ObjetPlan[]): IndicationFormalite {
  const cle = cleDesObjets(objets);
  if (!formalite || formalite.objets !== objets || formalite.cle !== cle) formalite = { objets, cle, valeur: formaliteDuProjet(objets) };
  return formalite.valeur;
}
