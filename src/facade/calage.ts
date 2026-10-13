// Le calage grossier d'une photo de facade (MD/spec-facades-calage-detection.md §4 et §5, lot L6).
//
// Avant ce module, les coins proposes supposaient le mur centre dans l'image et le telephone
// d'aplomb (`analyse.ts::coinsProposes`). Or un tangage de 6 degres a 12 m decale deja le mur de
// 1,3 m, et une prise de biais deforme le rectangle en trapeze. Ici, la prise de vue - position,
// azimut, inclinaison, roulis, focale - projette les coins du mur dans la photo par un stenope, avec
// un objectif tenu a 1,5 m du sol.
//
// Le resultat n'est pas une verite : la boussole d'un telephone se trompe de 5 a 15 degres pres d'un
// mur, le GPS de quelques metres. On projette donc aussi aux bornes de l'incertitude, ce qui donne
// une **zone de recherche** par coin, ou le calage fin (lot L7) cherchera les aretes. Les coins
// predits sont l'hypothese de depart : ils remplacent les coins centres quand la prise est connue.
//
// Deux usages :
// - **l'audit** connait la position et l'azimut (`PrisePhoto`) : projection depuis le point de prise ;
// - **le releve** ne connait que la distance mesuree, et l'attitude et le cap au declenchement : on
//   suppose que la personne vise le milieu du mur, a la distance mesuree, sous le biais que donne le
//   cap. Cette hypothese resiste a l'erreur de la boussole : la visee reste sur le milieu du mur, seul
//   le biais (la perspective) s'en ressent.
//
// Repere : celui du plan, X vers l'est, Y vers le nord, Z vers le haut depuis le pied du mur (le sol
// est suppose plat entre l'objectif et le mur). Azimuts en degres depuis le nord, sens horaire.

import type { P2 } from './homographie.js';
import { focalePx as focaleDuChamp, CHAMP_GRAND_COTE_DEFAUT } from './cadrage.js';
import { coinsProposes } from './analyse.js';
import type { Facade } from './geometrie.js';
import type { PrisePhoto, SourceFocale } from '../model/audit.js';

/** La hauteur de l'objectif d'un telephone tenu a la main, en metres. */
export const OEIL_M = 1.5;
/** L'erreur de la boussole pres d'un mur ou d'une voiture (MD/spec-audit.md §5). */
export const INCERTITUDE_BOUSSOLE_DEG = 15;
/** Le sens de la marche dit mal ou l'on regarde. */
export const INCERTITUDE_MARCHE_DEG = 25;
/**
 * L'inclinaison et le roulis sont lus a l'accelerometre, au degre pres, mais au retour de l'appareil
 * photo dans l'audit, pas au declenchement : on garde quelques degres de marge.
 */
export const INCERTITUDE_ATTITUDE_DEG = 3;
/** Sans inclinaison lue, le telephone peut viser assez haut pour cadrer un pignon. */
export const INCERTITUDE_INCLINAISON_INCONNUE_DEG = 20;
/** Sans roulis lu, une photo a main levee reste a peu pres droite. */
export const INCERTITUDE_ROULIS_INCONNU_DEG = 10;
/** Un GPS qui ne dit pas sa precision : celle d'une rue entre deux facades. */
export const PRECISION_GPS_DEFAUT_M = 15;
/**
 * Focale par defaut (67 degres) : la vraie peut aller du grand-angle 0,5x (13 a 16 mm) au leger
 * tele (40 mm environ). Part de la focale par defaut, en plus et en moins.
 */
export const ECART_FOCALE_DEFAUT = 0.5;
/** Au-dela, le cap ne dit plus le biais du releve : la personne regarde sans doute un autre mur. */
export const BIAIS_MAX_DEG = 60;

/** Le mur a caler : ses deux bouts au sol (gauche et droite vus de dehors) et son egout. */
export interface MurVu {
  gauche: P2;
  droite: P2;
  /** Hauteur de l'egout au-dessus du pied du mur, en metres. */
  hauteur: number;
}

