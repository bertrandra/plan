// Les tarifs et les plafonds de l'analyse par Claude, tels que l'administrateur les regle depuis le
// tableau de bord (MD/spec-audit.md 13.3, routes `admin/claude/tarifs` et `admin/claude/plafonds`).
//
// Le serveur verifie tout (deploy/analyse.php) ; ce module ne fait que
// preparer une modification qui a des chances d'etre acceptee, et dire pourquoi sinon, avant
// l'aller-retour. La regle qui compte : **un tarif passe ne se reecrit pas**. Un changement de prix
// ajoute une ligne datee d'aujourd'hui ou plus tard ; seule une ligne encore a venir se retire.

export const PRIX = ['entree', 'ecritureCache5m', 'ecritureCache1h', 'lectureCache', 'sortie'] as const;
export type ClePrix = typeof PRIX[number];
export type Prix = Record<ClePrix, number>;

export const NOMS_PRIX: Record<ClePrix, string> = {
  entree: 'Entrée',
  ecritureCache5m: 'Écriture du cache (5 min)',
  ecritureCache1h: 'Écriture du cache (1 h)',
  lectureCache: 'Lecture du cache',
  sortie: 'Sortie'
};

export interface LigneTarif extends Prix {
  modele: string;
  depuis: string;
  verifieLe: string;
  source?: string;
  remiseBatch: number;
  auDela?: Prix & { seuil: number };
}

export interface Tarifs {
  format: 'plan-claude-tarifs';
  lignes: LigneTarif[];
  [autre: string]: unknown;
}

export interface Plafonds {
  format: 'plan-claude-plafonds';
  defaut: { jour: number; mois: number };
  organisations: Record<string, { jour: number; mois: number }>;
  requetesParBatch: number;
  estimationRequete: number;
}

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const MODELE = /^claude-[a-z0-9-]{1,60}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const prixValides = (o: Record<string, unknown>): boolean => PRIX.every((k) => fini(o[k]) && (o[k] as number) >= 0);

/** La table des tarifs du serveur, ou `null` si elle n'en a pas la forme. */
export function lireTarifs(d: unknown): Tarifs | null {
  if (!d || typeof d !== 'object') return null;
  const t = d as Record<string, unknown>;
  if (t.format !== 'plan-claude-tarifs' || !Array.isArray(t.lignes)) return null;
  return t as unknown as Tarifs;
}

/** Les plafonds du serveur, ou `null`. */
export function lirePlafonds(d: unknown): Plafonds | null {
  if (!d || typeof d !== 'object') return null;
  const p = d as Record<string, unknown>;
  const paire = (o: unknown) => !!o && typeof o === 'object' && fini((o as Record<string, unknown>).jour) && fini((o as Record<string, unknown>).mois);
  if (p.format !== 'plan-claude-plafonds' || !paire(p.defaut) || !p.organisations || typeof p.organisations !== 'object') return null;
  return p as unknown as Plafonds;
}

/** Les lignes d'un modele, la plus recente d'abord. */
export function lignesDuModele(t: Tarifs, modele: string): LigneTarif[] {
  return t.lignes.filter((l) => l.modele === modele).sort((a, b) => (a.depuis < b.depuis ? 1 : a.depuis > b.depuis ? -1 : 0));
}

/** La ligne en vigueur ce jour-la pour ce modele (la plus recente qui le precede). */
export function tarifDuJour(t: Tarifs, modele: string, jour: string): LigneTarif | null {
  return lignesDuModele(t, modele).find((l) => l.depuis <= jour) ?? null;
}

/** Une ligne a venir peut se retirer ; une ligne en vigueur ou passee, jamais. */
export function ligneRetirable(l: LigneTarif, aujourdhui: string): boolean {
  return l.depuis > aujourdhui;
}

/**
 * La ligne qu'on propose d'ajouter pour un modele : les prix de sa derniere ligne, datee
 * d'aujourd'hui et verifiee aujourd'hui. Un modele sans ligne part de zero.
 */
export function ligneProposee(t: Tarifs, modele: string, aujourdhui: string): LigneTarif {
  const derniere = lignesDuModele(t, modele)[0];
  const base: LigneTarif = derniere
    ? { ...derniere, ...(derniere.auDela ? { auDela: { ...derniere.auDela } } : {}) }
    : { modele, depuis: aujourdhui, verifieLe: aujourdhui, entree: 0, ecritureCache5m: 0, ecritureCache1h: 0, lectureCache: 0, sortie: 0, remiseBatch: 0.5 };
  return { ...base, modele, depuis: aujourdhui, verifieLe: aujourdhui };
}

