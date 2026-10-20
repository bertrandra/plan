// Redresser une photo de facade par ses points de fuite, sans les coins du mur.
//
// Les photos reelles d'une facade (admin › calibration, audit) montrent rarement le mur entier : une longere se photographie en
// plusieurs fois, un angle cache l'autre, le pied est derriere une haie. Les quatre coins du mur n'y sont pas, et le calage fin, qui
// les cherche, prend alors une fenetre ou un volet pour le mur. Les directions du mur, elles, se lisent toujours : ses verticales
// (tableaux, chaines d'angle, descentes d'eau) concourent au point de fuite vertical, ses horizontales (linteaux, appuis, egout,
// soubassement) au point de fuite horizontal du mur.
//
// Ces deux directions donnent l'orientation du mur par rapport a l'appareil. On tourne alors l'appareil, par la pensee, pour qu'il
// regarde le mur de face, verticales verticales : c'est une homographie de rotation pure (K R K^-1), qui ne demande ni la distance,
// ni la largeur du mur, ni ses coins. La photo redressee est une vue de face du plan du mur, a une echelle inconnue : deux photos du
// meme mur ne different plus que d'une similitude (echelle et translation), ce qui rend leur recalage possible
// (facade/mosaiqueFuites.ts).
//
// La focale, quand la photo ne la donne pas, se lit sur les deux points de fuite : la verticale et l'horizontale du mur sont
// orthogonales, et deux directions orthogonales vues par un appareil de point principal c verifient (v - c).(h - c) = -f^2. Les
// photos de l'audit d'octobre 2026 (AE 101), sans EXIF, etaient prises a l'ultra grand-angle (0,5x) : la moitie de la focale d'un
// telephone. A defaut (une prise de face met le point horizontal a l'infini), celle d'un telephone (CHAMP_GRAND_COTE_DEFAUT) : une
// erreur de focale laisse verticales et horizontales droites, mais fausse les proportions et la place de l'horizon. Pure, sans DOM.

import { CHAMP_GRAND_COTE_DEFAUT } from './cadrage.js';
import { appliquer, type Homographie, type Image, type P2 } from './homographie.js';
import type { Segment } from './segments.js';
import { fuiteVerticaleDesSegments } from './verticales.js';

type V3 = [number, number, number];

/** Les verticales candidates : a moins de cet angle de la verticale de l'image (une photo prise vers le haut les fait converger). */
const ANGLE_VERTICALE_MAX_DEG = 25;
/** Les horizontales candidates : a moins de cet angle de l'horizontale de l'image (une prise tres de biais penche les siennes). */
const ANGLE_HORIZONTALE_MAX_DEG = 40;
/** Un segment vise le point horizontal s'il en passe a moins de cet angle. */
const TOLERANCE_HORIZONTALE_DEG = 1.5;
/** Il faut ce soutien (longueur cumulee, en part du grand cote) pour croire au point horizontal. */
const SOUTIEN_HORIZONTAL_MIN = 0.8;
/** Tirages du RANSAC des paires de segments ; graine fixe : le resultat ne depend pas du hasard. */
const TIRAGES = 600;
/** La vue redressee s'arrete la ou un pixel de la photo s'etire de plus de cela (en surface) par rapport au centre. */
const ETIREMENT_MAX = 6;
/** Le grand cote de l'image redressee, au plus. */
const COTE_MAX_PX = 1600;
/**
 * La focale lue sur les points de fuite n'est crue que si les deux points sont a moins de cette part du grand cote du centre (plus
 * loin, une prise presque de face, le calcul ne tient plus), et entre ces parts de la focale d'un telephone (de l'ultra grand-angle
 * au zoom 2x).
 */
const FUITE_FOCALE_MAX = 4;
const FOCALE_MIN_PART = 0.35;
const FOCALE_MAX_PART = 2.2;

