// « Trouver les semblables » (demande du proprietaire, 13 novembre 2026) : une facade repete ses fenetres. D'une fenetre dessinee, le banc
// cherche sur la photo celles qui lui ressemblent : la vignette de l'objet, cherchee partout par correlation normalisee (a trois tailles,
// sur une image reduite pour aller vite), les sommets au-dessus d'un seuil gardes, puis chaque place reprise au pixel sur l'image de
// travail. La correlation ne voit que les formes, pas les couleurs : sur une maison a colombages, une bande d'enduit blanc entre deux
// poteaux verts ressemble a une fenetre (cadre clair, vitre sombre). L'ecart de couleur moyenne a la fenetre dessinee, en couleurs,
// est donc retranche du score (sur AE 101 : 5 pour la fenetre jumelle, 47 et plus pour les fausses). Les places deja prises par un objet
// ne sont pas proposees. Sans DOM.

import type { Gris } from './fusionAlignement.js';
import type { Image } from './plan/facade/vision/homographie.js';

export interface Boite { x0: number; y0: number; x1: number; y1: number }
export interface Semblable { boite: Boite; score: number }

const HAUTEUR_VIGNETTE = 20;
const COTE_RECHERCHE = 420;
export const ECHELLES_SEMBLABLES = [0.9, 1, 1.1];

/** Le gris reduit d'un facteur k (<= 1), moyenne par cases ; une case sans pixel vu ne l'est pas. */
export function reduireGris(g: Gris, k: number): Gris {
  if (k >= 1) return g;
  const l = Math.max(1, Math.round(g.l * k)), h = Math.max(1, Math.round(g.h * k)), r = 1 / k;
  const v = new Float32Array(l * h), vu = new Uint8Array(l * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * r), y1 = Math.min(g.h, Math.max(y0 + 1, Math.floor((y + 1) * r)));
    for (let x = 0; x < l; x++) {
      const x0 = Math.floor(x * r), x1 = Math.min(g.l, Math.max(x0 + 1, Math.floor((x + 1) * r)));
      let n = 0, s = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = yy * g.l + xx; if (g.vu[i]) { n++; s += g.v[i] ?? 0; } }
      if (n) { v[y * l + x] = s / n; vu[y * l + x] = 1; }
    }
  }
  return { l, h, v, vu };
}

/** La vignette d'une boite (coordonnees de g), echantillonnee sur une grille l x h (bilineaire) : la meme chose a une autre taille. */
function vignette(g: Gris, b: Boite, l: number, h: number): Float32Array | null {
  const t = new Float32Array(l * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < l; i++) {
    const x = Math.min(g.l - 1, Math.max(0, b.x0 + ((i + 0.5) / l) * (b.x1 - b.x0) - 0.5)), y = Math.min(g.h - 1, Math.max(0, b.y0 + ((j + 0.5) / h) * (b.y1 - b.y0) - 0.5));
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(g.l - 1, x0 + 1), y1 = Math.min(g.h - 1, y0 + 1), fx = x - x0, fy = y - y0;
    const a = y0 * g.l + x0, bb = y0 * g.l + x1, c = y1 * g.l + x0, d = y1 * g.l + x1;
    if (!g.vu[a]) return null;
    t[j * l + i] = ((g.v[a] ?? 0) * (1 - fx) + (g.v[bb] ?? 0) * fx) * (1 - fy) + ((g.v[c] ?? 0) * (1 - fx) + (g.v[d] ?? 0) * fx) * fy;
  }
  return t;
}

/** Les sommes cumulees de l'image et de son carre : la moyenne et la variance d'une fenetre en quatre lectures. */
function integrales(g: Gris): { s: Float64Array; ss: Float64Array; n: Float64Array } {
  const L = g.l + 1, s = new Float64Array(L * (g.h + 1)), ss = new Float64Array(L * (g.h + 1)), n = new Float64Array(L * (g.h + 1));
  for (let y = 0; y < g.h; y++) {
    let rs = 0, rss = 0, rn = 0;
    for (let x = 0; x < g.l; x++) {
      const i = y * g.l + x, v = g.vu[i] ? g.v[i] ?? 0 : 0;
      rs += v; rss += v * v; rn += g.vu[i] ? 1 : 0;
      const o = (y + 1) * L + x + 1;
      s[o] = (s[o - L] ?? 0) + rs; ss[o] = (ss[o - L] ?? 0) + rss; n[o] = (n[o - L] ?? 0) + rn;
    }
  }
  return { s, ss, n };
}

