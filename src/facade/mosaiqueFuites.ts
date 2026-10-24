// Assembler les photos d'un mur redressees par leurs points de fuite (facade/redressementFuites.ts) en une seule vue de face.
//
// Redressee de face, chaque photo est une vue du plan du mur a sa propre echelle (l'appareil n'etait pas a la meme distance) :
// deux vues ne different que d'une similitude, echelle comprise, presque sans rotation. On la cherche par des points communs
// (ORB, facade/orb.ts) et un RANSAC de similitude (facade/ransac.ts), sur des copies reduites pour aller vite, puis on relie les
// vues de proche en proche autour de celle qui en voit le plus. Une vue qui ne se recale sur aucune reste a part (son motif est
// dit) ; aucune n'est supprimee. Chaque pixel de la mosaique vient de la vue ou il est le plus pres du centre de la photo (le moins
// etire, le moins flou). Pure, sans DOM.

import { apparier, detecterOrb, type DescripteurOrb } from './orb.js';
import { appliquerSimilitude, composer, echelleDe, inverse, ransacSimilitude, rotationDeg, IDENTITE, type Similitude } from './ransac.js';
import { appliquer, type Image } from './homographie.js';
import { inverser as inverserHomographie, redresserParFuites, redresserParReperes, type RedressementFuites } from './redressementFuites.js';
import { detecterSegments } from './segments.js';
import { gabaritSurLaVue, type GabaritMur } from './gabaritMur.js';

/** Le grand cote des copies reduites ou se cherchent les points communs. */
const COTE_RECHERCHE_PX = 900;
/** Le grand cote de la mosaique, au plus. */
const COTE_MOSAIQUE_PX = 2400;

/** Quand deux vues redressees se recalent : assez de points communs qui s'accordent, une echelle et une rotation plausibles. */
export const CRITERES_MOSAIQUE = {
  INLIERS_MIN: 15,
  PART_INLIERS_MIN: 0.2,
  /** Deux vues de face du meme mur, a des distances differentes : d'un tiers a trois fois l'echelle. */
  ECHELLE_MIN: 1 / 3,
  ECHELLE_MAX: 3,
  /** Redressees verticales verticales, elles ne tournent presque pas l'une par rapport a l'autre. */
  ROTATION_MAX_DEG: 4,
  SEUIL_INLIER_PX: 4,
  /**
   * Moins de points communs (un enduit, une meuliere se ressemblent partout) : le recalage est accepte des INLIERS_FAIBLE points si
   * la partie commune des deux vues se ressemble pixel a pixel (correlation d'au moins RESSEMBLANCE_MIN, sur au moins
   * ECHANTILLONS_MIN points).
   */
  INLIERS_FAIBLE: 6,
  RESSEMBLANCE_MIN: 0.6,
  ECHANTILLONS_MIN: 2000,
} as const;

export interface PaireMosaique { a: number; b: number; inliers: number; appariements: number; echelle: number; rotationDeg: number; acceptee: boolean; motif: string | null }

export interface ResultatMosaique {
  image: Image;
  vu: Uint8Array;
  /** Pour chaque vue : sa similitude vers la mosaique (null : hors du groupe, restee a part). */
  places: (Similitude | null)[];
  /** Les vues du groupe assemble, et celles restees a part avec leur motif. */
  groupes: { assemblees: number[]; aPart: { vue: number; motif: string }[] };
  paires: PaireMosaique[];
}

/** Reduit une image (plus proche voisin) pour la recherche des points. */
function reduire(img: Image, vu: Uint8Array, k: number): { image: Image; vu: Uint8Array } {
  if (k >= 1) return { image: img, vu };
  const L = Math.max(1, Math.round(img.largeur * k)), H = Math.max(1, Math.round(img.hauteur * k));
  const d = new Uint8ClampedArray(L * H * 4), v = new Uint8Array(L * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    const sx = Math.min(img.largeur - 1, Math.floor((x + 0.5) / k)), sy = Math.min(img.hauteur - 1, Math.floor((y + 0.5) / k));
    const s = sy * img.largeur + sx, o = y * L + x;
    d[o * 4] = img.donnees[s * 4] ?? 0; d[o * 4 + 1] = img.donnees[s * 4 + 1] ?? 0; d[o * 4 + 2] = img.donnees[s * 4 + 2] ?? 0; d[o * 4 + 3] = 255;
    v[o] = vu[s] ?? 0;
  }
  return { image: { largeur: L, hauteur: H, donnees: d }, vu: v };
}

interface VueReduite { image: Image; vu: Uint8Array; k: number }

const luminance = (d: Uint8ClampedArray, i: number) => 0.299 * (d[i * 4] ?? 0) + 0.587 * (d[i * 4 + 1] ?? 0) + 0.114 * (d[i * 4 + 2] ?? 0);

/** La correlation de A(x) et B(s(x)) sur les pixels vus des deux (vues reduites, `s` en pixels des vues entieres). */
function ressemblance(A: VueReduite, B: VueReduite, s: Similitude): { r: number; n: number } {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let y = 0; y < A.image.hauteur; y += 2) for (let x = 0; x < A.image.largeur; x += 2) {
    const ia = y * A.image.largeur + x;
    if (!A.vu[ia]) continue;
    const q = appliquerSimilitude(s, { x: (x + 0.5) / A.k, y: (y + 0.5) / A.k });
    const xb = Math.floor(q.x * B.k), yb = Math.floor(q.y * B.k);
    if (xb < 0 || yb < 0 || xb >= B.image.largeur || yb >= B.image.hauteur) continue;
    const ib = yb * B.image.largeur + xb;
    if (!B.vu[ib]) continue;
    const va = luminance(A.image.donnees, ia), vb = luminance(B.image.donnees, ib);
    n++; sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb;
  }
  if (n < 2) return { r: -1, n };
  const cov = sab - (sa * sb) / n, a2 = saa - (sa * sa) / n, b2 = sbb - (sb * sb) / n;
  return { r: a2 > 1e-9 && b2 > 1e-9 ? cov / Math.sqrt(a2 * b2) : -1, n };
}

