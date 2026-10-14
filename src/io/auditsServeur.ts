// Le partage d'un audit de parcelle pour le corpus (MD/spec-audit.md §15, decision D7) : le fichier
// `plan-audit-parcelle` part sur le serveur de Plan, dans les donnees de l'administrateur
// (`admin/audits`, servi par deploy/analyse.php et buildsg/analyseAdmin.mjs).
//
// Qui envoie : l'administrateur par le cookie de sa session (jamais vu ici), ou un utilisateur de la
// plateforme par son jeton (`Authorization: Bearer`), que le serveur verifie aupres d'elle. Le
// serveur rend un secret de retrait : lui seul (ou l'administrateur) retire ensuite le fichier, quand
// la personne decoche la case. Le jeton est lu a chaque appel : il se renouvelle.

import { ENTETE_ADMIN, RACINE_ADMIN } from './depotDemos.js';
import type { FichierAuditParcelle } from '../model/fichierAuditParcelle.js';

type Fetch = (entree: string, init?: RequestInit) => Promise<Response>;

/** L'en-tete qui porte le secret de retrait : jamais dans l'adresse, qui se retrouve dans les journaux. */
export const ENTETE_RETRAIT = 'X-Plan-Retrait';

export interface ClientAudits {
  /** Depose le fichier ; rend son identifiant et le secret qui permet de le retirer. */
  envoyer(fichier: FichierAuditParcelle): Promise<{ id: string; retrait: string }>;
  /** Retire un fichier depose ; un fichier deja absent compte comme retire. */
  retirer(id: string, retrait: string): Promise<void>;
}

/** Un echec, dit en clair : le toast le montre tel quel. */
export class EchecPartageAudit extends Error {}

async function refus(r: Response, quoi: string): Promise<EchecPartageAudit> {
  let message = 'HTTP ' + r.status;
  try {
    const d = await r.json() as { error?: { message?: string } };
    if (d.error?.message) message = d.error.message;
  } catch { /* corps vide ou illisible : le statut suffit */ }
  return new EchecPartageAudit(quoi + ' : ' + message);
}

export function creerClientAudits(f: Fetch, jeton: () => string | null): ClientAudits {
  async function appeler(chemin: string, quoi: string, init: RequestInit): Promise<Response> {
    const j = jeton();
    const entetes: Record<string, string> = { ...ENTETE_ADMIN, ...(init.headers as Record<string, string> | undefined), ...(j ? { Authorization: 'Bearer ' + j } : {}) };
    try {
      return await f(RACINE_ADMIN + '/audits' + chemin, { credentials: 'same-origin', cache: 'no-store', ...init, headers: entetes });
    } catch (e) {
      throw new EchecPartageAudit(quoi + ' : ' + ((e as Error).message || String(e)));
    }
  }
  return {
    async envoyer(fichier) {
      const r = await appeler('', 'partage de l’audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fichier) });
      if (!r.ok) throw await refus(r, 'partage de l’audit');
      const d = await r.json().catch(() => null) as { id?: unknown; retrait?: unknown } | null;
      if (typeof d?.id !== 'string' || typeof d.retrait !== 'string') throw new EchecPartageAudit('partage de l’audit : réponse illisible du serveur');
      return { id: d.id, retrait: d.retrait };
    },
    async retirer(id, retrait) {
      const r = await appeler('/' + encodeURIComponent(id), 'retrait de l’audit', { method: 'DELETE', headers: { [ENTETE_RETRAIT]: retrait } });
      if (!r.ok && r.status !== 404) throw await refus(r, 'retrait de l’audit');
    },
  };
}
