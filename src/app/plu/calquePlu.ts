// Le calque des ecarts au PLU sur le plan (render/pluOverlay.ts), garde comme les autres calques du dessus (render/calquesGardes.ts) :
// il ne se refait que si ce qu'il lit a change. La conformite lit tout le plan (reculs, emprise) : avec une regle retenue, le calque
// suit donc chaque objet, et un ouvrage deplace refait ses verdicts au rendu suivant (conformiteDuPlan.ts). Sans reglement lu, il ne
// lit rien et reste vide : un plan sans PLU ne paie rien.

import { cleDesCalques, redessinerSiChange } from '../../render/calquesGardes.js';
import { dessinerCalquePlu, ecartsSurLePlan } from '../../render/pluOverlay.js';
import { SVG_ECART_PLU, SVG_ECART_PLU_TEXTE } from '../../render/theme.js';
import { rien, tout } from '../../core/lectures.js';
import { cleDuReglement, conformiteDuPlan } from './conformiteDuPlan.js';
import type { EtatApp } from '../../core/state.js';

/** `enDessin` : l'etat vu dans le repere du dessin (app/assemblage/dessin.ts, `etatDessin`) ; `etat` : le plan lui-meme. */
export function redessinerEcartsPlu(calque: SVGElement, enDessin: EtatApp, etat: EtatApp): void {
  const reglement = cleDuReglement(etat.objects);
  redessinerSiChange(calque, 'ecarts au PLU', cleDesCalques(enDessin, reglement ? tout : rien, reglement, SVG_ECART_PLU, SVG_ECART_PLU_TEXTE), () =>
    dessinerCalquePlu(calque, enDessin.scene, reglement ? ecartsSurLePlan(etat.objects, conformiteDuPlan(etat.objects).verdicts, etat.isolement) : []));
}
