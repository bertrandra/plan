// Les regles du run d'une facade (MD/spec-facade-calage-audit.md §5, §8, lot F2) : ce que le moteur DECIDE des observations de Claude
// (src/regles/facades/observations.ts). Une regle par sujet, ses seuils dans regles/facades/ia.json (des reglages, pas des constantes) :
// - « trois passes deviennent une observation » : le vote, le mode de production (`facades.ia.passes`, decision du 29 octobre 2026) ;
// - « l'escalade, une lecture de plus demandee par la personne, l'emporte la ou elle contredit le vote sur le calage, la forme et le
//   parement ; ses boites s'ajoutent, et ne sont cochees que si la detection les retrouve, comme les autres » ;
// - « les deux angles de l'IA sont une pose candidate pour l'arbitre » (calageAncres.ts la juge comme les autres) ;
// - « une zone de colombage ecarte les poses du mur qui tiennent dedans » : leurs bouts suivent les bois, pas les angles (AE 101) ;
// - « une pointe vue ailleurs ou plus haut que le plan est un diagnostic ou une alerte, jamais une correction » (decision 12) ;
// - « une boite de l'IA n'est cochee que si la detection (ou la grille, par une baie devinee) la retrouve » (§8).
// La chaine (l'arbitre de l'E4, l'E7 de l'enchainement, l'aide du releve) lit ces DECISIONS, jamais le JSON de Claude. Pur.

import fichierIa from '../../../../regles/facades/ia.json';
import { voterAttribut } from '../../../model/analyseClaude.js';
import type { OuvertureFacade } from '../../../model/types.js';
import { mediane } from '../../../util/stats.js';
import { empreinteReglagesIa, lireReglagesIa, type ReglagesIa } from '../../../regles/facades/ia.js';
import { CONFIANCE_PLEINE } from '../../detection/verification.js';
import { recalerBoite, type CartesAretes } from '../../detection/recalageIa.js';
import { garder, lireObservationsFacade, type AngleIa, type Etendue, type ObservationsFacade, type OuvertureIa, type RunEnregistre, type ZoneSurface } from '../../../regles/facades/observations.js';
import type { P2 } from '../../vision/homographie.js';

// Les seuils des regles : regles/facades/ia.json (MD/architecture.md §5.2.4), lus et verifies par src/regles/facades/ia.ts, edites
// dans Admin › Regles.
const LIVRES: ReglagesIa = lireReglagesIa(fichierIa);

/** Les seuils en usage ; une surcharge (un essai, un test) passe devant la valeur livree. */
export const reglagesIa = (surcharges: Partial<ReglagesIa> = {}): ReglagesIa => ({ ...LIVRES, ...surcharges });

/** L'empreinte des seuils livres, inscrite dans chaque rejeu en mode « IA » (comme celle des objectifs). */
export const EMPREINTE_IA: string = empreinteReglagesIa(LIVRES);

/* ------------------------------------------------------------------------------------------------
 * Le vote de trois passes (« Rappeler Claude x3 », l'option du rejeu ; §8, §11.2)
 * --------------------------------------------------------------------------------------------- */

function recouvrementUV(a: { u0: number; u1: number; v0: number; v1: number }, b: { u0: number; u1: number; v0: number; v1: number }): number {
  const iu = Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0), iv = Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0);
  if (iu <= 0 || iv <= 0) return 0;
  const inter = iu * iv;
  return inter / ((a.u1 - a.u0) * (a.v1 - a.v0) + (b.u1 - b.u0) * (b.v1 - b.v0) - inter);
}

/** Les elements des passes groupes (un par passe au plus dans un groupe) ; seuls restent les groupes vus par plus de la moitie d'elles. */
function grouper<T>(passes: readonly (readonly T[])[], meme: (a: T, b: T) => boolean): T[][] {
  const groupes: { passes: Set<number>; membres: T[] }[] = [];
  passes.forEach((l, p) => {
    for (const x of l) {
      const g = groupes.find((y) => !y.passes.has(p) && meme(y.membres[0] as T, x));
      if (g) { g.passes.add(p); g.membres.push(x); } else groupes.push({ passes: new Set([p]), membres: [x] });
    }
  });
  return groupes.filter((g) => g.passes.size * 2 > passes.length).map((g) => g.membres);
}

