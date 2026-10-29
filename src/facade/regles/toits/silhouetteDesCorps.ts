// La silhouette d'un mur selon les corps du toit lus sur le LiDAR : le haut du mur sous eux (l'egout d'un long pan, le triangle
// d'un pignon, les marches de deux corps), et le mot qui le dit, dans le vocabulaire de la photo et de Claude
// (model/silhouetteFacade.ts). C'est la lecture LiDAR que la silhouette de la photo arbitre, mur par mur : la photo gagne
// (decision de l'utilisateur, 19 octobre 2026 : « la photo gagne sur le LiDAR ; une forme de silhouette donne une forme de toit »).
//
// Le haut se lit sur le cote du corps qui porte le mur (murDuCorps.ts), pas sur la face du mur du cadastre : un bow-window ou un
// avant-corps sort du corps de quelques dizaines de centimetres, et le pignon qui est derriere est bien ce que montre la photo
// (AE 101, cote 3 : une saillie de 2,3 m devant le pignon est du corps principal, lue « ligne droite a 3,4 m » sur sa face).
// Le mot (silhouetteDesCorps, motDuHaut) lit le mur d'un seul corps, celui qui le porte, pour dire sa forme ; ne pas le fondre avec
// la silhouette de face (les verdicts du LiDAR changeraient).
//
// La silhouette d'un corps (silhouetteDuCorps) est celle que trace le mode Toit en 3D (silhouetteVersLOeil). La silhouette de toute
// une facade vue de face (silhouetteDeFace) en est faite : chaque corps y pose la sienne, projetee sur le plan du mur, et le plus
// haut l'emporte. C'est le gabarit du mur de l'audit, du releve et de la calibration (facade/gabaritMur.ts ; demande du
// proprietaire, 28 octobre 2026 : « utilise la meme methode que le mode Toit pour la calibration et le dessin de la facade »).
// Pur.

import { hauteurDuToitEn } from '../../toits/toitCorps.js';
import { murDuCorps } from './murDuCorps.js';
import { facadesDuContour, tourneVers } from '../../../geometry/cotesVusDeDehors.js';
import type { Facade } from '../../../geometry/cotesVusDeDehors.js';
import type { P2 } from '../../vision/homographie.js';
import type { SilhouetteFacade } from '../../../model/silhouetteFacade.js';
import { SILHOUETTES_TOITS, type SilhouettesToits } from '../../../regles/toits/silhouettes.js';
import type { CorpsToit, PtBrut } from '../../../model/types.js';

/** Le pas, le long du mur, auquel se lit le haut du mur sous les corps : 10 cm, la pointe d'un pignon a 5 cm pres. */
const PAS_SILHOUETTE_M = 0.1;
/** Le haut du mur se lit a 2 cm en dedans de la face : sur le mur (plus loin, un long pan lirait deja la pente au-dessus de l'egout). */
const RETRAIT_SILHOUETTE_M = 0.02;
// Les seuils du mot d'un haut de mur (RELIEF_MIN_M, SAUT_MARCHE_M, PART_PLATEAU_TRAPEZE) sont des reglages : regles/toits/silhouettes.json.

/** Le point du plan ou se lit le haut du mur en `x` (metres depuis la gauche) : sur le cote du corps qui le porte, ou sur sa face. */
function lecteur(f: Facade, corps: readonly CorpsToit[]): (x: number) => PtBrut {
  const L = f.largeur;
  const surFace = (x: number): PtBrut => ({ x: f.gauche.x + ((f.droite.x - f.gauche.x) * x) / L - f.normale.x * RETRAIT_SILHOUETTE_M, y: f.gauche.y + ((f.droite.y - f.gauche.y) * x) / L - f.normale.y * RETRAIT_SILHOUETTE_M });
  const m = murDuCorps(corps, f.gauche, f.droite);
  const c = m ? corps[m.corps] : undefined;
  if (!m || !c) return surFace;
  const a = c.pts[m.cote] as PtBrut, b = c.pts[(m.cote + 1) % 4] as PtBrut;
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(l > 0)) return surFace;
  const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  // Vers l'interieur du corps : du cote de son centre.
  const cx = c.pts.reduce((s, p) => s + p.x, 0) / c.pts.length, cy = c.pts.reduce((s, p) => s + p.y, 0) / c.pts.length;
  const sens = (cx - a.x) * -u.y + (cy - a.y) * u.x >= 0 ? 1 : -1;
  const n = { x: -u.y * sens, y: u.x * sens };
  return (x) => {
    const q = surFace(x);
    const t = (q.x - a.x) * u.x + (q.y - a.y) * u.y;
    return { x: a.x + u.x * t + n.x * RETRAIT_SILHOUETTE_M, y: a.y + u.y * t + n.y * RETRAIT_SILHOUETTE_M };
  };
}

