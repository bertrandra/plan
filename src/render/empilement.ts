// Qui passe devant qui (spec §3.2, render/).
//
// En SVG, l'ordre de peinture est l'ordre du document : le dernier ajoute est devant. Il n'y a pas
// de `z-index`. Reordonner l'affichage, c'est donc **reajouter les elements**, et c'est ce que fait
// tout ce module.
//
// Deux niveaux se superposent, et les confondre est la faute a eviter :
//
// - **La priorite d'affichage** est le classement grossier, et c'est une notion du produit : un
//   parasol passe devant une terrasse, qui passe devant le terrain. Elle se regle objet par objet.
// - **L'ordre du tableau** n'affine que l'interieur d'un meme niveau de priorite, par double-clic.
//
// La selection, elle, ne change **aucun** des deux : selectionner un objet doit rendre ses poignees
// attrapables, pas le faire passer devant tout le monde. Sans cette distinction, la priorite —
// qui est un reglage explicite — se trouve contredite des qu'on clique quelque part, et le recul
// obtenu par double-clic est annule au clic suivant.

import type { ObjetPlan } from '../model/types.js';

/**
 * Les elements qui composent la vue d'un objet.
 *
 * Le type de l'element est un **parametre**, `Element` par defaut. Ce module ne lit aucune propriete
 * de ce qu'il empile : il le passe a `appendChild`, rien de plus. Le figer a `Element` obligerait un
 * test a fabriquer de vrais noeuds SVG pour verifier un ordre de peinture — c'est-a-dire a monter un
 * navigateur pour verifier une comparaison de nombres.
 */
export interface VueObjet<E = Element> {
  el: E;
  nameEl: E;
  edgeEls?: E[];
  segLabelEls?: E[];
  pointEls?: E[];
  ptLabelEls?: E[];
  radiusHandle?: E;
}

/** Ce dont l'empilement a besoin, et rien de plus : un endroit ou reajouter, et la vue d'un objet. */
export interface ContexteEmpilement<E = Element> {
  svg: { appendChild: (el: E) => unknown };
  vue: (obj: ObjetPlan) => VueObjet<E>;
}

/** Comparateur du classement grossier. Une priorite absente vaut zero. */
export function parPriorite(a: ObjetPlan, b: ObjetPlan): number {
  return (a.priority || 0) - (b.priority || 0);
}

/** Remonte les poignees d'un objet, **sans** toucher a sa forme ni a son etiquette. */
export function amenerPoigneesDevant<E>(obj: ObjetPlan, ctx: ContexteEmpilement<E>): void {
  const v = ctx.vue(obj);
  if (obj.type === 'polygon' || obj.type === 'path') {
    // Les quatre tableaux n'existent que sur une forme a points — d'ou le `?.`, qui dit ici la
    // meme chose que la condition au-dessus, mais au compilateur.
    v.edgeEls?.forEach(el => ctx.svg.appendChild(el));
    v.segLabelEls?.forEach(el => ctx.svg.appendChild(el));
    v.pointEls?.forEach(el => ctx.svg.appendChild(el));
    v.ptLabelEls?.forEach(el => ctx.svg.appendChild(el));
  } else if (v.radiusHandle) {
    ctx.svg.appendChild(v.radiusHandle);
  }
}

/** Remonte un objet entier — forme, etiquette, poignees. */
export function amenerDevant<E>(obj: ObjetPlan, ctx: ContexteEmpilement<E>): void {
  ctx.svg.appendChild(ctx.vue(obj).el);
  ctx.svg.appendChild(ctx.vue(obj).nameEl);
  amenerPoigneesDevant(obj, ctx);
}

/** Repeint tout le plan dans l'ordre : priorite d'abord, position dans le tableau ensuite. */
export function reappliquerEmpilement<E>(objets: ObjetPlan[], ctx: ContexteEmpilement<E>): void {
  objets.slice().sort(parPriorite).forEach(o => amenerDevant(o, ctx));
}

/**
 * Recule un objet d'un cran, pour decouvrir ce qui se cachait dessous.
 *
 * Le voisin immediat dans le tableau ne convient pas : il peut appartenir a un autre niveau de
 * priorite, et l'echange n'aurait alors **aucun effet visible** une fois le tri refait — le
 * double-clic paraitrait cassé. On cherche donc le precedent objet de **meme priorite**.
 *
 * La parcelle est doublement protegee : elle ne recule jamais, et elle est ignoree comme candidate
 * a l'echange. Elle doit rester le fond du plan.
 *
 * Rend `true` quand quelque chose a bouge — l'appelant sait alors qu'il doit redessiner.
 */
export function reculerObjet(obj: ObjetPlan | null, objets: ObjetPlan[]): boolean {
  if (!obj || obj.key === 'parcelle') return false;
  const idx = objets.indexOf(obj);
  let swapIdx = -1;
  for (let i = idx - 1; i >= 0; i--) {
    if (objets[i].key === 'parcelle') continue;
    if ((objets[i].priority || 0) === (obj.priority || 0)) { swapIdx = i; break; }
  }
  if (swapIdx === -1) return false; // deja le plus en arriere de son niveau
  [objets[swapIdx], objets[idx]] = [objets[idx], objets[swapIdx]];
  return true;
}