const majorite = <T>(l: readonly T[], indetermine: T): T => voterAttribut(l, l.map(() => []), indetermine).valeur;
const med = (l: readonly number[]) => Math.round(mediane(l) * 1000) / 1000;
/** Une valeur dite par la majorite des membres (comparee en JSON) ; sinon celle du premier. */
const commune = <T>(l: readonly T[]): T => { const k = majorite(l.map((x) => JSON.stringify(x)), ''); return k ? JSON.parse(k) as T : l[0] as T; };

function voterAngle(l: readonly (AngleIa | null)[]): AngleIa | null {
  const vus = l.filter((a): a is AngleIa => a !== null);
  if (vus.length * 2 <= l.length) return null;
  return { x: med(vus.map((a) => a.x)), egout: med(vus.map((a) => a.egout)), sol: med(vus.map((a) => a.sol)), confiance: majorite(vus.map((a) => a.confiance), 'indetermine') };
}

const voterEtendues = <T extends Etendue>(l: readonly (readonly T[])[], seuil: number): T[] =>
  grouper(l, (a, b) => recouvrementUV({ u0: a.debut, u1: a.fin, v0: 0, v1: 1 }, { u0: b.debut, u1: b.fin, v0: 0, v1: 1 }) >= seuil)
    .map((g) => ({ ...commune(g), debut: med(g.map((x) => x.debut)), fin: med(g.map((x) => x.fin)) }));

/**
 * Trois passes (ou moins, si l'une a echoue) deviennent une reponse : chaque angle a la mediane des passes qui le voient (plus de la
 * moitie), chaque pointe, element, etendue ou baie vu par plus de la moitie des passes, a la mediane de ses cotes, le mot de la
 * majorite. Une passe seule est rendue telle quelle.
 */
export function voterObservations(rs: readonly ObservationsFacade[], r: ReglagesIa = reglagesIa()): ObservationsFacade | null {
  if (rs.length <= 1) return rs[0] ?? null;
  const ind = 'indetermine' as const, memeU = r['facades.ia.voteMemeU'], memeE = r['facades.ia.voteMemeEtendue'];
  return {
    calage: {
      angles: { gauche: voterAngle(rs.map((r) => r.calage.angles.gauche)), droite: voterAngle(rs.map((r) => r.calage.angles.droite)) },
      pointes: grouper(rs.map((r) => r.calage.pointes), (a, b) => Math.abs(a.u - b.u) <= memeU).map((g) => ({ u: med(g.map((p) => p.u)), v: med(g.map((p) => p.v)), confiance: majorite(g.map((p) => p.confiance), ind) })),
      appentis: voterEtendues(rs.map((x) => x.calage.appentis), memeE),
      corps: voterEtendues(rs.map((x) => x.calage.corps), memeE),
      cache: voterEtendues(rs.map((x) => x.calage.cache), memeE),
    },
    forme: { silhouette: majorite(rs.map((r) => r.forme.silhouette), ind), bout: majorite(rs.map((r) => r.forme.bout), ind) },
    surface: {
      principale: majorite(rs.map((r) => r.surface.principale), ind),
      zones: grouper(rs.map((r) => r.surface.zones), (a, b) => a.type === b.type && recouvrementUV(a, b) >= memeE)
        .map((g) => ({ type: (g[0] as ZoneSurface).type, u0: med(g.map((z) => z.u0)), u1: med(g.map((z) => z.u1)), v0: med(g.map((z) => z.v0)), v1: med(g.map((z) => z.v1)), confiance: majorite(g.map((z) => z.confiance), ind) })),
      confiance: majorite(rs.map((r) => r.surface.confiance), ind),
    },
    elements: grouper(rs.map((r) => r.elements), (a, b) => a.element === b.element && Math.abs(a.u - b.u) <= memeU).map((g) => ({ element: (g[0] as ObservationsFacade['elements'][number]).element, u: med(g.map((e) => e.u)), confiance: majorite(g.map((e) => e.confiance), ind) })),
    ouvertures: grouper(rs.map((r) => r.ouvertures), (a, b) => recouvrementUV(a, b) >= r['facades.ia.voteMemeBaie']).map((g) => ({
      ...commune(g), type: majorite(g.map((o) => o.type), (g[0] as OuvertureIa).type),
      u0: med(g.map((o) => o.u0)), u1: med(g.map((o) => o.u1)), v0: med(g.map((o) => o.v0)), v1: med(g.map((o) => o.v1)),
      confiance: majorite(g.map((o) => o.confiance), ind), carreaux: commune(g.map((o) => o.carreaux)),
    })).sort((a, b) => a.u0 - b.u0 || a.v0 - b.v0),
    confiance: majorite(rs.map((r) => r.confiance), 'faible'),
  };
}


