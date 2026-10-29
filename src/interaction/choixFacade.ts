// La facade designee avant d'executer une commande de facade (meme role que interaction/outilAlignement.ts).
//
// Une commande ne prend pas d'argument : un bouton d'une ligne de l'inspecteur (« Photographier », « Modifier », « Retirer ») dit
// d'abord quel mur il vise, puis execute sa commande (`facade.photographier`, `facade.modifier`, `facade.retirer`), qui le reprend.
// Sans designation, « Photographier » ouvre l'ecran de prise de l'audit, qui suit la position.

let designee: number | null = null;

export function designerFacade(cote: number | null): void {
  designee = cote;
}

/** Le mur designe, une seule fois : la lecture l'efface. */
export function reprendreFacadeDesignee(): number | null {
  const c = designee;
  designee = null;
  return c;
}
