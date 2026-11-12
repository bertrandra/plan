// Le controleur du brouillon (etape 3) : les options (recherche des baies, refaire les photos deja marquees), les photos visees, et le
// lot avec son avancement. Les modeles actifs et la recherche proposent ; une photo deja corrigee ne recoit que ce qu'elle n'avait pas.

import { useMemo, useState } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import { brouillonSurExistant } from '../../brouillon.js';
import { proposer } from './proposer.js';
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
        const nouveaux = await proposer(m, actifs, banc.classes, recherche);
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
