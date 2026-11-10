// La distorsion du grand-angle (MD/spec-facades-calage-detection.md §4, lot L8).
//
// L'ultra grand-angle d'un telephone (objectif 0,5x, 13 a 16 mm equivalent) courbe les droites : une
// arete de mur pres du bord de l'image se bombe vers l'exterieur (distorsion en barillet). Tout ce qui
// suit suppose pourtant un stenope parfait : les points de fuite, les aretes du calage fin, la mesure
// de la hauteur, l'homographie du redressement. Au-dela de 20 mm, les telephones corrigent deja leurs
// photos : on n'y touche pas. En deca, on corrige.
//
// Modele : une distorsion radiale a un coefficient, sous sa forme « division » (Fitzgibbon, 2001) :
//
//     p_corrige = c + (p_photo - c) / (1 + k1 r^2),   r = |p_photo - c| / demi-diagonale
//
// Elle se calcule sans iteration dans le sens qui sert (de la photo au stenope), s'inverse par une
// equation du second degre, et un seul coefficient suffit pour l'objectif d'un telephone. Un barillet
// donne k1 < 0. Le centre est celui de l'image, comme partout ailleurs (mesurerHauteur, calage).
//
// Estimation (« fil a plomb ») : les aretes verticales du monde (cotes du mur, tableaux des baies,
// descentes d'eau) sont droites ; sur la photo, celles qui passent loin du centre sont courbes. On
// prend les traces de gradient presque verticales (segments.ts::detecterTraces, les memes regions que
// celles des segments, mais sans exiger qu'elles soient droites), reduites a leur ligne mediane, et
// l'on cherche le k1 qui les rend le plus droites possible : pour chaque mediane, le rapport des deux
// axes de ses points corriges (petit sur grand), qui ne depend pas de l'echelle - sans quoi le
// coefficient qui retrecit l'image gagnerait toujours. Une trace qui reste courbe au meilleur k1 (une
// branche, un arc) est ecartee, puis l'on recommence. On ne corrige que si le gain est net : une photo
// deja corrigee par le telephone, ou sans aretes, reste telle quelle.
//
// L'image corrigee garde sa taille, reduite d'un facteur `echelle` pour que ses quatre coins y
// tiennent : la focale en pixels est multipliee d'autant. Ce qui sort du cadre d'origine (les bords,
// au milieu des cotes) prolonge le bord de la photo plutot que d'y mettre une arete nette, qu'un
// detecteur prendrait pour celle d'un mur.
//
// Tout est pur, sans DOM : le banc (Node), le worker du releve et la page partagent ce code.

import type { Image, P2 } from './homographie.js';
import { detecterTraces, type Trace } from './segments.js';

/** En deca de cette focale equivalente 24 x 36 (mm), la photo est corrigee ; au-dela, rien n'est fait. */
export const FOCALE_GRAND_ANGLE_MM = 20;
/** Bornes du coefficient : un 0,5x non corrige reste dans un barillet de 5 a 25 % au coin. */
export const K1_MIN = -0.4;
export const K1_MAX = 0.1;
/** En deca, la correction deplacerait le coin de l'image de moins de 1 % : on ne la fait pas. */
const K1_NEGLIGEABLE = 0.01;
/** Ecart maximal d'une trace a la verticale de l'image, en degres (les verticales convergent un peu). */
const ECART_VERTICALE_DEG = 25;
/** Longueur minimale d'une trace, en part de la hauteur de la photo : une courte ne se courbe pas. */
const LONGUEUR_MIN_PART = 0.1;
/** Une trace plus epaisse que cette part de sa longueur n'est pas une arete (feuillage, tache). */
const EPAISSEUR_MAX_PART = 0.04;
/** Gain minimal (rectitude avant / apres) pour corriger : en deca, le bruit des aretes l'emporte. */
const GAIN_MIN = 1.5;
/** Traces minimales pour conclure. */
const TRACES_MIN = 2;

/** Ce qu'il faut pour passer d'un point de la photo au stenope, et retour. */
export interface ModeleDistorsion {
  k1: number;
  /** Facteur applique a l'image corrigee pour que ses coins tiennent dans le cadre (1 sans barillet). */
  echelle: number;
  cx: number;
  cy: number;
  /** Demi-diagonale de la photo, en pixels : l'unite du rayon. */
  rayon: number;
}

