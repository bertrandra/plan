// Le calage du mur par ses ancres (MD/spec-facade-calage-audit.md §4 E7, §5) : une pose du mur sur l'assemblage (ses bouts, son
// egout, son sol) se juge sur ce qui ne depend pas du toit. Les deux angles du mur sont des bords de sa matiere (du mur d'un cote, autre
// chose de l'autre, sous l'egout), l'egout est une horizontale ou le haut de la matiere aux angles, le sol la fin de la matiere, et les
// proportions sont celles du plan a 30 % pres. Le gabarit n'entre pas dans la recherche du mur (l'arbitre, calerParLesAncres) : il vient
// du toit calcule, qui est ce que la photo met en question (§5 bis) ; s'en servir pour caler masquerait l'ecart que l'on cherche a voir.
//
// Il entre en revanche dans le jugement de la pose retenue (l'E7, `expliquer(…, gabarit)` ; demande du proprietaire, 2 novembre 2026) :
// l'egout se juge sur toute la silhouette posee (la matiere du mur sous elle, pas au-dessus), et non plus a ses seuls angles. Sous un
// pignon, l'egout n'est pas une arete et le mur continue au-dessus de lui : la matiere aux angles ne disait pas un egout pose 48 cm trop
// bas (scene 24 du banc, score 0,89 pour la pose fausse comme pour la juste). Sur un mur rectangulaire, un egout deplace de 5 a 10 % de
// la hauteur passait aussi le test (son poids est faible, et la bande lue aux angles pres d'eux) : le seuil de l'egout
// (`egoutSilhouetteMin`) le refuse desormais. Et quand le pignon d'un corps voisin prolonge la facade au-dela d'un bout, ce bout n'est pas
// un angle (la matiere y continue) : l'angle est au bout de la silhouette (le mur de 5 m de la scene 24, score 0,52). Un gabarit faux (le
// LiDAR) rend alors une pose juste « a confirmer » : la direction prudente, et le diagnostic de forme (E10) dit l'ecart.
//
// Le gabarit se pose sur le sol trouve, a l'echelle de la largeur (decision du proprietaire, 4 novembre 2026 ; gabaritMur.ts) : son egout
// tombe ou cette echelle le met, et l'egout trouve se controle contre lui (`ecartEgout`, en part de la largeur ; l'E7 est a confirmer
// au-dela de `calageEcartMaxPart`). Ce controle n'entre pas dans le test de la pose (`expliqueLaPhoto`) : il melange l'erreur de l'egout
// trouve et celle des proportions de l'assemblage (une focale supposee l'etire de 1 a 2 % de la largeur sur le banc), et a lui seul ne
// separe pas un egout a 2 % d'un egout a 5 % (banc `calage-e5.ts` : 79 egouts a 2 % acceptes sur 86 au lieu de 83). L'egout trouve se
// juge donc toujours a la matiere, sous la silhouette accrochee a lui et a son sol (`egoutParLaSilhouette`) : c'est un test de l'egout
// trouve, pas une pose ; le gabarit pose sur le sol ne le voit pas, par construction. Accrochee a l'egout a l'echelle de la largeur (ses
// pignons ne suivant plus la hauteur trouvee), elle laissait passer l'egout 5 % trop bas de la scene 24 (0,43 pour un seuil de 0,4).
//
// Sur AE 101 (facade sud), le rectangle des aretes retenait un bloc de pignon, un mur de 302 px au lieu de 610 : ses bouts tombaient
// au milieu de l'enduit, que rien ne faisait finir la. Le score le dit, et l'arbitre prend alors la pose qui explique la photo, ou,
// quand aucune ne l'explique, la pose du plan seul, dite supposee : jamais un « trouve » sur une pose qui echoue au test.
//
// Pur, sans DOM. Les seuils sont des reglages (regles/facades/enchainement.json).

import type { PoseDuMurCherche } from '../../model/auditParcelle.js';
import type { Image } from '../vision/homographie.js';
import { affinerEgoutEtSol, matiereDuMur, type MurLu, type Rect } from '../vision/mosaiqueFuites.js';
import { objectifsEnchainement, type Objectifs } from '../regles/facades/enchainement.js';
import { ecartDEgout, type GabaritMur } from '../gabaritMur.js';

