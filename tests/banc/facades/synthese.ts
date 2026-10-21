// Generateur de facades de synthese pour le banc (MD/spec-facades-calage-detection.md §14).
//
// Les images de synthese des tests d'origine sont faciles : un enduit uni, des aplats sombres, des
// coins exacts. Le terrain ne ressemble pas a cela (spec §2.2, limites L1 a L11). Ce generateur peint
// des facades difficiles - brique, soubassement en pierre, ombres de debord et de balcon, volets
// battants, coffres de volet roulant, voiture ou haie devant, prise de biais - dont on connait la
// verite au centimetre : les ouvertures (dans le repere du mur) et les coins (sur la photo).
//
// Une scene est une description JSON (tests/fixtures/facades/*.json), rendue a la demande et de facon
// deterministe : aucun tirage n'est sequentiel, tout passe par un hachage de la position et de la
// graine. Le corpus ne porte donc pas d'images, et une scene se relit et se corrige a la main.
//
// Deux rendus :
// - l'elevation parfaite du mur, vue de face a l'infini, a `pxParM` pixels par metre : ce que
//   `detecterOuvertures` recevrait si le calage etait parfait ;
// - la photo, par un stenope place devant le mur (`prise.type = 'camera'`), ou par une homographie
//   donnee par ses quatre coins (`prise.type = 'coins'`, celle des tests d'origine). Les obstacles
//   (voiture, haie) sont alors de vrais plans entre l'objectif et le mur : ils cachent ce qu'ils
//   cachent selon le point de vue.
//
// Repere : X le long du mur, depuis la gauche vue de dehors ; Z vers le haut depuis le sol ; le mur
// est le plan Y = 0, la rue du cote Y < 0. Les coordonnees photo sont continues : le pixel (i, j)
// couvre [i, i + 1] x [j, j + 1], comme dans `redresser`.

import { homographie, appliquer, type Image, type P2 } from '../../../src/facade/homographie.js';
import { focalePx } from '../../../src/facade/cadrage.js';
import { champDepuisFocale35 } from '../../../src/facade/exif.js';
import type { DetailsOuverture, TypeOuverture } from '../../../src/model/types.js';

export type RGB = [number, number, number];

export type Parement =
  | { type: 'enduit'; couleur: RGB; /** amplitude des taches de l'enduit, en niveaux */ taches?: number }
  | { type: 'brique'; couleur: RGB; joint: RGB; /** variation d'une brique a l'autre, en niveaux */ variation?: number }
  | { type: 'pierre'; couleurs: RGB[]; joint: RGB; /** hauteur des assises, de .. a .., en metres */ assises?: [number, number]; longueurs?: [number, number] };

export type Volets =
  | { type: 'battants'; couleur: RGB }
  | { type: 'roulant'; /** hauteur du coffre au-dessus de la baie */ coffre: number; couleur?: RGB; /** part de la baie fermee par le tablier, depuis le haut */ fermeture?: number }
  /** Des persiennes (lot G17) : ouvertes, deux vantaux a lames contre le mur ; fermees, devant la baie. */
  | { type: 'persiennes'; couleur: RGB; ferme?: boolean };

/** Comment peindre une ouverture. Absent d'une photo reelle : seule la verite compte pour le banc. */
export interface RenduOuverture {
  /** Un aplat sans menuiserie, comme les images des tests d'origine. */
  uni?: RGB;
  menuiserie?: RGB;
  vitre?: RGB;
  /** Teinte d'une porte ou d'une porte de garage. */
  couleur?: RGB;
  /** Petits bois : nombre de carreaux en largeur et en hauteur. */
  carreaux?: [number, number];
  volets?: Volets;
  /**
   * Le contour de la baie (lot G17) : un haut cintre (plein cintre si la baie est assez haute, sinon un
   * arc surbaisse de fleche 0,4 h), ou une baie ronde inscrite dans la boite. Hors du contour, le mur.
   */
  forme?: 'cintre' | 'rond';
  /**
   * La baie en retrait du nu du mur (un mur de pierre epais) : la menuiserie et la vitre a `profondeur` metres
   * derriere le mur, et les quatre faces de l'ebrasement entre les deux, perpendiculaires au mur. Leurs aretes
   * fuient vers le troisieme point de fuite (la normale du mur), pas vers celui du mur. Baie rectangulaire seule.
   */
  ebrasement?: { profondeur: number; couleur?: RGB };
}

/** Une ouverture vraie, dans le repere du mur : x depuis la gauche, y (appui) depuis le sol. */
export interface OuvertureVraie {
  type: TypeOuverture;
  x: number;
  y: number;
  l: number;
  h: number;
  rendu?: RenduOuverture;
  /** Les details vrais, quand ils ne se deduisent pas du rendu et des balcons (`detailsVrais`). */
  details?: DetailsOuverture;
}

export interface Mur {
  parement: Parement;
  soubassement?: { hauteur: number; parement: Parement };
  bandeaux?: { z: number; h: number; couleur: RGB }[];
  /** Hauteur du pignon au-dessus de l'egout, en metres : un triangle, centre sauf `pignonSommet`. */
  pignon?: number;
  /** Ou tombe le sommet du pignon, en part de la largeur depuis la gauche : 0,5 centre ; 1 une rampe (le pignon d'un appentis). */
  pignonSommet?: number;
  /** Bande de toiture vue au-dessus de l'egout (mur gouttereau). */
  toit?: { hauteur: number; couleur: RGB };
  /** Eclairage qui baisse de gauche a droite : 0,2 = 20 % plus sombre au bout du mur. */
  degrade?: number;
}

