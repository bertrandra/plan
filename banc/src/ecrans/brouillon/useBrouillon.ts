// Le controleur du brouillon (etape 3) : les options (recherche des baies, refaire les photos deja marquees), les photos visees, et le
// lot avec son avancement. Les modeles actifs et la recherche proposent ; une photo deja corrigee ne recoit que ce qu'elle n'avait pas.

import { useMemo, useState } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import { bitmap, COTE_TRAVAIL, pixels, reduire } from '../../images.js';
import { detecter } from '../../yolo.js';
import { brouillonSurExistant, objetsDuBrouillon, parLaRecherche, selonLaCorrespondance, type Proposition } from '../../brouillon.js';
import type { MetaImage } from '../../types.js';

export function useBrouillon(banc: Banc) {
  const [recherche, setRecherche] = useState(true);
  const [refaire, setRefaire] = useState(false);
  const [avance, setAvance] = useState<{ fait: number; total: number } | null>(null);
  const [bilan, setBilan] = useState<{ photos: number; objets: number } | null>(null);
  const actifs = useMemo(() => banc.modeles.filter((m) => m.installe && m.actif !== false), [banc.modeles]);
  const cibles = useMemo(() => banc.images.filter((m) => m.statut === 'validee' || (refaire && (m.statut === 'brouillon' || m.statut === 'corrigee'))), [banc.images, refaire]);
  const possible = cibles.length > 0 && !avance && (actifs.length > 0 || recherche);

  const marquer = async (l: readonly MetaImage[]) => {
    let objets = 0;
    setBilan(null);
    for (const [k, m] of l.entries()) {
      setAvance({ fait: k, total: l.length });
      try {
        const b = await bitmap(api.fichier(m.id, 'redressee', m.redressement?.le ?? ''));
        const props: Proposition[] = [];
        for (const mod of actifs) props.push(...selonLaCorrespondance(mod, await detecter(mod, b, api.urlModele(mod.id)), banc.classes));
        if (recherche) {
          // La recherche travaille sur une image reduite : ses boites reviennent a l'echelle de la photo.
          const c = reduire(b, COTE_TRAVAIL), r = b.width / c.width;
          props.push(...parLaRecherche(pixels(c)).map((p) => ({ ...p, boite: { x0: p.boite.x0 * r, y0: p.boite.y0 * r, x1: p.boite.x1 * r, y1: p.boite.y1 * r } })));
        }
        b.close();
        const nouveaux = objetsDuBrouillon(props, banc.classes);
        const existants = m.statut === 'validee' ? [] : (await api.annotation(m.id)).objets;
        const tous = existants.length ? brouillonSurExistant(existants, nouveaux, banc.classes) : nouveaux;
        // Une photo deja corrigee le reste : le brouillon n'y ajoute que ce qu'elle n'avait pas, a relire.
        banc.remplacer(await api.ecrireAnnotation(m.id, { objets: tous, par: m.statut === 'corrigee' ? 'main' : 'auto' }));
        objets += nouveaux.length;
      } catch (e) {
        banc.dire(`${m.nom ?? m.id} : ${(e as Error).message}`, 'erreur');
      }
    }
    setAvance(null);
    setBilan({ photos: l.length, objets });
    banc.dire(`${l.length} photo(s) marquée(s), ${objets} objet(s) proposé(s).`);
  };
  return { recherche, setRecherche, refaire, setRefaire, actifs, cibles, possible, avance, bilan, marquer };
}
