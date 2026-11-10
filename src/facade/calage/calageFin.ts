// Le calage fin d'une photo de facade : trouver le mur dans l'image (MD/spec-facades-calage-detection.md
// §6, lot L7).
//
// Le calage grossier (calage.ts) projette le mur depuis la prise de vue ; avec une boussole a 5 degres
// et un GPS a 2 m, ses coins tombent a un ou deux metres des vrais. Il donne pourtant ce qu'il faut pour
// chercher : une zone par coin, et l'orientation approchee du telephone. Le calage fin cherche alors
// les aretes du mur dans la photo :
//
// 1. les **segments** de droite (segments.ts) ;
// 2. les **points de fuite** (pointsFuite.ts) : le vertical corrige l'inclinaison et le roulis, dans
//    leurs bornes ; l'horizontal du mur corrige l'azimut, dans celles de la boussole ;
// 3. les **aretes** candidates : les droites verticales (qui visent le point vertical) pres des cotes
//    prevus, les droites qui visent le point horizontal pres de l'egout et du pied prevus. S'y ajoutent
//    la droite qui joint les bouts hauts (ou bas) des deux cotes - sur un pignon, l'egout n'est pas une
//    arete, c'est la ou les cotes cessent d'etre verticaux - et l'egout et le pied **predits** : le
//    telephone tenu a 1,5 m, la camera placee par les deux cotes trouves et la largeur du plan. Le pied
//    est souvent cache (voiture, haie, cloture) : predit, il est marque comme tel ;
// 4. chaque quadrilatere candidat recoit une **note** : le soutien des segments sur ses quatre cotes,
//    l'accord avec le plan (la largeur est connue, la hauteur doit rester a 25 % de celle du modele),
//    l'accord avec la prise de vue (la distance de ses coins aux coins predits, rapportee a leur zone).
//    Le meilleur est garde si sa note passe le seuil ; sinon on revient aux coins predits, et
//    l'utilisateur les pose comme avant.
//
// Ce qui est rendu : les coins et leur source (`trouve` ou `predit`), l'attitude et l'azimut corriges,
// la distance au mur, la hauteur mesuree, et, quand une distance independante le permet, l'ecart entre
// la largeur vue et celle du plan : au-dela de 0,5 m, le contour BD TOPO est sans doute decale
// (`contour.decale`) et l'on ne tord pas la facade pour le faire entrer.
//
// Tout est pur, sans DOM : le meme code tourne dans le banc (Node), dans un worker ou dans la page.

import type { Image, P2 } from '../vision/homographie.js';
import { rapportRectangle } from '../vision/homographie.js';
import { detecterSegments, type Segment } from '../vision/segments.js';
import { pointFuiteVertical, azimutParPointFuite, ecartAuPoint, pointDeFuite, directionDuMur, TOLERANCE_FINE_DEG } from '../vision/pointsFuite.js';
import { OEIL_M, calageGrossier, coinsPredits, ecartSigne, incertitudeDe, incertitudeDuReleve, priseVisantLeMilieu, projeterPoint, repereCamera, type Incertitude, type MurVu, type PriseDeVue, type PriseReleve, type V3, type ZoneRecherche } from './calage.js';
import { mediane } from '../../util/stats.js';

/**
 * D'ou vient un coin : trouve sur les aretes de la photo, predit par la prise de vue, propose par
 * Claude puis rattache a un croisement de segments (detection/recalageIa.ts), ou pose au doigt.
 */
export type SourceCoin = 'trouve' | 'predit' | 'claude' | 'doigt';

/** Note minimale d'une hypothese pour que ses coins soient proposes comme trouves. */
export const SEUIL_NOTE = 0.5;
/** Part minimale d'un cote couverte par des segments pour qu'il compte comme une arete vue. */
export const COUVERTURE_MIN = 0.3;
/** L'avis du releve (§6.0) : une hauteur a plus de 25 % de celle du modele est suspecte. */
export const ECART_HAUTEUR_MAX = 0.25;
/** En deca, l'ecart a la hauteur du modele ne dit rien : la BD TOPO n'est pas plus precise. */
const ECART_HAUTEUR_SUR = 0.1;
/** Au-dela, la largeur vue sur la photo ne s'accorde avec le plan qu'en decalant le mur. */
export const DECALAGE_CONTOUR_M = 0.5;
/** Marge sur l'incertitude de la position : un GPS annonce un rayon a 68 %, une boussole se trompe parfois plus. */
const MARGE_POSITION = 1.5;
/**
 * Aretes candidates gardees par cote, des mieux soutenues aux moins bien. Plus au-dessus et au-dessous :
 * les rangs d'une couverture, un bandeau ou une cloture font autant de longues horizontales que l'egout.
 */
const CANDIDATS_PAR_COTE = 4;
const CANDIDATS_EN_TRAVERS = 8;
/**
 * Poids de la note : soutien des segments, accord avec le plan, accord avec la prise de vue, et
 * hauteur de l'objectif que suppose le quadrilatere.
 */
const POIDS = { soutien: 0.5, plan: 0.2, prise: 0.15, oeil: 0.15 };
/**
 * Ecart type de la hauteur de l'objectif autour de 1,5 m : on tient le telephone entre 1,2 et 1,7 m,
 * et le pied du mur n'est pas toujours au niveau du trottoir.
 */
const ECART_OEIL_M = 0.6;
/**
 * Un egout ne coupe pas le mur : les deux cotes du mur s'arretent a lui. Une horizontale que les deux cotes depassent vers le haut de plus
 * que cette part de leur hauteur, et dont le dessus a encore la teinte du mur, est une ligne dans le mur (les linteaux d'un etage, le bas
 * d'un pignon), pas son egout. Scene 24 du banc : les linteaux de l'etage, 48 cm sous l'egout d'un pignon, l'emportaient sur l'egout (sous
 * un pignon, l'egout n'est pas une arete : le mur continue au-dessus) ; leurs cotes montaient 32 px plus haut.
 */
const COTES_AU_DESSUS_PART = 0.04;
/** Au-dela de cet ecart de chromaticite du dessus au mur (`Contraste.autre`), le dessus de l'horizontale n'est plus le mur. */
const AUTRE_AU_DESSUS_MAX = 0.5;
/**
 * La limite d'une ombre portee sur le mur (`Contraste.ombre`) : un troncon dont le dedans ressemble au mur au moins a cette part, le dehors
 * de la meme chromaticite a cet ecart pres, et plus sombre que le dedans de cette part au moins (le debord des scenes 05, 25 et 26 l'assombrit
 * a 0,8). Une moitie des troncons qui longent le mur suffit a dire la ligne une limite d'ombre.
 */
const OMBRE_SEMBLABLE_MIN = 0.5;
const OMBRE_CHROMA_MAX = 0.05;
const OMBRE_LUMIERE_MAX = 0.9;
const OMBRE_PART_MIN = 0.5;
/**
 * La droite qui joint les hauts des deux cotes reste l'egout tant qu'elle ne s'ecarte pas de l'horizontale du mur de plus que cet angle :
 * le point de fuite horizontal n'est sur qu'a un degre pres quand la boussole est gardee (scene 11 : 0,9 degre). Une rampe en fait 15.
 * Sans boussole ni point de fuite lu sur la photo, l'horizontale n'est pas connue (la scene 22 importee, sans capteurs : 3,7 degres) :
 * la droite des deux hauts reste, comme avant.
 */
