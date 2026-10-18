// Le corps du toit qui porte une facade : celui dont un cote longe le mur. La silhouette d'une facade (pignon, rampe, ligne
// droite...) ne dit rien du batiment entier quand il a plusieurs corps (AE 101 : des pignons a l'est et au nord, une galerie au
// sud) ; elle dit le bout ou le long pan du corps qu'elle ferme. Decision de l'utilisateur, 18 octobre 2026 : corps par corps.
// Les seuils sont dans regles/toits/silhouettes.json. Pur.

import { SILHOUETTES_TOITS, type SilhouettesToits } from '../../../regles/toits/silhouettes.js';
import type { CorpsToit, PtBrut } from '../../../model/types.js';

/** Le corps et son cote : 0 et 2 les longs pans (`pts[0]-pts[1]`, `pts[2]-pts[3]`), 1 et 3 les bouts (s = L, s = 0). */
export interface MurDuCorps { corps: number; cote: 0 | 1 | 2 | 3 }

/**
 * Le corps dont un cote longe le mur de `gauche` a `droite` : parallele a lui, a moins de MUR_CORPS_DISTANCE_M de son milieu, et
 * le couvrant sur MUR_CORPS_RECOUVREMENT de sa largeur au moins. Le plus proche quand plusieurs le longent (des corps qui se
 * chevauchent) ; null quand aucun.
 */
export function murDuCorps(corps: readonly CorpsToit[], gauche: PtBrut, droite: PtBrut, regles: SilhouettesToits = SILHOUETTES_TOITS): MurDuCorps | null {
  const { MUR_CORPS_DISTANCE_M, MUR_CORPS_RECOUVREMENT } = regles.seuils;
  const lf = Math.hypot(droite.x - gauche.x, droite.y - gauche.y);
  if (!(lf > 0)) return null;
  const m = { x: (gauche.x + droite.x) / 2, y: (gauche.y + droite.y) / 2 };
  let meilleur: (MurDuCorps & { d: number }) | null = null;
  corps.forEach((c, k) => {
    for (let s = 0; s < 4; s++) {
      const a = c.pts[s] as PtBrut, b = c.pts[(s + 1) % 4] as PtBrut;
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (!(L > 0)) continue;
      const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
      // Parallele a 18 degres pres : un contour de cadastre et un corps a l'equerre ne le sont jamais tout a fait.
      if (Math.abs((ux * (droite.x - gauche.x) + uy * (droite.y - gauche.y)) / lf) < 0.95) continue;
      const d = Math.abs((m.x - a.x) * uy - (m.y - a.y) * ux);
      if (d > MUR_CORPS_DISTANCE_M) continue;
      const t1 = (gauche.x - a.x) * ux + (gauche.y - a.y) * uy, t2 = (droite.x - a.x) * ux + (droite.y - a.y) * uy;
      const recouvre = Math.min(L, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2));
      if (recouvre < MUR_CORPS_RECOUVREMENT * lf) continue;
      if (!meilleur || d < meilleur.d) meilleur = { corps: k, cote: s as 0 | 1 | 2 | 3, d };
    }
  });
  return meilleur ? { corps: (meilleur as MurDuCorps & { d: number }).corps, cote: (meilleur as MurDuCorps & { d: number }).cote } : null;
}
