// Les coins du mur sur une serie de photos, par l'assemblage de leurs vues redressees par leurs points de fuite : lus sur la
// mosaique (coinsAutoDeSerie), ou reportes d'une photo ou ils sont connus (reporterCoins). La chaine de tous (chaine.ts) s'en sert
// pour les photos qui doutent. Sans DOM, testable seul.

import { intersection, ligneParPoints, type Ligne } from '../../facade/calageFin.js';
import type { Image, P2 } from '../../facade/homographie.js';
import { detecterSegments } from '../../facade/segments.js';
import { redresserParFuites, type RedressementFuites } from '../../facade/redressementFuites.js';
import { affinerEgoutEtSol, coinsSurLesPhotos, mosaiqueDesVues, vuesDeFace, porterCoins, rectangleDuMur, rectangleSurLesAretes, type MurLu } from '../../facade/mosaiqueFuites.js';
import type { GabaritMur } from '../../facade/gabaritMur.js';
import type { Similitude } from '../../facade/ransac.js';

/** Un quadrilatere convexe, non croise, d'au moins 5 % de la photo. */
export function quadrilatereSain(c: readonly P2[], image: { largeur: number; hauteur: number }): boolean {
  if (c.length !== 4) return false;
  const signes = c.map((p, i) => {
    const q = c[(i + 1) % 4] as P2, r = c[(i + 2) % 4] as P2;
    return Math.sign((q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x));
  });
  if (!signes.every((x) => x === signes[0] && x !== 0)) return false;
  const aire = Math.abs(c.reduce((s, p, i) => { const q = c[(i + 1) % 4] as P2; return s + p.x * q.y - q.x * p.y; }, 0)) / 2;
  return aire >= 0.05 * image.largeur * image.hauteur;
}

/** Ce que la serie redressee par ses points de fuite donne : les coins du mur sur chaque photo, et la hauteur qui en garde les proportions. */
export interface CoinsDeSerie {
  /** Par photo : les coins du mur (haut gauche, haut droit, bas droit, bas gauche), null pour une photo restee hors de la mosaique. */
  coins: (P2[] | null)[];
  /** La hauteur du mur, de l'egout au pied, a la largeur donnee : la mosaique est vue de face, ses proportions sont celles du mur. */
  hauteurM: number | null;
  /** Les photos restees a part, et pourquoi. */
  aPart: { vue: number; motif: string }[];
  /** L'egout et le pied ont ete lus sur la mosaique (et non supposes) : le mur est trouve, pas devine. */
  lu: boolean;
  /** Par photo : la photo entiere redressee (par ses reperes, sinon ses points de fuite), sans coupe ; null si elle ne se redresse pas. */
  vues: (RedressementFuites | null)[];
  /**
   * L'assemblage des vues, ce qu'il montre (`vu`), la place de chaque vue dedans (null : restee a part), et le mur qui y a ete cherche
   * (en pixels de l'assemblage) : ce que l'ecran de calibration montre, et l'image prise pour la suite.
   */
  assemblage: { image: Image; vu: Uint8Array; places: (Similitude | null)[]; mur: MurLu };
}

export { vuesDeFace } from '../../facade/mosaiqueFuites.js';

/**
 * Le mur sur l'assemblage des vues redressees : l'egout, le sol et ses deux bouts. Le plan donne la largeur (cadastre) et la hauteur
 * (LiDAR) : le mur est le rectangle a ces proportions (`rapport` = hauteur / largeur) que les aretes de l'assemblage dessinent le
 * mieux ; sans ce rectangle, ou sans le plan, l'egout et le pied lus sur la largeur vue.
 */
export function murSurLAssemblage(m: { image: Image; vu: Uint8Array }, rapport: number | null, gabarit: GabaritMur | null = null): MurLu {
  const segs = detecterSegments(m.image);
  const aretes = rapport ? rectangleSurLesAretes(m, segs, rapport) : null;
  const r: MurLu = aretes ? { x0: aretes.x0, x1: aretes.x1, y0: aretes.y0, y1: aretes.y1, egout: true, pied: true, cotes: true } : rectangleDuMur(m, segs, rapport);
  // Les bouts sont surs, l'egout et le sol beaucoup moins : ils s'affinent par la teinte du mur.
  return affinerEgoutEtSol(m, segs, r, rapport, gabarit);
}

/**
 * Les coins du mur sur toutes les photos d'une serie, sans geste : chaque photo est redressee par ses points de fuite
 * (facade/redressementFuites.ts), les vues sont assemblees en mosaique (facade/mosaiqueFuites.ts), le rectangle du mur y est lu,
 * puis reporte dans chaque photo. Les photos n'ont pas besoin de montrer le mur entier, ni ses coins. Null quand aucune photo
 * ne se redresse. `hauteurPlanM` : la hauteur du mur que donne le plan (LiDAR), qui en fixe les proportions avec la largeur.
 * `reperes` : par photo, quatre reperes poses a la main (un rectangle du mur, n'importe lequel) qui la redressent.
 */
