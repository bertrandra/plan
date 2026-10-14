// Les reglages de la disposition automatique des ouvertures, sortis du code dans
// regles/facades/reglages.json (MD/spec-facades-calage-detection.md §15.2, plan de la vague 3, D18
// et D19).
//
// Le fichier est importe, donc compile dans le fichier livre, comme regles/toits/reglages.json : une
// facade dessinee hier se redessine a l'identique. Ses seuils sont le profil par defaut, egal aux
// constantes d'avant le fichier. Un profil en surcharge quelques-uns pour les batiments qui remplissent
// toutes ses conditions, dites dans un vocabulaire ferme de ce qui se sait d'un batiment sans le
// voir : son departement (tire de l'IDU de la parcelle du projet), son epoque (`date_d_apparition`
// de la BD TOPO), son usage (`usage_1`), son nombre d'etages et sa mitoyennete. Jamais une adresse ni
// un batiment : ce serait un releve deguise.
//
// Un profil s'applique en entier : ses dimensions vont ensemble (une fenetre plus haute et son appui),
// les meler a celles d'un autre ferait une facade que personne n'a vue. Le plus precis (le plus de
// conditions) l'emporte ; deux profils de meme precision qui peuvent tomber sur le meme batiment font
// refuser le fichier - c'est la CI qui le dit, pas un batiment tire au sort en production.
//
// Le profil retenu se range sur le batiment (`profilFacades`), avec la version de la lecture qui l'a
// choisi ; l'empreinte des reglages entre dans cette version : une valeur ou un profil change fait
// rechoisir les profils en tache de fond (app/profilsFacadesFond.ts), comme les toits se relisent.

import fichier from '../../regles/facades/reglages.json';
import { fnv1a } from './reglagesToits.js';

type Seuils = typeof fichier.seuils;
/** Le nom d'un reglage des facades, tel que le fichier l'ecrit. */
export type NomReglageFacade = keyof Seuils;
/** Les valeurs de tous les reglages : celles du profil par defaut, surchargees par un profil. */
export type ValeursFacades = { readonly [K in NomReglageFacade]: number };

/** L'identifiant du profil par defaut : les seuils du fichier, sans surcharge. */
export const PROFIL_FACADES_DEFAUT = 'defaut';

/** Les usages de la BD TOPO (`usage_1`), tels qu'elle les ecrit. */
export const USAGES_FACADES = ['Résidentiel', 'Agricole', 'Annexe', 'Commercial et services', 'Indifférencié', 'Industriel', 'Religieux', 'Sportif'] as const;
export type UsageFacades = (typeof USAGES_FACADES)[number];
/** La part du contour collee a un autre batiment, en trois niveaux (les memes mots que les toits, T§6). */
export const NIVEAUX_MITOYENNETE_FACADES = ['aucune', 'partielle', 'forte'] as const;
export type MitoyenneteFacades = (typeof NIVEAUX_MITOYENNETE_FACADES)[number];
/**
 * Les seuils des niveaux, sur la part du perimetre collee (a 50 cm pres) : un pavillon jumele colle un
 * mur sur quatre (20 a 30 %), une maison de rang deux (40 % et plus). Ils donnent leur sens aux
 * profils : ils entrent dans l'empreinte des qu'un profil existe.
 */
export const MITOYENNETE_PARTIELLE_MIN = 0.05;
export const MITOYENNETE_FORTE_MIN = 0.4;
export const TOLERANCE_MITOYENNETE_M = 0.5;

export function niveauMitoyennete(part: number): MitoyenneteFacades {
  return part >= MITOYENNETE_FORTE_MIN ? 'forte' : part >= MITOYENNETE_PARTIELLE_MIN ? 'partielle' : 'aucune';
}

/** Une plage : `min` compris, `max` exclu (deux plages qui se suivent ne se recouvrent pas). */
export interface Plage { min?: number; max?: number }

