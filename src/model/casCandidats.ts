// Les cas candidats Panoramax (MD/spec-regles-toits.md §13.3 phase 4, usage 3 de Claude analyste,
// §14.5 ; lot G3 bis du plan de la vague 3) : les batiments d'un village qui ont probablement une
// forme que Plan ne sait pas encore faire (Mansart, demi-croupes, lucarnes...), reperes par Claude
// sur les photos de rue.
//
// Un candidat n'est qu'une proposition (§14.6) : il entre au corpus au statut `propose`, avec ce
// que Claude a vu dans le vocabulaire du modele de toit (lot G1 : `Toit.forme`, types de `ProfilPan`,
// de `BoutToit` et de `Lucarne`), le vote de ses trois passes et les photos qui en sont la preuve.
// Une personne le trie ensuite sur les images (`valide` ou `sans_suite`) ; rien ne s'applique au
// calcul, et un candidat trie n'est plus jamais reecrit par le script.
//
// Pur et deterministe : la recherche des photos et l'appel a Claude sont dans
// app/candidatsPanoramax.ts, le script dans .claude/skills/regles-toits/scripts/candidats.ts.

import { FORMES_TOIT_CATALOGUE, estFormeSimple, estFormeToit } from './formeToit.js';
import type { Vote, VoteAnalyse } from './analyseClaude.js';
import type { BoutToit, FormeToit, FormeToitCatalogue, ProfilPan, TypeLucarne } from './types.js';

export const FORMAT_CANDIDATS = 'plan-cas-candidats';
export const VERSION_CANDIDATS = 1;

/** `propose` : vu par Claude ; `valide` ou `sans_suite` : trie par une personne sur les images. */
export type StatutCandidat = 'propose' | 'valide' | 'sans_suite';
const STATUTS: readonly StatutCandidat[] = ['propose', 'valide', 'sans_suite'];

/** Ce que l'on cherche : une forme du catalogue que le calcul ne produit pas encore, ou des lucarnes. */
export type ViseeCandidat = FormeToitCatalogue | 'lucarnes';
/** Par defaut, tout ce que Plan ne sait pas encore faire (spec §13.3 phase 4 : lucarnes d'abord). */
export const VISEES_PAR_DEFAUT: readonly ViseeCandidat[] = ['lucarnes', ...FORMES_TOIT_CATALOGUE];
export const estVisee = (v: unknown): v is ViseeCandidat => v === 'lucarnes' || (typeof v === 'string' && (FORMES_TOIT_CATALOGUE as readonly string[]).includes(v));

/**
 * La forme visee, dans le vocabulaire du modele de toit (lot G1). Une photo ne donne pas de cotes :
 * on n'en garde que les types (le profil `brise`, des bouts en `brisis`, des lucarnes `jacobine`),
 * comme les assertions de l'observation (spec §7.1). Un champ absent n'affirme rien.
 */
export interface FormeViseeCandidat {
  forme: FormeToit;
  profil?: ProfilPan['type'];
  /** Les bouts du faitage, gauche puis droite vus depuis la rue. */
  bouts?: [BoutToit['type'], BoutToit['type']];
  lucarnes?: { nombre: number; types: TypeLucarne[] };
}

/** Un attribut vote, resume : la valeur retenue et la part des passes d'accord. */
export interface VoteResume<T = string | number> { valeur: T; accord: number }

export interface VoteCandidat {
  passes: number;
  forme: VoteResume<string>;
  profil: VoteResume<string>;
  boutGauche: VoteResume<string>;
  boutDroit: VoteResume<string>;
  lucarnes: VoteResume<string | number>;
  confiance: VoteResume<string>;
  /** Ce que la reponse contredit dans les indices LiDAR chiffres (controle croise, spec §14.2 point 4). */
  contradictions: string[];
}

/** Une photo de rue qui montre le batiment : la preuve, a regarder pour trier. */
export interface PhotoCandidat {
  id: string;
  url: string;
  date: string | null;
  auteur: string | null;
  licence: string | null;
  distanceM: number;
  /** Le cap de la photo vers le batiment (0 = nord, 90 = est). */
  capDeg: number;
}

export interface SourceCandidat {
  par: 'claude';
  usage: 'candidats';
  modele: string;
  prompt: number;
  schema: number;
  /** Le jour de l'analyse (AAAA-MM-JJ). */
  le: string;
}

