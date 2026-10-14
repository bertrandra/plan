// Les faits des toits : regles/toits/faits.json (MD/spec-regles-toits.md §5, §9).
//
// Un fait est une verite observee sur UN batiment (sa cle BD TOPO, `cleabs`) : ce que vous avez vu sur
// le terrain, dans le vocabulaire du §2 et du §7 de la spec. Il ne se code jamais dans une regle (un
// `if cleabs ==` est un fait) : il vit ici, dans le depot, relu par la CI. Le fichier est importe,
// donc compile dans le fichier livre : un toit calcule hier se recalcule a l'identique, sans reseau.
// Son empreinte entre dans la version de lecture des toits (app/toitsLidar.ts) : un fait ajoute ou
// change relit les toits deja lus.
//
// Ce module lit et verifie le fichier, et tient les faits en vigueur : ceux du depot, ou, le temps
// d'une seance, ceux d'un fichier essaye par l'administrateur (`?regles=local`, §9.2), jamais
// enregistres. L'application d'un fait a un toit est dans facade/faitsToits.ts.

import fichier from '../../regles/toits/faits.json';
import { fnv1a } from './reglagesToits.js';
import { FORMES_TOIT_SIMPLES } from './formeToit.js';
import type { FormeToitSimple } from './types.js';

/** Ce qui ferme un bout du faitage : un mur pignon, ou une croupe. */
export type BoutFait = 'pignon' | 'croupe';

/** Une fourchette de hauteurs, en metres au-dessus du sol. */
export interface Fourchette { min?: number; max?: number }

/**
 * Le sens du faitage observe. `long` : par rapport au plus long cote du contour (`parallele` ou
 * `perpendiculaire`) ; `azimut` : un azimut (0 = nord, sens horaire, modulo 180), celui que donne
 * la photo prise face a la facade - un faitage « perpendiculaire a la rue » s'ecrit ainsi, la rue
 * n'etant pas dans le calcul.
 */
export type FaitageFait =
  | { par: 'long'; sens: 'parallele' | 'perpendiculaire'; toleranceDeg?: number }
  | { par: 'azimut'; azimutDeg: number; toleranceDeg?: number };

/** Ce que vous avez vu : chaque assertion absente n'est pas imposee (spec §7.1). */
export interface ObservationFait {
  /**
   * La forme du corps principal (le plus grand), ou les formes admises : une forme simple, la seule
   * que le calcul sache produire (les formes du catalogue, model/formeToit.ts, viendront avec leur regle).
   */
  forme?: FormeToitSimple[];
  faitage?: FaitageFait;
  bouts?: [BoutFait, BoutFait];
  corps?: { min?: number; max?: number };
  egout?: Fourchette;
  faitageM?: Fourchette;
}

/** Les dimensions d'un fait en remplacement : la mesure n'en dit rien de juste. */
export interface DimensionsFait {
  egoutM: number;
  /** Absent : un toit plat a l'egout. */
  faitageM?: number;
  /** Un appentis : l'azimut vers lequel le pan monte (vers son mur haut). */
  hautVersDeg?: number;
}

export interface FaitToit {
  observation: ObservationFait;
  application: 'contrainte' | 'remplacement';
  dimensions?: DimensionsFait;
  /** D'ou il vient : le fichier de promenade et le cas, une photo. Sans effet sur le calcul. */
  preuve?: { promenade?: string; cas?: string; photo?: boolean };
  adresse?: string;
  historique?: { t: string; texte: string }[];
}

/** Les faits, par cle BD TOPO. */
export type FaitsToits = Readonly<Record<string, FaitToit>>;

/** Un fichier de faits illisible : le message dit quel fait et pourquoi. */
export class FaitsToitsIllisibles extends Error {}

const FORMES = FORMES_TOIT_SIMPLES;
const BOUTS: readonly BoutFait[] = ['pignon', 'croupe'];

const estNombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function fourchette(v: unknown, quoi: string): Fourchette | undefined {
  if (v === undefined) return undefined;
  const f = v as { min?: unknown; max?: unknown } | null;
  if (!f || typeof f !== 'object' || (f.min !== undefined && !estNombre(f.min)) || (f.max !== undefined && !estNombre(f.max))) throw new FaitsToitsIllisibles(quoi + ' : une fourchette { min, max } en metres');
  return { ...(f.min !== undefined ? { min: f.min as number } : {}), ...(f.max !== undefined ? { max: f.max as number } : {}) };
}

function faitage(v: unknown, quoi: string): FaitageFait | undefined {
  if (v === undefined) return undefined;
  const f = v as { par?: unknown; sens?: unknown; azimutDeg?: unknown; toleranceDeg?: unknown } | null;
  const tol = f?.toleranceDeg;
  if (tol !== undefined && !estNombre(tol)) throw new FaitsToitsIllisibles(quoi + '.faitage.toleranceDeg : un nombre de degres');
  const t = tol !== undefined ? { toleranceDeg: tol as number } : {};
  if (f?.par === 'long' && (f.sens === 'parallele' || f.sens === 'perpendiculaire')) return { par: 'long', sens: f.sens, ...t };
  if (f?.par === 'azimut' && estNombre(f.azimutDeg)) return { par: 'azimut', azimutDeg: f.azimutDeg, ...t };
  throw new FaitsToitsIllisibles(quoi + '.faitage : { par: "long", sens: "parallele" | "perpendiculaire" } ou { par: "azimut", azimutDeg } (la rue n\'est pas dans le calcul : ecrire l\'azimut de la photo)');
}

function observation(v: unknown, quoi: string): ObservationFait {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') throw new FaitsToitsIllisibles(quoi + ' : sans observation');
  const formes = o.forme === undefined ? undefined : Array.isArray(o.forme) ? o.forme : [o.forme];
  if (formes && (!formes.length || formes.some((x) => !FORMES.includes(x as FormeToitSimple)))) throw new FaitsToitsIllisibles(quoi + '.forme : ' + FORMES.join(', ') + ' (les autres formes du catalogue ne se calculent pas encore)');
  const bouts = o.bouts as unknown[] | undefined;
  if (bouts !== undefined && (!Array.isArray(bouts) || bouts.length !== 2 || bouts.some((b) => !BOUTS.includes(b as BoutFait)))) throw new FaitsToitsIllisibles(quoi + '.bouts : deux bouts parmi pignon, croupe');
  const corps = o.corps as { min?: unknown; max?: unknown } | undefined;
  if (corps !== undefined && ((corps.min !== undefined && !(Number.isInteger(corps.min) && (corps.min as number) >= 1)) || (corps.max !== undefined && !(Number.isInteger(corps.max) && (corps.max as number) >= 1)))) throw new FaitsToitsIllisibles(quoi + '.corps : { min, max } entiers, au moins 1');
  const f = faitage(o.faitage, quoi), eg = fourchette(o.egout, quoi + '.egout'), fm = fourchette(o.faitageM, quoi + '.faitageM');
  return {
    ...(formes ? { forme: formes as FormeToitSimple[] } : {}),
    ...(f ? { faitage: f } : {}),
    ...(bouts ? { bouts: bouts as [BoutFait, BoutFait] } : {}),
    ...(corps ? { corps: { ...(corps.min !== undefined ? { min: corps.min as number } : {}), ...(corps.max !== undefined ? { max: corps.max as number } : {}) } } : {}),
    ...(eg ? { egout: eg } : {}),
    ...(fm ? { faitageM: fm } : {}),
  };
}