/** Le modele d'une photo de `largeur` x `hauteur` pixels pour un coefficient `k1`. */
export function modeleDistorsion(largeur: number, hauteur: number, k1: number): ModeleDistorsion {
  // Un coin de la photo (r = 1) va en 1 / (1 + k1) : pour un barillet, l'image corrigee deborde
  // d'autant, et on la ramene dans le cadre.
  return { k1, echelle: k1 < 0 ? 1 + k1 : 1, cx: largeur / 2, cy: hauteur / 2, rayon: Math.hypot(largeur, hauteur) / 2 };
}

/** Un point de la photo d'origine, dans l'image corrigee. */
export function corrigerPoint(p: P2, m: ModeleDistorsion): P2 {
  const dx = p.x - m.cx,
    dy = p.y - m.cy;
  const r2 = (dx * dx + dy * dy) / (m.rayon * m.rayon);
  const f = m.echelle / (1 + m.k1 * r2);
  return { x: m.cx + dx * f, y: m.cy + dy * f };
}

/**
 * Le rayon sur la photo d'un point de rayon `ru` sur le stenope (sans l'echelle) : la racine de
 * k1 ru rd^2 - rd + ru = 0 qui tend vers ru quand k1 tend vers 0. Au-dela de ce que le modele atteint
 * (k1 > 0 et ru trop grand), le rayon le plus grand qu'il atteint.
 */
function rayonPhoto(ru: number, k1: number): number {
  if (Math.abs(k1) < 1e-12 || ru < 1e-12) return ru;
  const d = 1 - 4 * k1 * ru * ru;
  if (d <= 0) return 1 / (2 * k1 * ru);
  return (2 * ru) / (1 + Math.sqrt(d));
}

/** Un point de l'image corrigee, sur la photo d'origine (l'inverse de `corrigerPoint`). */
export function distordrePoint(p: P2, m: ModeleDistorsion): P2 {
  const ux = (p.x - m.cx) / m.echelle,
    uy = (p.y - m.cy) / m.echelle;
  const ru = Math.hypot(ux, uy) / m.rayon;
  if (ru < 1e-12) return { x: m.cx, y: m.cy };
  const f = rayonPhoto(ru, m.k1) / ru;
  return { x: m.cx + ux * f, y: m.cy + uy * f };
}

/**
 * L'image corrigee : chaque pixel lu sur la photo d'origine au point que donne le modele, par
 * interpolation bilineaire, les coordonnees bornees a la photo (le bord se prolonge).
 */
export function redresserDistorsion(img: Image, m: ModeleDistorsion): Image {
  const { largeur: L, hauteur: H, donnees: d } = img;
  const sortie = new Uint8ClampedArray(L * H * 4);
  const inv = 1 / m.rayon;
  for (let j = 0; j < H; j++) {
    const uy = (j + 0.5 - m.cy) / m.echelle;
    for (let i = 0; i < L; i++) {
      const ux = (i + 0.5 - m.cx) / m.echelle;
      const ru = Math.hypot(ux, uy) * inv;
      const f = ru < 1e-12 ? 1 : rayonPhoto(ru, m.k1) / ru;
      // Centre du pixel (i, j) a (i + 0.5, j + 0.5) : on revient aux indices pour interpoler.
      const x = Math.min(L - 1, Math.max(0, m.cx + ux * f - 0.5)),
        y = Math.min(H - 1, Math.max(0, m.cy + uy * f - 0.5));
      const x0 = Math.floor(x),
        y0 = Math.floor(y);
      const x1 = Math.min(L - 1, x0 + 1),
        y1 = Math.min(H - 1, y0 + 1);
      const ax = x - x0,
        ay = y - y0;
      const o00 = (y0 * L + x0) * 4,
        o10 = (y0 * L + x1) * 4,
        o01 = (y1 * L + x0) * 4,
        o11 = (y1 * L + x1) * 4;
      const o = (j * L + i) * 4;
      for (let c = 0; c < 4; c++) {
        const haut = (d[o00 + c] as number) * (1 - ax) + (d[o10 + c] as number) * ax;
        const bas = (d[o01 + c] as number) * (1 - ax) + (d[o11 + c] as number) * ax;
        sortie[o + c] = haut * (1 - ay) + bas * ay;
      }
    }
  }
  return { largeur: L, hauteur: H, donnees: sortie };
}