/** Le recalage de B sur A (un point de A -> le point de B), en pixels des vues entieres. */
function recaler(a: number, b: number, pa: DescripteurOrb[], pb: DescripteurOrb[], A: VueReduite, B: VueReduite): { paire: PaireMosaique; modele: Similitude | null } {
  const ka = A.k, kb = B.k;
  const C = CRITERES_MOSAIQUE;
  const m = apparier(pa, pb);
  const refus = (motif: string, extra: Partial<PaireMosaique> = {}) => ({ paire: { a, b, inliers: 0, appariements: m.length, echelle: 1, rotationDeg: 0, acceptee: false, motif, ...extra }, modele: null });
  if (m.length < C.INLIERS_FAIBLE) return refus('trop peu de points communs');
  // Les points, ramenes aux pixels des vues entieres.
  const paires = m.map(({ i, j }) => ({ de: { x: (pa[i] as DescripteurOrb).x / ka, y: (pa[i] as DescripteurOrb).y / ka }, vers: { x: (pb[j] as DescripteurOrb).x / kb, y: (pb[j] as DescripteurOrb).y / kb } }));
  const r = ransacSimilitude(paires, { seuilPx: C.SEUIL_INLIER_PX / Math.min(ka, kb) });
  if (!r) return refus('les points communs ne s’accordent pas sur un même recalage');
  const e = echelleDe(r.modele), rot = rotationDeg(r.modele);
  const extra = { inliers: r.inliers.length, echelle: Math.round(e * 1000) / 1000, rotationDeg: Math.round(rot * 100) / 100 };
  if (e < C.ECHELLE_MIN || e > C.ECHELLE_MAX) return refus('les échelles des deux photos ne concordent pas', extra);
  if (Math.abs(rot) > C.ROTATION_MAX_DEG) return refus('les deux photos tournent trop l’une par rapport à l’autre', extra);
  const fort = r.inliers.length >= C.INLIERS_MIN && r.inliers.length >= C.PART_INLIERS_MIN * m.length;
  if (!fort) {
    // Peu de points, mais un recalage plausible : les pixels de la partie commune tranchent.
    const sim = r.inliers.length >= C.INLIERS_FAIBLE ? ressemblance(A, B, r.modele) : { r: -1, n: 0 };
    if (sim.n < C.ECHANTILLONS_MIN || sim.r < C.RESSEMBLANCE_MIN) return refus('les points communs ne s’accordent pas sur un même recalage', extra);
  }
  return { paire: { a, b, appariements: m.length, ...extra, acceptee: true, motif: null }, modele: r.modele };
}

/**
 * La mosaique des vues redressees. Null sans vue. Une seule vue : elle-meme. Les vues qui ne se recalent sur aucune autre restent
 * hors de la mosaique, avec leur motif.
 */
export function mosaiqueDesVues(vues: readonly RedressementFuites[]): ResultatMosaique | null {
  const n = vues.length;
  if (!n) return null;
  const ks = vues.map((v) => Math.min(1, COTE_RECHERCHE_PX / Math.max(v.image.largeur, v.image.hauteur)));
  const reduites: VueReduite[] = vues.map((v, i) => ({ ...reduire(v.image, v.vu, ks[i] as number), k: ks[i] as number }));
  const points = reduites.map((r) => detecterOrb(r.image, { pointsMax: 1500 }, r.vu));
  const paires: PaireMosaique[] = [];
  const modeles = new Map<string, Similitude>();
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const r = recaler(a, b, points[a] as DescripteurOrb[], points[b] as DescripteurOrb[], reduites[a] as VueReduite, reduites[b] as VueReduite);
    paires.push(r.paire);
    if (r.modele) modeles.set(a + '-' + b, r.modele);
  }
  // La vue de reference : celle qui se recale sur le plus d'autres (a egalite, le plus d'inliers).
  const degre = (i: number) => paires.filter((p) => p.acceptee && (p.a === i || p.b === i)).reduce((s, p) => s + 1000 + p.inliers, 0);
  const ref = [...Array(n).keys()].sort((x, y) => degre(y) - degre(x))[0] as number;
  // De proche en proche, par les paires les plus solides d'abord (arbre couvrant maximal).
  const places: (Similitude | null)[] = Array(n).fill(null);
  places[ref] = IDENTITE;
  let ajoute = true;
  while (ajoute) {
    ajoute = false;
    const candidates = paires.filter((p) => p.acceptee && (places[p.a] !== null) !== (places[p.b] !== null)).sort((x, y) => y.inliers - x.inliers);
    const p = candidates[0];
    if (!p) break;
    const ab = modeles.get(p.a + '-' + p.b) as Similitude;
    // places[i] : vue i -> mosaique. ab : point de a -> point de b.
    if (places[p.a]) { const ba = inverse(ab); if (ba) places[p.b] = composer(places[p.a] as Similitude, ba); }
    else places[p.a] = composer(places[p.b] as Similitude, ab);
    ajoute = true;
  }
  const assemblees = places.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  const aPart = places.map((s, i) => (s ? null : { vue: i, motif: paires.filter((p) => p.a === i || p.b === i).map((p) => p.motif).find((m) => !!m) ?? 'aucune autre photo ne montre la même partie du mur' })).filter((x): x is { vue: number; motif: string } => !!x);
  // L'emprise de la mosaique, dans le repere de la reference.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of assemblees) {
    const v = vues[i] as RedressementFuites, s = places[i] as Similitude;
    for (const q of [{ x: 0, y: 0 }, { x: v.image.largeur, y: 0 }, { x: v.image.largeur, y: v.image.hauteur }, { x: 0, y: v.image.hauteur }]) {
      const m = appliquerSimilitude(s, q);
      x0 = Math.min(x0, m.x); y0 = Math.min(y0, m.y); x1 = Math.max(x1, m.x); y1 = Math.max(y1, m.y);
    }
  }
  const k = Math.min(1, COTE_MOSAIQUE_PX / Math.max(x1 - x0, y1 - y0));
  const L = Math.max(1, Math.round((x1 - x0) * k)), H = Math.max(1, Math.round((y1 - y0) * k));
  const donnees = new Uint8ClampedArray(L * H * 4), vu = new Uint8Array(L * H), meilleur = new Float32Array(L * H).fill(Infinity);
  // Mosaique -> vue : l'inverse de chaque place, pour aller chercher chaque pixel.
  for (const i of assemblees) {
    const v = vues[i] as RedressementFuites;
    const inv = inverse(places[i] as Similitude);
    if (!inv) continue;
    const { largeur: lv, hauteur: hv } = v.image;
    for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
      const q = appliquerSimilitude(inv, { x: x0 + (x + 0.5) / k, y: y0 + (y + 0.5) / k });
      const sx = Math.floor(q.x), sy = Math.floor(q.y);
      if (sx < 0 || sy < 0 || sx >= lv || sy >= hv || !v.vu[sy * lv + sx]) continue;
      // Le moins etire : le plus pres du centre de la vue, en part de sa taille.
      const d = Math.hypot((q.x - lv / 2) / lv, (q.y - hv / 2) / hv);
      const o = y * L + x;
      if (d >= (meilleur[o] as number)) continue;
      meilleur[o] = d; vu[o] = 1;
      const s = (sy * lv + sx) * 4;
      donnees[o * 4] = v.image.donnees[s] ?? 0; donnees[o * 4 + 1] = v.image.donnees[s + 1] ?? 0; donnees[o * 4 + 2] = v.image.donnees[s + 2] ?? 0; donnees[o * 4 + 3] = 255;
    }
  }
  const echelle = (s: Similitude): Similitude => ({ a: s.a * k, b: s.b * k, tx: (s.tx - x0) * k, ty: (s.ty - y0) * k });
  return { image: { largeur: L, hauteur: H, donnees }, vu, places: places.map((s) => (s ? echelle(s) : null)), groupes: { assemblees, aPart }, paires };
}

