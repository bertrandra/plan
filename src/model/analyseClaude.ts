// L'analyse d'une maison par Claude, cote modele (MD/spec-audit.md §13.2, MD/spec-regles-toits.md
// §14) : la forme de sa reponse (deploy/schema-analyse.json, version 1), le vote de trois passes,
// les indices LiDAR chiffres qu'on lui donne et le controle croise qui les confronte a sa reponse.
//
// Tout est pur et deterministe : l'appel au serveur est dans io/analyseClaude.ts, l'orchestration
// dans app/audit/parcelle/analyseClaude.ts. Claude ne calcule rien ici : il propose, et ce module
// transforme ses trois reponses en un seul avis par attribut, avec la part des passes d'accord.
//
// Le taux d'accord mesure par attribut (§14.2, point 5) vient du corpus valide (lots L19 a L21) ;
// tant qu'il n'est pas mesure, aucun attribut n'est pre-accepte : la table est vide, et chaque
// proposition de Claude arrive decochee, avec la raison.

import type { ToitMesure, CorpsToit, PtBrut } from './types.js';
import { boutLu, silhouetteLue, type BoutVu, type SilhouetteFacade } from './silhouetteFacade.js';

/** La version du schema de sortie que ce code sait lire (deploy/schema-analyse.json). */
export const VERSION_SCHEMA_ANALYSE = 1;
/** Trois passes et un vote (spec-regles-toits §14.2, point 3). */
export const PASSES_ANALYSE = 3;

export type Compte = number | 'indetermine';
export type OuiNon = 'oui' | 'non' | 'indetermine';
export interface IndiceAnalyse { image: number; vu: string }
export interface Attribut<T extends string> { indices: IndiceAnalyse[]; valeur: T }

export interface SoucheAnalyse { position: 'faitage' | 'pan' | 'pignon' | 'facade' | 'indetermine'; materiau: 'brique' | 'enduit' | 'pierre' | 'metal' | 'indetermine' }

export interface FacadeAnalyse {
  indices: IndiceAnalyse[];
  /** L'etiquette donnee dans le prompt : « sud », « nord »… */
  facade: string;
  ouvertures: { niveaux: Compte; parNiveau: Compte[]; manquees: Compte; enTrop: Compte };
  /** `vitrage`, `ouvrant`, `porte`, `garage`, `couleurVolets` : absents d'une reponse d'avant le schema version 5. */
  details: { volets: string; coffre: OuiNon; balcon: OuiNon; forme: string; vitrage?: string; ouvrant?: string; porte?: string; garage?: string; couleurVolets?: string };
  materiau: 'pierre' | 'meuliere' | 'beton' | 'brique' | 'enduit' | 'bois' | 'indetermine';
  /** La ligne du haut de la facade et ce qu'elle ferme (model/silhouetteFacade.ts) ; absents d'une reponse d'avant le prompt version 7. */
  silhouette?: string;
  bout?: string;
  ecart: string;
}

/** La reponse d'une passe, telle que le schema la garantit. */
export interface ReponseAnalyse {
  forme: Attribut<string>;
  profil: Attribut<string>;
  faitage: { indices: IndiceAnalyse[]; sens: string };
  bouts: { indices: IndiceAnalyse[]; gauche: string; droite: string };
  lucarnes: { indices: IndiceAnalyse[]; nombre: Compte; types: string[]; pan: string };
  cheminees: { indices: IndiceAnalyse[]; nombre: Compte; souches: SoucheAnalyse[] };
  terrasse: { indices: IndiceAnalyse[]; presente: OuiNon; type: string; acrotere: OuiNon; edicules: Compte };
  couverture: Attribut<string>;
  elements: { indices: IndiceAnalyse[]; element: string }[];
  facades: FacadeAnalyse[];
  ecarts: { indices: IndiceAnalyse[]; sujet: string; modele: string; observe: string }[];
  contradictions: { indiceLidar: string; observation: string }[];
  confiance: 'faible' | 'moyenne' | 'forte';
  /** Les numeros des images qui ne montrent pas ce batiment (une autre maison, un mur voisin) ; absent d'une reponse d'avant le schema version 5. */
  imagesHorsSujet?: number[];
}