const PENTE_EGOUT_BOUTS_DEG = 3;

export interface EntreeCalageFin {
  image: Image;
  mur: MurVu;
  prise: PriseDeVue;
  incertitude?: Incertitude;
  /**
   * La prise recalee sur une attitude et un azimut corriges. Par defaut, seuls les angles changent ;
   * le releve, qui suppose que l'on vise le milieu du mur, replace aussi l'objectif (calage.ts).
   */
  recaler?: (a: { azimutDeg: number; inclinaisonDeg: number; roulisDeg: number }) => PriseDeVue;
  /**
   * Une distance au milieu du mur mesuree independamment du plan (realite augmentee, GPS), et sa
   * precision en metres : elle seule permet de dire si la largeur vue s'accorde avec le plan.
   */
  distance?: { valeur: number; precisionM: number } | null;
  /** Les segments deja detectes (le banc les reutilise). */
  segments?: Segment[];
  /**
   * Faux : l'azimut de la prise n'a pas ete mesure (une photo importee, sans boussole) ; le point de fuite horizontal n'est alors connu
   * que s'il se lit sur la photo. Par defaut, il l'a ete.
   */
  capConnu?: boolean;
}

export interface CalageFin {
  /** Haut gauche, haut droit, bas droit, bas gauche ; `null` si le mur ne se projette pas. */
  coins: P2[] | null;
  sources: SourceCoin[];
  /** Note de l'hypothese retenue, de 0 a 1 ; 0 sans hypothese. */
  note: number;
  /** Vrai : la note passe le seuil, les coins viennent de la photo (au moins en partie). */
  trouve: boolean;
  inclinaisonDeg: number;
  roulisDeg: number;
  azimutDeg: number;
  /** Faux : la boussole n'a pas pu etre corrigee (point de fuite horizontal trop flou), l'azimut est celui mesure. */
  azimutCorrige: boolean;
  /** Distance horizontale de l'objectif au milieu du mur, d'apres les deux cotes trouves et la largeur du plan. */
  distance: number | null;
  /** Hauteur du mur d'apres la perspective des coins rendus et la largeur du plan. */
  hauteur: number | null;
  /** L'ecart entre la largeur vue et celle du plan, quand une distance mesuree le permet. */
  contour: { ecartM: number; incertitudeM: number; decale: boolean } | null;
  /** Ce qui a servi, pour les images de controle du banc. */
  detail: { segments: Segment[]; zones: ZoneRecherche[]; predits: P2[] | null; lignes: Ligne[] };
}

/* ------------------------------------------------------------------------------------------------
 * Droites de la photo
 * --------------------------------------------------------------------------------------------- */

/** Une droite a x + b y + c = 0, normee (a^2 + b^2 = 1). */
export interface Ligne {
  a: number;
  b: number;
  c: number;
}

function normer(a: number, b: number, c: number): Ligne | null {
  const n = Math.hypot(a, b);
  return n > 1e-12 ? { a: a / n, b: b / n, c: c / n } : null;
}

/** La droite par deux points. */
export function ligneParPoints(p: P2, q: P2): Ligne | null {
  return normer(p.y - q.y, q.x - p.x, p.x * q.y - q.x * p.y);
}

/** La droite par un point et un point de fuite homogene (eventuellement a l'infini). */
function ligneParFuite(p: P2, v: V3): Ligne | null {
  // p x v, avec p = (x, y, 1).
  return normer(p.y * v[2] - v[1], v[0] - p.x * v[2], p.x * v[1] - p.y * v[0]);
}

export function intersection(l: Ligne, m: Ligne): P2 | null {
  const d = l.a * m.b - l.b * m.a;
  if (Math.abs(d) < 1e-9) return null;
  return { x: (l.b * m.c - l.c * m.b) / d, y: (l.c * m.a - l.a * m.c) / d };
}

const distanceA = (l: Ligne, p: P2) => Math.abs(l.a * p.x + l.b * p.y + l.c);

/** La droite des moindres carres totaux par des points ponderes. */
function ajuster(points: { p: P2; w: number }[]): Ligne | null {
  let W = 0,
    mx = 0,
    my = 0;
  for (const { p, w } of points) {
    W += w;
    mx += w * p.x;
    my += w * p.y;
  }
  if (!(W > 0)) return null;
  mx /= W;
  my /= W;
  let cxx = 0,
    cyy = 0,
    cxy = 0;
  for (const { p, w } of points) {
    cxx += w * (p.x - mx) ** 2;
    cyy += w * (p.y - my) ** 2;
    cxy += w * (p.x - mx) * (p.y - my);
  }
  const ang = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  // La normale est perpendiculaire a l'axe principal.
  return normer(-Math.sin(ang), Math.cos(ang), Math.sin(ang) * mx - Math.cos(ang) * my);
}

/* ------------------------------------------------------------------------------------------------
 * Aretes candidates
 * --------------------------------------------------------------------------------------------- */

/** Une arete candidate : sa droite, les segments qui la portent, et d'ou elle vient. */
interface Arete {
  ligne: Ligne;
  segments: Segment[];
  soutien: number;
  nature: 'aretes' | 'bouts' | 'predite';
  /** Les bouts de ses segments le long de la droite : le plus haut et le plus bas (aretes verticales). */
  haut?: P2;
  bas?: P2;
}

const milieu = (g: Segment): P2 => ({ x: (g.x1 + g.x2) / 2, y: (g.y1 + g.y2) / 2 });

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const reunion = (a: Rect, b: Rect): Rect => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
const elargir = (r: Rect, m: number): Rect => ({ x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m });
const dans = (r: Rect, p: P2) => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;

/**
 * Regroupe les segments qui visent `v` en droites : deux segments sont sur la meme si leurs droites
 * par `v` coupent la ligne de reference (`couper`) a moins de `tol` pixels. Chaque groupe est ajuste
 * librement (moindres carres sur les bouts, ponderes par la longueur) : une longue arete se place
 * mieux par ses pixels que par un point de fuite estime.
 */
function grouper(segs: Segment[], v: V3, couper: (l: Ligne) => number | null, tol: number, verticale: boolean): Arete[] {
  const groupes: { param: number; segs: Segment[] }[] = [];
  for (const g of [...segs].sort((a, b) => b.longueur - a.longueur)) {
    const l = ligneParFuite(milieu(g), v);
    const k = l ? couper(l) : null;
    if (k === null || !Number.isFinite(k)) continue;
    const gr = groupes.find((x) => Math.abs(x.param - k) < tol);
    if (gr) gr.segs.push(g);
    else groupes.push({ param: k, segs: [g] });
  }
  const res: Arete[] = [];
  for (const gr of groupes) {
    const ligne = ajuster(gr.segs.flatMap((g) => [{ p: { x: g.x1, y: g.y1 }, w: g.longueur }, { p: { x: g.x2, y: g.y2 }, w: g.longueur }]));
    if (!ligne) continue;
    const a: Arete = { ligne, segments: gr.segs, soutien: gr.segs.reduce((s, g) => s + g.longueur, 0), nature: 'aretes' };
    if (verticale) {
      const bouts = gr.segs.flatMap((g) => [{ x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 }]);
      let haut = bouts[0],
        bas = bouts[0];
      for (const p of bouts) {
        if (haut && p.y < haut.y) haut = p;
        if (bas && p.y > bas.y) bas = p;
      }
      // Ramenes sur la droite ajustee.
      const proj = (p: P2): P2 => {
        const d = ligne.a * p.x + ligne.b * p.y + ligne.c;
        return { x: p.x - d * ligne.a, y: p.y - d * ligne.b };
      };
      if (haut) a.haut = proj(haut);
      if (bas) a.bas = proj(bas);
    }
    res.push(a);
  }
  return res.sort((x, y) => y.soutien - x.soutien);
}