/** Le nombre de passes d'un appel en production (l'audit, le releve, « Rappeler Claude ») : le reglage `facades.ia.passes`. */
export const passesDeProduction = (r: ReglagesIa = reglagesIa()): 1 | 2 | 3 => r['facades.ia.passes'] as 1 | 2 | 3;

/**
 * Les observations d'un appel enregistre : sa passe telle quelle, ou le vote de ses passes, puis l'escalade s'il y en a une ; null sans
 * rien de lisible.
 */
export function observationsDuRun(run: RunEnregistre, r: ReglagesIa = reglagesIa()): ObservationsFacade | null {
  const vote = voterObservations(garder(run.sorties.map(lireObservationsFacade)), r);
  const esc = run.escalade ? lireObservationsFacade(run.escalade.sortie) : null;
  return esc && run.escalade ? escaladerObservations(vote, esc, run.escalade.modele, r) : vote;
}

/* ------------------------------------------------------------------------------------------------
 * L'escalade : une lecture de plus, demandee par la personne, contre le vote des passes
 * --------------------------------------------------------------------------------------------- */

/** Deux listes s'accordent : autant d'elements, chacun avec un pareil dans l'autre (un par un). */
function accordees<T>(a: readonly T[], b: readonly T[], pareil: (x: T, y: T) => boolean): boolean {
  if (a.length !== b.length) return false;
  const libres = [...b];
  return a.every((x) => { const k = libres.findIndex((y) => pareil(x, y)); if (k < 0) return false; libres.splice(k, 1); return true; });
}

/**
 * Regle de l'escalade (decision du proprietaire, 29 octobre 2026 : « trois lectures, et une escalade a la demande ») : la lecture d'un
 * modele plus fin, demandee par la personne, contre le vote des passes.
 * - Le calage (chaque angle, les pointes, les appentis, les corps, ce qui cache), la forme, les elements du toit et le parement : la ou
 *   elle s'ecarte du vote de plus de `facades.ia.escaladeEcartPart` (ou dit un autre mot), elle l'emporte ; sinon le vote reste. Un
 *   mot `indetermine` de l'escalade ne contredit rien.
 * - Les ouvertures : celles du vote restent ; les siennes qu'aucune du vote ne recouvre (`voteMemeBaie`) s'ajoutent, marquees `escalade`.
 *   Aucune n'est cochee par la : l'accord avec la detection (`accorderOuvertures`) en decide, comme pour les autres.
 * Sans vote lisible, l'escalade est toute la lecture. Ce qu'elle a tranche est dit en mots (`escalade.tranche`).
 */