function dimensions(v: unknown, obs: ObservationFait, quoi: string): DimensionsFait {
  const d = v as { egoutM?: unknown; faitageM?: unknown; hautVersDeg?: unknown } | null;
  if (!d || !estNombre(d.egoutM) || (d.faitageM !== undefined && !estNombre(d.faitageM)) || (d.hautVersDeg !== undefined && !estNombre(d.hautVersDeg))) throw new FaitsToitsIllisibles(quoi + ' : un remplacement donne ses dimensions { egoutM, faitageM, hautVersDeg }');
  if (obs.forme?.length !== 1) throw new FaitsToitsIllisibles(quoi + ' : un remplacement dit une seule forme');
  if (obs.forme[0] !== 'plat' && !(estNombre(d.faitageM) && d.faitageM > d.egoutM)) throw new FaitsToitsIllisibles(quoi + ' : un toit en pente a son faitage au-dessus de son egout');
  return { egoutM: d.egoutM, ...(d.faitageM !== undefined ? { faitageM: d.faitageM as number } : {}), ...(d.hautVersDeg !== undefined ? { hautVersDeg: d.hautVersDeg as number } : {}) };
}

/** Un fait du fichier, verifie ; `cle` sert au message. */
function lireFait(cle: string, v: unknown): FaitToit {
  const f = v as Record<string, unknown> | null;
  const quoi = 'regles/toits/faits.json, ' + cle;
  if (!f || typeof f !== 'object') throw new FaitsToitsIllisibles(quoi + ' : un objet');
  const application = f.application ?? 'contrainte';
  if (application !== 'contrainte' && application !== 'remplacement') throw new FaitsToitsIllisibles(quoi + '.application : contrainte ou remplacement');
  const obs = observation(f.observation, quoi);
  const out: FaitToit = { observation: obs, application };
  if (application === 'remplacement') out.dimensions = dimensions(f.dimensions, obs, quoi);
  if (f.preuve && typeof f.preuve === 'object') out.preuve = f.preuve as NonNullable<FaitToit['preuve']>;
  if (typeof f.adresse === 'string') out.adresse = f.adresse;
  if (Array.isArray(f.historique)) out.historique = f.historique as NonNullable<FaitToit['historique']>;
  return out;
}

/**
 * Les faits d'un fichier, verifies : format, vocabulaire ferme, dimensions d'un remplacement. Leve
 * FaitsToitsIllisibles au premier fait abime : mieux vaut refuser le fichier que lire un toit avec un
 * fait a moitie compris. Exportee pour les tests et le mode d'essai.
 */
export function lireFaitsToits(donnees: unknown): FaitsToits {
  const f = donnees as { format?: unknown; faits?: unknown } | null;
  if (!f || typeof f !== 'object' || f.format !== 'plan-faits-toits' || !f.faits || typeof f.faits !== 'object' || Array.isArray(f.faits)) throw new FaitsToitsIllisibles('regles/toits/faits.json : format inconnu (attendu : « plan-faits-toits »)');
  const out: Record<string, FaitToit> = {};
  for (const [cle, v] of Object.entries(f.faits as Record<string, unknown>)) {
    if (!/^BATIMENT\d{16}$/.test(cle)) throw new FaitsToitsIllisibles('regles/toits/faits.json : ' + cle + ' n\'est pas une cle BD TOPO (BATIMENT suivi de seize chiffres)');
    out[cle] = lireFait(cle, v);
  }
  return out;
}

/** Les faits livres avec le code. */
export const FAITS_TOITS_LIVRES: FaitsToits = lireFaitsToits(fichier as unknown);

/**
 * L'empreinte de ce qui change un toit : l'observation, l'application et les dimensions de chaque
 * fait, par cle triee. La preuve, l'adresse et l'historique n'y entrent pas : les reecrire ne relit
 * aucun toit.
 */
export function empreinteFaitsToits(faits: FaitsToits): string {
  const lignes = Object.keys(faits).sort().map((k) => { const f = faits[k] as FaitToit; return k + '=' + JSON.stringify([f.application, f.observation, f.dimensions ?? null]); });
  return fnv1a('faits\n' + lignes.join('\n'));
}