/** Ce que l'estimation a trouve. */
export interface EstimationDistorsion {
  /** Le coefficient retenu ; 0 si la photo n'est pas corrigee. */
  k1: number;
  /** Le meilleur coefficient trouve, meme si le gain ne suffit pas pour corriger. */
  k1Brut: number;
  /** Vrai : assez d'aretes, et nettement plus droites une fois corrigees. */
  fiable: boolean;
  /** Traces presque verticales retenues. */
  aretes: number;
  /** Ecart quadratique moyen des traces retenues a leur droite, en pixels, avant et apres correction. */
  residuAvantPx: number | null;
  residuApresPx: number | null;
}

/** Une trace presque verticale, et sa longueur (pixels) : ce que l'estimation garde. */
interface Arete {
  x: Float64Array;
  y: Float64Array;
  w: Float64Array;
  longueur: number;
}

/** Les moments ponderes d'un nuage de points : petit et grand axe (variances), apres une transformation. */
function axes(a: Arete, versStenope: ((x: number, y: number, sortie: number[]) => void) | null): { petit: number; grand: number; angle: number } {
  const n = a.x.length;
  const xy = [0, 0];
  let W = 0,
    mx = 0,
    my = 0,
    sxx = 0,
    syy = 0,
    sxy = 0;
  for (let q = 0; q < n; q++) {
    let x = a.x[q] as number,
      y = a.y[q] as number;
    if (versStenope) {
      versStenope(x, y, xy);
      x = xy[0] as number;
      y = xy[1] as number;
    }
    const w = a.w[q] as number;
    W += w;
    mx += w * x;
    my += w * y;
    sxx += w * x * x;
    syy += w * y * y;
    sxy += w * x * y;
  }
  if (W <= 0) return { petit: 0, grand: 0, angle: 0 };
  mx /= W;
  my /= W;
  const cxx = sxx / W - mx * mx,
    cyy = syy / W - my * my,
    cxy = sxy / W - mx * my;
  const t = (cxx + cyy) / 2,
    dd = Math.sqrt(Math.max(0, ((cxx - cyy) / 2) ** 2 + cxy * cxy));
  return { petit: Math.max(0, t - dd), grand: t + dd, angle: 0.5 * Math.atan2(2 * cxy, cxx - cyy) };
}

/**
 * La ligne mediane d'une trace presque verticale : pour chaque rangee de pixels, le barycentre de ses
 * points (pondere par le gradient). L'epaisseur de l'arete disparait ainsi de la mesure : sans quoi,
 * la correction qui etire l'image dans le sens radial (un barillet corrige) epaissirait les aretes du
 * bord et paraitrait les rendre moins droites, et l'estimation se tromperait de sens.
 */
function mediane(t: Trace): Arete {
  const n = t.poids.length;
  const rangs = new Map<number, [number, number, number]>();
  for (let q = 0; q < n; q++) {
    const x = t.points[2 * q] as number,
      y = t.points[2 * q + 1] as number,
      w = t.poids[q] as number;
    const k = Math.floor(y / t.pas);
    const r = rangs.get(k);
    if (r) {
      r[0] += w;
      r[1] += w * x;
      r[2] += w * y;
    } else rangs.set(k, [w, w * x, w * y]);
  }
  const m = rangs.size;
  const a: Arete = { x: new Float64Array(m), y: new Float64Array(m), w: new Float64Array(m), longueur: 0 };
  let q = 0;
  for (const [w, wx, wy] of rangs.values()) {
    a.x[q] = wx / w;
    a.y[q] = wy / w;
    a.w[q] = w;
    q++;
  }
  return a;
}

/** Rangees minimales d'une arete : en deca, sa mediane est trop courte pour montrer une courbure. */
const RANGEES_MIN = 8;