type Segment = { x1: number; y1: number; x2: number; y2: number; longueur: number };
type Vue = { image: Image; vu: Uint8Array };

/** Ce que la pose explique de la photo, chaque ancre de 0 (rien) a 1 (tout), et le score qui les pese. */
export interface Explication {
  /** Le score d'explication, de 0 a 1 : la somme ponderee des ancres (POIDS). */
  score: number;
  /** Les deux angles (gauche, droit) : la matiere du mur qui s'arrete la, et une verticale qui le longe. */
  angles: [number, number];
  egout: number;
  sol: number;
  /** Les proportions de la pose contre celles du plan : 1 a 30 % pres, 0 au double de l'ecart. */
  proportions: number;
  /**
   * Vrai : l'egout a ete juge sur la silhouette du gabarit posee par la pose (la matiere du mur sous elle, pas au-dessus, d'un bout a
   * l'autre), et les angles aux bouts de la silhouette ; il doit alors atteindre son seuil (SeuilsCalage.egout). Faux : sans gabarit
   * (l'arbitre de la recherche), l'egout aux angles ou sur une horizontale, comme avant.
   */
  silhouette: boolean;
  /**
   * Avec le gabarit : l'egout trouve moins celui du gabarit pose sur le sol a l'echelle de la largeur, en part de la largeur (positif :
   * l'egout trouve est plus haut ; gabaritMur.ts::ecartDEgout), le controle de l'E7 (egoutControle). Absent sans gabarit ; null sans les
   * proportions du plan.
   */
  ecartEgout?: number | null;
  /**
   * La part du mur, entre ses angles, qui a la matiere lue le long de ses bouts. Les baies en prennent une part ; quand la matiere
   * n'est pas celle de la plus grande part du mur, ce n'est pas le mur (deux fenetres prises pour ses bouts) : le score la suit.
   */
  matiere: number;
}

/** D'ou vient la pose retenue : les aretes (elles expliquent la photo), une autre pose qui l'explique mieux, ou le plan seul. */
type PoseRetenue = PoseDuMurCherche;

/** Le calage par les ancres : la pose retenue, son explication, et celle des aretes quand elle n'a pas ete retenue. */
interface CalageParAncres {
  retenue: PoseRetenue;
  explication: Explication;
  /** La pose des aretes (affinee par la teinte) et son score, quand une autre l'a remplacee : l'ecran la montre a cote. */
  aretes: (Rect & { score: number }) | null;
  /** Les seuils du test, tels qu'ils ont ete appliques. */
  seuils: SeuilsCalage;
}

/**
 * Les seuils du test d'explication : le score, chacun des deux angles, et l'egout lu sur la silhouette du gabarit
 * (regles/facades/enchainement.json).
 */
export interface SeuilsCalage {
  score: number;
  angle: number;
  egout: number;
  /** L'ecart admis entre l'egout trouve et celui du gabarit pose, en part de la largeur (`calageEcartMaxPart`) ; absent : non controle. */
  ecartEgout?: number;
}

/** Les seuils du test d'explication tires des objectifs de l'enchainement (ceux livres, sauf surcharge). */
export const seuilsDuCalage = (o: Objectifs = objectifsEnchainement()): SeuilsCalage => ({ score: o['facades.enchainement.explicationMin'], angle: o['facades.enchainement.angleMin'], egout: o['facades.enchainement.egoutSilhouetteMin'], ecartEgout: o['facades.enchainement.calageEcartMaxPart'] });

/** Le mur cale sur l'assemblage : le rectangle, ce qui en a ete lu (drapeaux honnetes), et le calage qui l'a retenu. */
export interface MurCale extends MurLu { calage: CalageParAncres }

