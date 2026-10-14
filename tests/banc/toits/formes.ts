// Le banc des formes de toit (MD/plan-vague-3-generaliser.md, lot G2 ; MD/spec-regles-toits.md §8.2).
//
// Le banc des villages (.claude/skills/toits/scripts/banc.ts) comptait les corps, les suspects et les
// reprises. Les formes nouvelles (vague 3b : lucarnes, Mansart, demi-croupe...) arrivent une par PR,
// et chacune doit dire combien de batiments elle fait changer de forme, et lesquels : une forme qui
// apparait partout est un faux positif. Ce module compte les formes produites par village et compare
// a une reference enregistree avant la modification.
//
// La forme d'un batiment est celle de son corps principal (le plus grand), comme l'observation (§7.1).
// Elle se deduit des corps par model/formeToit.ts (lot G1) quand il existe ; sinon par une copie
// locale de la meme regle, limitee aux champs que les corps ont aujourd'hui (pentes droites, croupes),
// pour ne pas toucher au modele avant G1. Le test verifie que les deux s'accordent quand G1 est la.
//
// Pur, sans reseau : il ne lit que des corps et le fichier des reglages.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { REGLAGES_TOITS as R } from '../../../src/model/reglagesToits.js';
import type { CorpsToit, PtBrut } from '../../../src/model/types.js';

/** Un batiment dont aucun corps n'est reconstruit, avec ou sans surface mesuree. */
export const SANS_CORPS = 'sans corps';
export const SANS_MESURE = 'sans mesure';

/**
 * L'ordre d'affichage : le catalogue de la spec (§3.1), du plus simple au plus rare, puis les
 * batiments sans corps. Une forme inconnue de cette liste (ajoutee plus tard au modele) se range
 * apres, par ordre alphabetique : le banc ne la perd pas.
 */
export const ORDRE_FORMES: readonly string[] = [
  'plat', 'appentis', 'deux-pans', 'croupes', 'quatre-pans', 'pavillon', 'demi-croupes', 'mansart', 'asymetrique',
  'deux-pans-decales', 'toit-en-m', 'papillon', 'gambrel', 'coyau', 'shed', 'berceau', 'carene', 'conique',
  'polygonal', 'fleche', 'dome', 'imperiale', SANS_CORPS, SANS_MESURE,
];

/* ------------------------------------------------------------------------------------------------
 * La forme d'un corps, copie locale de model/formeToit.ts (lot G1)
 * --------------------------------------------------------------------------------------------- */

/** Un quatre-pans dont le faitage fait moins de cela est un pavillon (spec §3.4, confusion 5) ; meme seuil que G1. */
export const FAITAGE_PAVILLON_MAX_M = 1;
/** Et sur un plan presque carre (le long cote au plus 1,25 fois le court) ; meme seuil que G1. */
export const RAPPORT_PAVILLON_MAX = 1.25;
/** Un faitage a moins de 1 cm d'un mur est sur le mur : un appentis (tolerance de facade/faitsToits.ts). */
const SUR_LE_MUR_M = 0.01;

type CorpsBanc = Pick<CorpsToit, 'pts' | 'posFaitage' | 'faitage' | 'egouts'> & { croupes?: readonly number[] | undefined };

const longueur = (a: PtBrut | undefined, b: PtBrut | undefined): number => (a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0);

/** La longueur (le long du faitage, `pts[0] -> pts[1]`) et la largeur (`pts[0] -> pts[3]`) d'un corps. */
function dimensions(c: Pick<CorpsToit, 'pts'>): { L: number; W: number } {
  return { L: longueur(c.pts[0], c.pts[1]), W: longueur(c.pts[0], c.pts[3]) };
}

/**
 * La forme d'un corps a pentes droites (les seuls que le calcul produit avant la vague 3b) : la regle
 * de `formeDuCorpsToit` (G1) sans les profils brises ou courbes ni les bouts en demi-croupe, que
 * personne n'ecrit encore. Dans l'ordre : papillon (faitage sous les egouts), plat (moins de
 * HAUTEUR_PLAT_M de montee), appentis (faitage sur un mur), croupes ou pavillon, deux pans.
 */
export function formeLocaleDuCorps(c: CorpsBanc): string {
  const { L, W } = dimensions(c);
  const bas = Math.min(...c.egouts);
  const interieur = c.posFaitage > SUR_LE_MUR_M && c.posFaitage < W - SUR_LE_MUR_M;
  if (interieur && c.faitage <= bas - R.HAUTEUR_PLAT_M) return 'papillon';
  if (c.faitage - bas < R.HAUTEUR_PLAT_M) return 'plat';
  if (!interieur) return 'appentis';
  const h0 = c.croupes?.[0] ?? 0, h1 = c.croupes?.[1] ?? 0;
  if (h0 <= 0 && h1 <= 0) return 'deux-pans';
  const carre = Math.max(L, W) <= RAPPORT_PAVILLON_MAX * Math.min(L, W);
  return h0 > 0 && h1 > 0 && carre && L - h0 - h1 < FAITAGE_PAVILLON_MAX_M ? 'pavillon' : 'croupes';
}