/** Les conditions d'un profil : toutes doivent etre remplies ; une condition absente n'est pas verifiee. */
export interface QuandProfilFacades {
  /** Codes de departement : `"78"`, `"2A"`, `"971"`. */
  departements?: string[];
  /** L'annee de `date_d_apparition` ; inconnue, la condition n'est pas remplie. */
  epoque?: Plage;
  usages?: UsageFacades[];
  /** Le nombre d'etages de la BD TOPO. */
  etages?: Plage;
  mitoyennete?: MitoyenneteFacades[];
}
export type CleConditionFacades = keyof QuandProfilFacades;
/** Le vocabulaire, dans l'ordre : ce qu'un profil peut dire, et rien d'autre. */
export const VOCABULAIRE_PROFILS_FACADES: readonly CleConditionFacades[] = ['departements', 'epoque', 'usages', 'etages', 'mitoyennete'];

/** Un profil lu et verifie. */
export interface ProfilFacades {
  id: string;
  quand: QuandProfilFacades;
  surcharges: Partial<Record<NomReglageFacade, number>>;
  pourquoi: string;
  /** Les facades relevees qui l'ont montre (corpus des audits). */
  cas: string[];
}

/** Ce qu'on sait d'un batiment pour choisir son profil ; `null` : inconnu, la condition n'est pas remplie. */
export interface DescriptionFacades {
  departement: string | null;
  epoque: number | null;
  usage: string | null;
  etages: number | null;
  mitoyennete: MitoyenneteFacades | null;
}

/** Un fichier illisible ne doit pas laisser dessiner des facades avec un reglage manquant. */
export class ReglagesFacadesIllisibles extends Error {}

const refuser = (texte: string): never => { throw new ReglagesFacadesIllisibles('regles/facades/reglages.json : ' + texte); };
const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Les seuils du fichier, verifies : chacun a une valeur finie et positive. */
function lireSeuils(v: unknown): Record<string, number> {
  if (!estObjet(v)) return refuser('seuils manquants');
  const out: Record<string, number> = {};
  for (const [nom, s] of Object.entries(v)) {
    const x = estObjet(s) ? s.valeur : undefined;
    if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) return refuser(nom + ' sans valeur numerique positive');
    out[nom] = x;
  }
  return out;
}

/** Un code de departement : deux caracteres (2A et 2B pour la Corse, pas 20), trois outre-mer. */
export const DEPARTEMENT = /^(0[1-9]|1\d|2[1-9AB]|[3-8]\d|9[0-5]|97[1-6])$/;
const LISTES: Partial<Record<CleConditionFacades, readonly string[] | RegExp>> = {
  departements: DEPARTEMENT, usages: USAGES_FACADES, mitoyennete: NIVEAUX_MITOYENNETE_FACADES,
};

function lirePlage(id: string, cle: string, v: unknown): Plage {
  if (!estObjet(v)) return refuser(id + ' : ' + cle + ' attend { min, max }');
  const p: Plage = {};
  for (const [k, x] of Object.entries(v)) {
    if (k !== 'min' && k !== 'max') return refuser(id + ' : ' + cle + ' ne connait que min et max, pas ' + k);
    if (typeof x !== 'number' || !Number.isFinite(x)) return refuser(id + ' : ' + cle + '.' + k + ' doit etre un nombre');
    p[k] = x;
  }
  if (p.min === undefined && p.max === undefined) return refuser(id + ' : ' + cle + ' sans borne');
  if (p.min !== undefined && p.max !== undefined && p.min >= p.max) return refuser(id + ' : ' + cle + ' vide (min >= max)');
  return p;
}

function lireListe(id: string, cle: CleConditionFacades, v: unknown): string[] {
  // Un mot seul vaut une liste d'un mot : `"mitoyennete": "forte"`.
  const liste = typeof v === 'string' ? [v] : v;
  if (!Array.isArray(liste) || !liste.length) return refuser(id + ' : ' + cle + ' attend une liste non vide');
  const admis = LISTES[cle];
  for (const x of liste) {
    const ok = typeof x === 'string' && (admis instanceof RegExp ? admis.test(x) : !!admis?.includes(x));
    if (!ok) return refuser(id + ' : ' + cle + ' ne connait pas ' + JSON.stringify(x));
  }
  return [...new Set(liste as string[])];
}