const rad = (d: number) => (d * Math.PI) / 180;
const norme = (v: V3): number => Math.hypot(v[0], v[1], v[2]);
const unitaire = (v: V3): V3 => { const n = norme(v) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
const scal = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vect = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** La droite d'un segment, en coordonnees homogenes. */
const droite = (g: Segment): V3 => vect([g.x1, g.y1, 1], [g.x2, g.y2, 1]);

/** L'ecart angulaire (radians) entre un segment et la droite de son milieu au point homogene `v`. */
function ecart(g: Segment, v: V3): number {
  const mx = (g.x1 + g.x2) / 2, my = (g.y1 + g.y2) / 2;
  const dx = v[0] - v[2] * mx, dy = v[1] - v[2] * my;
  const ux = g.x2 - g.x1, uy = g.y2 - g.y1;
  const n = Math.hypot(dx, dy) * Math.hypot(ux, uy);
  return n < 1e-12 ? Math.PI / 2 : Math.acos(Math.min(1, Math.abs(dx * ux + dy * uy) / n));
}

/** Un generateur pseudo-aleatoire a graine (mulberry32) : le RANSAC rend toujours le meme point. */
function tirage(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FuiteHorizontale { point: V3; segments: number; soutien: number }

/**
 * Le point de fuite des horizontales du mur : parmi les segments presque horizontaux, le point que vise la plus grande longueur de
 * segments (RANSAC sur les paires, puis la meilleure hypothese). Un mur vu de face donne un point a l'infini (horizontales
 * paralleles), que le RANSAC trouve aussi. Deux murs visibles (un angle de maison) : le plus soutenu l'emporte. Null sans soutien.
 */
export function fuiteHorizontaleDesSegments(segments: readonly Segment[], largeurPx: number, hauteurPx: number): FuiteHorizontale | null {
  const grand = Math.max(largeurPx, hauteurPx);
  const candidats = segments.filter((g) => g.longueur >= 0.03 * grand && Math.atan2(Math.abs(g.y2 - g.y1), Math.abs(g.x2 - g.x1)) < rad(ANGLE_HORIZONTALE_MAX_DEG));
  if (candidats.length < 3) return null;
  const tol = rad(TOLERANCE_HORIZONTALE_DEG);
  const soutienDe = (v: V3) => {
    let s = 0, n = 0;
    for (const g of candidats) if (ecart(g, v) < tol) { s += g.longueur; n++; }
    return { s, n };
  };
  // Les plus longs d'abord : une paire tiree parmi eux tombe plus souvent sur deux horizontales du mur.
  const tries = [...candidats].sort((a, b) => b.longueur - a.longueur).slice(0, 80);
  const hasard = tirage(97);
  let meilleur: { v: V3; s: number; n: number } | null = null;
  for (let t = 0; t < TIRAGES; t++) {
    const a = tries[Math.floor(hasard() * tries.length)] as Segment, b = tries[Math.floor(hasard() * tries.length)] as Segment;
    if (a === b) continue;
    const v = vect(droite(a), droite(b));
    if (norme(v) < 1e-12) continue;
    const { s, n } = soutienDe(v);
    if (!meilleur || s > meilleur.s) meilleur = { v, s, n };
  }
  if (!meilleur || meilleur.n < 3 || meilleur.s < SOUTIEN_HORIZONTAL_MIN * grand) return null;
  return { point: meilleur.v, segments: meilleur.n, soutien: meilleur.s };
}

/** La focale d'un telephone, en pixels, pour une image de cette taille (CHAMP_GRAND_COTE_DEFAUT). */
export function focaleParDefaut(largeurPx: number, hauteurPx: number): number {
  return Math.max(largeurPx, hauteurPx) / 2 / Math.tan(rad(CHAMP_GRAND_COTE_DEFAUT) / 2);
}

/**
 * La focale, en pixels, que donnent les points de fuite vertical `v` et horizontal `h` du mur (orthogonaux), le point principal au
 * centre de l'image. Null quand le calcul ne tient pas (un point trop loin ou a l'infini, des points du meme cote du centre) ou
 * donne une focale hors des telephones.
 */
export function focaleDesFuites(v: V3, h: V3, largeurPx: number, hauteurPx: number): number | null {
  const grand = Math.max(largeurPx, hauteurPx), cx = largeurPx / 2, cy = hauteurPx / 2;
  if (Math.abs(v[2]) < 1e-12 || Math.abs(h[2]) < 1e-12) return null;
  const a = [v[0] / v[2] - cx, v[1] / v[2] - cy] as const, b = [h[0] / h[2] - cx, h[1] / h[2] - cy] as const;
  if (Math.hypot(a[0], a[1]) > FUITE_FOCALE_MAX * grand || Math.hypot(b[0], b[1]) > FUITE_FOCALE_MAX * grand) return null;
  const p = -(a[0] * b[0] + a[1] * b[1]);
  if (!(p > 0)) return null;
  const f = Math.sqrt(p), f0 = focaleParDefaut(largeurPx, hauteurPx);
  return f >= FOCALE_MIN_PART * f0 && f <= FOCALE_MAX_PART * f0 ? f : null;
}

/** Les points de fuite d'une photo et la focale qu'ils donnent (null : pas lue), sans la redresser. */
export function focaleDeLaPhotoParFuites(segments: readonly Segment[], largeurPx: number, hauteurPx: number): number | null {
  const v = fuiteVerticaleDesSegments(segments, largeurPx, hauteurPx, ANGLE_VERTICALE_MAX_DEG);
  const h = v ? fuiteHorizontaleDesSegments(segments, largeurPx, hauteurPx) : null;
  return v && h ? focaleDesFuites(v.point, h.point, largeurPx, hauteurPx) : null;
}

export interface RedressementFuites {
  /** La photo vue de face : verticales et horizontales du mur droites. */
  image: Image;
  /** Les pixels qui viennent de la photo (1), le reste est hors champ (0). */
  vu: Uint8Array;
  /** Image redressee -> photo. */
  versPhoto: Homographie;
  /** Les points de fuite lus : vertical toujours, horizontal quand le mur en montre assez. */
  horizontale: boolean;
  /** D'ou vient la focale : donnee (EXIF, ou celle de la serie), lue sur les points de fuite, ou celle d'un telephone. */
  sourceFocale: 'donnee' | 'fuites' | 'defaut';
}

/** La matrice 3 x 3 (lignes) d'une homographie. */
const M = (h: Homographie): number[][] => [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], h[8]]];
const deM = (m: number[][]): Homographie => {
  const r = m.flat();
  const k = r[8] || 1;
  return r.map((v) => v / k) as Homographie;
};
const produit = (a: number[][], b: number[][]): number[][] => a.map((l) => [0, 1, 2].map((j) => l.reduce((s, v, k) => s + v * ((b[k] as number[])[j] as number), 0)));

