// L'alignement fin de deux photos voisines (fusion.ts) : deux photos redressees d'un meme mur ne different pas que d'un decalage et
// d'une echelle. Le redressement laisse une petite rotation, des proportions un peu differentes (la largeur sur la hauteur, que les
// points de fuite ne fixent pas), un reste de fuite. Une pose en decalage et echelle seuls se trompait donc de 10 a 40 px aux bouts du
// recouvrement. Ici : des vignettes de A cherchees dans B autour de la pose grossiere (correlation normalisee, au dixieme de pixel), puis
// l'homographie qui envoie B sur A, tiree au sort parmi ces correspondances (RANSAC) et ajustee aux moindres carres sur celles qui
// s'accordent. Sans DOM.

import { appliquer, homographie, type Homographie, type Image } from './plan/facade/vision/homographie.js';

export type { Homographie };
type P = { x: number; y: number };

/** Une image en niveaux de gris, en flottants, et son masque des pixels vus. */
export interface Gris { l: number; h: number; v: Float32Array; vu: Uint8Array }

/** Le gris d'une image reduite d'un facteur `f` (<= 1), moyenne par cases ; le masque suit. */
export function gris(img: Image, vu: Uint8Array, f: number): Gris {
  const l = Math.max(1, Math.round(img.largeur * f)), h = Math.max(1, Math.round(img.hauteur * f)), k = 1 / f;
  const v = new Float32Array(l * h), m = new Uint8Array(l * h), d = img.donnees, L = img.largeur;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * k), y1 = Math.min(img.hauteur, Math.max(y0 + 1, Math.floor((y + 1) * k)));
    for (let x = 0; x < l; x++) {
      const x0 = Math.floor(x * k), x1 = Math.min(L, Math.max(x0 + 1, Math.floor((x + 1) * k)));
      let n = 0, s = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = yy * L + xx;
        if (!vu[i]) continue;
        n++; s += 0.299 * (d[i * 4] ?? 0) + 0.587 * (d[i * 4 + 1] ?? 0) + 0.114 * (d[i * 4 + 2] ?? 0);
      }
      if (n * 2 >= (x1 - x0) * (y1 - y0)) { v[y * l + x] = s / n; m[y * l + x] = 1; }
    }
  }
  return { l, h, v, vu: m };
}

/** Bilineaire dans un gris ; NaN hors de l'image ou hors du masque. */
function lire(g: Gris, x: number, y: number): number {
  if (x < 0 || y < 0 || x > g.l - 1 || y > g.h - 1) return NaN;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(g.l - 1, x0 + 1), y1 = Math.min(g.h - 1, y0 + 1), fx = x - x0, fy = y - y0;
  const a = y0 * g.l + x0, b = y0 * g.l + x1, c = y1 * g.l + x0, d = y1 * g.l + x1;
  if (!g.vu[a] || !g.vu[b] || !g.vu[c] || !g.vu[d]) return NaN;
  return ((g.v[a] ?? 0) * (1 - fx) + (g.v[b] ?? 0) * fx) * (1 - fy) + ((g.v[c] ?? 0) * (1 - fx) + (g.v[d] ?? 0) * fx) * fy;
}

export function inverse(H: Homographie): Homographie {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const m: Homographie = [A, c * h - b * i, b * f - c * e, B, a * i - c * g, c * d - a * f, C, b * g - a * h, a * e - b * d];
  const n = m[8] !== 0 ? m[8] : det;
  return m.map((x) => x / n) as Homographie;
}

