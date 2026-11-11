// Le calage du mur par les pignons (demande du proprietaire, 11 novembre 2026) : quand le gabarit du plan et du LiDAR a des pointes
// (des pignons), la photo redressee les montre aussi, et rien n'y est plus net que leurs deux rives, deux longues obliques qui se
// rejoignent. Leurs sommets donnent la place et l'echelle du mur en largeur ; le niveau de leurs pieds, et l'egout que la photo montre
// dessous, sa place en hauteur. Le calage par les ancres (calageAncres.ts) cherche un rectangle de mur entre deux angles : une facade a
// plusieurs plans (AE 101 : deux pignons au fond, un appentis devant, un pan de bois) n'en montre pas, et sa vraie pose y echouait.
// Sans DOM, testable seul. Rien n'est pose ici sans preuve : une pose qui ne passe pas ses controles est nulle, et l'arbitre continue
// sans elle.

import type { Image } from '../vision/homographie.js';
import type { Segment } from '../vision/segments.js';
import type { MurLu } from '../vision/mosaiqueFuites.js';
import type { GabaritMur } from '../gabaritMur.js';

/** Une rive : une oblique qui penche de tant de degres sur l'horizontale, longue d'au moins cette part de la largeur de l'image. */
const RIVE_DEG: readonly [number, number] = [20, 75];
const RIVE_LONGUEUR_MIN = 0.07;
/** Les hauts des deux rives d'un pignon se rejoignent a moins de cette part de la largeur de l'image. */
const SOMMET_PROCHE = 0.07;
/** Les deux rives d'un pignon ont des pentes voisines (degres) et des longueurs comparables. */
const ECART_PENTES_DEG = 14;
const RIVES_COMPARABLES = 0.45;
/** Un pignon vu plus etroit que cette part du plus large n'en est pas un (une croix du pan de bois, un fronton de lucarne). */
const PIGNON_MIN = 0.5;
/** Une rive se prolonge par les obliques alignees sur elle : a moins de cette part de la largeur, et de tant de degres. */
const ALIGNE = 0.012;
const ALIGNE_DEG = 5;
/** Le morceau suivant d'une rive commence a moins de cette part de la largeur sous le precedent. */
const SUITE_DE_RIVE = 0.03;
/** Deux pointes du gabarit plus proches que cela (en largeurs du mur) n'en font qu'une (le plat d'un faitage coupe). */
const MEME_POINTE = 0.05;
/** Un pignon du plan monte d'au moins cette part de la hauteur du mur au-dessus du pied de ses rives. */
const RELIEF_PIGNON = 0.3;
/** La rive du plan finit ou sa pente tombe sous cette part de celle qu'elle avait au sommet. */
const FIN_DE_RIVE = 0.3;
/** Le debord du toit : la rive vue depasse le mur du pignon de cette part de sa demi-largeur, a peu pres. */
const DEBORD = 0.15;
/** La demi-largeur d'un pignon vue, a l'echelle trouvee, tient a cette part pres de celle du plan (debord compris). */
const DEMI_LARGEUR: readonly [number, number] = [0.7, 1.5];
/** Avec trois pignons ou plus, chacun tombe a moins de cette part de la largeur du mur de sa place. */
const RESIDU_MAX = 0.05;
/** Le mur pose fait au moins cette part de la largeur de l'image, et n'en sort pas de plus que cela. */
const MUR_MIN = 0.25;
const HORS_IMAGE = 0.08;
/** L'echelle des hauteurs lue sur la photo, rapportee a celle de la largeur : au-dela, les niveaux lus ne sont pas ceux du plan. */
const ETIREMENT: readonly [number, number] = [0.7, 1.45];
/** Les pieds des pignons sont au-dessus de l'egout du mur de plus que cela (en hauteurs du mur) : un toit plus bas passe devant. */
const TOIT_DEVANT = 1.15;
/** L'egout d'un toit bas : les bandes comparees de part et d'autre (en part de la largeur du mur), et l'ecart de clarte qui tranche (niveaux). */
const BANDE_EGOUT = 0.025;
const CONTRASTE_EGOUT = 15;
/** Une limite compte quand elle tranche d'au moins cette part de la plus franche. */
const LIMITE_FRANCHE = 0.7;
/** Le sol : des verticales (a tant de degres pres) d'au moins cette part de la largeur du mur, dont les pieds se rangent par bandes de ce pas ; il en faut cette longueur cumulee (en largeurs du mur). */
const VERTICALE_DEG = 3;
const VERTICALE_MIN = 0.04;
const PAS_DU_SOL = 0.012;
const PIEDS_MIN = 0.3;
/** Ou il se cherche sous l'egout, en hauteurs du mur a l'echelle de la largeur. */
const SOL_ENTRE: readonly [number, number] = [0.7, 1.6];

