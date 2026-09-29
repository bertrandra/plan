import { au } from '../util/tableaux.js';

// Redressement d'une photo de facade (MD/spec-releve-facade.md §6).
//
// Un mur plan photographie de biais est une homographie de son elevation : quatre coins designes
// sur la photo suffisent a la retrouver, et l'image redressee est alors a l'echelle - un nombre
// fixe de pixels par metre, dans les deux sens. C'est ce qui permet de lire les ouvertures en
// centimetres sur la texture.
//
// Tout ici opere sur des tampons RGBA bruts (`Image`), pas sur un canevas : le calcul se teste sans
// navigateur, et pourra passer dans un Web Worker sans changer une ligne.

/** Une image RGBA brute, comme `ImageData` sans en dependre. */
export interface Image {
  largeur: number;
  hauteur: number;
  donnees: Uint8ClampedArray;
}

export interface P2 {
  x: number;
  y: number;
}

/** Matrice 3x3 en ligne : [h0 h1 h2 ; h3 h4 h5 ; h6 h7 1]. */
export type Homographie = [number, number, number, number, number, number, number, number, number];

/** Resout A x = b par elimination de Gauss avec pivot partiel. `null` si le systeme est singulier. */
function resoudre(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((ligne, i) => [...ligne, au(b, i)]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(au(au(M, r), c)) > Math.abs(au(au(M, piv), c))) piv = r;
    if (Math.abs(au(au(M, piv), c)) < 1e-12) return null;
    [M[c], M[piv]] = [au(M, piv), au(M, c)];
    const pivot = au(M, c);
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const ligne = au(M, r);
      const f = au(ligne, c) / au(pivot, c);
      if (f === 0) continue;
      for (let k = c; k <= n; k++) ligne[k] = au(ligne, k) - f * au(pivot, k);
    }
  }
  return M.map((ligne, i) => au(ligne, n) / au(ligne, i));
}

/**
 * L'homographie qui envoie les quatre points `de` sur les quatre points `vers`. `null` si trois
 * points sont alignes : le quadrilatere n'en est pas un.
 */
export function homographie(de: readonly P2[], vers: readonly P2[]): Homographie | null {
  if (de.length !== 4 || vers.length !== 4) return null;
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = au(de, i);
    const { x: u, y: v } = au(vers, i);
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = resoudre(A, b);
  if (!h || h.some((v) => !Number.isFinite(v))) return null;
  return [au(h, 0), au(h, 1), au(h, 2), au(h, 3), au(h, 4), au(h, 5), au(h, 6), au(h, 7), 1];
}

/** Applique une homographie a un point. */
export function appliquer(H: Homographie, p: P2): P2 {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
}

/** Echantillonnage bilineaire d'un pixel ; `null` hors de l'image. */
function echantillon(img: Image, x: number, y: number, sortie: Uint8ClampedArray, o: number): boolean {
  if (x < -0.5 || y < -0.5 || x > img.largeur - 0.5 || y > img.hauteur - 0.5) return false;
  const x0 = Math.max(0, Math.min(img.largeur - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(img.hauteur - 1, Math.floor(y)));
  const x1 = Math.min(img.largeur - 1, x0 + 1),
    y1 = Math.min(img.hauteur - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, x - x0)),
    fy = Math.max(0, Math.min(1, y - y0));
  const d = img.donnees,
    L = img.largeur;
  const i00 = (y0 * L + x0) * 4,
    i10 = (y0 * L + x1) * 4,
    i01 = (y1 * L + x0) * 4,
    i11 = (y1 * L + x1) * 4;
  for (let k = 0; k < 3; k++) {
    const haut = (d[i00 + k] ?? 0) * (1 - fx) + (d[i10 + k] ?? 0) * fx;
    const bas = (d[i01 + k] ?? 0) * (1 - fx) + (d[i11 + k] ?? 0) * fx;
    sortie[o + k] = haut * (1 - fy) + bas * fy;
  }
  sortie[o + 3] = 255;
  return true;
}

/** Resultat d'un redressement : l'elevation a l'echelle, et la part du mur que la photo couvrait. */
export interface Redressement {
  image: Image;
  /** Pixels par metre, identiques dans les deux sens. */
  pxParM: number;
  /** Fraction des pixels de l'elevation effectivement vus sur la photo, de 0 a 1. */
  couverture: number;
  /** Masque des pixels vus (1) ou completes (0), meme taille que l'image. */
  vu: Uint8Array;
}

/**
 * Redresse le mur designe par quatre coins sur la photo - dans l'ordre haut gauche, haut droit,
 * bas droit, bas gauche - en une elevation de `largeurM` x `hauteurM` metres a `pxParM` pixels par
 * metre.
 *
 * Les coins peuvent tomber hors de la photo : a 3 m d'une maison a etage, le faitage sort du cadre.
 * Ce qui n'a pas ete vu est rempli de la teinte moyenne du mur vu, pour que la texture ne montre pas
 * de trou noir ; le masque `vu` le dit a qui voudra le savoir (la detection des ouvertures).
 */