export interface CasCandidat {
  id: string;
  /** La cle du batiment dans le fichier du village, et sa cle BD TOPO (celle des faits) quand elle est connue. */
  cle: string;
  cleabs: string | null;
  statut: StatutCandidat;
  visees: ViseeCandidat[];
  observation: FormeViseeCandidat;
  vote: VoteCandidat;
  photos: PhotoCandidat[];
  source: SourceCandidat;
  historique: { t: string; texte: string }[];
}

export interface FichierCandidats {
  format: typeof FORMAT_CANDIDATS;
  version: number;
  village: string;
  /** La parcelle autour de laquelle le village a ete releve (IDU), si le fichier du village la donne. */
  parcelle: string | null;
  candidats: CasCandidat[];
}

/* ------------------------------------------------------------------------------------------------
 * Du vocabulaire du schema de l'analyse a celui du modele
 * --------------------------------------------------------------------------------------------- */

/** La forme du schema (deploy/schema-analyse.json) en `Toit.forme` ; null pour `indetermine`. */
export function formeDuSchema(v: string): FormeToit | null {
  if (v === 'demi-croupe') return 'demi-croupes';
  return estFormeToit(v) ? v : null;
}

const BOUTS_SCHEMA: Readonly<Record<string, BoutToit['type']>> = { pignon: 'pignon', croupe: 'croupe', 'demi-croupe': 'demi-croupe', brisis: 'brisis' };
const PROFILS_SCHEMA: Readonly<Record<string, ProfilPan['type']>> = { droit: 'droit', brise: 'brise', courbe: 'courbe' };
/** L'oeil-de-boeuf et l'outeau n'ont pas de type dans le modele (spec §4) : une lucarne `inconnue`. */
const LUCARNES_SCHEMA: Readonly<Record<string, TypeLucarne>> = { jacobine: 'jacobine', capucine: 'capucine', 'chien-assis': 'chien-assis', rampante: 'rampante', meuniere: 'meuniere', 'oeil-de-boeuf': 'oeil-de-boeuf', outeau: 'outeau' };

/** Les types de lucarnes vus, dedoublonnes, d'une reponse ou de toutes. */
export function typesLucarnes(types: readonly string[]): TypeLucarne[] {
  return [...new Set(types.map((t) => LUCARNES_SCHEMA[t]).filter((t): t is TypeLucarne => !!t))];
}

/**
 * Ce que le vote affirme, dans le vocabulaire du modele : seulement les attributs a la majorite
 * (le vote rend `indetermine` sinon). Null si la forme elle-meme n'a pas de majorite.
 */
export function observationDuVote(vote: VoteAnalyse, typesVus: readonly string[] = []): FormeViseeCandidat | null {
  const forme = formeDuSchema(vote.forme.valeur);
  if (!forme) return null;
  const profil = PROFILS_SCHEMA[vote.profil.valeur];
  const g = BOUTS_SCHEMA[vote.boutGauche.valeur], d = BOUTS_SCHEMA[vote.boutDroit.valeur];
  const n = vote.lucarnes.valeur;
  return {
    forme,
    ...(profil ? { profil } : {}),
    ...(g && d ? { bouts: [g, d] as [BoutToit['type'], BoutToit['type']] } : {}),
    ...(typeof n === 'number' ? { lucarnes: { nombre: n, types: n > 0 ? typesLucarnes(typesVus) : [] } } : {}),
  };
}

/**
 * Pourquoi ce batiment est candidat, parmi ce que l'on cherche : sa forme (une forme du catalogue),
 * des demi-croupes ou des brisis vus aux bouts, un profil brise, des lucarnes. Vide : pas candidat.
 */
export function viseesDe(o: FormeViseeCandidat, cherchees: readonly ViseeCandidat[]): ViseeCandidat[] {
  const out = new Set<ViseeCandidat>();
  if (!estFormeSimple(o.forme)) out.add(o.forme);
  if (o.bouts?.includes('demi-croupe')) out.add('demi-croupes');
  // Un profil brise ou des brisis, quelle que soit la forme dite : un toit brise, que les bouts
  // departagent (spec §3.4, confusion 7) ; un pignon a un bout, un gambrel, sinon un Mansart.
  if (o.profil === 'brise' || o.bouts?.includes('brisis')) out.add(o.bouts?.includes('pignon') ? 'gambrel' : 'mansart');
  if ((o.lucarnes?.nombre ?? 0) > 0) out.add('lucarnes');
  return [...out].filter((v) => cherchees.includes(v));
}