/**
 * L'homographie photo -> vue de face, par rotation de l'appareil : `v` le point de fuite vertical, `h` l'horizontal du mur (null :
 * l'axe des x de la photo), `f` la focale en pixels, le point principal au centre de la photo.
 */
export function rotationDeFace(v: V3, h: V3 | null, f: number, cx: number, cy: number): Homographie | null {
  // Les directions dans le repere de l'appareil : K^-1 v.
  const dir = (p: V3): V3 => unitaire([(p[0] - cx * p[2]) / f, (p[1] - cy * p[2]) / f, p[2]]);
  let bas = dir(v);
  // Le point vertical est vers le bas de l'image (y croissant) ou vers le haut : on veut l'axe « bas » de la vue de face.
  if (bas[1] < 0) bas = [-bas[0], -bas[1], -bas[2]];
  let droite3 = h ? dir(h) : [1, 0, 0] as V3;
  if (droite3[0] < 0) droite3 = [-droite3[0], -droite3[1], -droite3[2]];
  // Orthogonaliser l'horizontale contre la verticale (Gram-Schmidt) : la focale supposee les rend rarement exactement orthogonales.
  const p = scal(droite3, bas);
  droite3 = unitaire([droite3[0] - p * bas[0], droite3[1] - p * bas[1], droite3[2] - p * bas[2]]);
  if (norme(droite3) < 0.5) return null;
  // Repere direct : avant = droite x bas (x vers la droite, y vers le bas, z devant l'appareil).
  const avant = vect(droite3, bas);
  // R : lignes = axes de la vue de face exprimes dans l'appareil (droite, bas, avant).
  const R = [droite3, bas, avant];
  const K = [[f, 0, cx], [0, f, cy], [0, 0, 1]];
  const Kinv = [[1 / f, 0, -cx / f], [0, 1 / f, -cy / f], [0, 0, 1]];
  return deM(produit(produit(K, R), Kinv));
}

