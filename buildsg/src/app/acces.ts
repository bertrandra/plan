// Ce que la plateforme a accorde a cette session, la ou tout le monde peut le lire.
//
// La porte (app/porte.ts) s'ouvre avant que `app/boot.ts` ne soit importe : il n'y a donc pas de
// parametre a passer, puisque le module qui en a besoin n'existe pas encore quand la reponse
// arrive. Ce petit module sert de point de rendez-vous, et c'est la seule raison de son existence.
//
// Sans plateforme branchee, il reste vide et `droitsCourants()` laisse tout passer — ce qui est le
// comportement de la 1.2.0, et ce que le drapeau de l'etape 4 finira par rendre impossible.

import { CAPACITE_LECTURE_SEULE, CAPACITES } from '../plateforme/capacites.js';
import { showToast } from '../shell/dialogs.js';
import { PHRASE_QUOTA, type Droits } from './commandes.js';
import type { ServiceContexte } from '../plateforme/contexte.js';
import type { Session } from '../plateforme/session.js';
import { QUOTA_PROJETS, limiteProjets, compteProjets, phraseLimite, type LimiteProjets, type CompteProjets } from '../plateforme/quotaProjets.js';

let session: Session | null = null;
let contexte: ServiceContexte | null = null;

export function poserAcces(s: Session, c: ServiceContexte): void {
  session = s;
  contexte = c;
}

/**
 * Les capacites que Plan accorde en dur a tous les comptes, quoi que dise la plateforme (decision
 * du 7 octobre 2026) : `plan.relief` n'est pas encore declaree ni attribuee dans backprod, et la
 * lecture du relief disparaissait pour tout le monde. A retirer d'ici une fois la plateforme a jour :
 * l'avertissement de l'admin le rappelle a chaque ouverture tant qu'elle ne l'attribue pas.
 */
export const CAPACITES_FORCEES: readonly string[] = [CAPACITES.relief.code];

/** Les capacites forcees que la plateforme n'attribue pas a ce compte ; toutes, hors plateforme. */
export function capacitesForceesSansDroit(): string[] {
  return CAPACITES_FORCEES.filter((c) => !contexte?.aCapacite(c));
}

/** La personne administre : l'admin des demos, ou un role d'administration chez la plateforme. */
export function estAdministrateur(): boolean {
  return admin || !!contexte?.courant()?.roles.some((r) => /admin/i.test(r));
}

/**
 * L'avertissement a montrer a l'admin, ou `null` : une capacite forcee en dur que la plateforme
 * n'attribue pas. Les autres comptes n'en voient rien, ils ont simplement la fonction.
 */
export function avertissementCapacitesForcees(): string | null {
  const sansDroit = capacitesForceesSansDroit();
  if (!sansDroit.length || !estAdministrateur()) return null;
  const noms = sansDroit.map((c) => {
    const cap = Object.values(CAPACITES).find((x) => x.code === c);
    return (cap ? '« ' + cap.libelle + ' » ' : '') + '(' + c + ')';
  }).join(', ');
  return 'Avertissement administrateur : ' + noms + (sansDroit.length > 1 ? ' sont accordées' : ' est accordée')
    + ' en dur par Plan à tous les comptes, quelle que soit leur formule.'
    + (contexte ? ' La plateforme ne l’attribue pas à ce compte : déclarez-la et attribuez-la dans backprod, puis retirez-la de CAPACITES_FORCEES (app/acces.ts).' : '');
}

/** A l'ouverture : l'avertissement de l'admin, en notification et dans la console, s'il y a lieu. */
export function prevenirAdminDesCapacitesForcees(): void {
  const texte = avertissementCapacitesForcees();
  if (!texte) return;
  console.warn(texte);
  showToast(texte);
}

/** Le droit d'ecrire sur l'organisation, tel que la plateforme le nomme. */
export const PERMISSION_ECRITURE = 'projects.write';