function lireQuand(id: string, v: unknown): QuandProfilFacades {
  if (!estObjet(v) || !Object.keys(v).length) return refuser(id + ' : quand doit dire au moins une condition (sans condition, c\'est le profil par defaut a changer)');
  const inconnue = Object.keys(v).find((cle) => !VOCABULAIRE_PROFILS_FACADES.includes(cle as CleConditionFacades));
  if (inconnue) return refuser(id + ' : condition inconnue ' + inconnue + ' (vocabulaire ferme : ' + VOCABULAIRE_PROFILS_FACADES.join(', ') + ')');
  // Dans l'ordre du vocabulaire : l'empreinte ne depend pas de l'ordre d'ecriture du fichier.
  const q: Record<string, unknown> = {};
  for (const cle of VOCABULAIRE_PROFILS_FACADES) {
    if (v[cle] === undefined) continue;
    q[cle] = cle === 'epoque' || cle === 'etages' ? lirePlage(id, cle, v[cle]) : lireListe(id, cle, v[cle]);
  }
  return q as QuandProfilFacades;
}

function lireSurcharges(id: string, v: unknown, seuils: Readonly<Record<string, number>>): Partial<Record<NomReglageFacade, number>> {
  if (!estObjet(v) || !Object.keys(v).length) return refuser(id + ' : surcharges doit changer au moins un reglage');
  const out: Record<string, number> = {};
  for (const [nom, x] of Object.entries(v).sort(([m], [n]) => (m < n ? -1 : 1))) {
    if (!(nom in seuils)) return refuser(id + ' : reglage inconnu ' + nom);
    if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) return refuser(id + ' : ' + nom + ' doit etre un nombre positif');
    out[nom] = x;
  }
  return out;
}

function lireProfil(v: unknown, seuils: Readonly<Record<string, number>>): ProfilFacades {
  if (!estObjet(v)) return refuser('profils : un profil doit etre un objet');
  const id = typeof v.id === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.id) && v.id !== PROFIL_FACADES_DEFAUT ? v.id : refuser('profils : id manquant, mal forme (minuscules et tirets) ou reserve : ' + JSON.stringify(v.id));
  const inconnus = Object.keys(v).filter((k) => !['id', 'quand', 'surcharges', 'pourquoi', 'cas'].includes(k));
  if (inconnus.length) return refuser(id + ' : champ inconnu ' + inconnus.join(', '));
  const pourquoi = typeof v.pourquoi === 'string' && v.pourquoi.trim().length > 10 ? v.pourquoi : refuser(id + ' : pourquoi manquant');
  // Un profil nait d'un ecart mesure sur des facades relevees (G13) : il cite au moins une facade.
  const cas = Array.isArray(v.cas) && v.cas.length >= 1 && v.cas.every((c) => typeof c === 'string' && c) ? (v.cas as string[]) : refuser(id + ' : un profil cite les facades relevees qui l\'ont montre (cas)');
  return { id, quand: lireQuand(id, v.quand), surcharges: lireSurcharges(id, v.surcharges, seuils), pourquoi, cas };
}

/** La precision d'un profil : le nombre de ses conditions. */
export const precisionFacades = (p: ProfilFacades): number => Object.keys(p.quand).length;

const plagesSeRecouvrent = (a: Plage, b: Plage): boolean => (a.min ?? -Infinity) < (b.max ?? Infinity) && (b.min ?? -Infinity) < (a.max ?? Infinity);

/**
 * Deux profils peuvent-ils tomber sur le meme batiment ? Oui, sauf si une condition qu'ils ont en
 * commun les separe (des listes sans mot commun, des plages disjointes). Des conditions differentes ne
 * se comparent pas (un departement et une epoque) : on les tient pour compatibles, par prudence.
 */