const estTableau = (v: unknown): v is unknown[] => Array.isArray(v);
const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Un champ « simple » de la reponse : `{ indices, valeur }` (un terme du vocabulaire) ou `{ indices, nombre }`
 * (un compte). Les descriptions de sujets les declarent (regles/sujets/vote.ts) ; le vote les lit sans code
 * propre a chacun, de sorte qu'un sujet nouveau (un chien-assis...) soit lu et vote des son entree au schema.
 */
export interface ChampSimple { nom: string; cle: 'valeur' | 'nombre' }
/** Ce que l'on lit d'un champ simple dans une passe. */
export interface LectureSimple { valeur: string | Compte; indices: IndiceAnalyse[] }

/** Les champs de la reponse que le vote lit a la main, un par un : le vote generique ne les reprend pas. */
export const CHAMPS_LUS_A_LA_MAIN: readonly string[] = ['forme', 'profil', 'faitage', 'bouts', 'bout', 'lucarnes', 'cheminees', 'terrasse', 'couverture', 'elements', 'facades', 'ecarts', 'contradictions', 'confiance', 'imagesHorsSujet'];

/** Le champ simple `nom` d'une passe ; null s'il est absent (une reponse d'avant le sujet) ou mal forme. */
export function lireSimple(r: ReponseAnalyse, champ: ChampSimple): LectureSimple | null {
  const c = (r as unknown as Record<string, unknown>)[champ.nom];
  if (!estObjet(c) || !estTableau(c.indices)) return null;
  const v = c[champ.cle];
  // Un compte est un entier ou `indetermine` ; une valeur est un terme (le schema ferme le vocabulaire, le serveur le ramene).
  const ok = champ.cle === 'nombre' ? Number.isInteger(v) || v === 'indetermine' : typeof v === 'string';
  if (!ok) return null;
  return { valeur: v as string | Compte, indices: c.indices as IndiceAnalyse[] };
}

/**
 * Une sortie de Claude a-t-elle la forme attendue ? Le schema le garantit ; on verifie les tetes de chapitre.
 * Un champ simple declare par un sujet est facultatif (les reponses gardees d'avant lui n'en ont pas), mais
 * mal forme quand il est la, il refuse la passe.
 */
export function estReponseAnalyse(v: unknown, simples: readonly ChampSimple[] = []): v is ReponseAnalyse {
  if (!estObjet(v)) return false;
  for (const k of ['forme', 'profil', 'faitage', 'bouts', 'lucarnes', 'cheminees', 'terrasse', 'couverture']) if (!estObjet(v[k])) return false;
  for (const k of ['elements', 'facades', 'ecarts', 'contradictions']) if (!estTableau(v[k])) return false;
  for (const c of simples) if (c.nom in v && lireSimple(v as unknown as ReponseAnalyse, c) === null) return false;
  return typeof (v.forme as Record<string, unknown>).valeur === 'string' && typeof v.confiance === 'string';
}

/* ------------------------------------------------------------------------------------------------
 * Le vote
 * --------------------------------------------------------------------------------------------- */

/** Un attribut vote : la valeur majoritaire, la part des passes qui la donnent, leurs indices. */
export interface Vote<T> {
  valeur: T;
  /** De 0 a 1 : la part des passes d'accord avec la valeur retenue. */
  accord: number;
  /** Les indices des passes d'accord, dedoublonnes. */
  indices: IndiceAnalyse[];
  /** Les passes ne s'accordaient pas et un modele plus fin a tranche (D20 de MD/plan-vague-3-generaliser.md) : sa valeur est retenue, a verifier. */
  escalade?: true;
}

