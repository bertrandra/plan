// Le cadrage d'une vue tiree d'un 360 (demande du proprietaire, 15 novembre 2026, « niveau suivant » n° 1 et 2). Jusqu'ici toutes les
// vues avaient 75 degres de champ et 8 degres vers le haut : un immeuble de la rue de Rivoli y perdait ses etages, un pavillon vu de
// seize metres n'en remplissait pas le tiers. Ici le champ et le tangage se calculent pour que la facade visee entre dans le cadre, du
// pied au faite : sa hauteur (BD TOPO), sa distance et la largeur du cote vu. Et, a la demande, la vue « face au mur » : l'axe optique
// perpendiculaire au cote du contour, le cadre decentre sur le plan image (equirect.ts::vueSurLePlan), verticales droites.
// Meme forme d'image (4/3) et meme taille de sortie dans tous les cas. Sans hauteur connue, les valeurs d'avant. Sans DOM, testable seul.

import { vueDuPanoramique, vueSurLePlan, type ImageRgba } from './equirect.js';
import { HAUTEUR_APPAREIL_M, type Batiment } from './facadesVues.js';
import { distanceAuSegment, murDeVue, segments, type Segment } from './murVise.js';
import { CHAMP_VUE, type VueAExtraire } from './panoramax.js';
import type { Ll } from './parcelles.js';

const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;
const borner = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ecart = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

/** Le tangage d'avant (une vue de facade regarde un peu vers le haut) et la forme de toutes les vues (largeur sur hauteur). */
export const TANGAGE_DEFAUT = 8;
export const FORME = 4 / 3;
/** Les bornes du cadrage (demande du proprietaire) : en deca de 40 degres le panoramique n'a plus assez de pixels, au-dela de 100 l'image se deforme. */
export const CHAMP_MIN = 40, CHAMP_MAX = 100;
export const TANGAGE_MIN = 0, TANGAGE_MAX = 35;
/** L'air laisse autour de la facade, en part de ce qu'elle occupe : le toit, le trottoir, les voisins. */
export const MARGE = 0.12;
/**
 * La hauteur de la BD TOPO s'arrete a la gouttiere : le toit (un comble de pavillon, un brisis d'immeuble) monte au-dessus. Vu au
 * Vesinet (15 novembre 2026) : sans cette part, le cadre coupait les pignons et les lucarnes.
 */
export const hauteurAvecToit = (h: number): number => h + Math.min(4, 0.45 * h);
/**
 * Un 360 n'a que tant de pixels par degre : en deca de ce champ, la vue de 1 600 px serait agrandie plus de deux fois (vu au Vesinet :
 * des panoramiques de 5 660 px, flous a 40 degres). 6 000 px au plus : l'import ramene les plus grands a cette largeur.
 */
export const LARGEUR_SORTIE = 1600, LARGEUR_PANO_MAX = 6000;
export function champMinDuPano(largeurPx: number | null | undefined): number {
  if (!largeurPx || !(largeurPx > 0)) return CHAMP_MIN;
  return Math.round(borner((360 * (LARGEUR_SORTIE / 2)) / Math.min(largeurPx, LARGEUR_PANO_MAX), CHAMP_MIN, CHAMP_VUE));
}
/** Au-dela de cet ecart du cap, un bout de mur n'est plus cherche : le cadre ne peut de toute facon pas le prendre. */
const DEMI_CHAMP_UTILE = 60;

/**
 * Le cadre d'une vue : son champ horizontal et son tangage ; `source` dit d'ou il vient (« defaut » : les valeurs d'avant, faute de
 * hauteur ou de mur ; « facade » : calcule ; « main » : retouche dans « Choisir les vues ») ; `entier` : la facade y tient du pied au
 * faite (faux : un immeuble vu de trop pres, on garde le haut). `plan` : la vue face au mur, quand elle est demandee et possible.
 */
export interface CadreDeVue {
  champ: number; tangage: number; source: 'defaut' | 'facade' | 'main'; entier?: boolean;
  plan?: { axe: number; x0: number; x1: number; y0: number; y1: number };
}

export const CADRE_DEFAUT: CadreDeVue = { champ: CHAMP_VUE, tangage: TANGAGE_DEFAUT, source: 'defaut' };