/** L'inverse d'une homographie (cofacteurs). */
export function inverser(h: Homographie): Homographie | null {
  const [a, b, c, d, e, f, g, i, j] = h;
  const A = e * j - f * i, B = -(d * j - f * g), C = d * i - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-15) return null;
  return deM([[A, -(b * j - c * i), b * f - c * e], [B, a * j - c * g, -(a * f - c * d)], [C, -(a * i - b * g), a * e - b * d]].map((l) => l.map((x) => x / det)));
}

/** Echantillonnage bilineaire ; faux hors de la photo. */
function lire(img: Image, x: number, y: number, out: Uint8ClampedArray, o: number): boolean {
  if (x < 0 || y < 0 || x > img.largeur - 1 || y > img.hauteur - 1) return false;
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(img.largeur - 1, x0 + 1), y1 = Math.min(img.hauteur - 1, y0 + 1);
  const fx = x - x0, fy = y - y0, d = img.donnees, L = img.largeur;
  for (let k = 0; k < 3; k++) {
    const h = (d[(y0 * L + x0) * 4 + k] ?? 0) * (1 - fx) + (d[(y0 * L + x1) * 4 + k] ?? 0) * fx;
    const b = (d[(y1 * L + x0) * 4 + k] ?? 0) * (1 - fx) + (d[(y1 * L + x1) * 4 + k] ?? 0) * fx;
    out[o + k] = h * (1 - fy) + b * fy;
  }
  out[o + 3] = 255;
  return true;
}

/** Applique `versPhoto` a une grille : la vue redressee, de `L` x `H` pixels. */
export function rendre(photo: Image, versPhoto: Homographie, L: number, H: number): { image: Image; vu: Uint8Array } {
  const donnees = new Uint8ClampedArray(L * H * 4), vu = new Uint8Array(L * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) {
    const p = appliquer(versPhoto, { x: x + 0.5, y: y + 0.5 });
    if (lire(photo, p.x - 0.5, p.y - 0.5, donnees, (y * L + x) * 4)) vu[y * L + x] = 1;
  }
  return { image: { largeur: L, hauteur: H, donnees }, vu };
}

/**
 * Redresse une photo par ses points de fuite. `segments` : ceux de la photo (facade/segments.ts). `focalePx` : la focale, sinon
 * celle d'un telephone. Null quand la photo n'offre pas de verticales qui s'accordent.
 */
export function redresserParFuites(photo: Image, segments: readonly Segment[], focalePx: number | null = null): RedressementFuites | null {
  const W = photo.largeur, Hp = photo.hauteur;
  // Une photo prise vers le haut fait converger ses verticales : jusqu'a 25 degres de la verticale de l'image au bord.
  const v = fuiteVerticaleDesSegments(segments, W, Hp, ANGLE_VERTICALE_MAX_DEG);
  if (!v) return null;
  const h = fuiteHorizontaleDesSegments(segments, W, Hp);
  const lue = focalePx === null && h ? focaleDesFuites(v.point, h.point, W, Hp) : null;
  const f = focalePx ?? lue ?? focaleParDefaut(W, Hp);
  const sourceFocale = focalePx !== null ? 'donnee' : lue !== null ? 'fuites' : 'defaut';
  const versFace = rotationDeFace(v.point, h?.point ?? null, f, W / 2, Hp / 2);
  if (!versFace) return null;
  const r = rendreDeFace(photo, versFace);
  return r ? { ...r, horizontale: !!h, sourceFocale } : null;
}

/**
 * La photo entiere vue par `versFace` (photo -> vue de face) : rien n'est coupe au mur, seule la part de la photo trop etiree pres de
 * la ligne de fuite est laissee. Meme surface que la photo, au plus COTE_MAX_PX de grand cote : l'echelle n'est pas celle du mur,
 * elle ne se fixe qu'apres (la largeur du plan, la hauteur du LiDAR ou du dessin).
 */
