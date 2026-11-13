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

/** Un statut que la pastille d'une photo propose (demande du proprietaire, 13 novembre 2026), et ce qu'il ecrit sur la photo. */
export interface ChoixStatut { id: string; libelle: string; champs: { statut: MetaImage['statut']; verifiee?: boolean }; possible: boolean; raison?: string }

/**
 * Les statuts qu'on peut donner a une photo depuis le catalogue, dans l'ordre du travail. « À relire », « Corrigée » et « Vérifiée »
 * demandent un marquage (sinon la photo entrerait vide dans le jeu) ; « À redresser » la renvoie a l'etape 2 (son marquage reste garde a
 * part sur le serveur).
 */
export function statutsPossibles(m: MetaImage): ChoixStatut[] {
  const marquee = m.statut === 'brouillon' || m.statut === 'corrigee' || (m.classes?.length ?? 0) > 0;
  const sans = marquee ? {} : { raison: 'Pas encore de marquage' };
  return [
    { id: 'a-marquer', libelle: 'À marquer', champs: { statut: 'validee', verifiee: false }, possible: true },
    { id: 'a-relire', libelle: 'À relire', champs: { statut: 'brouillon', verifiee: false }, possible: marquee, ...sans },
    { id: 'corrigee', libelle: 'Corrigée', champs: { statut: 'corrigee', verifiee: false }, possible: marquee, ...sans },
    { id: 'verifiee', libelle: 'Vérifiée', champs: { statut: 'corrigee', verifiee: true }, possible: marquee, ...sans },
    { id: 'rejetee', libelle: 'Rejetée', champs: { statut: 'rejetee', verifiee: false }, possible: true },
    { id: 'a-redresser', libelle: 'À redresser', champs: { statut: 'importee', verifiee: false }, possible: true },
  ];
}

/** Le statut de la liste qui est celui de la photo. */
export function statutActuel(m: MetaImage): string {
  if (m.statut === 'validee') return 'a-marquer';
  if (m.statut === 'brouillon') return 'a-relire';
  if (m.statut === 'corrigee') return m.verifiee ? 'verifiee' : 'corrigee';
  if (m.statut === 'rejetee') return 'rejetee';
  if (m.statut === 'importee') return 'a-redresser';
  return '';
}