export interface Balcon {
  x: number;
  l: number;
  /** Dessus de la dalle, depuis le sol. */
  z: number;
  /** Epaisseur de la dalle (15 cm) ; 0 : un garde-corps seul, sans dalle (balconnet). */
  epaisseur?: number;
  couleur?: RGB;
  gardeCorps?: { hauteur: number; couleur: RGB; pas?: number };
  /** Ombre portee de la dalle sous elle : sa hauteur, et son glissement horizontal. */
  ombre?: { hauteur: number; decalage: number; facteur?: number };
}

export type Ombre =
  | { type: 'debord'; /** hauteur de l'ombre sous l'egout, au milieu du mur */ hauteur: number; /** metres par metre */ pente?: number; facteur?: number }
  | { type: 'quad'; pts: P2[]; facteur?: number }
  | { type: 'arbre'; x: number; z: number; rayon: number; facteur?: number };

export type Obstacle =
  | { type: 'voiture'; x: number; l: number; h?: number; /** distance au mur */ recul: number; couleur: RGB }
  | { type: 'haie'; x: number; l: number; h: number; recul: number; couleur?: RGB };

export interface PriseCamera {
  type: 'camera';
  /** Distance horizontale de l'objectif au milieu du mur. */
  distance: number;
  /** Angle de la prise avec la normale au mur, en degres ; positif : l'objectif est a droite. */
  biais?: number;
  /** Ecart de visee par rapport au milieu du mur, en degres ; positif : a droite. */
  ecartCap?: number;
  /** Inclinaison vers le haut, en degres (0 : telephone d'aplomb). */
  tangage?: number;
  roulis?: number;
  /** Hauteur de l'objectif. */
  oeil?: number;
  /** Focale equivalente 24 x 36, en millimetres. */
  focale35: number;
  largeurPx: number;
  hauteurPx: number;
  /** Faux : l'application ne connait pas la focale (EXIF absent), elle prend ses 67 degres. */
  focaleConnue?: boolean;
  /** Faux : la distance n'a pas ete mesuree, les coins proposes sont le cadre a 12 %. */
  distanceConnue?: boolean;
  /** La hauteur que l'application croit (BD TOPO) ; par defaut, la vraie. */
  hauteurEstimee?: number;
  /** Bruit du capteur, en niveaux. */
  bruit?: number;
  /** Flou : rayon d'une moyenne glissante, en pixels. */
  flou?: number;
  /**
   * Distorsion radiale de l'objectif (lot L8), sous sa forme polynomiale : un point du stenope au rayon
   * r (en demi-diagonales de l'image) tombe sur la photo au rayon r (1 + k r^2). Negatif : barillet.
   * C'est volontairement un autre modele que celui de la correction (la forme « division ») : le banc
   * mesure aussi ce que coute l'ecart entre l'objectif et le modele.
   */
  distorsion?: number;
  /**
   * Pour une vue de plus (lot L13) : les coins donnes a l'analyse sont decales de tant de pixels sur
   * la photo, comme des coins poses a quelques centimetres pres. Le recalage fin doit l'absorber.
   */
  decalageCoins?: [number, number];
}

export interface PriseCoins {
  type: 'coins';
  coins: P2[];
  largeurPx: number;
  hauteurPx: number;
  distance?: number | null;
  hauteurEstimee?: number;
}

export interface Synthese {
  graine: number;
  /** Grain de l'enduit et du capteur : un tirage uniforme de plus ou moins `bruit` par canal. */
  bruit?: number;
  pxParM?: number;
  mur: Mur;
  balcons?: Balcon[];
  ombres?: Ombre[];
  devant?: Obstacle[];
  prise?: PriseCamera | PriseCoins;
  /**
   * D'autres vues du mur entier (lot L13, fusion de plusieurs vues) : de face, de biais, d'un autre
   * endroit. La vue principale reste `prise` ; ses coins sont dans `verite.coins`, ceux des autres
   * vues se calculent (`coinsVrais(s, vue)`).
   */
  vues?: PriseCamera[];
  sol?: RGB;
  ciel?: RGB;
}

export interface Verite {
  largeur: number;
  /** Hauteur du mur a l'egout. */
  hauteur: number;
  /** Coins du mur sur la photo : haut gauche, haut droit, bas droit, bas gauche ; `null` sans photo. */
  coins: P2[] | null;
  ouvertures: OuvertureVraie[];
}

export interface SceneFacade {
  nom: string;
  description: string;
  /** Ce qui rend la scene difficile, en mots-cles (`existante` : image des tests d'origine). */
  difficultes: string[];
  verite: Verite;
  synthese: Synthese;
}

/* ---------------------------------------------------------------------------------------------
 * Tirages deterministes
 * ------------------------------------------------------------------------------------------- */

