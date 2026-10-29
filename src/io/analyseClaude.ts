// Le client des routes de l'analyse par Claude (deploy/analyse.php ;
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
   * L'usage de cette requete, quand il n'est pas celui de la demande : le run d'une facade
   * (MD/spec-facade-calage-audit.md §8, lot F3) part dans le batch de l'analyse avec son
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
  /**
   * L'audit du serveur (`admin/audits/<id>`) dont c'est l'analyse : le serveur y garde ce qui part et
   * ce qui revient (MD/spec-audit.md 15.5). Exige par un rejeu ; absent, rien n'est garde.
   */
  depot?: string | null;
  /** Le modele choisi (un rejeu pour comparer) ; absent, celui que l'administrateur a regle pour l'usage. */
  modele?: string;
  /**
   * L'essai du brouillon des regles (Admin › Regles, « Enregistrer sur le serveur ») : l'analyse part avec
   * le prompt et le schema du brouillon au lieu de ceux du depot. Administrateur seul ; le serveur refuse
   * s'il n'a pas de brouillon. Jamais pour le run des facades, qui garde son prompt.
   */
  essai?: 'brouillon';
  usage: UsageAnalyse;
  requetes: RequeteAnalyse[];
}

/**
 * Les usages demandes : l'analyse d'une maison (batch), l'escalade des passes en desaccord vers un modele plus
 * fin (appel immediat, D20), les cas candidats Panoramax du skill regles-toits (lot G3 bis, hors de la page), le
 * rejeu d'un audit stocke (administrateur, spec-audit 15.5), et le run d'une facade (lots F2 et F3 : appel immediat pour la
 * calibration et le releve, une requete par facade dans le batch de l'audit).
 */
export type UsageAnalyse = 'analyse' | 'escalade' | 'candidats' | 'rejeu' | 'facade';

export interface EtatServeurAnalyse {
  actif: boolean;
  /** Les modeles que le serveur admet (`MODELES`) : ceux qu'un rejeu peut choisir. */
  modeles?: string[];
  prompt: number;
  schema: number;
  organisation: string | null;
  admin: boolean;
  /** Le brouillon des regles enregistre au serveur (administrateur seul) ; null : aucun. */
  brouillon?: BrouillonServeur | null;
  /** L'escalade d'une facade : le modele de l'usage `escalade` et ses prix du jour ($ par million de tokens ; null : sans tarif). */
  escaladeFacade?: { modele: string; prix: { entree: number; sortie: number } | null };
}

/** Ce que l'etat dit du brouillon des regles du serveur : ses versions et sa date. */
export interface BrouillonServeur { enregistreLe: string | null; prompt: number; schema: number }

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
  /** `apercu` : pour une sortie illisible, le debut du texte que le modele a ecrit (400 caracteres au plus), pour la diagnostiquer. */
  erreur: { type: string; message: string; apercu?: string } | null;
  /** L'appel immediat dit aussi ce que la requete a coute : ses tokens, et son cout en dollars (null : tarif manquant). */
  tokens?: { entree: number; ecritureCache: number; lectureCache: number; sortie: number };
  cout?: number | null;
  /** Une requete d'un autre usage que le batch (le run d'une facade) : son modele et les versions de son prompt et de son schema. */
  modele?: string;
  prompt?: number;
  schema?: number;
  /** L'appel immediat : la sortie structuree (`output_config.format`) a-t-elle servi ? Faux apres un repli sans elle. */
  structuree?: boolean;
  /**
   * Les images de la requete telles que le serveur les a recues et gardees (lot L0) : l'empreinte de leurs octets, leur taille, leur
   * type, dans l'ordre ; absentes d'un serveur d'avant le lot.
   */
  empreintes?: ImageGardee[];
}

/** Une image envoyee a Claude, gardee par le serveur sous son empreinte (`images/<sha256>.<ext>`). */
export interface ImageGardee { sha256: string; octets: number; type: string }