export interface FacadeVotee {
  facade: string;
  materiau: Vote<FacadeAnalyse['materiau']>;
  volets: Vote<string>;
  coffre: Vote<OuiNon>;
  balcon: Vote<OuiNon>;
  formeOuvertures: Vote<string>;
  vitrage: Vote<string>;
  ouvrant: Vote<string>;
  porte: Vote<string>;
  garage: Vote<string>;
  couleurVolets: Vote<string>;
  silhouette: Vote<SilhouetteFacade>;
  bout: Vote<BoutVu>;
  niveaux: Vote<Compte>;
  /** Les ouvertures de chaque niveau, du bas vers le haut ; `indetermine` quand un niveau ne se compte pas. */
  parNiveau: Vote<number[] | 'indetermine'>;
  manquees: Vote<Compte>;
  enTrop: Vote<Compte>;
  ecarts: string[];
}

export interface VoteAnalyse {
  passes: number;
  forme: Vote<string>;
  profil: Vote<string>;
  faitage: Vote<string>;
  boutGauche: Vote<string>;
  boutDroit: Vote<string>;
  lucarnes: Vote<Compte>;
  panLucarnes: Vote<string>;
  /** Les types de lucarnes de la premiere passe qui donne le nombre retenu. */
  lucarnesTypes: string[];
  cheminees: Vote<Compte>;
  /** Les souches de la premiere passe qui donne le nombre retenu. */
  souches: SoucheAnalyse[];
  terrasse: Vote<OuiNon>;
  typeTerrasse: Vote<string>;
  acrotere: Vote<OuiNon>;
  edicules: Vote<Compte>;
  couverture: Vote<string>;
  elements: Vote<string>[];
  facades: FacadeVotee[];
  ecarts: { sujet: string; modele: string; observe: string }[];
  contradictions: { indiceLidar: string; observation: string }[];
  confiance: Vote<ReponseAnalyse['confiance']>;
  /** Les images que plus de la moitie des passes disent hors sujet, dans l'ordre de leur numero. */
  imagesHorsSujet: number[];
  /** Les champs simples des sujets, votes sans code propre : par nom de champ (regles/sujets/vote.ts les declare). */
  simples: Record<string, Vote<string | Compte>>;
}

const cleDe = (v: unknown): string => JSON.stringify(v);

function dedoublonner(indices: readonly IndiceAnalyse[]): IndiceAnalyse[] {
  const vus = new Set<string>();
  return indices.filter((i) => { const k = i.image + ':' + i.vu; if (vus.has(k)) return false; vus.add(k); return true; });
}

/**
 * Le desaccord des passes tranche par l'escalade : quand le vote n'est pas unanime (`accord` sous 1) et que le modele
 * plus fin a une valeur (autre qu'`indetermine`), c'est la sienne, avec la part des passes d'accord d'origine et
 * la marque `escalade`. Unanime, ou sans reponse utile du modele fin : le vote reste tel quel.
 */
function tranche<T>(vote: Vote<T>, fin: T | undefined, indicesFin: readonly IndiceAnalyse[], indetermine: T): Vote<T> {
  if (fin === undefined || vote.accord >= 1 || cleDe(fin) === cleDe(indetermine)) return vote;
  return { valeur: fin, accord: vote.accord, indices: dedoublonner([...vote.indices, ...indicesFin]), escalade: true };
}

/**
 * Le vote d'un attribut : la valeur donnee par plus de la moitie des passes, sinon `indetermine`
 * (spec-regles-toits §14.2, point 3 : un attribut sans majorite revient a la personne). `indetermine`
 * ne gagne jamais contre une valeur : deux passes qui voient, une qui ne voit pas, c'est vu.
 */