/**
 * La part du cote [a, b] couverte par des segments poses sur sa droite (leurs deux bouts a moins de
 * `tol` pixels), de 0 a 1.
 */
function couverture(l: Ligne, a: P2, b: P2, segs: readonly Segment[], tol: number): number {
  const ux = b.x - a.x,
    uy = b.y - a.y;
  const L2 = ux * ux + uy * uy;
  if (!(L2 > 0)) return 0;
  const intervalles: [number, number][] = [];
  for (const g of segs) {
    const p = { x: g.x1, y: g.y1 },
      q = { x: g.x2, y: g.y2 };
    if (distanceA(l, p) > tol || distanceA(l, q) > tol) continue;
    let t0 = ((p.x - a.x) * ux + (p.y - a.y) * uy) / L2,
      t1 = ((q.x - a.x) * ux + (q.y - a.y) * uy) / L2;
    if (t0 > t1) [t0, t1] = [t1, t0];
    t0 = Math.max(0, t0);
    t1 = Math.min(1, t1);
    if (t1 > t0) intervalles.push([t0, t1]);
  }
  intervalles.sort((x, y) => x[0] - y[0]);
  let total = 0,
    fin = 0;
  for (const [d, f] of intervalles) {
    if (f <= fin) continue;
    total += f - Math.max(d, fin);
    fin = f;
  }
  return total;
}

/* ------------------------------------------------------------------------------------------------
 * Geometrie de la prise
 * --------------------------------------------------------------------------------------------- */

/**
 * La direction horizontale (dans le monde) du plan vertical qui passe par l'objectif et une droite
 * verticale de la photo : le relevement de cette arete depuis l'objectif.
 */
function relevement(p: PriseDeVue, l: Ligne): [number, number] | null {
  const s = repereCamera(p);
  // Normale du plan objectif-droite, dans le repere de l'image puis dans le monde : K^T l.
  const nc: V3 = [s.f * l.a, s.f * l.b, s.cx * l.a + s.cy * l.b + l.c];
  const nw: V3 = [0, 1, 2].map((k) => nc[0] * (s.droite[k] ?? 0) + nc[1] * (s.bas[k] ?? 0) + nc[2] * (s.avant[k] ?? 0)) as V3;
  // Direction horizontale dans ce plan : n x haut.
  let bx = nw[1],
    by = -nw[0];
  const n = Math.hypot(bx, by);
  if (n < 1e-9) return null;
  bx /= n;
  by /= n;
  if (bx * s.avant[0] + by * s.avant[1] < 0) [bx, by] = [-bx, -by];
  return [bx, by];
}

/**
 * L'objectif place par les deux cotes trouves : les relevements des deux bouts du mur se coupent la ou
 * il se tenait (la largeur du plan fait l'echelle). `null` si les relevements sont presque paralleles.
 */
function trianguler(p: PriseDeVue, m: MurVu, gauche: Ligne, droite: Ligne): { x: number; y: number } | null {
  const bL = relevement(p, gauche),
    bR = relevement(p, droite);
  if (!bL || !bR) return null;
  // gauche - lambda bL = droite - mu bR  =>  lambda bL - mu bR = gauche - droite.
  const ex = m.gauche.x - m.droite.x,
    ey = m.gauche.y - m.droite.y;
  const det = bL[0] * -bR[1] - -bR[0] * bL[1];
  if (Math.abs(det) < 1e-6) return null;
  const lambda = (ex * -bR[1] - -bR[0] * ey) / det,
    mu = (bL[0] * ey - bL[1] * ex) / det;
  if (!(lambda > 0) || !(mu > 0)) return null;
  return { x: m.gauche.x - lambda * bL[0], y: m.gauche.y - lambda * bL[1] };
}

/**
 * La largeur du mur vue sur la photo, a une distance donnee de l'objectif a son milieu : les relevements
 * des deux cotes, rapportes a la normale du mur, fixent les bouts a cette distance.
 */
function largeurVue(p: PriseDeVue, m: MurVu, gauche: Ligne, droite: Ligne, distance: number): number | null {
  const bL = relevement(p, gauche),
    bR = relevement(p, droite);
  if (!bL || !bR) return null;
  const L = Math.hypot(m.droite.x - m.gauche.x, m.droite.y - m.gauche.y) || 1;
  const D = [(m.droite.x - m.gauche.x) / L, (m.droite.y - m.gauche.y) / L];
  // Normale vers le mur depuis la rue : le cote ou regarde l'objectif.
  let N = [-(D[1] ?? 0), D[0] ?? 0];
  if ((N[0] ?? 0) * bL[0] + (N[1] ?? 0) * bL[1] < 0) N = [-(N[0] ?? 0), -(N[1] ?? 0)];
  const tan = (b: [number, number]) => {
    const c = b[0] * (N[0] ?? 0) + b[1] * (N[1] ?? 0),
      s = b[0] * (D[0] ?? 0) + b[1] * (D[1] ?? 0);
    return c > 1e-6 ? s / c : null;
  };
  const tL = tan(bL),
    tR = tan(bR);
  if (tL === null || tR === null || !(tR > tL)) return null;
  const perp = distance / Math.hypot(1, (tL + tR) / 2);
  return perp * (tR - tL);
}

/* ------------------------------------------------------------------------------------------------
 * Les hypotheses
 * --------------------------------------------------------------------------------------------- */

/** Ce qui sert a noter une hypothese, le meme pour toutes. */
interface Contexte {
  image: Image;
  mur: MurVu;
  /** La prise recalee sur l'attitude et l'azimut lus sur les points de fuite. */
  prise: PriseDeVue;
  repere: ReturnType<typeof repereCamera>;
  /** Les coins predits par cette prise, et le rayon de la zone de recherche de chacun. */
  predits: P2[];
  rayons: number[];
  verticaux: Segment[];
  horizontaux: Segment[];
  horizon: Ligne | null;
  vV: V3;
  /** Le point de fuite des horizontales du mur : un egout le vise. */
  vH: V3;
  /** Le point de fuite horizontal est-il connu (lu sur la photo, ou la boussole mesuree) ? Sinon, il n'est qu'une supposition. */
  vHConnu: boolean;
  tol: number;
  largeur: number;
  /**
   * Jusqu'ou l'objectif place par les deux cotes peut s'ecarter de la position de la prise : son
   * incertitude, avec de la marge. Au-dela, la paire de cotes n'est pas celle du mur (une fenetre, un
   * voisin) : sur une photo sans distance, une baie a les proportions d'une facade.
   */
  rayonPosition: number;
}