/** Ce qu'il faut savoir de la prise pour projeter le mur dans la photo. */
export interface PriseDeVue {
  /** Position de l'objectif au sol, dans le repere du plan (metres). */
  x: number;
  y: number;
  /** Rayon d'incertitude de la position, en metres ; `null` si le GPS ne le dit pas. */
  precisionM: number | null;
  /** Direction de la visee, en degres depuis le nord, sens horaire. */
  azimutDeg: number;
  sourceAzimut: 'boussole' | 'deplacement' | 'hypothese' | null;
  /** Visee au-dessus de l'horizon, en degres ; `null` : non lue (on suppose d'aplomb). */
  inclinaisonDeg: number | null;
  /** Rotation de l'image autour de la visee, sens horaire positif ; `null` : non lu. */
  roulisDeg: number | null;
  /** Focale en pixels de l'image, et la taille de celle-ci. */
  focalePx: number;
  largeurPx: number;
  hauteurPx: number;
  sourceFocale: SourceFocale | null;
  /** Hauteur de l'objectif, en metres (1,5 m par defaut). */
  oeil?: number;
}

/** Ou chercher un coin dans la photo : un rectangle, ou l'image entiere s'il n'est pas borne. */
export interface ZoneRecherche {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Faux : aux bornes de l'incertitude, le coin passe derriere l'objectif ; la zone est l'image. */
  bornee: boolean;
}

export interface CalageGrossier {
  /** Coins predits : haut gauche, haut droit, bas droit, bas gauche. `null` : le mur est derriere. */
  coins: P2[] | null;
  /** Une zone par coin, dans le meme ordre. */
  zones: ZoneRecherche[];
  /** Distance horizontale de l'objectif au milieu du mur, en metres. */
  distance: number;
  /** Pixels par metre au milieu du mur sur cette image : la precision que l'on peut en attendre. */
  pxParM: number;
}

export type V3 = [number, number, number];
const rad = (d: number) => (d * Math.PI) / 180;
const scal = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const croix = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const modulo360 = (a: number) => ((a % 360) + 360) % 360;
export const ecartSigne = (a: number) => modulo360(a + 180) - 180;

/** En deca, un point est trop pres du plan de l'objectif (ou derriere) pour se projeter. */
const PROFONDEUR_MIN_M = 0.1;

/** Le repere d'une prise : centre, axes de l'image (avant, droite, bas), focale et point principal. */
export interface Repere {
  C: V3;
  avant: V3;
  droite: V3;
  bas: V3;
  f: number;
  cx: number;
  cy: number;
}

/**
 * Le repere de l'appareil : la visee tournee de l'azimut puis levee de l'inclinaison ; la droite de
 * l'image reste horizontale, puis tourne du roulis (sens horaire vu de derriere le telephone : la
 * droite de l'image descend). C'est le meme stenope que le generateur du banc de facades.
 */
function repere(p: PriseDeVue, ecarts: Ecarts = ZERO): Repere {
  const a = rad(p.azimutDeg + ecarts.azimut);
  const t = rad((p.inclinaisonDeg ?? 0) + ecarts.inclinaison);
  const r = rad((p.roulisDeg ?? 0) + ecarts.roulis);
  const avant: V3 = [Math.cos(t) * Math.sin(a), Math.cos(t) * Math.cos(a), Math.sin(t)];
  // Horizontale a droite de la visee : (cos a, -sin a, 0) pour une visee d'azimut a.
  const d0: V3 = [Math.cos(a), -Math.sin(a), 0];
  const b0 = croix(avant, d0);
  const droite: V3 = [d0[0] * Math.cos(r) + b0[0] * Math.sin(r), d0[1] * Math.cos(r) + b0[1] * Math.sin(r), d0[2] * Math.cos(r) + b0[2] * Math.sin(r)];
  return {
    C: [p.x + ecarts.dx, p.y + ecarts.dy, p.oeil ?? OEIL_M],
    avant,
    droite,
    bas: croix(avant, droite),
    f: p.focalePx * ecarts.focale,
    cx: p.largeurPx / 2,
    cy: p.hauteurPx / 2,
  };
}

/** Le repere de l'appareil d'une prise de vue, tel que le stenope du calage le construit. */
export function repereCamera(p: PriseDeVue): Repere {
  return repere(p);
}

