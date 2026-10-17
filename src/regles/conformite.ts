// Les indicateurs de conformite (MD/spec-regles-toits.md §13.5, MD/spec-facades-calage-detection.md
// §15.3, lot G3 de MD/plan-vague-3-generaliser.md).
//
// Un cas observe est **conforme** quand le calcul d'aujourd'hui satisfait ce que vous avez vu : son
// attendu valide (les corps au centimetre, la couleur et la source des murs, comme le test du corpus)
// et les assertions de « Ce que je vois » (forme, bouts, lucarnes, cheminees, terrasse ; spec §7.1).
// Une assertion absente n'est pas verifiee. Un cas qui ne note que des problemes (« decoupe en
// morceaux ») a une observation negative : tant que le rejeu redonne ce que le terrain a donne, le
// probleme est toujours la ; si le calcul a change depuis, le cas est **a revoir** sur les cartes,
// personne ne peut dire sans regarder si le changement le corrige.
//
// Ce module est pur : il juge une lecture deja faite (facade/regles/conformite.ts rejoue le cas), agrege
// les verdicts par forme, par region et par probleme, et decrit les deux fichiers : le corpus du
// depot rejoue par le script (regles/conformite.json, verifie par les tests) et les mesures rangees
// sur le serveur de Plan (`admin/conformite`, deploy/analyse.php et buildsg/analyseAdmin.mjs).
//
// Une colonne attend encore son lot, le taux d'accord de Claude par attribut (T§14.2) ; le taux de
// conformite des facades (la disposition automatique comparee aux releves, F§15.3) est celui du lot G13. Leur place est
// dans la mesure (`facades`, `claude` a null) pour que l'ecran et le serveur n'aient pas a changer.

import { AUTRES_FORMES, FORMES_COURANTES, libelleDe, type BoutsVus, type CeQueJeVois, type FormeVue } from '../model/ceQueJeVois.js';
import { PROBLEMES_AUDIT, type StatutCas } from '../model/audit.js';
import { DEPARTEMENTS, libelleDepartement } from '../model/departements.js';
import type { AttributClaude } from '../model/analyseClaude.js';

/** Ce que devient un cas : `ecarte` est un cas `sans_suite`, compte a part et jamais dans le taux. */
export type EtatCas = 'conforme' | 'non-conforme' | 'a-revoir' | 'sans-observation' | 'ecarte';

/** Les assertions verifiees (spec §7.1), plus l'attendu valide et le probleme note. */
export type AssertionCas = 'attendu' | 'forme' | 'bouts' | 'lucarnes' | 'cheminees' | 'terrasse' | 'probleme';

export interface VerdictAssertion {
  assertion: AssertionCas;
  tenue: boolean;
  /** Ce qui ne va pas, en mots courts : « lu deux-pans », « 2 lucarnes vues, aucune calculée ». */
  motif?: string;
  /** L'observation demande une forme ou un element que Plan ne sait pas encore calculer. */
  horsCalcul?: true;
}

/** La forme d'un corps calcule, dans le vocabulaire des faits (facade/regles/toits/faits.ts, `FormeCorps`). */
export type FormeCalculee = 'plat' | 'appentis' | 'deux-pans' | 'croupes';
export type BoutCalcule = 'pignon' | 'croupe';

/** Ce que le calcul d'aujourd'hui dit du batiment, lu sur son plus grand corps. */
export interface LectureCalculee {
  /** null : aucun corps (le calcul ne construit pas de toit). */
  forme: FormeCalculee | null;
  bouts: [BoutCalcule, BoutCalcule] | null;
  /** Les lucarnes et cheminees que le calcul produit : aucune tant que les lots G4 et G8 ne sont pas faits. */
  lucarnes: number;
  cheminees: number;
}