export function voterAttribut<T>(valeurs: readonly T[], indices: readonly (readonly IndiceAnalyse[])[], indetermine: T): Vote<T> {
  const n = valeurs.length;
  const comptes = new Map<string, { valeur: T; n: number; indices: IndiceAnalyse[] }>();
  valeurs.forEach((v, i) => {
    const k = cleDe(v);
    const c = comptes.get(k) ?? { valeur: v, n: 0, indices: [] };
    c.n++;
    c.indices.push(...(indices[i] ?? []));
    comptes.set(k, c);
  });
  let meilleur: { valeur: T; n: number; indices: IndiceAnalyse[] } | null = null;
  for (const c of comptes.values()) {
    if (cleDe(c.valeur) === cleDe(indetermine)) continue;
    if (!meilleur || c.n > meilleur.n) meilleur = c;
  }
  if (!n || !meilleur || meilleur.n * 2 <= n) {
    // Pas de majorite : indetermine, avec la part de la meilleure valeur pour dire combien on a hesite.
    return { valeur: indetermine, accord: meilleur && n ? meilleur.n / n : 0, indices: [] };
  }
  return { valeur: meilleur.valeur, accord: meilleur.n / n, indices: dedoublonner(meilleur.indices) };
}

const IND = 'indetermine' as const;

/** Les ouvertures par niveau d'une passe : des nombres, un par niveau ; sinon `indetermine`. */
const lireParNiveau = (p: readonly Compte[] | undefined): number[] | 'indetermine' =>
  Array.isArray(p) && p.length && p.every((n) => typeof n === 'number' && n >= 0) ? p as number[] : IND;

function voterFacades(reponses: readonly ReponseAnalyse[]): FacadeVotee[] {
  const etiquettes = [...new Set(reponses.flatMap((r) => r.facades.map((f) => f.facade)))];
  return etiquettes.map((etiquette) => {
    const fs = reponses.map((r) => r.facades.find((f) => f.facade === etiquette)).filter((f): f is FacadeAnalyse => !!f);
    const ind = fs.map((f) => f.indices);
    const v = <T>(f: (x: FacadeAnalyse) => T, i: T) => voterAttribut(fs.map(f), ind, i);
    return {
      facade: etiquette,
      materiau: v((f) => f.materiau, IND), volets: v((f) => f.details.volets, IND), coffre: v((f) => f.details.coffre, IND),
      balcon: v((f) => f.details.balcon, IND), formeOuvertures: v((f) => f.details.forme, IND),
      vitrage: v((f) => f.details.vitrage ?? IND, IND), ouvrant: v((f) => f.details.ouvrant ?? IND, IND), porte: v((f) => f.details.porte ?? IND, IND),
      garage: v((f) => f.details.garage ?? IND, IND), couleurVolets: v((f) => f.details.couleurVolets ?? IND, IND),
      silhouette: v((f) => silhouetteLue(f.silhouette), IND), bout: v((f) => boutLu(f.bout), IND),
      niveaux: v<Compte>((f) => f.ouvertures.niveaux, IND), parNiveau: v((f) => lireParNiveau(f.ouvertures.parNiveau), IND as number[] | 'indetermine'), manquees: v<Compte>((f) => f.ouvertures.manquees, IND), enTrop: v<Compte>((f) => f.ouvertures.enTrop, IND),
      ecarts: [...new Set(fs.map((f) => f.ecart.trim()).filter(Boolean))],
    };
  });
}

/** Le vote d'un champ simple : les passes qui le donnent, `indetermine` quand aucune ne l'a. */
function voterSimple(reponses: readonly ReponseAnalyse[], champ: ChampSimple): Vote<string | Compte> {
  const lues = reponses.map((r) => lireSimple(r, champ)).filter((l): l is LectureSimple => l !== null);
  return voterAttribut<string | Compte>(lues.map((l) => l.valeur), lues.map((l) => l.indices), IND);
}

/**
 * Trois passes (ou moins, si l'une a echoue) deviennent un seul avis par attribut ; `simples` : les champs que les
 * sujets declarent ; `fin` : la reponse du modele plus fin appele quand les passes se desaccordent (D20), qui
 * tranche les attributs sans unanimite (tous sauf les facades, les elements, les ecarts et la confiance).
 */