function projeterDans(s: Repere, P: V3): P2 | null {
  const q: V3 = [P[0] - s.C[0], P[1] - s.C[1], P[2] - s.C[2]];
  const z = scal(q, s.avant);
  if (z < PROFONDEUR_MIN_M) return null;
  return { x: s.cx + (s.f * scal(q, s.droite)) / z, y: s.cy + (s.f * scal(q, s.bas)) / z };
}

/** Projette un point du plan, a la hauteur `z`, dans la photo ; `null` derriere l'objectif. */
export function projeterPoint(p: PriseDeVue, x: number, y: number, z: number): P2 | null {
  return projeterDans(repere(p), [x, y, z]);
}

function coinsMur(m: MurVu): V3[] {
  return [
    [m.gauche.x, m.gauche.y, m.hauteur],
    [m.droite.x, m.droite.y, m.hauteur],
    [m.droite.x, m.droite.y, 0],
    [m.gauche.x, m.gauche.y, 0],
  ];
}

/** Les quatre coins du mur projetes : haut gauche, haut droit, bas droit, bas gauche ; `null` si l'un est derriere. */
export function coinsPredits(m: MurVu, p: PriseDeVue): P2[] | null {
  const s = repere(p);
  const c = coinsMur(m).map((P) => projeterDans(s, P));
  return c.every((q): q is P2 => q !== null) ? c : null;
}

/** Un jeu d'ecarts aux mesures de la prise. */
interface Ecarts {
  dx: number;
  dy: number;
  azimut: number;
  inclinaison: number;
  roulis: number;
  /** Facteur de la focale. */
  focale: number;
}
const ZERO: Ecarts = { dx: 0, dy: 0, azimut: 0, inclinaison: 0, roulis: 0, focale: 1 };

/** Les bornes de l'incertitude d'une prise, telles que la spec les fixe (§5). */
export interface Incertitude {
  positionM: number;
  azimutDeg: number;
  inclinaisonDeg: number;
  roulisDeg: number;
  /** Part de la focale, en plus et en moins. */
  focale: number;
}

/** L'incertitude d'une prise : la precision du GPS, 15 degres pour la boussole, 25 pour la marche. */
export function incertitudeDe(p: PriseDeVue): Incertitude {
  return {
    positionM: p.precisionM ?? PRECISION_GPS_DEFAUT_M,
    azimutDeg: p.sourceAzimut === 'deplacement' ? INCERTITUDE_MARCHE_DEG : INCERTITUDE_BOUSSOLE_DEG,
    inclinaisonDeg: p.inclinaisonDeg === null ? INCERTITUDE_INCLINAISON_INCONNUE_DEG : INCERTITUDE_ATTITUDE_DEG,
    roulisDeg: p.roulisDeg === null ? INCERTITUDE_ROULIS_INCONNU_DEG : INCERTITUDE_ATTITUDE_DEG,
    focale: p.sourceFocale === 'defaut' ? ECART_FOCALE_DEFAUT : 0,
  };
}

/**
 * Les jeux d'ecarts a essayer : chaque mesure a sa valeur et a ses deux bornes, la position au centre
 * et sur huit points du cercle d'incertitude. Les extremes d'une projection tombent aux bornes ; les
 * combiner toutes (729 jeux au plus) reste instantane pour quatre coins.
 */
function jeuxEcarts(i: Incertitude): Ecarts[] {
  const trois = (v: number) => (v > 0 ? [0, -v, v] : [0]);
  const positions: [number, number][] = [[0, 0]];
  if (i.positionM > 0) for (let k = 0; k < 8; k++) positions.push([i.positionM * Math.cos((k * Math.PI) / 4), i.positionM * Math.sin((k * Math.PI) / 4)]);
  const res: Ecarts[] = [];
  for (const [dx, dy] of positions)
    for (const azimut of trois(i.azimutDeg))
      for (const inclinaison of trois(i.inclinaisonDeg))
        for (const roulis of trois(i.roulisDeg))
          for (const df of trois(i.focale)) res.push({ dx, dy, azimut, inclinaison, roulis, focale: 1 + df });
  return res;
}

/**
 * Une zone de recherche par coin : le rectangle qui contient ses projections aux bornes de
 * l'incertitude. Un coin qui passe derriere l'objectif pour l'un des jeux n'est pas borne : sa zone est
 * l'image entiere, comme sans prise de vue (spec §5).
 */
