// Le calage du mur par ses ancres (MD/spec-facade-calage-audit.md §4 E4, §5) : une pose du mur sur l'assemblage (ses bouts, son
// egout, son sol) se juge sur ce qui ne depend pas du toit. Les deux angles du mur sont des bords de sa matiere (du mur d'un cote, autre
// chose de l'autre, sous l'egout), l'egout est une horizontale ou le haut de la matiere aux angles, le sol la fin de la matiere, et les
// proportions sont celles du plan a 30 % pres. Le gabarit n'y entre pas : il vient du toit calcule, qui est ce que la photo met en
// question (§5 bis) ; s'en servir pour caler masquerait l'ecart que l'on cherche a voir.
//
// Sur AE 101 (facade sud), le rectangle des aretes retenait un bloc de pignon, un mur de 302 px au lieu de 610 : ses bouts tombaient
// au milieu de l'enduit, que rien ne faisait finir la. Le score le dit, et l'arbitre prend alors la pose qui explique la photo, ou,
// quand aucune ne l'explique, la pose du plan seul, dite supposee : jamais un « trouve » sur une pose qui echoue au test.
//
// Pur, sans DOM. Les seuils sont des reglages (regles/facades/enchainement.json).

import type { Image } from '../vision/homographie.js';
import { affinerEgoutEtSol, matiereDuMur, type MurLu, type Rect } from '../vision/mosaiqueFuites.js';
import { objectifsEnchainement, type Objectifs } from '../regles/facades/enchainement.js';

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
   * La part du mur, entre ses angles, qui a la matiere lue le long de ses bouts. Les baies en prennent une part ; quand la matiere
   * n'est pas celle de la plus grande part du mur, ce n'est pas le mur (deux fenetres prises pour ses bouts) : le score la suit.
   */
  matiere: number;
}

/** D'ou vient la pose retenue : les aretes (elles expliquent la photo), une autre pose qui l'explique mieux, ou le plan seul. */
type PoseRetenue = 'aretes' | 'mieux-expliquee' | 'plan-seul';

/** Le calage par les ancres : la pose retenue, son explication, et celle des aretes quand elle n'a pas ete retenue. */
interface CalageParAncres {
  retenue: PoseRetenue;
  explication: Explication;
  /** La pose des aretes (affinee par la teinte) et son score, quand une autre l'a remplacee : l'ecran la montre a cote. */
  aretes: (Rect & { score: number }) | null;
  /**
   * La pose candidate de Claude (ses deux angles, lot F2), affinee par la teinte et jugee comme les autres : son score, et si c'est
   * elle qui a ete retenue. Absente sans reponse de Claude.
   */
  ia?: Rect & { score: number; retenue: boolean };
  /**
   * Les poses ecartees parce qu'elles tiennent dans une zone de colombage que Claude voit (leurs bouts suivent les bois, pas les angles
   * du mur), et ces zones. Absent sans zone.
   */
  colombage?: { zones: Rect[]; ecartees: Rect[] };
  /** Les seuils du test, tels qu'ils ont ete appliques. */
  seuils: SeuilsCalage;
}

/** Les seuils du test d'explication : le score, et chacun des deux angles (regles/facades/enchainement.json). */
export interface SeuilsCalage { score: number; angle: number }