const resume = <T>(v: Vote<T>): VoteResume<T> => ({ valeur: v.valeur, accord: Math.round(v.accord * 1000) / 1000 });

/** Le vote, resume pour le fichier : sans les indices (ils sont dans les photos, qu'on regarde). */
export function voteCandidat(vote: VoteAnalyse, contradictions: readonly string[]): VoteCandidat {
  return {
    passes: vote.passes,
    forme: resume(vote.forme), profil: resume(vote.profil), boutGauche: resume(vote.boutGauche), boutDroit: resume(vote.boutDroit),
    lucarnes: resume(vote.lucarnes), confiance: resume(vote.confiance), contradictions: [...contradictions],
  };
}

/** Un identifiant stable et lisible : celui du batiment, sans caractere qui gene un nom de fichier. */
export const idCandidat = (cle: string, cleabs: string | null): string => 'cand-' + (cleabs ?? cle).replace(/[^A-Za-z0-9_-]/g, '_');

export interface EntreeCandidat {
  cle: string;
  cleabs: string | null;
  vote: VoteAnalyse;
  /** Les types de lucarnes vus par les passes, pour les nommer (le vote ne garde que le nombre). */
  typesLucarnes: readonly string[];
  contradictions: readonly string[];
  photos: PhotoCandidat[];
  source: SourceCandidat;
}

/** Le candidat qu'un batiment analyse donne, ou null s'il n'a rien de ce que l'on cherche. */
export function candidatDepuisVote(e: EntreeCandidat, cherchees: readonly ViseeCandidat[] = VISEES_PAR_DEFAUT): CasCandidat | null {
  const observation = observationDuVote(e.vote, e.typesLucarnes);
  if (!observation) return null;
  const visees = viseesDe(observation, cherchees);
  if (!visees.length) return null;
  return {
    id: idCandidat(e.cle, e.cleabs), cle: e.cle, cleabs: e.cleabs, statut: 'propose', visees, observation,
    vote: voteCandidat(e.vote, e.contradictions), photos: e.photos, source: e.source,
    historique: [{ t: e.source.le, texte: 'proposé par Claude sur ' + e.photos.length + ' photo' + (e.photos.length > 1 ? 's' : '') + ' de rue Panoramax (' + e.vote.passes + ' passes)' }],
  };
}

const RANG_CONFIANCE: Readonly<Record<string, number>> = { forte: 0, moyenne: 1, faible: 2 };

/** Les plus surs d'abord : sans contradiction, la forme a l'unanimite, la confiance, puis la cle (ordre stable). */
export function trierCandidats(cs: readonly CasCandidat[]): CasCandidat[] {
  const cle = (c: CasCandidat): [number, number, number, string] => [c.vote.contradictions.length ? 1 : 0, -c.vote.forme.accord, RANG_CONFIANCE[c.vote.confiance.valeur] ?? 3, c.cle];
  return [...cs].sort((a, b) => {
    const x = cle(a), y = cle(b);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] as number) - (y[i] as number);
    return x[3] < y[3] ? -1 : x[3] > y[3] ? 1 : 0;
  });
}

/**
 * Le fichier apres une analyse. Un candidat deja trie (`valide`, `sans_suite`) ne bouge jamais, et
 * son batiment n'est pas repropose. Un candidat `propose` d'un batiment analyse cette fois est
 * remplace par la nouvelle lecture (ou retire, si elle ne le retient plus) ; les autres restent.
 */
export function fusionnerCandidats(ancien: FichierCandidats | null, nouveaux: readonly CasCandidat[], analyses: ReadonlySet<string>, meta: { village: string; parcelle: string | null }): FichierCandidats {
  const anciens = ancien?.candidats ?? [];
  const tries = new Set(anciens.filter((c) => c.statut !== 'propose').map((c) => c.cle));
  const gardes = anciens.filter((c) => c.statut !== 'propose' || !analyses.has(c.cle));
  const ajoutes = nouveaux.filter((c) => !tries.has(c.cle) && !gardes.some((g) => g.cle === c.cle));
  return {
    format: FORMAT_CANDIDATS, version: VERSION_CANDIDATS, village: meta.village, parcelle: meta.parcelle ?? ancien?.parcelle ?? null,
    candidats: [...gardes.filter((c) => c.statut !== 'propose'), ...trierCandidats([...gardes.filter((c) => c.statut === 'propose'), ...ajoutes])],
  };
}

