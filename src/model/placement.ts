// La place d'un ouvrage neuf : pas le centre de la parcelle, mais la ou on le construirait.
//
// Une terrasse se colle a la maison, cote soleil ; une pergola va sur la terrasse, sinon comme
// elle ; un parasol au milieu de la terrasse ; une piscine au jardin, au soleil, loin des limites
// et de la maison ; un carport pres de la rue. Chaque regle rend un centre souhaite, et
// `rectangleLibre` (model/creation.ts) trouve ensuite la place libre la plus proche dans la
// parcelle. Sans maison, sans rue, sans parcelle : le centre de la parcelle, comme avant.

import { centroid, pointInPolygon } from '../geometry/basic.js';
import { distancePointContour } from '../geometry/proximite.js';
import { sommetDe } from '../geometry/anneau.js';
import { au } from '../util/tableaux.js';
import { aDesSommets } from './formes.js';
import { estBatiment, estTerrasse, terrasseOuPremiere } from './fonctions.js';
import type { ObjetPlan, PtBrut } from './types.js';

export type NatureOuvrage = 'terrasse' | 'pergola' | 'carport' | 'parasol' | 'piscine';

/** Ce que la regle connait du plan ; `coteRue` vient de geo/coteRue.ts, par l'appelant. */
export interface ContextePlacement {
  objets: ObjetPlan[];
  terrasseSelectedKey?: string | null;
  coteRue?: number | null;
}

/** Le retrait d'une piscine aux limites : la distance usuelle des reglements d'urbanisme. */
export const RETRAIT_PISCINE_M = 3;
/** Entre la piscine et la maison : de quoi passer, et hors de son ombre. */
const ECART_PISCINE_MAISON_M = 4;
/** Entre la terrasse et le mur : un joint, pas un couloir. */
const ECART_TERRASSE_MUR_M = 0.1;
/** Entre le carport et la limite sur rue. */
const ECART_CARPORT_RUE_M = 1;

const sud = { x: 0, y: -1 };

function parcelleDe(objets: ObjetPlan[]): (ObjetPlan & { pts: PtBrut[] }) | null {
  const p = objets.find((o) => o.key === 'parcelle');
  return p && aDesSommets(p) && p.pts.length >= 3 ? p : null;
}

/** La maison : le plus grand batiment du projet (pas du voisinage) dans la parcelle. */
export function maisonDe(objets: ObjetPlan[]): (ObjetPlan & { pts: PtBrut[] }) | null {
  const parcelle = parcelleDe(objets);
  const candidats = objets.filter((o): o is ObjetPlan & { pts: PtBrut[] } => !o.voisinage && o.type === 'polygon' && estBatiment(o) && aDesSommets(o) && o.pts.length >= 3)
    .filter((o) => !parcelle || pointInPolygon(centroid(o.pts), parcelle.pts));
  if (!candidats.length) return null;
  const aire = (pts: PtBrut[]) => Math.abs(pts.reduce((s, p, i) => { const q = sommetDe(pts, i + 1); return s + p.x * q.y - q.x * p.y; }, 0)) / 2;
  return candidats.reduce((m, o) => (aire(o.pts) > aire(m.pts) ? o : m));
}