/** Ajoute une ligne datee ; rend la nouvelle table, ou la raison du refus (en francais, pour l'ecran). */
export function ajouterLigne(t: Tarifs, l: LigneTarif, aujourdhui: string): { tarifs: Tarifs } | { erreur: string } {
  if (!MODELE.test(l.modele)) return { erreur: 'Identifiant de modèle invalide (claude-…).' };
  if (!JOUR.test(l.depuis) || !JOUR.test(l.verifieLe)) return { erreur: 'Dates en AAAA-MM-JJ.' };
  if (l.depuis < aujourdhui) return { erreur: 'Un tarif ne s’applique pas au passé : datez-le d’aujourd’hui ou plus tard.' };
  if (t.lignes.some((x) => x.modele === l.modele && x.depuis === l.depuis)) return { erreur: 'Ce modèle a déjà un tarif à cette date.' };
  if (!prixValides(l as unknown as Record<string, unknown>)) return { erreur: 'Chaque prix est un nombre positif ou nul, en dollars par million de tokens.' };
  if (!(fini(l.remiseBatch) && l.remiseBatch > 0 && l.remiseBatch <= 1)) return { erreur: 'La remise Batch est un coefficient entre 0 et 1 (0,5 pour moitié prix).' };
  if (l.auDela && !(Number.isInteger(l.auDela.seuil) && l.auDela.seuil > 0 && prixValides(l.auDela as unknown as Record<string, unknown>))) {
    return { erreur: 'Le palier « au-delà » demande un seuil entier et des prix positifs.' };
  }
  return { tarifs: { ...t, lignes: [...t.lignes, l] } };
}

/** Retire une ligne a venir ; une ligne en vigueur reste. */
export function retirerLigne(t: Tarifs, l: LigneTarif, aujourdhui: string): Tarifs {
  if (!ligneRetirable(l, aujourdhui)) return t;
  return { ...t, lignes: t.lignes.filter((x) => x !== l) };
}

/** Verifie des plafonds saisis ; `null` s'ils conviennent, sinon la raison. */
export function erreurPlafonds(p: Plafonds): string | null {
  const paire = (o: { jour: number; mois: number }) => fini(o.jour) && o.jour >= 0 && fini(o.mois) && o.mois >= 0;
  if (!paire(p.defaut)) return 'Les plafonds par défaut sont des montants positifs, en dollars.';
  for (const [id, o] of Object.entries(p.organisations)) {
    if (!ID.test(id)) return 'Identifiant d’organisation invalide : « ' + id + ' » (lettres, chiffres, - et _).';
    if (!paire(o)) return 'Plafonds de « ' + id + ' » : des montants positifs, en dollars.';
  }
  if (!(Number.isInteger(p.requetesParBatch) && p.requetesParBatch >= 1 && p.requetesParBatch <= 1000)) return 'Requêtes par batch : un entier de 1 à 1 000.';
  if (!(fini(p.estimationRequete) && p.estimationRequete >= 0)) return 'L’estimation par requête est un montant positif.';
  return null;
}

// --- Le modele de chaque usage (route `admin/claude/modeles`) --------------------------------------
// Le serveur choisit le modele de chaque requete d'apres ce reglage, quand la demande n'en impose
// pas : la page n'envoie que des images et du texte. Il refuse un modele hors de sa liste (`admis`).

/** Les usages que l'administrateur regle, dans l'ordre de l'ecran. */
export const USAGES_REGLABLES: { id: string; libelle: string }[] = [
  { id: 'analyse', libelle: 'Analyse des audits' },
  { id: 'immediat', libelle: 'Aide immédiate' },
  { id: 'escalade', libelle: 'Escalade' },
  { id: 'candidats', libelle: 'Cas candidats' },
  { id: 'rejeu', libelle: 'Rejeu des audits' },
  { id: 'facade', libelle: 'Run d’une façade (audit, calibration, relevé)' }
];

/** Ce que rend `GET admin/claude/modeles` : le modele de chaque usage, les defauts, les modeles admis. */
export interface ModelesDesUsages {
  usages: Record<string, string>;
  defaut: Record<string, string>;
  admis: string[];
  /** L'administrateur a-t-il deja regle quelque chose (sinon, ce sont les defauts du serveur). */
  regle: boolean;
}

const chaines = (v: unknown): Record<string, string> => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'))
  : {});

/** La reponse du serveur, ou `null` si elle n'en a pas la forme. */
export function lireModeles(d: unknown): ModelesDesUsages | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  if (o.format !== 'plan-claude-modeles' || !Array.isArray(o.admis)) return null;
  return { usages: chaines(o.usages), defaut: chaines(o.defaut), admis: o.admis.filter((m): m is string => typeof m === 'string'), regle: o.regle === true };
}

/** Le reglage tel que le serveur le garde (`modeles.json`) : un modele par usage. */
export interface ReglageModeles {
  format: 'plan-claude-modeles';
  usages: Record<string, string>;
}

/** Le corps du `PUT` : un modele par usage (le serveur refuse un modele hors de sa liste). */
export function reglageModeles(usages: Record<string, string>): ReglageModeles {
  return { format: 'plan-claude-modeles', usages: { ...usages } };
}

/** Le prix d'un modele en vigueur ce jour, en dollars par million de tokens, hors remise Batch. */
export function prixAuMillion(t: Tarifs | null, modele: string, jour: string): { entree: number; sortie: number } | null {
  const l = t ? tarifDuJour(t, modele, jour) : null;
  return l ? { entree: l.entree, sortie: l.sortie } : null;
}
