// Claude en renfort du calage et de la detection (MD/spec-facades-calage-detection.md §12 bis, lot L18).
//
// Claude aide **quand l'algorithme n'est pas sur de lui**, jamais a sa place : il propose, Plan recale
// et mesure, l'utilisateur valide. Ce module dit :
// - **quand** l'appeler : les signaux de l'algorithme (coins non trouves, facade mal vue, detection
//   peu sure, ton sur ton, desaccord, details), et, pendant les premiers audits, a chaque facade pour
//   mesurer son apport (decision D11) ;
// - **ce qu'il voit** : une grille de reperes numerotee sur la photo (un modele de langage situe mieux
//   un point par rapport a des reperes visibles qu'en pixels bruts), la graduation de l'elevation ;
// - **ce qu'il rend** (deploy/schema-renfort.json, version 1) et le **vote** de ses trois passes.
// Le recalage des graines sur l'image est dans renfortRecalage.ts.
//
// Tout est pur et deterministe : l'appel est dans io/analyseClaude.ts, les images dans
// render/imagesRenfort.ts, l'orchestration dans app/.

import { au } from '../../util/tableaux.js';
import { voterAttribut, type IndiceAnalyse, type OuiNon, type Vote } from '../../model/analyseClaude.js';
import type { GrilleFacade, OuvertureFacade, TypeOuverture } from '../../model/types.js';
import type { P2 } from '../vision/homographie.js';
import { mediane } from '../../util/stats.js';

/** La version du schema de sortie que ce code sait lire (deploy/schema-renfort.json). */
export const VERSION_SCHEMA_RENFORT = 1;
/** Trois passes et un vote, comme pour les toits (spec-regles-toits §14.2, point 3). */
export const PASSES_RENFORT = 3;
/**
 * Decision D11 : pendant les premiers audits, chaque facade photographiee recoit le renfort, signal
 * ou non, pour que le banc et les corrections mesurent ce qu'il apporte par situation. Ensuite, seuls
 * les signaux l'appelleront.
 */
export const RENFORT_A_CHAQUE_FACADE = true;

/* ------------------------------------------------------------------------------------------------
 * Quand l'appeler
 * --------------------------------------------------------------------------------------------- */

/** Les situations du tableau de F§12 bis. */
export type SituationRenfort = 'coins' | 'malVue' | 'peuSure' | 'tonSurTon' | 'desaccord' | 'details';

export const LIBELLES_SITUATION: Record<SituationRenfort, string> = {
  coins: 'coins non trouvés sur la photo',
  malVue: 'façade en grande partie cachée',
  peuSure: 'détection peu sûre',
  tonSurTon: 'ouvertures ton sur ton',
  desaccord: 'nombre d’ouvertures en désaccord',
  details: 'volets ou baies fermées à confirmer',
};

/** Les seuils des signaux (F§12 bis, « Quand il est appelé »). */
export const SEUILS_RENFORT = {
  /** La note du calage fin sous laquelle les coins ne sont pas trouves (calageFin.ts, SEUIL_NOTE). */
  noteCalage: 0.5,
  /** Plus de 30 % de l'elevation cachee (masque d'occlusion, ou part du mur hors de la photo). */
  cacheMax: 0.3,
  /** Moins de 70 % des ouvertures au-dessus de 0,7 de confiance. */
  partSure: 0.7,
  confianceSure: 0.7,
  /**
   * Ton sur ton : la detection ne lit pas la teinte d'une baie qu'elle n'a pas trouvee. On retient ce
   * qui en reste visible : une facade de plus de 4 m sans aucune ouverture, ou la confiance mediane des
   * ouvertures trouvees sous 0,55 (les indices A et B faibles ensemble, F§9).
   */
  murVideM: 4,
  confianceMediane: 0.55,
};

