// Les analyses et les rejeux d'un audit, gardes sur le serveur dans le dossier de l'audit
// (MD/spec-audit.md 15.5 ; deploy/analyse.php et buildsg/analyseAdmin.mjs, meme contrat) : pour
// chacun, ce qui est parti chez Claude (entrant), ce qu'il a rendu (sortant) et leur resume. A
// l'administrateur seul, en lecture : la page les montre et les exporte, elle n'y ecrit rien.
//
//   GET admin/audits/<id>/analyses           les resumes, les plus recents d'abord
//   GET admin/audits/<id>/analyses/<trace>   le resume, l'entrant et le sortant
//   GET admin/audits/<id>/images/<nom>       une image envoyee (`<sha256>.jpg`)

import { RACINE_ADMIN } from './depotDemos.js';

type Fetch = (entree: string, init?: RequestInit) => Promise<Response>;

/** Ce qu'une reponse contient, en comptes (le champ `trouve` du journal, `comptesSortie` du serveur). */
export interface Trouve {
  ouvertures: number; manquees: number; enTrop: number; bouts: number; lucarnes: number;
  elements: number; ecarts: number; coins: number; determines: number; vide: boolean;
}

export interface TokensAnalyse { entree: number; ecritureCache: number; ecritureCache1h: number; lectureCache: number; sortie: number }

/** Une requete de l'analyse, revenue : son statut, ses comptes, son cout. */
export interface ResultatResume {
  id: string;
  passe: number | null;
  usage: string;
  modele: string;
  statut: 'reussi' | 'echoue' | 'expire' | 'annule';
  arret: string | null;
  erreur: { type: string; message: string } | null;
  tokens: TokensAnalyse;
  cout: number | null;
  trouve: Trouve | null;
}

/** Le resume d'une analyse ou d'un rejeu (`resume.json`). */
export interface ResumeAnalyse {
  id: string;
  audit: string;
  nature: 'analyse' | 'rejeu';
  etat: 'en_cours' | 'termine';
  creeLe: string;
  finLe: string | null;
  idBatch: string;
  organisation: string | null;
  usage: string;
  modele: string;
  effort: string | null;
  prompt: number;
  schema: number;
  versions: Record<string, { prompt: number; schema: number }>;
  requetes: number;
  images: number;
  facades: number;
  resultats: ResultatResume[] | null;
  cout: number | null;
  tokens: TokensAnalyse | null;
}

/** Un bloc envoye : du texte tel quel, ou une image par son nom dans `images/`. */
export type BlocEntrant = { type: 'text'; text: string } | { type: 'image'; media_type: string; image: string; octets: number };

export interface RequeteEntrante {
  id: string;
  passe: number | null;
  usage: string;
  modele: string;
  facades: number;
  images: number;
  contenu: BlocEntrant[];
}

/** Ce qui est parti (`entrant.json`) : le texte complet envoye en system pour chaque usage, et les requetes. */
export interface Entrant {
  max_tokens: number;
  effort: string;
  usages: Record<string, { prompt: number; schema: number; systeme: string; schemaJson: unknown }>;
  requetes: RequeteEntrante[];
}

/** Ce qui est revenu (`sortant.json`) : le texte brut de Claude et la sortie ramenee au schema. */
export interface ResultatSortant extends ResultatResume {
  texte: string | null;
  sortie: unknown;
  tarif: string | null;
}

export interface Sortant { idBatch: string; finLe: string; resultats: ResultatSortant[] }

export interface AnalyseComplete {
  audit: string;
  resume: ResumeAnalyse;
  entrant: Entrant | null;
  /** Null tant que le batch n'est pas lu. */
  sortant: Sortant | null;
}

export interface ClientAnalysesAudits {
  lister(audit: string): Promise<ResumeAnalyse[]>;
  lire(audit: string, trace: string): Promise<AnalyseComplete>;
  /** L'adresse d'une image envoyee, pour une vignette (`<img src>`, la session admin suffit). */
  urlImage(audit: string, nom: string): string;
}

export class EchecAnalysesAudit extends Error {
  constructor(message: string, readonly statut: number | null = null) { super(message); }
}

export function creerClientAnalysesAudits(f: Fetch): ClientAnalysesAudits {
  const adresse = (audit: string, ...reste: string[]) => RACINE_ADMIN + '/audits/' + [audit, ...reste].map(encodeURIComponent).join('/');
  async function lireJson<T>(url: string, quoi: string): Promise<T> {
    let r: Response;
    try { r = await f(url, { credentials: 'same-origin', cache: 'no-store' }); } catch (e) { throw new EchecAnalysesAudit(quoi + ' : ' + ((e as Error).message || String(e))); }
    if (!r.ok) {
      let message = 'HTTP ' + r.status;
      try { const d = await r.json() as { error?: { message?: string } }; if (d.error?.message) message = d.error.message; } catch { /* le statut suffit */ }
      throw new EchecAnalysesAudit(quoi + ' : ' + message, r.status);
    }
    try { return await r.json() as T; } catch { throw new EchecAnalysesAudit(quoi + ' : réponse illisible du serveur', r.status); }
  }
  return {
    async lister(audit) {
      const d = await lireJson<{ analyses?: unknown }>(adresse(audit, 'analyses'), 'analyses de l’audit');
      return Array.isArray(d.analyses) ? d.analyses.filter((x): x is ResumeAnalyse => !!x && typeof x === 'object' && typeof (x as ResumeAnalyse).id === 'string') : [];
    },
    lire: (audit, trace) => lireJson<AnalyseComplete>(adresse(audit, 'analyses', trace), 'analyse « ' + trace + ' »'),
    urlImage: (audit, nom) => adresse(audit, 'images', nom),
  };
}