/** Le corps principal d'un batiment : le plus grand a plat (le premier a egalite, comme G1). */
export function corpsPrincipal<C extends Pick<CorpsToit, 'pts'>>(corps: readonly C[]): C | null {
  let meilleur: C | null = null, aire = -1;
  for (const c of corps) {
    const { L, W } = dimensions(c);
    if (L * W > aire) { meilleur = c; aire = L * W; }
  }
  return meilleur;
}

/** La forme d'ensemble, copie locale de `formeDesCorps` (G1) : celle du corps principal, null sans corps. */
export function formeLocaleDesCorps(corps: readonly CorpsBanc[] | null | undefined): string | null {
  const p = corps?.length ? corpsPrincipal(corps) : null;
  return p ? formeLocaleDuCorps(p) : null;
}

/* ------------------------------------------------------------------------------------------------
 * La deduction retenue : celle du modele si G1 est la, sinon la copie locale
 * --------------------------------------------------------------------------------------------- */

export interface DeductionFormes {
  /** `modele` : model/formeToit.ts ; `locale` : la copie de ce module. */
  source: 'modele' | 'locale';
  duCorps(c: CorpsBanc): string;
  desCorps(corps: readonly CorpsBanc[]): string | null;
}

export const DEDUCTION_LOCALE: DeductionFormes = { source: 'locale', duCorps: formeLocaleDuCorps, desCorps: formeLocaleDesCorps };

/** Le module du modele qui deduit la forme (lot G1), absent tant que G1 n'est pas dans la branche. */
export const MODULE_FORME_TOIT = fileURLToPath(new URL('../../../src/model/formeToit.ts', import.meta.url));

interface ModuleFormeToit {
  formeDuCorpsToit?: (c: CorpsBanc) => string;
  formeDesCorps?: (corps: readonly CorpsBanc[]) => string | null;
}

/**
 * La deduction du modele quand model/formeToit.ts existe, sinon la copie locale. Le chemin est
 * calcule (pas un import ecrit) : le compilateur ne doit pas refuser la branche ou G1 manque. Un
 * module present mais casse fait echouer le banc plutot que de retomber sans le dire.
 */
export async function chargerDeduction(chemin: string = MODULE_FORME_TOIT): Promise<DeductionFormes> {
  if (!existsSync(chemin)) return DEDUCTION_LOCALE;
  const m = (await import(/* @vite-ignore */ chemin)) as ModuleFormeToit;
  const { formeDuCorpsToit, formeDesCorps } = m;
  if (!formeDuCorpsToit || !formeDesCorps) return DEDUCTION_LOCALE;
  return { source: 'modele', duCorps: formeDuCorpsToit, desCorps: formeDesCorps };
}

/* ------------------------------------------------------------------------------------------------
 * Le compte par village, la reference et les changements
 * --------------------------------------------------------------------------------------------- */

/** Ce que le banc retient d'un batiment : sa forme d'ensemble et celle de chacun de ses corps. */
export interface FormesBatiment {
  forme: string;
  corps: string[];
}

/** Les compteurs de la premiere ligne du banc (ceux du tableau du skill toits, §5). */
export interface CompteursBanc {
  batiments: number;
  corps: number;
  suspects: number;
  sansCorps: number;
  reprise: number;
}

/** Le fichier ecrit par `banc.ts --enregistrer`, relu par `--reference`. */
export interface ReferenceFormes {
  version: 1;
  village: string;
  /** Quand et avec quel code : pour le lecteur, rien ne s'en deduit. */
  date: string;
  commit: string | null;
  deduction: DeductionFormes['source'];
  compteurs: CompteursBanc;
  batiments: Record<string, FormesBatiment>;
}

/** La forme d'un batiment au banc : celle de ses corps, sinon pourquoi il n'en a pas. */
export function formesDuBatiment(d: DeductionFormes, corps: readonly CorpsBanc[], mesure: boolean): FormesBatiment {
  const forme = corps.length ? d.desCorps(corps) : null;
  return { forme: forme ?? (mesure ? SANS_CORPS : SANS_MESURE), corps: corps.map((c) => d.duCorps(c)) };
}

const rang = (f: string): number => {
  const i = ORDRE_FORMES.indexOf(f);
  return i < 0 ? ORDRE_FORMES.length : i;
};
/** Tri dans l'ordre du catalogue, puis alphabetique pour les formes qu'il ne connait pas. */
export const triFormes = (a: string, b: string): number => rang(a) - rang(b) || a.localeCompare(b);