/** Le poids de chaque ancre dans le score : les angles d'abord (ils donnent l'echelle et la place du mur), puis l'egout, le sol. */
const POIDS = { angle: 0.35, egout: 0.15, sol: 0.1, proportions: 0.05 } as const;
/** Dans un angle, la part de la matiere qui s'arrete et celle de la verticale qui le longe. */
const PART_MATIERE_ANGLE = 0.7;
/** Les bandes lues de part et d'autre d'un angle, en part de la largeur : de 1 a 5 % de lui. */
const BANDE_ANGLE: readonly [number, number] = [0.01, 0.05];
/** Les rangees ou se lit un angle, en part de la hauteur sous l'egout : le haut du mur, au-dessus d'une haie ou d'une voiture. */
const RANGEES_ANGLE: readonly [number, number] = [0.1, 0.6];
/** Les bandes lues au-dessus et au-dessous de l'egout et du sol, en part de la largeur. */
const BANDE_BORD: readonly [number, number] = [0.005, 0.025];
/** Une arete soutient une ancre quand elle passe a moins de cette part de la largeur de lui. */
const PROCHE_ARETE = 0.015;
/** Une ligne de la mosaique (redressee) ne penche pas de plus que cela. */
const PENTE_MAX_DEG = 2;
/** Les proportions du plan sont tenues a cette part pres (ECART_RAPPORT de la recherche). */
const ECART_RAPPORT = 0.3;
/** Les autres poses que l'on juge quand celle des aretes n'explique pas la photo. */
const AUTRES_POSES = 6;
/** La matiere lue le long des bouts doit couvrir au moins cette part du mur entre eux pour que la pose compte en entier. */
const MATIERE_MIN = 0.5;
/** La pose du plan seul : la plus grande, aux proportions du plan, dans cette part de ce que l'assemblage montre, centree. */
const PART_PLAN_SEUL = 0.8;
/** Les colonnes ou se lit la silhouette, regulierement de l'un de ses bouts a l'autre. */
const COLONNES_SILHOUETTE = 40;
/** Les colonnes trop pres d'un bout de la silhouette (en part de la largeur du mur) ne se lisent pas : l'angle y est, pas le haut. */
const BOUT_SILHOUETTE = 0.02;
/**
 * Les bandes lues de part et d'autre du haut pose par la silhouette, en part de la largeur du mur : a partir de 2,5 % de lui, sur 2 %.
 * L'ecart laisse passer un egout juste a la tolerance d'un bord (`calageEcartMaxPart`, 3 %) ; un egout a 4 % ou plus a du mur dans la
 * bande du dessus (ou du ciel dans celle du dessous) et echoue. Collees au haut, elles refusaient un egout a 1 % (scene 24 : 0,36).
 */
const BANDE_SILHOUETTE: readonly [number, number] = [0.025, 0.045];

/** La hauteur du gabarit en `u` (part de la hauteur du mur), entre ses sommets ; ses bouts au-dela. */
function hauteurDuGabarit(g: GabaritMur, u: number): number {
  const a = g[0], b = g[g.length - 1];
  if (!a || !b) return 1;
  if (u <= a.u) return a.v;
  if (u >= b.u) return b.v;
  for (let i = 0; i + 1 < g.length; i++) {
    const p = g[i] as { u: number; v: number }, q = g[i + 1] as { u: number; v: number };
    if (u >= p.u && u <= q.u) return q.u > p.u ? p.v + ((q.v - p.v) * (u - p.u)) / (q.u - p.u) : Math.max(p.v, q.v);
  }
  return 1;
}

/** La part des cases de mur dans un rectangle de l'image (cases de quelques pixels, moyennes des pixels vus) ; null s'il n'y a rien de vu. */
function partDeMur(m: Vue, mat: NonNullable<ReturnType<typeof matiereDuMur>>, x0: number, y0: number, x1: number, y1: number, pas: number): number | null {
  const { largeur: L, hauteur: H, donnees: d } = m.image;
  const a = Math.max(0, Math.round(Math.min(x0, x1))), b = Math.min(L - 1, Math.round(Math.max(x0, x1)));
  const c = Math.max(0, Math.round(Math.min(y0, y1))), e = Math.min(H - 1, Math.round(Math.max(y0, y1)));
  let vues = 0, murs = 0;
  for (let y = c; y <= e; y += pas) for (let x = a; x <= b; x += pas) {
    let R = 0, G = 0, B = 0, n = 0;
    for (let yy = y; yy < Math.min(e + 1, y + pas); yy++) for (let xx = x; xx < Math.min(b + 1, x + pas); xx++) {
      const i = yy * L + xx;
      if (!m.vu[i]) continue;
      R += d[i * 4] ?? 0; G += d[i * 4 + 1] ?? 0; B += d[i * 4 + 2] ?? 0; n++;
    }
    if (!n) continue;
    vues++;
    const s = R + G + B + n, l = s / n;
    if (Math.hypot(R / s - mat.cr, G / s - mat.cg) < mat.ecart && l >= mat.lumiere[0] * mat.l && l <= mat.lumiere[1] * mat.l) murs++;
  }
  return vues ? murs / vues : null;
}