/** Ce que l'algorithme sait au moment de decider. Tout est facultatif : l'etape des coins n'a pas encore d'ouvertures. */
export interface EtatAlgorithme {
  /** Le calage fin de la photo (note, et la source de chaque coin). */
  calage?: { note: number; trouve: boolean; sources: readonly string[] } | null;
  /** La part de l'elevation cachee : masque d'occlusion de la fusion (F§8), ou part du mur hors de la photo. */
  cache?: number | null;
  /** Les ouvertures proposees cochees (confiance, source, details). */
  ouvertures?: readonly Pick<OuvertureFacade, 'confiance' | 'source' | 'details'>[] | null;
  /** Les baies devinees laissees en pointille : une travee incomplete hors zone cachee (F§10). */
  devinees?: number;
  largeurM?: number;
  /** Le nombre de baies attendu par l'utilisateur (« Ce que je vois ») ou par la grille ; null s'il n'est pas connu. */
  attendues?: number | null;
}


/**
 * Les signaux leves par l'algorithme (F§12 bis). Vide : l'algorithme suffit, Claude n'est pas appele
 * (cout et delai nuls), sauf a chaque facade pendant les premiers audits (`RENFORT_A_CHAQUE_FACADE`).
 */
export function signauxRenfort(e: EtatAlgorithme): SituationRenfort[] {
  const s = SEUILS_RENFORT;
  const out: SituationRenfort[] = [];
  const c = e.calage;
  if (c && (!c.trouve || c.note < s.noteCalage || c.sources.filter((x) => x === 'predit').length > 1)) out.push('coins');
  if ((e.cache ?? 0) > s.cacheMax) out.push('malVue');
  const os = e.ouvertures;
  if (os) {
    const mesurees = os.filter((o) => o.confiance !== undefined && o.source !== 'corrigee' && o.source !== 'ajoutee');
    const sures = mesurees.filter((o) => (o.confiance ?? 0) >= s.confianceSure).length;
    if ((mesurees.length && sures < s.partSure * mesurees.length) || (e.devinees ?? 0) > 0) out.push('peuSure');
    const vide = !os.length && (e.largeurM ?? 0) > s.murVideM;
    if (vide || (mesurees.length && mediane(mesurees.map((o) => o.confiance ?? 0)) < s.confianceMediane)) out.push('tonSurTon');
    if (e.attendues !== null && e.attendues !== undefined && e.attendues !== os.length) out.push('desaccord');
    if (os.some((o) => o.details?.ferme)) out.push('details');
  }
  return out;
}

/** Les signaux en clair, pour l'ecran : « coins non trouvés sur la photo, détection peu sûre ». */
export function texteSignaux(s: readonly SituationRenfort[]): string {
  return s.map((x) => LIBELLES_SITUATION[x]).join(', ');
}

/* ------------------------------------------------------------------------------------------------
 * La grille de reperes de la photo, la graduation de l'elevation
 * --------------------------------------------------------------------------------------------- */

/** Dix intervalles dans chaque sens : un repere vaut un dixieme de la photo. */
export const DIVISIONS_GRILLE = 10;
/** Une graine peut tomber hors de la photo (un coin hors cadre) jusqu'a deux reperes au-dela du bord. */
export const DEBORD_GRILLE = 2;

/** Un point de la photo (pixels) en reperes de la grille : colonne 0 a 10 de gauche a droite, ligne 0 a 10 de haut en bas. */
export function versGrille(p: P2, largeurPx: number, hauteurPx: number): { colonne: number; ligne: number } {
  return { colonne: (p.x / largeurPx) * DIVISIONS_GRILLE, ligne: (p.y / hauteurPx) * DIVISIONS_GRILLE };
}

/** Un repere de la grille en pixels de la photo. */
export function depuisGrille(r: { colonne: number; ligne: number }, largeurPx: number, hauteurPx: number): P2 {
  return { x: (r.colonne / DIVISIONS_GRILLE) * largeurPx, y: (r.ligne / DIVISIONS_GRILLE) * hauteurPx };
}