/** Les formes vues que le calcul sait produire, et la forme de corps qui les dit. */
const FORMES_CALCULEES: Partial<Record<FormeVue, FormeCalculee>> = {
  plat: 'plat', appentis: 'appentis', 'deux-pans': 'deux-pans', croupes: 'croupes',
  // Une pyramide est un quatre-pans au faitage nul : le corps la dit en croupes.
  pavillon: 'croupes',
};
const BOUTS_CALCULES: Partial<Record<BoutsVus, [BoutCalcule, BoutCalcule]>> = {
  pignons: ['pignon', 'pignon'], croupes: ['croupe', 'croupe'], 'pignon-croupe': ['pignon', 'croupe'],
};

/** La forme vue se calcule-t-elle aujourd'hui ? Sinon, un cas qui la note compte « hors calcul ». */
export const formeCalculable = (f: FormeVue): boolean => FORMES_CALCULEES[f] !== undefined;

const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
const memesBouts = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join();

function assertionForme(forme: FormeVue, l: LectureCalculee): VerdictAssertion {
  const voulue = FORMES_CALCULEES[forme];
  if (!voulue) return { assertion: 'forme', tenue: false, motif: libelleDe([...FORMES_COURANTES, ...AUTRES_FORMES], forme) + ' : forme que Plan ne calcule pas encore', horsCalcul: true };
  if (l.forme === voulue) return { assertion: 'forme', tenue: true };
  return { assertion: 'forme', tenue: false, motif: l.forme ? 'lu ' + l.forme : 'aucun toit construit' };
}

function assertionBouts(bouts: BoutsVus, l: LectureCalculee): VerdictAssertion {
  const voulus = BOUTS_CALCULES[bouts];
  if (!voulus) return { assertion: 'bouts', tenue: false, motif: 'demi-croupes : Plan ne les calcule pas encore', horsCalcul: true };
  if (l.bouts && memesBouts(l.bouts, voulus)) return { assertion: 'bouts', tenue: true };
  return { assertion: 'bouts', tenue: false, motif: l.bouts ? 'lu ' + l.bouts.join(' + ') : l.forme ? 'lu ' + l.forme : 'aucun toit construit' };
}

/** Un compte vu (lucarnes, cheminees) contre le compte calcule ; « aucune » vue se verifie aussi. */
function assertionCompte(assertion: 'lucarnes' | 'cheminees', vues: number, calculees: number, mot: string): VerdictAssertion {
  if (vues === calculees) return { assertion, tenue: true };
  // Le calcul n'en produit aucune : une observation qui en voit est hors calcul, pas une erreur de seuil.
  const hors = calculees === 0 ? { horsCalcul: true as const } : {};
  return { assertion, tenue: false, motif: pluriel(vues, mot) + ' vue' + (vues > 1 ? 's' : '') + ', ' + calculees + ' calculée' + (calculees > 1 ? 's' : ''), ...hors };
}

/**
 * La terrasse vue : le toit doit etre plat ; l'acrotere et les edicules vus ne se calculent pas
 * encore (lot G8), ils comptent hors calcul. Accessibilite et revetement ne se mesurent pas.
 */
function assertionTerrasse(t: NonNullable<CeQueJeVois['terrasse']>, l: LectureCalculee): VerdictAssertion | null {
  const vue = Object.values(t).some((x) => x !== undefined);
  if (!vue) return null;
  if (l.forme !== 'plat') return { assertion: 'terrasse', tenue: false, motif: l.forme ? 'toit-terrasse vu, lu ' + l.forme : 'toit-terrasse vu, aucun toit construit' };
  if ((t.acrotereM ?? 0) > 0 || (t.edicules ?? 0) > 0) return { assertion: 'terrasse', tenue: false, motif: 'acrotère ou édicules vus : Plan ne les calcule pas encore', horsCalcul: true };
  return { assertion: 'terrasse', tenue: true };
}