/** Un rectangle de la mosaique, en pixels. */
export interface Rect { x0: number; y0: number; x1: number; y1: number }

/** Une ligne horizontale du mur ne penche pas de plus que cela sur la mosaique (redressee). */
const HORIZONTALE_MAX_DEG = 2;
/** L'egout et le pied s'etendent sur au moins cette part de la largeur vue. */
const PART_LIGNE_MIN = 0.3;
/** Un mur fait au moins cette part de sa largeur vue en hauteur. */
const HAUTEUR_MUR_MIN_PART = 0.2;

/** Le rectangle du mur lu sur la mosaique, et ce qui a ete lu (egout, pied, cotes) ou suppose. */
export interface MurLu extends Rect {
  egout: boolean; pied: boolean; cotes: boolean;
  /**
   * La silhouette du haut du mur, d'un bout a l'autre (en pixels de l'image lue) : une ligne brisee, au-dessus de l'egout ou sur lui.
   * Droite sur un mur gouttereau, un triangle sur un pignon, une rampe sous un appentis. Absente quand elle n'a pas pu se lire.
   */
  silhouette?: { x: number; y: number }[];
}

/** Un cote du mur (une chaine d'angle, l'arete d'un pignon) se cherche a cette part de sa largeur supposee de part et d'autre. */
const PORTEE_COTE = 0.15;
/** Une arete de cote couvre au moins cette part de la hauteur du mur. */
const PART_COTE_MIN = 0.5;
/** Une verticale de la mosaique ne penche pas de plus que cela. */
const VERTICALE_MAX_DEG = 2;

type SegmentPlan = { x1: number; y1: number; x2: number; y2: number; longueur: number };

/**
 * Le rectangle du mur sur la mosaique, vue de face : en largeur, la partie vue a mi-hauteur ; en hauteur, de l'egout (la plus haute
 * longue horizontale de la moitie haute, une gouttiere, le bas d'un debord) au pied (la plus basse longue horizontale de la moitie
 * basse : le sol, le haut d'un soubassement). `segments` : ceux de la mosaique. Sans ces lignes, la partie vue.
 *
 * `rapport` : la hauteur du mur sur sa largeur, quand le plan les donne (largeur du cadastre, hauteur du LiDAR). La largeur se deduit
 * alors de la hauteur lue (ou la hauteur de la largeur vue, sans pied), et les cotes se calent sur les plus longues verticales qui
 * tombent pres d'eux (les chaines d'angle de la maison). On ne mesure rien sur place.
 */