interface P { x: number; y: number }

/** Un pignon vu sur l'image : son sommet (le croisement de ses rives) et le pied de chacune. */
interface PignonVu { sommet: P; piedG: P; piedD: P }

/** Un pignon du gabarit : sa pointe, et le pied de chaque rive quand le gabarit la montre entiere (null : coupee au bout du mur). */
interface PignonDuPlan { u: number; v: number; piedG: { u: number; v: number } | null; piedD: { u: number; v: number } | null }

/** Ce que le calage par les pignons a lu, pour le dire a l'ecran. */
export interface LectureDesPignons {
  /** Les pignons du plan retrouves sur l'image. */
  pignons: number;
  /** Le plus grand ecart d'un sommet a sa place, en part de la largeur du mur (0 avec deux pignons : ils fixent l'echelle). */
  residu: number;
  /** L'echelle des hauteurs lue sur la photo, rapportee a celle de la largeur (1 : la photo a les proportions du plan). */
  etirement: number;
  /** D'ou vient l'egout : l'horizontale d'un toit bas devant le mur, ou le niveau des pieds des pignons. */
  egout: 'toit-bas' | 'pieds';
}

interface Rive { haut: P; bas: P; longueur: number; deg: number }

const cote = (g: Segment): Rive & { gauche: boolean } => {
  const [haut, bas] = g.y1 <= g.y2 ? [{ x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 }] : [{ x: g.x2, y: g.y2 }, { x: g.x1, y: g.y1 }];
  return { haut, bas, longueur: g.longueur, deg: (Math.atan2(bas.y - haut.y, Math.abs(bas.x - haut.x)) * 180) / Math.PI, gauche: bas.x < haut.x };
};

/** La distance d'un point a la droite d'une rive. */
const ecartALaRive = (r: Rive, p: P): number => {
  const dx = r.bas.x - r.haut.x, dy = r.bas.y - r.haut.y, l = Math.hypot(dx, dy);
  return l > 0 ? Math.abs((p.x - r.haut.x) * dy - (p.y - r.haut.y) * dx) / l : Infinity;
};

/** Le croisement des droites de deux rives ; null si elles sont paralleles. */
function croisement(a: Rive, b: Rive): P | null {
  const d1x = a.bas.x - a.haut.x, d1y = a.bas.y - a.haut.y, d2x = b.bas.x - b.haut.x, d2y = b.bas.y - b.haut.y;
  const det = d1x * d2y - d1y * d2x;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((b.haut.x - a.haut.x) * d2y - (b.haut.y - a.haut.y) * d2x) / det;
  return { x: a.haut.x + t * d1x, y: a.haut.y + t * d1y };
}

/**
 * Les pignons que montre une image redressee, de gauche a droite : deux longues obliques de pentes opposees dont les hauts se
 * rejoignent. Une rive se prolonge par les obliques alignees sur elle (une gouttiere, une branche la coupent). Les chevrons d'un pan de
 * bois et le fronton d'une lucarne, plus petits et pris sous un pignon, sont ecartes.
 */