/** Le champ vertical d'une vue de champ horizontal `champ`, en degres. */
export const champVertical = (champ: number): number => 2 * deg(Math.atan(Math.tan(rad(champ / 2)) / FORME));
const champPourVertical = (v: number): number => 2 * deg(Math.atan(Math.tan(rad(Math.min(v, 170) / 2)) * FORME));

/**
 * Ce qu'une vue voit du batiment : ses bouts de part et d'autre du cap (degres), sur tout son contour (une maison vue de coin montre
 * deux cotes, et la couper au cote vise la coupait en deux), et la distance au plus proche des murs du cote vise (c'est lui qui monte
 * le plus haut dans le cadre).
 */
function batimentVu(segs: readonly Segment[], cote: number, cap: number): { gauche: number; droite: number; distance: number } | null {
  let gauche = Infinity, droite = -Infinity, distance = Infinity;
  for (const s of segs) {
    const a = ecart(cap, deg(Math.atan2(s.ax, s.ay))), b = ecart(cap, deg(Math.atan2(s.bx, s.by)));
    // Un mur derriere la prise de vue, ou tout entier hors de ce qu'un cadre peut prendre, ne compte pas.
    if (Math.abs(a - b) > 180 || Math.min(a, b) > DEMI_CHAMP_UTILE || Math.max(a, b) < -DEMI_CHAMP_UTILE) continue;
    gauche = Math.min(gauche, Math.max(-DEMI_CHAMP_UTILE, Math.min(a, b)));
    droite = Math.max(droite, Math.min(DEMI_CHAMP_UTILE, Math.max(a, b)));
    if (s.cote === cote) distance = Math.min(distance, distanceAuSegment(s));
  }
  return Number.isFinite(distance) && distance > 0.5 ? { gauche, droite, distance } : null;
}

/**
 * Le champ et le tangage qui font entrer la facade dans le cadre : en largeur, le cote vu de part et d'autre du cap (le tri a deja
 * tourne la vue vers son milieu) ; en hauteur, du pied du mur a son faite, a la distance du plus proche de ses murs. Quand les bornes
 * ne suffisent pas (un immeuble de vingt metres vu de quatre), on garde le haut : ce sont les etages qu'on perdait, pas le trottoir.
 */
export function cadrerLaFacade(b: Pick<Batiment, 'contour' | 'hauteur'>, pos: Ll, v: { cap: number; cote: number }, champMin = CHAMP_MIN): CadreDeVue {
  if (typeof b.hauteur !== 'number' || !(b.hauteur > HAUTEUR_APPAREIL_M)) return CADRE_DEFAUT;
  const vu = batimentVu(segments(b.contour, pos), v.cote, v.cap);
  if (!vu) return CADRE_DEFAUT;
  const haut = deg(Math.atan((hauteurAvecToit(b.hauteur) - HAUTEUR_APPAREIL_M) / vu.distance)), bas = -deg(Math.atan(HAUTEUR_APPAREIL_M / vu.distance));
  const enLargeur = 2 * Math.max(Math.abs(vu.gauche), Math.abs(vu.droite)) * (1 + MARGE);
  const enHauteur = champPourVertical((haut - bas) * (1 + 2 * MARGE));
  const champ = Math.round(borner(Math.max(enLargeur, enHauteur), Math.max(CHAMP_MIN, champMin), CHAMP_MAX));
  const demi = champVertical(champ) / 2, air = (haut - bas) * MARGE;
  const entier = haut + air / 2 - (bas - air / 2) <= 2 * demi + 0.5;
  // Entiere : centree entre le pied et le faite. Sinon le haut d'abord, avec un peu de ciel.
  const tangage = Math.round(borner(entier ? (haut + bas) / 2 : haut + air / 2 - demi, TANGAGE_MIN, TANGAGE_MAX));
  return { champ, tangage, source: 'facade', entier: entier && haut <= tangage + demi + 0.5 && bas >= tangage - demi - 0.5 };
}

/** En deca, le mur est vu trop en biais pour une vue de face : le cote qui fuit s'etirerait sur des pixels qui n'existent pas. */
export const INCIDENCE_MIN_PLAN_DEG = 50;
/** Jusqu'ou le cadre s'ecarte de l'axe sur le plan image : en largeur (50 degres de part et d'autre du regard) et vers le haut (70 degres). */
const DEMI_LARGEUR_PLAN = Math.tan(rad(50)), HAUT_PLAN_MAX = Math.tan(rad(70)), COTE_PLAN_MAX = Math.tan(rad(68));

