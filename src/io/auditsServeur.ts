// Les audits de parcelle sur le serveur de Plan (MD/spec-audit.md §15) : le fichier
// `plan-audit-parcelle` part dans les donnees de l'administrateur (`admin/audits`, servi par
// deploy/analyse.php et buildsg/analyseAdmin.mjs, meme contrat), et l'administrateur les catalogue.
//
// Deux sortes de depots, que la fiche du serveur distingue par sa marque (en-tete `X-Plan-Depot`) :
//   - `corpus` : le partage « pour améliorer Plan » (decision D7), apres une validation, revocable ;
//   - `sauvegarde` : la copie de securite prise pendant la capture, pour que rien ne se perde avec le
//     telephone (app/audit/parcelle/sauvegarde.ts). Le meme depot est remplace a chaque envoi (PUT).
// Le fichier lui-meme ne change pas : la marque dit pourquoi il a ete depose, pas ce qu'il contient.
//
// Qui envoie : l'administrateur par le cookie de sa session (jamais vu ici), ou un utilisateur de la
// plateforme par son jeton (`Authorization: Bearer`), que le serveur verifie aupres d'elle. Le
// serveur rend un secret de retrait : lui seul (ou l'administrateur) remplace ou retire ensuite le
// fichier. Le jeton est lu a chaque appel : il se renouvelle. La liste et la lecture sont a
// l'administrateur seul.

import { ENTETE_ADMIN, RACINE_ADMIN } from './depotDemos.js';
import type { FichierAuditParcelle } from '../model/fichierAuditParcelle.js';

type Fetch = (entree: string, init?: RequestInit) => Promise<Response>;

/** L'en-tete qui porte le secret de retrait : jamais dans l'adresse, qui se retrouve dans les journaux. */
export const ENTETE_RETRAIT = 'X-Plan-Retrait';
/** L'en-tete qui dit pourquoi le fichier est depose ; absent, le serveur compte un depot `corpus`. */
export const ENTETE_DEPOT = 'X-Plan-Depot';
/**
 * Ce que le serveur accepte au plus (`TAILLE_MAX` des deux serveurs) : la page le dit avant d'envoyer
 * plutot que de faire partir 50 Mo pour un refus. Un hebergement PHP peut refuser avant (memoire,
 * `post_max_size` d'une configuration stricte) : son refus est alors montre tel quel.
 */
export const TAILLE_MAX_AUDIT = 48 * 1024 * 1024;

export type MarqueDepot = 'corpus' | 'sauvegarde';

/** La fiche d'un audit recu (`GET admin/audits`), sans le fichier ; les champs absents d'un ancien depot sont nuls. */
export interface FicheAudit {
  id: string;
  recuLe: string;
  organisation: string | null;
  idu: string;
  adresse: string | null;
  taille: number | null;
  marque: MarqueDepot;
  /** Les photos du fichier, toutes lignes comprises. */
  photos: number | null;
  /** `capture` : la capture n'etait pas terminee ; `analyse` : « Lancer l'analyse » etait passe. */
  phase: 'capture' | 'analyse' | null;
  /** Le debut de la visite (ISO). */
  debut: string | null;
}

export interface ClientAudits {
  /** Depose le fichier ; rend son identifiant et le secret qui permet de le remplacer ou de le retirer. */
  envoyer(fichier: FichierAuditParcelle | string, marque?: MarqueDepot): Promise<{ id: string; retrait: string }>;
  /**
   * Remplace un depot par ce fichier, sous le meme identifiant : par son secret, ou par la session de
   * l'administrateur (secret vide). Un depot retire entre-temps leve un echec de statut 404.
   */
  remplacer(id: string, retrait: string, fichier: FichierAuditParcelle | string, marque?: MarqueDepot): Promise<{ id: string; retrait: string }>;
  /** Retire un fichier depose ; un fichier deja absent compte comme retire. */
  retirer(id: string, retrait: string): Promise<void>;
  /** Les audits recus, les plus recents d'abord (administrateur). */
  lister(): Promise<FicheAudit[]>;
  /** Le fichier d'un audit recu, tel qu'il est arrive, a l'octet pres (administrateur). */
  lire(id: string): Promise<string>;
}

/**
 * Un echec, dit en clair : le toast le montre tel quel. `statut` : celui du serveur, ou null quand
 * le serveur n'a pas repondu (hors ligne) ; c'est ce qui decide d'un nouvel essai.
 */