export function voter(reponses: readonly ReponseAnalyse[], simples: readonly ChampSimple[] = [], fin: ReponseAnalyse | null = null): VoteAnalyse {
  const ind = (f: (r: ReponseAnalyse) => readonly IndiceAnalyse[]) => reponses.map(f);
  const v = <T>(f: (r: ReponseAnalyse) => T, i: (r: ReponseAnalyse) => readonly IndiceAnalyse[], indetermine: T) =>
    tranche(voterAttribut(reponses.map(f), ind(i), indetermine), fin ? f(fin) : undefined, fin ? i(fin) : [], indetermine);
  const cheminees = v<Compte>((r) => r.cheminees.nombre, (r) => r.cheminees.indices, IND);
  const souches = [...reponses, ...(fin ? [fin] : [])].find((r) => cleDe(r.cheminees.nombre) === cleDe(cheminees.valeur))?.cheminees.souches ?? [];
  const lucarnes = v<Compte>((r) => r.lucarnes.nombre, (r) => r.lucarnes.indices, IND);
  const lucarnesTypes = [...reponses, ...(fin ? [fin] : [])].find((r) => cleDe(r.lucarnes.nombre) === cleDe(lucarnes.valeur))?.lucarnes.types ?? [];
  const elements = [...new Set(reponses.flatMap((r) => r.elements.map((e) => e.element)))]
    .map((el) => voterAttribut(reponses.map((r) => (r.elements.some((e) => e.element === el) ? el : IND)), reponses.map((r) => r.elements.filter((e) => e.element === el).flatMap((e) => e.indices)), IND))
    .filter((x) => x.valeur !== IND);
  const ecarts = new Map<string, { sujet: string; modele: string; observe: string }>();
  for (const r of reponses) for (const e of r.ecarts) ecarts.set(e.sujet + '|' + e.observe, { sujet: e.sujet, modele: e.modele, observe: e.observe });
  const contradictions = new Map<string, { indiceLidar: string; observation: string }>();
  for (const r of reponses) for (const c of r.contradictions) contradictions.set(c.indiceLidar + '|' + c.observation, c);
  return {
    passes: reponses.length,
    forme: v((r) => r.forme.valeur, (r) => r.forme.indices, IND),
    profil: v((r) => r.profil.valeur, (r) => r.profil.indices, IND),
    faitage: v((r) => r.faitage.sens, (r) => r.faitage.indices, IND),
    boutGauche: v((r) => r.bouts.gauche, (r) => r.bouts.indices, IND),
    boutDroit: v((r) => r.bouts.droite, (r) => r.bouts.indices, IND),
    lucarnes, lucarnesTypes,
    panLucarnes: v((r) => r.lucarnes.pan, (r) => r.lucarnes.indices, IND),
    cheminees, souches,
    terrasse: v((r) => r.terrasse.presente, (r) => r.terrasse.indices, IND),
    typeTerrasse: v((r) => r.terrasse.type, (r) => r.terrasse.indices, IND),
    acrotere: v((r) => r.terrasse.acrotere, (r) => r.terrasse.indices, IND),
    edicules: v<Compte>((r) => r.terrasse.edicules, (r) => r.terrasse.indices, IND),
    couverture: v((r) => r.couverture.valeur, (r) => r.couverture.indices, IND),
    elements,
    facades: voterFacades(reponses),
    ecarts: [...ecarts.values()],
    contradictions: [...contradictions.values()],
    confiance: voterAttribut(reponses.map((r) => r.confiance), reponses.map(() => []), 'faible' as ReponseAnalyse['confiance']),
    imagesHorsSujet: [...new Set(reponses.flatMap((r) => (Array.isArray(r.imagesHorsSujet) ? r.imagesHorsSujet : []).filter((n) => Number.isInteger(n))))]
      .filter((n) => reponses.filter((r) => r.imagesHorsSujet?.includes(n)).length * 2 > reponses.length).sort((a, z) => a - z),
    simples: Object.fromEntries(simples.map((c) => [c.nom, tranche(voterSimple(reponses, c), fin ? lireSimple(fin, c)?.valeur : undefined, fin ? lireSimple(fin, c)?.indices ?? [] : [], IND)])),
  };
}

/**
 * Les attributs sur lesquels les passes ne s'accordent pas toutes (D20) : de quoi decider d'appeler un modele plus fin.
 * Les facades, les elements du toit, les ecarts et la confiance ne comptent pas : l'escalade ne les tranche pas.
 */
