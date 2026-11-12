// Le controleur de la mosaique (etape 2a) : le filtre (a valider, validees, rejetees), la photo courante, et les gestes (valider,
// rejeter, renvoyer au redressement, supprimer) ; apres un geste sur la photo courante, la suivante vient d'elle-meme.

import { useMemo, useState } from 'react';
import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import type { MetaImage, Statut } from '../../types.js';

export type FiltreMosaique = 'a-valider' | 'validee' | 'rejetee';
const DANS: Record<FiltreMosaique, (m: MetaImage) => boolean> = {
  'a-valider': (m) => m.statut === 'redressee',
  validee: (m) => m.statut === 'validee',
  rejetee: (m) => m.statut === 'rejetee',
};

export function useMosaique(banc: Banc) {
  const [filtre, setFiltreBrut] = useState<FiltreMosaique>('a-valider');
  const [courante, setCourante] = useState<string | null>(null);
  const [revue, setRevue] = useState(false);
  const liste = useMemo(() => banc.images.filter(DANS[filtre]), [banc.images, filtre]);
  const comptes = useMemo(() => ({ 'a-valider': banc.images.filter(DANS['a-valider']).length, validee: banc.images.filter(DANS.validee).length, rejetee: banc.images.filter(DANS.rejetee).length }), [banc.images]);
  const rang = Math.max(0, liste.findIndex((m) => m.id === courante));
  const photo = liste[rang] ?? null;
  const setFiltre = (f: FiltreMosaique) => { setFiltreBrut(f); setCourante(null); };
  const aller = (k: number) => { const m = liste[Math.max(0, Math.min(liste.length - 1, k))]; if (m) setCourante(m.id); };

  /** Pose un statut ; si la photo sort de la liste (validee quand on regarde « a valider »), la suivante devient la courante. */
  const poser = async (m: MetaImage, statut: Statut) => {
    const k = liste.findIndex((x) => x.id === m.id);
    try {
      banc.remplacer(await api.modifier(m.id, { statut }));
      if (m.id === photo?.id && !DANS[filtre]({ ...m, statut })) setCourante(liste[k + 1]?.id ?? liste[k - 1]?.id ?? null);
    } catch (e) { banc.dire((e as Error).message, 'erreur'); }
  };
  const toutValider = async () => { const l = [...liste]; for (const m of l) await poser(m, 'validee'); banc.dire(`${l.length} photo(s) validée(s).`); };
  // Supprimer : la photo et tout son dossier sur le serveur (source, redressee, marquage) ; sans retour.
  const supprimer = async (l: readonly MetaImage[]) => {
    if (!l.length || !confirm(l.length === 1 ? `Supprimer définitivement « ${l[0]?.nom ?? l[0]?.id} » et tout son dossier ?` : `Supprimer définitivement ces ${l.length} photos rejetées et tout leur dossier ? Rien ne pourra être récupéré.`)) return;
    let n = 0;
    for (const m of l) { try { await api.supprimer(m.id); n++; } catch (e) { banc.dire(`${m.nom ?? m.id} : ${(e as Error).message}`, 'erreur'); } }
    banc.dire(`${n} photo(s) supprimée(s).`);
    setCourante(null);
    await banc.relire();
  };
  return { filtre, setFiltre, liste, comptes, rang, photo, courante, setCourante, aller, poser, toutValider, supprimer, revue, setRevue };
}