/** Les seuils du test d'explication tires des objectifs de l'enchainement (ceux livres, sauf surcharge). */
export const seuilsDuCalage = (o: Objectifs = objectifsEnchainement()): SeuilsCalage => ({ score: o['facades.enchainement.explicationMin'], angle: o['facades.enchainement.angleMin'] });

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
 * (par defaut la meme ; sans les zones d'un autre parement quand Claude en voit).
 */
export function expliquer(m: Vue, segs: readonly Segment[], r: Rect, rapport: number | null, pourLaTeinte: Vue = m): Explication {
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  // La teinte se lit ou se lisent les angles : le haut du mur, au-dessus d'une haie ou d'une voiture contre un angle ; hors des zones
  // d'un autre parement quand Claude en voit (`pourLaTeinte` : le colombage n'y est pas vu), pour lire celle du parement principal.
  const mat = w > 0 && h > 0 ? matiereDuMur(pourLaTeinte, r, RANGEES_ANGLE) : null;
  if (!mat) return { score: 0, angles: [0, 0], egout: 0, sol: 0, proportions: 0, matiere: 0 };
  const pas = Math.max(2, Math.round(0.005 * w));
  const part = (x0: number, y0: number, x1: number, y1: number) => partDeMur(m, mat, x0, y0, x1, y1, pas);
  const ya = r.y0 + RANGEES_ANGLE[0] * h, yb = r.y0 + RANGEES_ANGLE[1] * h;
  const [b0, b1] = BANDE_ANGLE;
  const angle = (x: number, sens: 1 | -1) => {
    const dedans = part(x + sens * b0 * w, ya, x + sens * b1 * w, yb) ?? 0, dehors = part(x - sens * b1 * w, ya, x - sens * b0 * w, yb) ?? 1;
    return PART_MATIERE_ANGLE * borne(dedans - dehors) + (1 - PART_MATIERE_ANGLE) * couvertureArete(segs, true, x, r.y0, r.y1, PROCHE_ARETE * w);
  };
  const [c0, c1] = BANDE_BORD;
  // L'egout : aux deux angles, la matiere commence sous lui (un pignon monte des l'angle, une bande de tuiles ou le ciel est au-dessus).
  const debut = (xa: number, xb: number) => borne((part(xa, r.y0 + c0 * w, xb, r.y0 + c1 * w) ?? 0) - (part(xa, r.y0 - c1 * w, xb, r.y0 - c0 * w) ?? 0));
  const egoutMatiere = (debut(r.x0 + 0.01 * w, r.x0 + 0.04 * w) + debut(r.x1 - 0.04 * w, r.x1 - 0.01 * w)) / 2;
  const egout = Math.max(egoutMatiere, couvertureArete(segs, false, r.y0, r.x0, r.x1, PROCHE_ARETE * w));
  const solMatiere = borne((part(r.x0 + 0.05 * w, r.y1 - c1 * w, r.x1 - 0.05 * w, r.y1 - c0 * w) ?? 0) - (part(r.x0 + 0.05 * w, r.y1 + c0 * w, r.x1 - 0.05 * w, r.y1 + c1 * w) ?? 0));
  const sol = Math.max(solMatiere, couvertureArete(segs, false, r.y1, r.x0, r.x1, PROCHE_ARETE * w));
  const ecart = rapport && rapport > 0 ? Math.abs(h / w / rapport - 1) : 0;
  const proportions = borne(1 - Math.max(0, ecart - ECART_RAPPORT) / ECART_RAPPORT);
  const angles: [number, number] = [angle(r.x0, 1), angle(r.x1, -1)];
  const matiere = part(r.x0 + 0.05 * w, ya, r.x1 - 0.05 * w, yb) ?? 0;
  const score = (POIDS.angle * (angles[0] + angles[1]) + POIDS.egout * egout + POIDS.sol * sol + POIDS.proportions * proportions) * Math.min(1, matiere / MATIERE_MIN);
  return { score: Math.round(score * 1000) / 1000, angles, egout, sol, proportions, matiere };
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
export const expliqueLaPhoto = (e: Explication, s: SeuilsCalage): boolean => e.score >= s.score && Math.min(...e.angles) >= s.angle;

/**
 * L'arbitre du calage (§5) : la premiere pose (celle des aretes) est gardee si elle explique la photo (expliqueLaPhoto) ; sinon,
 * parmi les autres poses que les aretes dessinent, celle qui l'explique le mieux, si elle passe le test (les deux chemins divergent :
 * la pose est a confirmer) ; sinon la pose du plan seul, supposee. Chaque pose est d'abord affinee par la teinte du mur
 * (affinerEgoutEtSol). Les drapeaux (egout, pied, cotes) ne disent « trouve » que d'une pose qui passe le test. `poseIa` : la pose
 * de Claude (ses deux angles, lot F2), jugee comme une autre pose, la premiere d'entre elles ; sans elle, rien ne change.
 * `colombage` : la decision du moteur sur les zones de colombage que Claude voit (facade/regles/facades/ia.ts) : une pose qu'elle
 * ecarte ne se juge pas (ses bouts suivent les bois, pas les angles du mur), et la teinte du mur se lit hors des zones ; sans
 * decision, rien ne change.
 */
export function calerParLesAncres(m: Vue, segs: readonly Segment[], poses: readonly MurLu[], rapport: number | null, seuils: SeuilsCalage, poseIa: MurLu | null = null, colombage: Colombage | null = null): MurCale {
  // La teinte du parement principal se lit hors du colombage ; sans decision, rien ne change.
  const vueTeinte = colombage ? horsDesZones(m, colombage.zones) : m;
  const notee = (p: MurLu) => { const a = affinerEgoutEtSol(m, segs, p, rapport); return { a, e: expliquer(m, segs, a, rapport, vueTeinte) }; };
  const ecartees: Rect[] = [];
  const admise = (p: MurLu | undefined): p is MurLu => { if (!p) return false; if (!colombage?.ecarte(p)) return true; ecartees.push({ x0: p.x0, x1: p.x1, y0: p.y0, y1: p.y1 }); return false; };
  const [premiere, ...reste] = poses;
  const p0 = admise(premiere) ? notee(premiere) : null;
  const autres = reste.filter(admise);
  // La pose de Claude est une candidate de plus, jugee par le meme score, la premiere des autres : la regle ne change pas.
  const pIa = poseIa ? notee(poseIa) : null;
  const plus = (retenue: boolean) => ({ ...(pIa ? { ia: { x0: pIa.a.x0, x1: pIa.a.x1, y0: pIa.a.y0, y1: pIa.a.y1, score: pIa.e.score, retenue } } : {}), ...(colombage ? { colombage: { zones: [...colombage.zones], ecartees } } : {}) });
  if (p0 && expliqueLaPhoto(p0.e, seuils)) return { ...p0.a, calage: { retenue: 'aretes', explication: p0.e, aretes: null, seuils, ...plus(false) } };
  const aretes = p0 ? { x0: p0.a.x0, x1: p0.a.x1, y0: p0.a.y0, y1: p0.a.y1, score: p0.e.score } : null;
  let mieux: ReturnType<typeof notee> | null = pIa && expliqueLaPhoto(pIa.e, seuils) ? pIa : null;
  for (const p of autres.slice(0, AUTRES_POSES)) {
    const q = notee(p);
    if (expliqueLaPhoto(q.e, seuils) && (!mieux || q.e.score > mieux.e.score)) mieux = q;
  }
  if (mieux) return { ...mieux.a, calage: { retenue: 'mieux-expliquee', explication: mieux.e, aretes, seuils, ...plus(mieux === pIa) } };
  const plan = poseDuPlanSeul(m, rapport);
  return { ...plan, calage: { retenue: 'plan-seul', explication: expliquer(m, segs, plan, rapport, vueTeinte), aretes, seuils, ...plus(false) } };
}

/**
 * La decision du colombage que l'arbitre applique (facade/regles/facades/ia.ts::decisionColombage, la regle et ses seuils) : les zones
 * de colombage que Claude voit, et la pose qu'elles ecartent. L'arbitre ne lit pas la reponse de Claude : il applique la decision.
 */
export interface Colombage { zones: Rect[]; ecarte(p: Rect): boolean }

/** La vue sans les zones donnees (leurs pixels ne sont plus vus) : la teinte du mur s'y lit hors du colombage. */
function horsDesZones(m: Vue, zones: readonly Rect[]): Vue {
  const L = m.image.largeur, H = m.image.hauteur, vu = new Uint8Array(m.vu);
  for (const z of zones) {
    for (let y = Math.max(0, Math.floor(z.y0)); y < Math.min(H, Math.ceil(z.y1)); y++) vu.fill(0, y * L + Math.max(0, Math.floor(z.x0)), y * L + Math.min(L, Math.ceil(z.x1)));
  }
  return { image: m.image, vu };
}