function pignonsVus(segments: readonly Segment[], image: Pick<Image, 'largeur' | 'hauteur'>): PignonVu[] {
  const W = image.largeur;
  const obliques = segments.map(cote).filter((r) => r.deg >= RIVE_DEG[0] && r.deg <= RIVE_DEG[1]);
  const longues = obliques.filter((r) => r.longueur >= RIVE_LONGUEUR_MIN * W);
  const paires: { g: Rive; d: Rive; sommet: P; poids: number }[] = [];
  for (const g of longues) {
    if (!g.gauche) continue;
    for (const d of longues) {
      if (d.gauche || Math.hypot(g.haut.x - d.haut.x, g.haut.y - d.haut.y) > SOMMET_PROCHE * W) continue;
      if (Math.abs(g.deg - d.deg) > ECART_PENTES_DEG || Math.min(g.longueur, d.longueur) < RIVES_COMPARABLES * Math.max(g.longueur, d.longueur)) continue;
      const sommet = croisement(g, d);
      // Le sommet est au-dessus des deux hauts, tout pres d'eux.
      if (!sommet || sommet.y > Math.min(g.haut.y, d.haut.y) + 2 || Math.hypot(sommet.x - g.haut.x, sommet.y - g.haut.y) > SOMMET_PROCHE * W) continue;
      paires.push({ g, d, sommet, poids: g.longueur + d.longueur });
    }
  }
  paires.sort((a, b) => b.poids - a.poids);
  // Le pied d'une rive : elle se prolonge, de proche en proche, par les obliques du meme sens alignees sur elle.
  const pied = (r: Rive, gauche: boolean): P => {
    let p = r.bas;
    for (let suite = true; suite;) {
      suite = false;
      for (const o of obliques) {
        if (o.gauche !== gauche || Math.abs(o.deg - r.deg) > ALIGNE_DEG || o.bas.y <= p.y + 1) continue;
        if (ecartALaRive(r, o.haut) > ALIGNE * W || ecartALaRive(r, o.bas) > ALIGNE * W || o.haut.y - p.y > SUITE_DE_RIVE * W) continue;
        p = o.bas; suite = true;
      }
    }
    return p;
  };
  const retenus: PignonVu[] = [];
  for (const q of paires) {
    const v: PignonVu = { sommet: q.sommet, piedG: pied(q.g, true), piedD: pied(q.d, false) };
    // Un pignon dont le sommet tombe entre les pieds d'un plus grand en est une arete interieure, ou un motif du pan de bois.
    if (retenus.some((r) => v.sommet.x > r.piedG.x && v.sommet.x < r.piedD.x)) continue;
    retenus.push(v);
  }
  const large = Math.max(0, ...retenus.map((r) => r.piedD.x - r.piedG.x));
  return retenus.filter((r) => r.piedD.x - r.piedG.x >= PIGNON_MIN * large).sort((a, b) => a.sommet.x - b.sommet.x);
}

/** Les pignons du gabarit, de gauche a droite : ses pointes (un plat de faitage n'en fait qu'une) et le pied de leurs rives. */
export function pignonsDuGabarit(g: GabaritMur): PignonDuPlan[] {
  const hauts: number[] = [];
  g.forEach((p, i) => { if (p.v > 1 + 1e-6 && p.v >= (g[i - 1]?.v ?? 0) && p.v >= (g[i + 1]?.v ?? 0)) hauts.push(i); });
  const out: PignonDuPlan[] = [];
  for (let k = 0; k < hauts.length;) {
    let j = k;
    const i0 = hauts[k] as number;
    while (j + 1 < hauts.length && (g[hauts[j + 1] as number] as { u: number }).u - (g[i0] as { u: number }).u <= MEME_POINTE) j++;
    const i1 = hauts[j] as number, a = g[i0] as { u: number; v: number }, b = g[i1] as { u: number; v: number };
    // Le pied d'une rive : on descend du sommet tant que la pente tient ; une rive qui atteint le bout du gabarit est coupee.
    const descendre = (i: number, pas: 1 | -1): { p: { u: number; v: number }; coupee: boolean } => {
      let p = g[i] as { u: number; v: number }, pente0: number | null = null;
      for (let n = i + pas; n >= 0 && n < g.length; n += pas) {
        const q = g[n] as { u: number; v: number }, du = Math.abs(q.u - p.u), pente = du > 1e-9 ? (p.v - q.v) / du : Infinity;
        if (!(q.v < p.v) || (pente0 !== null && pente < FIN_DE_RIVE * pente0)) break;
        pente0 ??= pente;
        p = q;
        if (n === 0 || n === g.length - 1) return { p, coupee: true };
      }
      return { p, coupee: false };
    };
    const v = Math.max(a.v, b.v), gd = descendre(i0, -1), dd = descendre(i1, 1);
    // Une pointe ne compte que si elle monte franchement au-dessus de ses pieds (une ride du faitage n'est pas un pignon).
    if (Math.max(v - gd.p.v, v - dd.p.v) >= RELIEF_PIGNON) out.push({ u: (a.u + b.u) / 2, v, piedG: gd.coupee || gd.p.v >= v ? null : gd.p, piedD: dd.coupee || dd.p.v >= v ? null : dd.p });
    k = j + 1;
  }
  return out;
}

/** Les choix de `n` rangs parmi `m`, dans l'ordre. */
function choix(m: number, n: number): number[][] {
  const out: number[][] = [];
  const suite = (debut: number, pris: number[]) => {
    if (pris.length === n) { out.push(pris); return; }
    for (let i = debut; i <= m - (n - pris.length); i++) suite(i + 1, [...pris, i]);
  };
  suite(0, []);
  return out;
}

