// Les segments de droite d'une photo (MD/spec-facades-calage-detection.md §6.1, lot L7).
//
// Le calage fin cherche les aretes du mur : ses deux cotes, l'egout, le pied. Ce sont des droites,
// et sur une photo une droite se voit comme une suite de pixels dont le gradient garde la meme
// direction. C'est l'idee du detecteur LSD (von Gioi et al., 2012), dont on garde l'essentiel :
// - le gradient, calcule sur la couleur (le canal qui varie le plus) : un mur beige sur un ciel bleu
//   pale se distingue mal en luminance seule ;
// - les pixels pris du plus fort gradient au plus faible, et chaque region grossie de ses voisins
//   dont la direction du gradient reste a 22,5 degres de celle de la region ;
// - la droite de la region par ses moments (axe principal, pondere par le gradient), ses bouts par
//   la projection de ses pixels.
// On ne garde pas le test a contrario de LSD (le nombre de fausses alarmes) : une region trop clairsemee
// ou trop courte est ecartee, et le calage fin trie ensuite les segments par leur accord avec les
// points de fuite, ce qui elimine le bruit bien mieux qu'un seuil.
//
// La photo est d'abord reduite (800 px sur le grand cote par defaut) : le calcul tient alors en
// quelques dizaines de millisecondes, et l'axe d'une region de plusieurs dizaines de pixels se place
// au dixieme de pixel, bien en deca de ce que demande un coin a 10 cm.
//
// Coordonnees : celles de la photo d'origine, continues, le pixel (i, j) couvrant [i, i + 1] x [j, j + 1].

import type { Image } from './homographie.js';

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Longueur, en pixels de la photo d'origine. */
  longueur: number;
  /** Gradient moyen le long du segment (niveaux de 0 a 255) : sa nettete. */
  force: number;
}

export interface OptionsSegments {
  /** Grand cote de l'image analysee, en pixels : la photo est reduite d'un facteur entier pour s'y tenir. */
  grandCoteMax?: number;
  /** Gradient minimal d'un pixel, en niveaux par pixel (de l'image reduite). */
  seuilGradient?: number;
  /** Ecart maximal de direction d'un pixel a sa region, en degres. */
  toleranceDeg?: number;
  /** Longueur minimale d'un segment, en pixels de la photo d'origine. */
  longueurMin?: number;
}

const GRAND_COTE_MAX = 800;
/**
 * Un enduit tachete ou le bruit d'un capteur varient de quelques niveaux d'un pixel a l'autre apres
 * le lissage ; l'arete d'un mur sur le ciel, d'une gouttiere ou d'une baie en fait des dizaines.
 */
const SEUIL_GRADIENT = 5;
const TOLERANCE_DEG = 22.5;
const LONGUEUR_MIN = 12;
/** Une region dont les pixels couvrent moins de cette part de son rectangle n'est pas une droite. */
const DENSITE_MIN = 0.5;
/** Pixels minimaux d'une region (image reduite) avant meme de l'ajuster. */
const PIXELS_MIN = 6;

/**
 * Reduit la photo d'un facteur entier `s` (moyenne de chaque bloc s x s), puis la lisse d'un noyau
 * [1 2 1] / 4 : trois canaux en flottants.
 */
function preparer(img: Image, s: number): { rgb: Float32Array; l: number; h: number } {
  const l = Math.floor(img.largeur / s),
    h = Math.floor(img.hauteur / s);
  const brut = new Float32Array(l * h * 3);
  const d = img.donnees,
    L = img.largeur,
    n = s * s;
  for (let j = 0; j < h; j++)
    for (let i = 0; i < l; i++) {
      let r = 0,
        g = 0,
        b = 0;
      for (let dy = 0; dy < s; dy++) {
        let o = ((j * s + dy) * L + i * s) * 4;
        for (let dx = 0; dx < s; dx++, o += 4) {
          r += d[o] as number;
          g += d[o + 1] as number;
          b += d[o + 2] as number;
        }
      }
      const k = (j * l + i) * 3;
      brut[k] = r / n;
      brut[k + 1] = g / n;
      brut[k + 2] = b / n;
    }
  // Lissage separable : il retire le bruit d'un pixel sans deplacer les aretes (noyau symetrique).
  const tmp = new Float32Array(brut.length);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < l; i++)
      for (let c = 0; c < 3; c++) {
        const a = (j * l + Math.max(0, i - 1)) * 3 + c,
          m = (j * l + i) * 3 + c,
          z = (j * l + Math.min(l - 1, i + 1)) * 3 + c;
        tmp[m] = ((brut[a] as number) + 2 * (brut[m] as number) + (brut[z] as number)) / 4;
      }
  const rgb = new Float32Array(brut.length);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < l; i++)
      for (let c = 0; c < 3; c++) {
        const a = (Math.max(0, j - 1) * l + i) * 3 + c,
          m = (j * l + i) * 3 + c,
          z = (Math.min(h - 1, j + 1) * l + i) * 3 + c;
        rgb[m] = ((tmp[a] as number) + 2 * (tmp[m] as number) + (tmp[z] as number)) / 4;
      }
  return { rgb, l, h };
}