/**
 * Le haut d'un mur sous les corps du toit, de gauche a droite (x le long du mur depuis la gauche, y en metres au-dessus du sol).
 * Coupe a `plafond` ; la ou aucun corps ne couvre le mur, `repli` (l'egout du prisme). Trois points alignes n'en font qu'un.
 */
export function hautDuMurSousCorps(f: Facade, corps: readonly CorpsToit[], repli: number, plafond = Number.POSITIVE_INFINITY): P2[] {
  const L = f.largeur, n = Math.max(1, Math.ceil(L / PAS_SILHOUETTE_M));
  const point = lecteur(f, corps);
  const haut: P2[] = [];
  for (let k = 0; k <= n; k++) {
    const x = (L * k) / n;
    const y = Math.min(plafond, hauteurDuToitEn(corps, point(x)) ?? repli);
    const a = haut[haut.length - 2], b = haut[haut.length - 1];
    if (a && b && Math.abs((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)) < 1e-6) haut[haut.length - 1] = { x, y };
    else haut.push({ x, y });
  }
  return haut;
}

/**
 * La silhouette d'un mur sous les corps du toit (le pied, puis le haut lu de droite a gauche) : l'egout d'un long pan, le
 * triangle d'un pignon, les marches de deux corps de hauteurs differentes. Coupee a `plafond` (le haut de la photo : au-dessus,
 * elle n'a rien a montrer) ; la ou aucun corps ne couvre le mur, `repli` (l'egout du prisme). Dans le repere du mur : x le long,
 * depuis la gauche ; y en hauteur. Decision de l'utilisateur, 18 octobre 2026 : la photo epouse la silhouette de la facade.
 */
export function silhouetteDuMur(f: Facade, corps: readonly CorpsToit[], plafond: number, repli: number): P2[] {
  return [{ x: 0, y: 0 }, { x: f.largeur, y: 0 }, ...hautDuMurSousCorps(f, corps, repli, plafond).reverse()];
}

/**
 * Le mot d'un haut de mur (de gauche a droite) : ligne droite sous RELIEF_MIN_M de montee ; marches quand il saute d'un pas a
 * l'autre ; plusieurs sommets ; sinon un sommet, au bout (une rampe) ou dedans (un triangle, un trapeze s'il est large).
 */
export function motDuHaut(haut: readonly P2[], regles: SilhouettesToits = SILHOUETTES_TOITS): SilhouetteFacade {
  const { RELIEF_MIN_M, SAUT_MARCHE_M, PART_PLATEAU_TRAPEZE } = regles.seuils;
  if (haut.length < 2) return 'indetermine';
  const ys = haut.map((q) => q.y);
  const bas = Math.min(...ys), sommet = Math.max(...ys);
  if (sommet - bas < RELIEF_MIN_M) return 'ligne-droite';
  // Les points sont les angles de la ligne : un saut est un segment presque vertical, plus haut que SAUT_MARCHE_M.
  for (let i = 1; i < haut.length; i++) {
    const a = haut[i - 1] as P2, b = haut[i] as P2;
    if (Math.abs(b.y - a.y) >= SAUT_MARCHE_M && b.x - a.x <= 0.1 + 1e-9) return 'marches';
  }
  // Les sommets : les maxima locaux qui dominent leurs voisins de RELIEF_MIN_M des deux cotes (ou qui sont au bout).
  const L = (haut[haut.length - 1] as P2).x - (haut[0] as P2).x;
  const sommets: { x0: number; x1: number; y: number }[] = [];
  let i = 0;
  while (i < haut.length) {
    let j = i;
    while (j + 1 < haut.length && Math.abs((haut[j + 1] as P2).y - (haut[i] as P2).y) < 0.05) j++;
    const y = (haut[i] as P2).y;
    const avant = i > 0 ? Math.min(...ys.slice(0, i)) : null, apres = j < haut.length - 1 ? Math.min(...ys.slice(j + 1)) : null;
    const gauche = i > 0 ? (haut[i - 1] as P2).y : null, droite = j < haut.length - 1 ? (haut[j + 1] as P2).y : null;
    const domine = (gauche === null || gauche < y) && (droite === null || droite < y) && (avant === null || y - avant >= RELIEF_MIN_M) && (apres === null || y - apres >= RELIEF_MIN_M);
    if (domine) sommets.push({ x0: (haut[i] as P2).x, x1: (haut[j] as P2).x, y });
    i = j + 1;
  }
  if (sommets.length >= 2) return 'plusieurs-sommets';
  const s = sommets[0];
  // Un sommet qui ne domine pas d'un cote (un bout de pignon vu sur une saillie etroite) : une pointe dedans, ou une rampe au bout.
  if (!s) { const k = ys.indexOf(sommet); return k === 0 || k === ys.length - 1 ? 'rampe' : 'triangle'; }
  const debut = (haut[0] as P2).x, fin = (haut[haut.length - 1] as P2).x;
  if (s.x0 <= debut + 1e-9 || s.x1 >= fin - 1e-9) return 'rampe';
  return s.x1 - s.x0 > PART_PLATEAU_TRAPEZE * L ? 'trapeze' : 'triangle';
}

