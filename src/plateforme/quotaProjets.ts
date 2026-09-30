// Le nombre de projets : celui que l'abonnement autorise, et ce qu'il en reste.
//
// **Le bon compteur.** La plateforme refuse un projet de trop sur le quota `max_projects`, a la
// creation comme a la copie (backprod, `ProjectWorkspace::QUOTA`, `QuotaPolicy::assertMayConsume`) :
// elle compte les projets de l'organisation sur ce produit, supprimes exclus, et refuse des que
// `utilises >= limite`. Plan lisait `plan.documents`, un compteur que seul un serveur de Plan
// alimenterait — il n'y en a pas —, si bien qu'il ne se croyait jamais a la limite et laissait la
// plateforme dire non avec un code brut. Il lit desormais le meme quota qu'elle.
//
// **Le bon nombre.** Le contexte (`/me/context`) est garde en cache le temps du jeton : un projet
// cree depuis n'y est pas encore compte. Plan prend donc le plus grand de ce qu'elle a compte et
// de ce qu'il voit lui-meme dans la liste : il ne se croit jamais plus au large qu'il ne l'est.

import type { ServiceContexte } from './contexte.js';

/** Le quota que la plateforme applique aux projets, tel qu'elle le nomme. */
export const QUOTA_PROJETS = 'max_projects';

export interface LimiteProjets { limite: number; utilise: number; reste: number }

let projetsConnus = 0;

/** Le nombre de projets que Plan a vus dans la liste de la plateforme. */
export function retenirProjetsConnus(n: number): void { projetsConnus = Math.max(0, n); }

/** La limite de projets, alignee sur la plateforme ; `null` : illimite, ou pas de quota. */
export function limiteProjets(q: ReturnType<ServiceContexte['quota']>, connus = projetsConnus): LimiteProjets | null {
  if (!q || q.illimite || q.limite === null) return null;
  const compte = q.utilise ?? (q.reste !== null ? q.limite - q.reste : 0);
  const utilise = Math.max(compte, connus);
  return { limite: q.limite, utilise, reste: Math.max(0, q.limite - utilise) };
}

const projets = (n: number) => n + (n > 1 ? ' projets' : ' projet');

/** La phrase a dire quand la limite est atteinte. */
export function phraseLimite(l: { limite: number; utilise: number } | null): string {
  const combien = l
    ? ' : ' + projets(l.utilise) + ' pour ' + l.limite + ' autorisé' + (l.limite > 1 ? 's' : '') + ' par son abonnement'
    : '';
  return 'Votre organisation a atteint sa limite de projets' + combien + '. Pour en créer un nouveau — copie ou '
    + 'depuis une adresse —, supprimez un projet ou changez d’offre sur la plateforme.';
}