export function attributsEnDesaccord(v: VoteAnalyse): string[] {
  if (v.passes < 2) return [];
  const scalaires: [string, Vote<unknown>][] = [
    ['forme', v.forme], ['profil', v.profil], ['faitage', v.faitage], ['boutGauche', v.boutGauche], ['boutDroit', v.boutDroit], ['lucarnes', v.lucarnes], ['panLucarnes', v.panLucarnes],
    ['cheminees', v.cheminees], ['terrasse', v.terrasse], ['typeTerrasse', v.typeTerrasse], ['acrotere', v.acrotere], ['edicules', v.edicules], ['couverture', v.couverture],
    // Un champ simple qu'aucune passe ne donne (une reponse d'avant son entree au schema, ou toutes `indetermine`) n'a rien a departager.
    ...Object.entries(v.simples).filter(([, x]) => x.valeur !== IND || x.accord > 0),
  ];
  return scalaires.filter(([, x]) => x.accord < 1).map(([nom]) => nom);
}

/* ------------------------------------------------------------------------------------------------
 * Les indices LiDAR chiffres, et le controle croise
 * --------------------------------------------------------------------------------------------- */

/** Ce que Plan a mesure sur le LiDAR, en chiffres, pour que Claude le confronte a ce qu'il voit. */
export interface IndicesLidar {
  /** La hauteur a l'egout et le point le plus haut, en metres au-dessus du sol. */
  egoutM: number;
  faiteM: number;
  /** Combien le toit monte au-dessus de l'egout : un toit plat ne monte presque pas. */
  monteeM: number;
  /** La hauteur mediane des cellules qui touchent le bord, au-dessus de l'egout : une bande raide le long des murs (Mansart) la fait grimper. */
  monteeAuxBordsM: number;
  /** Les sommets locaux de la grille lissee : un deux-pans n'en a qu'un, un toit en M deux. */
  sommets: number;
  /** Un creux au milieu, plus bas que les deux bords (toit en M, papillon). */
  creux: boolean;
  corps: { longueurM: number; largeurM: number; faitageM: number; egoutsM: [number, number]; penteDeg: number; appentis: boolean; croupes: boolean; ecartM: number }[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const mediane = (xs: number[]): number => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2; };

function corpsChiffre(c: CorpsToit): IndicesLidar['corps'][number] {
  const [p0, p1, , p3] = c.pts;
  const L = p0 && p1 ? Math.hypot(p1.x - p0.x, p1.y - p0.y) : 0;
  const W = p0 && p3 ? Math.hypot(p3.x - p0.x, p3.y - p0.y) : 0;
  const egoutMax = Math.max(c.egouts[0], c.egouts[1]);
  const demi = Math.max(0.5, Math.min(c.posFaitage, W - c.posFaitage));
  const appentis = c.posFaitage <= 0.5 || c.posFaitage >= W - 0.5;
  const penteDeg = Math.atan2(c.faitage - egoutMax, appentis ? W : demi) * 180 / Math.PI;
  return { longueurM: r2(L), largeurM: r2(W), faitageM: r2(c.faitage), egoutsM: [r2(c.egouts[0]), r2(c.egouts[1])], penteDeg: Math.round(penteDeg), appentis, croupes: !!c.croupes && (c.croupes[0] > 0 || c.croupes[1] > 0), ecartM: r2(c.ecart) };
}

/** Un lissage 3 x 3 de la grille, `null` hors du toit : il efface les cheminees avant de compter les sommets. */
function lisser3(z: readonly (number | null)[], nx: number, ny: number): (number | null)[] {
  const out: (number | null)[] = new Array(nx * ny).fill(null);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (z[j * nx + i] === null) continue;
    let s = 0, n = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const v = i + di >= 0 && i + di < nx && j + dj >= 0 && j + dj < ny ? z[(j + dj) * nx + i + di] : null;
      if (v !== null && v !== undefined) { s += v; n++; }
    }
    out[j * nx + i] = n ? s / n : null;
  }
  return out;
}