/** La place et l'echelle du mur en largeur (x = x0 + w * u) par les pignons vus pris pour ceux du plan, et ce qu'il en reste d'ecart. */
function poseEnLargeur(plan: readonly PignonDuPlan[], vus: readonly PignonVu[]): { x0: number; w: number; residu: number } | null {
  if (plan.length >= 2) {
    // Les sommets : ils ne dependent pas du debord du toit. Moindres carres de x sur u.
    const n = plan.length, mu = plan.reduce((s, p) => s + p.u, 0) / n, mx = vus.reduce((s, p) => s + p.sommet.x, 0) / n;
    const suu = plan.reduce((s, p) => s + (p.u - mu) ** 2, 0), sux = plan.reduce((s, p, i) => s + (p.u - mu) * ((vus[i] as PignonVu).sommet.x - mx), 0);
    if (!(suu > 0) || !(sux > 0)) return null;
    const w = sux / suu, x0 = mx - w * mu;
    return { x0, w, residu: Math.max(...plan.map((p, i) => Math.abs(x0 + w * p.u - (vus[i] as PignonVu).sommet.x))) / w };
  }
  // Un seul pignon : l'echelle vient de ses demi-largeurs, la ou le gabarit montre le pied de la rive (debord du toit retire).
  const p = plan[0], v = vus[0];
  if (!p || !v) return null;
  const echelles: number[] = [];
  if (p.piedG) echelles.push((v.sommet.x - v.piedG.x) / ((p.u - p.piedG.u) * (1 + DEBORD)));
  if (p.piedD) echelles.push((v.piedD.x - v.sommet.x) / ((p.piedD.u - p.u) * (1 + DEBORD)));
  if (!echelles.length) return null;
  const w = echelles.reduce((s, x) => s + x, 0) / echelles.length;
  return w > 0 ? { x0: v.sommet.x - w * p.u, w, residu: 0 } : null;
}

/** Les demi-largeurs vues tiennent a celles du plan, a l'echelle trouvee : deux pignons au bon ecart mais de la mauvaise taille n'en sont pas. */
function taillesTenues(plan: readonly PignonDuPlan[], vus: readonly PignonVu[], w: number): boolean {
  return plan.every((p, i) => {
    const v = vus[i] as PignonVu;
    const tient = (vue: number, duPlan: number) => { const k = vue / (w * duPlan); return k >= DEMI_LARGEUR[0] && k <= DEMI_LARGEUR[1]; };
    return (!p.piedG || tient(v.sommet.x - v.piedG.x, p.u - p.piedG.u)) && (!p.piedD || tient(v.piedD.x - v.sommet.x, p.piedD.u - p.u));
  });
}

/**
 * L'egout d'un toit bas devant le mur, entre deux hauteurs : la limite de teinte la plus franche sur toute la largeur du mur, la
 * couverture au-dessus, l'ombre du debord ou le mur au-dessous. La clarte moyenne de chaque rangee (pixels vus) se compare de part et
 * d'autre, sur deux bandes ; la limite se place a la rangee ou elle change le plus. Les aretes n'y suffisent pas : une gouttiere se lit
 * en morceaux, et la sabliere sous elle dessine une ligne plus longue. De deux limites aussi franches (le haut du toit bas contre le
 * mur, et son egout), la plus basse. Null quand rien ne tranche (moins de CONTRASTE_EGOUT niveaux).
 */
