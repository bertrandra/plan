// Le filtre du catalogue (etapes 4-5), pur : l'etat, la source, le bloc, une classe presente, la verification, un texte. L'ecran ne fait
// que le montrer ; le meme ordre sert a passer d'une photo a l'autre dans l'editeur.

import type { MetaImage } from './types.js';

export interface FiltreCatalogue {
  statut: string;        // 'marquables', '' (toutes) ou un statut
  source: string;        // '' ou une source
  bloc: string;          // '*' (tous), '' (sans bloc) ou un bloc
  classe: string;        // '' ou l'id d'une classe presente sur la photo
  verif: string;         // '', 'oui', 'non', 'echantillon'
  texte: string;
}

export const FILTRE_DEFAUT: FiltreCatalogue = { statut: 'marquables', source: '', bloc: '*', classe: '', verif: '', texte: '' };
const MARQUABLES = new Set(['validee', 'brouillon', 'corrigee']);

export function filtrer(images: readonly MetaImage[], f: FiltreCatalogue): MetaImage[] {
  const t = f.texte.trim().toLowerCase();
  return images.filter((m) =>
    (f.statut === 'marquables' ? MARQUABLES.has(m.statut) : f.statut === '' || m.statut === f.statut)
    && (!f.source || m.source === f.source)
    && (f.bloc === '*' || (m.bloc ?? '') === f.bloc)
    && (!f.classe || (m.classes ?? []).includes(f.classe))
    && (!f.verif || (f.verif === 'oui' ? m.verifiee : f.verif === 'echantillon' ? !!m.echantillon && !m.verifiee : !m.verifiee))
    && (!t || [m.nom, m.adresse, m.id, m.lot, m.note].some((x) => x?.toLowerCase().includes(t))));
}

/** Combien de filtres s'ecartent du defaut (pour « Effacer les filtres (n) »). */
export function filtresActifs(f: FiltreCatalogue): number {
  return (Object.keys(FILTRE_DEFAUT) as (keyof FiltreCatalogue)[]).filter((k) => f[k] !== FILTRE_DEFAUT[k]).length;
}

/** Ce que la pastille d'une photo dit d'elle, du plus urgent au plus fini. */
export function etatDeLaPhoto(m: MetaImage): { libelle: string; ton: 'attention' | 'accent' | 'ok' | '' } {
  if (m.statut === 'brouillon') return { libelle: 'À relire', ton: 'attention' };
  if (m.statut === 'validee') return { libelle: 'À marquer', ton: 'accent' };
  if (m.statut === 'corrigee') return m.verifiee ? { libelle: 'Vérifiée', ton: 'ok' } : m.echantillon ? { libelle: 'Échantillon', ton: 'attention' } : { libelle: 'Corrigée', ton: 'ok' };
  return { libelle: m.statut, ton: '' };
}