/** La part de [a, b] que couvrent les segments presque paralleles a l'axe (`vertical`) qui passent a moins de `tol` de `p`. */
function couvertureArete(segs: readonly Segment[], vertical: boolean, p: number, a: number, b: number, tol: number): number {
  if (!(b > a)) return 0;
  const lignes = segs.filter((g) => {
    const penche = vertical ? Math.atan2(Math.abs(g.x2 - g.x1), Math.abs(g.y2 - g.y1)) : Math.atan2(Math.abs(g.y2 - g.y1), Math.abs(g.x2 - g.x1));
    return penche < (PENTE_MAX_DEG * Math.PI) / 180 && Math.abs((vertical ? g.x1 + g.x2 : g.y1 + g.y2) / 2 - p) <= tol;
  }).map((g) => (vertical ? [Math.min(g.y1, g.y2), Math.max(g.y1, g.y2)] : [Math.min(g.x1, g.x2), Math.max(g.x1, g.x2)]) as [number, number]);
  const n = 50;
  let k = 0;
  for (let i = 0; i < n; i++) { const t = a + ((i + 0.5) * (b - a)) / n; if (lignes.some(([u, v]) => t >= u && t <= v)) k++; }
  return k / n;
}

const borne = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Ce qu'une pose explique de la photo, sans le toit : la matiere du mur qui s'arrete aux deux angles (et une verticale qui les longe),
 * l'egout (une horizontale, ou la matiere qui commence aux angles), le sol (la matiere qui finit), les proportions du plan (`rapport`,
 * hauteur sur largeur ; sans plan, elles ne comptent pas contre la pose). Au-dessus de l'egout et sous le sol, une bande hors de ce
 * que l'image montre ne compte pas pour du mur. Un angle, lui, se voit ou ne s'explique pas : un mur pose sur le bord de l'image (le
 * cadre de l'assemblage dessine aussi des aretes) ne dit pas ou finit la matiere. `pourLaTeinte` : la vue ou se lit la teinte du mur
 * (par defaut la meme).
 */
