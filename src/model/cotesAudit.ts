// Les facades de l'audit de la parcelle suivent leur mur quand le contour du batiment change (MD/spec-ouvrages.md, « Les toits dans
// l'audit de la parcelle », point 4 de « Ce qu'il faut ranger »).
//
// Une facade de la capture se designe par le rang de son cote dans le contour (`BatimentCapture.facades`, cle `cote`). Un sommet
// ajoute ou retire (app/assemblage/gestes.ts, une retouche a la main) decale tous les rangs suivants : les photos, les corrections
// et la mention « inaccessible » allaient au mur voisin. La capture vit hors du projet (le brouillon de l'appareil) : un decalage
// fait au moment du geste ne serait pas defait par Ctrl+Z. Elle garde donc le contour sur lequel ses rangs ont ete comptes
// (`contour`), et se recale par la geometrie sur le contour du moment : chaque ancien cote va au cote d'aujourd'hui qui le porte
// (meme droite, la plus longue part commune), et une annulation se recale de meme dans l'autre sens.
//
// Pur : pas de DOM, pas de stockage.

import type { BatimentCapture, FacadeCapturee } from './auditParcelle.js';
import { PHOTOS_PAR_FACADE_MAX } from './auditParcelle.js';
import type { PtBrut } from './types.js';

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

/** Deux facades qui tombent sur le meme mur (un coin retire) : les photos de l'une a la suite de l'autre, leurs corrections aussi. */
function fondre<P>(a: FacadeCapturee<P>, b: FacadeCapturee<P>): FacadeCapturee<P> {
  const photos = [...a.photos, ...b.photos].slice(0, PHOTOS_PAR_FACADE_MAX);
  const corrections = { ...(a.corrections ?? {}) };
  for (const [rang, c] of Object.entries(b.corrections ?? {})) { const r = Number(rang) + a.photos.length; if (r < photos.length) corrections[String(r)] = c; }
  const inaccessible = a.inaccessible ?? b.inaccessible;
  return { photos, ...(Object.keys(corrections).length ? { corrections } : {}), ...(inaccessible !== undefined ? { inaccessible } : {}) };
}

/**
 * Le batiment de la capture, ses facades rangees sur le contour d'aujourd'hui `pts`. Sans contour garde, celui-ci est adopte tel
 * quel (les rangs ont ete comptes dessus). Rend le meme objet quand rien ne change. Une facade dont aucun mur ne reste est gardee a
 * son rang : rien de ce qui a ete photographie ne se perd (model/fichierAuditParcelle.ts les redit).
 */
export function facadesSurLeContour<P>(b: BatimentCapture<P>, pts: readonly PtBrut[]): BatimentCapture<P> {
  if (!b.contour) return { ...b, contour: pts.map((p) => ({ x: p.x, y: p.y })) };
  if (memeContour(b.contour, pts)) return b;
  const vers = correspondanceDesCotes(b.contour, pts);
  const facades: Record<string, FacadeCapturee<P>> = {};
  for (const [rang, f] of Object.entries(b.facades).sort(([x], [y]) => Number(x) - Number(y))) {
    const j = vers[Number(rang)];
    const cle = j === undefined || j < 0 ? rang : String(j);
    const deja = facades[cle];
    facades[cle] = deja ? fondre(deja, f) : f;
  }
  return { ...b, facades, contour: pts.map((p) => ({ x: p.x, y: p.y })) };
}
