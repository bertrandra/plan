// Ce que la plateforme a accorde a cette session, la ou tout le monde peut le lire.
//
// La porte (app/porte.ts) s'ouvre avant que `app/boot.ts` ne soit importe : il n'y a donc pas de
// parametre a passer, puisque le module qui en a besoin n'existe pas encore quand la reponse
// arrive. Ce petit module sert de point de rendez-vous, et c'est la seule raison de son existence.
//
// Sans plateforme branchee, il reste vide et `droitsCourants()` laisse tout passer — ce qui est le
// comportement de la 1.2.0, et ce que le drapeau de l'etape 4 finira par rendre impossible.

import type { Droits } from './commandes.js';
import type { ServiceContexte } from '../plateforme/contexte.js';
import type { Session } from '../plateforme/session.js';

let session: Session | null = null;
let contexte: ServiceContexte | null = null;

export function poserAcces(s: Session, c: ServiceContexte): void {
  session = s;
  contexte = c;
}

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
    aPermission: (code) => contexte?.aPermission(code) ?? true,
    reste: (feature) => contexte?.quota(feature)?.reste ?? null
  };
}