export function escaladerObservations(vote: ObservationsFacade | null, esc: ObservationsFacade, modele: string, r: ReglagesIa = reglagesIa()): ObservationsFacade {
  if (!vote) return { ...esc, ouvertures: esc.ouvertures.map((o) => ({ ...o, source: 'escalade' as const })), escalade: { modele, tranche: ['toute la lecture (aucune passe lisible)'] } };
  const e = r['facades.ia.escaladeEcartPart'];
  const tranche: string[] = [];
  const pres = (a: number, b: number, echelle = 1) => Math.abs(a - b) <= e * Math.max(1, Math.abs(echelle));
  const choisir = <T>(nom: string, v: T, x: T, accord: boolean): T => { if (accord) return v; tranche.push(nom); return x; };
  const angle = (nom: string, v: AngleIa | null, x: AngleIa | null): AngleIa | null =>
    !x ? v : choisir(nom, v, x, !!v && pres(v.x, x.x) && pres(v.egout, x.egout) && pres(v.sol, x.sol));
  const mot = <T extends string>(nom: string, v: T, x: T): T => (x === 'indetermine' ? v : choisir(nom, v, x, v === x));
  const etendues = <T extends Etendue>(nom: string, v: T[], x: T[]): T[] => choisir(nom, v, x, accordees(v, x, (a, b) => pres(a.debut, b.debut) && pres(a.fin, b.fin)));
  const memeBaie = r['facades.ia.voteMemeBaie'];
  const enPlus = esc.ouvertures.filter((o) => !vote.ouvertures.some((v) => recouvrementUV(v, o) >= memeBaie)).map((o) => ({ ...o, source: 'escalade' as const }));
  const out: ObservationsFacade = {
    calage: {
      angles: { gauche: angle('l’angle gauche', vote.calage.angles.gauche, esc.calage.angles.gauche), droite: angle('l’angle droit', vote.calage.angles.droite, esc.calage.angles.droite) },
      pointes: choisir('les pointes', vote.calage.pointes, esc.calage.pointes, accordees(vote.calage.pointes, esc.calage.pointes, (a, b) => pres(a.u, b.u) && pres(a.v, b.v, a.v))),
      appentis: etendues('les appentis', vote.calage.appentis, esc.calage.appentis),
      corps: etendues('les corps', vote.calage.corps, esc.calage.corps),
      cache: etendues('ce qui cache le mur', vote.calage.cache, esc.calage.cache),
    },
    forme: { silhouette: mot('la silhouette', vote.forme.silhouette, esc.forme.silhouette), bout: mot('le bout', vote.forme.bout, esc.forme.bout) },
    elements: choisir('les éléments du toit', vote.elements, esc.elements, accordees(vote.elements, esc.elements, (a, b) => a.element === b.element && pres(a.u, b.u))),
    surface: {
      principale: mot('le parement', vote.surface.principale, esc.surface.principale),
      zones: choisir('les zones du parement', vote.surface.zones, esc.surface.zones, accordees(vote.surface.zones, esc.surface.zones, (a, b) => a.type === b.type && pres(a.u0, b.u0) && pres(a.u1, b.u1) && pres(a.v0, b.v0, a.v0) && pres(a.v1, b.v1, a.v1))),
      confiance: vote.surface.confiance,
    },
    ouvertures: [...vote.ouvertures, ...enPlus].sort((a, b) => a.u0 - b.u0 || a.v0 - b.v0),
    confiance: vote.confiance,
  };
  if (enPlus.length) tranche.push(enPlus.length + (enPlus.length > 1 ? ' ouvertures de plus' : ' ouverture de plus'));
  return { ...out, escalade: { modele, tranche } };
}

/* ------------------------------------------------------------------------------------------------
 * Ce que Plan en fait : une pose candidate (E4), des boites a accorder avec la detection (E7)
 * --------------------------------------------------------------------------------------------- */

export interface RectIa { x0: number; x1: number; y0: number; y1: number }

/** La pose du mur selon Claude sur une image de cette taille, en pixels : null sans ses deux angles. */
export function poseDeLIa(r: ObservationsFacade, image: { largeur: number; hauteur: number }): RectIa | null {
  const { gauche: g, droite: d } = r.calage.angles;
  if (!g || !d || !(d.x > g.x)) return null;
  return { x0: g.x * image.largeur, x1: d.x * image.largeur, y0: ((g.egout + d.egout) / 2) * image.hauteur, y1: ((g.sol + d.sol) / 2) * image.hauteur };
}