/**
 * Cette personne peut-elle ecrire sur cette organisation ?
 *
 * **Une seule question, un seul endroit.** Deux autorites y repondent, et il a fallu les reunir :
 * le badge de la barre d'etat ecoutait la capacite pendant que le registre des commandes ecoutait
 * la permission, si bien qu'un lecteur voyait « Lecture seule » avec une palette entiere.
 *
 * - **le role donne `projects.write`** : la plateforme dit ce que cette personne peut faire sur
 *   cette organisation, quelle que soit l'offre ;
 * - **le siege ne porte pas `plan.readonly`** : une place de lecture, moins chere qu'une place de
 *   travail, retire le droit d'ecrire a son porteur seul. C'est la seule capacite qui retire au
 *   lieu de donner (plateforme/capacites.ts).
 *
 * Il faut les deux. Hors plateforme — sous vitest, par exemple — vrai : il n'y a personne a qui
 * demander, et Plan se comporte comme il le faisait seul.
 */
export function peutEcrire(): boolean {
  if (vitrine) return false;
  if (contexte === null) return true;
  return contexte.aPermission(PERMISSION_ECRITURE) && !contexte.aCapacite(CAPACITE_LECTURE_SEULE);
}

/** Le plan ne peut pas etre modifie. L'envers de `peutEcrire`, une fois la plateforme la. */
export function enLectureSeule(): boolean {
  return vitrine || (contexte !== null && !peutEcrire());
}

/**
 * La vitrine publique (app/vitrine.ts) : pas de plateforme, et pourtant pas « tout permis ». Le plan
 * de demonstration s'y regarde, il ne s'y modifie pas.
 */
let vitrine = false;
export function entrerEnVitrine(): void { vitrine = true; }

/** L'admin des demos (app/porteAdmin.ts) : la barre propose alors d'en sortir, pas la plateforme. */
let admin = false;
export function entrerEnAdmin(): void { admin = true; }
export function enAdmin(): boolean { return admin; }

export function sessionCourante(): Session | null { return session; }
export function contexteCourant(): ServiceContexte | null { return contexte; }

/** La limite de projets de l'organisation, alignee sur la plateforme ; `null` : illimite, ou hors plateforme. */
export function limiteProjetsCourante(): LimiteProjets | null {
  return limiteProjets(contexte?.quota(QUOTA_PROJETS) ?? null);
}

/** Le compteur de projets a montrer ; `null` hors plateforme. */
export function compteProjetsCourant(): CompteProjets | null {
  return contexte ? compteProjets(contexte.quota(QUOTA_PROJETS)) : null;
}

/**
 * Les droits que le registre des commandes consulte.
 *
 * Lu a chaque appel plutot que fige une fois : le contexte se recharge quand le jeton tourne, et
 * une adhesion retiree entre-temps doit se voir sans redemarrer la page.
 */
export function droitsCourants(): Droits {
  return {
    branchee: () => contexte !== null,
    // Une capacite forcee en dur passe toujours (CAPACITES_FORCEES ci-dessus).
    aCapacite: (code) => CAPACITES_FORCEES.includes(code) || (contexte?.aCapacite(code) ?? true),
    // Le droit d'ecrire passe par `peutEcrire`, pour que le registre et le badge ne puissent pas
    // se contredire. Les autres permissions se lisent telles quelles.
    aPermission: (code) => (code === PERMISSION_ECRITURE ? peutEcrire() : (contexte?.aPermission(code) ?? true)),
    // Le quota des projets s'aligne sur ce que la plateforme applique (plateforme/quotaProjets.ts).
    reste: (feature) => {
      const q = contexte?.quota(feature) ?? null;
      if (feature === QUOTA_PROJETS && q) return q.illimite ? null : (limiteProjets(q)?.reste ?? q.reste);
      return q?.reste ?? null;
    },
    phraseQuota: (feature) => (feature === QUOTA_PROJETS
      ? phraseLimite(limiteProjets(contexte?.quota(feature) ?? null))
      : PHRASE_QUOTA)
  };
}
