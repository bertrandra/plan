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
import type { RedressementFuites } from './redressementFuites.js';

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

/**
 * Le rectangle du mur sur la mosaique, vue de face : en largeur, la partie vue a mi-hauteur ; en hauteur, de l'egout (la plus haute
 * longue horizontale de la moitie haute, une gouttiere, le bas d'un debord) au pied (la plus basse longue horizontale de la moitie
 * basse : le sol, le haut d'un soubassement). `segments` : ceux de la mosaique. Sans ces lignes, la partie vue.
 */
export function rectangleDuMur(m: { image: Image; vu: Uint8Array }, segments: readonly { x1: number; y1: number; x2: number; y2: number; longueur: number }[]): Rect {
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
  // sa largeur vue : une bande entre la gouttiere et un store n'en est pas un).
  const plancher = (egout ?? haut) + HAUTEUR_MUR_MIN_PART * largeurVue;
  const pied = lignes.filter((g) => g.y > plancher && g.y < bas).sort((a, b) => b.y - a.y)[0]?.y;
  return { x0, x1, y0: egout ?? haut, y1: pied ?? bas };
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