/** La decision du colombage, que l'arbitre du calage applique : les zones (pixels), et la pose qu'elles ecartent. */
export interface DecisionColombage {
  zones: RectIa[];
  /** Vrai : la pose tient dans une zone (ses deux bouts dedans, et elle la recoupe en hauteur) ; elle suit les bois, pas les angles. */
  ecarte(p: RectIa): boolean;
}

/**
 * Regle du colombage : les zones de colombage que Claude voit, en pixels, portees par sa pose, celles qui ne couvrent qu'une partie
 * du mur (`facades.ia.colombagePartMax`). Leurs bois dessinent des rectangles nets que les aretes prennent pour le mur (AE 101 sud :
 * le pan de bois du pignon de droite, x de 451 a 752) : une pose dont les deux bouts tombent dedans (a `colombageTolerancePart` de
 * l'image pres) est ecartee. Un mur tout en colombage n'en a pas : ses angles sont ceux du mur. Null : rien a decider.
 */
export function decisionColombage(obs: ObservationsFacade, pose: RectIa, image: { largeur: number }, r: ReglagesIa = reglagesIa()): DecisionColombage | null {
  const w = pose.x1 - pose.x0, h = pose.y1 - pose.y0;
  const zones = obs.surface.zones.filter((z) => z.type === 'colombage' && z.u1 - z.u0 < r['facades.ia.colombagePartMax'])
    .map((z) => ({ x0: pose.x0 + z.u0 * w, x1: pose.x0 + z.u1 * w, y0: pose.y1 - z.v1 * h, y1: pose.y1 - z.v0 * h }));
  if (!zones.length) return null;
  const tol = r['facades.ia.colombageTolerancePart'] * image.largeur;
  return { zones, ecarte: (p) => zones.some((z) => p.x0 >= z.x0 - tol && p.x1 <= z.x1 + tol && Math.min(p.y1, z.y1) > Math.max(p.y0, z.y0)) };
}

/** Ce que la regle des pointes dit d'une pointe : vue la ou le plan l'attend (a sa hauteur, ou une autre : alerte), en plus, ou manquante. */
export interface AvisPointe { u: number; vue: number | null; attendue: number | null; avis: 'accord' | 'hauteur' | 'en-plus' | 'manquante' }

/**
 * Regle des pointes : celles de Claude contre celles que le gabarit attend. Une pointe en plus ou en moins est un diagnostic de toit
 * (lot F4 : diagnosticForme.ts, puis corpsSousContrainte une fois cochee) ; une hauteur differente une alerte, jamais une correction : la hauteur du LiDAR est gardee
 * (decision 12). Rien n'est ecrit au toit ici.
 */
export function avisDesPointes(obs: ObservationsFacade, attendues: readonly { u: number; v: number }[], r: ReglagesIa = reglagesIa()): AvisPointe[] {
  const pres = r['facades.ia.pointeEcartU'], hauteur = r['facades.ia.pointeEcartHauteur'];
  const vues = obs.calage.pointes;
  const out: AvisPointe[] = vues.map((p) => {
    const a = attendues.find((x) => Math.abs(x.u - p.u) <= pres);
    return !a ? { u: p.u, vue: p.v, attendue: null, avis: 'en-plus' } : { u: a.u, vue: p.v, attendue: a.v, avis: Math.abs(p.v - a.v) > hauteur * a.v ? 'hauteur' : 'accord' };
  });
  for (const a of attendues) if (!vues.some((p) => Math.abs(p.u - a.u) <= pres)) out.push({ u: a.u, vue: null, attendue: a.v, avis: 'manquante' });
  return out;
}

/** Les quatre coins (haut gauche, haut droit, bas droit, bas gauche) en pixels de l'image, chacun null si son angle manque. */
export function coinsDeLIa(r: ObservationsFacade, image: { largeur: number; hauteur: number }): (P2 | null)[] {
  const { gauche: g, droite: d } = r.calage.angles, L = image.largeur, H = image.hauteur;
  return [g && { x: g.x * L, y: g.egout * H }, d && { x: d.x * L, y: d.egout * H }, d && { x: d.x * L, y: d.sol * H }, g && { x: g.x * L, y: g.sol * H }];
}