export function coinsAutoDeSerie(images: readonly Image[], largeurM: number, hauteurPlanM: number | null = null, reperes: readonly (readonly P2[] | null | undefined)[] = [], gabarit: GabaritMur | null = null): CoinsDeSerie | null {
  // D'abord redresser (les reperes poses, sinon les points de fuite), puis assembler, et seulement ensuite chercher l'egout et le sol.
  const vues = vuesDeFace(images, reperes);
  const rangs = vues.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  if (!rangs.length) return null;
  const m = mosaiqueDesVues(rangs.map((i) => vues[i] as RedressementFuites));
  if (!m) return null;
  const r = murSurLAssemblage(m, hauteurPlanM && largeurM > 0 ? hauteurPlanM / largeurM : null, gabarit);
  const parVue = coinsSurLesPhotos(rangs.map((i) => vues[i] as RedressementFuites), m.places, r);
  const coins: (P2[] | null)[] = images.map(() => null);
  rangs.forEach((i, k) => { coins[i] = parVue[k] ?? null; });
  const aPart = [
    ...images.map((_, i) => i).filter((i) => !vues[i]).map((vue) => ({ vue, motif: 'pas assez de verticales pour redresser la photo' })),
    ...m.groupes.aPart.map((a) => ({ vue: rangs[a.vue] as number, motif: a.motif })),
  ];
  const hauteurM = r.x1 > r.x0 ? Math.round(((largeurM * (r.y1 - r.y0)) / (r.x1 - r.x0)) * 10) / 10 : null;
  const places: (Similitude | null)[] = images.map(() => null);
  rangs.forEach((i, k) => { places[i] = m.places[k] ?? null; });
  return { coins, hauteurM, aPart, lu: r.egout && r.pied, vues, assemblage: { image: m.image, vu: m.vu, places, mur: r } };
}

/**
 * Les coins du mur trouves sur une photo (`depuis` : sur ses aretes, ou poses au doigt), reportes sur les autres photos de la meme
 * facade par l'assemblage de leurs vues redressees (photo -> vue de face -> mosaique -> autre vue -> autre photo). Le mur n'a pas
 * a etre cherche sur l'assemblage (sur des photos prises de loin, il y prenait une fenetre) : une photo le donne, les autres le
 * suivent, et toutes montrent le meme mur, ce qui permet de les croiser (vote des ouvertures). Null pour une photo restee hors de
 * l'assemblage ; `coins` pour `depuis` lui-meme.
 */
export function reporterCoins(images: readonly Image[], depuis: number, coins: readonly P2[]): (P2[] | null)[] {
  const out: (P2[] | null)[] = images.map(() => null);
  out[depuis] = coins.map((c) => ({ x: c.x, y: c.y }));
  const vues = images.map((img) => redresserParFuites(img, detecterSegments(img)));
  const rangs = vues.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const k0 = rangs.indexOf(depuis);
  if (k0 < 0 || rangs.length < 2) return out;
  const m = mosaiqueDesVues(rangs.map((i) => vues[i] as RedressementFuites));
  const portes = m ? porterCoins(rangs.map((i) => vues[i] as RedressementFuites), m.places, k0, coins) : [];
  rangs.forEach((i, k) => { if (i !== depuis) { const q = portes[k]; out[i] = q ? caleSurLesAretes(q, images[i] as Image) : null; } });
  return out;
}

/** Un cote ne se cale que sur une arete a moins de cette part de sa longueur, et a moins de tant de degres de lui. */
const BANDE_CALAGE = 0.03;
const ANGLE_CALAGE_DEG = 3;
/** L'arete doit couvrir au moins cette part du cote. */
const RECOUVREMENT_CALAGE = 0.3;

/**
 * Les coins reportes, chaque cote cale sur l'arete la plus longue qui le longe de pres : l'assemblage se trompe de 1 a 3 % de la
 * largeur du mur (banc, scenes a plusieurs vues ; 6 % derriere une haie haute), la photo montre l'arete au pixel. Un cote sans
 * arete pres de lui (cache, flou) reste ou le report l'a mis. Les coins sont les croisements des cotes.
 */
export function caleSurLesAretes(coins: readonly P2[], image: Image): P2[] {
  const segs = detecterSegments(image);
  const cotes = [0, 1, 2, 3].map((k) => {
    const a = coins[k] as P2, b = coins[(k + 1) % 4] as P2;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const ligne = ligneParPoints(a, b);
    if (!ligne || !(L > 0)) return ligne;
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    let meilleur: { l: Ligne; poids: number } | null = null;
    for (const g of segs) {
      const lg = Math.hypot(g.x2 - g.x1, g.y2 - g.y1);
      if (!(lg > 0)) continue;
      const cos = Math.abs(((g.x2 - g.x1) * ux + (g.y2 - g.y1) * uy) / lg);
      if (cos < Math.cos((ANGLE_CALAGE_DEG * Math.PI) / 180)) continue;
      const m = { x: (g.x1 + g.x2) / 2, y: (g.y1 + g.y2) / 2 };
      if (Math.abs(ligne.a * m.x + ligne.b * m.y + ligne.c) > BANDE_CALAGE * L) continue;
      // La part du cote que l'arete longe.
      const t1 = ((g.x1 - a.x) * ux + (g.y1 - a.y) * uy) / L, t2 = ((g.x2 - a.x) * ux + (g.y2 - a.y) * uy) / L;
      const recouvre = Math.min(1, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2));
      if (recouvre < RECOUVREMENT_CALAGE) continue;
      const l = ligneParPoints({ x: g.x1, y: g.y1 }, { x: g.x2, y: g.y2 });
      if (l && (!meilleur || recouvre > meilleur.poids)) meilleur = { l, poids: recouvre };
    }
    return meilleur?.l ?? ligne;
  });
  const out = [0, 1, 2, 3].map((k) => {
    const l = cotes[(k + 3) % 4], m = cotes[k];
    return l && m ? intersection(l, m) : null;
  });
  // Un croisement perdu (cotes paralleles) ou un quadrilatere qui se croise : le report tel quel (aire minimale nulle : un mur
  // reporte peut deborder de la photo).
  return out.every((p) => p !== null) && quadrilatereSain(out as P2[], { largeur: 0, hauteur: 0 }) ? (out as P2[]) : coins.map((c) => ({ x: c.x, y: c.y }));
}
