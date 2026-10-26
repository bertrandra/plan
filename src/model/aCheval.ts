// Un batiment a cheval sur deux parcelles, et le doute qu'il laisse sur sa toiture
// (MD/spec-toit-ign.md §13.8).
//
// La BD TOPO trace souvent d'un seul contour deux maisons mitoyennes : une longere de village, une
// paire de pavillons jumeaux. Quand ce contour franchit une limite de parcelle et qu'un corps lu sur
// le LiDAR passe par-dessus, le calcul ne peut pas savoir s'il voit un seul toit ou deux toits
// voisins de meme hauteur. Ici, les parts du contour dans chaque parcelle, et ce doute ; la question
// et ce que fait sa reponse sont dans app/toits/toitsACheval.ts.

import { pointInPolygon, signedArea } from '../geometry/basic.js';
import { differencePolygones } from '../geometry/difference.js';
import type { CorpsToit, PtBrut } from './types.js';
import { REGLAGES_TOITS as R, SEUILS_TOITS as S } from '../regles/toits/reglages.js';

/** Une part plus petite que cela, ou que cette part du batiment, est un trace du cadastre qui deborde, pas une moitie de maison. */
export const AIRE_A_CHEVAL_MIN_M2 = R.AIRE_A_CHEVAL_MIN_M2;
export const PART_A_CHEVAL_MIN = R.PART_A_CHEVAL_MIN;
// Un corps franchit la limite quand il a au moins S.AIRE_CORPS_DE_CHAQUE_COTE_M2 de sa surface, dans le
// contour, de chaque cote ; mesuree par des points au pas de S.PAS_ECHANTILLON_A_CHEVAL_M.

/** La part d'un batiment dans une parcelle. */
export interface PartACheval {
  /** La cle de la parcelle (objet du plan de fonction terrain, ou la parcelle du projet). */
  parcelle: string;
  pts: PtBrut[];
  aire: number;
}

/** Ce que le calcul lit d'un objet du plan. */
export interface ObjetACheval {
  key?: string;
  fonction?: string;
  pts?: readonly PtBrut[] | undefined;
  bdtopo?: unknown;
}

const aire = (pts: readonly PtBrut[]) => Math.abs(signedArea(pts as PtBrut[]));
const contourDe = (o: ObjetACheval): PtBrut[] | null => (Array.isArray(o.pts) && o.pts.length >= 3 ? (o.pts as PtBrut[]) : null);

/**
 * Les parts d'un batiment dans les parcelles du plan (celle du projet et les parcelles de fonction
 * terrain) : pour chaque parcelle qu'il touche, le contour prive des autres parcelles, en son plus
 * grand morceau. Null quand il ne tient pas, pour au moins deux parcelles, AIRE_A_CHEVAL_MIN_M2 et
 * PART_A_CHEVAL_MIN de sa surface : il n'est pas a cheval.
 */
export function partsACheval(batiment: ObjetACheval, objets: readonly ObjetACheval[]): PartACheval[] | null {
  const pts = contourDe(batiment);
  if (!pts) return null;
  const total = aire(pts);
  const parcelles = objets
    .filter((o) => o.key === 'parcelle' || o.fonction === 'terrain')
    .map((o) => ({ key: o.key ?? '', pts: contourDe(o) }))
    .filter((p): p is { key: string; pts: PtBrut[] } => !!p.pts && !!p.key && (pts.some((q) => pointInPolygon(q, p.pts as PtBrut[])) || p.pts.some((q) => pointInPolygon(q, pts))));
  if (parcelles.length < 2) return null;
  const parts: PartACheval[] = [];
  for (const p of parcelles) {
    const autres = parcelles.filter((x) => x !== p).map((x) => x.pts);
    const morceaux = differencePolygones(pts, autres).map((m) => m.contour).filter((c) => c.length >= 3);
    // Le morceau qui est dans la parcelle (la difference garde aussi ce qui tombe hors de toutes).
    const dedans = morceaux.filter((c) => pointInPolygon(interieur(c), p.pts)).sort((a, b) => aire(b) - aire(a))[0];
    if (!dedans) continue;
    const a = aire(dedans);
    if (a >= S.AIRE_A_CHEVAL_MIN_M2 && a >= S.PART_A_CHEVAL_MIN * total) parts.push({ parcelle: p.key, pts: dedans, aire: Math.round(a * 10) / 10 });
  }
  return parts.length >= 2 ? parts : null;
}

/** Un point a l'interieur d'un polygone (pas forcement convexe) : un centre de triangle d'oreille, a defaut le premier sommet. */
function interieur(c: readonly PtBrut[]): PtBrut {
  for (let i = 0; i < c.length; i++) {
    const a = c[(i + c.length - 1) % c.length] as PtBrut, b = c[i] as PtBrut, d = c[(i + 1) % c.length] as PtBrut;
    const g = { x: (a.x + b.x + d.x) / 3, y: (a.y + b.y + d.y) / 3 };
    if (pointInPolygon(g, c as PtBrut[])) return g;
  }
  return c[0] as PtBrut;
}

/**
 * Les corps qui franchissent la limite : au moins AIRE_CORPS_DE_CHAQUE_COTE_M2 de leur surface (dans
 * le contour) dans deux parts.
 */
export function corpsQuiFranchissent(corps: readonly CorpsToit[] | null | undefined, parts: readonly PartACheval[] | null): CorpsToit[] {
  if (!corps?.length || !parts || parts.length < 2) return [];
  const cellule = S.PAS_ECHANTILLON_A_CHEVAL_M * S.PAS_ECHANTILLON_A_CHEVAL_M;
  return corps.filter((c) => {
    const [p0, p1, , p3] = c.pts as [PtBrut, PtBrut, PtBrut, PtBrut];
    const L = Math.hypot(p1.x - p0.x, p1.y - p0.y), W = Math.hypot(p3.x - p0.x, p3.y - p0.y);
    if (L <= 0 || W <= 0) return false;
    const parPart = parts.map(() => 0);
    for (let s = S.PAS_ECHANTILLON_A_CHEVAL_M / 2; s < L; s += S.PAS_ECHANTILLON_A_CHEVAL_M) for (let t = S.PAS_ECHANTILLON_A_CHEVAL_M / 2; t < W; t += S.PAS_ECHANTILLON_A_CHEVAL_M) {
      const q = { x: p0.x + ((p1.x - p0.x) * s) / L + ((p3.x - p0.x) * t) / W, y: p0.y + ((p1.y - p0.y) * s) / L + ((p3.y - p0.y) * t) / W };
      const k = parts.findIndex((p) => pointInPolygon(q, p.pts));
      if (k >= 0) parPart[k] = (parPart[k] as number) + cellule;
    }
    return parPart.filter((a) => a >= S.AIRE_CORPS_DE_CHAQUE_COTE_M2).length >= 2;
  });
}

/**
 * Le doute : un corps du batiment franchit la limite. Le calcul a lu un toit continu ; deux maisons
 * mitoyennes aux toits de meme hauteur donnent la meme mesure. Sans corps qui franchit, les toits
 * s'arretent deja a la limite : pas de question.
 */
export function douteACheval(corps: readonly CorpsToit[] | null | undefined, parts: readonly PartACheval[] | null): boolean {
  return corpsQuiFranchissent(corps, parts).length > 0;
}