/** L'ecart de deux poses : le pire de leurs quatre bords, en part de la largeur de la seconde. */
export function ecartDesPoses(a: RectIa, b: RectIa): number {
  const w = Math.max(1e-9, b.x1 - b.x0);
  return Math.max(Math.abs(a.x0 - b.x0), Math.abs(a.x1 - b.x1), Math.abs(a.y0 - b.y0), Math.abs(a.y1 - b.y1)) / w;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
/**
 * Une boite de Claude en metres sur le mur (x depuis la gauche, y l'appui depuis le sol), source `claude`, a la confiance d'une boite
 * seule (sa confiance a lui reste dans l'observation) : les dimensions sont celles du plan, Claude n'en donne que les parts.
 */
export function ouvertureDeLIa(o: OuvertureIa, largeurM: number, hauteurM: number, r: ReglagesIa = reglagesIa()): OuvertureFacade {
  const x = Math.max(0, o.u0 * largeurM), y = Math.max(0, o.v0 * hauteurM);
  const out: OuvertureFacade = { type: o.type, x: r2(x), y: r2(y), l: r2(Math.min(largeurM, o.u1 * largeurM) - x), h: r2(o.v1 * hauteurM - y), source: 'claude', confiance: r['facades.ia.confianceSeule'] };
  if (o.niveau !== null) out.niveau = o.niveau;
  if (o.travee !== null) out.travee = o.travee;
  if (Object.keys(o.details).length) out.details = { ...o.details };
  return out;
}

function recouvrementM(a: OuvertureFacade, b: OuvertureFacade): number {
  const ix = Math.min(a.x + a.l, b.x + b.l) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ix <= 0 || iy <= 0) return 0;
  const inter = ix * iy;
  return inter / (a.l * a.h + b.l * b.h - inter);
}

/** Une boite de Claude devant la detection : cochee si la detection la retrouve (ou confirme une baie devinee), seule sinon. */
export interface BoiteAccordee {
  ouverture: OuvertureFacade;
  ia: OuvertureIa;
  cochee: boolean;
  /** Ce qui la retrouve : une ouverture trouvee par la detection, une baie devinee par la structure, ou rien. */
  avec: 'detectee' | 'devinee' | null;
}

/** Ce que l'accord a fait, compte : les boites de Claude, celles retrouvees, les devinees confirmees, les seules, les ecartees. */
export interface BilanAccord { boites: number; retrouvees: number; devineesConfirmees: number; seules: number; ecartees: number; detailsAjoutes: number }

export interface AccordIa {
  /** Les ouvertures cochees : celles de la detection (une retrouvee gagne en confiance et prend les details de Claude qui lui manquent) et les devinees confirmees. */
  ouvertures: OuvertureFacade[];
  /** Les decochees : les devinees restantes, puis les boites seules de Claude. */
  decochees: OuvertureFacade[];
  /** Claude ne retire rien : la liste reste vide (le releve la lit). */
  retirees: OuvertureFacade[];
  boites: BoiteAccordee[];
  bilan: BilanAccord;
}

/**
 * L'accord des boites de Claude avec la detection (§8, « un run, pas de vote ») : une boite que la detection retrouve (au moins 30 %
 * de recouvrement) est cochee et la detection gagne en confiance (sa place ne bouge pas : la detection la voit au centimetre) ; une
 * qui recouvre une baie devinee du meme type la confirme ; une boite seule reste decochee, recalee sur les aretes de l'elevation quand
 * il y en a (`cartes`). Ce que la personne a pose ou corrige n'est jamais retouche. Une boite hors du mur est ecartee.
 */