export function rectangleDuMur(m: { image: Image; vu: Uint8Array }, segments: readonly SegmentPlan[], rapport: number | null = null): MurLu {
  const { largeur: L, hauteur: H } = m.image;
  // La largeur vue : les colonnes vues sur la bande du milieu.
  const vueA = (y: number) => { let a = -1, b = -1; for (let x = 0; x < L; x++) if (m.vu[y * L + x]) { if (a < 0) a = x; b = x; } return [a, b] as const; };
  const bandes = [0.4, 0.5, 0.6].map((t) => vueA(Math.round(t * (H - 1)))).filter(([a]) => a >= 0);
  const x0 = bandes.length ? Math.max(...bandes.map((b) => b[0])) : 0, x1 = bandes.length ? Math.min(...bandes.map((b) => b[1])) : L - 1;
  // Les colonnes vues : la premiere et la derniere ligne vues au milieu de la largeur.
  let haut = 0, bas = H - 1;
  const xm = Math.round((x0 + x1) / 2);
  while (haut < H - 1 && !m.vu[haut * L + xm]) haut++;
  while (bas > 0 && !m.vu[bas * L + xm]) bas--;
  const largeurVue = Math.max(1, x1 - x0);
  const longues = segments.filter((g) => Math.atan2(Math.abs(g.y2 - g.y1), Math.abs(g.x2 - g.x1)) < (HORIZONTALE_MAX_DEG * Math.PI) / 180 && g.longueur >= PART_LIGNE_MIN * largeurVue);
  const lignes = longues.map((g) => ({ y: (g.y1 + g.y2) / 2, l: g.longueur }));
  // L'egout : la plus longue horizontale des trois cinquiemes hauts (une gouttiere court sur tout le mur ; un store, un linteau, non).
  const limiteHaute = haut + 0.6 * (bas - haut);
  const egout = lignes.filter((g) => g.y > haut && g.y < limiteHaute).sort((a, b) => b.l - a.l)[0]?.y;
  // Le pied : la plus basse longue horizontale, a une hauteur de mur plausible sous l'egout (un mur fait au moins le cinquieme de
  // sa largeur vue : une bande entre la gouttiere et un store n'en est pas un ; avec le rapport du plan, la moitie de la hauteur attendue).
  const plancher = (egout ?? haut) + (rapport ? 0.5 * rapport * largeurVue : HAUTEUR_MUR_MIN_PART * largeurVue);
  const pied = lignes.filter((g) => g.y > plancher && g.y < bas).sort((a, b) => b.y - a.y)[0]?.y;
  const lu = { x0, x1, y0: egout ?? haut, y1: pied ?? bas, egout: egout !== undefined, pied: pied !== undefined, cotes: false };
  if (!rapport || !(rapport > 0)) return lu;
  // Les proportions du plan : sans pied, il tombe sous l'egout a la hauteur que donne la largeur vue.
  if (egout !== undefined && pied === undefined) lu.y1 = Math.min(bas, egout + rapport * largeurVue);
  const h = lu.y1 - lu.y0, w = h / rapport;
  if (!(w > 0)) return lu;
  // Les cotes, a la largeur que donnent les proportions : sur les plus longues verticales pres de la place supposee, sinon centres.
  const verticales = segments.filter((g) => Math.atan2(Math.abs(g.x2 - g.x1), Math.abs(g.y2 - g.y1)) < (VERTICALE_MAX_DEG * Math.PI) / 180 && g.longueur >= PART_COTE_MIN * h
    && Math.min(g.y1, g.y2) < lu.y1 && Math.max(g.y1, g.y2) > lu.y0);
  const pres = (x: number) => verticales.filter((g) => Math.abs((g.x1 + g.x2) / 2 - x) < PORTEE_COTE * w).sort((a, b) => b.longueur - a.longueur)[0];
  const xc = (x0 + x1) / 2;
  const gauche = pres(xc - w / 2), droite = pres(xc + w / 2);
  if (gauche && droite) { lu.x0 = (gauche.x1 + gauche.x2) / 2; lu.x1 = (droite.x1 + droite.x2) / 2; lu.cotes = true; }
  else if (gauche) { lu.x0 = (gauche.x1 + gauche.x2) / 2; lu.x1 = lu.x0 + w; }
  else if (droite) { lu.x1 = (droite.x1 + droite.x2) / 2; lu.x0 = lu.x1 - w; }
  else { lu.x0 = xc - w / 2; lu.x1 = xc + w / 2; }
  return lu;
}

/** Les proportions du rectangle cherche peuvent s'ecarter de celles du plan de cette part (pignon, egout mal lu, focale supposee). */
const ECART_RAPPORT = 0.3;
/** Le mur couvre au moins cette part de la largeur de la mosaique. */
const LARGEUR_MUR_MIN = 0.25;
/** Le poids de la taille dans la note d'un rectangle (sa largeur en part de la mosaique). */
const POIDS_TAILLE = 1.5;
/** Les droites candidates : les plus longues, au plus tant de chaque sens. */
const DROITES_MAX = 30;
/** Deux segments a moins de cette part du grand cote l'un de l'autre font une seule droite. */
const FUSION_DROITES = 0.006;

interface Droite { p: number; troncons: [number, number][] }

/** Les droites horizontales (p = y) ou verticales (p = x) de la mosaique : segments presque alignes regroupes, avec leurs troncons. */
function droites(segments: readonly SegmentPlan[], vertical: boolean, grand: number): Droite[] {
  const sel = segments.filter((g) => vertical
    ? Math.atan2(Math.abs(g.x2 - g.x1), Math.abs(g.y2 - g.y1)) < (VERTICALE_MAX_DEG * Math.PI) / 180
    : Math.atan2(Math.abs(g.y2 - g.y1), Math.abs(g.x2 - g.x1)) < (HORIZONTALE_MAX_DEG * Math.PI) / 180);
  const out: Droite[] = [];
  for (const g of [...sel].sort((a, b) => b.longueur - a.longueur)) {
    const p = vertical ? (g.x1 + g.x2) / 2 : (g.y1 + g.y2) / 2;
    const t: [number, number] = vertical ? [Math.min(g.y1, g.y2), Math.max(g.y1, g.y2)] : [Math.min(g.x1, g.x2), Math.max(g.x1, g.x2)];
    const d = out.find((x) => Math.abs(x.p - p) < FUSION_DROITES * grand);
    if (d) d.troncons.push(t); else out.push({ p, troncons: [t] });
  }
  const longueur = (d: Droite) => d.troncons.reduce((s, [a, b]) => s + b - a, 0);
  return out.sort((a, b) => longueur(b) - longueur(a)).slice(0, DROITES_MAX);
}

/** La part de [a, b] que couvrent les troncons d'une droite (troncons qui se recouvrent comptes une fois, a 1 % pres). */
function couverture(d: Droite, a: number, b: number): number {
  if (!(b > a)) return 0;
  const n = 100, pas = (b - a) / n;
  let k = 0;
  for (let i = 0; i < n; i++) { const t = a + (i + 0.5) * pas; if (d.troncons.some(([u, v]) => t >= u && t <= v)) k++; }
  return k / n;
}

/**
 * Le rectangle du mur cherche sur ses aretes, aux proportions du plan (`rapport` = hauteur / largeur, a ECART_RAPPORT pres) : deux
 * verticales (les angles de la maison) et deux horizontales (l'egout, le pied) qui couvrent le mieux ses quatre cotes. Les cotes
 * comptent plus que l'egout (un pignon n'a pas de ligne a l'egout) et que le pied (le sol, une haie). Null sans candidat.
 */