export function zonesDeRecherche(m: MurVu, p: PriseDeVue, i: Incertitude = incertitudeDe(p)): ZoneRecherche[] {
  const P = coinsMur(m);
  const z = P.map(() => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, bornee: true }));
  for (const e of jeuxEcarts(i)) {
    const s = repere(p, e);
    P.forEach((Q, k) => {
      const zk = z[k];
      if (!zk || !zk.bornee) return;
      const q = projeterDans(s, Q);
      if (!q) {
        zk.bornee = false;
        return;
      }
      zk.x0 = Math.min(zk.x0, q.x);
      zk.y0 = Math.min(zk.y0, q.y);
      zk.x1 = Math.max(zk.x1, q.x);
      zk.y1 = Math.max(zk.y1, q.y);
    });
  }
  return z.map((zk) => (zk.bornee ? zk : imageEntiere(p.largeurPx, p.hauteurPx)));
}

/** La zone de recherche sans prise de vue : l'image entiere. */
export function imageEntiere(largeurPx: number, hauteurPx: number): ZoneRecherche {
  return { x0: 0, y0: 0, x1: largeurPx, y1: hauteurPx, bornee: false };
}

/** Pixels par metre au mur, sur une image de focale `focalePx`, a `distance` metres. */
export function pxParMetre(focalePx: number, distance: number): number {
  return distance > 0 ? focalePx / distance : 0;
}

/**
 * La precision des cotes que permet une image, en centimetres : un pixel de la photo source au mur.
 * Une elevation a 100 px/m tiree d'une photo qui n'en avait que 40 n'est precise qu'a 2,5 cm (§7).
 */
export function precisionCm(pxParM: number): number {
  return pxParM > 0 ? 100 / pxParM : Infinity;
}

/** Pixels par metre au mur lus sur quatre coins poses (HG, HD, BD, BG) : le cote du mur le moins bien vu. */
export function pxParMetreDesCoins(coins: readonly P2[], largeur: number, hauteur: number): number | null {
  const [hg, hd, bd, bg] = coins;
  if (!hg || !hd || !bd || !bg || !(largeur > 0) || !(hauteur > 0)) return null;
  const d = (a: P2, b: P2) => Math.hypot(a.x - b.x, a.y - b.y);
  // Le plus petit des quatre cotes, rapporte a sa longueur vraie : en biais, le bout le plus loin du
  // mur est le moins bien defini, et c'est lui qui borne la precision.
  return Math.min(d(hg, hd) / largeur, d(bg, bd) / largeur, d(hg, bg) / hauteur, d(hd, bd) / hauteur);
}

/** Le calage grossier d'une prise connue : coins predits, zones de recherche, distance et resolution. */
export function calageGrossier(m: MurVu, p: PriseDeVue, i: Incertitude = incertitudeDe(p)): CalageGrossier {
  const mx = (m.gauche.x + m.droite.x) / 2,
    my = (m.gauche.y + m.droite.y) / 2;
  const distance = Math.hypot(mx - p.x, my - p.y);
  return { coins: coinsPredits(m, p), zones: zonesDeRecherche(m, p, i), distance, pxParM: pxParMetre(p.focalePx, distance) };
}

/** Le mur d'une facade du plan, a la hauteur de son egout (ou a celle donnee). */
export function murDeFacade(f: Facade, hauteur = f.hauteur): MurVu {
  return { gauche: { x: f.gauche.x, y: f.gauche.y }, droite: { x: f.droite.x, y: f.droite.y }, hauteur };
}

/* ------------------------------------------------------------------------------------------------
 * Le releve : visee sur le milieu du mur
 * --------------------------------------------------------------------------------------------- */

/**
 * Le biais de la prise, d'apres le cap de la boussole et l'azimut de la facade (sa normale sortante) :
 * l'angle entre la visee et la normale, positif quand l'objectif est a droite du milieu du mur (vu de
 * dehors). `null` au-dela de 60 degres : la personne regarde sans doute un autre mur.
 */
export function biaisDepuisCap(capDeg: number, azimutFacadeDeg: number): number | null {
  const b = ecartSigne(azimutFacadeDeg - capDeg - 180);
  return Math.abs(b) <= BIAIS_MAX_DEG ? b : null;
}