export function accorderOuvertures(e: { ouvertures: readonly OuvertureFacade[]; decochees: readonly OuvertureFacade[]; observations: ObservationsFacade; cartes: CartesAretes | null; largeurM: number; hauteurM: number }, r: ReglagesIa = reglagesIa()): AccordIa {
  const ouvertures = e.ouvertures.map((o) => ({ ...o })), decochees = e.decochees.map((o) => ({ ...o }));
  const bilan: BilanAccord = { boites: 0, retrouvees: 0, devineesConfirmees: 0, seules: 0, ecartees: 0, detailsAjoutes: 0 };
  const boites: BoiteAccordee[] = [];
  const seules: OuvertureFacade[] = [];
  for (const ia of e.observations.ouvertures) {
    bilan.boites++;
    const b = ouvertureDeLIa(ia, e.largeurM, e.hauteurM, r);
    const k = meilleure(ouvertures, b, r['facades.ia.baieRetrouvee']);
    if (k >= 0) {
      const o = ouvertures[k] as OuvertureFacade;
      if (o.source !== 'corrigee' && o.source !== 'ajoutee') {
        o.confiance = Math.max(o.confiance ?? 0, CONFIANCE_PLEINE);
        const d = { ...b.details, ...o.details };
        if (Object.keys(d).length > Object.keys(o.details ?? {}).length) { o.details = d; bilan.detailsAjoutes++; }
      }
      bilan.retrouvees++;
      boites.push({ ouverture: b, ia, cochee: true, avec: 'detectee' });
      continue;
    }
    const j = decochees.findIndex((o) => o.source === 'devinee' && o.type === b.type && recouvrementM(o, b) >= r['facades.ia.devineeConfirmee']);
    if (j >= 0) {
      const [d] = decochees.splice(j, 1);
      if (d) ouvertures.push(d);
      bilan.devineesConfirmees++;
      boites.push({ ouverture: b, ia, cochee: true, avec: 'devinee' });
      continue;
    }
    const recalee = e.cartes ? recalerBoite(b, e.cartes) : b;
    const placee: OuvertureFacade = { ...b, x: r2(Math.max(0, recalee.x)), y: r2(recalee.y), l: r2(recalee.l), h: r2(recalee.h) };
    const dansLeMur = placee.x + placee.l <= e.largeurM + 0.05 && placee.y + placee.h <= e.hauteurM + 0.05 && placee.l >= r['facades.ia.baieMinM'] && placee.h >= r['facades.ia.baieMinM'];
    if (!dansLeMur) { bilan.ecartees++; continue; }
    bilan.seules++;
    seules.push(placee);
    boites.push({ ouverture: placee, ia, cochee: false, avec: null });
  }
  return { ouvertures: ouvertures.sort((a, b) => a.x - b.x || a.y - b.y), decochees: [...decochees, ...seules], retirees: [], boites, bilan };
}

function meilleure(l: readonly OuvertureFacade[], b: OuvertureFacade, seuil: number): number {
  let k = -1, r = seuil;
  l.forEach((o, i) => { const x = recouvrementM(o, b); if (x >= r) { r = x; k = i; } });
  return k;
}

/** Le bilan en une phrase, pour l'ecran ; null quand Claude n'a vu aucune ouverture. */
export function texteAccord(b: BilanAccord): string | null {
  if (!b.boites) return null;
  const p = (n: number, s: string, pl = s + 's') => n + ' ' + (n > 1 ? pl : s);
  const bouts = [p(b.retrouvees, 'retrouvée par la détection', 'retrouvées par la détection')];
  if (b.devineesConfirmees) bouts.push(p(b.devineesConfirmees, 'baie devinée confirmée', 'baies devinées confirmées'));
  if (b.seules) bouts.push(p(b.seules, 'seule, proposée décochée', 'seules, proposées décochées'));
  if (b.ecartees) bouts.push(p(b.ecartees, 'hors du mur, écartée', 'hors du mur, écartées'));
  if (b.detailsAjoutes) bouts.push(p(b.detailsAjoutes, 'détail ajouté', 'détails ajoutés'));
  return p(b.boites, 'ouverture vue par Claude', 'ouvertures vues par Claude') + ' : ' + bouts.join(', ');
}