function egoutDuToitBas(m: { image: Image; vu?: Uint8Array }, x0: number, x1: number, ya: number, yb: number): number | null {
  const { largeur: L, hauteur: H, donnees: d } = m.image;
  const a = Math.max(0, Math.round(x0)), b = Math.min(L - 1, Math.round(x1)), bande = Math.max(4, Math.round(BANDE_EGOUT * (x1 - x0)));
  const clarte = new Float64Array(H).fill(NaN);
  for (let y = Math.max(0, Math.floor(ya) - bande); y <= Math.min(H - 1, Math.ceil(yb) + bande); y++) {
    let somme = 0, n = 0;
    for (let x = a; x <= b; x++) {
      const i = y * L + x;
      if (m.vu && !m.vu[i]) continue;
      somme += (d[i * 4] ?? 0) + (d[i * 4 + 1] ?? 0) + (d[i * 4 + 2] ?? 0); n++;
    }
    if (n >= 0.5 * (b - a + 1)) clarte[y] = somme / (3 * n);
  }
  const moyenne = (y0: number, y1: number) => { let somme = 0, n = 0; for (let y = y0; y <= y1; y++) { const c = clarte[y]; if (c !== undefined && !Number.isNaN(c)) { somme += c; n++; } } return n >= bande / 2 ? somme / n : null; };
  const ecarts: { y: number; ecart: number }[] = [];
  for (let y = Math.ceil(ya); y <= yb; y++) {
    const dessus = moyenne(y - bande, y - 1), dessous = moyenne(y, y + bande - 1);
    if (dessus !== null && dessous !== null) ecarts.push({ y, ecart: Math.abs(dessus - dessous) });
  }
  const max = Math.max(0, ...ecarts.map((e) => e.ecart));
  if (max < CONTRASTE_EGOUT) return null;
  // Un toit bas a deux limites, son haut contre le mur et son egout : parmi celles qui tranchent presque autant que la plus franche,
  // la plus basse, la ou elle tranche le plus.
  const franches = ecarts.filter((e) => e.ecart >= LIMITE_FRANCHE * max), bas = franches[franches.length - 1] as { y: number; ecart: number };
  let mieux = bas;
  for (const e of franches) if (e.y >= bas.y - bande && e.ecart > mieux.ecart) mieux = e;
  // La rangee ou la clarte change le plus, pres de la limite trouvee.
  let y = mieux.y, saut = 0;
  for (let k = mieux.y - (bande >> 1); k <= mieux.y + (bande >> 1); k++) {
    const p = clarte[k - 1], q = clarte[k + 1];
    if (p === undefined || q === undefined || Number.isNaN(p) || Number.isNaN(q)) continue;
    if (Math.abs(q - p) > saut) { saut = Math.abs(q - p); y = k; }
  }
  return y;
}

/**
 * Le sol sous un egout lu, entre deux hauteurs : la ou finissent les verticales du mur (ses angles, les jambages des portes, les poteaux
 * d'un auvent), toutes posees au sol. Le plus bas des niveaux ou assez d'entre elles s'arretent (les appuis de fenetre en arretent plus
 * haut, une plante ou un bac n'en arretent presque pas). Les plantations cachent la teinte du pied du mur, pas ses verticales. Null
 * quand trop peu de verticales finissent ensemble.
 */
function solParLesVerticales(segments: readonly Segment[], x0: number, x1: number, y0: number, ya: number, yb: number): number | null {
  const w = x1 - x0, pas = Math.max(4, Math.round(PAS_DU_SOL * w));
  const pieds = segments
    .filter((g) => Math.abs(g.x2 - g.x1) < Math.tan((VERTICALE_DEG * Math.PI) / 180) * Math.abs(g.y2 - g.y1) && g.longueur >= VERTICALE_MIN * w)
    .filter((g) => Math.min(g.x1, g.x2) >= x0 && Math.max(g.x1, g.x2) <= x1 && Math.min(g.y1, g.y2) > y0)
    .map((g) => ({ y: Math.max(g.y1, g.y2), l: g.longueur }))
    .filter((p) => p.y >= ya && p.y <= yb);
  // Du bas vers le haut : la premiere bande de deux pas ou finissent assez de verticales.
  for (let y = Math.floor(yb); y >= ya; y -= pas) {
    const ici = pieds.filter((p) => p.y <= y && p.y > y - 2 * pas), poids = ici.reduce((a, p) => a + p.l, 0);
    if (poids >= PIEDS_MIN * w) return ici.reduce((a, p) => a + p.y * p.l, 0) / poids;
  }
  return null;
}

/**
 * Le mur pose par les pignons : null quand le gabarit n'en a pas, que l'image ne les montre pas tous, ou qu'un controle echoue (tailles,
 * ecarts, proportions, mur hors de l'image). En largeur, les sommets vus pris pour ceux du plan. En hauteur, deux niveaux lus : les
 * pieds des pignons, et l'egout du mur. Quand un toit plus bas passe devant (les pieds bien au-dessus de l'egout du mur), son egout se
 * lit sur l'image, et le sol tombe a l'echelle de ces deux niveaux. Sinon l'egout est au niveau des pieds, et le sol a l'echelle que
 * donnent les pignons eux-memes : il est alors suppose (`pied` faux), a lire ensuite par la teinte.
 */