export function compatiblesFacades(a: QuandProfilFacades, b: QuandProfilFacades): boolean {
  for (const cle of VOCABULAIRE_PROFILS_FACADES) {
    const x = a[cle], y = b[cle];
    if (x === undefined || y === undefined) continue;
    if (Array.isArray(x) && Array.isArray(y) ? !x.some((m) => (y as string[]).includes(m)) : !plagesSeRecouvrent(x as Plage, y as Plage)) return false;
  }
  return true;
}

/** Les conflits : meme precision, et un batiment qui pourrait remplir les deux (le profil s'applique en entier). */
export function conflitsProfilsFacades(profils: readonly ProfilFacades[]): string[] {
  const out: string[] = [];
  profils.forEach((a, i) => profils.slice(i + 1).forEach((b) => {
    if (precisionFacades(a) === precisionFacades(b) && compatiblesFacades(a.quand, b.quand)) out.push(a.id + ' et ' + b.id + ' (precision ' + precisionFacades(a) + ')');
  }));
  return out;
}

/** Le fichier lu et verifie : les seuils du profil par defaut, et les profils. */
export interface ReglagesFacades {
  seuils: ValeursFacades;
  profils: ProfilFacades[];
}

/**
 * Le fichier, verifie : format, seuils, vocabulaire ferme, reglages connus, ids uniques, pas de
 * conflit. Exportee pour les tests, qui l'essaient sur des fichiers abimes et sur un profil d'essai.
 */
export function lireReglagesFacades(donnees: unknown): ReglagesFacades {
  if (!estObjet(donnees) || donnees.format !== 'plan-reglages-facades') return refuser('format inconnu');
  const seuils = lireSeuils(donnees.seuils);
  const manquant = Object.keys(fichier.seuils).find((nom) => !(nom in seuils));
  if (manquant) refuser(manquant + ' manquant');
  if (donnees.profils !== undefined && !Array.isArray(donnees.profils)) refuser('profils : une liste est attendue');
  const profils = ((donnees.profils ?? []) as unknown[]).map((p) => lireProfil(p, seuils));
  const ids = profils.map((p) => p.id);
  const double = ids.find((id, i) => ids.indexOf(id) !== i);
  if (double) refuser('profils : deux profils s\'appellent ' + double);
  const conflits = conflitsProfilsFacades(profils);
  if (conflits.length) refuser('profils : a precision egale, le plus precis ne se decide pas : ' + conflits.join(' ; '));
  return { seuils: seuils as ValeursFacades, profils };
}

/** La valeur de la description qu'une condition regarde. */
function valeurPour(cle: CleConditionFacades, d: DescriptionFacades): string | number | null {
  switch (cle) {
    case 'departements': return d.departement;
    case 'epoque': return d.epoque;
    case 'usages': return d.usage;
    case 'etages': return d.etages;
    case 'mitoyennete': return d.mitoyennete;
  }
}

/** Le batiment remplit-il toutes les conditions du profil ? Une valeur inconnue ne remplit rien. */
export function profilFacadesApplicable(p: ProfilFacades, d: DescriptionFacades): boolean {
  return (Object.keys(p.quand) as CleConditionFacades[]).every((cle) => {
    const v = valeurPour(cle, d), c = p.quand[cle];
    if (v === null) return false;
    if (Array.isArray(c)) return typeof v === 'string' && (c as string[]).includes(v);
    const plage = c as Plage;
    return typeof v === 'number' && v >= (plage.min ?? -Infinity) && v < (plage.max ?? Infinity);
  });
}

/**
 * Le profil de ce batiment : le plus precis de ceux qui s'appliquent ; aucun, le profil par defaut
 * (`null`). A precision egale, `lireReglagesFacades` a deja refuse le fichier ; le premier du fichier
 * l'emporte alors, pour qu'un jeu de profils non verifie (un test) reste deterministe.
 */
export function choisirProfilFacades(profils: readonly ProfilFacades[], d: DescriptionFacades): ProfilFacades | null {
  let retenu: ProfilFacades | null = null;
  for (const p of profils) if (profilFacadesApplicable(p, d) && (!retenu || precisionFacades(p) > precisionFacades(retenu))) retenu = p;
  return retenu;
}