/** Les traces presque verticales, longues et fines, d'une photo, reduites a leur ligne mediane. */
function aretesVerticales(traces: readonly Trace[], hauteurPx: number): Arete[] {
  const res: Arete[] = [];
  const tol = (ECART_VERTICALE_DEG * Math.PI) / 180;
  for (const t of traces) {
    const n = t.poids.length;
    const brute: Arete = { x: new Float64Array(n), y: new Float64Array(n), w: new Float64Array(t.poids), longueur: 0 };
    for (let q = 0; q < n; q++) {
      brute.x[q] = t.points[2 * q] as number;
      brute.y[q] = t.points[2 * q + 1] as number;
    }
    const m = axes(brute, null);
    // L'axe principal : angle depuis l'axe des x ; vertical a pi/2 pres.
    const ecart = Math.abs(Math.abs(m.angle) - Math.PI / 2);
    if (ecart > tol) continue;
    // Une distribution uniforme sur une longueur L a une variance de L^2 / 12.
    const longueur = Math.sqrt(12 * m.grand);
    if (longueur < LONGUEUR_MIN_PART * hauteurPx) continue;
    if (Math.sqrt(m.petit) > EPAISSEUR_MAX_PART * longueur) continue;
    const a = mediane(t);
    if (a.x.length < RANGEES_MIN) continue;
    a.longueur = longueur;
    res.push(a);
  }
  return res;
}

/** La transformation vers le stenope pour un k1 (sans l'echelle, qui ne change pas la rectitude). */
function versStenopeDe(cx: number, cy: number, rayon: number, k1: number) {
  const inv2 = 1 / (rayon * rayon);
  return (x: number, y: number, s: number[]) => {
    const dx = x - cx,
      dy = y - cy;
    const f = 1 / (1 + k1 * (dx * dx + dy * dy) * inv2);
    s[0] = cx + dx * f;
    s[1] = cy + dy * f;
  };
}

/**
 * La courbure d'un ensemble d'aretes pour un k1 : pour chacune, le rapport petit axe / grand axe de sa
 * mediane corrigee (insensible a l'echelle), ramene en pixels^2 par le carre de sa longueur sur la
 * photo, et pondere par cette longueur. Une longue arete pres du bord, la ou la courbure se voit,
 * pese donc bien plus qu'un tableau de fenetre au centre.
 */
function courbure(aretes: readonly Arete[], cx: number, cy: number, rayon: number, k1: number): number {
  const f = versStenopeDe(cx, cy, rayon, k1);
  let s = 0;
  for (const a of aretes) {
    const m = axes(a, f);
    if (m.grand > 0) s += a.longueur ** 3 * (m.petit / m.grand);
  }
  return s;
}

/** Le k1 qui minimise la courbure : une grille au pas de 0,005, puis une section doree autour du meilleur. */
function minimiser(aretes: readonly Arete[], cx: number, cy: number, rayon: number): number {
  const c = (k: number) => courbure(aretes, cx, cy, rayon, k);
  let best = 0,
    vBest = c(0);
  for (let k = K1_MIN; k <= K1_MAX + 1e-9; k += 0.005) {
    const v = c(k);
    if (v < vBest) {
      vBest = v;
      best = k;
    }
  }
  let a = Math.max(K1_MIN, best - 0.005),
    b = Math.min(K1_MAX, best + 0.005);
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = b - g * (b - a),
    x2 = a + g * (b - a);
  let f1 = c(x1),
    f2 = c(x2);
  for (let i = 0; i < 20; i++) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = b - g * (b - a);
      f1 = c(x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = a + g * (b - a);
      f2 = c(x2);
    }
  }
  const k = (a + b) / 2;
  return c(k) <= vBest ? k : best;
}

/** Ecart quadratique moyen des aretes a leur droite, en pixels (pondere par leur longueur). */
function residu(aretes: readonly Arete[], cx: number, cy: number, rayon: number, k1: number): number | null {
  if (!aretes.length) return null;
  const f = versStenopeDe(cx, cy, rayon, k1);
  let s = 0,
    L = 0;
  for (const a of aretes) {
    s += a.longueur * axes(a, f).petit;
    L += a.longueur;
  }
  return Math.sqrt(s / L);
}