/** La silhouette qu'ont les corps du toit au-dessus d'un mur, ou `indetermine` sans corps. */
export function silhouetteDesCorps(f: Facade, corps: readonly CorpsToit[] | null | undefined, repli: number): SilhouetteFacade {
  if (!corps?.length) return 'indetermine';
  return motDuHaut(hautDuMurSousCorps(f, corps, repli));
}

/**
 * La silhouette du mur `mur` d'un corps (le cote `pts[mur] -> pts[mur + 1]`), du pied au haut sous son toit, pignon compris : le pied
 * de gauche a droite vu de dehors, puis le haut de droite a gauche, en points du plan et hauteurs (`z`, metres). Le dessin du mode
 * Toit, et la piece de chaque corps dans la silhouette d'une facade (silhouetteDeFace). Null pour un cote de moins de 10 cm.
 */
export function silhouetteDuCorps(c: CorpsToit, mur: number): { x: number; y: number; z: number }[] | null {
  const egout = Math.min(...c.egouts), f = facadesDuContour(c.pts, egout).find((x) => x.cote === mur);
  return f ? surLePlan(f, silhouetteDuMur(f, [c], Number.POSITIVE_INFINITY, egout)) : null;
}

const surLePlan = (f: Facade, l: readonly P2[]) => l.map((q) => ({ x: f.gauche.x + ((f.droite.x - f.gauche.x) * q.x) / f.largeur, y: f.gauche.y + ((f.droite.y - f.gauche.y) * q.x) / f.largeur, z: q.y }));

/**
 * La silhouette d'un corps vue d'un point (`oeil`, dans le plan) : son mur le plus tourne vers lui (silhouetteDuCorps). Ce que le
 * mode Toit trace autour du corps choisi. `mur` : ce mur-la plutot que le plus tourne vers l'oeil (celui que tirent les poignees) ;
 * le mode Toit le donne toujours, et c'est le mur le plus visible du corps, que les autres corps ne cachent pas
 * (facade/modeToit/poignees.ts::murLePlusVisible, 29 octobre 2026). Le dessin de la silhouette ne change pas.
 */
export function silhouetteVersLOeil(c: CorpsToit, oeil: PtBrut, mur?: number): { x: number; y: number; z: number }[] | null {
  const egout = Math.min(...c.egouts), murs = facadesDuContour(c.pts, egout);
  // Le mur donne (celui des poignees du mode Toit) l'emporte : la silhouette et les poignees sont sur le meme mur.
  const f = (mur === undefined ? undefined : murs.find((x) => x.cote === mur))
    ?? murs.reduce<Facade | null>((m, x) => (!m || tourneVers(x.gauche, x.droite, x.normale, oeil) > tourneVers(m.gauche, m.droite, m.normale, oeil) ? x : m), null);
  return f ? silhouetteDuCorps(c, f.cote) : null;
}

/** Un mur de corps entre dans la silhouette d'une facade s'il lui fait face a 60 degres pres (sinon il se voit de chant). */
const FACE_MIN = 0.5;
/** Un mur de corps plus en avant que cela devant la facade n'en est pas (une aile qui avance) : on la photographie depuis devant elle. */
const DEVANT_FACE_M = 1;
/** Le pas de lecture le long de la facade, et l'ecart qui fait d'un bout de corps une marche verticale. */
const PAS_FACE_M = 0.1, BORD_M = 1e-3;
/** Deux corps a moins de cela l'un de l'autre, le long de la facade, se touchent. */
const JOINT_M = 0.05;

/** Le haut d'une silhouette de face : `x` en metres depuis la gauche de la facade (hors de 0..largeur quand ses murs la depassent). */
export interface SilhouetteDeFace {
  /** Les bouts de ce qui se voit : 0 et la largeur, ou plus loin quand le mur d'un corps continue la facade au-dela de son cote. */
  x0: number;
  x1: number;
  /** Le haut, de gauche a droite ; `y` null la ou aucun corps n'est derriere. */
  haut: { x: number; y: number | null }[];
}