/** Un nombre de [0, 1) qui ne depend que de ses trois entiers : l'ordre de peinture n'y fait rien. */
export function hache(a: number, b: number, c: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Bruit de valeur lisse, de 0 a 1, sur une grille de `pas` metres. */
function bruitLisse(X: number, Z: number, pas: number, graine: number): number {
  const u = X / pas,
    v = Z / pas;
  const i = Math.floor(u),
    j = Math.floor(v);
  const fu = u - i,
    fv = v - j;
  const su = fu * fu * (3 - 2 * fu),
    sv = fv * fv * (3 - 2 * fv);
  const a = hache(i, j, graine),
    b = hache(i + 1, j, graine),
    c = hache(i, j + 1, graine),
    d = hache(i + 1, j + 1, graine);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}

const borne = (v: number) => Math.max(0, Math.min(255, v));
const assombrir = (c: RGB, f: number): RGB => [c[0] * f, c[1] * f, c[2] * f];
const melanger = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const decaler = (c: RGB, d: number): RGB => [c[0] + d, c[1] + d, c[2] + d];

/* ---------------------------------------------------------------------------------------------
 * Le mur et ce qui s'y trouve
 * ------------------------------------------------------------------------------------------- */

/** Les assises d'un parement de pierre : une fois pour toutes, pour que les joints se suivent. */
interface Assise {
  z0: number;
  z1: number;
  coupes: number[];
}

function assisesPierre(p: Extract<Parement, { type: 'pierre' }>, largeur: number, hauteur: number, graine: number): Assise[] {
  const [hMin, hMax] = p.assises ?? [0.18, 0.32];
  const [lMin, lMax] = p.longueurs ?? [0.25, 0.6];
  const res: Assise[] = [];
  let z = 0,
    k = 0;
  while (z < hauteur) {
    const z1 = z + hMin + (hMax - hMin) * hache(k, 0, graine + 11);
    const coupes: number[] = [];
    let x = -lMax * hache(k, 1, graine + 13);
    let n = 0;
    while (x < largeur + lMax) {
      coupes.push(x);
      x += lMin + (lMax - lMin) * hache(k, n + 2, graine + 17);
      n++;
    }
    res.push({ z0: z, z1, coupes });
    z = z1;
    k++;
  }
  return res;
}

/** La teinte d'un parement au point (X, Z) ; `cache` garde les assises de pierre deja tirees. */
function couleurParement(p: Parement, X: number, Z: number, graine: number, assises: Assise[] | null): RGB {
  if (p.type === 'enduit') {
    const t = p.taches ?? 0;
    return t ? decaler(p.couleur, (bruitLisse(X, Z, 0.45, graine) - 0.5) * 2 * t) : p.couleur;
  }
  if (p.type === 'brique') {
    // Brique de 22 x 5,5 cm, joints de 1 cm, appareil en panneresses decalees d'une demi-brique.
    const assise = 0.065,
      long = 0.23;
    const r = Math.floor(Z / assise);
    const xr = X + (r % 2 ? long / 2 : 0);
    const c = Math.floor(xr / long);
    if (Z - r * assise < 0.01 || xr - c * long < 0.01) return p.joint;
    const v = p.variation ?? 18;
    return decaler(p.couleur, (hache(c, r, graine) - 0.5) * 2 * v);
  }
  const ass = assises ?? [];
  const a = ass.find((q) => Z >= q.z0 && Z < q.z1) ?? ass[ass.length - 1];
  if (!a) return p.joint;
  if (Z - a.z0 < 0.015) return p.joint;
  let i = 0;
  while (i + 1 < a.coupes.length && (a.coupes[i + 1] ?? Infinity) <= X) i++;
  if (X - (a.coupes[i] ?? 0) < 0.015) return p.joint;
  const k = Math.floor(hache(i, Math.round(a.z0 * 1000), graine + 5) * p.couleurs.length);
  const base = p.couleurs[k] ?? p.joint;
  return decaler(base, (bruitLisse(X, Z, 0.12, graine + k) - 0.5) * 30);
}

/** La teinte d'une ouverture (et de ses volets) au point (X, Z), ou `null` hors d'elle. */
export function couleurOuverture(o: OuvertureVraie, X: number, Z: number): RGB | null {
  const r = o.rendu ?? {};
  const { x, y, l, h } = o;
  const v = r.volets;
  if (v?.type === 'battants' && Z >= y && Z < y + h) {
    // Volets ouverts, rabattus contre le mur de part et d'autre : chacun fait la moitie de la baie.
    const w = l / 2;
    const gauche = X >= x - w && X < x,
      droite = X >= x + l && X < x + l + w;
    if (gauche || droite) {
      const u = gauche ? X - (x - w) : X - (x + l);
      if (u < 0.03 || u > w - 0.03 || Z - y < 0.03 || y + h - Z < 0.03) return assombrir(v.couleur, 0.88);
      return (Z - y) % 0.07 < 0.014 ? assombrir(v.couleur, 0.78) : v.couleur;
    }
  }
  if (v?.type === 'persiennes' && !v.ferme && Z >= y && Z < y + h) {
    // Ouvertes, rabattues de part et d'autre : des lames serrees, plus marquees que des volets pleins.
    const w = l / 2;
    if ((X >= x - w && X < x) || (X >= x + l && X < x + l + w)) return (Z - y) % 0.07 < 0.022 ? assombrir(v.couleur, 0.7) : v.couleur;
  }
  if (v?.type === 'roulant' && X >= x && X < x + l && Z >= y + h && Z < y + h + v.coffre) {
    const c = v.couleur ?? [236, 234, 228];
    return (Z - y - h) % 0.05 < 0.006 ? assombrir(c, 0.9) : c;
  }
  if (X < x || X >= x + l || Z < y || Z >= y + h) return null;
  if (!dansForme(o, X, Z)) return null;
  if (r.uni) return r.uni;
  const u = X - x,
    w = Z - y;
  if (v?.type === 'persiennes' && v.ferme) {
    // Fermees devant la baie : deux vantaux a lames, un battement au milieu.
    if (Math.abs(u - l / 2) < 0.015) return assombrir(v.couleur, 0.6);
    return w % 0.07 < 0.022 ? assombrir(v.couleur, 0.7) : v.couleur;
  }
  if (o.type === 'porte') {
    const c = r.couleur ?? [120, 70, 40];
    if (u < 0.05 || u > l - 0.05 || h - w < 0.05) return assombrir(c, 0.8);
    // Deux panneaux moulures : un filet sombre a leur pourtour.
    const dansPanneau = (z0: number, z1: number) => u > 0.14 && u < l - 0.14 && w > z0 && w < z1;
    const bordPanneau = (z0: number, z1: number) => dansPanneau(z0, z1) && (u < 0.17 || u > l - 0.17 || w < z0 + 0.03 || w > z1 - 0.03);
    if (bordPanneau(0.15, 0.55 * h) || bordPanneau(0.6 * h, h - 0.15)) return assombrir(c, 0.72);
    return c;
  }
  if (o.type === 'garage') {
    const c = r.couleur ?? [200, 200, 196];
    if (u < 0.05 || u > l - 0.05 || h - w < 0.05) return assombrir(c, 0.85);
    return w % 0.5 < 0.02 ? assombrir(c, 0.78) : c;
  }
  // Fenetre ou porte-fenetre : dormant, meneau, petits bois, vitrage qui reflete le ciel en haut.
  const M = r.menuiserie ?? [242, 242, 238];
  const cadre = 0.06;
  if (u < cadre || u > l - cadre || w < cadre || w > h - cadre) return M;
  if (v?.type === 'roulant' && v.fermeture && w > h - v.fermeture * h) {
    const c = v.couleur ?? [236, 234, 228];
    return (h - w) % 0.05 < 0.008 ? assombrir(c, 0.84) : c;
  }
  if (l > 0.8 && Math.abs(u - l / 2) < 0.035) return M;
  if (r.carreaux) {
    const [nx, ny] = r.carreaux;
    const pu = (l - 2 * cadre) / nx,
      pw = (h - 2 * cadre) / ny;
    const du = (u - cadre) % pu,
      dw = (w - cadre) % pw;
    if ((du < 0.0125 || du > pu - 0.0125) && u > cadre + 0.02 && u < l - cadre - 0.02) return M;
    if ((dw < 0.0125 || dw > pw - 0.0125) && w > cadre + 0.02 && w < h - cadre - 0.02) return M;
  }
  const V = r.vitre ?? [58, 66, 76];
  const reflet = Math.max(0, Math.min(1, (w / h - 0.55) / 0.45)) * 0.45;
  return melanger(V, [150, 165, 182], reflet);
}

/** La fleche du haut cintre : plein cintre quand la baie est assez haute, sinon un arc surbaisse. */
export function flecheCintre(l: number, h: number): number {
  return Math.max(0, Math.min(l / 2, 0.4 * h));
}

/** Le point (X, Z) de la boite d'une ouverture est-il dans son contour (cintre, rond) ? */
function dansForme(o: OuvertureVraie, X: number, Z: number): boolean {
  const forme = o.rendu?.forme;
  if (!forme) return true;
  const { x, y, l, h } = o;
  if (forme === 'rond') return ((X - x - l / 2) / (l / 2)) ** 2 + ((Z - y - h / 2) / (h / 2)) ** 2 <= 1;
  const f = flecheCintre(l, h);
  if (Z <= y + h - f || f <= 0) return true;
  const R = (f * f + (l / 2) * (l / 2)) / (2 * f);
  return Math.hypot(X - x - l / 2, Z - (y + h - R)) <= R;
}

/**
 * Les details vrais d'une ouverture (lot G17), ce que le classement devrait lire (spec §11) : ses volets
 * (un tablier fermé aux neuf dixiemes ou plus compte comme ferme), sa forme, et ce qui est sous elle —
 * un balcon dont la dalle porte la baie (a 20 cm pres) et la deborde, ou un garde-corps seul. Une
 * ouverture qui porte ses `details` les impose.
 */
export function detailsVrais(s: SceneFacade, o: OuvertureVraie): DetailsOuverture {
  if (o.details) return o.details;
  const d: DetailsOuverture = {};
  const v = o.rendu?.volets;
  if (v?.type === 'battants') d.volets = 'battants';
  else if (v?.type === 'persiennes') {
    d.volets = 'persiennes';
    if (v.ferme) d.ferme = true;
  } else if (v?.type === 'roulant') {
    d.volets = 'roulant';
    if ((v.fermeture ?? 0) >= 0.9) d.ferme = true;
  }
  const b = (s.synthese.balcons ?? []).find((q) => q.x <= o.x + 0.05 && q.x + q.l >= o.x + o.l - 0.05 && Math.abs(q.z - o.y) <= 0.2);
  if (b) d.allege = (b.epaisseur ?? 0.15) > 0 ? 'balcon' : 'garde-corps';
  if (o.rendu?.forme) d.forme = o.rendu.forme;
  return d;
}

function couleurBalcon(b: Balcon, X: number, Z: number): RGB | null {
  if (X < b.x || X >= b.x + b.l) return null;
  const e = b.epaisseur ?? 0.15;
  if (Z >= b.z - e && Z < b.z) return Z < b.z - e + 0.03 ? assombrir(b.couleur ?? [204, 200, 192], 0.8) : (b.couleur ?? [204, 200, 192]);
  const g = b.gardeCorps;
  if (!g || Z < b.z || Z >= b.z + g.hauteur) return null;
  if (Z > b.z + g.hauteur - 0.04 || Z < b.z + 0.04) return g.couleur;
  return (X - b.x) % (g.pas ?? 0.12) < 0.02 ? g.couleur : null;
}

/** Un point dans un polygone (pair-impair). */
function dansPolygone(pts: P2[], X: number, Z: number): boolean {
  let dedans = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i],
      b = pts[j];
    if (!a || !b) continue;
    if (a.y > Z !== b.y > Z && X < ((b.x - a.x) * (Z - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

/** Ce qu'il reste de lumiere au point (X, Z) du mur, de 0 a 1 : une ombre garde la chromaticite. */
function lumiere(s: Synthese, v: Verite, X: number, Z: number): number {
  let f = 1 - (s.mur.degrade ?? 0) * (X / v.largeur);
  for (const o of s.ombres ?? []) {
    if (o.type === 'debord') {
      const limite = v.hauteur - (o.hauteur + (o.pente ?? 0) * (X - v.largeur / 2));
      if (Z > limite && Z <= v.hauteur) f *= o.facteur ?? 0.6;
    } else if (o.type === 'quad') {
      if (dansPolygone(o.pts, X, Z)) f *= o.facteur ?? 0.6;
    } else {
      const d = Math.hypot(X - o.x, Z - o.z);
      // Un houppier : un contour irregulier, troue de taches de lumiere.
      if (d < o.rayon * (0.75 + 0.4 * bruitLisse(X, Z, 0.35, s.graine + 29)) && bruitLisse(X, Z, 0.12, s.graine + 31) > 0.25) f *= o.facteur ?? 0.62;
    }
  }
  for (const b of s.balcons ?? []) {
    const o = b.ombre;
    if (!o) continue;
    const z0 = b.z - (b.epaisseur ?? 0.15);
    const pts = [
      { x: b.x, y: z0 },
      { x: b.x + b.l, y: z0 },
      { x: b.x + b.l + o.decalage, y: z0 - o.hauteur },
      { x: b.x + o.decalage, y: z0 - o.hauteur },
    ];
    if (dansPolygone(pts, X, Z)) f *= o.facteur ?? 0.55;
  }
  return f;
}

/** La teinte d'un obstacle (voiture, haie) dans son plan, ou `null` hors de sa silhouette. */
export function couleurObstacle(o: Obstacle, X: number, Z: number, graine: number): RGB | null {
  if (X < o.x || X >= o.x + o.l || Z < 0) return null;
  const u = X - o.x;
  if (o.type === 'haie') {
    const haut = o.h + 0.12 * (bruitLisse(X, 0, 0.3, graine + 41) - 0.5);
    if (Z >= haut) return null;
    const base = o.couleur ?? [58, 96, 46];
    const feuille = hache(Math.floor(X / 0.035), Math.floor(Z / 0.035), graine + 43);
    const masse = bruitLisse(X, Z, 0.25, graine + 47);
    return decaler(base, (feuille - 0.5) * 40 + (masse - 0.5) * 50);
  }
  const h = o.h ?? 1.45;
  const l = o.l;
  for (const cx of [0.18 * l, 0.82 * l]) {
    const d = Math.hypot(u - cx, Z - 0.31);
    if (d < 0.31) return d < 0.15 ? [150, 150, 155] : [26, 26, 29];
  }
  if (Z >= 0.2 && Z < 0.95) {
    // Caisse aux extremites arrondies.
    const arrondi = 0.25;
    const dx = Math.min(u, l - u);
    if (dx < arrondi && Math.hypot(arrondi - dx, Math.max(0, Z - 0.7)) > arrondi) return null;
    return Z < 0.32 ? assombrir(o.couleur, 0.6) : o.couleur;
  }
  if (Z >= 0.95 && Z < h) {
    const t = Z - 0.95;
    const g = 0.22 * l + t * 0.9,
      d = 0.8 * l - t * 0.5;
    if (u < g || u >= d) return null;
    if (u < g + 0.06 || u > d - 0.06 || h - Z < 0.06 || Math.abs(u - (g + d) / 2) < 0.04) return o.couleur;
    return melanger([42, 52, 62], [120, 135, 150], t / (h - 0.95));
  }
  return null;
}

/** Hauteur totale peinte au-dessus du sol : le mur, et ce qui depasse de l'egout. */
export function hauteurPeinte(s: SceneFacade): number {
  return s.verite.hauteur + Math.max(s.synthese.mur.pignon ?? 0, s.synthese.mur.toit?.hauteur ?? 0);
}

/**
 * L'elevation du mur, vue de face, a `pxParM` pixels par metre, du sol au sommet du pignon ou de la
 * bande de toit. Alpha a 0 hors de la silhouette (le ciel). `obstacles` : les peindre dans le plan
 * du mur, comme vus de tres loin - c'est l'elevation parfaite que l'on donne a la detection seule.
 */
export function peindreElevation(s: SceneFacade, pxParM: number, obstacles: boolean): Image {
  const { verite: v, synthese: y } = s;
  const HT = hauteurPeinte(s);
  const L = Math.max(1, Math.round(v.largeur * pxParM));
  const H = Math.max(1, Math.round(HT * pxParM));
  const d = new Uint8ClampedArray(L * H * 4);
  const p = y.mur.parement,
    sb = y.mur.soubassement;
  const assises = p.type === 'pierre' ? assisesPierre(p, v.largeur, HT, y.graine) : null;
  const assisesSb = sb?.parement.type === 'pierre' ? assisesPierre(sb.parement, v.largeur, sb.hauteur, y.graine + 3) : null;
  const bruit = y.bruit ?? 0;
  for (let r = 0; r < H; r++) {
    const Z = HT - (r + 0.5) / pxParM;
    for (let c = 0; c < L; c++) {
      const X = (c + 0.5) / pxParM;
      const o = (r * L + c) * 4;
      let coul: RGB | null = null;
      let mur = true;
      if (Z > v.hauteur) {
        mur = false;
        const pg = y.mur.pignon;
        if (pg && Z <= v.hauteur + pg * formePignon(X / v.largeur, y.mur.pignonSommet ?? 0.5)) coul = couleurParement(p, X, Z, y.graine, assises);
        else if (y.mur.toit && Z <= v.hauteur + y.mur.toit.hauteur) coul = (Z - v.hauteur) % 0.18 < 0.025 ? assombrir(y.mur.toit.couleur, 0.7) : y.mur.toit.couleur;
      } else {
        coul = sb && Z < sb.hauteur ? couleurParement(sb.parement, X, Z, y.graine + 3, assisesSb) : couleurParement(p, X, Z, y.graine, assises);
        for (const b of y.mur.bandeaux ?? []) if (Z >= b.z && Z < b.z + b.h) coul = b.couleur;
      }
      if (coul && mur) {
        for (const ov of v.ouvertures) coul = couleurOuverture(ov, X, Z) ?? coul;
        for (const b of y.balcons ?? []) coul = couleurBalcon(b, X, Z) ?? coul;
        coul = assombrir(coul, lumiere(y, v, X, Z));
      }
      if (obstacles) for (const ob of y.devant ?? []) coul = couleurObstacle(ob, X, Z, y.graine) ?? coul;
      if (!coul) continue;
      for (let k = 0; k < 3; k++) d[o + k] = borne(coul[k as 0 | 1 | 2] + (hache(c, r, y.graine * 3 + k) - 0.5) * 2 * bruit);
      d[o + 3] = 255;
    }
  }
  return { largeur: L, hauteur: H, donnees: d };
}

/** La hauteur du pignon en `u` (part de la largeur depuis la gauche), en part de sa hauteur : 1 au sommet `sommet`, 0 aux bouts. */
export function formePignon(u: number, sommet: number): number {
  if (u <= sommet) return sommet > 0 ? Math.max(0, u / sommet) : 1;
  return sommet < 1 ? Math.max(0, (1 - u) / (1 - sommet)) : 1;
}

/** Les lignes du mur seul (sol -> egout) d'une elevation peinte : ce que lit la detection. */
export function murSeul(s: SceneFacade, elevation: Image, pxParM: number): Image {
  const haut = Math.round((hauteurPeinte(s) - s.verite.hauteur) * pxParM);
  const L = elevation.largeur;
  const h = Math.max(1, Math.round(s.verite.hauteur * pxParM));
  return { largeur: L, hauteur: h, donnees: elevation.donnees.slice(haut * L * 4, (haut + h) * L * 4) };
}

/* ---------------------------------------------------------------------------------------------
 * La photo
 * ------------------------------------------------------------------------------------------- */

type V3 = [number, number, number];
const scal = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const croix = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norme = (a: V3): V3 => {
  const n = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / n, a[1] / n, a[2] / n];
};
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Un stenope : centre, axes (avant, droite, bas), focale et point principal en pixels. */
export interface Stenope {
  C: V3;
  avant: V3;
  droite: V3;
  bas: V3;
  f: number;
  cx: number;
  cy: number;
}

export function stenope(p: PriseCamera, largeurMur: number): Stenope {
  const b = rad(p.biais ?? 0);
  const C: V3 = [largeurMur / 2 + p.distance * Math.sin(b), -p.distance * Math.cos(b), p.oeil ?? 1.5];
  // Visee vers le milieu du mur, puis tournee de l'ecart de cap (vers la droite si positif).
  const a = Math.atan2(Math.cos(b), -Math.sin(b)) - rad(p.ecartCap ?? 0);
  const t = rad(p.tangage ?? 0);
  const avant: V3 = [Math.cos(t) * Math.cos(a), Math.cos(t) * Math.sin(a), Math.sin(t)];
  const d0 = norme(croix(avant, [0, 0, 1]));
  const b0 = croix(avant, d0);
  const ro = rad(p.roulis ?? 0);
  const droite: V3 = [d0[0] * Math.cos(ro) + b0[0] * Math.sin(ro), d0[1] * Math.cos(ro) + b0[1] * Math.sin(ro), d0[2] * Math.cos(ro) + b0[2] * Math.sin(ro)];
  const bas = croix(avant, droite);
  return { C, avant, droite, bas, f: focalePx(p.largeurPx, p.hauteurPx, champDepuisFocale35(p.focale35)), cx: p.largeurPx / 2, cy: p.hauteurPx / 2 };
}

/** Projette un point du monde sur la photo. */
export function projeter(s: Stenope, P: V3): P2 {
  const q: V3 = [P[0] - s.C[0], P[1] - s.C[1], P[2] - s.C[2]];
  const z = scal(q, s.avant);
  return { x: s.cx + (s.f * scal(q, s.droite)) / z, y: s.cy + (s.f * scal(q, s.bas)) / z };
}

/** Un point du stenope, sur la photo deformee par l'objectif (`PriseCamera.distorsion`). */
export function distordre(p: PriseCamera, q: P2): P2 {
  const k = p.distorsion ?? 0;
  if (!k) return q;
  const cx = p.largeurPx / 2,
    cy = p.hauteurPx / 2,
    R2 = (p.largeurPx * p.largeurPx + p.hauteurPx * p.hauteurPx) / 4;
  const f = 1 + (k * ((q.x - cx) ** 2 + (q.y - cy) ** 2)) / R2;
  return { x: cx + (q.x - cx) * f, y: cy + (q.y - cy) * f };
}

/** Un point de la photo deformee, ramene sur le stenope : l'inverse de `distordre` (Newton). */
export function redresser(p: PriseCamera, q: P2): P2 {
  const k = p.distorsion ?? 0;
  if (!k) return q;
  const cx = p.largeurPx / 2,
    cy = p.hauteurPx / 2,
    R = Math.hypot(p.largeurPx, p.hauteurPx) / 2;
  const rd = Math.hypot(q.x - cx, q.y - cy) / R;
  if (rd < 1e-12) return q;
  let ru = rd;
  for (let i = 0; i < 30; i++) ru -= (ru * (1 + k * ru * ru) - rd) / (1 + 3 * k * ru * ru);
  const f = ru / rd;
  return { x: cx + (q.x - cx) * f, y: cy + (q.y - cy) * f };
}

/** Les coins du mur sur le stenope, sans la distorsion de l'objectif : HG, HD, BD, BG. */
export function coinsStenope(s: SceneFacade, prise: PriseCamera | PriseCoins | undefined = s.synthese.prise): P2[] | null {
  const p = prise;
  if (!p) return null;
  if (p.type === 'coins') return p.coins.map((c) => ({ ...c }));
  const st = stenope(p, s.verite.largeur);
  const { largeur: L, hauteur: H } = s.verite;
  return [
    projeter(st, [0, 0, H]),
    projeter(st, [L, 0, H]),
    projeter(st, [L, 0, 0]),
    projeter(st, [0, 0, 0]),
  ];
}

/** Les coins vrais du mur sur la photo, distorsion de l'objectif comprise : HG, HD, BD, BG. */
export function coinsVrais(s: SceneFacade, prise: PriseCamera | PriseCoins | undefined = s.synthese.prise): P2[] | null {
  const p = prise;
  const c = coinsStenope(s, p);
  if (!c || !p || p.type === 'coins') return c;
  return c.map((q) => distordre(p, q));
}

const SOL: RGB = [110, 160, 80];
const CIEL: RGB = [140, 185, 235];

/** Lit l'elevation peinte (plus proche voisin) ; `null` hors d'elle ou dans le ciel. */
function lire(elev: Image, HT: number, pxParM: number, X: number, Z: number): RGB | null {
  const c = Math.floor(X * pxParM),
    r = Math.floor((HT - Z) * pxParM);
  if (c < 0 || r < 0 || c >= elev.largeur || r >= elev.hauteur) return null;
  const o = (r * elev.largeur + c) * 4;
  if (!elev.donnees[o + 3]) return null;
  return [elev.donnees[o] ?? 0, elev.donnees[o + 1] ?? 0, elev.donnees[o + 2] ?? 0];
}

/** Moyenne glissante separable de rayon `r` pixels, sur les trois canaux. */
function flouter(img: Image, r: number): void {
  const { largeur: L, hauteur: H, donnees: d } = img;
  const tmp = new Float32Array(L * H * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++)
      for (let k = 0; k < 3; k++) {
        let s = 0,
          n = 0;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= L) continue;
          s += d[(y * L + xx) * 4 + k] ?? 0;
          n++;
        }
        tmp[(y * L + x) * 3 + k] = s / n;
      }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < L; x++)
      for (let k = 0; k < 3; k++) {
        let s = 0,
          n = 0;
        for (let dy = -r; dy <= r; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          s += tmp[(yy * L + x) * 3 + k] ?? 0;
          n++;
        }
        d[(y * L + x) * 4 + k] = s / n;
      }
}