/** L'empreinte d'un fichier sans fait : celle des lectures d'avant les faits. */
export const EMPREINTE_FAITS_VIDE = empreinteFaitsToits({});
/** L'empreinte des faits livres. */
export const EMPREINTE_FAITS_TOITS = empreinteFaitsToits(FAITS_TOITS_LIVRES);

/** Les faits d'un fichier essaye par l'administrateur (`?regles=local`), le temps de la seance ; null : ceux du depot. */
let essai: FaitsToits | null = null;

/**
 * Essaie des faits venus du poste, a la place de ceux du depot, sans les enregistrer nulle part :
 * pour voir un fait sur un vrai projet avant d'ouvrir une PR (spec §9.2). `null` revient aux faits
 * livres.
 */
export function essayerFaitsToits(faits: FaitsToits | null): void { essai = faits; }

/** Les faits en vigueur : ceux de l'essai, sinon ceux du depot. */
export const faitsEnVigueur = (): FaitsToits => essai ?? FAITS_TOITS_LIVRES;

/** Un essai de faits est-il en cours ? */
export const essaiDeFaits = (): boolean => essai !== null;

/**
 * La cle d'un batiment lue par l'essai : un fait de l'essai, ou un fait du depot que l'essai retire.
 * Son toit lu pendant l'essai n'est pas celui du depot : il sera relu a la prochaine ouverture.
 */
export function cleToucheeParEssai(cle: string | null): boolean {
  return !!essai && !!cle && (cle in essai || cle in FAITS_TOITS_LIVRES);
}

/** La cle BD TOPO d'un batiment (`bdtopo.cleabs`), ou null. */
export function cleDuBatiment(o: { bdtopo?: unknown }): string | null {
  const c = (o.bdtopo as { cleabs?: unknown } | null | undefined)?.cleabs;
  return typeof c === 'string' && c ? c : null;
}

/** Le fait en vigueur sur ce batiment, ou null. */
export function faitDuBatiment(o: { bdtopo?: unknown }, faits: FaitsToits = faitsEnVigueur()): FaitToit | null {
  const cle = cleDuBatiment(o);
  return (cle && Object.prototype.hasOwnProperty.call(faits, cle) ? faits[cle] : null) ?? null;
}

/**
 * Au-dela de ce nombre de faits qui disent la meme chose, une regle ou un reglage se cache derriere :
 * le skill regles-toits le signale (spec §10). Cinq : assez pour ne pas crier au premier doublon,
 * assez peu pour ne pas laisser un seuil mal place se corriger batiment par batiment.
 */
export const FAITS_SEMBLABLES_MAX = 5;

/** Ce qu'un fait dit, en mots courts : la forme, le sens du faitage, les bouts. Deux faits de meme signature disent la meme chose. */
export function signatureFait(f: FaitToit): string {
  const o = f.observation;
  const forme = o.forme ? [...o.forme].sort().join('|') : 'forme ?';
  const sens = o.faitage ? (o.faitage.par === 'long' ? 'faitage ' + o.faitage.sens + ' au long cote' : 'faitage a azimut') : '';
  const bouts = o.bouts ? 'bouts ' + [...o.bouts].sort().join('+') : '';
  return [forme, sens, bouts, f.application === 'remplacement' ? 'remplacement' : ''].filter(Boolean).join(', ');
}

/** Les faits comptes par signature, les plus nombreux d'abord ; `signal` au-dela de FAITS_SEMBLABLES_MAX. */
export function compterFaitsParForme(faits: FaitsToits): { signature: string; nombre: number; cles: string[]; signal: boolean }[] {
  const groupes = new Map<string, string[]>();
  for (const [cle, f] of Object.entries(faits)) { const s = signatureFait(f); groupes.set(s, [...(groupes.get(s) ?? []), cle]); }
  return [...groupes].map(([signature, cles]) => ({ signature, nombre: cles.length, cles: cles.sort(), signal: cles.length > FAITS_SEMBLABLES_MAX }))
    .sort((a, b) => b.nombre - a.nombre || a.signature.localeCompare(b.signature));
}