const LIVRES = lireReglagesFacades(fichier);
/** Les valeurs du profil par defaut : celles d'avant le fichier. */
export const REGLAGES_FACADES: ValeursFacades = LIVRES.seuils;
/** Les profils livres (aucun tant que le corpus n'en a montre, plan de la vague 3, G14). */
export const PROFILS_FACADES: readonly ProfilFacades[] = LIVRES.profils;
/** La description de chaque reglage, pour la dire (scripts, tests). */
export const DESCRIPTION_REGLAGES_FACADES: Seuils = fichier.seuils;

/** Les valeurs d'un profil : celles du defaut, surchargees des siennes. */
export function valeursDuProfil(p: ProfilFacades | null, defaut: ValeursFacades = REGLAGES_FACADES): ValeursFacades {
  return p ? { ...defaut, ...p.surcharges } : defaut;
}

/**
 * Les valeurs du profil range sur un batiment. Un id que les profils livres ne connaissent plus (un
 * profil retire) donne le defaut : la version de lecture a change avec lui, le profil sera rechoisi.
 */
export function valeursFacadesDe(o: { profilFacades?: { id: string } | null | undefined } | null | undefined, profils: readonly ProfilFacades[] = PROFILS_FACADES): ValeursFacades {
  const id = o?.profilFacades?.id;
  return !id || id === PROFIL_FACADES_DEFAUT ? REGLAGES_FACADES : valeursDuProfil(profils.find((p) => p.id === id) ?? null);
}

/**
 * L'empreinte de ce qui change une facade dessinee : les valeurs, triees par nom, et les profils
 * (conditions et surcharges, avec les seuils de la mitoyennete qui leur donnent un sens). Les raisons
 * et les cas n'y entrent pas : les reecrire ne fait rien rechoisir.
 */
export function empreinteReglagesFacades(valeurs: Readonly<Record<string, number>>, profils: readonly ProfilFacades[]): string {
  const lignes = Object.keys(valeurs).sort().map((k) => k + '=' + String(valeurs[k]));
  const forme = profils.length
    ? { vocabulaire: { MITOYENNETE_PARTIELLE_MIN, MITOYENNETE_FORTE_MIN, TOLERANCE_MITOYENNETE_M }, profils: profils.map((p) => ({ id: p.id, quand: p.quand, surcharges: p.surcharges })) }
    : [];
  return fnv1a(lignes.join('\n') + '\nprofils=' + JSON.stringify(forme));
}

/** L'empreinte des reglages livres. */
export const EMPREINTE_REGLAGES_FACADES = empreinteReglagesFacades(REGLAGES_FACADES, PROFILS_FACADES);

/** Une version de la lecture des profils de facades, et l'empreinte des reglages qu'elle lisait. */
export interface LectureFacades { version: number; reglages: string }

/**
 * Les versions de la lecture des profils. Un reglage ou un profil change ajoute une ligne avec sa
 * nouvelle empreinte (le test de tests/unit/model/reglagesFacades.test.ts la donne).
 */
export const LECTURES_FACADES: readonly LectureFacades[] = [
  // Les constantes d'avant sorties du code, profil par defaut seul : la disposition d'avant, a l'identique.
  { version: 1, reglages: '39cc59ff' },
];

/**
 * La version qui correspond a ces reglages : la plus recente qui les a lus. Une empreinte qu'aucune
 * ligne ne connait donne la version suivante : mieux vaut rechoisir que garder un profil mal lu.
 */
export function versionLectureFacades(lectures: readonly LectureFacades[], empreinte: string): number {
  let connue = 0, derniere = 0;
  for (const l of lectures) {
    derniere = Math.max(derniere, l.version);
    if (l.reglages === empreinte) connue = Math.max(connue, l.version);
  }
  return connue || derniere + 1;
}

/** La version de la lecture des profils de facades : un batiment marque d'une plus ancienne est a rechoisir. */
export const VERSION_LECTURE_FACADES = versionLectureFacades(LECTURES_FACADES, EMPREINTE_REGLAGES_FACADES);
