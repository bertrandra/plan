// Les types d'analyseAdmin.mjs, pour les tests (tests/unit/buildsg/) : le serveur reste en
// JavaScript pur, sans build, comme app.js.
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface Tokens {
  entree: number;
  ecritureCache: number;
  ecritureCache1h: number;
  lectureCache: number;
  sortie: number;
}

export interface PrixTarif {
  entree: number;
  ecritureCache5m: number;
  ecritureCache1h: number;
  lectureCache: number;
  sortie: number;
}

export interface LigneTarif extends PrixTarif {
  modele: string;
  depuis: string;
  verifieLe: string;
  source?: string;
  remiseBatch: number;
  auDela?: PrixTarif & { seuil: number };
}

export interface Tarifs {
  format: 'plan-claude-tarifs';
  lignes: LigneTarif[];
}

export interface Plafonds {
  format: 'plan-claude-plafonds';
  defaut: { jour: number; mois: number };
  organisations: Record<string, { jour: number; mois: number }>;
  requetesParBatch: number;
  estimationRequete: number;
}

export interface ResultatLu {
  id: string;
  statut: 'reussi' | 'echoue' | 'expire' | 'annule';
  arret: string | null;
  tokens: Tokens;
  sortie: unknown;
  erreur: { type: string; message: string } | null;
}

export const VERSION_API: string;
export const MODELES: string[];
export const USAGES: string[];
export const MAX_TOKENS: number;
export const EFFORT: string;
export const PLAFONDS_DEFAUT: Readonly<Plafonds>;
/** Le prompt et le schema de chaque usage qui a les siens (le renfort, lot L18). */
export const FICHIERS_PAR_USAGE: Readonly<Record<string, [string, string]>>;
/** Les requetes d'un appel immediat, au plus. */
export const REQUETES_IMMEDIATES: number;

export function lirePrompt(texte: string): { version: number; texte: string };
export function tokensDeUsage(usage: unknown): Tokens;
export function tarifEnVigueur(tarifs: Tarifs | null, modele: string, jour: string): LigneTarif | null;
export function coutAppel(tokens: Tokens, ligne: LigneTarif | null, batch: boolean): number | null;
export function depenses(lignes: unknown[], organisation: string, jour: string): { jour: number; mois: number };
export function plafondDe(plafonds: Plafonds, organisation: string): { jour: number; mois: number };
/** Le modele de chaque usage tant que l'administrateur n'a rien regle. */
export const MODELE_PAR_USAGE: Readonly<Record<string, string>>;

/** Le reglage des modeles par usage (`admin/claude/modeles`), tel que le serveur le garde. */
export interface ReglageModeles {
  format: 'plan-claude-modeles';
  usages: Record<string, string>;
}
export function modelesParUsage(reglage: unknown): Record<string, string>;
export function verifierModeles(d: unknown): ReglageModeles;
export function vueModeles(reglage: ReglageModeles | null): {
  format: 'plan-claude-modeles'; usages: Record<string, string>; defaut: Record<string, string>; admis: string[]; regle: boolean;
};

/** Ce qu'une reponse contient, en comptes (journal, champ `trouve`). */
export interface Trouvailles {
  ouvertures: number; manquees: number; enTrop: number; bouts: number; lucarnes: number;
  elements: number; ecarts: number; coins: number; determines: number; vide: boolean;
}
export const COMPTES: readonly (keyof Omit<Trouvailles, 'vide'>)[];
export function comptesSortie(sortie: unknown, usage: string): Trouvailles | null;
export function trouvailles(x: Pick<ResultatLu, 'statut' | 'erreur' | 'sortie'>, usage: string): Trouvailles | null;