/** La carte de correlation normalisee de la vignette t (l x h) en chaque place de g ; NaN ou la fenetre n'est pas entierement vue. */
export function carteNcc(g: Gris, t: Float32Array, l: number, h: number): Float32Array {
  const n = l * h, carte = new Float32Array(Math.max(0, (g.l - l + 1) * (g.h - h + 1))).fill(NaN);
  let mt = 0;
  for (const v of t) mt += v;
  mt /= n;
  const tc = t.map((v) => v - mt);
  let nt = 0;
  for (const v of tc) nt += v * v;
  if (nt < 1e-6 * n) return carte;
  const { s, ss, n: nv } = integrales(g), L = g.l + 1, lc = g.l - l + 1;
  const somme = (a: Float64Array, x: number, y: number) => (a[(y + h) * L + x + l] ?? 0) - (a[y * L + x + l] ?? 0) - (a[(y + h) * L + x] ?? 0) + (a[y * L + x] ?? 0);
  for (let y = 0; y + h <= g.h; y++) for (let x = 0; x + l <= g.l; x++) {
    if (somme(nv, x, y) < n) continue;
    const m = somme(s, x, y), vi = somme(ss, x, y) - (m * m) / n;
    if (vi < 1e-6 * n) continue;
    let c = 0;
    for (let j = 0; j < h; j++) { const o = (y + j) * g.l + x, ot = j * l; for (let i = 0; i < l; i++) c += (tc[ot + i] ?? 0) * (g.v[o + i] ?? 0); }
    carte[y * lc + x] = c / Math.sqrt(nt * vi);
  }
  return carte;
}

export const recouvrement = (a: Boite, b: Boite): number => {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)), i = ix * iy;
  const u = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - i;
  return u > 0 ? i / u : 0;
};

/**
 * Les semblables de `modele` (une boite en pixels de g) sur g, hors des boites `prises` (les objets deja poses, le modele compris) :
 * les places dont la ressemblance passe `seuil`, des plus ressemblantes aux moins, au plus `max`.
 */
export function semblables(g: Gris, modele: Boite, prises: readonly Boite[], seuil = 0.65, max = 40, couleurs?: Image): Semblable[] {
  const hb = modele.y1 - modele.y0, lb = modele.x1 - modele.x0;
  if (hb < 4 || lb < 4) return [];
  // La recherche grossiere : la vignette a une vingtaine de lignes, l'image au plus a COTE_RECHERCHE pixels.
  const k = Math.min(1, HAUTEUR_VIGNETTE / hb, COTE_RECHERCHE / Math.max(g.l, g.h));
  const p = reduireGris(g, k), kx = p.l / g.l, ky = p.h / g.h;
  const candidats: Semblable[] = [];
  // Le seuil grossier est plus bas : la place affinee, puis la couleur, departagent.
  const seuilGrossier = seuil - 0.1;
  for (const e of ECHELLES_SEMBLABLES) {
    const l = Math.max(3, Math.round(lb * kx * e)), h = Math.max(3, Math.round(hb * ky * e));
    if (l >= p.l || h >= p.h) continue;
    const t = vignette(p, { x0: modele.x0 * kx, y0: modele.y0 * ky, x1: modele.x1 * kx, y1: modele.y1 * ky }, l, h);
    if (!t) continue;
    const c = carteNcc(p, t, l, h), lc = p.l - l + 1, hc = p.h - h + 1;
    for (let y = 0; y < hc; y++) for (let x = 0; x < lc; x++) {
      const v = c[y * lc + x] ?? NaN;
      if (!(v >= seuilGrossier)) continue;
      // Un sommet : au moins aussi haut que ses huit voisins.
      let sommet = true;
      for (let dy = -1; dy <= 1 && sommet; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= lc || yy >= hc) continue;
        if ((c[yy * lc + xx] ?? -2) > v) { sommet = false; break; }
      }
      if (sommet) candidats.push({ score: v, boite: { x0: x / kx, y0: y / ky, x1: (x + l) / kx, y1: (y + h) / ky } });
    }
  }
  candidats.sort((a, b) => b.score - a.score);
  const teinte = couleurs ? couleurMoyenne(couleurs, modele) : null;
  const gardes: Semblable[] = [];
  let essais = 0;
  for (const c of candidats) {
    if (essais >= 30) break;
    if (prises.some((b) => recouvrement(b, c.boite) > 0.25) || gardes.some((b) => recouvrement(b.boite, c.boite) > 0.25)) continue;
    essais++;
    const r = affinerPlace(g, modele, c, 1 / Math.min(kx, ky));
    const ecart = couleurs && teinte ? distance(couleurMoyenne(couleurs, r.boite), teinte) : 0;
    const score = r.score - ecart / 100;
    if (score < seuil || prises.some((b) => recouvrement(b, r.boite) > 0.25) || gardes.some((b) => recouvrement(b.boite, r.boite) > 0.25)) continue;
    gardes.push({ ...r, score });
  }
  return gardes.sort((a, b) => b.score - a.score).slice(0, max);
}