/**
 * Les assertions de « Ce que je vois » jugees sur la lecture calculee. `nonVerifiees` : ce qui est
 * note mais ne se compare pas au calcul (le sens du faitage est dit par rapport a la rue, qui n'est
 * pas dans le calcul ; les materiaux sont l'affaire de la couleur des murs et des toits).
 */
export function assertionsDuVu(v: CeQueJeVois, l: LectureCalculee): { assertions: VerdictAssertion[]; nonVerifiees: string[] } {
  const assertions: VerdictAssertion[] = [];
  const nonVerifiees: string[] = [];
  if (v.forme) assertions.push(assertionForme(v.forme, l));
  if (v.bouts) assertions.push(assertionBouts(v.bouts, l));
  if (v.lucarnes) assertions.push(assertionCompte('lucarnes', v.lucarnes.nombre, l.lucarnes, 'lucarne'));
  if (v.cheminees) assertions.push(assertionCompte('cheminees', v.cheminees.nombre, l.cheminees, 'cheminée'));
  const t = v.terrasse ? assertionTerrasse(v.terrasse, l) : null;
  if (t) assertions.push(t);
  if (v.sensFaitage) nonVerifiees.push('sensFaitage');
  if (v.murs) nonVerifiees.push('murs');
  if (v.couverture) nonVerifiees.push('couverture');
  return { assertions, nonVerifiees };
}

/** L'etat d'un cas observe positivement : toutes ses assertions tenues, ou non. */
export const etatDesAssertions = (a: readonly VerdictAssertion[]): EtatCas => (!a.length ? 'sans-observation' : a.every((x) => x.tenue) ? 'conforme' : 'non-conforme');

/** Ce que l'on sait d'un cas apres son rejeu. */
export interface VerdictCas {
  /** `corpus` : tests/fixtures/audit/ du depot ; `audit` : un audit de parcelle partage, recu sur le serveur. */
  source: 'corpus' | 'audit';
  /** Le fichier de promenade, ou l'identifiant de l'audit recu. */
  fichier: string;
  /** L'identifiant du cas dans son fichier (`c1`), ou la cle du batiment dans l'audit. */
  id: string;
  cle: string;
  statut: StatutCas | null;
  etat: EtatCas;
  /** La forme vue, a defaut celle de l'attendu valide, a defaut `non-notee`. */
  forme: FormeVue | 'non-notee';
  /** `78` (le departement de l'IDU), sinon la commune de la promenade, sinon `inconnue`. */
  region: string;
  problemes: string[];
  assertions: VerdictAssertion[];
  nonVerifiees: string[];
}

/** Une ligne d'un tableau par axe. `taux` : conformes sur conformes et non conformes, null sans cas juge. */
export interface LigneTaux {
  cle: string;
  libelle: string;
  cas: number;
  conformes: number;
  nonConformes: number;
  aRevoir: number;
  sansObservation: number;
  taux: number | null;
}

export type AxeConformite = 'forme' | 'region' | 'probleme';

/** Le libelle d'une region : le departement (« Yvelines (78) »), sinon la commune telle que notee. */
export function libelleRegion(region: string): string {
  if (region === 'inconnue') return 'Région inconnue';
  return DEPARTEMENTS[region] ? libelleDepartement(region) : region;
}

const libelleForme = (f: VerdictCas['forme']): string => (f === 'non-notee' ? 'Forme non notée' : libelleDe([...FORMES_COURANTES, ...AUTRES_FORMES], f));
const libelleProbleme = (code: string): string => (code === 'aucun' ? 'Aucun problème noté' : PROBLEMES_AUDIT.find((p) => p.code === code)?.libelle ?? code);

/** Les cles d'un verdict sur un axe : un cas qui note deux problemes compte dans les deux lignes. */
function clesSurAxe(v: VerdictCas, axe: AxeConformite): string[] {
  if (axe === 'forme') return [v.forme];
  if (axe === 'region') return [v.region];
  return v.problemes.length ? [...new Set(v.problemes)] : ['aucun'];
}