/** Une hypothese notee : ses coins, leur source, ses quatre droites (gauche, droite, egout, pied). */
interface Hypothese {
  note: number;
  coins: P2[];
  sources: SourceCoin[];
  lignes: Ligne[];
  gauche: Arete;
  droite: Arete;
  hauteur: number;
}

/**
 * La note d'un quadrilatere fait de quatre aretes, ou `null` s'il n'est pas un mur possible (croise,
 * concave, ou d'une hauteur a plus de 25 % de celle du modele).
 */
function noter(ctx: Contexte, G: Arete, D: Arete, Eg: Arete, Fp: Arete): Hypothese | null {
  const hg = intersection(G.ligne, Eg.ligne),
    hd = intersection(D.ligne, Eg.ligne),
    bd = intersection(D.ligne, Fp.ligne),
    bg = intersection(G.ligne, Fp.ligne);
  if (!hg || !hd || !bd || !bg) return null;
  const q = [hg, hd, bd, bg];
  if (!(hg.x < hd.x && bg.x < bd.x && hg.y < bg.y && hd.y < bd.y) || !convexe(q)) return null;
  // Accord avec le plan : la hauteur par la perspective, la largeur du plan donnant l'echelle.
  const r = rapportRectangle(q, ctx.repere.f, ctx.repere.cx, ctx.repere.cy);
  if (!r) return null;
  const h = ctx.largeur / r;
  const ecart = Math.abs(h / ctx.mur.hauteur - 1);
  if (!(ecart <= ECART_HAUTEUR_MAX)) return null;
  const { tol, verticaux, horizontaux } = ctx;
  const cG = couverture(G.ligne, hg, bg, verticaux, tol),
    cD = couverture(D.ligne, hd, bd, verticaux, tol);
  let cE = couverture(Eg.ligne, hg, hd, horizontaux, tol),
    cF = couverture(Fp.ligne, bg, bd, horizontaux, tol);
  // Un egout (ou un pied) par les bouts des cotes vaut la moitie d'une arete vue : les deux
  // cotes s'arretent la, ce qui est un indice, pas une preuve.
  if (Eg.nature === 'bouts' && cG >= COUVERTURE_MIN && cD >= COUVERTURE_MIN) cE = Math.max(cE, 0.5);
  if (Fp.nature === 'bouts' && cG >= COUVERTURE_MIN && cD >= COUVERTURE_MIN) cF = Math.max(cF, 0.5);
  // Chaque cote doit aussi separer le mur d'autre chose (ciel, toit, sol, voisin) : un rang
  // d'ardoises, ou l'horizon vu a travers le mur, ont la meme teinte des deux cotes. Et le dedans de
  // chaque cote doit ressembler au mur : un egout pris au faite d'une bande de tuiles a du toit sous
  // lui. Le pied en est dispense, une voiture ou une haie le cachent souvent.
  const centre = { x: (hg.x + hd.x + bd.x + bg.x) / 4, y: (hg.y + hd.y + bd.y + bg.y) / 4 };
  const teinte = teinteDuMur(ctx.image, q);
  // Un cote dont le dedans n'est pas du mur n'est pas une arete du mur, si nette soit-elle : son
  // soutien est pondere par cette ressemblance.
  // Et un cote dont le dehors a la teinte du mur (la limite d'une ombre portee sur le mur, sous le
  // debord) le borde moins surement qu'un cote qui s'ouvre sur le toit ou le ciel.
  const cote = (c: number, k: Contraste) => ((c + k.ecart) / 2) * k.semblable * (0.5 + 0.5 * k.autre);
  let kE = contraste(ctx.image, hg, hd, centre, teinte);
  // Un egout lu sur les aretes (ou predit) que les deux cotes depassent, le mur au-dessus de lui : une ligne dans le mur, pas l'egout
  // (COTES_AU_DESSUS_PART). L'egout par les bouts des cotes en est dispense : il est la ou ils s'arretent.
  if (Eg.nature !== 'bouts' && kE.autre < AUTRE_AU_DESSUS_MAX && auDessus(G, hg, bg) && auDessus(D, hd, bd)) return null;
  // Un egout lu sur les aretes ou predit qui borde, la ou il longe le mur, une bande du meme mur plus sombre au-dessus de lui : la limite
  // de l'ombre du debord, l'egout est au-dessus d'elle. Quand le mur est partout sous l'egout, sa teinte et ses cotes l'ecartent deja
  // (scenes 05 et 25) ; quand la partie haute est plus etroite que les parties basses (scene 26), les cotes, ciel des deux bords au-dessus
  // des parties basses, gagnaient a un egout plus bas, et la limite de l'ombre l'emportait (25 cm sous l'egout, 2,1 % de la largeur).
  if (Eg.nature !== 'bouts' && kE.ombre >= OMBRE_PART_MIN) return null;
  // Un egout sous une bande peinte que le mur surmonte (un bandeau vert sous le pignon de l'etalon 27) : le bas de la bande, pas l'egout.
  // Au-dessus de lui, une autre matiere sur moins de BANDE_PART_MAX du cote, puis de nouveau le mur. Sous un egout, le toit ou le ciel
  // continuent ; sous un pignon, le mur commence aussitot (la regle d'avant). Les bouts des cotes s'arretent souvent au bas de la bande.
  const coteMin = Math.min(Math.hypot(bg.x - hg.x, bg.y - hg.y), Math.hypot(bd.x - hd.x, bd.y - hd.y));
  if (bandeContreLeMur(ctx.image, hg, hd, centre, teinte, coteMin) !== null) return null;
  if (Eg.nature === 'bouts' && bandeContreLeMur(ctx.image, hg, hd, centre, teinte, coteMin, false, true) !== null) return null;
  // Et sous l'egout, la meme bande (le bandeau juste sous le vrai egout) : le dedans se juge sous elle, la ou le mur reprend.
  const sousBande = kE.semblable < 1 ? bandeContreLeMur(ctx.image, hg, hd, centre, teinte, coteMin, true) : null;
  if (sousBande !== null) {
    const dx = (bg.x - hg.x) / Math.hypot(bg.x - hg.x, bg.y - hg.y), dy = (bg.y - hg.y) / Math.hypot(bg.x - hg.x, bg.y - hg.y);
    const ex = (bd.x - hd.x) / Math.hypot(bd.x - hd.x, bd.y - hd.y), ey = (bd.y - hd.y) / Math.hypot(bd.x - hd.x, bd.y - hd.y);
    const k = contraste(ctx.image, { x: hg.x + dx * sousBande, y: hg.y + dy * sousBande }, { x: hd.x + ex * sousBande, y: hd.y + ey * sousBande }, centre, teinte);
    kE = { ...kE, semblable: Math.max(kE.semblable, k.semblable) };
  }
  const soutien =
    (cote(cG, contraste(ctx.image, bg, hg, centre, teinte)) +
      cote(cD, contraste(ctx.image, hd, bd, centre, teinte)) +
      cote(cE, kE) +
      cote(cF, contraste(ctx.image, bd, bg, centre, null))) /
    4;
  // La hauteur du modele (BD TOPO) n'est sure qu'a 10 % pres : en deca, toutes les hauteurs se valent ;
  // au-dela, l'accord decroit jusqu'a 25 %.
  const plan = ecart <= ECART_HAUTEUR_SUR ? 1 : 1 - (ecart - ECART_HAUTEUR_SUR) / (ECART_HAUTEUR_MAX - ECART_HAUTEUR_SUR);
  let prise = 0;
  q.forEach((c, k) => {
    const pr = ctx.predits[k],
      rk = ctx.rayons[k] ?? 1;
    if (pr) prise += Math.exp(-((Math.hypot(c.x - pr.x, c.y - pr.y) / rk) ** 2)) / 4;
  });
  // La hauteur de l'objectif que suppose ce quadrilatere : sur chaque cote, l'horizon coupe le mur
  // a hauteur d'oeil. Un « pied » pris sur l'horizon lui-meme (la limite du gazon et du ciel
  // derriere le mur) supposerait un objectif pose au sol.
  const oeils = [oeilSurCote(bg, hg, ctx.horizon, ctx.vV, h), oeilSurCote(bd, hd, ctx.horizon, ctx.vV, h)].filter((x): x is number => x !== null);
  const oeil = oeils.length ? oeils.reduce((a, b) => a + b, 0) / oeils.length : null;
  const accordOeil = oeil === null ? 0 : Math.exp(-(((oeil - (ctx.prise.oeil ?? OEIL_M)) / ECART_OEIL_M) ** 2));
  const note = POIDS.soutien * soutien + POIDS.plan * plan + POIDS.prise * prise + POIDS.oeil * accordOeil;
  const vu = (c: number, a: Arete) => c >= COUVERTURE_MIN || (a.nature === 'bouts' && c >= 0.5);
  const okG = cG >= COUVERTURE_MIN,
    okD = cD >= COUVERTURE_MIN;
  const sources: SourceCoin[] = [okG && vu(cE, Eg), okD && vu(cE, Eg), okD && vu(cF, Fp), okG && vu(cF, Fp)].map((t) => (t ? 'trouve' : 'predit'));
  return { note, coins: q, sources, lignes: [G.ligne, D.ligne, Eg.ligne, Fp.ligne], gauche: G, droite: D, hauteur: h };
}

