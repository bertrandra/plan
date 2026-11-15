// Ce que les modeles actifs et la recherche des baies proposent pour une image : la meme fonction pour le lot de l'etape 3 et pour
// le pre-marquage a l'import (demande du proprietaire, 15 novembre 2026). Les objets rendus sont « auto » (brouillon.ts).

import { api } from '../../api.js';
import { objetsDuBrouillon, parLaRecherche, selonLaCorrespondance, type Proposition } from '../../brouillon.js';
import { COTE_TRAVAIL, pixels, reduire } from '../../images.js';
import type { Classe, Modele, Objet } from '../../types.js';
import { detecter } from '../../yolo.js';

export async function proposerLesObjets(image: ImageBitmap | HTMLCanvasElement, actifs: readonly Modele[], classes: readonly Classe[], recherche: boolean): Promise<Objet[]> {
  const props: Proposition[] = [];
  for (const mod of actifs) props.push(...selonLaCorrespondance(mod, await detecter(mod, image, api.urlModele(mod.id)), classes));
  if (recherche) {
    // La recherche travaille sur une image reduite : ses boites reviennent a l'echelle de la photo.
    const c = reduire(image, COTE_TRAVAIL), r = image.width / c.width;
    props.push(...parLaRecherche(pixels(c)).map((p) => ({ ...p, boite: { x0: p.boite.x0 * r, y0: p.boite.y0 * r, x1: p.boite.x1 * r, y1: p.boite.y1 * r } })));
  }
  return objetsDuBrouillon(props, classes);
}