function rendreDeFace(photo: Image, versFace: Homographie): { image: Image; vu: Uint8Array; versPhoto: Homographie } | null {
  const W = photo.largeur, Hp = photo.hauteur;
  // L'emprise de la photo dans la vue de face. Pres de la ligne de fuite du mur (prise tres de biais), un pixel de la photo couvre
  // une surface de plus en plus grande : on ne garde que la part de la photo ou l'etirement reste sous ETIREMENT_MAX fois celui
  // du centre (l'etirement local d'une homographie varie comme 1 / w^3).
  const w = (q: P2) => versFace[6] * q.x + versFace[7] * q.y + versFace[8];
  const wc = w({ x: W / 2, y: Hp / 2 });
  if (!(wc > 0)) return null;
  const gardes: P2[] = [];
  const N = 24;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const q = { x: (i * W) / N, y: (j * Hp) / N };
    const wq = w(q);
    if (wq > 0 && (wc / wq) ** 3 <= ETIREMENT_MAX) gardes.push(appliquer(versFace, q));
  }
  if (gardes.length < 4) return null;
  const xs = gardes.map((q) => q.x), ys = gardes.map((q) => q.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const aire = (x1 - x0) * (y1 - y0);
  if (!(aire > 0)) return null;
  // Meme surface que la photo, au plus COTE_MAX_PX de grand cote.
  const k = Math.min(Math.sqrt((W * Hp) / aire), COTE_MAX_PX / Math.max(x1 - x0, y1 - y0));
  const L = Math.max(1, Math.round((x1 - x0) * k)), H = Math.max(1, Math.round((y1 - y0) * k));
  // Vue redressee (pixels de sortie) -> vue de face -> photo.
  const deFace = inverser(versFace);
  if (!deFace) return null;
  const sortieVersFace = deM([[1 / k, 0, x0], [0, 1 / k, y0], [0, 0, 1]]);
  const versPhoto = deM(produit(M(deFace), M(sortieVersFace)));
  const { image, vu } = rendre(photo, versPhoto, L, H);
  return { image, vu, versPhoto };
}

/**
 * Les points de fuite que donnent quatre reperes poses sur la photo (haut gauche, haut droit, bas droit, bas gauche) : n'importe
 * quels points du mur qui sont, en vrai, les coins d'un rectangle (une fenetre, une porte, le mur, deux appuis et deux linteaux).
 * Le haut et le bas sont deux horizontales, la gauche et la droite deux verticales : leurs croisements sont les points de fuite
 * horizontal et vertical, a l'infini quand les deux droites sont paralleles sur la photo.
 */
export function fuitesDesReperes(r: readonly P2[]): { v: V3; h: V3 } | null {
  if (r.length !== 4) return null;
  const [a, b, c, d] = r as [P2, P2, P2, P2];
  const ligne = (p: P2, q: P2): V3 => vect([p.x, p.y, 1], [q.x, q.y, 1]);
  const h = vect(ligne(a, b), ligne(d, c)), v = vect(ligne(a, d), ligne(b, c));
  return norme(h) > 1e-12 && norme(v) > 1e-12 ? { v, h } : null;
}

/**
 * Redresse une photo par quatre reperes poses a la main (fuitesDesReperes) : la photo entiere tournee de face, sans coupe et sans
 * echelle — ce que les reperes disent, c'est la direction des verticales et des horizontales du mur, pas ou il commence. L'egout,
 * le sol et les bouts du mur se cherchent ensuite, sur l'image redressee (zones/releve/coinsAuto.ts). La focale se lit sur les
 * reperes quand ils la donnent (deux points de fuite finis et orthogonaux) : les droites posees sortent alors exactement droites ;
 * sinon celle de la photo, sinon celle d'un telephone. Null quand les reperes sont degeneres.
 */
export function redresserParReperes(photo: Image, reperes: readonly P2[], focalePx: number | null = null): RedressementFuites | null {
  const W = photo.largeur, Hp = photo.hauteur;
  const fu = fuitesDesReperes(reperes);
  if (!fu) return null;
  const lue = focaleDesFuites(fu.v, fu.h, W, Hp);
  const f = lue ?? focalePx ?? focaleParDefaut(W, Hp);
  const versFace = rotationDeFace(fu.v, fu.h, f, W / 2, Hp / 2);
  if (!versFace) return null;
  const r = rendreDeFace(photo, versFace);
  return r ? { ...r, horizontale: true, sourceFocale: lue !== null ? 'fuites' : focalePx !== null ? 'donnee' : 'defaut' } : null;
}