/** Le haut des segments d'un cote (`haut`) depasse-t-il son coin du haut `h` (le bas `b`) de plus de COTES_AU_DESSUS_PART du cote ? */
function auDessus(A: Arete, h: P2, b: P2): boolean {
  if (!A.haut) return false;
  const L = Math.hypot(b.x - h.x, b.y - h.y);
  // Le long du cote, du coin du haut vers le haut (oppose au bas).
  const t = L > 0 ? ((A.haut.x - h.x) * (h.x - b.x) + (A.haut.y - h.y) * (h.y - b.y)) / L : 0;
  return t > COTES_AU_DESSUS_PART * L;
}

/**
 * La meilleure hypothese : chaque paire de cotes, avec chaque egout et chaque pied candidats, plus
 * ceux que cette paire predit (l'objectif place par triangulation, tenu a sa hauteur, regarde le mur
 * de la hauteur du modele) et ceux qui joignent les bouts de ses deux cotes.
 */
function meilleureHypothese(ctx: Contexte, gauches: Arete[], droites: Arete[], egouts: Arete[], pieds: Arete[]): Hypothese | null {
  const { mur, prise, tol } = ctx;
  const W = prise.largeurPx,
    H = prise.hauteurPx;
  const auBord = (q: P2) => q.x < tol || q.y < tol || q.x > W - tol || q.y > H - tol;
  let meilleure: Hypothese | null = null;
  for (const G of gauches)
    for (const D of droites) {
      const C = trianguler(prise, mur, G.ligne, D.ligne);
      if (!C || Math.hypot(C.x - prise.x, C.y - prise.y) > ctx.rayonPosition) continue;
      const pc = { ...prise, x: C.x, y: C.y };
      const pred = (z: number): Arete | null => {
        const a = projeterPoint(pc, mur.gauche.x, mur.gauche.y, z),
          b = projeterPoint(pc, mur.droite.x, mur.droite.y, z);
        const l = a && b ? ligneParPoints(a, b) : null;
        return l ? { ligne: l, segments: [], soutien: 0, nature: 'predite' } : null;
      };
      const bouts = (a?: P2, b?: P2): Arete | null => {
        if (!a || !b || auBord(a) || auBord(b)) return null;
        const l = ligneParPoints(a, b);
        return l ? { ligne: l, segments: [], soutien: 0, nature: 'bouts' } : null;
      };
      // L'egout par les hauts des cotes est une horizontale du mur (elle vise le point de fuite horizontal) : la droite qui joint deux
      // hauts a des hauteurs differentes (une rampe, un appentis adosse : un cote monte plus haut que l'autre) n'en est pas une. Scene 23
      // du banc : elle joignait l'egout a gauche au haut de la rampe a droite, et le coin haut droit tombait 1,8 m trop haut. Chaque haut
      // donne alors son horizontale ; quand la droite des deux hauts ne penche pas sur l'horizontale (PENTE_EGOUT_BOUTS_DEG), elle reste.
      const horizontaleDe = (a?: P2): Arete | null => {
        if (!a || auBord(a)) return null;
        const l = ligneParFuite(a, ctx.vH);
        return l ? { ligne: l, segments: [], soutien: 0, nature: 'bouts' } : null;
      };
      const hG = horizontaleDe(G.haut), hD = horizontaleDe(D.haut);
      const ecartHauts = G.haut && D.haut ? Math.hypot(D.haut.x - G.haut.x, D.haut.y - G.haut.y) : 0;
      const memeHorizontale = !ctx.vHConnu || !!(hG && D.haut && ecartHauts > 0 && distanceA(hG.ligne, D.haut) <= ecartHauts * Math.tan((PENTE_EGOUT_BOUTS_DEG * Math.PI) / 180));
      const parLesBouts = memeHorizontale ? [bouts(G.haut, D.haut)] : [hG, hD];
      const E = [...egouts, ...parLesBouts, pred(mur.hauteur)].filter((x): x is Arete => !!x);
      const F = [...pieds, bouts(G.bas, D.bas), pred(0)].filter((x): x is Arete => !!x);
      for (const Eg of E)
        for (const Fp of F) {
          const h = noter(ctx, G, D, Eg, Fp);
          if (h && (!meilleure || h.note > meilleure.note)) meilleure = h;
        }
    }
  return meilleure;
}

/* ------------------------------------------------------------------------------------------------
 * Le calage fin
 * --------------------------------------------------------------------------------------------- */

const angles = (p: PriseDeVue) => ({ azimutDeg: p.azimutDeg, inclinaisonDeg: p.inclinaisonDeg ?? 0, roulisDeg: p.roulisDeg ?? 0 });