const tauxDe = (conformes: number, nonConformes: number): number | null => (conformes + nonConformes ? conformes / (conformes + nonConformes) : null);

/**
 * Les taux par forme, par region ou par probleme, les lignes les plus fournies d'abord. Les cas
 * ecartes (`sans_suite`) n'y sont pas.
 */
export function tauxPar(verdicts: readonly VerdictCas[], axe: AxeConformite, libelle: (cle: string) => string = (c) => (axe === 'forme' ? libelleForme(c as VerdictCas['forme']) : axe === 'region' ? libelleRegion(c) : libelleProbleme(c))): LigneTaux[] {
  const lignes = new Map<string, LigneTaux>();
  for (const v of verdicts) {
    if (v.etat === 'ecarte') continue;
    for (const cle of clesSurAxe(v, axe)) {
      const l = lignes.get(cle) ?? { cle, libelle: libelle(cle), cas: 0, conformes: 0, nonConformes: 0, aRevoir: 0, sansObservation: 0, taux: null };
      l.cas++;
      if (v.etat === 'conforme') l.conformes++;
      else if (v.etat === 'non-conforme') l.nonConformes++;
      else if (v.etat === 'a-revoir') l.aRevoir++;
      else l.sansObservation++;
      lignes.set(cle, l);
    }
  }
  return [...lignes.values()].map((l) => ({ ...l, taux: tauxDe(l.conformes, l.nonConformes) }))
    .sort((a, b) => b.cas - a.cas || a.libelle.localeCompare(b.libelle, 'fr'));
}

/** Le critere de passage de la phase 1 (T§13.3) : 50 cas observes, dont 10 sur des formes hors calcul. */
export const PHASE1_CAS_OBSERVES = 50;
export const PHASE1_HORS_CALCUL = 10;

export interface ResumeConformite {
  /** Tous les cas lus, ecartes compris. */
  total: number;
  /** Les cas qui portent une observation (positive ou negative). */
  observes: number;
  conformes: number;
  nonConformes: number;
  aRevoir: number;
  sansObservation: number;
  ecartes: number;
  /** Les cas dont l'observation demande ce que Plan ne calcule pas encore. */
  horsCalcul: number;
  taux: number | null;
}

export function resumer(verdicts: readonly VerdictCas[]): ResumeConformite {
  const n = (e: EtatCas) => verdicts.filter((v) => v.etat === e).length;
  const conformes = n('conforme'), nonConformes = n('non-conforme'), aRevoir = n('a-revoir');
  return {
    total: verdicts.length, observes: conformes + nonConformes + aRevoir, conformes, nonConformes, aRevoir,
    sansObservation: n('sans-observation'), ecartes: n('ecarte'),
    horsCalcul: verdicts.filter((v) => v.etat !== 'ecarte' && v.assertions.some((a) => a.horsCalcul)).length,
    taux: tauxDe(conformes, nonConformes),
  };
}

/** Les attributs sur lesquels le taux d'accord de Claude se mesurera (model/analyseClaude.ts). */
export const ATTRIBUTS_CLAUDE: readonly { code: AttributClaude; libelle: string }[] = [
  { code: 'couverture', libelle: 'Couverture' },
  { code: 'cheminees', libelle: 'Cheminées' },
  { code: 'terrasse', libelle: 'Toit-terrasse' },
  { code: 'materiauMurs', libelle: 'Matériau des murs' },
  { code: 'couleurMurs', libelle: 'Teinte des murs' },
  { code: 'formeToit', libelle: 'Forme du toit' },
];

// --- Le corpus du depot, rejoue par le script ----------------------------------------------------

export const FORMAT_CORPUS_CONFORMITE = 'plan-conformite-corpus';