export interface OptionsDistorsion {
  /** Les traces deja detectees (le banc les reutilise). */
  traces?: Trace[];
  /** Une estimation deja faite sur cette photo (le banc la montre, puis corrige avec elle). */
  estimation?: EstimationDistorsion;
}

/**
 * Le coefficient de distorsion d'une photo, estime sur ses aretes presque verticales. `k1` vaut 0 si
 * l'estimation n'est pas fiable (trop peu d'aretes, ou pas nettement plus droites une fois corrigees).
 */
export function estimerDistorsion(img: Image, o: OptionsDistorsion = {}): EstimationDistorsion {
  const traces = o.traces ?? detecterTraces(img, { pixelsMin: 20 });
  const cx = img.largeur / 2,
    cy = img.hauteur / 2,
    rayon = Math.hypot(img.largeur, img.hauteur) / 2;
  let aretes = aretesVerticales(traces, img.hauteur);
  const rien: EstimationDistorsion = { k1: 0, k1Brut: 0, fiable: false, aretes: aretes.length, residuAvantPx: residu(aretes, cx, cy, rayon, 0), residuApresPx: null };
  if (aretes.length < TRACES_MIN) return rien;
  let k = minimiser(aretes, cx, cy, rayon);
  // Les traces qui restent courbes au meilleur k1 ne sont pas des droites du monde : on les ecarte, et
  // l'on recommence sur les autres. Le seuil suit l'epaisseur ordinaire d'une arete (la mediane).
  const f = versStenopeDe(cx, cy, rayon, k);
  const ecarts = aretes.map((a) => Math.sqrt(axes(a, f).petit));
  const med = [...ecarts].sort((a, b) => a - b)[Math.floor(ecarts.length / 2)] as number;
  const gardees = aretes.filter((_, i) => (ecarts[i] as number) <= Math.max(2.5 * med, 1));
  if (gardees.length < aretes.length && gardees.length >= TRACES_MIN) {
    aretes = gardees;
    k = minimiser(aretes, cx, cy, rayon);
  }
  const avant = courbure(aretes, cx, cy, rayon, 0),
    apres = courbure(aretes, cx, cy, rayon, k);
  const fiable = aretes.length >= TRACES_MIN && Math.abs(k) >= K1_NEGLIGEABLE && avant >= GAIN_MIN * apres;
  return {
    k1: fiable ? k : 0,
    k1Brut: k,
    fiable,
    aretes: aretes.length,
    residuAvantPx: residu(aretes, cx, cy, rayon, 0),
    residuApresPx: residu(aretes, cx, cy, rayon, k),
  };
}

/** Une photo corrigee de la distorsion, et ce qui permet d'y ramener les points de l'originale. */
export interface PhotoCorrigee {
  image: Image;
  modele: ModeleDistorsion;
  estimation: EstimationDistorsion;
}

/** Vrai : a cette focale equivalente, la photo est examinee (et corrigee si ses aretes le demandent). */
export function grandAngleACorriger(focale35: number | null | undefined): boolean {
  return typeof focale35 === 'number' && focale35 > 0 && focale35 < FOCALE_GRAND_ANGLE_MM;
}

/**
 * La preparation d'une photo (spec §4) pour la distorsion : `null` au-dela de 20 mm, ou si les aretes
 * ne demandent pas de correction ; sinon l'image corrigee et son modele.
 */
export function corrigerDistorsion(img: Image, focale35: number | null | undefined, o: OptionsDistorsion = {}): PhotoCorrigee | null {
  if (!grandAngleACorriger(focale35)) return null;
  const estimation = o.estimation ?? estimerDistorsion(img, o);
  if (!estimation.fiable) return null;
  const modele = modeleDistorsion(img.largeur, img.hauteur, estimation.k1);
  return { image: redresserDistorsion(img, modele), modele, estimation };
}

/** La focale equivalente 24 x 36 d'une focale en pixels : le grand cote de l'image vaut 36 mm. */
export function focale35DePixels(focalePx: number, largeur: number, hauteur: number): number {
  return (focalePx * 36) / Math.max(largeur, hauteur);
}