/** Le calage fin d'une photo : les coins trouves, ou le repli sur les coins predits. */
export function calageFin(e: EntreeCalageFin): CalageFin {
  const p0 = e.prise;
  const inc = e.incertitude ?? incertitudeDe(p0);
  const recaler = e.recaler ?? ((a) => ({ ...p0, ...a }));
  const grossier = calageGrossier(e.mur, p0, inc);
  const segs = e.segments ?? detecterSegments(e.image);
  const W = p0.largeurPx,
    H = p0.hauteurPx;
  const diag = Math.hypot(W, H);
  const tol = Math.max(2, 0.0025 * Math.max(W, H));

  // 1. L'attitude, puis l'azimut, par les points de fuite.
  const vert = pointFuiteVertical(segs, p0, inc);
  const p1 = recaler({ ...angles(p0), inclinaisonDeg: vert.inclinaisonDeg, roulisDeg: vert.roulisDeg });
  const hor = azimutParPointFuite(segs, p1, e.mur, inc, vert.segments);
  const p2 = hor.trouve ? recaler({ ...angles(p1), azimutDeg: hor.azimutDeg }) : p1;
  const predits = coinsPredits(e.mur, p2) ?? grossier.coins;

  const repli = (): CalageFin => ({
    coins: grossier.coins,
    sources: [0, 1, 2, 3].map(() => 'predit' as const),
    note: 0,
    trouve: false,
    inclinaisonDeg: vert.inclinaisonDeg,
    roulisDeg: vert.roulisDeg,
    azimutDeg: hor.azimutDeg,
    azimutCorrige: hor.trouve,
    distance: grossier.distance,
    hauteur: null,
    contour: null,
    detail: { segments: segs, zones: grossier.zones, predits, lignes: [] },
  });
  if (!predits || grossier.zones.length < 4) return repli();
  const [z0, z1, z2, z3] = grossier.zones as [ZoneRecherche, ZoneRecherche, ZoneRecherche, ZoneRecherche];

  // 2. Les segments qui visent chacun des deux points de fuite (tolerance fine, un peu elargie pour
  //    l'horizontal : de face, un azimut mal lu penche peu les horizontales mais les penche).
  const vV = pointDeFuite(p2, [0, 0, 1]);
  const dirMur = directionDuMur(e.mur);
  const vH = pointDeFuite(p2, dirMur);
  // L'horizon : la droite des points de fuite de toutes les horizontales (ici celle du mur et sa normale).
  const horizon = ligneHomogene(vH, pointDeFuite(p2, [-dirMur[1], dirMur[0], 0]));
  const fine = (TOLERANCE_FINE_DEG * Math.PI) / 180;
  const verticaux = segs.filter((g) => g.longueur >= 10 && ecartAuPoint(g, vV) < fine);
  const horizontaux = segs.filter((g) => g.longueur >= 10 && ecartAuPoint(g, vH) < 1.5 * fine && !verticaux.includes(g));

  // 3. Les aretes candidates, chacune dans la reunion des zones de ses deux coins.
  const marge = 0.02 * Math.max(W, H);
  const zoneGauche = elargir(reunion(z0, z3), marge),
    zoneDroite = elargir(reunion(z1, z2), marge),
    zoneEgout = elargir(reunion(z0, z1), marge),
    zonePied = elargir(reunion(z2, z3), marge);
  const xAuCentre = (l: Ligne) => (Math.abs(l.a) > 1e-9 ? -(l.b * (H / 2) + l.c) / l.a : null);
  const yAuCentre = (l: Ligne) => (Math.abs(l.b) > 1e-9 ? -(l.a * (W / 2) + l.c) / l.b : null);
  const cotes = (z: Rect) => grouper(verticaux.filter((g) => dans(z, milieu(g))), vV, xAuCentre, tol, true).slice(0, CANDIDATS_PAR_COTE);
  const travers = (z: Rect) => grouper(horizontaux.filter((g) => dans(z, milieu(g))), vH, yAuCentre, tol, false).slice(0, CANDIDATS_EN_TRAVERS);
  const gauches = cotes(zoneGauche),
    droites = cotes(zoneDroite);
  const egouts = travers(zoneEgout),
    pieds = travers(zonePied);
  if (!gauches.length || !droites.length) return repli();

  const ctx: Contexte = {
    image: e.image,
    mur: e.mur,
    prise: p2,
    repere: repereCamera(p2),
    predits,
    rayons: grossier.zones.map((z) => Math.max(0.05 * diag, 0.5 * Math.hypot(z.x1 - z.x0, z.y1 - z.y0))),
    verticaux,
    horizontaux,
    horizon,
    vV,
    vH,
    vHConnu: hor.trouve || e.capConnu !== false,
    tol,
    largeur: Math.hypot(e.mur.droite.x - e.mur.gauche.x, e.mur.droite.y - e.mur.gauche.y),
    // Une focale estimee fausse l'echelle de la triangulation d'autant : la distance s'en ressent.
    rayonPosition: MARGE_POSITION * (inc.positionM + inc.focale * grossier.distance) + 1,
  };
  const meilleure = meilleureHypothese(ctx, gauches, droites, egouts, pieds);
  const cotesVus = meilleure ? meilleure.sources.some((s) => s === 'trouve') : false;
  if (!meilleure || meilleure.note < SEUIL_NOTE || !cotesVus) {
    const r = repli();
    r.note = meilleure?.note ?? 0;
    r.detail.lignes = meilleure?.lignes ?? [];
    return r;
  }
  const C = trianguler(p2, e.mur, meilleure.gauche.ligne, meilleure.droite.ligne);
  const milieuMur = { x: (e.mur.gauche.x + e.mur.droite.x) / 2, y: (e.mur.gauche.y + e.mur.droite.y) / 2 };
  let contour: CalageFin['contour'] = null;
  if (e.distance && hor.trouve) {
    const lv = largeurVue(p2, e.mur, meilleure.gauche.ligne, meilleure.droite.ligne, e.distance.valeur);
    if (lv !== null) {
      const ecartM = lv - ctx.largeur;
      // L'incertitude de la distance passe telle quelle a la largeur (meme rapport).
      const incertitudeM = (lv * e.distance.precisionM) / e.distance.valeur;
      contour = { ecartM, incertitudeM, decale: Math.abs(ecartM) - incertitudeM > DECALAGE_CONTOUR_M };
    }
  }
  return {
    coins: meilleure.coins,
    sources: meilleure.sources,
    note: meilleure.note,
    trouve: true,
    inclinaisonDeg: vert.inclinaisonDeg,
    roulisDeg: vert.roulisDeg,
    azimutDeg: hor.azimutDeg,
    azimutCorrige: hor.trouve,
    distance: C ? Math.hypot(C.x - milieuMur.x, C.y - milieuMur.y) : grossier.distance,
    hauteur: Math.round(meilleure.hauteur * 100) / 100,
    contour,
    detail: { segments: segs, zones: grossier.zones, predits, lignes: meilleure.lignes },
  };
}

/**
 * Le calage fin d'une photo du releve : la prise visant le milieu du mur (calage.ts), recalee sur le
 * biais que donne l'azimut corrige. `largeur` et `hauteur` : le mur (sa hauteur estimee).
 */