/** regles/conformite.json : les verdicts du corpus du depot, tels que le code les rend. */
export interface CorpusConformite {
  format: typeof FORMAT_CORPUS_CONFORMITE;
  version: 1;
  pourquoi?: string;
  verdicts: VerdictCas[];
}

const ETATS: readonly EtatCas[] = ['conforme', 'non-conforme', 'a-revoir', 'sans-observation', 'ecarte'];
const objet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const chaines = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Un verdict relu (fichier du depot ou mesure du serveur) ; null s'il n'en a pas la forme. */
export function lireVerdict(v: unknown): VerdictCas | null {
  if (!objet(v)) return null;
  const { source, fichier, id, cle, statut, etat, forme, region, problemes, assertions, nonVerifiees } = v;
  if ((source !== 'corpus' && source !== 'audit') || typeof fichier !== 'string' || typeof id !== 'string' || typeof cle !== 'string') return null;
  if (!ETATS.includes(etat as EtatCas) || typeof forme !== 'string' || typeof region !== 'string' || !chaines(problemes) || !chaines(nonVerifiees)) return null;
  if (!Array.isArray(assertions) || !assertions.every((a) => objet(a) && typeof a.assertion === 'string' && typeof a.tenue === 'boolean')) return null;
  return {
    source, fichier, id, cle, statut: typeof statut === 'string' ? statut as StatutCas : null, etat: etat as EtatCas,
    forme: forme as VerdictCas['forme'], region, problemes: [...problemes],
    assertions: (assertions as VerdictAssertion[]).map((a) => ({ assertion: a.assertion, tenue: a.tenue, ...(typeof a.motif === 'string' ? { motif: a.motif } : {}), ...(a.horsCalcul ? { horsCalcul: true as const } : {}) })),
    nonVerifiees: [...nonVerifiees],
  };
}

export function lireCorpusConformite(d: unknown): VerdictCas[] {
  if (!objet(d) || d.format !== FORMAT_CORPUS_CONFORMITE || !Array.isArray(d.verdicts)) return [];
  return d.verdicts.map(lireVerdict).filter((v): v is VerdictCas => v !== null);
}

// --- Les mesures rangees sur le serveur de Plan ---------------------------------------------------

export const FORMAT_MESURE_CONFORMITE = 'plan-conformite-mesure';
export const FORMAT_MESURES_CONFORMITE = 'plan-conformite';
/** Le serveur garde les dernieres mesures, pas plus (deploy/analyse.php, MESURES_CONFORMITE_MAX). */
export const MESURES_CONFORMITE_MAX = 200;

// --- Les facades (MD/spec-facades-calage-detection.md §15.3, lot G13) ------------------------------------------

/** Deux nombres de baies sont conformes a ± 1 (spec §15.3). */
export const TOLERANCE_BAIES = 1;
/** Deux parts vitrees sont conformes a ± 20 % de celle du releve (spec §15.3). */
export const TOLERANCE_PART_VITREE = 0.2;
/** Deux hauteurs de niveau sont conformes a 30 cm pres (la spec dit « hauteur des niveaux » sans tolerance : celle-ci est a confirmer par le corpus). */
export const TOLERANCE_HAUTEUR_NIVEAU_M = 0.3;

/** Un critere compare : la valeur de la disposition automatique, celle du releve, et si elles concordent (null : non juge). */
export interface CritereFacade { auto: number | null; releve: number | null; tenu: boolean | null }

/** Une facade relevee jugee : la disposition automatique comparee a ce que la personne a releve. */
export interface VerdictFacade {
  fichier: string;
  batiment: string;
  cote: number;
  orientation: string | null;
  region: string;
  baies: CritereFacade;
  partVitree: CritereFacade;
  hauteurNiveau: CritereFacade;
  /** Tous les criteres juges sont tenus. */
  conforme: boolean;
}