/** Le compte par visee et par statut : ce que le script affiche a la fin. */
export function compterCandidats(f: FichierCandidats): { visee: ViseeCandidat; propose: number; valide: number; sans_suite: number }[] {
  const par = new Map<ViseeCandidat, { visee: ViseeCandidat; propose: number; valide: number; sans_suite: number }>();
  for (const c of f.candidats) for (const v of c.visees) {
    const l = par.get(v) ?? { visee: v, propose: 0, valide: 0, sans_suite: 0 };
    l[c.statut]++;
    par.set(v, l);
  }
  return [...par.values()].sort((a, b) => VISEES_PAR_DEFAUT.indexOf(a.visee) - VISEES_PAR_DEFAUT.indexOf(b.visee));
}

/* ------------------------------------------------------------------------------------------------
 * La lecture du fichier
 * --------------------------------------------------------------------------------------------- */

/** Un fichier de candidats illisible : le message dit quel candidat et pourquoi. */
export class CandidatsIllisibles extends Error {}

const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function verifierCandidat(c: unknown, i: number): CasCandidat {
  const quoi = 'candidats[' + i + ']';
  if (!estObjet(c)) throw new CandidatsIllisibles(quoi + ' : un objet attendu');
  if (typeof c.id !== 'string' || typeof c.cle !== 'string' || !c.cle) throw new CandidatsIllisibles(quoi + ' : id et cle attendus');
  if (!STATUTS.includes(c.statut as StatutCandidat)) throw new CandidatsIllisibles(quoi + '.statut : ' + STATUTS.join(', '));
  if (!Array.isArray(c.visees) || !c.visees.length || !c.visees.every(estVisee)) throw new CandidatsIllisibles(quoi + '.visees : des formes du catalogue ou lucarnes');
  const o = c.observation;
  if (!estObjet(o) || !estFormeToit(o.forme)) throw new CandidatsIllisibles(quoi + '.observation.forme : une forme de toit');
  if (o.bouts !== undefined && (!Array.isArray(o.bouts) || o.bouts.length !== 2 || o.bouts.some((b) => !Object.values(BOUTS_SCHEMA).includes(b as BoutToit['type'])))) throw new CandidatsIllisibles(quoi + '.observation.bouts : deux bouts');
  if (!estObjet(c.vote) || !Array.isArray(c.photos) || !estObjet(c.source) || !Array.isArray(c.historique)) throw new CandidatsIllisibles(quoi + ' : vote, photos, source et historique attendus');
  return c as unknown as CasCandidat;
}

/** Lit et verifie un fichier de candidats ; un fichier illisible n'est jamais reecrit en silence. */
export function lireFichierCandidats(v: unknown): FichierCandidats {
  if (!estObjet(v) || v.format !== FORMAT_CANDIDATS) throw new CandidatsIllisibles('format : ' + FORMAT_CANDIDATS + ' attendu');
  if (v.version !== VERSION_CANDIDATS) throw new CandidatsIllisibles('version : ' + VERSION_CANDIDATS + ' attendue');
  if (typeof v.village !== 'string' || !Array.isArray(v.candidats)) throw new CandidatsIllisibles('village et candidats attendus');
  const candidats = v.candidats.map(verifierCandidat);
  const cles = new Set<string>();
  for (const c of candidats) {
    if (cles.has(c.cle)) throw new CandidatsIllisibles('candidat en double : ' + c.cle);
    cles.add(c.cle);
  }
  return { format: FORMAT_CANDIDATS, version: VERSION_CANDIDATS, village: v.village, parcelle: typeof v.parcelle === 'string' ? v.parcelle : null, candidats };
}

/** Le texte d'un candidat, pour la liste du script : « mansart, lucarnes · forme mansart (3/3) · 2 photos ». */
export function texteCandidat(c: CasCandidat): string {
  const accord = Math.round(c.vote.forme.accord * c.vote.passes) + '/' + c.vote.passes;
  const bouts = c.observation.bouts ? ', bouts ' + c.observation.bouts.join('/') : '';
  const luc = c.observation.lucarnes?.nombre ? ', ' + c.observation.lucarnes.nombre + ' lucarne(s)' + (c.observation.lucarnes.types.length ? ' ' + c.observation.lucarnes.types.join('/') : '') : '';
  const contra = c.vote.contradictions.length ? ' · contredit le LiDAR' : '';
  return c.visees.join(', ') + ' · forme ' + c.observation.forme + ' (' + accord + ')' + bouts + luc + ' · ' + c.photos.length + ' photo(s)' + contra;
}
