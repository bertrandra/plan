// Le brouillon d'une photo : ce que proposent les modeles actifs et la recherche des baies, en objets « auto » a relire. Le meme pour le
// lot de l'etape 3 et pour « Relancer le brouillon » dans l'editeur.

import { api } from '../../api.js';
import { bitmap, COTE_TRAVAIL, pixels, reduire } from '../../images.js';
import { detecter } from '../../yolo.js';
import { objetsDuBrouillon, parLaRecherche, selonLaCorrespondance, type Proposition } from '../../brouillon.js';
import type { Classe, MetaImage, Modele, Objet } from '../../types.js';

export async function proposer(m: MetaImage, modeles: readonly Modele[], classes: readonly Classe[], recherche: boolean): Promise<Objet[]> {
  const b = await bitmap(api.fichier(m.id, 'redressee', m.redressement?.le ?? ''));
  try {
    const props: Proposition[] = [];
    for (const mod of modeles) props.push(...selonLaCorrespondance(mod, await detecter(mod, b, api.urlModele(mod.id)), [...classes]));
    if (recherche) {
      // La recherche travaille sur une image reduite : ses boites reviennent a l'echelle de la photo.
      const c = reduire(b, COTE_TRAVAIL), r = b.width / c.width;
      props.push(...parLaRecherche(pixels(c)).map((p) => ({ ...p, boite: { x0: p.boite.x0 * r, y0: p.boite.y0 * r, x1: p.boite.x1 * r, y1: p.boite.y1 * r } })));
    }
    return objetsDuBrouillon(props, [...classes]);
  } finally { b.close(); }
}