/**
 * Le gradient de Sobel, canal par canal, garde sur le canal le plus fort : son module (niveaux par
 * pixel) et l'angle de la ligne de niveau (perpendiculaire au gradient), dans ]-pi, pi].
 */
function gradient(rgb: Float32Array, l: number, h: number): { mod: Float32Array; angle: Float32Array } {
  const mod = new Float32Array(l * h),
    angle = new Float32Array(l * h);
  const L3 = l * 3;
  for (let j = 1; j < h - 1; j++)
    for (let i = 1; i < l - 1; i++) {
      let meilleur = -1,
        gxB = 0,
        gyB = 0;
      const o = (j * l + i) * 3;
      for (let c = 0; c < 3; c++) {
        const k = o + c;
        const hg = rgb[k - L3 - 3] as number,
          hm = rgb[k - L3] as number,
          hd = rgb[k - L3 + 3] as number,
          mg = rgb[k - 3] as number,
          md = rgb[k + 3] as number,
          bg = rgb[k + L3 - 3] as number,
          bm = rgb[k + L3] as number,
          bd = rgb[k + L3 + 3] as number;
        const gx = hd + 2 * md + bd - hg - 2 * mg - bg;
        const gy = bg + 2 * bm + bd - hg - 2 * hm - hd;
        const m2 = gx * gx + gy * gy;
        if (m2 > meilleur) {
          meilleur = m2;
          gxB = gx;
          gyB = gy;
        }
      }
      const k = j * l + i;
      // Le noyau de Sobel somme quatre differences centrales sur deux pixels : /8 rend des niveaux par pixel.
      mod[k] = Math.sqrt(meilleur) / 8;
      angle[k] = Math.atan2(gxB, -gyB);
    }
  return { mod, angle };
}

const ecartAngle = (a: number, b: number) => {
  let d = Math.abs(a - b) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
};

/** Ce que la croissance des regions laisse a chaque region : l'image reduite, son facteur et son gradient. */
interface ContexteRegions {
  /** Largeur de l'image reduite. */
  l: number;
  /** Facteur de reduction : un pixel reduit couvre s x s pixels de la photo. */
  s: number;
  mod: Float32Array;
}

/**
 * Fait croitre les regions de gradient de meme direction, de la plus nette a la plus faible, et les
 * passe une a une a `visiter` (les indices de leurs pixels dans l'image reduite). Le detecteur de
 * segments les ajuste en droites ; la correction de la distorsion (distorsion.ts) en garde les pixels,
 * car une arete courbee par l'objectif n'est plus une droite.
 */
function parcourirRegions(img: Image, o: OptionsSegments, visiter: (region: Int32Array, n: number, c: ContexteRegions) => void): void {
  const s = Math.max(1, Math.ceil(Math.max(img.largeur, img.hauteur) / (o.grandCoteMax ?? GRAND_COTE_MAX)));
  const { rgb, l, h } = preparer(img, s);
  if (l < 3 || h < 3) return;
  const { mod, angle } = gradient(rgb, l, h);
  const seuil = o.seuilGradient ?? SEUIL_GRADIENT;
  const tol = ((o.toleranceDeg ?? TOLERANCE_DEG) * Math.PI) / 180;
  const contexte: ContexteRegions = { l, s, mod };

  // Tri par paquets du gradient, du plus fort au plus faible : les regions naissent sur les aretes
  // les plus nettes, comme dans LSD, ce qui les garde droites.
  const PAQUETS = 256;
  const maxMod = 128;
  const comptes = new Int32Array(PAQUETS + 1);
  const paquetDe = (m: number) => Math.min(PAQUETS - 1, Math.floor((m / maxMod) * PAQUETS));
  for (let k = 0; k < l * h; k++) {
    const m = mod[k] as number;
    if (m < seuil) continue;
    const b = paquetDe(m) + 1;
    comptes[b] = (comptes[b] as number) + 1;
  }
  for (let b = 1; b <= PAQUETS; b++) comptes[b] = (comptes[b] as number) + (comptes[b - 1] as number);
  const ordre = new Int32Array(comptes[PAQUETS] as number);
  const pos = comptes.slice(0, PAQUETS);
  for (let k = 0; k < l * h; k++) {
    const m = mod[k] as number;
    if (m < seuil) continue;
    const b = paquetDe(m);
    ordre[pos[b] as number] = k;
    pos[b] = (pos[b] as number) + 1;
  }

  const pris = new Uint8Array(l * h);
  const region = new Int32Array(l * h);
  for (let r = ordre.length - 1; r >= 0; r--) {
    const graine = ordre[r] as number;
    if (pris[graine]) continue;
    // Croissance de la region : voisins a 8, direction proche de celle, moyenne, de la region.
    let n = 0;
    region[n++] = graine;
    pris[graine] = 1;
    let sx = Math.cos(angle[graine] as number),
      sy = Math.sin(angle[graine] as number);
    let ang = angle[graine] as number;
    for (let q = 0; q < n; q++) {
      const k = region[q] as number;
      const i = k % l,
        j = (k - i) / l;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x = i + dx,
            y = j + dy;
          if (x < 1 || y < 1 || x >= l - 1 || y >= h - 1) continue;
          const v = y * l + x;
          if (pris[v] || (mod[v] as number) < seuil) continue;
          if (ecartAngle(angle[v] as number, ang) > tol) continue;
          pris[v] = 1;
          region[n++] = v;
          sx += Math.cos(angle[v] as number);
          sy += Math.sin(angle[v] as number);
          ang = Math.atan2(sy, sx);
        }
    }
    visiter(region, n, contexte);
  }
}