export function redresser(photo: Image, coins: readonly P2[], largeurM: number, hauteurM: number, pxParM: number): Redressement | null {
  const L = Math.max(1, Math.round(largeurM * pxParM));
  const Hh = Math.max(1, Math.round(hauteurM * pxParM));
  // Elevation -> photo : on parcourt la sortie et on va chercher chaque pixel sur la photo.
  const H = homographie(
    [
      { x: 0, y: 0 },
      { x: L, y: 0 },
      { x: L, y: Hh },
      { x: 0, y: Hh },
    ],
    coins,
  );
  if (!H) return null;
  const donnees = new Uint8ClampedArray(L * Hh * 4);
  const vu = new Uint8Array(L * Hh);
  let n = 0,
    sr = 0,
    sg = 0,
    sb = 0;
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < L; x++) {
      const p = appliquer(H, { x: x + 0.5, y: y + 0.5 });
      const o = (y * L + x) * 4;
      if (echantillon(photo, p.x - 0.5, p.y - 0.5, donnees, o)) {
        vu[y * L + x] = 1;
        n++;
        sr += (donnees[o] ?? 0);
        sg += (donnees[o + 1] ?? 0);
        sb += (donnees[o + 2] ?? 0);
      }
    }
  }
  if (n === 0) return null;
  const moy = [sr / n, sg / n, sb / n];
  if (n < L * Hh) {
    for (let i = 0; i < L * Hh; i++) {
      if (vu[i]) continue;
      donnees[i * 4] = au(moy, 0);
      donnees[i * 4 + 1] = au(moy, 1);
      donnees[i * 4 + 2] = au(moy, 2);
      donnees[i * 4 + 3] = 255;
    }
  }
  return { image: { largeur: L, hauteur: Hh, donnees }, pxParM, couverture: n / (L * Hh), vu };
}

/**
 * Resolution d'une elevation : 100 pixels par metre (un centimetre par pixel), bornee pour que le
 * plus grand cote de la texture ne depasse pas `maxPx` - une facade de 14 m n'a pas besoin de
 * 1 400 pixels pour etre reconnue, et le projet enregistre porte la texture.
 */
export function resolutionTexture(largeurM: number, hauteurM: number, maxPx = 1024, cible = 100): number {
  const grand = Math.max(largeurM, hauteurM, 0.01);
  return Math.min(cible, maxPx / grand);
}

/* ------------------------------------------------------------------------------------------------
 * Proportions d'un rectangle vu en perspective
 *
 * L'image d'un rectangle en perspective en fixe les proportions a une focale pres (Zhang et He,
 * « Whiteboard scanning », 2004). C'est ce qui mesure la hauteur d'un mur dont on ne connait que la
 * largeur (lue sur le plan), et la largeur de chaque morceau d'un mur photographie en plusieurs fois.
 * --------------------------------------------------------------------------------------------- */

type V3 = [number, number, number];
const croix = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scal = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Rapport largeur / hauteur du rectangle reel dont `coins` est l'image, pour une focale `f` en
 * pixels et un point principal au centre de l'image (`cx`, `cy`). `null` si la configuration est
 * degeneree. Coins dans l'ordre haut gauche, haut droit, bas droit, bas gauche.
 */
export function rapportRectangle(coins: readonly P2[], f: number, cx: number, cy: number): number | null {
  const h = (p: P2): V3 => [p.x, p.y, 1];
  // Notation de Zhang et He : m1 m2 en haut, m3 m4 en bas, m1 m3 a gauche.
  const m1 = h(au(coins, 0)),
    m2 = h(au(coins, 1)),
    m4 = h(au(coins, 2)),
    m3 = h(au(coins, 3));
  const d2 = scal(croix(m2, m4), m3),
    d3 = scal(croix(m3, m4), m2);
  if (Math.abs(d2) < 1e-12 || Math.abs(d3) < 1e-12) return null;
  const k2 = scal(croix(m1, m4), m3) / d2;
  const k3 = scal(croix(m1, m4), m2) / d3;
  const n2: V3 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
  const n3: V3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];
  // Longueurs dans le repere camera : A^-1 n, avec A = [[f,0,cx],[0,f,cy],[0,0,1]].
  const metrique = (n: V3) => {
    const x = (n[0] - cx * n[2]) / f,
      y = (n[1] - cy * n[2]) / f;
    return x * x + y * y + n[2] * n[2];
  };
  const r = Math.sqrt(metrique(n2) / metrique(n3));
  return Number.isFinite(r) && r > 0 ? r : null;
}