export function expliquer(m: Vue, segs: readonly Segment[], r: Rect, rapport: number | null, pourLaTeinte: Vue = m, gabarit: GabaritMur | null = null): Explication {
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  const g = gabarit && gabarit.length >= 2 ? gabarit : null;
  const ecartEgout = g ? { ecartEgout: ecartDEgout(rapport, r) } : {};
  // Les angles sont aux bouts de la silhouette : un bout du mur que le gabarit prolonge (u hors de 0 a 1) n'est pas un angle, la matiere
  // y continue ; le bout du gabarit l'est. Chacun se lit sous le haut du gabarit a ce bout (`hauts`).
  const ug0 = g ? Math.min(0, (g[0] as { u: number }).u) : 0, ug1 = g ? Math.max(1, (g[g.length - 1] as { u: number }).u) : 1;
  const hauts: [number, number] = [g ? hauteurDuGabarit(g, ug0) : 1, g ? hauteurDuGabarit(g, ug1) : 1];
  // La teinte se lit ou se lisent les angles : le haut du mur, au-dessus d'une haie ou d'une voiture contre un angle, sur `pourLaTeinte`.
  // Quand aucun bout ne monte a l'egout (une partie haute au milieu, une partie basse a chaque bout : scene 26), les rangees du haut
  // sont le ciel et la bande de toit aux deux bouts, et la teinte lue serait la leur (score 0,19 pour la pose juste) : chaque bout se lit
  // alors sous son propre haut, comme ses angles. Un bout a l'egout suffit a la dire (le mur en L de la scene 25 : 0,99), et la teinte
  // s'y lit comme avant.
  const sousLeHaut = (v: number): readonly [number, number] => { const hv = Math.min(1, v); return [1 - hv + RANGEES_ANGLE[0] * hv, 1 - hv + RANGEES_ANGLE[1] * hv]; };
  const basAuxDeuxBouts = Math.max(...hauts) < 1;
  const mat = w > 0 && h > 0 ? (basAuxDeuxBouts ? matiereDuMur(pourLaTeinte, r, sousLeHaut(hauts[0]), sousLeHaut(hauts[1])) : matiereDuMur(pourLaTeinte, r, RANGEES_ANGLE)) : null;
  if (!mat) return { score: 0, angles: [0, 0], egout: 0, sol: 0, proportions: 0, matiere: 0, silhouette: !!g, ...ecartEgout };
  const pas = Math.max(2, Math.round(0.005 * w));
  const part = (x0: number, y0: number, x1: number, y1: number) => partDeMur(m, mat, x0, y0, x1, y1, pas);
  const [b0, b1] = BANDE_ANGLE;
  // Un angle se lit sur les rangees du haut du mur, sous l'egout ; au bout d'une silhouette qui deborde (le pignon d'un corps voisin
  // dans le prolongement), sous le haut de ce bout quand il est plus bas que l'egout.
  const angle = (x: number, sens: 1 | -1, v = 1) => {
    const hv = Math.min(1, v) * h, ya = r.y1 - hv + RANGEES_ANGLE[0] * hv, yb = r.y1 - hv + RANGEES_ANGLE[1] * hv;
    const dedans = part(x + sens * b0 * w, ya, x + sens * b1 * w, yb) ?? 0, dehors = part(x - sens * b1 * w, ya, x - sens * b0 * w, yb) ?? 1;
    return PART_MATIERE_ANGLE * borne(dedans - dehors) + (1 - PART_MATIERE_ANGLE) * couvertureArete(segs, true, x, r.y1 - hv, r.y1, PROCHE_ARETE * w);
  };
  const ya = r.y0 + RANGEES_ANGLE[0] * h, yb = r.y0 + RANGEES_ANGLE[1] * h;
  const [c0, c1] = BANDE_BORD;
  // L'egout : aux deux angles, la matiere commence sous lui (un pignon monte des l'angle, une bande de tuiles ou le ciel est au-dessus).
  const debut = (xa: number, xb: number) => borne((part(xa, r.y0 + c0 * w, xb, r.y0 + c1 * w) ?? 0) - (part(xa, r.y0 - c1 * w, xb, r.y0 - c0 * w) ?? 0));
  const egoutMatiere = (debut(r.x0 + 0.01 * w, r.x0 + 0.04 * w) + debut(r.x1 - 0.04 * w, r.x1 - 0.01 * w)) / 2;
  // Avec le gabarit : la silhouette accrochee a la pose (son egout et son sol ; un test de l'egout trouve, pas la pose du gabarit, qui se
  // fait sur le sol a l'echelle de la largeur) explique le haut de la matiere, colonne par colonne, d'un
  // bout de la silhouette a l'autre ; un egout pose trop bas laisse du mur au-dessus d'elle, un egout trop haut du ciel sous elle. Un
  // rectangle n'est que l'egout, d'un angle a l'autre.
  const egout = g ? egoutParLaSilhouette(g, r, (xa, ya0, xb, yb0) => part(xa, ya0, xb, yb0), BANDE_SILHOUETTE[0], BANDE_SILHOUETTE[1], basAuxDeuxBouts) : Math.max(egoutMatiere, couvertureArete(segs, false, r.y0, r.x0, r.x1, PROCHE_ARETE * w));
  const solMatiere = borne((part(r.x0 + 0.05 * w, r.y1 - c1 * w, r.x1 - 0.05 * w, r.y1 - c0 * w) ?? 0) - (part(r.x0 + 0.05 * w, r.y1 + c0 * w, r.x1 - 0.05 * w, r.y1 + c1 * w) ?? 0));
  const sol = Math.max(solMatiere, couvertureArete(segs, false, r.y1, r.x0, r.x1, PROCHE_ARETE * w));
  const ecart = rapport && rapport > 0 ? Math.abs(h / w / rapport - 1) : 0;
  const proportions = borne(1 - Math.max(0, ecart - ECART_RAPPORT) / ECART_RAPPORT);
  // Chaque angle se lit sous le haut du gabarit a ce bout : au bout bas d'un mur en L (un garage dans l'alignement, scene 25), les
  // rangees sous l'egout haut sont le ciel au-dessus de la partie basse (0,38 pour la pose juste). Un rectangle, un pignon : 1.
  const angles: [number, number] = [angle(r.x0 + ug0 * w, 1, hauts[0]), angle(r.x0 + ug1 * w, -1, hauts[1])];
  const matiere = part(r.x0 + 0.05 * w, ya, r.x1 - 0.05 * w, yb) ?? 0;
  const score = (POIDS.angle * (angles[0] + angles[1]) + POIDS.egout * egout + POIDS.sol * sol + POIDS.proportions * proportions) * Math.min(1, matiere / MATIERE_MIN);
  return { score: Math.round(score * 1000) / 1000, angles, egout, sol, proportions, matiere, silhouette: !!g, ...ecartEgout };
}