export function rectangleSurLesAretes(m: { image: Image }, segments: readonly SegmentPlan[], rapport: number): (Rect & { score: number }) | null {
  const { largeur: L, hauteur: H } = m.image;
  const grand = Math.max(L, H);
  const vs = droites(segments, true, grand), hs = droites(segments, false, grand);
  let meilleur: (Rect & { score: number }) | null = null;
  for (let i = 0; i < vs.length; i++) for (let j = 0; j < vs.length; j++) {
    const g = vs[i] as Droite, d = vs[j] as Droite;
    const w = d.p - g.p;
    // Une photo de facade montre le mur sur au moins le quart de sa largeur : en deca, c'est une fenetre, un colombage.
    if (!(w > LARGEUR_MUR_MIN * L)) continue;
    for (let k = 0; k < hs.length; k++) for (let l = 0; l < hs.length; l++) {
      const h0 = hs[k] as Droite, h1 = hs[l] as Droite;
      const h = h1.p - h0.p;
      if (!(h > 0) || Math.abs(h / w / rapport - 1) > ECART_RAPPORT) continue;
      const cotes = couverture(g, h0.p, h1.p) + couverture(d, h0.p, h1.p);
      if (cotes < 0.6) continue;
      // Le plus grand rectangle bien soutenu : les baies et les colombages dessinent aussi des rectangles nets, plus petits.
      const score = cotes + 0.6 * couverture(h0, g.p, d.p) + 0.4 * couverture(h1, g.p, d.p) + POIDS_TAILLE * (w / L);
      if (!meilleur || score > meilleur.score) meilleur = { x0: g.p, x1: d.p, y0: h0.p, y1: h1.p, score };
    }
  }
  return meilleur;
}

/**
 * Les coins du rectangle du mur (haut gauche, haut droit, bas droit, bas gauche) sur chaque photo assemblee : mosaique -> vue
 * redressee (l'inverse de sa place) -> photo (`versPhoto`). Null pour une photo restee a part. Les coins peuvent tomber hors de
 * la photo : une photo qui ne montre qu'un morceau du mur garde les coins du mur entier, que le redressement suit.
 */
export function coinsSurLesPhotos(vues: readonly RedressementFuites[], places: readonly (Similitude | null)[], r: Rect): ({ x: number; y: number }[] | null)[] {
  const coins = [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }];
  return vues.map((v, i) => {
    const s = places[i];
    const inv = s ? inverse(s) : null;
    if (!inv) return null;
    return coins.map((c) => appliquer(v.versPhoto, appliquerSimilitude(inv, c)));
  });
}

/**
 * Des points d'une photo de l'assemblage (`depuis`, en pixels de la photo) portes sur chacune des autres : photo -> vue redressee
 * (l'inverse de `versPhoto`) -> mosaique (sa place) -> autre vue (l'inverse de sa place) -> autre photo. Null pour une photo
 * restee a part, ou quand un point passe derriere l'appareil.
 */
export function porterCoins(vues: readonly RedressementFuites[], places: readonly (Similitude | null)[], depuis: number, points: readonly { x: number; y: number }[]): ({ x: number; y: number }[] | null)[] {
  const v0 = vues[depuis], s0 = places[depuis];
  const versVue0 = v0 ? inverserHomographie(v0.versPhoto) : null;
  if (!v0 || !s0 || !versVue0) return vues.map(() => null);
  const dansMosaique = points.map((p) => appliquerSimilitude(s0, appliquer(versVue0, p)));
  return vues.map((v, i) => {
    const s = places[i];
    const inv = s ? inverse(s) : null;
    if (!inv) return null;
    const H = v.versPhoto;
    const dansVue = dansMosaique.map((c) => appliquerSimilitude(inv, c));
    // Un point de la vue de face qui tombe derriere l'appareil de cette photo n'y a pas d'image.
    if (dansVue.some((c) => H[6] * c.x + H[7] * c.y + H[8] <= 0)) return null;
    return dansVue.map((c) => appliquer(H, c));
  });
}

/** Une rangee est du mur quand sa chromaticite mediane est a moins de cela de celle du mur (r et g sur r + g + b). */
const ECART_CHROMA_MUR = 0.018;
/**
 * Et sa luminosite entre ces fois celle du mur : l'ombre d'un debord ou d'un arbre assombrit le mur sans en changer la teinte. Une
 * ardoise grise sous un enduit clair a presque sa teinte : l'ecart de chromaticite, serre, l'en separe.
 */
const LUMIERE_MUR: readonly [number, number] = [0.3, 1.7];
/** La bande lue de part et d'autre d'un bord candidat, en part de la largeur du mur. */
const BANDE_BORD = 0.025;
/** Un bord est une transition : au moins cette part de rangees de mur d'un cote, au plus la part complementaire de l'autre. */
const PART_TRANSITION = 0.7;
/** Une arete horizontale a moins de cette part de la largeur du mur attire le bord trouve par la teinte. */
const AIMANT_ARETE = 0.012;
/** L'egout se cherche de cette part de la largeur au-dessus du bord des aretes a cette part de la hauteur au-dessous. */
const EGOUT_AU_DESSUS = 0.1;
const EGOUT_AU_DESSOUS = 0.3;
/** La silhouette se lit sur tant de colonnes, et cherche le haut du mur jusqu'a cette part de la largeur au-dessus du bord trouve. */
const COLONNES_SILHOUETTE = 64;
const SILHOUETTE_AU_DESSUS = 0.8;
/** Le haut du mur dans une colonne : au moins cette part de pixels de mur sur les tant de pixels qui suivent (part de la largeur). */
const PART_HAUT_MUR = 0.7;
const SUITE_HAUT_MUR = 0.012;
/**
 * Les colonnes des bouts donnent l'egout, un pignon commencant a ses angles : les trois plus proches de chaque bout, la plus basse
 * (au-dela, la pente d'un pignon les fait deja monter).
 */
const COLONNES_BOUT = 3;
/** La silhouette a une forme (pignon, bosse) quand elle monte de plus que cette part de la largeur au-dessus de l'egout. */
const RELIEF_SILHOUETTE = 0.05;
/** Les deux bouts s'ecartent de plus que cette part de la largeur : une rampe (le pignon d'un appentis), pas un devers du redressement. */
const RAMPE_SILHOUETTE = 0.12;
/** Une ligne brisee s'ecarte de la silhouette lue de moins que cette part de la largeur (Douglas-Peucker). */
const TOLERANCE_SILHOUETTE = 0.012;
/** Deux sommets de la silhouette plus proches que cette part de la largeur se confondent. */
const SOMMETS_DISTINCTS = 0.04;

/**
 * Le sol se cherche entre ces parts de la hauteur attendue (le plan) sous l'egout : le LiDAR donne l'egout a quelques centimetres,
 * et le haut d'une voiture ou d'une haie, qui coupe aussi le mur, tombe bien plus haut.
 */