/** Ce que le releve sait d'une prise : la distance mesuree, et au declenchement le cap et l'attitude. */
export interface PriseReleve {
  largeurPx: number;
  hauteurPx: number;
  focalePx: number;
  distance: number;
  biaisDeg?: number | null;
  inclinaisonDeg?: number | null;
  roulisDeg?: number | null;
  oeil?: number;
  /** Vrai : la focale est celle par defaut (ni EXIF ni capteur), juste a 50 % pres. */
  focaleEstimee?: boolean;
  /** Vrai : la distance n'a pas ete mesuree, elle est supposee d'apres le cadrage. */
  distanceEstimee?: boolean;
}

/**
 * Le mur et la prise du releve, dans un repere propre au mur (gauche a l'origine, droite sur +X, la
 * rue vers -Y) : l'objectif est a `distance` m du milieu du mur, sous le biais donne, et vise ce
 * milieu. `largeur` est la part de mur que la photo doit montrer (le mur entier, ou un morceau).
 */
export function priseVisantLeMilieu(largeur: number, hauteur: number, r: PriseReleve): { mur: MurVu; prise: PriseDeVue } {
  const b = rad(r.biaisDeg ?? 0);
  return {
    mur: { gauche: { x: 0, y: 0 }, droite: { x: largeur, y: 0 }, hauteur },
    prise: {
      x: largeur / 2 + r.distance * Math.sin(b),
      y: -r.distance * Math.cos(b),
      precisionM: null,
      // La normale sortante du mur pointe vers -Y (azimut 180) : viser le milieu depuis la droite,
      // c'est tourner la visee vers la gauche.
      azimutDeg: modulo360(-(r.biaisDeg ?? 0)),
      sourceAzimut: 'hypothese',
      inclinaisonDeg: r.inclinaisonDeg ?? null,
      roulisDeg: r.roulisDeg ?? null,
      focalePx: r.focalePx,
      largeurPx: r.largeurPx,
      hauteurPx: r.hauteurPx,
      sourceFocale: null,
      ...(r.oeil !== undefined ? { oeil: r.oeil } : {}),
    },
  };
}

/** Sans cap, la personne peut se tenir de biais jusqu'a l'angle ou elle regarderait un autre mur. */
export const INCERTITUDE_BIAIS_INCONNU_DEG = 35;

/**
 * L'incertitude d'une prise du releve, ou la position n'est pas mesuree : on suppose l'objectif a la
 * distance mesuree, sur le cercle autour du milieu du mur, sous le biais que donne le cap. Une erreur
 * du cap deplace donc l'objectif le long de ce cercle (la corde qu'il sous-tend), et la visee peut
 * s'ecarter du milieu comme une boussole se trompe.
 */
export function incertitudeDuReleve(r: PriseReleve): Incertitude {
  const biais = r.biaisDeg === null || r.biaisDeg === undefined ? INCERTITUDE_BIAIS_INCONNU_DEG : INCERTITUDE_BOUSSOLE_DEG;
  return {
    // Une distance supposee peut etre fausse de moitie : l'objectif peut etre plus pres ou plus loin.
    positionM: 2 * r.distance * Math.sin(rad(biais) / 2) + (r.distanceEstimee ? 0.5 * r.distance : 0),
    azimutDeg: INCERTITUDE_BOUSSOLE_DEG,
    inclinaisonDeg: r.inclinaisonDeg === null || r.inclinaisonDeg === undefined ? INCERTITUDE_INCLINAISON_INCONNUE_DEG : INCERTITUDE_ATTITUDE_DEG,
    roulisDeg: r.roulisDeg === null || r.roulisDeg === undefined ? INCERTITUDE_ROULIS_INCONNU_DEG : INCERTITUDE_ATTITUDE_DEG,
    focale: r.focaleEstimee ? ECART_FOCALE_DEFAUT : 0,
  };
}

/**
 * Les coins proposes par le releve. Sans cap ni attitude, ce sont exactement les coins centres
 * d'avant (`coinsProposes`) ; l'inclinaison, le roulis et le biais les placent ou le mur se trouve.
 * Si la prise met un coin derriere l'objectif (mesure aberrante), on revient aux coins centres.
 */
