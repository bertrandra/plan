// Ouvrir un lien de partage (ADR-073 de la plateforme, lot 6 du parcours client) : la seule operation que Plan appelle sans session.
//
// `POST /api/v1/public/shares/open { token }` : sans jeton d'acces, sans `X-Product` ni `X-Tenant` (la lecture prend tout du
// lien), sans cookie (`credentials: 'omit'` : la personne qui lit n'a pas de compte, et un cookie de la plateforme qu'elle aurait
// n'a rien a faire ici). Le jeton voyage dans le corps, jamais dans le chemin ni dans la chaine de requete.
//
// **Le jeton ne sort jamais de cette fonction** : aucun message d'erreur, aucun journal ne le porte. Une defaillance se dit par sa
// raison, et c'est tout.

import { OPERATIONS, type ReponseOpenSharedProject } from './contrat.js';
import { adresse } from './config.js';

export type RaisonLecturePartage =
  /** `404 SHARE_NOT_FOUND`, la reponse unique de tout refus : expire, retire, mal copie, projet supprime, abonnement suspendu. */
  | 'introuvable'
  /** `429` : la limite publique de la plateforme. */
  | 'tropDeTentatives'
  /** Pas de reponse (reseau, plateforme injoignable, navigateur qui bloque). */
  | 'reseau'
  /** Une autre reponse : la plateforme a repondu de travers. */
  | 'panne';

export class EchecLecturePartage extends Error {
  constructor(readonly raison: RaisonLecturePartage, readonly statut: number | null = null) {
    super('lecture du lien de partage : ' + raison + (statut ? ' (' + statut + ')' : ''));
    this.name = 'EchecLecturePartage';
  }
}

/** Le jeton tel que la plateforme le fabrique : base64url, 43 caracteres aujourd'hui ; on admet une marge, rien d'autre. */
export const MOTIF_JETON_PARTAGE = /^[A-Za-z0-9_-]{16,256}$/;

export async function ouvrirLienPartage(jeton: string, lire: typeof fetch = (...a) => fetch(...a)): Promise<ReponseOpenSharedProject> {
  // Un jeton mal forme ne part pas : la plateforme dirait 404, autant le dire sans aller-retour.
  if (!MOTIF_JETON_PARTAGE.test(jeton)) throw new EchecLecturePartage('introuvable');
  const op = OPERATIONS.openSharedProject;
  let r: Response;
  try {
    r = await lire(adresse(op.chemin), {
      method: op.methode, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token: jeton })
    });
  } catch {
    throw new EchecLecturePartage('reseau');
  }
  if (r.status === 404) throw new EchecLecturePartage('introuvable', 404);
  if (r.status === 429) throw new EchecLecturePartage('tropDeTentatives', 429);
  if (r.status !== op.succes) throw new EchecLecturePartage('panne', r.status);
  try {
    const d = (await r.json()) as ReponseOpenSharedProject;
    if (!d || typeof d !== 'object' || !d.project || typeof d.project !== 'object') throw new Error('forme');
    return d;
  } catch {
    throw new EchecLecturePartage('panne', r.status);
  }
}