const SOL_ENTRE: readonly [number, number] = [0.88, 1.12];

interface Rangee { cr: number; cg: number; l: number; n: number }

/**
 * La chromaticite et la luminosite medianes du mur : deux bandes le long de ses bouts (de 1 a 6 % de sa largeur, a l'interieur), sur le
 * bas de sa hauteur. Les bouts sont surs, et un mur n'a presque jamais de baie contre ses angles ; son milieu, lui, peut etre pris
 * presque entier par des fenetres a volets, et son haut par une bande de toit quand l'egout des aretes est trop haut.
 */
function teinteDuMur(m: { image: Image; vu: Uint8Array }, r: Rect): { cr: number; cg: number; l: number; grain: number } | null {
  const { largeur: L, hauteur: H, donnees: d } = m.image;
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  const ya = Math.max(0, Math.round(r.y0 + 0.3 * h)), yb = Math.min(H - 1, Math.round(r.y1 - 0.1 * h));
  const med = (t: number[]) => { t.sort((u, v) => u - v); return t[t.length >> 1] as number; };
  const cr: number[] = [], cg: number[] = [], l: number[] = [];
  const parRangee: { cr: number; cg: number }[] = [];
  for (let y = ya; y <= yb; y++) {
    const rcr: number[] = [], rcg: number[] = [];
    for (const [a, b] of [[r.x0 + 0.01 * w, r.x0 + 0.06 * w], [r.x1 - 0.06 * w, r.x1 - 0.01 * w]] as const) {
      for (let x = Math.max(0, Math.round(a)); x <= Math.min(L - 1, Math.round(b)); x++) {
        const i = y * L + x;
        if (!m.vu[i]) continue;
        const R = d[i * 4] ?? 0, G = d[i * 4 + 1] ?? 0, B = d[i * 4 + 2] ?? 0, s = R + G + B + 1;
        cr.push(R / s); cg.push(G / s); l.push(s); rcr.push(R / s); rcg.push(G / s);
      }
    }
    if (rcr.length >= 3) parRangee.push({ cr: med(rcr), cg: med(rcg) });
  }
  if (cr.length < 50 || parRangee.length < 3) return null;
  const mur = { cr: med(cr), cg: med(cg), l: med(l) };
  // Le grain : l'ecart median d'une rangee a la teinte du mur (une brique et ses joints, une meuliere).
  return { ...mur, grain: med(parRangee.map((x) => Math.hypot(x.cr - mur.cr, x.cg - mur.cg))) };
}

/** La couleur mediane de chaque rangee de l'assemblage entre x0 et x1 (pixels vus seulement) : chromaticite et luminosite. */
function rangees(m: { image: Image; vu: Uint8Array }, x0: number, x1: number): Rangee[] {
  const { largeur: L, hauteur: H, donnees: d } = m.image;
  const a = Math.max(0, Math.round(x0)), b = Math.min(L - 1, Math.round(x1));
  const pas = Math.max(1, Math.floor((b - a) / 160));
  const med = (t: number[]) => { t.sort((u, v) => u - v); return t.length ? (t[t.length >> 1] as number) : 0; };
  const out: Rangee[] = [];
  for (let y = 0; y < H; y++) {
    const cr: number[] = [], cg: number[] = [], l: number[] = [];
    for (let x = a; x <= b; x += pas) {
      const i = y * L + x;
      if (!m.vu[i]) continue;
      const R = d[i * 4] ?? 0, G = d[i * 4 + 1] ?? 0, B = d[i * 4 + 2] ?? 0, s = R + G + B + 1;
      cr.push(R / s); cg.push(G / s); l.push(s);
    }
    out.push({ cr: med(cr), cg: med(cg), l: med(l), n: cr.length });
  }
  return out;
}

/** Douglas-Peucker : les sommets d'une ligne brisee qui s'ecartent de plus de `tol` de la corde. */
function simplifier(pts: readonly { x: number; y: number }[], tol: number): { x: number; y: number }[] {
  if (pts.length <= 2) return [...pts];
  const a = pts[0] as { x: number; y: number }, b = pts[pts.length - 1] as { x: number; y: number };
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let k = -1, dMax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i] as { x: number; y: number };
    const d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L;
    if (d > dMax) { dMax = d; k = i; }
  }
  if (dMax <= tol) return [a, b];
  return [...simplifier(pts.slice(0, k + 1), tol).slice(0, -1), ...simplifier(pts.slice(k), tol)];
}

/**
 * La silhouette du haut du mur sur une image vue de face : dans chaque colonne entre ses bouts, la premiere rangee, en descendant du
 * ciel, ou commence la matiere du mur (`teinte`, a `ecart` de chromaticite pres). Un pignon y fait un triangle, un appentis une rampe ;
 * une bande de tuiles, n'etant pas du mur, laisse la silhouette a l'egout. L'egout est la hauteur aux angles (la plus basse des deux :
 * sous une rampe, l'egout est le bas). Null quand trop de colonnes ne se lisent pas.
 */
