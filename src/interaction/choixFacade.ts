// La facade designee avant d'ouvrir le releve (meme role que interaction/outilAlignement.ts).
//
// Une commande ne prend pas d'argument : le bouton « Relever » d'une ligne de l'inspecteur dit
// d'abord quel mur il vise, puis execute `facade.relever`, qui le reprend. Sans designation, le
// releve s'ouvre sur le choix du mur.

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