/** Les graduations de l'elevation, en metres : tous les metres, et tous les 50 cm sur un mur de moins de 6 m. */
export function graduations(longueurM: number): number[] {
  const pas = longueurM < 6 ? 0.5 : 1;
  const out: number[] = [];
  for (let v = 0; v <= longueurM + 1e-9; v += pas) out.push(Math.round(v * 100) / 100);
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Ce qu'il rend (deploy/schema-renfort.json, version 1)
 * --------------------------------------------------------------------------------------------- */

export type Repere = { colonne: number; ligne: number } | 'indetermine';
export type DecisionOuverture = 'garder' | 'retirer' | 'indetermine';
export type RaisonRetrait = 'ombre' | 'volet' | 'tache' | 'reflet' | 'vegetation' | 'vehicule' | 'autre' | 'sans-objet';
export type VoletsVus = 'battants' | 'roulant' | 'persiennes' | 'aucun' | 'indetermine';
export type FormeVue = 'rectangulaire' | 'cintree' | 'oeil-de-boeuf' | 'indetermine';
export type TypeVu = TypeOuverture | 'indetermine';

export interface AvisOuverture {
  indices: IndiceAnalyse[];
  /** Le numero dessine sur l'elevation, a partir de 1. */
  numero: number;
  decision: DecisionOuverture;
  raison: RaisonRetrait;
  type: TypeVu;
  volets: VoletsVus;
  coffre: OuiNon;
  balcon: OuiNon;
  forme: FormeVue;
}

export interface BoiteManquee {
  indices: IndiceAnalyse[];
  type: TypeOuverture;
  /** En metres sur l'elevation : x depuis la gauche, y l'appui depuis le sol, l x h le tableau. */
  x: number;
  y: number;
  l: number;
  h: number;
}

/** La reponse d'une passe, telle que le schema la garantit. */
export interface ReponseRenfort {
  mur: { indices: IndiceAnalyse[]; vu: 'attendu' | 'autre' | 'indetermine' };
  coins: { indices: IndiceAnalyse[]; hautGauche: Repere; hautDroit: Repere; basDroit: Repere; basGauche: Repere };
  ouvertures: AvisOuverture[];
  manquees: BoiteManquee[];
  confiance: 'faible' | 'moyenne' | 'forte';
}

const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Une sortie de Claude a-t-elle la forme du schema du renfort ? Les tetes de chapitre suffisent a l'aiguiller. */
export function estReponseRenfort(v: unknown): v is ReponseRenfort {
  if (!estObjet(v) || !estObjet(v.mur) || !estObjet(v.coins)) return false;
  if (!Array.isArray(v.ouvertures) || !Array.isArray(v.manquees) || typeof v.confiance !== 'string') return false;
  return v.manquees.every((b) => estObjet(b) && fini(b.x) && fini(b.y) && fini(b.l) && fini(b.h))
    && v.ouvertures.every((o) => estObjet(o) && fini(o.numero));
}

/** Les quatre coins, dans l'ordre du releve : haut gauche, haut droit, bas droit, bas gauche. */
export const COINS_RENFORT = ['hautGauche', 'hautDroit', 'basDroit', 'basGauche'] as const;

/* ------------------------------------------------------------------------------------------------
 * Le vote
 * --------------------------------------------------------------------------------------------- */

/** Deux passes situent le meme coin a un repere pres (un dixieme de la photo) : au-dela, elles ne sont pas d'accord. */
export const ACCORD_COIN_REPERES = 1;
/** Deux boites de deux passes sont la meme baie a partir de ce recouvrement (intersection sur union). */
export const MEME_BOITE = 0.3;

export interface CoinVote { repere: { colonne: number; ligne: number } | null; accord: number; indices: IndiceAnalyse[] }

export interface AvisVote {
  numero: number;
  decision: Vote<DecisionOuverture>;
  raison: Vote<RaisonRetrait>;
  type: Vote<TypeVu>;
  volets: Vote<VoletsVus>;
  coffre: Vote<OuiNon>;
  balcon: Vote<OuiNon>;
  forme: Vote<FormeVue>;
}

export interface BoiteVotee { type: TypeOuverture; x: number; y: number; l: number; h: number; accord: number; indices: IndiceAnalyse[] }

export interface VoteRenfort {
  passes: number;
  mur: Vote<ReponseRenfort['mur']['vu']>;
  /** Haut gauche, haut droit, bas droit, bas gauche. */
  coins: CoinVote[];
  ouvertures: AvisVote[];
  manquees: BoiteVotee[];
  confiance: Vote<ReponseRenfort['confiance']>;
}

function recouvrement(a: { x: number; y: number; l: number; h: number }, b: { x: number; y: number; l: number; h: number }): number {
  const ix = Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x),
    iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ix <= 0 || iy <= 0) return 0;
  const inter = ix * iy;
  return inter / (a.l * a.h + b.l * b.h - inter);
}