/** Photographie la scene : l'image, et la focale vraie en pixels (`null` pour une prise par coins). */
export function photographier(s: SceneFacade, pxParM: number, prise: PriseCamera | PriseCoins | undefined = s.synthese.prise): { image: Image; focalePx: number | null } | null {
  const p = prise;
  if (!p) return null;
  const y = s.synthese;
  const HT = hauteurPeinte(s);
  const elev = peindreElevation(s, pxParM, false);
  const W = p.largeurPx,
    H = p.hauteurPx;
  const d = new Uint8ClampedArray(W * H * 4);
  const sol = y.sol ?? SOL,
    ciel = y.ciel ?? CIEL;
  const ecrire = (o: number, c: RGB) => {
    d[o] = borne(c[0]);
    d[o + 1] = borne(c[1]);
    d[o + 2] = borne(c[2]);
    d[o + 3] = 255;
  };
  if (p.type === 'coins') {
    // La prise des tests d'origine : l'elevation (x, y depuis l'egout vers le bas) envoyee sur les
    // coins par une homographie, le reste en pelouse sous le mur et en ciel au-dessus.
    const { largeur: Lm, hauteur: Hm } = s.verite;
    const versMur = homographie(p.coins, [
      { x: 0, y: 0 },
      { x: Lm, y: 0 },
      { x: Lm, y: Hm },
      { x: 0, y: Hm },
    ]);
    if (!versMur) return null;
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const m = appliquer(versMur, { x: i + 0.5, y: j + 0.5 });
        const Z = Hm - m.y;
        ecrire((j * W + i) * 4, lire(elev, HT, pxParM, m.x, Z) ?? (Z < 0 ? sol : ciel));
      }
    return { image: { largeur: W, hauteur: H, donnees: d }, focalePx: null };
  }
  const st = stenope(p, s.verite.largeur);
  const bruit = p.bruit ?? 0;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      // Le pixel de la photo deformee vise le rayon du stenope qui y tombe.
      const q = p.distorsion ? redresser(p, { x: i + 0.5, y: j + 0.5 }) : { x: i + 0.5, y: j + 0.5 };
      const u = q.x - st.cx,
        v = q.y - st.cy;
      const D: V3 = [st.avant[0] * st.f + st.droite[0] * u + st.bas[0] * v, st.avant[1] * st.f + st.droite[1] * u + st.bas[1] * v, st.avant[2] * st.f + st.droite[2] * u + st.bas[2] * v];
      let t = Infinity;
      let c: RGB | null = null;
      if (D[1] > 0) {
        for (const ob of y.devant ?? []) {
          const to = (-ob.recul - st.C[1]) / D[1];
          if (!(to > 0 && to < t)) continue;
          const co = couleurObstacle(ob, st.C[0] + to * D[0], st.C[2] + to * D[2], y.graine);
          if (co) {
            t = to;
            c = co;
          }
        }
        const tm = -st.C[1] / D[1];
        if (tm > 0 && tm < t) {
          const Xm = st.C[0] + tm * D[0], Zm = st.C[2] + tm * D[2];
          const eb = ebrasementTouche(s.verite.ouvertures, Xm, Zm);
          const cm = eb ? couleurEbrasement(eb, st.C, D, elev, HT, pxParM) : lire(elev, HT, pxParM, Xm, Zm);
          if (cm) {
            t = tm;
            c = cm;
          }
        }
      }
      if (D[2] < 0) {
        const ts = -st.C[2] / D[2];
        if (ts < t) {
          const X = st.C[0] + ts * D[0],
            Yp = st.C[1] + ts * D[1];
          // Le sol : de la pelouse, a gros grain, pour que les bords du mur ne soient pas trop nets.
          c = decaler(sol, (hache(Math.floor(X / 0.05), Math.floor(Yp / 0.05), y.graine + 53) - 0.5) * 30);
        }
      }
      c = c ?? ciel;
      if (bruit) c = [c[0] + (hache(i, j, y.graine + 61) - 0.5) * 2 * bruit, c[1] + (hache(i, j, y.graine + 67) - 0.5) * 2 * bruit, c[2] + (hache(i, j, y.graine + 71) - 0.5) * 2 * bruit];
      ecrire((j * W + i) * 4, c);
    }
  const image = { largeur: W, hauteur: H, donnees: d };
  if (p.flou) flouter(image, p.flou);
  return { image, focalePx: st.f };
}

