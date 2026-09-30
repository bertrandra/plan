// Ce que la plateforme a accorde a cette session, la ou tout le monde peut le lire.
//
// La porte (app/porte.ts) s'ouvre avant que `app/boot.ts` ne soit importe : il n'y a donc pas de
// parametre a passer, puisque le module qui en a besoin n'existe pas encore quand la reponse
// arrive. Ce petit module sert de point de rendez-vous, et c'est la seule raison de son existence.
//
// Sans plateforme branchee, il reste vide et `droitsCourants()` laisse tout passer — ce qui est le
// comportement de la 1.2.0, et ce que le drapeau de l'etape 4 finira par rendre impossible.

import { CAPACITE_LECTURE_SEULE } from '../plateforme/capacites.js';
import type { Droits } from './commandes.js';
import type { ServiceContexte } from '../plateforme/contexte.js';
import type { Session } from '../plateforme/session.js';

let session: Session | null = null;
let contexte: ServiceContexte | null = null;

export function poserAcces(s: Session, c: ServiceContexte): void {
  session = s;
  contexte = c;
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

export function sessionCourante(): Session | null { return session; }
export function contexteCourant(): ServiceContexte | null { return contexte; }

/**
 * Les droits que le registre des commandes consulte.
 *
 * Lu a chaque appel plutot que fige une fois : le contexte se recharge quand le jeton tourne, et
 * une adhesion retiree entre-temps doit se voir sans redemarrer la page.
 */
export function droitsCourants(): Droits {
  return {
    branchee: () => contexte !== null,
    aCapacite: (code) => contexte?.aCapacite(code) ?? true,
    // Le droit d'ecrire passe par `peutEcrire`, pour que le registre et le badge ne puissent pas
    // se contredire. Les autres permissions se lisent telles quelles.
    aPermission: (code) => (code === PERMISSION_ECRITURE ? peutEcrire() : (contexte?.aPermission(code) ?? true)),
    reste: (feature) => contexte?.quota(feature)?.reste ?? null
  };
}
