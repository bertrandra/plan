// La correspondance des cotes de deux contours d'un meme objet, avant et apres une deformation : chaque ancien cote va au cote
// d'aujourd'hui qui le porte (meme droite, la plus longue part commune). De la geometrie, lue par les facades de l'audit
// (model/cotesAudit.ts) et par tout ce qu'un ouvrage range par rang de cote (model/referencesContour.ts).

import type { PtBrut } from '../model/types.js';

/** Deux cotes a moins de cet angle sont dans le meme sens. */
const ANGLE_MEME_MUR_DEG = 10;
/** Un cote d'aujourd'hui est sur la droite d'un ancien quand ses bouts en sont a moins de cela. */
const ECART_MEME_MUR_M = 0.3;
/** Deux contours dont tous les sommets sont a moins de cela l'un de l'autre sont le meme. */
const MEME_SOMMET_M = 0.01;

const cote = (pts: readonly PtBrut[], i: number): [PtBrut, PtBrut] => [pts[i] as PtBrut, pts[(i + 1) % pts.length] as PtBrut];
const direction = ([a, b]: [PtBrut, PtBrut]) => { const L = Math.hypot(b.x - a.x, b.y - a.y); return L > 0 ? { x: (b.x - a.x) / L, y: (b.y - a.y) / L, L } : null; };
const angleEntre = (u: { x: number; y: number }, v: { x: number; y: number }) => (Math.acos(Math.min(1, Math.abs(u.x * v.x + u.y * v.y))) * 180) / Math.PI;

/** Le meme contour, au centimetre pres. */
export function memeContour(a: readonly PtBrut[], b: readonly PtBrut[]): boolean {
  return a.length === b.length && a.every((p, i) => { const q = b[i]; return !!q && Math.hypot(p.x - q.x, p.y - q.y) < MEME_SOMMET_M; });
}

/**
 * Le rang d'aujourd'hui de chaque ancien cote (-1 : aucun ne le porte). Meme nombre de cotes, chacun dans le sens de l'ancien :
 * le contour a ete deplace ou etire, les rangs restent. Sinon, chaque ancien cote va au cote d'aujourd'hui sur la meme droite avec
 * qui il partage la plus grande longueur (un cote coupe en deux par un sommet ajoute va a la plus grande part) ; a defaut (un coin
 * retire a fait une diagonale), au cote dont le milieu est le plus proche du sien.
 */
export function correspondanceDesCotes(avant: readonly PtBrut[], apres: readonly PtBrut[]): number[] {
  if (avant.length < 2 || apres.length < 2) return avant.map(() => -1);
  if (avant.length === apres.length && avant.every((_, i) => {
    const u = direction(cote(avant, i)), v = direction(cote(apres, i));
    return !!u && !!v && u.x * v.x + u.y * v.y > 0 && angleEntre(u, v) < ANGLE_MEME_MUR_DEG;
  })) return avant.map((_, i) => i);
  return avant.map((_, i) => {
    const [a, b] = cote(avant, i), u = direction([a, b]);
    if (!u) return -1;
    let meilleur = -1, part = 0;
    apres.forEach((_, j) => {
      const [c, d] = cote(apres, j), v = direction([c, d]);
      if (!v || angleEntre(u, v) >= ANGLE_MEME_MUR_DEG) return;
      // Les bouts du cote d'aujourd'hui, sur la droite de l'ancien : ecart a la droite, et abscisse.
      const ecart = (p: PtBrut) => Math.abs((p.x - a.x) * u.y - (p.y - a.y) * u.x);
      if (ecart(c) > ECART_MEME_MUR_M || ecart(d) > ECART_MEME_MUR_M) return;
      const s = (p: PtBrut) => (p.x - a.x) * u.x + (p.y - a.y) * u.y;
      const commun = Math.min(u.L, Math.max(s(c), s(d))) - Math.max(0, Math.min(s(c), s(d)));
      if (commun > part) { part = commun; meilleur = j; }
    });
    if (meilleur >= 0) return meilleur;
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let d2 = Infinity;
    apres.forEach((_, j) => { const [c, d] = cote(apres, j); const dj = Math.hypot((c.x + d.x) / 2 - m.x, (c.y + d.y) / 2 - m.y); if (dj < d2) { d2 = dj; meilleur = j; } });
    return meilleur;
  });
}

