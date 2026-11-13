// « Coller au bord » (demande du proprietaire, 13 novembre 2026) : un rectangle trace a peu pres se cale sur le bord que la photo montre
// (le cadre d'une menuiserie, le tableau d'une baie). Chaque cote cherche, a quelques pixels de part et d'autre, la ligne ou l'image change
// le plus nettement en travers de lui, le long de sa partie centrale : le plus a l'exterieur des bords francs (le hors-tout, cadre
// compris). Sur un enduit sans bord, rien ne bouge.
// Sans DOM.

import type { Gris } from './fusionAlignement.js';
import type { Boite } from './semblables.js';

/**
 * La nettete moyenne de la limite entre deux colonnes, x - 1 et x (|I(x) - I(x - 1)|), entre y0 et y1 ; ou entre deux lignes. Un bord
 * d'objet est une limite entre pixels : un rectangle de x0 a x1 couvre les colonnes x0 a x1 - 1.
 */
function netteteV(g: Gris, x: number, y0: number, y1: number): number {
  if (x < 1 || x > g.l - 1) return 0;
  let s = 0, n = 0;
  for (let y = Math.max(0, y0); y <= Math.min(g.h - 1, y1); y++) {
    const a = y * g.l + x - 1, b = a + 1;
    if (!g.vu[a] || !g.vu[b]) continue;
    s += Math.abs((g.v[b] ?? 0) - (g.v[a] ?? 0)); n++;
  }
  return n ? s / n : 0;
}
function netteteH(g: Gris, y: number, x0: number, x1: number): number {
  if (y < 1 || y > g.h - 1) return 0;
  let s = 0, n = 0;
  for (let x = Math.max(0, x0); x <= Math.min(g.l - 1, x1); x++) {
    const a = (y - 1) * g.l + x, b = y * g.l + x;
    if (!g.vu[a] || !g.vu[b]) continue;
    s += Math.abs((g.v[b] ?? 0) - (g.v[a] ?? 0)); n++;
  }
  return n ? s / n : 0;
}

/**
 * Le bord ou poser un cote, a `r` pixels autour de `p` : parmi les bords nets (un sommet de nettete, au quart au moins du plus net (le cadre sur un mur clair est moins franc que la vitre), et
 * nettement au-dessus du grain de l'enduit, la mediane), le plus a l'exterieur (`vers` : -1 vers la gauche ou le haut, +1 vers la droite ou
 * le bas). Une fenetre a deux bords francs, celui du cadre sur le mur et celui de la vitre ; la convention du banc est le hors-tout,
 * cadre compris. `p` lui-meme quand rien n'est net.
 */
function poser(p: number, r: number, nettete: (q: number) => number, vers: -1 | 1): number {
  const c = Math.round(p), q0 = c - r, prof: number[] = [];
  for (let q = q0; q <= c + r; q++) prof.push(nettete(q));
  const tri = [...prof].sort((a, b) => a - b), mediane = tri[Math.floor(tri.length / 2)] ?? 0, max = tri[tri.length - 1] ?? 0;
  const seuil = Math.max(4, 2.5 * mediane, 0.25 * max);
  const nets: number[] = [];
  prof.forEach((v, i) => { if (v >= seuil && v >= (prof[i - 1] ?? 0) && v >= (prof[i + 1] ?? 0)) nets.push(q0 + i); });
  if (!nets.length) return p;
  return vers < 0 ? Math.min(...nets) : Math.max(...nets);
}

/**
 * Le rectangle cale sur les bords de l'image g (coordonnees de g). Chaque cote cherche a 12 % de la taille (3 pixels au moins), le long de
 * ses 60 % du milieu (les coins, souvent pris dans un autre bord, ne comptent pas). Un rectangle qui s'ecraserait garde sa place.
 */
export function caler(g: Gris, b: Boite): Boite {
  const l = b.x1 - b.x0, h = b.y1 - b.y0;
  if (l < 6 || h < 6) return b;
  const rx = Math.max(3, Math.round(0.12 * l)), ry = Math.max(3, Math.round(0.12 * h));
  const my0 = Math.round(b.y0 + 0.2 * h), my1 = Math.round(b.y1 - 0.2 * h), mx0 = Math.round(b.x0 + 0.2 * l), mx1 = Math.round(b.x1 - 0.2 * l);
  const x0 = poser(b.x0, rx, (x) => netteteV(g, x, my0, my1), -1), x1 = poser(b.x1, rx, (x) => netteteV(g, x, my0, my1), 1);
  const y0 = poser(b.y0, ry, (y) => netteteH(g, y, mx0, mx1), -1), y1 = poser(b.y1, ry, (y) => netteteH(g, y, mx0, mx1), 1);
  if (x1 - x0 < 0.5 * l || y1 - y0 < 0.5 * h) return b;
  return { x0, y0, x1, y1 };
}