/**
 * La vue face au mur : l'axe perpendiculaire au segment vise (`segment`, son rang dans le contour), le cadre pose sur le plan image
 * pour prendre ce mur du pied au faite, autour de la direction du regard, puis elargi a la forme 4/3. Null quand ce n'est pas possible
 * (pas de hauteur, mur vu de trop biais, prise de vue derriere le mur) : la vue garde alors son cadrage ordinaire, et le dit.
 */
export function cadrerSurLeMur(b: Pick<Batiment, 'contour' | 'hauteur'>, pos: Ll, v: { cap: number; segment: number }, champMin = CHAMP_MIN): NonNullable<CadreDeVue['plan']> | null {
  if (typeof b.hauteur !== 'number' || !(b.hauteur > HAUTEUR_APPAREIL_M)) return null;
  const segs = segments(b.contour, pos), s = segs.find((x) => x.rang === v.segment);
  if (!s) return null;
  const axe = (s.azimut + 180) % 360, regard = ecart(axe, v.cap);
  if (Math.abs(regard) > 90 - INCIDENCE_MIN_PLAN_DEG) return null;
  // Dans le repere de l'axe : z devant (vers le mur), x a droite. Le mur est a z constant.
  const dx = Math.sin(rad(axe)), dy = Math.cos(rad(axe)), rx = Math.cos(rad(axe)), ry = -Math.sin(rad(axe));
  const z = s.ax * dx + s.ay * dy;
  if (!(z > 1)) return null;
  // En largeur : tout le batiment (ses coins devant la prise de vue, ramenes sur le plan du mur), pas le seul segment vise.
  let xa = Infinity, xb = -Infinity;
  for (const t of segs) for (const [px, py] of [[t.ax, t.ay], [t.bx, t.by]] as const) {
    const pz = px * dx + py * dy;
    if (pz < 1) continue;
    const x = (px * rx + py * ry) / pz;
    xa = Math.min(xa, x); xb = Math.max(xb, x);
  }
  const milieu = Math.tan(rad(regard));
  let x0 = Math.max(xa, milieu - DEMI_LARGEUR_PLAN, -COTE_PLAN_MAX), x1 = Math.min(xb, milieu + DEMI_LARGEUR_PLAN, COTE_PLAN_MAX);
  if (!(x1 - x0 > 0.05)) return null;
  let y0 = -HAUTEUR_APPAREIL_M / z, y1 = Math.min((hauteurAvecToit(b.hauteur) - HAUTEUR_APPAREIL_M) / z, HAUT_PLAN_MAX);
  const ml = (x1 - x0) * MARGE, mh = (y1 - y0) * MARGE;
  x0 -= ml; x1 += ml; y0 -= mh; y1 += mh;
  // A la forme 4/3 : on elargit le petit cote, a parts egales (en hauteur, plutot vers le ciel que sous le trottoir).
  const l = x1 - x0, h = y1 - y0;
  if (l / h < FORME) { const plus = (h * FORME - l) / 2; x0 -= plus; x1 += plus; }
  else { const plus = l / FORME - h; y1 += plus * 0.7; y0 -= plus * 0.3; }
  // Pas plus serre que ce que le panoramique contient : le cadre s'elargit autour de son milieu jusqu'au champ minimal.
  for (let k = 0; k < 12 && deg(Math.atan(x1) - Math.atan(x0)) < champMin; k++) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    x0 = cx + (x0 - cx) * 1.1; x1 = cx + (x1 - cx) * 1.1; y0 = cy + (y0 - cy) * 1.1; y1 = cy + (y1 - cy) * 1.1;
  }
  const arrondi = (n: number) => Math.round(n * 1000) / 1000;
  return { axe: Math.round(axe * 10) / 10, x0: arrondi(x0), x1: arrondi(x1), y0: arrondi(y0), y1: arrondi(y1) };
}

/** La focale equivalente 24 x 36 d'une vue de ce champ horizontal (36 mm de large) : ce que le redressement par les points de fuite attend. */
export const focaleDuChamp = (champ: number): number => Math.round((18 / Math.tan(rad(champ / 2))) * 10) / 10;

/** Le champ horizontal qu'embrasse un cadre pose sur le plan image, en degres (pour le secteur de la carte et la focale equivalente). */
export const champDuPlan = (p: NonNullable<CadreDeVue['plan']>): number => deg(Math.atan(p.x1) - Math.atan(p.x0));