export function calageFinDuReleve(image: Image, largeur: number, hauteur: number, r: PriseReleve, distance: EntreeCalageFin['distance'] = null, segments?: Segment[]): CalageFin {
  const { mur, prise } = priseVisantLeMilieu(largeur, hauteur, r);
  // L'azimut de la prise du releve vaut moins le biais (la facade regarde vers -Y).
  const recaler = (a: { azimutDeg: number; inclinaisonDeg: number; roulisDeg: number }) =>
    priseVisantLeMilieu(largeur, hauteur, { ...r, biaisDeg: -ecartSigne(a.azimutDeg), inclinaisonDeg: a.inclinaisonDeg, roulisDeg: a.roulisDeg }).prise;
  return calageFin({ image, mur, prise, incertitude: incertitudeDuReleve(r), recaler, distance, capConnu: r.biaisDeg != null, ...(segments ? { segments } : {}) });
}

/**
 * Ce qu'un cote separe : l'ecart de teinte entre ses deux bords (0 a 1), la ressemblance de son dedans
 * avec le mur, et la difference de chromaticite de son dehors avec le mur.
 */
interface Contraste {
  ecart: number;
  semblable: number;
  autre: number;
  /**
   * La part des troncons ou le cote borde le mur d'une ombre : dedans le mur, dehors la meme matiere (sa chromaticite) mais plus sombre.
   * C'est la limite d'une ombre portee sur le mur (sous un debord), pas un bord du mur.
   */
  ombre: number;
}

/** Ecart de teinte (distance RGB des moyennes) au-dela duquel un cote separe nettement deux matieres. */
const CONTRASTE_PLEIN = 40;

/**
 * Le contraste d'un cote du quadrilatere, de 0 a 1 : l'ecart entre la teinte moyenne d'une bande juste
 * a l'interieur et celle d'une bande juste a l'exterieur, sur chacun de quatre troncons, dont on garde
 * la mediane (une voiture devant un quart du pied ne suffit pas a le faire disparaitre).
 */
function contraste(img: Image, a: P2, b: P2, centre: P2, mur: number[] | null): Contraste {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(L > 0)) return { ecart: 0, semblable: 0, autre: 0, ombre: 0 };
  const ux = (b.x - a.x) / L,
    uy = (b.y - a.y) / L;
  // Normale vers l'interieur du quadrilatere.
  let nx = -uy,
    ny = ux;
  if ((centre.x - a.x) * nx + (centre.y - a.y) * ny < 0) [nx, ny] = [-nx, -ny];
  const e = Math.max(2, 0.004 * Math.max(img.largeur, img.hauteur));
  const lire = (x: number, y: number, somme: number[]) => {
    const i = Math.floor(x),
      j = Math.floor(y);
    if (i < 0 || j < 0 || i >= img.largeur || j >= img.hauteur) return;
    const o = (j * img.largeur + i) * 4;
    somme[0] = (somme[0] ?? 0) + (img.donnees[o] ?? 0);
    somme[1] = (somme[1] ?? 0) + (img.donnees[o + 1] ?? 0);
    somme[2] = (somme[2] ?? 0) + (img.donnees[o + 2] ?? 0);
    somme[3] = (somme[3] ?? 0) + 1;
  };
  const ecarts: number[] = [],
    semblables: number[] = [],
    autres: number[] = [];
  let auMur = 0, ombres = 0;
  for (let t = 0; t < 4; t++) {
    const dedans = [0, 0, 0, 0],
      dehors = [0, 0, 0, 0];
    for (let k = 0; k < 8; k++) {
      const f = (t + (k + 0.5) / 8) / 4;
      const x = a.x + ux * L * f,
        y = a.y + uy * L * f;
      for (const d of [1, 2, 3]) {
        lire(x + nx * e * d, y + ny * e * d, dedans);
        lire(x - nx * e * d, y - ny * e * d, dehors);
      }
    }
    const nd = dedans[3] ?? 0,
      nh = dehors[3] ?? 0;
    if (!nd || !nh) continue;
    const din = [0, 1, 2].map((c) => (dedans[c] ?? 0) / nd);
    const ecart = Math.hypot(...din.map((v, c) => v - (dehors[c] ?? 0) / nh));
    // Ressembler au mur se juge a la chromaticite : l'ombre d'un debord assombrit le mur sans changer
    // sa teinte, une bande de tuiles ou d'ardoises la change.
    const semblable = mur ? Math.max(0, 1 - ecartChroma(din, mur) / ECART_CHROMA_PLEIN) : 1;
    const dout = [0, 1, 2].map((c) => (dehors[c] ?? 0) / nh);
    semblables.push(semblable);
    autres.push(mur ? Math.min(1, ecartChroma(dout, mur) / ECART_CHROMA_PLEIN) : 1);
    // Le mur des deux cotes (la chromaticite du mur dehors aussi), le dehors plus sombre : la limite d'une ombre portee.
    if (mur && semblable >= OMBRE_SEMBLABLE_MIN) {
      auMur++;
      const lum = (v: number[]) => (v[0] ?? 0) + (v[1] ?? 0) + (v[2] ?? 0);
      if (ecartChroma(dout, din) < OMBRE_CHROMA_MAX && lum(dout) < OMBRE_LUMIERE_MAX * lum(din)) ombres++;
    }
    ecarts.push(Math.min(1, ecart / CONTRASTE_PLEIN));
  }
  return { ecart: mediane(ecarts), semblable: mediane(semblables), autre: mediane(autres), ombre: auMur ? ombres / auMur : 0 };
}


/**
 * Une bande peinte dans le mur : au plus cette part de la hauteur du cote (un bandeau de 15 a 30 cm sur un mur de 5 m), une teinte qui
 * n'est pas celle du mur, puis le mur (sa chromaticite a BANDE_CHROMA_MUR pres, sa luminosite dans BANDE_LUMIERE : une ardoise grise ou
 * l'ombre d'un debord, plus sombres, ne le sont pas) sur BANDE_MUR_PX rangees au moins, sur trois troncons sur quatre.
 */
const BANDE_PART_MAX = 0.06;
const BANDE_CHROMA_MUR = 0.05;
const BANDE_LUMIERE: readonly [number, number] = [0.75, 1.33];
const BANDE_MUR_PX = 3;
/** La bande commence contre la droite, a cette part du cote pres. */
const BANDE_ECART = 0.01;
const BANDE_TRONCONS_MIN = 3;
/**
 * Un egout par les bouts des cotes se juge aussi contre chacun de ses coins, sur cette part de sa longueur : un cote s'arrete au bas de la
 * bande, et l'horizontale tiree de ce haut seul (PENTE_EGOUT_BOUTS_DEG) ne longe la bande qu'a ce coin.
 */
const BANDE_BOUT = 0.1;

/**
 * D'un cote de la droite a-b (le dehors, oppose a `centre`, ou le dedans), une bande d'autre matiere, mince, puis le mur
 * (BANDE_PART_MAX) : la distance ou le mur reprend, en pixels (la mediane des troncons), ou null.
 */