/**
 * Le vote d'un coin : les passes qui le situent, si elles sont plus de la moitie et s'accordent a un
 * repere pres autour de leur mediane. Sinon le coin reste a l'algorithme (`repere: null`).
 */
function voterCoin(reponses: readonly ReponseRenfort[], k: (typeof COINS_RENFORT)[number]): CoinVote {
  const n = reponses.length;
  const vus = reponses.flatMap((r) => { const v = r.coins[k]; return v !== 'indetermine' && estObjet(v) && fini(v.colonne) && fini(v.ligne) ? [{ v, indices: r.coins.indices }] : []; });
  if (!n || vus.length * 2 <= n) return { repere: null, accord: n ? vus.length / n : 0, indices: [] };
  const m = { colonne: mediane(vus.map((x) => x.v.colonne)), ligne: mediane(vus.map((x) => x.v.ligne)) };
  const proches = vus.filter((x) => Math.hypot(x.v.colonne - m.colonne, x.v.ligne - m.ligne) <= ACCORD_COIN_REPERES);
  if (proches.length * 2 <= n) return { repere: null, accord: proches.length / n, indices: [] };
  const born = (v: number) => Math.max(-DEBORD_GRILLE, Math.min(DIVISIONS_GRILLE + DEBORD_GRILLE, v));
  return { repere: { colonne: born(mediane(proches.map((x) => x.v.colonne))), ligne: born(mediane(proches.map((x) => x.v.ligne))) }, accord: proches.length / n, indices: proches.flatMap((x) => x.indices) };
}

/** Le vote des avis sur les ouvertures detectees, numero par numero ; une passe muette sur un numero compte `indetermine`. */
function voterAvis(reponses: readonly ReponseRenfort[]): AvisVote[] {
  const numeros = [...new Set(reponses.flatMap((r) => r.ouvertures.map((o) => o.numero)))].sort((a, b) => a - b);
  return numeros.map((numero) => {
    const avis = reponses.map((r) => r.ouvertures.find((o) => o.numero === numero) ?? null);
    const ind = avis.map((a) => a?.indices ?? []);
    const v = <T>(f: (a: AvisOuverture) => T, i: T) => voterAttribut(avis.map((a) => (a ? f(a) : i)), ind, i);
    return {
      numero,
      decision: v<DecisionOuverture>((a) => a.decision, 'indetermine'),
      raison: v<RaisonRetrait>((a) => a.raison, 'sans-objet'),
      type: v<TypeVu>((a) => a.type, 'indetermine'),
      volets: v<VoletsVus>((a) => a.volets, 'indetermine'),
      coffre: v<OuiNon>((a) => a.coffre, 'indetermine'),
      balcon: v<OuiNon>((a) => a.balcon, 'indetermine'),
      forme: v<FormeVue>((a) => a.forme, 'indetermine'),
    };
  });
}

/**
 * Le vote des ouvertures manquees : les boites des passes regroupees par recouvrement (une par passe
 * au plus dans chaque groupe) ; un groupe vu par plus de la moitie des passes devient une boite, a la
 * mediane de chaque cote, au type majoritaire.
 */