/** Les criteres d'une facade, juges sur ses mesures : le releve d'un cote, la disposition automatique de l'autre. */
export function jugerCriteres(auto: { baies: number; partVitree: number; hauteurNiveauM: number | null }, releve: { baies: number; partVitree: number; hauteurNiveauM: number | null }): Pick<VerdictFacade, 'baies' | 'partVitree' | 'hauteurNiveau' | 'conforme'> {
  const baies: CritereFacade = { auto: auto.baies, releve: releve.baies, tenu: Math.abs(auto.baies - releve.baies) <= TOLERANCE_BAIES };
  // Un mur sans vitrage au releve (un pignon aveugle) : la part se compare a zero, a un point de mur pres.
  const tolPart = Math.max(TOLERANCE_PART_VITREE * releve.partVitree, 0.01);
  const partVitree: CritereFacade = { auto: auto.partVitree, releve: releve.partVitree, tenu: Math.abs(auto.partVitree - releve.partVitree) <= tolPart };
  const nivJuge = auto.hauteurNiveauM !== null && releve.hauteurNiveauM !== null;
  const hauteurNiveau: CritereFacade = { auto: auto.hauteurNiveauM, releve: releve.hauteurNiveauM, tenu: nivJuge ? Math.abs((auto.hauteurNiveauM as number) - (releve.hauteurNiveauM as number)) <= TOLERANCE_HAUTEUR_NIVEAU_M : null };
  return { baies, partVitree, hauteurNiveau, conforme: [baies, partVitree, hauteurNiveau].every((c) => c.tenu !== false) };
}

export interface ResumeFacades {
  total: number;
  conformes: number;
  nonConformes: number;
  /** conformes / total ; null sans facade. */
  taux: number | null;
  /** Pour chaque critere, combien de facades l'ont tenu sur combien l'ont juge. */
  baies: { tenus: number; juges: number };
  partVitree: { tenus: number; juges: number };
  hauteurNiveau: { tenus: number; juges: number };
}

const compter = (v: readonly VerdictFacade[], c: 'baies' | 'partVitree' | 'hauteurNiveau') => ({ tenus: v.filter((x) => x[c].tenu === true).length, juges: v.filter((x) => x[c].tenu !== null).length });

export function resumerFacades(v: readonly VerdictFacade[]): ResumeFacades {
  const conformes = v.filter((x) => x.conforme).length;
  return { total: v.length, conformes, nonConformes: v.length - conformes, taux: v.length ? conformes / v.length : null, baies: compter(v, 'baies'), partVitree: compter(v, 'partVitree'), hauteurNiveau: compter(v, 'hauteurNiveau') };
}

/** Le taux de conformite des facades de chaque region (departement de la parcelle) ; null sans facade. */
export function tauxFacadesParRegion(v: readonly VerdictFacade[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const r of new Set(v.map((x) => x.region))) out[r] = resumerFacades(v.filter((x) => x.region === r)).taux;
  return out;
}

/**
 * Une mesure des indicateurs, telle que l'ecran l'envoie (`POST admin/conformite`) : les versions du
 * calcul, ce qui a ete lu, le resume, les tableaux par axe et l'etat de chaque cas (sans ses
 * entrees, deja dans le corpus ou l'audit). Le serveur y ajoute `recuLe`.
 */
export interface MesureConformite {
  format: typeof FORMAT_MESURE_CONFORMITE;
  version: 1;
  /** Quand la mesure a ete faite (ISO), sur l'appareil de l'administrateur. */
  t: string;
  recuLe?: string;
  code: { version: string; commit: string | null };
  lecture: { toits: number; reglages: string; faits: string };
  sources: { corpus: number; audits: number };
  toits: ResumeConformite;
  parForme: LigneTaux[];
  parRegion: LigneTaux[];
  parProbleme: LigneTaux[];
  /** Le taux de conformite des facades (F§15.3, lot G13) ; null sur une mesure d'avant, ou sans audit recu. */
  facades: ResumeFacades | null;
  /** Le taux d'accord de Claude par attribut (T§14.2) : a venir. */
  claude: null;
  cas: { source: VerdictCas['source']; fichier: string; id: string; etat: EtatCas }[];
}