function bandeContreLeMur(img: Image, a: P2, b: P2, centre: P2, mur: number[], cote: number, dedans = false, auxBouts = false): number | null {
  const L = Math.hypot(b.x - a.x, b.y - a.y), max = Math.round(BANDE_PART_MAX * cote);
  if (!(L > 0) || max < 2) return null;
  const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
  let nx = -uy, ny = ux;
  if (((centre.x - a.x) * nx + (centre.y - a.y) * ny > 0) !== dedans) [nx, ny] = [-nx, -ny];
  const lm = (mur[0] ?? 0) + (mur[1] ?? 0) + (mur[2] ?? 0);
  // Quatre troncons, ou, aux bouts, les BANDE_BOUT de la droite contre chacun de ses deux coins.
  const troncons: readonly (readonly [number, number])[] = auxBouts ? [[0, BANDE_BOUT], [1 - BANDE_BOUT, 1]] : [[0, 0.25], [0.25, 0.5], [0.5, 0.75], [0.75, 1]];
  const rangee = (t: number, s: number): boolean | null => {
    const [f0, f1] = troncons[t] as readonly [number, number];
    const v = [0, 0, 0];
    let n = 0;
    for (let k = 0; k < 8; k++) {
      const f = f0 + ((k + 0.5) / 8) * (f1 - f0);
      const i = Math.floor(a.x + ux * L * f + nx * s), j = Math.floor(a.y + uy * L * f + ny * s);
      if (i < 0 || j < 0 || i >= img.largeur || j >= img.hauteur) continue;
      const o = (j * img.largeur + i) * 4;
      for (let c = 0; c < 3; c++) v[c] = (v[c] ?? 0) + (img.donnees[o + c] ?? 0);
      n++;
    }
    if (n < 4) return null;
    const moy = v.map((x) => x / n), l = (moy[0] ?? 0) + (moy[1] ?? 0) + (moy[2] ?? 0);
    return ecartChroma(moy, mur) < BANDE_CHROMA_MUR && l >= BANDE_LUMIERE[0] * lm && l <= BANDE_LUMIERE[1] * lm;
  };
  const reprises: number[] = [];
  for (let t = 0; t < troncons.length; t++) {
    // Contre la droite (a BANDE_ECART pres : une droite tiree d'un haut de cote passe a un ou deux pixels du bord), pas le mur, sur
    // deux rangees au moins. Puis, avant `max`, le mur sur BANDE_MUR_PX rangees de suite.
    const ecart = Math.max(3, Math.round(BANDE_ECART * cote));
    let debut = 0;
    for (let s = 1; s <= ecart && !debut; s++) if (rangee(t, s) === false && rangee(t, s + 1) === false) debut = s + 2;
    if (!debut) continue;
    let suite = 0;
    for (let s = debut; s <= max + BANDE_MUR_PX; s++) {
      const r = rangee(t, s);
      suite = r ? suite + 1 : 0;
      if (suite >= BANDE_MUR_PX) { reprises.push(s - BANDE_MUR_PX + 1); break; }
      if (s > max && !suite) break;
    }
  }
  return reprises.length >= (auxBouts ? 1 : BANDE_TRONCONS_MIN) ? mediane(reprises) : null;
}

/** Ecart de chromaticite au-dela duquel deux teintes ne sont plus la meme matiere. */
const ECART_CHROMA_PLEIN = 0.25;

/** L'ecart de chromaticite de deux couleurs (chaque canal rapporte a la moyenne des trois). */
function ecartChroma(a: number[], b: number[]): number {
  const sa = ((a[0] ?? 0) + (a[1] ?? 0) + (a[2] ?? 0)) / 3 + 1,
    sb = ((b[0] ?? 0) + (b[1] ?? 0) + (b[2] ?? 0)) / 3 + 1;
  return Math.hypot((a[0] ?? 0) / sa - (b[0] ?? 0) / sb, (a[1] ?? 0) / sa - (b[1] ?? 0) / sb, (a[2] ?? 0) / sa - (b[2] ?? 0) / sb);
}

/**
 * La teinte du mur : la mediane, canal par canal, d'une grille de points a l'interieur du quadrilatere
 * (ses ouvertures, minoritaires, n'y pesent pas).
 */
function teinteDuMur(img: Image, q: readonly P2[]): number[] {
  const [hg, hd, bd, bg] = q as [P2, P2, P2, P2];
  const canaux: number[][] = [[], [], []];
  for (let i = 1; i < 12; i++)
    for (let j = 1; j < 12; j++) {
      const u = i / 12,
        v = j / 12;
      const x = (1 - v) * ((1 - u) * hg.x + u * hd.x) + v * ((1 - u) * bg.x + u * bd.x),
        y = (1 - v) * ((1 - u) * hg.y + u * hd.y) + v * ((1 - u) * bg.y + u * bd.y);
      const px = Math.floor(x),
        py = Math.floor(y);
      if (px < 0 || py < 0 || px >= img.largeur || py >= img.hauteur) continue;
      const o = (py * img.largeur + px) * 4;
      for (let c = 0; c < 3; c++) canaux[c]?.push(img.donnees[o + c] ?? 0);
    }
  return canaux.map((c) => {
    if (!c.length) return 0;
    c.sort((a, b) => a - b);
    return c[Math.floor(c.length / 2)] ?? 0;
  });
}

/** La droite par deux points homogenes (eventuellement a l'infini). */
function ligneHomogene(u: V3, v: V3): Ligne | null {
  return normer(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
}

/**
 * La hauteur ou l'horizon coupe une arete verticale du mur, de son pied `A` (z = 0) a son egout `C`
 * (z = `hauteur`), par le birapport avec le point de fuite vertical `v` : c'est la hauteur de l'objectif.
 */
function oeilSurCote(A: P2, C: P2, horizon: Ligne | null, v: V3, hauteur: number): number | null {
  const cote = ligneParPoints(A, C);
  const B = horizon && cote ? intersection(cote, horizon) : null;
  if (!B) return null;
  const L = Math.hypot(C.x - A.x, C.y - A.y);
  if (!(L > 0)) return null;
  const ux = (C.x - A.x) / L,
    uy = (C.y - A.y) / L;
  const t = (p: P2) => (p.x - A.x) * ux + (p.y - A.y) * uy;
  const tB = t(B),
    tC = L;
  // Le point de fuite le long de l'arete ; a l'infini, le birapport devient un simple rapport.
  const tV = Math.abs(v[2]) > 1e-12 ? ((v[0] - v[2] * A.x) * ux + (v[1] - v[2] * A.y) * uy) / v[2] : Infinity;
  const r = Number.isFinite(tV) && Math.abs(tV) < 1e9 ? (tB / tC) * ((tV - tC) / (tV - tB)) : tB / tC;
  return Number.isFinite(r) ? r * hauteur : null;
}

/** Un quadrilatere convexe (les quatre virages du meme sens). */
function convexe(q: P2[]): boolean {
  let signe = 0;
  for (let k = 0; k < 4; k++) {
    const a = q[k],
      b = q[(k + 1) % 4],
      c = q[(k + 2) % 4];
    if (!a || !b || !c) return false;
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-9) return false;
    if (signe === 0) signe = Math.sign(z);
    else if (Math.sign(z) !== signe) return false;
  }
  return true;
}