/** La couleur moyenne d'une boite (pixels de l'image, a la taille de g). */
export function couleurMoyenne(img: Image, b: Boite): [number, number, number] {
  const m: [number, number, number] = [0, 0, 0];
  let n = 0;
  const x0 = Math.max(0, Math.round(b.x0)), x1 = Math.min(img.largeur, Math.round(b.x1)), y0 = Math.max(0, Math.round(b.y0)), y1 = Math.min(img.hauteur, Math.round(b.y1));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * img.largeur + x) * 4; m[0] += img.donnees[i] ?? 0; m[1] += img.donnees[i + 1] ?? 0; m[2] += img.donnees[i + 2] ?? 0; n++; }
  return n ? [m[0] / n, m[1] / n, m[2] / n] : m;
}
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));

/** La place d'un candidat reprise au pixel de g, a sa taille, a `rayon` pixels autour de la place grossiere. */
function affinerPlace(g: Gris, modele: Boite, c: Semblable, rayon: number): Semblable {
  const l = Math.max(3, Math.round(c.boite.x1 - c.boite.x0)), h = Math.max(3, Math.round(c.boite.y1 - c.boite.y0));
  // Au plus 48 lignes : au-dela, la place n'est pas plus juste et le calcul s'alourdit.
  const k = Math.min(1, 48 / h), r = Math.ceil(rayon * k) + 1;
  const x0 = Math.max(0, Math.floor(c.boite.x0 * k) - r - 1), y0 = Math.max(0, Math.floor(c.boite.y0 * k) - r - 1);
  const x1 = Math.min(g.l, Math.ceil(c.boite.x1 * k) + r + 1), y1 = Math.min(g.h, Math.ceil(c.boite.y1 * k) + r + 1);
  const p = reduireGris(g, k);
  const lk = Math.max(3, Math.round(l * k)), hk = Math.max(3, Math.round(h * k));
  const t = vignette(p, { x0: modele.x0 * k, y0: modele.y0 * k, x1: modele.x1 * k, y1: modele.y1 * k }, lk, hk);
  const morceau: Gris = { l: Math.max(1, Math.min(p.l, x1) - x0), h: Math.max(1, Math.min(p.h, y1) - y0), v: new Float32Array(0), vu: new Uint8Array(0) };
  if (!t || morceau.l <= lk || morceau.h <= hk) return c;
  morceau.v = new Float32Array(morceau.l * morceau.h); morceau.vu = new Uint8Array(morceau.l * morceau.h);
  for (let y = 0; y < morceau.h; y++) for (let x = 0; x < morceau.l; x++) { const i = (y0 + y) * p.l + x0 + x; morceau.v[y * morceau.l + x] = p.v[i] ?? 0; morceau.vu[y * morceau.l + x] = p.vu[i] ?? 0; }
  const carte = carteNcc(morceau, t, lk, hk), lc = morceau.l - lk + 1;
  let mieux = -2, bx = 0, by = 0;
  carte.forEach((v, i) => { if (v > mieux) { mieux = v; bx = i % lc; by = Math.floor(i / lc); } });
  if (mieux <= -2) return c;
  return { score: mieux, boite: { x0: (x0 + bx) / k, y0: (y0 + by) / k, x1: (x0 + bx + lk) / k, y1: (y0 + by + hk) / k } };
}