/** Un cote du contour : ses deux bouts, sa longueur, sa normale sortante. */
function cote(pts: PtBrut[], i: number) {
  const a = au(pts, i), b = sommetDe(pts, i + 1);
  const ex = b.x - a.x, ey = b.y - a.y, L = Math.hypot(ex, ey) || 1;
  const aireSignee = pts.reduce((s, p, k) => { const q = sommetDe(pts, k + 1); return s + p.x * q.y - q.x * p.y; }, 0);
  const n = aireSignee > 0 ? { x: ey / L, y: -ex / L } : { x: -ey / L, y: ex / L };
  return { a, b, L, n, milieu: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

/**
 * La facade au soleil : celle dont la normale regarde le plus vers le sud, parmi les murs d'au
 * moins `largeurMin` metres ; `null` sans maison.
 */
export function facadeAuSoleil(objets: ObjetPlan[], largeurMin = 3): { milieu: PtBrut; n: PtBrut; L: number } | null {
  const maison = maisonDe(objets);
  if (!maison) return null;
  const cotes = maison.pts.map((_, i) => cote(maison.pts, i)).filter((c) => c.L >= largeurMin);
  const score = (c: ReturnType<typeof cote>) => c.n.x * sud.x + c.n.y * sud.y + Math.min(c.L, 12) / 100;
  const meilleur = cotes.reduce<ReturnType<typeof cote> | null>((m, c) => (!m || score(c) > score(m) ? c : m), null);
  return meilleur ? { milieu: meilleur.milieu, n: meilleur.n, L: meilleur.L } : null;
}

/** Devant la facade au soleil, a `profondeur / 2` du mur ; sinon le centre de la parcelle. */
function contreLaMaison(objets: ObjetPlan[], profondeur: number): PtBrut | null {
  const f = facadeAuSoleil(objets);
  if (!f) return null;
  const d = profondeur / 2 + ECART_TERRASSE_MUR_M;
  return { x: f.milieu.x + f.n.x * d, y: f.milieu.y + f.n.y * d };
}

/**
 * Au jardin : le point de la parcelle le mieux note sur une grille d'un metre — a plus de
 * `RETRAIT_PISCINE_M` des limites, loin de la maison (jusqu'a 8 m compte), au sud de la maison,
 * pres de la terrasse s'il y en a une. `null` sans parcelle ni maison.
 */
function auJardin(objets: ObjetPlan[], terrasseSelectedKey: string | null | undefined, largeur: number, profondeur: number): PtBrut | null {
  const parcelle = parcelleDe(objets);
  const maison = maisonDe(objets);
  // Sans maison, « au jardin » ne veut rien dire : le centre de la parcelle, comme avant.
  if (!parcelle || !maison) return null;
  const terrasse = terrasseOuPremiere(objets, terrasseSelectedKey);
  const cm = centroid(maison.pts);
  const cp = centroid(parcelle.pts);
  const ct = terrasse && aDesSommets(terrasse) ? centroid(terrasse.pts) : null;
  const xs = parcelle.pts.map((p) => p.x), ys = parcelle.pts.map((p) => p.y);
  const demi = Math.max(largeur, profondeur) / 2;
  let meilleur: PtBrut | null = null, max = -Infinity;
  for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x += 1) {
    for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y += 1) {
      const p = { x, y };
      if (!pointInPolygon(p, parcelle.pts)) continue;
      const bord = distancePointContour(p, parcelle.pts);
      if (bord < RETRAIT_PISCINE_M + demi) continue;
      const aMaison = distancePointContour(p, maison.pts);
      if (pointInPolygon(p, maison.pts) || aMaison < ECART_PISCINE_MAISON_M + demi) continue;
      // A note egale, le plus pres du centre de la parcelle.
      let score = Math.min(bord, 6) + Math.min(aMaison, 8) - 0.01 * Math.hypot(p.x - cp.x, p.y - cp.y);
      score -= 0.3 * Math.max(0, p.y - cm.y);
      if (ct) score -= 0.1 * Math.hypot(p.x - ct.x, p.y - ct.y);
      if (score > max) { max = score; meilleur = p; }
    }
  }
  return meilleur;
}

/** Pres de la rue : en retrait d'un metre du cote sur rue, en son milieu ; `null` sans cote sur rue. */
function presDeLaRue(objets: ObjetPlan[], coteRue: number | null | undefined, profondeur: number): PtBrut | null {
  const parcelle = parcelleDe(objets);
  if (!parcelle || coteRue === null || coteRue === undefined || coteRue < 0 || coteRue >= parcelle.pts.length) return null;
  const c = cote(parcelle.pts, coteRue);
  // La normale sortante de la parcelle regarde la rue : on rentre.
  const d = profondeur / 2 + ECART_CARPORT_RUE_M;
  return { x: c.milieu.x - c.n.x * d, y: c.milieu.y - c.n.y * d };
}

/**
 * Le centre souhaite d'un ouvrage neuf, ou `null` quand aucune regle ne s'applique (l'appelant
 * prend alors le centre de la parcelle, comme avant). `largeur` et `profondeur` sont celles de
 * l'ouvrage tel qu'il nait.
 */
export function centreSouhaite(nature: NatureOuvrage, ctx: ContextePlacement, largeur: number, profondeur: number): PtBrut | null {
  const { objets } = ctx;
  const terrasse = terrasseOuPremiere(objets, ctx.terrasseSelectedKey);
  switch (nature) {
    case 'terrasse':
      return contreLaMaison(objets, profondeur);
    case 'pergola':
    case 'parasol':
      // Sur la terrasse : son centre ; sinon la ou la terrasse irait.
      if (terrasse && aDesSommets(terrasse) && estTerrasse(terrasse)) return centroid(terrasse.pts);
      return contreLaMaison(objets, profondeur);
    case 'piscine':
      return auJardin(objets, ctx.terrasseSelectedKey, largeur, profondeur);
    case 'carport':
      return presDeLaRue(objets, ctx.coteRue, profondeur);
  }
}

