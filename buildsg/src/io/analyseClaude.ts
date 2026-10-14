// Le client des routes de l'analyse par Claude (deploy/analyse.php, buildsg/analyseAdmin.mjs ;
// MD/spec-audit.md §13.2, lot L17). Quatre gestes : l'etat du serveur, creer un batch, lire son
// etat, lire ses resultats. La page n'envoie que la partie propre a la maison (images et textes) ;
// le prompt, le schema et la cle sont au serveur.
//
// Qui parle : l'administrateur par le cookie de sa session (depose par admin.php, jamais vu ici), ou
// un utilisateur de la plateforme par son jeton (`Authorization: Bearer`), que le serveur verifie
// aupres d'elle (plan D1). Le jeton est lu a chaque appel : il se renouvelle pendant une analyse.

import { ENTETE_ADMIN, RACINE_ADMIN } from './depotDemos.js';

type Fetch = (entree: string, init?: RequestInit) => Promise<Response>;

/** Un bloc de la requete, tel que l'API Messages le lit : du texte, ou une image en base64. */
export type BlocAnalyse =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } };

export interface RequeteAnalyse {
  id: string;
  passe: 1 | 2 | 3;
  /**
   * L'usage de cette requete, quand il n'est pas celui de la demande : le renfort d'une facade
   * (MD/spec-facades-calage-detection.md §12 bis, lot L18) part dans le batch de l'analyse avec son
   * propre prompt et son propre schema, choisis par le serveur.
   */
  usage?: UsageAnalyse;
  /** Les facades que la requete couvre, pour le journal (cout par facade). */
  facades: number;
  contenu: BlocAnalyse[];
}

export interface DemandeAnalyse {
  projet: string | null;
  idu: string | null;
  adresse: string | null;
  audit: string;
  usage: UsageAnalyse;
  requetes: RequeteAnalyse[];
}

/** Les usages que la page demande : l'analyse d'une maison (batch), le renfort d'une facade (batch ou appel immediat). */
export type UsageAnalyse = 'analyse' | 'renfort';

export interface EtatServeurAnalyse {
  actif: boolean;
  prompt: number;
  schema: number;
  organisation: string | null;
  admin: boolean;
}

export interface VueBatch {
  id: string;
  /** `in_progress`, `ended`, `canceling`… (Anthropic). */
  etat: string | null;
  compte: { processing: number; succeeded: number; errored: number; canceled: number; expired: number } | null;
}

export interface ResultatBatch {
  id: string;
  statut: 'reussi' | 'echoue' | 'expire' | 'annule';
  passe: number | null;
  /** L'usage de la requete (absent d'un serveur d'avant le lot L18 : `analyse`). */
  usage?: string;
  sortie: unknown;
  erreur: { type: string; message: string } | null;
}

export interface ResultatsBatch {
  batch: VueBatch;
  modele: string;
  prompt: number;
  schema: number;
  resultats: ResultatBatch[];
}

/** Pourquoi un appel a echoue : l'ecran dit quelque chose de different pour chacun. */
export type MotifAnalyse = 'reseau' | 'refuse' | 'plafond' | 'nonConfigure' | 'pasPret' | 'introuvable' | 'serveur';

export class EchecAnalyse extends Error {
  constructor(readonly motif: MotifAnalyse, message: string) { super(message); }
}

export interface ClientAnalyse {
  etat(): Promise<EtatServeurAnalyse>;
  creerBatch(d: DemandeAnalyse): Promise<{ batch: VueBatch; modele: string; prompt: number; schema: number }>;
  etatBatch(id: string): Promise<VueBatch>;
  /** 409 (`pasPret`) tant que le batch n'est pas termine. */
  resultats(id: string): Promise<ResultatsBatch>;
  /**
   * L'appel immediat (le bouton « Demander de l'aide » du releve, lot L18) : trois requetes au plus,
   * au tarif normal ; les resultats arrivent dans la reponse.
   */
  immediat(d: DemandeAnalyse): Promise<ResultatsImmediats>;
}

export interface ResultatsImmediats {
  modele: string;
  prompt: number;
  schema: number;
  resultats: ResultatBatch[];
}

const MOTIFS: Record<number, MotifAnalyse> = { 401: 'refuse', 403: 'refuse', 404: 'introuvable', 409: 'pasPret', 429: 'plafond', 503: 'nonConfigure' };

async function refus(r: Response, quoi: string): Promise<EchecAnalyse> {
  let message = 'HTTP ' + r.status;
  try {
    const d = await r.json() as { error?: { message?: string } };
    if (d.error?.message) message = d.error.message;
  } catch { /* corps vide ou illisible : le statut suffit */ }
  return new EchecAnalyse(MOTIFS[r.status] ?? 'serveur', quoi + ' : ' + message);
}

/**
 * Le client, sur ce `fetch` et ce jeton. `jeton` est relu a chaque appel ; `null` quand la personne
 * est l'administrateur (le cookie de sa session suffit) ou hors plateforme.
 */
export function creerClientAnalyse(f: Fetch, jeton: () => string | null): ClientAnalyse {
  async function appeler<T>(chemin: string, quoi: string, init: RequestInit = {}): Promise<T> {
    const j = jeton();
    const entetes: Record<string, string> = { ...(init.headers as Record<string, string> | undefined), ...(j ? { Authorization: 'Bearer ' + j } : {}) };
    let r: Response;
    try {
      r = await f(RACINE_ADMIN + '/claude' + chemin, { credentials: 'same-origin', cache: 'no-store', ...init, headers: entetes });
    } catch (e) {
      throw new EchecAnalyse('reseau', quoi + ' : ' + ((e as Error).message || String(e)));
    }
    if (!r.ok) throw await refus(r, quoi);
    try { return await r.json() as T; } catch { throw new EchecAnalyse('serveur', quoi + ' : réponse illisible'); }
  }
  return {
    async etat() {
      const d = await appeler<Partial<EtatServeurAnalyse>>('/etat', 'état de l’analyse');
      return { actif: d.actif === true, prompt: Number(d.prompt ?? 0), schema: Number(d.schema ?? 0), organisation: typeof d.organisation === 'string' ? d.organisation : null, admin: d.admin === true };
    },
    creerBatch: (d) => appeler('/batches', 'envoi de l’analyse', { method: 'POST', headers: { 'Content-Type': 'application/json', ...ENTETE_ADMIN }, body: JSON.stringify(d) }),
    etatBatch: (id) => appeler('/batches/' + encodeURIComponent(id), 'suivi de l’analyse'),
    resultats: (id) => appeler('/batches/' + encodeURIComponent(id) + '/resultats', 'résultats de l’analyse'),
    immediat: (d) => appeler('/messages', 'demande d’aide à Claude', { method: 'POST', headers: { 'Content-Type': 'application/json', ...ENTETE_ADMIN }, body: JSON.stringify(d) }),
  };
}
