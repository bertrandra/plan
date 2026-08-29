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

/**
 * Ce dont l'empilement a besoin, et rien de plus : un endroit ou reajouter, et la vue de chaque
 * objet. Le type est volontairement etroit — ce module ne demande pas une racine SVG complete, il
 * demande de quoi empiler.
 */
export interface ContexteEmpilement {
  svg: { appendChild: (el) => unknown };
  vue: (obj) => {
    el; nameEl;
    edgeEls?; segLabelEls?; pointEls?; ptLabelEls?; radiusHandle?;
  };
}

/** Comparateur du classement grossier. Une priorite absente vaut zero. */
export function parPriorite(a, b): number {
  return (a.priority || 0) - (b.priority || 0);
}

/** Remonte les poignees d'un objet, **sans** toucher a sa forme ni a son etiquette. */
export function amenerPoigneesDevant(obj, ctx: ContexteEmpilement): void {
  const v = ctx.vue(obj);
  if (obj.type === 'polygon' || obj.type === 'path') {
    v.edgeEls.forEach(el => ctx.svg.appendChild(el));
    v.segLabelEls.forEach(el => ctx.svg.appendChild(el));
    v.pointEls.forEach(el => ctx.svg.appendChild(el));
    v.ptLabelEls.forEach(el => ctx.svg.appendChild(el));
  } else if (v.radiusHandle) {
    ctx.svg.appendChild(v.radiusHandle);
  }
}

/** Remonte un objet entier — forme, etiquette, poignees. */
export function amenerDevant(obj, ctx: ContexteEmpilement): void {
  ctx.svg.appendChild(ctx.vue(obj).el);
  ctx.svg.appendChild(ctx.vue(obj).nameEl);
  amenerPoigneesDevant(obj, ctx);
}

/** Repeint tout le plan dans l'ordre : priorite d'abord, position dans le tableau ensuite. */
export function reappliquerEmpilement(objets, ctx: ContexteEmpilement): void {
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
export function reculerObjet(obj, objets): boolean {
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