/** L'ouverture a ebrasement dont la baie contient le point (X, Z) du nu du mur, s'il y en a une. */
function ebrasementTouche(ouvertures: readonly OuvertureVraie[], X: number, Z: number): OuvertureVraie | null {
  return ouvertures.find((o) => o.rendu?.ebrasement && !o.rendu.forme && X >= o.x && X < o.x + o.l && Z >= o.y && Z < o.y + o.h) ?? null;
}

/**
 * Ce que voit un rayon entre dans la baie `o` par le nu du mur : la menuiserie et la vitre s'il atteint le fond
 * (`profondeur` derriere le mur, peints comme sur l'elevation), sinon la face de l'ebrasement qu'il touche d'abord,
 * eclairee selon son orientation (le dessous du linteau le plus sombre, l'appui le plus clair).
 */
function couleurEbrasement(o: OuvertureVraie, C: V3, D: V3, elev: ReturnType<typeof peindreElevation>, HT: number, pxParM: number): RGB | null {
  const e = o.rendu?.ebrasement as NonNullable<RenduOuverture['ebrasement']>;
  const t0 = -C[1] / D[1], t1 = (e.profondeur - C[1]) / D[1];
  const Xf = C[0] + t1 * D[0], Zf = C[2] + t1 * D[2];
  if (Xf >= o.x && Xf < o.x + o.l && Zf >= o.y && Zf < o.y + o.h) return lire(elev, HT, pxParM, Math.min(o.x + o.l - 1e-6, Math.max(o.x, Xf)), Math.min(o.y + o.h - 1e-6, Math.max(o.y, Zf)));
  const base = e.couleur ?? [206, 199, 187];
  const faces: [number, number][] = [];
  // Le rayon sort de la boite de la baie par la premiere face qu'il franchit entre le nu du mur et le fond.
  const essai = (t: number, eclairage: number, dedans: (X: number, Z: number) => boolean) => {
    if (t > t0 && t < t1 && dedans(C[0] + t * D[0], C[2] + t * D[2])) faces.push([t, eclairage]);
  };
  if (Math.abs(D[0]) > 1e-12) {
    essai((o.x - C[0]) / D[0], 0.82, (_, Z) => Z >= o.y && Z <= o.y + o.h);
    essai((o.x + o.l - C[0]) / D[0], 0.68, (_, Z) => Z >= o.y && Z <= o.y + o.h);
  }
  if (Math.abs(D[2]) > 1e-12) {
    essai((o.y - C[2]) / D[2], 0.95, (X) => X >= o.x && X <= o.x + o.l);
    essai((o.y + o.h - C[2]) / D[2], 0.5, (X) => X >= o.x && X <= o.x + o.l);
  }
  const f = faces.sort((a, b) => a[0] - b[0])[0];
  return f ? assombrir(base, f[1]) : base;
}

/**
 * Le point (X, Z) du mur est-il cache par un obstacle (voiture, haie) depuis la prise `p` ? C'est la
 * verite des occlusions, pour mesurer ce que la fusion des vues (lot L13) retrouve du mur.
 */
export function cacheDepuis(s: SceneFacade, p: PriseCamera, X: number, Z: number): boolean {
  const st = stenope(p, s.verite.largeur);
  for (const ob of s.synthese.devant ?? []) {
    // Le segment objectif -> mur traverse le plan de l'obstacle (Y = -recul) a la fraction t.
    const t = (-ob.recul - st.C[1]) / (0 - st.C[1]);
    if (!(t > 0 && t < 1)) continue;
    if (couleurObstacle(ob, st.C[0] + t * (X - st.C[0]), st.C[2] + t * (Z - st.C[2]), s.synthese.graine)) return true;
  }
  return false;
}
