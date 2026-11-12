// La relecture d'un brouillon au clavier (demande du proprietaire, 12 novembre 2026 : « de la productivite ») : ce qui reste a relire
// (un objet du brouillon pas encore touche, ou un objet d'une classe a types sans type), dans l'ordre de lecture de la facade ; accepter,
// filtrer par score, decaler au pixel. Sans DOM, testable seul.

import type { Classe, Objet } from './types.js';
import { boite } from './geometrie.js';
import { changerClasse, changerType, deplacer } from './edition.js';

/** Un objet d'une classe a types, sans type : le modele n'apprendra rien de lui tant qu'il n'est pas qualifie. */
export const estAQualifier = (o: Objet, classes: readonly Classe[]): boolean => !!classes.find((c) => c.id === o.classe)?.types?.length && !o.type;

/** A relire : un objet du brouillon jamais touche, ou un objet a qualifier. */
export const estARelire = (o: Objet, classes: readonly Classe[]): boolean => o.origine === 'auto' || estAQualifier(o, classes);

/** Un objet du brouillon sous le seuil de score : masque a l'ecran (pas supprime), hors de la relecture. */
export const sousLeSeuil = (o: Objet, seuil: number): boolean => o.origine === 'auto' && o.score !== undefined && o.score < seuil;

/** L'ordre de lecture d'une facade : par rangees de haut en bas (a un vingtieme de la hauteur pres), puis de gauche a droite. */
export function ordreDeLecture(objets: readonly Objet[], hauteur: number): Objet[] {
  const pas = Math.max(1, hauteur / 20);
  return [...objets].sort((a, b) => {
    const ba = boite(a.points), bb = boite(b.points);
    return Math.round(ba.y0 / pas) - Math.round(bb.y0 / pas) || ba.x0 - bb.x0 || ba.y0 - bb.y0;
  });
}

/**
 * Le prochain objet a relire apres `depuis` (ou avant, `sens` -1), dans l'ordre de lecture, en recommencant au debut ; ceux sous le seuil
 * ne comptent pas. Null quand il n'y a plus rien a relire.
 */
export function prochainARelire(objets: readonly Objet[], classes: readonly Classe[], depuis: string | null, sens: 1 | -1, seuil: number, hauteur: number): string | null {
  const ordre = ordreDeLecture(objets.filter((o) => !sousLeSeuil(o, seuil)), hauteur);
  const candidats = ordre.filter((o) => estARelire(o, classes));
  if (!candidats.length) return null;
  const i = depuis ? ordre.findIndex((o) => o.id === depuis) : -1;
  if (i < 0) return (sens > 0 ? candidats[0] : candidats[candidats.length - 1])?.id ?? null;
  for (let k = 1; k <= ordre.length; k++) {
    const o = ordre[(i + sens * k + ordre.length * 2) % ordre.length] as Objet;
    if (estARelire(o, classes)) return o.id;
  }
  return null;
}

/** Accepte des objets du brouillon tels quels : ils deviennent « corriges » (relus). */
export function accepter(objets: readonly Objet[], ids: ReadonlySet<string>): Objet[] {
  return objets.map((o) => (ids.has(o.id) && o.origine === 'auto' ? { ...o, origine: 'corrige' } : o));
}

/** Les objets du brouillon au-dessus du seuil (score inconnu : au-dessus), a accepter d'un coup. */
export const auDessusDuSeuil = (objets: readonly Objet[], seuil: number): string[] => objets.filter((o) => o.origine === 'auto' && (o.score ?? 1) >= seuil).map((o) => o.id);

/** Decale des objets de (dx, dy) pixels de la photo, sans les sortir de l'image (les fleches du clavier). */
export function decaler(objets: readonly Objet[], ids: ReadonlySet<string>, dx: number, dy: number, L: number, H: number): Objet[] {
  return objets.map((o) => (ids.has(o.id) ? deplacer(o, dx, dy, L, H) : o));
}

/** Ou en est le lot de photos ouvert : relues (corrigees ou validees a la main), verifiees, encore en brouillon. */
export function avancement(images: readonly { statut: string; verifiee?: boolean }[]): { total: number; relues: number; verifiees: number; brouillons: number } {
  return {
    total: images.length,
    relues: images.filter((m) => m.statut === 'corrigee').length,
    verifiees: images.filter((m) => m.verifiee).length,
    brouillons: images.filter((m) => m.statut === 'brouillon').length,
  };
}

/**
 * Donne a des objets la classe et le type d'un choix de la palette (« classe » ou « classe:type ») : la classe change si elle differe
 * (les attributs qu'elle n'a pas partent), le type se pose. L'objet devient relu.
 */
export function qualifier(objets: readonly Objet[], ids: ReadonlySet<string>, cible: { classe: string; type?: string }, classes: readonly Classe[]): Objet[] {
  const k = classes.find((c) => c.id === cible.classe);
  if (!k) return [...objets];
  return objets.map((o) => {
    if (!ids.has(o.id)) return o;
    const avecClasse = o.classe === k.id ? o : changerClasse(o, k);
    const r = cible.type ? changerType(avecClasse, cible.type) : avecClasse;
    return r.origine === 'auto' ? { ...r, origine: 'corrige' } : r;
  });
}