function voterManquees(reponses: readonly ReponseRenfort[]): BoiteVotee[] {
  const n = reponses.length;
  const groupes: { passes: Set<number>; boites: BoiteManquee[] }[] = [];
  reponses.forEach((r, p) => {
    for (const b of r.manquees) {
      if (!(b.l > 0) || !(b.h > 0)) continue;
      const g = groupes.find((x) => !x.passes.has(p) && recouvrement(au(x.boites, 0), b) >= MEME_BOITE);
      if (g) { g.passes.add(p); g.boites.push(b); } else groupes.push({ passes: new Set([p]), boites: [b] });
    }
  });
  return groupes.filter((g) => g.passes.size * 2 > n).map((g) => {
    const bs = g.boites;
    const x0 = mediane(bs.map((b) => b.x)), x1 = mediane(bs.map((b) => b.x + b.l));
    const y0 = mediane(bs.map((b) => b.y)), y1 = mediane(bs.map((b) => b.y + b.h));
    const type = voterAttribut(bs.map((b) => b.type), bs.map((b) => b.indices), au(bs, 0).type).valeur;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return { type, x: r2(x0), y: r2(y0), l: r2(x1 - x0), h: r2(y1 - y0), accord: g.passes.size / n, indices: bs.flatMap((b) => b.indices) };
  }).filter((b) => b.l > 0 && b.h > 0);
}

/** Trois passes (ou moins, si l'une a echoue) deviennent un seul avis. */
export function voterRenfort(reponses: readonly ReponseRenfort[]): VoteRenfort {
  return {
    passes: reponses.length,
    mur: voterAttribut(reponses.map((r) => r.mur.vu), reponses.map((r) => r.mur.indices), 'indetermine'),
    coins: COINS_RENFORT.map((k) => voterCoin(reponses, k)),
    ouvertures: voterAvis(reponses),
    manquees: voterManquees(reponses),
    confiance: voterAttribut(reponses.map((r) => r.confiance), reponses.map(() => []), 'faible'),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Le texte qui accompagne les images
 * --------------------------------------------------------------------------------------------- */

const fr = (v: number, n = 2) => v.toFixed(n).replace('.', ',');

/** Ce qui est connu du mur, et la liste numerotee des ouvertures que Plan a detectees (F§12 bis, « Ce qu'il reçoit »). */
export function texteRenfort(e: {
  largeurM: number;
  hauteurM: number;
  hauteurMesuree: boolean;
  ouvertures: readonly Pick<OuvertureFacade, 'type' | 'x' | 'y' | 'l' | 'h' | 'confiance'>[];
  grille: GrilleFacade | null;
  signaux: readonly SituationRenfort[];
  coinsTrouves: boolean;
  etiquette?: string;
}): string {
  const l: string[] = [];
  if (e.etiquette) l.push('Façade : ' + e.etiquette + '.');
  l.push('Largeur du mur : ' + fr(e.largeurM) + ' m (plan) ; hauteur à l’égout : ' + fr(e.hauteurM) + ' m (' + (e.hauteurMesuree ? 'mesurée sur la photo' : 'modèle') + ').');
  if (e.grille) l.push('Niveaux d’ouvertures selon Plan : ' + e.grille.niveaux.length + ' ; travées : ' + e.grille.travees.length + '.');
  l.push('Coins du mur : ' + (e.coinsTrouves ? 'trouvés par Plan sur la photo (quadrilatère jaune plein).' : 'prédits par la prise de vue, non trouvés sur la photo (quadrilatère jaune en tirets).'));
  if (e.signaux.length) l.push('Ce dont Plan n’est pas sûr : ' + texteSignaux(e.signaux) + '.');
  if (!e.ouvertures.length) l.push('Ouvertures détectées par Plan : aucune.');
  else {
    l.push('Ouvertures détectées par Plan (numéros de l’image 2, mètres, y = appui depuis le sol) :');
    e.ouvertures.forEach((o, i) => l.push((i + 1) + '. ' + o.type + ' x ' + fr(o.x) + ' y ' + fr(o.y) + ' l ' + fr(o.l) + ' h ' + fr(o.h) + (o.confiance !== undefined ? ' (confiance ' + Math.round(o.confiance * 100) + ' %)' : '')));
  }
  return l.join('\n');
}