export function silhouetteDuMur(m: { image: Image; vu: Uint8Array }, r: Rect, teinte: { cr: number; cg: number; l: number }, ecart: number): { silhouette: { x: number; y: number }[]; egout: number; forme: 'droite' | 'pignon' | 'rampe' } | null {
  const { largeur: L, hauteur: H, donnees: d } = m.image;
  const w = r.x1 - r.x0;
  if (!(w > 0)) return null;
  const k = Math.max(3, Math.round(SUITE_HAUT_MUR * w));
  const yDebut = Math.max(0, Math.round(r.y0 - SILHOUETTE_AU_DESSUS * w)), yFin = Math.min(H - 1, Math.round(r.y1));
  const hauts: { x: number; y: number }[] = [];
  for (let c = 0; c < COLONNES_SILHOUETTE; c++) {
    const xc = r.x0 + 0.01 * w + ((c + 0.5) / COLONNES_SILHOUETTE) * 0.98 * w;
    const xa = Math.max(0, Math.round(xc) - 2), xb = Math.min(L - 1, Math.round(xc) + 2);
    // Une rangee de la colonne est du mur quand la moyenne de ses cinq pixels en a la teinte (le bruit d'un pixel ne compte pas).
    const mur: boolean[] = [], vus: boolean[] = [];
    for (let y = yDebut; y <= yFin; y++) {
      let R = 0, G = 0, B = 0, n = 0;
      for (let x = xa; x <= xb; x++) { const i = y * L + x; if (!m.vu[i]) continue; R += d[i * 4] ?? 0; G += d[i * 4 + 1] ?? 0; B += d[i * 4 + 2] ?? 0; n++; }
      const s = R + G + B + n;
      vus.push(n > 0);
      mur.push(n > 0 && Math.hypot(R / s - teinte.cr, G / s - teinte.cg) < ecart && s / n >= LUMIERE_MUR[0] * teinte.l && s / n <= LUMIERE_MUR[1] * teinte.l);
    }
    let haut: number | null = null;
    for (let i = 0; i + k <= mur.length; i++) {
      if (!mur[i]) continue;
      let n = 0;
      for (let j = i; j < i + k; j++) if (mur[j]) n++;
      if (n >= PART_HAUT_MUR * k) { haut = i; break; }
    }
    // Un haut colle au bord de ce que la photo a vu n'est pas le haut du mur, mais celui du cadre : la colonne ne dit rien.
    const auBord = haut !== null && vus.slice(Math.max(0, haut - k), haut).some((v) => !v);
    if (haut !== null && haut > 0 && !auBord) hauts.push({ x: xc, y: yDebut + haut });
  }
  if (hauts.length < COLONNES_SILHOUETTE / 2) return null;
  const med = (t: number[]) => { const u = [...t].sort((a, b) => a - b); return u[u.length >> 1] as number; };
  // Une colonne masquee (un arbre devant le pignon) ne casse pas la ligne : mediane glissante sur cinq colonnes.
  const lisses = hauts.map((p, i) => ({ x: p.x, y: med(hauts.slice(Math.max(0, i - 2), i + 3).map((q) => q.y)) }));
  const gauche = lisses.slice(0, COLONNES_BOUT), droite = lisses.slice(-COLONNES_BOUT);
  if (gauche.length < COLONNES_BOUT || droite.length < COLONNES_BOUT || (gauche[0] as { x: number }).x > r.x0 + 0.1 * w || (droite[droite.length - 1] as { x: number }).x < r.x1 - 0.1 * w) return null;
  // La hauteur a l'angle : la droite des colonnes du bout, prolongee jusqu'a lui (la pente d'un pignon monte des le premier
  // centimetre), sans descendre de plus de 3 % de la largeur sous la plus basse d'entre elles.
  const angle = (cols: readonly { x: number; y: number }[], x: number) => {
    const n = cols.length, mx = cols.reduce((t, p) => t + p.x, 0) / n, my = cols.reduce((t, p) => t + p.y, 0) / n;
    const sxx = cols.reduce((t, p) => t + (p.x - mx) ** 2, 0), pente = sxx > 0 ? cols.reduce((t, p) => t + (p.x - mx) * (p.y - my), 0) / sxx : 0;
    const bas = Math.max(...cols.map((p) => p.y));
    return Math.min(bas + 0.03 * w, Math.max(bas, my + pente * (x - mx)));
  };
  const yG = angle(gauche, r.x0), yD = angle(droite, r.x1);
  const egout = Math.max(yG, yD);
  const forme = Math.abs(yG - yD) > RAMPE_SILHOUETTE * w ? 'rampe' : egout - Math.min(...lisses.map((p) => p.y)) > RELIEF_SILHOUETTE * w ? 'pignon' : 'droite';
  // La silhouette ne descend pas sous l'egout (une fenetre haute, un store) ; ses bouts sont aux angles du mur.
  const ligne = [{ x: r.x0, y: yG }, ...lisses.map((p) => ({ x: p.x, y: Math.min(p.y, egout) })), { x: r.x1, y: yD }];
  // Deux sommets presque confondus n'en font qu'un : un faite lu sur deux colonnes devient un sommet a leur milieu, au plus haut des
  // deux ; un sommet tout pres d'un angle se fond dans l'angle. La ligne se tire alors plus simplement.
  const sommets = simplifier(ligne, TOLERANCE_SILHOUETTE * w);
  const proche = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) < SOMMETS_DISTINCTS * w;
  const premier = sommets[0] as { x: number; y: number }, fin = sommets[sommets.length - 1] as { x: number; y: number };
  const nets: { x: number; y: number }[] = [premier];
  for (const p of sommets.slice(1, -1)) {
    if (proche(p, premier) || proche(p, fin)) continue;
    const prec = nets[nets.length - 1] as { x: number; y: number };
    if (nets.length > 1 && proche(p, prec)) nets[nets.length - 1] = { x: (p.x + prec.x) / 2, y: Math.min(p.y, prec.y) };
    else nets.push(p);
  }
  nets.push(fin);
  return { silhouette: nets, egout, forme };
}

/**
 * L'egout et le sol affines par la matiere du mur, ses bouts une fois trouves : les aretes seules prenaient le haut d'une bande de
 * tuiles pour l'egout (la limite du toit et du ciel est la plus franche des horizontales), et un bandeau d'etage pour le sol quand
 * une haie ou une voiture cache le pied. Le mur a sa teinte, que l'on lit au milieu du rectangle trouve : l'egout est la premiere
 * rangee de mur sous le toit, le sol la derniere au-dessus de ce qui n'est plus le mur (le gazon, le trottoir), cherche pres de la
 * hauteur que donne le plan (`rapport`) ; un bord trouve se colle a l'arete horizontale la plus proche. Un sol cache (haie sur toute
 * la largeur) tombe a la hauteur du plan, et se dit suppose. `gabarit` (facade/gabaritMur.ts) : la silhouette du plan et du LiDAR,
 * posee entre les bords trouves, sans changer de forme ; sans lui, la silhouette lue sur l'image.
 */