export function poserParLesPignons(m: { image: Image; vu?: Uint8Array }, segments: readonly Segment[], gabarit: GabaritMur | null | undefined, rapport: number | null): (MurLu & { lecture: LectureDesPignons }) | null {
  if (!gabarit || !rapport || !(rapport > 0)) return null;
  const plan = pignonsDuGabarit(gabarit);
  const tous = pignonsVus(segments, m.image);
  if (!plan.length || tous.length < plan.length) return null;
  const { largeur: W, hauteur: H } = m.image;
  // Les pignons vus pris pour ceux du plan, dans l'ordre : parmi les choix qui passent les controles, celui qui tombe le mieux.
  let mieux: { vus: PignonVu[]; x0: number; w: number; residu: number } | null = null;
  for (const rangs of choix(tous.length, plan.length)) {
    const vus = rangs.map((i) => tous[i] as PignonVu), p = poseEnLargeur(plan, vus);
    if (!p || p.w < MUR_MIN * W || p.x0 < -HORS_IMAGE * W || p.x0 + p.w > (1 + HORS_IMAGE) * W) continue;
    if (p.residu > RESIDU_MAX || !taillesTenues(plan, vus, p.w)) continue;
    if (!mieux || p.residu < mieux.residu) mieux = { vus, ...p };
  }
  if (!mieux) return null;
  const { vus, x0, w } = mieux, x1 = x0 + w;
  // En hauteur : le niveau des pieds, et l'echelle que disent les pignons (du sommet aux pieds), tenue pres de celle de la largeur.
  // Le pied d'une rive vue est le bout du debord du toit : le pied du plan, au nu du mur, est un peu plus haut sur la meme rive.
  const auMur = (v: PignonVu, p: P) => v.sommet.y + (p.y - v.sommet.y) / (1 + DEBORD);
  const pieds = plan.flatMap((p, i) => { const v = vus[i] as PignonVu; return [...(p.piedG ? [{ v: p.piedG.v, y: auMur(v, v.piedG) }] : []), ...(p.piedD ? [{ v: p.piedD.v, y: auMur(v, v.piedD) }] : [])]; });
  if (!pieds.length) return null;
  const vPied = pieds.reduce((s, p) => s + p.v, 0) / pieds.length, yPied = pieds.reduce((s, p) => s + p.y, 0) / pieds.length;
  const vSommet = plan.reduce((s, p) => s + p.v, 0) / plan.length, ySommet = vus.reduce((s, p) => s + p.sommet.y, 0) / vus.length;
  const iso = w * rapport;
  const tenu = (k: number) => k / iso >= ETIREMENT[0] && k / iso <= ETIREMENT[1];
  const parPignons = vSommet - vPied > 0.2 ? (yPied - ySommet) / (vSommet - vPied) : NaN;
  const k0 = tenu(parPignons) ? parPignons : iso;
  let y0: number, y1: number, pied = false, egout: LectureDesPignons['egout'] = 'pieds', k = k0;
  if (vPied > TOIT_DEVANT) {
    // L'egout du toit bas, cherche ou les proportions tenues le laissent tomber sous les pieds des pignons.
    const lu = egoutDuToitBas(m, x0, x1, yPied + (vPied - 1) * ETIREMENT[0] * iso, Math.min(H - 1, yPied + (vPied - 1) * ETIREMENT[1] * iso));
    if (lu !== null && tenu((lu - yPied) / (vPied - 1))) {
      // L'egout lu. Le sol se lit ensuite au pied des verticales ; sans lui, il tombe a l'echelle des deux niveaux lus, suppose.
      y0 = lu; egout = 'toit-bas'; k = (lu - yPied) / (vPied - 1);
      const sol = solParLesVerticales(segments, x0, x1, y0, y0 + SOL_ENTRE[0] * iso, Math.min(H - 1, y0 + SOL_ENTRE[1] * iso));
      if (sol !== null) { y1 = sol; k = sol - y0; pied = true; } else y1 = y0 + k;
    } else { y0 = yPied + (vPied - 1) * k0; y1 = y0 + k0; }
  } else {
    y0 = yPied + (vPied - 1) * k0;
    const sol = solParLesVerticales(segments, x0, x1, y0, y0 + SOL_ENTRE[0] * iso, Math.min(H - 1, y0 + SOL_ENTRE[1] * iso));
    if (sol !== null) { y1 = sol; k = sol - y0; pied = true; } else y1 = y0 + k0;
  }
  if (y0 < 0 || y1 <= y0) return null;
  if (y1 > H - 1) { y1 = H - 1; pied = false; }
  return { x0, x1, y0, y1, egout: true, pied, cotes: true, lecture: { pignons: plan.length, residu: mieux.residu, etirement: k / iso, egout } };
}