/** H1 puis H2 : le point p devient H2(H1(p)). */
export function composer(H2: Homographie, H1: Homographie): Homographie {
  const r: number[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push((H2[i * 3] ?? 0) * (H1[j] ?? 0) + (H2[i * 3 + 1] ?? 0) * (H1[3 + j] ?? 0) + (H2[i * 3 + 2] ?? 0) * (H1[6 + j] ?? 0));
  const n = r[8] || 1;
  return r.map((x) => x / n) as Homographie;
}

/** Une homographie qui change d'echelle : en pixels reduits de f, H devient S H S^-1. */
export function aLEchelle(H: Homographie, f: number): Homographie {
  return [H[0], H[1], H[2] * f, H[3], H[4], H[5] * f, H[6] / f, H[7] / f, H[8]];
}

/** Une correspondance : le point de B et le point de A qui montrent la meme chose. */
export interface Paire { b: P; a: P }

/**
 * Pour chaque vignette texturee de A (grille de pas `pas`), la meilleure place dans B, cherchee a `rayon` pixels autour de la pose `H`
 * (B -> A) : correlation normalisee sur la vignette, puis le sommet affine au dixieme par une parabole. Seules les vignettes nettes
 * (correlation au-dessus de 0,8, un pic franc) donnent une paire.
 */
export function correspondances(A: Gris, B: Gris, H: Homographie, rayon: number, demi = 12, pas = 24): Paire[] {
  const Hi = inverse(H), cote = 2 * demi + 1, n = cote * cote, paires: Paire[] = [];
  const t = new Float32Array(n), z = new Float32Array((cote + 2 * rayon) ** 2);
  const L = cote + 2 * rayon;
  for (let cy = demi + rayon; cy < A.h - demi - rayon; cy += pas) for (let cx = demi + rayon; cx < A.l - demi - rayon; cx += pas) {
    // La vignette de A, et sa texture : un enduit uni ne dit rien.
    let s = 0, ss = 0, ok = true;
    for (let j = 0; j < cote && ok; j++) for (let i = 0; i < cote; i++) {
      const q = (cy - demi + j) * A.l + cx - demi + i;
      if (!A.vu[q]) { ok = false; break; }
      const v = A.v[q] ?? 0;
      t[j * cote + i] = v; s += v; ss += v * v;
    }
    if (!ok) continue;
    const mt = s / n, vt = ss / n - mt * mt;
    if (vt < 60) continue;
    // B ramene dans le repere de A autour de la vignette, sur la fenetre de recherche.
    for (let j = 0; j < L && ok; j++) for (let i = 0; i < L; i++) {
      const p = appliquer(Hi, { x: cx - demi - rayon + i, y: cy - demi - rayon + j });
      const v = lire(B, p.x, p.y);
      if (Number.isNaN(v)) { ok = false; break; }
      z[j * L + i] = v;
    }
    if (!ok) continue;
    const scores = new Float32Array((2 * rayon + 1) ** 2);
    let mieux = -2, bx = 0, by = 0, second = -2;
    for (let dy = -rayon; dy <= rayon; dy++) for (let dx = -rayon; dx <= rayon; dx++) {
      let sz = 0, szz = 0, stz = 0;
      for (let j = 0; j < cote; j++) {
        const o = (j + rayon + dy) * L + rayon + dx;
        for (let i = 0; i < cote; i++) { const v = z[o + i] ?? 0, w = t[j * cote + i] ?? 0; sz += v; szz += v * v; stz += v * w; }
      }
      const mz = sz / n, vz = szz / n - mz * mz;
      const r = vz > 1e-6 ? (stz / n - mt * mz) / Math.sqrt(vt * vz) : -1;
      scores[(dy + rayon) * (2 * rayon + 1) + dx + rayon] = r;
      if (r > mieux) { second = Math.max(second, mieux); mieux = r; bx = dx; by = dy; } else if (r > second) second = r;
    }
    if (mieux < 0.8 || Math.abs(bx) === rayon || Math.abs(by) === rayon) continue;
    const sc = (dx: number, dy: number) => scores[(dy + rayon) * (2 * rayon + 1) + dx + rayon] ?? 0;
    const sommet = (m: number, c: number, p: number) => { const d = m - 2 * c + p; return d < 0 ? Math.max(-0.5, Math.min(0.5, (m - p) / (2 * d))) : 0; };
    const fx = bx + sommet(sc(bx - 1, by), mieux, sc(bx + 1, by)), fy = by + sommet(sc(bx, by - 1), mieux, sc(bx, by + 1));
    // A(c) ressemble a B ramene en c + f : le point de B est H^-1(c + f).
    paires.push({ a: { x: cx, y: cy }, b: appliquer(Hi, { x: cx + fx, y: cy + fy }) });
  }
  return paires;
}

/** L'homographie aux moindres carres (h33 = 1) qui envoie les b sur les a, coordonnees normalisees. null : moins de 4 paires. */
export function moindresCarres(paires: readonly Paire[]): Homographie | null {
  if (paires.length < 4) return null;
  const norme = (l: P[]) => {
    const cx = l.reduce((s, p) => s + p.x, 0) / l.length, cy = l.reduce((s, p) => s + p.y, 0) / l.length;
    const d = l.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / l.length || 1, k = Math.SQRT2 / d;
    return { T: [k, 0, -k * cx, 0, k, -k * cy, 0, 0, 1] as Homographie, f: (p: P) => ({ x: k * (p.x - cx), y: k * (p.y - cy) }) };
  };
  const nb = norme(paires.map((p) => p.b)), na = norme(paires.map((p) => p.a));
  const N: number[][] = Array.from({ length: 8 }, () => new Array<number>(9).fill(0));
  const ajouter = (r: number[], cible: number) => { for (let i = 0; i < 8; i++) { const ni = N[i] as number[]; for (let j = 0; j < 8; j++) ni[j] = (ni[j] ?? 0) + (r[i] ?? 0) * (r[j] ?? 0); ni[8] = (ni[8] ?? 0) + (r[i] ?? 0) * cible; } };
  for (const p of paires) {
    const { x, y } = nb.f(p.b), { x: u, y: v } = na.f(p.a);
    ajouter([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    ajouter([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  }
  // Gauss avec pivot partiel.
  for (let c = 0; c < 8; c++) {
    let pv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(N[r]?.[c] ?? 0) > Math.abs(N[pv]?.[c] ?? 0)) pv = r;
    [N[c], N[pv]] = [N[pv] as number[], N[c] as number[]];
    const lc = N[c] as number[], d = lc[c] ?? 0;
    if (Math.abs(d) < 1e-12) return null;
    for (let r = 0; r < 8; r++) { if (r === c) continue; const lr = N[r] as number[], k = (lr[c] ?? 0) / d; for (let j = c; j < 9; j++) lr[j] = (lr[j] ?? 0) - k * (lc[j] ?? 0); }
  }
  const h = N.map((l, i) => (l[8] ?? 0) / (l[i] ?? 1));
  const Hn = [...h, 1] as Homographie;
  // H = Ta^-1 Hn Tb.
  return composer(inverse(na.T), composer(Hn, nb.T));
}

/** Un tirage reproductible (le meme jeu de photos donne la meme fusion). */
function alea(graine: number): () => number {
  let g = graine >>> 0 || 1;
  return () => { g ^= g << 13; g >>>= 0; g ^= g >>> 17; g ^= g << 5; g >>>= 0; return g / 4294967296; };
}

/** RANSAC : l'homographie de quatre paires tirees qui accorde le plus de paires a `seuil` pres, reajustee sur elles. */
export function ransac(paires: readonly Paire[], seuil: number, tirages = 400): { H: Homographie; accord: Paire[] } | null {
  if (paires.length < 8) return null;
  const r = alea(paires.length * 7919);
  let mieux: Paire[] = [];
  for (let k = 0; k < tirages; k++) {
    const idx = new Set<number>();
    while (idx.size < 4) idx.add(Math.floor(r() * paires.length));
    const q = [...idx].map((i) => paires[i] as Paire);
    const H = homographie(q.map((p) => p.b), q.map((p) => p.a));
    if (!H) continue;
    const accord = paires.filter((p) => { const e = appliquer(H, p.b); return Math.hypot(e.x - p.a.x, e.y - p.a.y) < seuil; });
    if (accord.length > mieux.length) mieux = accord;
  }
  if (mieux.length < 8) return null;
  const H = moindresCarres(mieux);
  if (!H) return null;
  // Un tour de plus : les paires que l'homographie ajustee accorde.
  const accord = paires.filter((p) => { const e = appliquer(H, p.b); return Math.hypot(e.x - p.a.x, e.y - p.a.y) < seuil; });
  const H2 = accord.length >= 8 ? moindresCarres(accord) : H;
  return H2 ? { H: H2, accord } : { H, accord: mieux };
}

/**
 * Une homographie plausible entre deux photos redressees d'un meme mur : pas de retournement, une echelle et des proportions proches,
 * une fuite faible. Ce qui sort de la est une erreur de correspondances, pas une prise de vue.
 */
export function plausible(H: Homographie, l: number, h: number): boolean {
  const c = [{ x: 0, y: 0 }, { x: l, y: 0 }, { x: l, y: h }, { x: 0, y: h }].map((p) => appliquer(H, p));
  const cote = (i: number, j: number) => Math.hypot((c[j]?.x ?? 0) - (c[i]?.x ?? 0), (c[j]?.y ?? 0) - (c[i]?.y ?? 0));
  const haut = cote(0, 1) / l, bas = cote(3, 2) / l, gauche = cote(0, 3) / h, droite = cote(1, 2) / h;
  const r = [haut, bas, gauche, droite];
  if (r.some((x) => !Number.isFinite(x) || x < 0.4 || x > 2.5)) return false;
  return Math.max(haut, bas) / Math.min(haut, bas) < 1.25 && Math.max(gauche, droite) / Math.min(gauche, droite) < 1.25;
}

/**
 * L'alignement fin : a partir d'une pose grossiere `H0` (B -> A, pixels pleins), deux tours de correspondances et de RANSAC, a une
 * resolution de travail de `hauteur` lignes, la fenetre de recherche se resserrant. Rend la pose affinee et le nombre de paires qui
 * l'appuient ; la pose grossiere quand les correspondances ne suffisent pas.
 */
export function aligner(A: Image, vuA: Uint8Array, B: Image, vuB: Uint8Array, H0: Homographie, hauteur = 700): { H: Homographie; paires: number; ecart: number } {
  const f = Math.min(1, hauteur / A.hauteur);
  const gA = gris(A, vuA, f), gB = gris(B, vuB, f);
  let H = aLEchelle(H0, f), paires = 0, ecart = NaN;
  for (const [rayon, seuil] of [[14, 3], [5, 1.5]] as const) {
    const l = correspondances(gA, gB, H, rayon);
    const r = ransac(l, seuil);
    if (!r || !plausible(r.H, gB.l, gB.h)) break;
    H = r.H; paires = r.accord.length;
    ecart = r.accord.reduce((s, p) => { const e = appliquer(r.H, p.b); return s + Math.hypot(e.x - p.a.x, e.y - p.a.y); }, 0) / r.accord.length / f;
  }
  return { H: aLEchelle(H, 1 / f), paires, ecart };
}