export function verifierDemande(d: unknown, plafonds: Plafonds, modeles?: Readonly<Record<string, string>>): {
  projet: string | null; idu: string | null; adresse: string | null; audit: string | null;
  usage: string; modele: string;
  requetes: { id: string; passe: number | null; images: number; facades: number; usage: string; modele: string; contenu: unknown[] }[];
};
/** La consigne qui precede le schema de la reponse dans le prompt (deploy/analyse.php, meme texte). */
export const CONSIGNE_JSON: string;
/** Le prompt envoye en system : la partie fixe, puis le schema de la reponse. */
export function promptAvecSchema(prompt: string, schema: unknown): string;
/** L'objet JSON d'une reponse : le texte entier, sinon de la premiere accolade a la derniere. */
export function objetJsonDuTexte(texte: string): Record<string, unknown> | null;
/** Un terme ramene a la graphie du vocabulaire (minuscules, sans accents, tirets). */
export function termeNormalise(v: string): string;
/** `v` ramene au schema `s` ; `ok` faux quand il ne s'y ramene pas. */
export function conformer(v: unknown, s: unknown, defs: unknown, racine?: boolean): { ok: boolean; v: unknown };
/** La sortie d'une reponse dans la forme de son schema, ou `null` si elle n'est pas un objet JSON. */
export function sortieConforme(texte: string, schema: unknown): Record<string, unknown> | null;
export function parametresRequete(modele: string, prompt: string, schema: unknown, contenu: unknown[]): Record<string, unknown>;
export function verifierTarifs(d: unknown): Tarifs;
export function passeGarde(ancien: Tarifs | null, nouveau: Tarifs, jour: string): boolean;
export function verifierPlafonds(d: unknown): Plafonds;
export function lireResultat(ligne: unknown, schema?: unknown): ResultatLu;

export interface FiltresConsommation {
  du: string;
  au: string;
  organisation: string | null;
  modele: string | null;
  usage: string | null;
  parcelle: string | null;
}

export const MOIS_CONSULTABLES: number;
export function decalerJour(jour: string, n: number): string;
export function moisEntre(du: string, au: string): string[];
export function lireFiltres(params: URLSearchParams, aujourdhui: string): FiltresConsommation;
export function filtrerConsommation(lignes: unknown[], filtres: Pick<FiltresConsommation, 'du' | 'au'> & Partial<FiltresConsommation>): Record<string, unknown>[];
export function etatOrganisations(lignesDuMois: unknown[], plafonds: Plafonds, jour: string): { id: string; jour: number; mois: number; plafond: { jour: number; mois: number } }[];
export function choixConsommation(lignes: unknown[], plafonds: Plafonds): {
  organisations: string[]; modeles: string[]; usages: string[]; parcelles: { idu: string; adresse: string | null }[];
};

// Les audits de parcelle partages pour le corpus (MD/spec-audit.md 15, lot L21).
export function verifierAudit(d: unknown): { nature: 'parcelle' | 'promenade'; idu: string; adresse: string | null; commune?: string | null };
/** Les marques d'un depot : `sauvegarde` de la capture, ou partage pour le `corpus` (par defaut). */
export const MARQUES_AUDIT: readonly ('corpus' | 'sauvegarde')[];
export function marqueAudit(entete: string | string[] | undefined, defaut?: 'corpus' | 'sauvegarde'): 'corpus' | 'sauvegarde';
/** Ce que la fiche dit du fichier pour le catalogue : photos, phase, debut de la visite. */
export function resumeAudit(d: unknown): {
  photos: number; phase: 'capture' | 'analyse'; debut: string | null;
  propositions?: { total: number; claude: number; mesures: number; validees: number; refusees: number; enAttente: number };
  cas?: number; statuts?: Record<string, number>;
};
/** La conclusion d'un audit, lisible a la main (`decisions.json`). */
export function decisionsAudit(d: unknown): Record<string, unknown>;
/** Un nom de dossier sur : ASCII, lettres, chiffres, `-` et `_`. */
export function nomSur(v: string | null | undefined, defaut: string, minuscules?: boolean): string;
/** Le dossier d'un audit, relatif a `audits/`. */
export function dossierRelatifAudit(fiche: { id: string; nature?: string; idu?: string; commune?: string | null }): string;
/** Le texte brut d'une ligne de resultats d'Anthropic. */
export function texteBrut(ligne: unknown): string | null;

// Les mesures des indicateurs de conformite (MD/spec-regles-toits.md 13.5, lot G3).
export const MESURES_CONFORMITE_MAX: number;
export function verifierMesureConformite<T>(d: T): T;

export function creerAnalyseAdmin(options: {
  dossier: string;
  donnees?: import('./donnees.mjs').DossiersDonnees | null;
  actif: boolean;
  sessionValide: (req: IncomingMessage) => boolean;
  cle: string | undefined;
  anthropicUrl?: string;
  plateformeUrl?: string;
  deploy?: string;
  maintenant?: () => number;
}): {
  actif: boolean;
  traiter(req: IncomingMessage, res: ServerResponse, url: URL, base: Record<string, string>): Promise<boolean>;
};
