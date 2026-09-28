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
  const M = A.map((ligne, i) => [...ligne, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    if (Math.abs(M[piv]![c]!) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((ligne, i) => ligne[n]! / ligne[i]!);
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
    const { x, y } = de[i]!;
    const { x: u, y: v } = vers[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = resoudre(A, b);
  if (!h || h.some((v) => !Number.isFinite(v))) return null;
  return [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
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
    const haut = d[i00 + k]! * (1 - fx) + d[i10 + k]! * fx;
    const bas = d[i01 + k]! * (1 - fx) + d[i11 + k]! * fx;
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
        sr += donnees[o]!;
        sg += donnees[o + 1]!;
        sb += donnees[o + 2]!;
      }
    }
  }
  if (n === 0) return null;
  const moy = [sr / n, sg / n, sb / n];
  if (n < L * Hh) {
    for (let i = 0; i < L * Hh; i++) {
      if (vu[i]) continue;
      donnees[i * 4] = moy[0]!;
      donnees[i * 4 + 1] = moy[1]!;
      donnees[i * 4 + 2] = moy[2]!;
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