export interface EntreesMesure {
  t: Date;
  code: MesureConformite['code'];
  lecture: MesureConformite['lecture'];
  corpus: readonly VerdictCas[];
  audits: readonly VerdictCas[];
  /** Les facades relevees des audits recus, jugees (lot G13) ; absent : pas jugees. */
  facades?: readonly VerdictFacade[];
  /** Le nombre d'audits recus lus (un audit porte plusieurs batiments). */
  auditsLus: number;
}

/** La mesure de ce que l'ecran montre, prete a ranger. */
export function mesureConformite(e: EntreesMesure): MesureConformite {
  const tous = [...e.corpus, ...e.audits];
  return {
    format: FORMAT_MESURE_CONFORMITE, version: 1, t: e.t.toISOString(), code: { ...e.code }, lecture: { ...e.lecture },
    sources: { corpus: e.corpus.length, audits: e.auditsLus },
    toits: resumer(tous), parForme: tauxPar(tous, 'forme'), parRegion: tauxPar(tous, 'region'), parProbleme: tauxPar(tous, 'probleme'),
    facades: e.facades && e.facades.length ? resumerFacades(e.facades) : null, claude: null,
    cas: tous.map((v) => ({ source: v.source, fichier: v.fichier, id: v.id, etat: v.etat })),
  };
}

/** Une mesure relue du serveur : on n'en garde que ce que l'historique montre. */
export interface MesureLue {
  t: string;
  recuLe: string | null;
  code: { version: string; commit: string | null };
  sources: { corpus: number; audits: number };
  toits: ResumeConformite;
  /** Le taux de conformite des facades de cette mesure ; null sur une mesure d'avant le lot G13, ou sans facade relevee. */
  facades: number | null;
}

const nombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function lireResume(r: unknown): ResumeConformite | null {
  if (!objet(r)) return null;
  const cles = ['total', 'observes', 'conformes', 'nonConformes', 'aRevoir', 'sansObservation', 'ecartes', 'horsCalcul'] as const;
  if (!cles.every((k) => nombre(r[k]))) return null;
  const out = Object.fromEntries(cles.map((k) => [k, r[k] as number])) as Omit<ResumeConformite, 'taux'>;
  return { ...out, taux: nombre(r.taux) ? r.taux : null };
}

/** L'historique rendu par `GET admin/conformite`, du plus ancien au plus recent ; null s'il est illisible. */
export function lireMesuresConformite(d: unknown): MesureLue[] | null {
  if (!objet(d) || d.format !== FORMAT_MESURES_CONFORMITE || !Array.isArray(d.mesures)) return null;
  const out: MesureLue[] = [];
  for (const m of d.mesures as unknown[]) {
    if (!objet(m) || typeof m.t !== 'string' || !objet(m.code) || typeof m.code.version !== 'string' || !objet(m.sources)) continue;
    const toits = lireResume(m.toits);
    if (!toits) continue;
    out.push({
      t: m.t, recuLe: typeof m.recuLe === 'string' ? m.recuLe : null,
      code: { version: m.code.version, commit: typeof m.code.commit === 'string' ? m.code.commit : null },
      sources: { corpus: nombre(m.sources.corpus) ? m.sources.corpus : 0, audits: nombre(m.sources.audits) ? m.sources.audits : 0 },
      toits,
      facades: objet(m.facades) && nombre(m.facades.total) && m.facades.total > 0 && nombre(m.facades.taux) ? m.facades.taux : null,
    });
  }
  return out.sort((a, b) => a.t.localeCompare(b.t));
}

/** Un taux en pour cent entier, ou un tiret sans cas juge. */
export const pourCent = (t: number | null): string => (t === null ? '—' : Math.round(t * 100) + ' %');