/**
 * L'egout juge par la silhouette du gabarit posee sur la pose : sur COLONNES_SILHOUETTE colonnes de l'un de ses bouts a l'autre, la
 * matiere du mur sous le haut pose, et pas au-dessus (des bandes de `c0` a `c1` de la largeur du mur), de 0 a 1 en moyenne. `part` : la
 * part de mur d'un rectangle de l'image (null : rien de vu ; au-dessus de l'image, rien de vu ne compte pas pour du mur).
 */
function egoutParLaSilhouette(g: GabaritMur, r: Rect, part: (x0: number, y0: number, x1: number, y1: number) => number | null, c0: number, c1: number, basAuxDeuxBouts = false): number {
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  const u0 = Math.min(0, (g[0] as { u: number }).u) + BOUT_SILHOUETTE, u1 = Math.max(1, (g[g.length - 1] as { u: number }).u) - BOUT_SILHOUETTE;
  const pasU = (u1 - u0) / COLONNES_SILHOUETTE;
  let somme = 0, n = 0;
  // Les paliers de la silhouette : les suites de colonnes a l'egout (ou au-dessus, un pignon) et celles sous lui (une partie basse).
  const paliers: { haut: boolean; somme: number; n: number }[] = [];
  for (let k = 0; k < COLONNES_SILHOUETTE; k++) {
    const u = u0 + (k + 0.5) * pasU, x = r.x0 + u * w, y = r.y1 - hauteurDuGabarit(g, u) * h;
    const xa = x - (pasU * w) / 2, xb = x + (pasU * w) / 2;
    const dessous = part(xa, y + c0 * w, xb, y + c1 * w);
    if (dessous === null) continue;
    const v = borne(dessous - (part(xa, y - c1 * w, xb, y - c0 * w) ?? 0));
    somme += v;
    n++;
    const haut = hauteurDuGabarit(g, u) >= 1 - 1e-9, dernier = paliers[paliers.length - 1];
    if (dernier && dernier.haut === haut) { dernier.somme += v; dernier.n++; } else paliers.push({ haut, somme: v, n: 1 });
  }
  if (!n) return 0;
  // L'egout du mur doit s'expliquer la ou il est : sous une partie haute plus etroite que les parties basses (une partie basse a chaque
  // bout, scene 26), la moyenne de toutes les colonnes passait un egout pose 60 cm trop haut ou trop bas (les parties basses suivent la
  // pose en proportion). L'egout se juge aussi sur les seules colonnes a sa hauteur, et le moins bon des deux compte. Quand aucun bout ne
  // monte a l'egout (`basAuxDeuxBouts`), chaque partie basse doit aussi s'expliquer a son egout : le garage pris pour le mur entier (la
  // calibration, sans capteurs) a un haut qui explique la partie haute, mais ses parties basses tombent dans le mur (0,41 en moyenne,
  // 0 palier par palier). Un rectangle, un pignon (un seul palier) : la moyenne, comme avant ; le mur en L (scene 25), comme le
  // 2 novembre 2026, au bit pres.
  if (paliers.length < 2) return somme / n;
  const hauts = paliers.filter((q) => q.haut), haut = hauts.reduce((a, q) => a + q.somme, 0) / Math.max(1, hauts.reduce((a, q) => a + q.n, 0));
  return basAuxDeuxBouts ? Math.min(somme / n, ...paliers.map((q) => q.somme / q.n)) : hauts.length ? Math.min(somme / n, haut) : somme / n;
}

