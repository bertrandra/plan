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
export function verifierDemande(d: unknown, plafonds: Plafonds): {
  projet: string | null; idu: string | null; adresse: string | null; audit: string | null;
  usage: string; modele: string;
  requetes: { id: string; passe: number | null; images: number; facades: number; usage: string; modele: string; contenu: unknown[] }[];
};
export function parametresRequete(modele: string, prompt: string, schema: unknown, contenu: unknown[]): Record<string, unknown>;
export function verifierTarifs(d: unknown): Tarifs;
export function passeGarde(ancien: Tarifs | null, nouveau: Tarifs, jour: string): boolean;
export function verifierPlafonds(d: unknown): Plafonds;
export function lireResultat(ligne: unknown): ResultatLu;

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

export function creerAnalyseAdmin(options: {
  dossier: string;
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