export function affinerEgoutEtSol(m: { image: Image; vu: Uint8Array }, segments: readonly SegmentPlan[], r: MurLu, rapport: number | null, gabarit: GabaritMur | null = null): MurLu {
  const w = r.x1 - r.x0, H = m.image.hauteur;
  if (!(w > 0)) return r;
  const marge = 0.05 * w;
  const lignes = rangees(m, r.x0 + marge, r.x1 - marge);
  const h0 = r.y1 - r.y0;
  // La teinte du mur, lue le long de ses bouts (teinteDuMur).
  const mur = teinteDuMur(m, r);
  if (!mur) return r;
  // Un parement a du grain (une brique, une meuliere) : d'une rangee a l'autre, sa teinte mediane varie. L'ecart admis suit ce grain,
  // lu sur les bandes des bouts (deux fois l'ecart median de leurs rangees), sans descendre sous celui d'un enduit.
  const ecartDe = (x: Rangee) => Math.hypot(x.cr - mur.cr, x.cg - mur.cg);
  const ecartAdmis = Math.max(ECART_CHROMA_MUR, 2 * mur.grain);
  const estMur = lignes.map((x) => x.n >= 5 && ecartDe(x) < ecartAdmis && x.l >= LUMIERE_MUR[0] * mur.l && x.l <= LUMIERE_MUR[1] * mur.l);
  // La part de rangees de mur dans [a, b] : une bande, pour qu'un joint de brique ou un appui ne coupe pas le mur.
  const cumul = [0];
  estMur.forEach((v, y) => { cumul.push((cumul[y] as number) + (v ? 1 : 0)); });
  const part = (a: number, b: number) => { const A = Math.max(0, Math.round(a)), B = Math.min(H - 1, Math.round(b)); return B >= A ? ((cumul[B + 1] as number) - (cumul[A] as number)) / (B - A + 1) : 0; };
  const k = Math.max(3, Math.round(BANDE_BORD * w));
  const debutMur = (y: number) => part(y - k, y - 1) <= 1 - PART_TRANSITION && part(y, y + k - 1) >= PART_TRANSITION;
  const finMur = (y: number) => part(y - k + 1, y) >= PART_TRANSITION && part(y + 1, y + k) <= 1 - PART_TRANSITION;
  const horizontales = segments.filter((g) => Math.atan2(Math.abs(g.y2 - g.y1), Math.abs(g.x2 - g.x1)) < (HORIZONTALE_MAX_DEG * Math.PI) / 180 && g.longueur >= 0.2 * w);
  const aimanter = (y: number) => horizontales.map((g) => (g.y1 + g.y2) / 2).filter((p) => Math.abs(p - y) <= AIMANT_ARETE * w).sort((a, b) => Math.abs(a - y) - Math.abs(b - y))[0] ?? y;
  // Une transition tient sur quelques rangees : on garde le milieu de chaque suite.
  const milieux = (ys: number[]) => {
    const out: number[] = [];
    for (let i = 0; i < ys.length;) { let j = i; while (j + 1 < ys.length && (ys[j + 1] as number) === (ys[j] as number) + 1) j++; out.push(((ys[i] as number) + (ys[j] as number)) / 2); i = j + 1; }
    return out;
  };
  const out: MurLu = { ...r };
  // D'abord la silhouette du haut du mur. Quand elle a une forme (un pignon, dont le triangle a la teinte du mur, sans transition au-
  // dessus de l'egout ; une rampe), l'egout est sa hauteur aux angles. Droite, l'egout est la plus haute transition « pas du mur » ->
  // « mur » pres du bord des aretes, plus sure qu'un angle (un leger devers du redressement fait monter un bout) ; sans transition
  // franche, la silhouette, sinon le bord des aretes.
  const sil = silhouetteDuMur(m, r, mur, ecartAdmis * 1.5);
  const silPlausible = !!sil && sil.egout >= r.y0 - 0.3 * w && sil.egout <= r.y0 + EGOUT_AU_DESSOUS * h0;
  let egout: number | undefined = sil && silPlausible && sil.forme !== 'droite' ? sil.egout : undefined;
  if (egout === undefined) {
    const debuts: number[] = [];
    for (let y = Math.max(k, Math.round(r.y0 - EGOUT_AU_DESSUS * w)); y <= Math.min(H - k, r.y0 + EGOUT_AU_DESSOUS * h0); y++) if (debutMur(y)) debuts.push(y);
    egout = milieux(debuts)[0] ?? (sil && silPlausible ? sil.egout : undefined);
  }
  if (egout !== undefined) { out.y0 = aimanter(egout); out.egout = true; }
  if (sil && silPlausible && !gabarit) out.silhouette = sil.silhouette.map((p) => ({ x: p.x, y: Math.min(p.y, out.y0) }));
  // Le sol : la transition « mur » -> « pas du mur » la plus proche de la hauteur du plan sous l'egout. Sans elle (une haie cache le
  // pied sur toute la largeur), la hauteur du plan, dite supposee : un bandeau d'etage dessine une arete plus nette que le pied cache.
  const attendu = rapport && rapport > 0 ? rapport * w : h0;
  const cible = out.y0 + attendu;
  const fins: number[] = [];
  for (let y = Math.round(out.y0 + SOL_ENTRE[0] * attendu); y <= Math.min(H - 1 - k, out.y0 + SOL_ENTRE[1] * attendu); y++) if (finMur(y)) fins.push(y + 0.5);
  const sol = milieux(fins).sort((a, b) => Math.abs(a - cible) - Math.abs(b - cible))[0];
  if (sol !== undefined) { out.y1 = aimanter(sol); out.pied = true; }
  else if (rapport && rapport > 0) { out.y1 = Math.min(H - 1, cible); out.pied = false; }
  // Le gabarit se pose entre les bouts, l'egout et le sol trouves : sa forme ne bouge pas, seule son echelle suit le calage.
  if (gabarit) out.silhouette = gabaritSurLaVue(gabarit, out);
  return out;
}

/**
 * Chaque photo d'une serie vue de face, entiere : redressee par ses quatre reperes s'il y en a, sinon par ses points de fuite ; null
 * quand elle ne se redresse pas. Le premier temps de la chaine, avant l'assemblage (mosaiqueDesVues).
 */
export function vuesDeFace(images: readonly Image[], reperes: readonly (readonly { x: number; y: number }[] | null | undefined)[] = []): (RedressementFuites | null)[] {
  return images.map((img, i) => {
    const r = reperes[i];
    return (r && r.length === 4 ? redresserParReperes(img, r) : null) ?? redresserParFuites(img, detecterSegments(img));
  });
}