/**
 * La pose du plan seul : aux proportions du plan, centree sur ce que l'assemblage montre, la plus grande qui tienne dans PART_PLAN_SEUL
 * de lui. Rien n'y est lu : ses drapeaux sont faux, la personne pose les angles.
 */
function poseDuPlanSeul(m: Vue, rapport: number | null): MurLu {
  const { largeur: L, hauteur: H } = m.image;
  let x0 = L, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) if (m.vu[y * L + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < x0) { x0 = 0; x1 = L - 1; y0 = 0; y1 = H - 1; }
  const k = rapport && rapport > 0 ? rapport : (y1 - y0) / Math.max(1, x1 - x0);
  const w = Math.min(PART_PLAN_SEUL * (x1 - x0), (PART_PLAN_SEUL * (y1 - y0)) / k), h = k * w;
  const xc = (x0 + x1) / 2, yc = (y0 + y1) / 2;
  return { x0: xc - w / 2, x1: xc + w / 2, y0: yc - h / 2, y1: yc + h / 2, egout: false, pied: false, cotes: false };
}

/**
 * Le test d'explication : le score au moins a son seuil, et chacun des deux angles au sien. Un seul angle juste (la moitie du mur, un
 * bout pris sur une fenetre) n'explique pas la photo, si bien que le reste de la pose la decrive.
 */
export const expliqueLaPhoto = (e: Explication, s: SeuilsCalage): boolean => e.score >= s.score && Math.min(...e.angles) >= s.angle && (!e.silhouette || e.egout >= s.egout);

/**
 * Le controle de l'egout trouve par le gabarit pose (decision du proprietaire, 4 novembre 2026) : l'ecart entre les deux au plus
 * `ecartEgout` de la largeur. L'E7 en tient compte (a confirmer au-dela), pas le test de la pose. Vrai sans gabarit, sans seuil ou sans ecart.
 */
export const egoutControle = (e: Explication, s: SeuilsCalage): boolean => s.ecartEgout === undefined || e.ecartEgout === null || e.ecartEgout === undefined || Math.abs(e.ecartEgout) <= s.ecartEgout;

/**
 * L'arbitre du calage (§5) : la premiere pose (celle des aretes) est gardee si elle explique la photo (expliqueLaPhoto) ; sinon,
 * parmi les autres poses que les aretes dessinent, celle qui l'explique le mieux, si elle passe le test (les deux chemins divergent :
 * la pose est a confirmer) ; sinon la pose du plan seul, supposee. Chaque pose est d'abord affinee par la teinte du mur
 * (affinerEgoutEtSol). Les drapeaux (egout, pied, cotes) ne disent « trouve » que d'une pose qui passe le test. La pose de Claude et
 * ses zones de colombage n'y sont pas candidates (decision du proprietaire, 3 novembre 2026) : dans l'audit, Claude lit le mur retenu.
 */
export function calerParLesAncres(m: Vue, segs: readonly Segment[], poses: readonly MurLu[], rapport: number | null, seuils: SeuilsCalage): MurCale {
  const notee = (p: MurLu) => { const a = affinerEgoutEtSol(m, segs, p, rapport); return { a, e: expliquer(m, segs, a, rapport) }; };
  const [premiere, ...autres] = poses;
  const p0 = premiere ? notee(premiere) : null;
  if (p0 && expliqueLaPhoto(p0.e, seuils)) return { ...p0.a, calage: { retenue: 'aretes', explication: p0.e, aretes: null, seuils } };
  const aretes = p0 ? { x0: p0.a.x0, x1: p0.a.x1, y0: p0.a.y0, y1: p0.a.y1, score: p0.e.score } : null;
  let mieux: ReturnType<typeof notee> | null = null;
  for (const p of autres.slice(0, AUTRES_POSES)) {
    const q = notee(p);
    if (expliqueLaPhoto(q.e, seuils) && (!mieux || q.e.score > mieux.e.score)) mieux = q;
  }
  if (mieux) return { ...mieux.a, calage: { retenue: 'mieux-expliquee', explication: mieux.e, aretes, seuils } };
  const plan = poseDuPlanSeul(m, rapport);
  return { ...plan, calage: { retenue: 'plan-seul', explication: expliquer(m, segs, plan, rapport), aretes, seuils } };
}