/**
 * La silhouette de toute une facade (un cote du contour du batiment) vue de face, sous les corps du toit : le mur de chaque corps
 * qui lui fait face, tel que le dessine le mode Toit (silhouetteDuCorps : pignon, croupe, rampe d'un appentis, marches), projete sur
 * le plan du mur ; le plus haut l'emporte, et ce qui est derriere un plus haut ne se voit pas. Un corps plus haut en retrait se voit
 * au-dessus d'un plus bas devant ; une aile qui avance de plus d'un metre n'en est pas.
 *
 * Elle ne s'arrete pas au cote du contour : le mur d'un corps dans le plan de la facade (a MUR_CORPS_DISTANCE_M pres) qui la depasse
 * se voit entier, comme le mode Toit le trace (le pignon d'une maison en L continue au-dessus du toit de l'aile qui lui fait angle).
 * En metres : `x` le long du mur depuis sa gauche vue de dehors, `y` au-dessus du sol.
 */
export function silhouetteDeFace(f: Facade, corps: readonly CorpsToit[], regles: SilhouettesToits = SILHOUETTES_TOITS): SilhouetteDeFace {
  const L = f.largeur, n = f.normale;
  const ux = (f.droite.x - f.gauche.x) / L, uy = (f.droite.y - f.gauche.y) / L;
  const le = (p: PtBrut) => (p.x - f.gauche.x) * ux + (p.y - f.gauche.y) * uy;
  const derriere = (p: PtBrut) => -((p.x - f.gauche.x) * n.x + (p.y - f.gauche.y) * n.y);
  let x0 = 0, x1 = L;
  const profils: P2[][] = [];
  for (const c of corps) {
    const egout = Math.min(...c.egouts);
    for (const w of facadesDuContour(c.pts, egout)) {
      if (w.normale.x * n.x + w.normale.y * n.y < FACE_MIN) continue;
      const milieu = { x: (w.gauche.x + w.droite.x) / 2, y: (w.gauche.y + w.droite.y) / 2 }, d = derriere(milieu);
      if (d < -DEVANT_FACE_M) continue;
      const s = silhouetteDuCorps(c, w.cote);
      if (!s) continue;
      const haut = s.slice(2).reverse().map((q) => ({ x: le(q), y: q.z })).sort((a, b) => a.x - b.x);
      const a = haut[0] as P2, b = haut[haut.length - 1] as P2;
      profils.push(haut);
      // Dans le plan de la facade et sur elle : ce mur se voit entier.
      if (Math.abs(d) <= regles.seuils.MUR_CORPS_DISTANCE_M && Math.min(b.x, L) - Math.max(a.x, 0) > PAS_FACE_M) { x0 = Math.min(x0, a.x); x1 = Math.max(x1, b.x); }
    }
  }
  const surProfil = (h: readonly P2[], x: number): number | null => {
    const a = h[0] as P2, b = h[h.length - 1] as P2;
    if (x < a.x - 1e-9 || x > b.x + 1e-9) return null;
    for (let i = 1; i < h.length; i++) {
      const p = h[i - 1] as P2, q = h[i] as P2;
      if (x <= q.x + 1e-9) return q.x - p.x < 1e-9 ? Math.max(p.y, q.y) : p.y + ((q.y - p.y) * (x - p.x)) / (q.x - p.x);
    }
    return b.y;
  };
  // Les abscisses lues : un pas regulier, les sommets de chaque profil, et ses bouts de part et d'autre (une marche reste verticale).
  const k = Math.max(1, Math.ceil((x1 - x0) / PAS_FACE_M));
  const xs = Array.from({ length: k + 1 }, (_, i) => x0 + ((x1 - x0) * i) / k);
  for (const h of profils) {
    for (const p of h) xs.push(p.x);
    xs.push((h[0] as P2).x - BORD_M, (h[h.length - 1] as P2).x + BORD_M);
  }
  const lus = [...new Set(xs.filter((x) => x >= x0 - 1e-9 && x <= x1 + 1e-9).map((x) => Math.min(x1, Math.max(x0, x))))].sort((a, b) => a - b);
  const haut = lus.map((x) => {
    let y: number | null = null;
    for (const h of profils) { const z = surProfil(h, x); if (z !== null && (y === null || z > y)) y = z; }
    // Entre deux corps qui se touchent a quelques centimetres pres (le LiDAR ne les pose pas bord a bord), pas de creux : le plus proche.
    if (y === null) {
      for (const h of profils) {
        const a = h[0] as P2, b = h[h.length - 1] as P2;
        if (x < a.x - JOINT_M || x > b.x + JOINT_M) continue;
        const z = surProfil(h, Math.min(b.x, Math.max(a.x, x)));
        if (z !== null && (y === null || z > y)) y = z;
      }
    }
    return { x, y };
  });
  return { x0, x1, haut };
}