/** Les segments de droite de la photo, du plus long au plus court. */
export function detecterSegments(img: Image, o: OptionsSegments = {}): Segment[] {
  const longueurMin = o.longueurMin ?? LONGUEUR_MIN;
  const res: Segment[] = [];
  parcourirRegions(img, o, (region, n, c) => {
    if (n < PIXELS_MIN) return;
    const seg = ajuster(region, n, c.l, c.mod, c.s);
    if (seg && seg.longueur >= longueurMin) res.push(seg);
  });
  return res.sort((a, b) => b.longueur - a.longueur);
}

/**
 * Une trace : les pixels d'une region de gradient de meme direction, sans exiger qu'ils forment une
 * droite. Coordonnees de la photo d'origine (centre des pixels reduits), poids = gradient.
 */
export interface Trace {
  /** x0, y0, x1, y1, ... */
  points: Float64Array;
  poids: Float32Array;
  /** Cote d'un pixel de l'image reduite, en pixels de la photo : l'espacement des points. */
  pas: number;
}

/**
 * Les traces de la photo d'au moins `pixelsMin` pixels (image reduite), au plus `pointsMax` points
 * chacune (pris a pas regulier dans la region). Ce sont les memes regions que celles des segments.
 */
export function detecterTraces(img: Image, o: OptionsSegments & { pixelsMin?: number; pointsMax?: number } = {}): Trace[] {
  const pixelsMin = Math.max(PIXELS_MIN, o.pixelsMin ?? PIXELS_MIN);
  const pointsMax = Math.max(2, o.pointsMax ?? 5000);
  const res: Trace[] = [];
  parcourirRegions(img, o, (region, n, c) => {
    if (n < pixelsMin) return;
    const pas = Math.max(1, Math.ceil(n / pointsMax));
    const m = Math.ceil(n / pas);
    const points = new Float64Array(2 * m),
      poids = new Float32Array(m);
    for (let q = 0, t = 0; q < n && t < m; q += pas, t++) {
      const k = region[q] as number;
      const i = k % c.l;
      points[2 * t] = (i + 0.5) * c.s;
      points[2 * t + 1] = ((k - i) / c.l + 0.5) * c.s;
      poids[t] = c.mod[k] as number;
    }
    res.push({ points, poids, pas: c.s });
  });
  return res;
}

/**
 * La droite d'une region : centre et axe principal des pixels, ponderes par le gradient ; bouts par
 * la projection extreme des pixels sur l'axe. `null` si la region est trop clairsemee pour une droite.
 */
function ajuster(region: Int32Array, n: number, l: number, mod: Float32Array, s: number): Segment | null {
  let W = 0,
    mx = 0,
    my = 0;
  for (let q = 0; q < n; q++) {
    const k = region[q] as number;
    const w = mod[k] as number;
    const i = k % l;
    W += w;
    mx += w * (i + 0.5);
    my += w * ((k - i) / l + 0.5);
  }
  mx /= W;
  my /= W;
  let cxx = 0,
    cyy = 0,
    cxy = 0;
  for (let q = 0; q < n; q++) {
    const k = region[q] as number;
    const w = mod[k] as number;
    const i = k % l;
    const dx = i + 0.5 - mx,
      dy = (k - i) / l + 0.5 - my;
    cxx += w * dx * dx;
    cyy += w * dy * dy;
    cxy += w * dx * dy;
  }
  const a = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const ux = Math.cos(a),
    uy = Math.sin(a);
  let t0 = Infinity,
    t1 = -Infinity,
    e0 = Infinity,
    e1 = -Infinity;
  for (let q = 0; q < n; q++) {
    const k = region[q] as number;
    const i = k % l;
    const dx = i + 0.5 - mx,
      dy = (k - i) / l + 0.5 - my;
    const t = dx * ux + dy * uy,
      e = -dx * uy + dy * ux;
    if (t < t0) t0 = t;
    if (t > t1) t1 = t;
    if (e < e0) e0 = e;
    if (e > e1) e1 = e;
  }
  // Les pixels extremes vont jusqu'au bord de leur case : un demi-pixel de plus de chaque cote.
  const longueur = t1 - t0 + 1,
    largeur = e1 - e0 + 1;
  if (n / (longueur * largeur) < DENSITE_MIN) return null;
  return {
    x1: (mx + (t0 - 0.5) * ux) * s,
    y1: (my + (t0 - 0.5) * uy) * s,
    x2: (mx + (t1 + 0.5) * ux) * s,
    y2: (my + (t1 + 0.5) * uy) * s,
    longueur: longueur * s,
    force: W / n,
  };
}