/**
 * Les sommets d'une grille lissee : les plateaux de cellules qu'aucune voisine ne depasse (a 5 cm
 * pres), au-dessus de l'egout d'au moins 50 cm. Un faitage est un plateau allonge, pas un point :
 * on compte donc les plateaux (cellules voisines a 20 cm pres), pas les cellules.
 */
export function compterSommets(z: readonly (number | null)[], nx: number, ny: number, egout: number): number {
  const l = lisser3(z, nx, ny);
  const val = (i: number, j: number): number | null => (i >= 0 && i < nx && j >= 0 && j < ny ? (l[j * nx + i] ?? null) : null);
  const candidat = new Array<boolean>(nx * ny).fill(false);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = val(i, j);
    if (v === null || v < egout + 0.5) continue;
    let haut = true;
    for (let dj = -1; dj <= 1 && haut; dj++) for (let di = -1; di <= 1; di++) {
      const w = (di || dj) ? val(i + di, j + dj) : null;
      if (w !== null && w > v + 0.05) { haut = false; break; }
    }
    candidat[j * nx + i] = haut;
  }
  const vu = new Array<boolean>(nx * ny).fill(false);
  let sommets = 0;
  for (let k = 0; k < nx * ny; k++) {
    if (!candidat[k] || vu[k]) continue;
    sommets++;
    const pile = [k];
    vu[k] = true;
    while (pile.length) {
      const c = pile.pop() as number;
      const ci = c % nx, cj = Math.floor(c / nx), vc = val(ci, cj) as number;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || i >= nx || j < 0 || j >= ny) continue;
        const n = j * nx + i, w = val(i, j);
        if (!candidat[n] || vu[n] || w === null || Math.abs(w - vc) > 0.2) continue;
        vu[n] = true;
        pile.push(n);
      }
    }
  }
  return sommets;
}

/** Les indices chiffres d'un batiment : sa mesure LiDAR et ses corps reconstruits ; null sans mesure. */
export function indicesLidar(mesure: ToitMesure | null | undefined, corps: readonly CorpsToit[] | null | undefined): IndicesLidar | null {
  if (!mesure) return null;
  const { nx, ny, z, egout, faite } = mesure;
  const bords: number[] = [];
  const centres: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v = z[j * nx + i];
    if (v === null || v === undefined) continue;
    const auBord = i === 0 || j === 0 || i === nx - 1 || j === ny - 1
      || [z[j * nx + i - 1], z[j * nx + i + 1], z[(j - 1) * nx + i], z[(j + 1) * nx + i]].some((w) => w === null || w === undefined);
    (auBord ? bords : centres).push(v);
  }
  const sommets = compterSommets(z, nx, ny, egout);
  // Un creux : le centre de la grille plus bas que la mediane du toit, alors que le toit monte.
  const centre = z[Math.floor(ny / 2) * nx + Math.floor(nx / 2)];
  const medianeToit = mediane([...bords, ...centres]);
  const creux = faite - egout > 1 && centre !== null && centre !== undefined && centre < medianeToit - 0.5 && sommets >= 2;
  return {
    egoutM: r2(egout), faiteM: r2(faite), monteeM: r2(Math.max(0, faite - egout)),
    monteeAuxBordsM: r2(Math.max(0, mediane(bords) - egout)), sommets, creux,
    corps: (corps ?? []).map(corpsChiffre),
  };
}

/** Au-dessus, un toit plat annonce ne tient pas ; en deca d'une bande raide, un Mansart non plus. */
export const MONTEE_PLATE_MAX_M = 1;
export const BANDE_RAIDE_MIN_M = 1;

/**
 * Le controle croise (spec-regles-toits §14.2, point 4) : ce que la reponse votee contredit dans les
 * indices chiffres. Une contradiction n'est pas une erreur : la proposition arrive decochee et le dit.
 */