export function coinsDuReleve(largeur: number, hauteur: number, r: PriseReleve): P2[] {
  const { mur, prise } = priseVisantLeMilieu(largeur, hauteur, r);
  return coinsPredits(mur, prise) ?? coinsProposes(r.largeurPx, r.hauteurPx, r.focalePx, r.distance, largeur, hauteur, r.oeil ?? OEIL_M);
}

/* ------------------------------------------------------------------------------------------------
 * L'audit : la photo situee
 * --------------------------------------------------------------------------------------------- */

/** La focale d'une photo situee, en pixels de l'image donnee : son champ, ou les 67 degres par defaut. */
export function focaleDeLaPhoto(p: Pick<PrisePhoto, 'champDeg'>, largeurPx: number, hauteurPx: number): number {
  return focaleDuChamp(largeurPx, hauteurPx, p.champDeg ?? CHAMP_GRAND_COTE_DEFAUT);
}

/**
 * La prise de vue d'une photo de l'audit, pour une image de `largeurPx` x `hauteurPx` (la photo
 * reduite, ou la source). `null` sans azimut : on ne sait pas vers ou elle regarde.
 */
export function priseDeVueDepuisPhoto(p: PrisePhoto, largeurPx: number, hauteurPx: number): PriseDeVue | null {
  if (p.azimutDeg === null || !Number.isFinite(p.azimutDeg)) return null;
  return {
    x: p.x,
    y: p.y,
    precisionM: p.precisionM,
    azimutDeg: p.azimutDeg,
    sourceAzimut: p.sourceAzimut,
    inclinaisonDeg: p.inclinaisonDeg ?? null,
    roulisDeg: p.roulisDeg ?? null,
    focalePx: focaleDeLaPhoto(p, largeurPx, hauteurPx),
    largeurPx,
    hauteurPx,
    // Une photo de version 1 n'a pas de focale lue : c'est le champ par defaut, une estimation.
    sourceFocale: p.sourceFocale ?? 'defaut',
  };
}

/**
 * Pixels par metre au mur sur la photo **source** (avant reduction), a `distance` metres : la
 * precision reelle des cotes (§4). `null` si la taille de la source n'a pas ete gardee.
 */
export function pxParMetreSource(p: Pick<PrisePhoto, 'champDeg' | 'largeurSourcePx' | 'hauteurSourcePx'>, distance: number): number | null {
  if (!p.largeurSourcePx || !p.hauteurSourcePx || !(distance > 0)) return null;
  return pxParMetre(focaleDeLaPhoto(p, p.largeurSourcePx, p.hauteurSourcePx), distance);
}

/** Les coins proposes sur une photo de l'audit, et d'ou ils viennent. */
export interface CoinsDeLaPhoto {
  coins: P2[];
  /** `predit` : projete depuis la prise de vue ; `centre` : le mur suppose centre (sans azimut). */
  source: 'predit' | 'centre';
  zones: ZoneRecherche[];
  calage: CalageGrossier | null;
}

/**
 * Les coins d'un mur sur une photo de l'audit : predits par la prise de vue quand elle est connue,
 * sinon centres (a la distance de la position au mur, s'il y en a une), avec l'image entiere pour
 * zone de recherche.
 */
export function coinsDeLaPhoto(p: PrisePhoto | null | undefined, m: MurVu, largeurPx: number, hauteurPx: number): CoinsDeLaPhoto {
  const prise = p ? priseDeVueDepuisPhoto(p, largeurPx, hauteurPx) : null;
  const calage = prise ? calageGrossier(m, prise) : null;
  if (calage?.coins) return { coins: calage.coins, source: 'predit', zones: calage.zones, calage };
  const largeur = Math.hypot(m.droite.x - m.gauche.x, m.droite.y - m.gauche.y);
  const distance = p ? Math.hypot((m.gauche.x + m.droite.x) / 2 - p.x, (m.gauche.y + m.droite.y) / 2 - p.y) : null;
  const f = focaleDeLaPhoto(p ?? {}, largeurPx, hauteurPx);
  const zone = imageEntiere(largeurPx, hauteurPx);
  return { coins: coinsProposes(largeurPx, hauteurPx, f, distance, largeur, m.hauteur), source: 'centre', zones: [zone, zone, zone, zone], calage };
}