/** Combien de fois chaque forme, dans l'ordre du catalogue. */
export function compterFormes(formes: Iterable<string>): [string, number][] {
  const n = new Map<string, number>();
  for (const f of formes) n.set(f, (n.get(f) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => triFormes(a[0], b[0]));
}

/** `deux-pans 50, croupes 12, ...` ; `aucune` pour une liste vide. */
export function ligneCompte(compte: readonly [string, number][]): string {
  return compte.length ? compte.map(([f, k]) => `${f} ${k}`).join(', ') : 'aucune';
}

/** Les deux lignes de formes du banc : par batiment (corps principal), puis par corps. */
export function lignesFormes(batiments: Record<string, FormesBatiment>): string[] {
  const liste = Object.values(batiments);
  return [
    'formes des batiments : ' + ligneCompte(compterFormes(liste.map((b) => b.forme))),
    'formes des corps : ' + ligneCompte(compterFormes(liste.flatMap((b) => b.corps))),
  ];
}

/** Un batiment dont la forme d'ensemble change ; `absent` d'un cote si le JSON du village a change. */
export interface ChangementForme {
  cle: string;
  avant: string;
  apres: string;
}

export const ABSENT = 'absent';

/** Les batiments dont la forme d'ensemble differe de la reference, dans l'ordre des cles. */
export function changementsDeForme(reference: Record<string, FormesBatiment>, courant: Record<string, FormesBatiment>): ChangementForme[] {
  const cles = [...new Set([...Object.keys(reference), ...Object.keys(courant)])].sort();
  const out: ChangementForme[] = [];
  for (const cle of cles) {
    const avant = reference[cle]?.forme ?? ABSENT, apres = courant[cle]?.forme ?? ABSENT;
    if (avant !== apres) out.push({ cle, avant, apres });
  }
  return out;
}

/**
 * Les batiments de meme forme d'ensemble dont un corps a change de forme (une annexe passee d'un pan
 * a plat) : moins grave, mais une forme nouvelle peut commencer par la.
 */
export function changementsDeCorps(reference: Record<string, FormesBatiment>, courant: Record<string, FormesBatiment>): string[] {
  const memes = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((f, i) => f === [...b].sort()[i]);
  return Object.keys(courant)
    .filter((cle) => {
      const r = reference[cle], c = courant[cle];
      return !!r && !!c && r.forme === c.forme && !memes(r.corps, c.corps);
    })
    .sort();
}

/** Le passage d'une forme a une autre, compte : `deux-pans -> croupes 3`. */
export function bilanChangements(ch: readonly ChangementForme[]): string[] {
  const n = new Map<string, number>();
  for (const c of ch) n.set(c.avant + ' -> ' + c.apres, (n.get(c.avant + ' -> ' + c.apres) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k, v]) => `${k} ${v}`);
}

/** Les compteurs qui ont bouge, `corps 118 -> 120` ; vide s'ils sont identiques. */
export function ecartsCompteurs(avant: CompteursBanc, apres: CompteursBanc): string[] {
  const noms: (keyof CompteursBanc)[] = ['batiments', 'corps', 'suspects', 'sansCorps', 'reprise'];
  return noms.filter((k) => avant[k] !== apres[k]).map((k) => `${k} ${avant[k]} -> ${apres[k]}`);
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const estCompteurs = (v: unknown): v is CompteursBanc =>
  estObjet(v) && ['batiments', 'corps', 'suspects', 'sansCorps', 'reprise'].every((k) => typeof v[k] === 'number');
const estFormesBatiment = (v: unknown): v is FormesBatiment =>
  estObjet(v) && typeof v.forme === 'string' && Array.isArray(v.corps) && v.corps.every((f) => typeof f === 'string');

/** Relit une reference ; une erreur dit ce qui manque plutot que de comparer a un fichier faux. */
export function lireReference(v: unknown): ReferenceFormes {
  if (!estObjet(v) || v.version !== 1) throw new Error('reference de formes : version 1 attendue');
  if (typeof v.village !== 'string') throw new Error('reference de formes : village manquant');
  if (!estCompteurs(v.compteurs)) throw new Error('reference de formes : compteurs incomplets');
  if (v.deduction !== 'modele' && v.deduction !== 'locale') throw new Error('reference de formes : deduction inconnue');
  const b = v.batiments;
  if (!estObjet(b) || !Object.values(b).every(estFormesBatiment)) throw new Error('reference de formes : batiments illisibles');
  return {
    version: 1, village: v.village, date: typeof v.date === 'string' ? v.date : '', commit: typeof v.commit === 'string' ? v.commit : null,
    deduction: v.deduction, compteurs: v.compteurs, batiments: b as Record<string, FormesBatiment>,
  };
}