export interface ResultatsBatch {
  batch: VueBatch;
  modele: string;
  prompt: number;
  schema: number;
  /** Le batch est parti avec le brouillon des regles. */
  essai?: boolean;
  resultats: ResultatBatch[];
}

/** Pourquoi un appel a echoue : l'ecran dit quelque chose de different pour chacun. */
export type MotifAnalyse = 'reseau' | 'refuse' | 'plafond' | 'nonConfigure' | 'pasPret' | 'introuvable' | 'serveur';

export class EchecAnalyse extends Error {
  constructor(readonly motif: MotifAnalyse, message: string) { super(message); }
}

export interface ClientAnalyse {
  etat(): Promise<EtatServeurAnalyse>;
  /** `trace` : l'analyse gardee dans le dossier de l'audit (`depot`), ou null. */
  creerBatch(d: DemandeAnalyse): Promise<{ batch: VueBatch; modele: string; prompt: number; schema: number; essai?: boolean; trace?: string | null }>;
  etatBatch(id: string): Promise<VueBatch>;
  /** 409 (`pasPret`) tant que le batch n'est pas termine. */
  resultats(id: string): Promise<ResultatsBatch>;
  /**
   * L'appel immediat (le run d'une facade : l'aide du releve, « Rappeler Claude » de la calibration) : trois requetes au plus,
   * au tarif normal ; les resultats arrivent dans la reponse.
   */
  immediat(d: DemandeAnalyse): Promise<ResultatsImmediats>;
}

export interface ResultatsImmediats {
  modele: string;
  prompt: number;
  schema: number;
  /** La trace de l'appel sur le serveur (lot L0 : toute requete en laisse une) ; absente d'un serveur d'avant. */
  trace?: string;
  resultats: ResultatBatch[];
}

/** Le brouillon d'un etat de serveur ; null quand il n'y en a pas (ou sur un serveur d'avant). */
export function lireBrouillonServeur(v: unknown): BrouillonServeur | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return { enregistreLe: typeof o.enregistreLe === 'string' ? o.enregistreLe : null, prompt: Number(o.prompt) || 0, schema: Number(o.schema) || 0 };
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
/** Le modele de l'escalade et ses prix, tels que l'etat les dit ; un prix illisible se lit « sans tarif », jamais invente. */
function lireEscaladeFacade(v: unknown): EtatServeurAnalyse['escaladeFacade'] {
  const o = v as { modele?: unknown; prix?: { entree?: unknown; sortie?: unknown } | null } | null | undefined;
  if (!o || typeof o.modele !== 'string') return undefined;
  const p = o.prix, fini = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  return { modele: o.modele, prix: p && fini(p.entree) && fini(p.sortie) ? { entree: p.entree, sortie: p.sortie } : null };
}

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
      const etat: EtatServeurAnalyse = {
        actif: d.actif === true, prompt: Number(d.prompt ?? 0), schema: Number(d.schema ?? 0), organisation: typeof d.organisation === 'string' ? d.organisation : null, admin: d.admin === true,
        modeles: Array.isArray(d.modeles) ? d.modeles.filter((m): m is string => typeof m === 'string') : [],
        brouillon: lireBrouillonServeur(d.brouillon),
      };
      const escalade = lireEscaladeFacade(d.escaladeFacade);
      return escalade ? { ...etat, escaladeFacade: escalade } : etat;
    },
    creerBatch: (d) => appeler('/batches', 'envoi de l’analyse', { method: 'POST', headers: { 'Content-Type': 'application/json', ...ENTETE_ADMIN }, body: JSON.stringify(d) }),
    etatBatch: (id) => appeler('/batches/' + encodeURIComponent(id), 'suivi de l’analyse'),
    resultats: (id) => appeler('/batches/' + encodeURIComponent(id) + '/resultats', 'résultats de l’analyse'),
    immediat: (d) => appeler('/messages', 'demande d’aide à Claude', { method: 'POST', headers: { 'Content-Type': 'application/json', ...ENTETE_ADMIN }, body: JSON.stringify(d) }),
  };
}