export function contradictionsLidar(vote: VoteAnalyse, indices: IndicesLidar | null): string[] {
  if (!indices) return [];
  const out: string[] = [];
  const f = vote.forme.valeur;
  if (f === 'plat' && indices.monteeM > MONTEE_PLATE_MAX_M) out.push('toit plat annoncé, mais le LiDAR monte de ' + indices.monteeM.toFixed(1).replace('.', ',') + ' m au-dessus de l’égout');
  if ((f === 'mansart' || f === 'gambrel') && indices.monteeAuxBordsM < BANDE_RAIDE_MIN_M) out.push('brisis annoncé, mais aucune bande raide mesurée le long des murs');
  if ((f === 'toit-en-m' || f === 'papillon') && !indices.creux) out.push('creux central annoncé, mais le LiDAR n’en mesure pas');
  if (['deux-pans', 'croupes', 'demi-croupe', 'appentis'].includes(f) && indices.monteeM <= 0.3) out.push('pans annoncés, mais le LiDAR mesure un toit presque plat');
  if (vote.terrasse.valeur === 'oui' && indices.monteeM > MONTEE_PLATE_MAX_M && !indices.corps.some((c) => c.faitageM - Math.max(...c.egoutsM) <= 0.3)) out.push('toiture-terrasse annoncée, mais aucun corps plat mesuré');
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Le taux d'accord mesure, et ce qu'il autorise
 * --------------------------------------------------------------------------------------------- */

/** Les attributs que Claude propose dans le projet, et sur lesquels un taux d'accord se mesure. */
export type AttributClaude = 'couverture' | 'cheminees' | 'terrasse' | 'materiauMurs' | 'couleurMurs' | 'formeToit';

/**
 * Le taux d'accord mesure par attribut sur les cas valides (spec-regles-toits §14.2, point 5). Vide
 * tant que le corpus ne l'a pas mesure : aucune proposition de Claude n'est alors pre-acceptee.
 */
export const ACCORDS_MESURES: Readonly<Partial<Record<AttributClaude, number>>> = {};

/** Au-dessus, l'attribut peut etre pre-accepte (regles/decisions.ts, ACCORD_CLAUDE_MIN). */
export const ACCORD_PREACCEPTE = 0.95;

/** La raison pour laquelle une proposition de Claude arrive decochee, ou null si elle peut etre cochee. */
export function reserveClaude(attribut: AttributClaude, vote: { accord: number; escalade?: true }, contradictions: readonly string[]): string | null {
  if (contradictions.length) return 'Contredit la mesure LiDAR : ' + contradictions.join(' ; ') + '.';
  if (vote.escalade) return 'Les passes de Claude ne s’accordaient pas (' + Math.round(vote.accord * 100) + ' %) ; un modèle plus fin a tranché : à vérifier.';
  if (vote.accord < 1) return 'Les trois passes de Claude ne sont pas toutes d’accord (' + Math.round(vote.accord * 100) + ' %).';
  const mesure = ACCORDS_MESURES[attribut];
  if (mesure === undefined) return 'Taux d’accord de Claude non encore mesuré sur cet attribut : à vérifier.';
  if (mesure < ACCORD_PREACCEPTE) return 'Taux d’accord de Claude mesuré à ' + Math.round(mesure * 100) + ' % sur cet attribut : à vérifier.';
  return null;
}

/**
 * Ce que Claude dit de sa propre observation (`confiance`, votee sur les passes) : `faible` quand les images
 * sont mauvaises, masquees ou en desaccord. Une reserve de plus sur chacune de ses propositions, qui arrive
 * deja decochee : la personne sait que Claude lui-meme doute. Null pour `moyenne` et `forte`.
 */
export function reserveConfiance(confiance: Vote<ReponseAnalyse['confiance']>): string | null {
  return confiance.valeur === 'faible' ? 'Claude se dit peu sûr de ce qu’il voit (images mauvaises, masquées ou en désaccord).' : null;
}

/** Le contour d'un batiment en JSON compact, au decimetre : ce que Claude recoit du modele actuel. */
export function contourCompact(pts: readonly PtBrut[]): number[][] {
  return pts.map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);
}
