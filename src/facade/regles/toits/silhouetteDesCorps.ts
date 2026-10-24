// La silhouette d'un mur selon les corps du toit lus sur le LiDAR : le haut du mur sous eux (l'egout d'un long pan, le triangle
// d'un pignon, les marches de deux corps), et le mot qui le dit, dans le vocabulaire de la photo et de Claude
// (model/silhouetteFacade.ts). C'est la lecture LiDAR que la silhouette de la photo arbitre, mur par mur : la photo gagne
// (decision de l'utilisateur, 19 octobre 2026 : « la photo gagne sur le LiDAR ; une forme de silhouette donne une forme de toit »).
//
// Le haut se lit sur le cote du corps qui porte le mur (murDuCorps.ts), pas sur la face du mur du cadastre : un bow-window ou un
// avant-corps sort du corps de quelques dizaines de centimetres, et le pignon qui est derriere est bien ce que montre la photo
// (AE 101, cote 3 : une saillie de 2,3 m devant le pignon est du corps principal, lue « ligne droite a 3,4 m » sur sa face).
// Ce n'est pas le gabarit (facade/gabaritMur.ts::hautDeLaFacade) : lui montre toute la facade vue de dehors, tous corps compris, le
// plus haut l'emportant ; ici, le mur d'un seul corps, celui qui le porte, pour dire sa forme. Les deux lectures different des qu'un
// corps en retrait depasse au-dessus d'un autre ; ne pas les fondre (les verdicts du LiDAR changeraient).
// Pur.

import { hauteurDuToitEn } from '../../toitCorps.js';
import { murDuCorps } from './murDuCorps.js';
import { tourneVers } from './facadesDesCorps.js';
import { facadesDuContour } from '../../geometrie.js';
import type { Facade } from '../../geometrie.js';
import type { P2 } from '../../homographie.js';
import type { SilhouetteFacade } from '../../../model/silhouetteFacade.js';
import type { CorpsToit, PtBrut } from '../../../model/types.js';

/** Le pas, le long du mur, auquel se lit le haut du mur sous les corps : 10 cm, la pointe d'un pignon a 5 cm pres. */
const PAS_SILHOUETTE_M = 0.1;
/** Le haut du mur se lit a 2 cm en dedans de la face : sur le mur (plus loin, un long pan lirait deja la pente au-dessus de l'egout). */
const RETRAIT_SILHOUETTE_M = 0.02;
/** Un haut de mur qui ne monte pas de plus que cela est une ligne droite ; deux sommets doivent se separer d'autant. */
const RELIEF_MIN_M = 0.3;
/** Une marche : le haut saute d'au moins cela d'un pas au suivant (un pan a 60 degres monte de 17 cm en 10 cm). */
const SAUT_MARCHE_M = 0.5;
/** Un sommet plus large que cette part du mur est un trapeze (le faitage d'une croupe), pas la pointe d'un triangle. */
const PART_PLATEAU_TRAPEZE = 0.2;

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
export function motDuHaut(haut: readonly P2[]): SilhouetteFacade {
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
 * La silhouette d'un corps vue d'un point (`oeil`, dans le plan) : son mur le plus tourne vers lui, du pied au haut sous son toit
 * (pignon compris), en points du plan et hauteurs (`z`, metres). Ce que le mode Toit trace autour du corps choisi.
 */
export function silhouetteVersLOeil(c: CorpsToit, oeil: PtBrut): { x: number; y: number; z: number }[] | null {
  const egout = Math.min(...c.egouts);
  const f = facadesDuContour(c.pts, egout).reduce<Facade | null>((m, x) => (!m || tourneVers(x.gauche, x.droite, x.normale, oeil) > tourneVers(m.gauche, m.droite, m.normale, oeil) ? x : m), null);
  if (!f) return null;
  return silhouetteDuMur(f, [c], Number.POSITIVE_INFINITY, egout).map((q) => ({ x: f.gauche.x + ((f.droite.x - f.gauche.x) * q.x) / f.largeur, y: f.gauche.y + ((f.droite.y - f.gauche.y) * q.x) / f.largeur, z: q.y }));
}