/** Une retouche de la main (« Choisir les vues ») : le champ de 5 en 5 degres, le tangage de 3 en 3, dans les bornes ; plus de vue sur plan. */
export function retoucher(c: CadreDeVue, dChamp: number, dTangage: number): CadreDeVue {
  return { champ: borner(c.champ + dChamp, CHAMP_MIN, CHAMP_MAX), tangage: borner(c.tangage + dTangage, TANGAGE_MIN, TANGAGE_MAX), source: 'main' };
}

/** Une retouche de la main, gardee comme un ecart au cadre calcule : elle survit a un recalcul (une autre hauteur lue, une vue tournee). */
export interface Retouche { dChamp: number; dTangage: number }
export const cleDeRetouche = (photo: string, cap: number): string => photo + '|' + Math.round(cap);

export interface ReglagesDeCadrage {
  /** Cadrer chaque vue sur sa facade (sinon : 75 degres, 8 vers le haut, comme avant). */
  cadrer: boolean;
  /** Rendre la vue face au mur vise quand c'est possible. */
  surLeMur: boolean;
  retouches: ReadonlyMap<string, Retouche>;
}

/**
 * Le cadre d'une vue d'un 360, selon les reglages : celui de sa facade (son batiment, lu par le tri), puis la vue face au mur si elle
 * est demandee et possible, puis la retouche de la main, qui l'emporte (et rend une vue ordinaire : on ne retouche pas un plan).
 */
export function cadreDeLaVue(b: Batiment | null, photo: { id: string; lat: number; lon: number; largeurPx?: number | null | undefined }, v: Pick<VueAExtraire, 'cap' | 'cote'>, r: ReglagesDeCadrage): CadreDeVue {
  const cote = v.cote, champMin = champMinDuPano(photo.largeurPx);
  let c = r.cadrer && b && typeof cote === 'number' ? cadrerLaFacade(b, photo, { cap: v.cap, cote }, champMin) : CADRE_DEFAUT;
  const t = r.retouches.get(cleDeRetouche(photo.id, v.cap));
  if (t) return retoucher(c, t.dChamp, t.dTangage);
  if (r.surLeMur && b && typeof cote === 'number') {
    const segment = murDeVue(b, photo, { cap: v.cap, cote }).segment;
    const plan = typeof segment === 'number' ? cadrerSurLeMur(b, photo, { cap: v.cap, segment }, champMin) : null;
    if (plan) c = { ...c, plan };
  }
  return c;
}

/** Ce que la carte dessine d'une vue : la direction du milieu de son cadre et son ouverture (une vue sur plan n'est pas centree sur son cap). */
export function secteurDuCadre(cap: number, c: CadreDeVue | undefined): { cap: number; champ: number } {
  if (!c) return { cap, champ: CHAMP_VUE };
  if (!c.plan) return { cap, champ: c.champ };
  const a = deg(Math.atan(c.plan.x0)), b = deg(Math.atan(c.plan.x1));
  return { cap: (((c.plan.axe + (a + b) / 2) % 360) + 360) % 360, champ: b - a };
}

/** La vue telle qu'elle sera importee : sur le plan du mur quand le cadre le dit, sinon la vue ordinaire a son champ et son tangage. */
export function tirerLaVue(pano: ImageRgba, capCentre: number, cap: number, c: CadreDeVue | undefined, largeur: number, hauteur: number): ImageRgba {
  if (c?.plan) return vueSurLePlan(pano, { capCentre, ...c.plan, largeur, hauteur });
  return vueDuPanoramique(pano, { capCentre, cap, tangage: c?.tangage ?? TANGAGE_DEFAUT, champ: c?.champ ?? CHAMP_VUE, largeur, hauteur });
}

/** Ce que les metadonnees gardent du cadre (types.ts::MetaImage.cadrage) : de quoi savoir, au redressement, ce que l'import a deja fait. */
export function cadragePourMeta(c: CadreDeVue | undefined): { cadrage: CadreDeVue; focale35: number | null } {
  const cadre = c ?? CADRE_DEFAUT;
  // Une vue sur plan a son centre optique hors de l'image : sa focale equivalente tromperait le redressement par les points de fuite.
  return { cadrage: cadre, focale35: cadre.plan ? null : focaleDuChamp(cadre.champ) };
}
