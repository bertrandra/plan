// Le controleur du catalogue (etapes 4-5) : le filtre (catalogue.ts, pur), la page, et les raccourcis vers le travail qui attend.

import { useMemo, useState } from 'react';
import type { Banc } from '../../App.js';
import { filtrer, FILTRE_DEFAUT, filtresActifs, type FiltreCatalogue } from '../../catalogue.js';

export const PAR_PAGE = 60;

export function useCatalogue(banc: Banc) {
  const [filtre, setFiltreBrut] = useState<FiltreCatalogue>(FILTRE_DEFAUT);
  const [page, setPage] = useState(0);
  const liste = useMemo(() => filtrer(banc.images, filtre), [banc.images, filtre]);
  const pages = Math.max(1, Math.ceil(liste.length / PAR_PAGE));
  const vue = liste.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE);
  const poser = <K extends keyof FiltreCatalogue>(k: K, v: FiltreCatalogue[K]) => { setFiltreBrut((f) => ({ ...f, [k]: v })); setPage(0); };
  const effacer = () => { setFiltreBrut(FILTRE_DEFAUT); setPage(0); };
  const aRelire = useMemo(() => banc.images.filter((m) => m.statut === 'brouillon').map((m) => m.id), [banc.images]);
  const aMarquer = useMemo(() => banc.images.filter((m) => m.statut === 'validee').map((m) => m.id), [banc.images]);
  /** Ouvre l'editeur sur la premiere d'une liste, et passe d'une photo a l'autre dans cet ordre. */
  const enchainer = (ids: readonly string[]) => { if (ids[0]) banc.ouvrir(ids[0], [...ids]); };
  return { filtre, poser, effacer, actifs: filtresActifs(filtre), liste, vue, page, pages, setPage, aRelire, aMarquer, enchainer };
}
