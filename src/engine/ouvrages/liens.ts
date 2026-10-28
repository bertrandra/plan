// Les liens entre ouvrages : ce qu'un ouvrage a le droit de lire d'un autre (MD/spec-ouvrages.md, « L'independance de chaque
// composant », etape 6.6).
//
// Deux liens tiennent la terrasse et la piscine (ou le trou de terrasse), et chacun est dit ici une fois :
//
// - **la plage** : une piscine nomme la terrasse du plan qui lui sert de plage, par sa cle (`piscine.terrasseKey`). Rien d'autre
//   ne les lie : ni la position, ni le nom.
// - **percer** : un bassin ou un trou perce une terrasse quand le bord ou elle s'arrete (l'exterieur des margelles d'un bassin,
//   le contour d'un trou) et le contour de la terrasse se chevauchent : un sommet de l'un dans l'autre. La terrasse s'y arrete
//   (son calcul, son dessin, sa surface nette) et la piscine le dit dans ses avertissements, avec la meme definition.
//
// Le moteur de la terrasse et celui de la piscine lisent ces liens, jamais l'un l'autre : la terrasse ne connait du bassin que le
// bord qu'il publie (`bordDuBassin`), la piscine ne connait de sa plage que la cle.

import { centreDeSurface, pointInPolygon, shoelace } from '../../geometry/basic.js';
import { estPiscine, estTerrasse, estTrou } from '../../model/fonctions.js';
import type { ObjetPlan, PtBrut } from '../../model/types.js';
import { bordDuBassin } from '../piscine/geometrie.js';

/** Une terrasse du plan, polygone : ce qu'un lien rend. */
export type TerrassePlan = ObjetPlan & { type: 'polygon' };

// ---- La plage ----------------------------------------------------------------------------------

/** La terrasse du plan liee a la piscine (`terrasseKey`), si elle existe encore et reste une terrasse. */
export function terrasseDeLaPiscine(o: ObjetPlan, objets: readonly ObjetPlan[]): TerrassePlan | undefined {
  const cle = o.piscine?.terrasseKey;
  if (!cle) return undefined;
  const t = objets.find(x => x.key === cle);
  return t && estTerrasse(t) && t.type === 'polygon' ? t : undefined;
}

// ---- Percer ------------------------------------------------------------------------------------

/** Le bord `bord` perce-t-il la terrasse de contour `terrasse` ? Un sommet de l'un dans l'autre : la seule definition. */
export function perce(bord: readonly PtBrut[], terrasse: readonly PtBrut[]): boolean {
  return bord.some(p => pointInPolygon(p, terrasse as PtBrut[])) || terrasse.some(p => pointInPolygon(p, bord as PtBrut[]));
}

/**
 * Le bord ou une terrasse s'arrete autour d'un objet : l'exterieur des margelles d'un bassin, le
 * contour d'un trou de terrasse. `null` pour tout autre objet.
 */
export function contourOuverture(o: ObjetPlan): PtBrut[] | null {
  if(estPiscine(o)) return bordDuBassin(o);
  if(!estTrou(o)) return null;
  if(o.type === 'circle') return o.r > 0.05 ? Array.from({ length:32 }, (_, i) => ({ x:o.center.x + o.r*Math.cos(2*Math.PI*i/32), y:o.center.y + o.r*Math.sin(2*Math.PI*i/32) })) : null;
  return o.type === 'polygon' && o.pts.length >= 3 && Math.abs(shoelace(o.pts)) > 0.01 ? o.pts : null;
}

/** Les objets (bassins, trous) qui percent la terrasse de contour `poly`, avec le bord ou elle s'arrete. */
export function objetsQuiPercent(poly: PtBrut[], objets: readonly ObjetPlan[]): { objet: ObjetPlan; contour: PtBrut[] }[] {
  const res: { objet: ObjetPlan; contour: PtBrut[] }[] = [];
  objets.forEach(o => {
    const t = contourOuverture(o);
    if(t && perce(t, poly)) res.push({ objet:o, contour:t });
  });
  return res;
}

/**
 * La terrasse d'un bassin ou d'un trou : celle qui lui sert de plage (piscine), sinon la premiere
 * qu'il perce. `undefined` pour un autre objet, ou un bassin hors de toute terrasse.
 */
export function terrasseHote(o: ObjetPlan, objets: readonly ObjetPlan[]): TerrassePlan | undefined {
  if(!estPiscine(o) && !estTrou(o)) return undefined;
  const liee = estPiscine(o) ? terrasseDeLaPiscine(o, objets) : undefined;
  if(liee) return liee;
  const t = objets.find(x => x !== o && estTerrasse(x) && x.type === 'polygon' && objetsQuiPercent(x.pts, [o]).length > 0);
  return t && t.type === 'polygon' ? t : undefined;
}

/**
 * Le deplacement qui centre un bassin ou un trou sur sa terrasse : de son centre de surface a celui
 * de la terrasse. `null` sans terrasse hote.
 */
export function decalageDeCentrage(o: ObjetPlan, objets: readonly ObjetPlan[]): PtBrut | null {
  const t = terrasseHote(o, objets);
  if(!t) return null;
  const cible = centreDeSurface(t.pts);
  const centre = o.type === 'circle' ? o.center : centreDeSurface(o.pts);
  return { x: cible.x - centre.x, y: cible.y - centre.y };
}