export class EchecPartageAudit extends Error {
  constructor(message: string, readonly statut: number | null = null) { super(message); }
}

async function refus(r: Response, quoi: string): Promise<EchecPartageAudit> {
  let message = 'HTTP ' + r.status;
  try {
    const d = await r.json() as { error?: { message?: string } };
    if (d.error?.message) message = d.error.message;
  } catch { /* corps vide ou illisible : le statut suffit */ }
  return new EchecPartageAudit(quoi + ' : ' + message, r.status);
}

const texte = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Une fiche lue, ou null si elle n'en a pas la forme ; un ancien depot (sans marque) est du corpus. */
export function lireFicheAudit(v: unknown): FicheAudit | null {
  const a = v as Record<string, unknown> | null;
  if (!a || typeof a !== 'object' || typeof a.id !== 'string' || typeof a.idu !== 'string') return null;
  return {
    id: a.id, recuLe: texte(a.recuLe) ?? '', organisation: texte(a.organisation), idu: a.idu, adresse: texte(a.adresse),
    taille: typeof a.taille === 'number' ? a.taille : null,
    marque: a.marque === 'sauvegarde' ? 'sauvegarde' : 'corpus',
    photos: typeof a.photos === 'number' ? a.photos : null,
    phase: a.phase === 'capture' || a.phase === 'analyse' ? a.phase : null,
    debut: texte(a.debut),
  };
}

const corps = (f: FichierAuditParcelle | string) => (typeof f === 'string' ? f : JSON.stringify(f));

export function creerClientAudits(f: Fetch, jeton: () => string | null): ClientAudits {
  async function appeler(chemin: string, quoi: string, init: RequestInit): Promise<Response> {
    const j = jeton();
    const entetes: Record<string, string> = { ...ENTETE_ADMIN, ...(init.headers as Record<string, string> | undefined), ...(j ? { Authorization: 'Bearer ' + j } : {}) };
    let r: Response;
    try {
      r = await f(RACINE_ADMIN + '/audits' + chemin, { credentials: 'same-origin', cache: 'no-store', ...init, headers: entetes });
    } catch (e) {
      throw new EchecPartageAudit(quoi + ' : ' + ((e as Error).message || String(e)));
    }
    return r;
  }
  const ecriture = (marque: MarqueDepot) => ({ 'Content-Type': 'application/json', [ENTETE_DEPOT]: marque });
  return {
    async envoyer(fichier, marque = 'corpus') {
      const r = await appeler('', 'partage de l’audit', { method: 'POST', headers: ecriture(marque), body: corps(fichier) });
      if (!r.ok) throw await refus(r, 'partage de l’audit');
      const d = await r.json().catch(() => null) as { id?: unknown; retrait?: unknown } | null;
      if (typeof d?.id !== 'string' || typeof d.retrait !== 'string') throw new EchecPartageAudit('partage de l’audit : réponse illisible du serveur', r.status);
      return { id: d.id, retrait: d.retrait };
    },
    async remplacer(id, retrait, fichier, marque = 'sauvegarde') {
      const r = await appeler('/' + encodeURIComponent(id), 'envoi de l’audit', {
        method: 'PUT', headers: { ...ecriture(marque), ...(retrait ? { [ENTETE_RETRAIT]: retrait } : {}) }, body: corps(fichier),
      });
      if (!r.ok) throw await refus(r, 'envoi de l’audit');
      return { id, retrait };
    },
    async retirer(id, retrait) {
      const r = await appeler('/' + encodeURIComponent(id), 'retrait de l’audit', { method: 'DELETE', headers: retrait ? { [ENTETE_RETRAIT]: retrait } : {} });
      if (!r.ok && r.status !== 404) throw await refus(r, 'retrait de l’audit');
    },
    async lister() {
      const r = await appeler('', 'liste des audits reçus', { method: 'GET' });
      if (!r.ok) throw await refus(r, 'liste des audits reçus');
      const d = await r.json().catch(() => null) as { audits?: unknown } | null;
      if (!d || !Array.isArray(d.audits)) throw new EchecPartageAudit('liste des audits reçus : réponse illisible du serveur', r.status);
      return d.audits.map(lireFicheAudit).filter((a): a is FicheAudit => a !== null);
    },
    async lire(id) {
      const r = await appeler('/' + encodeURIComponent(id), 'lecture de l’audit « ' + id + ' »', { method: 'GET' });
      if (!r.ok) throw await refus(r, 'lecture de l’audit « ' + id + ' »');
      return r.text();
    },
  };
}
