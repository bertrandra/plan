// Fusionner plusieurs photos d'un meme mur, prises de gauche a droite et deja de face (etape 2), en une seule image (demande du
// proprietaire, 12 novembre 2026 : « regarde l'algorithme dans facade »). C'est celui de Plan (src/plan/facade/vision/mosaique.ts,
// copie figee) : deux voisines se posent la ou leurs pixels communs se ressemblent le plus (correlation normalisee, cherchee grossiere
// puis au pixel), et se fondent en pesant chaque photo d'autant plus qu'on est loin de son bord. Plan connait la hauteur du mur par ses
// coins ; ici chaque photo est redressee entiere, cadree a la main : deux voisines peuvent aussi differer un peu de hauteur (le pas a
// reculé) et d'echelle. La recherche essaie donc aussi un decalage vertical et quelques echelles, sur des images reduites. Sans DOM.

import { decalage, type Bande } from './plan/facade/vision/mosaique.js';
import { appliquer, type Image } from './plan/facade/vision/homographie.js';
import { aligner, composer as enchainer, inverse, type Homographie } from './fusionAlignement.js';

/** La hauteur des images de la recherche : assez pour les baies, assez petite pour essayer beaucoup de poses. */
export const HAUTEUR_RECHERCHE = 120;
/** La seconde passe, plus fine, autour de la pose trouvee : l'echelle a 1 % pres demande plus de lignes. */
export const HAUTEUR_FINE = 360;
const ECHELLES = [0.88, 0.94, 1, 1.06, 1.13];
/** L'image fusionnee garde au plus ce nombre de pixels (la somme ponderee tient en memoire, meme sur un telephone). */
export const PIXELS_FUSION = 8_000_000;

/** Ou poser une photo sur la precedente : B(u, v) tombe en A(s u + dx, s v + dy), en pixels de A ; `score` de -1 a 1. */
export interface Jointure { dx: number; dy: number; echelle: number; score: number }

/**
 * La fusion : l'image, et pour chaque jointure sa pose grossiere, le nombre de correspondances qui appuient la pose fine (0 : la pose
 * grossiere est restee) et leur ecart moyen en pixels ; `poses` envoie chaque photo dans le repere de la premiere.
 */
export interface Fusion { image: Image; jointures: (Jointure & { paires: number; ecart: number })[]; poses: Homographie[] }

/** Les pixels vus : le redressement laisse du noir autour de la photo. */
export function vuDe(img: Image): Uint8Array {
  const n = img.largeur * img.hauteur, vu = new Uint8Array(n), d = img.donnees;
  for (let i = 0; i < n; i++) vu[i] = (d[i * 4] ?? 0) + (d[i * 4 + 1] ?? 0) + (d[i * 4 + 2] ?? 0) > 9 && (d[i * 4 + 3] ?? 255) > 0 ? 1 : 0;
  return vu;
}

/** Une bande a la hauteur `h` (moyenne des pixels vus de chaque case, bilineaire sinon : une reduction suffit ici). */
export function aLaHauteur(b: Bande, h: number): Bande {
  const k = b.image.hauteur / h, l = Math.max(1, Math.round(b.image.largeur / k)), L0 = b.image.largeur, H0 = b.image.hauteur;
  const donnees = new Uint8ClampedArray(l * h * 4), vu = new Uint8Array(l * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * k), y1 = Math.min(H0, Math.max(y0 + 1, Math.floor((y + 1) * k)));
    for (let x = 0; x < l; x++) {
      const x0 = Math.floor(x * k), x1 = Math.min(L0, Math.max(x0 + 1, Math.floor((x + 1) * k)));
      let n = 0, r = 0, g = 0, bl = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = yy * L0 + xx;
        if (!b.vu[i]) continue;
        n++; r += b.image.donnees[i * 4] ?? 0; g += b.image.donnees[i * 4 + 1] ?? 0; bl += b.image.donnees[i * 4 + 2] ?? 0;
      }
      const o = y * l + x;
      donnees[o * 4 + 3] = 255;
      if (n * 2 < (x1 - x0) * (y1 - y0)) continue;
      vu[o] = 1; donnees[o * 4] = r / n; donnees[o * 4 + 1] = g / n; donnees[o * 4 + 2] = bl / n;
    }
  }
  return { image: { largeur: l, hauteur: h, donnees }, vu };
}

/** La bande `b` decalee de `dy` lignes, sur `h` lignes : ce qui sort est perdu, ce qui manque n'est pas vu. */
function decalerEnY(b: Bande, dy: number, h: number): Bande {
  const l = b.image.largeur, donnees = new Uint8ClampedArray(l * h * 4), vu = new Uint8Array(l * h);
  for (let y = 0; y < h; y++) {
    const s = y - dy;
    if (s < 0 || s >= b.image.hauteur) continue;
    donnees.set(b.image.donnees.subarray(s * l * 4, (s + 1) * l * 4), y * l * 4);
    vu.set(b.vu.subarray(s * l, (s + 1) * l), y * l);
  }
  return { image: { largeur: l, hauteur: h, donnees }, vu };
}

/**
 * Ou poser `B` a droite de `A` (deux bandes a la meme hauteur, celle de la recherche) : pour chaque echelle et chaque decalage vertical,
 * le decalage horizontal de Plan (`decalage`) ; la meilleure ressemblance l'emporte. Le recouvrement voulu : au moins 15 % de A.
 */
export function poserVoisine(A: Bande, B: Bande, ecartY = 0.2): Jointure {
  const h = A.image.hauteur, pxParM = 10, rec = (0.15 * A.image.largeur) / pxParM;
  let mieux: Jointure = { dx: Math.round(A.image.largeur * 0.7), dy: 0, echelle: 1, score: -2 };
  const essayer = (s: number, dy: number, Bs: Bande) => {
    const { dx, score } = decalage(A, decalerEnY(Bs, dy, h), 0, pxParM, rec, 4);
    if (score > mieux.score) mieux = { dx, dy, echelle: s, score };
  };
  const pas = 3, max = Math.round(ecartY * h);
  for (const s of ECHELLES) {
    const Bs = s === 1 ? B : aLaHauteur(B, Math.round(h * s));
    for (let dy = -max; dy <= max; dy += pas) essayer(s, dy, Bs);
  }
  // Affinage : l'echelle a 1 % pres autour de la retenue (la grille va de 6 en 6 %), puis le vertical a la ligne pres.
  const s0 = mieux.echelle, dy0 = mieux.dy;
  for (const ds of [-0.03, -0.02, -0.01, 0.01, 0.02, 0.03]) {
    const s = s0 + ds, Bs = aLaHauteur(B, Math.round(h * s));
    for (let dy = dy0 - pas; dy <= dy0 + pas; dy += pas) essayer(s, dy, Bs);
  }
  const s = mieux.echelle, Bs = s === 1 ? B : aLaHauteur(B, Math.round(h * s)), dy1 = mieux.dy;
  for (let dy = dy1 - pas + 1; dy <= dy1 + pas - 1; dy++) if (dy !== dy1) essayer(s, dy, Bs);
  return mieux;
}

/**
 * La seconde passe : la pose grossiere (a HAUTEUR_RECHERCHE lignes) reprise a HAUTEUR_FINE lignes, l'echelle a 1 % pres et le vertical a
 * la ligne pres autour d'elle. Le resultat est en pixels de la passe fine.
 */
export function affiner(A: Bande, B: Bande, g: Jointure): Jointure {
  const k = A.image.hauteur / HAUTEUR_RECHERCHE, h = A.image.hauteur, pxParM = 30, rec = (0.15 * A.image.largeur) / pxParM;
  let mieux: Jointure = { ...g, dx: Math.round(g.dx * k), dy: Math.round(g.dy * k), score: -2 };
  const centre = mieux;
  for (const ds of [-0.02, -0.01, 0, 0.01, 0.02]) {
    const s = centre.echelle + ds, Bs = aLaHauteur(B, Math.round(h * s));
    for (let dy = centre.dy - 3; dy <= centre.dy + 3; dy++) {
      const { dx, score } = decalage(A, decalerEnY(Bs, dy, h), 0, pxParM, rec, 3);
      if (score > mieux.score) mieux = { dx, dy, echelle: s, score };
    }
  }
  return mieux.score > -2 ? mieux : { ...centre, score: g.score };
}

/**
 * Fusionne les photos, dans l'ordre (de gauche a droite). Pour chaque voisine : la pose grossiere de Plan (decalage, puis echelle et
 * vertical, a `HAUTEUR_RECHERCHE` puis `HAUTEUR_FINE` lignes), puis l'homographie fine (fusionAlignement.ts). null : moins de deux photos.
 */
export function fusionner(images: readonly Image[], avancement?: (fait: number, total: number) => void): Fusion | null {
  if (images.length < 2) return null;
  const bandes: Bande[] = images.map((image) => ({ image, vu: vuDe(image) }));
  const petites = bandes.map((b) => aLaHauteur(b, HAUTEUR_RECHERCHE));
  const poses: Homographie[] = [[1, 0, 0, 0, 1, 0, 0, 0, 1]];
  const jointures: Fusion['jointures'] = [];
  for (let k = 1; k < bandes.length; k++) {
    avancement?.(k - 1, bandes.length - 1);
    const A = bandes[k - 1] as Bande, B = bandes[k] as Bande;
    const j = affiner(aLaHauteur(A, HAUTEUR_FINE), aLaHauteur(B, HAUTEUR_FINE), poserVoisine(petites[k - 1] as Bande, petites[k] as Bande));
    // La pose grossiere en pixels pleins : B ramene a la hauteur de A, a l'echelle s, decale.
    const r = A.image.hauteur / HAUTEUR_FINE, e = (A.image.hauteur / B.image.hauteur) * j.echelle;
    const fine = aligner(A.image, A.vu, B.image, B.vu, [e, 0, j.dx * r, 0, e, j.dy * r, 0, 0, 1]);
    jointures.push({ ...j, paires: fine.paires, ecart: fine.ecart });
    poses.push(enchainer(poses[k - 1] as Homographie, fine.H));
  }
  avancement?.(bandes.length - 1, bandes.length - 1);
  return { image: composer(bandes, poses), jointures, poses };
}

/** Le gain de B pour ressembler a A, canal par canal, sur les pixels communs (une photo plus sombre, un ciel qui change). */
function gain(A: Bande, B: Bande, H: Homographie): [number, number, number] {
  const Hi = inverse(H), sa = [0, 0, 0], sb = [0, 0, 0];
  const pas = Math.max(2, Math.round(A.image.largeur / 200));
  for (let y = 0; y < A.image.hauteur; y += pas) for (let x = 0; x < A.image.largeur; x += pas) {
    const ia = y * A.image.largeur + x;
    if (!A.vu[ia]) continue;
    const q = appliquer(Hi, { x, y }), bx = Math.round(q.x), by = Math.round(q.y);
    if (bx < 0 || by < 0 || bx >= B.image.largeur || by >= B.image.hauteur) continue;
    const ib = by * B.image.largeur + bx;
    if (!B.vu[ib]) continue;
    for (let c = 0; c < 3; c++) { sa[c] = (sa[c] ?? 0) + (A.image.donnees[ia * 4 + c] ?? 0); sb[c] = (sb[c] ?? 0) + (B.image.donnees[ib * 4 + c] ?? 0); }
  }
  return [0, 1, 2].map((c) => ((sb[c] ?? 0) > 0 ? Math.min(1.4, Math.max(0.7, (sa[c] ?? 0) / (sb[c] ?? 1))) : 1)) as [number, number, number];
}

/** Une rampe douce de 0 a 1 sur [-1/2, 1/2]. */
const rampe = (t: number) => { const u = Math.min(1, Math.max(0, t + 0.5)); return u * u * (3 - 2 * u); };

/**
 * Pose chaque photo par sa pose sur une toile (reduite s'il le faut) et les coud. Dans un recouvrement, une couture au milieu, sur une
 * bande etroite : un fondu sur tout le recouvrement montrait deux fois ce qui n'est pas exactement superpose (le relief, un arbre devant
 * le mur). Les gains de chaque photo, enchaines depuis la premiere puis ramenes a une moyenne de 1, effacent les sauts de lumiere.
 */
function composer(bandes: Bande[], poses: Homographie[]): Image {
  const coins = bandes.map((b, k) => [{ x: 0, y: 0 }, { x: b.image.largeur, y: 0 }, { x: b.image.largeur, y: b.image.hauteur }, { x: 0, y: b.image.hauteur }].map((p) => appliquer(poses[k] as Homographie, p)));
  const tous = coins.flat();
  const gx = Math.min(...tous.map((p) => p.x)), gy = Math.min(...tous.map((p) => p.y));
  const lt = Math.max(...tous.map((p) => p.x)) - gx, ht = Math.max(...tous.map((p) => p.y)) - gy;
  const z = Math.min(1, Math.sqrt(PIXELS_FUSION / Math.max(1, lt * ht)));
  const L = Math.max(1, Math.round(lt * z)), H = Math.max(1, Math.round(ht * z));
  // Les gains, enchaines : une photo prend le gain de sa voisine de gauche fois le sien.
  const gains: [number, number, number][] = [[1, 1, 1]];
  for (let k = 1; k < bandes.length; k++) {
    const g = gain(bandes[k - 1] as Bande, bandes[k] as Bande, enchainer(inverse(poses[k - 1] as Homographie), poses[k] as Homographie));
    const p = gains[k - 1] as [number, number, number];
    gains.push([p[0] * g[0], p[1] * g[1], p[2] * g[2]]);
  }
  for (let c = 0; c < 3; c++) { const m = Math.exp(gains.reduce((s, g) => s + Math.log(g[c] ?? 1), 0) / gains.length); for (const g of gains) g[c] = (g[c] ?? 1) / m; }
  // Les coutures : au milieu du recouvrement de deux voisines, en x de la toile, sur une bande de 15 % du recouvrement.
  const coutures = bandes.slice(1).map((_, i) => {
    const droite = Math.min(coins[i]?.[1]?.x ?? 0, coins[i]?.[2]?.x ?? 0), gauche = Math.max(coins[i + 1]?.[0]?.x ?? 0, coins[i + 1]?.[3]?.x ?? 0);
    const rec = Math.max(0, droite - gauche);
    return { x: ((droite + gauche) / 2 - gx) * z, bande: Math.min(120, Math.max(8, 0.15 * rec * z)) };
  });
  const somme = new Float32Array(L * H * 3), poids = new Float32Array(L * H);
  bandes.forEach((b, k) => {
    const Pi = inverse(poses[k] as Homographie), g = gains[k] as [number, number, number], d = b.image.donnees, l0 = b.image.largeur, h0 = b.image.hauteur;
    const xs = (coins[k] ?? []).map((p) => (p.x - gx) * z), ys = (coins[k] ?? []).map((p) => (p.y - gy) * z);
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(L, Math.ceil(Math.max(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H, Math.ceil(Math.max(...ys)));
    const avant = coutures[k - 1], apres = coutures[k];
    for (let Y = y0; Y < y1; Y++) for (let X = x0; X < x1; X++) {
      const q = appliquer(Pi, { x: X / z + gx, y: Y / z + gy });
      if (q.x < 0 || q.y < 0 || q.x > l0 - 1 || q.y > h0 - 1) continue;
      const xa = Math.floor(q.x), ya = Math.floor(q.y), xb = Math.min(l0 - 1, xa + 1), yb = Math.min(h0 - 1, ya + 1), fx = q.x - xa, fy = q.y - ya;
      if (!b.vu[Math.round(q.y) * l0 + Math.round(q.x)]) continue;
      let w = 1;
      if (avant) w *= rampe((X - avant.x) / avant.bande);
      if (apres) w *= 1 - rampe((X - apres.x) / apres.bande);
      // Hors de sa part, une photo garde un poids infime : elle comble ce que la voisine ne couvre pas.
      w = Math.max(w, 1e-4);
      const o = Y * L + X;
      for (let c = 0; c < 3; c++) {
        const v = ((d[(ya * l0 + xa) * 4 + c] ?? 0) * (1 - fx) + (d[(ya * l0 + xb) * 4 + c] ?? 0) * fx) * (1 - fy) + ((d[(yb * l0 + xa) * 4 + c] ?? 0) * (1 - fx) + (d[(yb * l0 + xb) * 4 + c] ?? 0) * fx) * fy;
        somme[o * 3 + c] = (somme[o * 3 + c] ?? 0) + w * v * (g[c] ?? 1);
      }
      poids[o] = (poids[o] ?? 0) + w;
    }
  });
  const donnees = new Uint8ClampedArray(L * H * 4);
  for (let o = 0; o < L * H; o++) {
    donnees[o * 4 + 3] = 255;
    const w = poids[o] ?? 0;
    if (w <= 0) continue;
    for (let c = 0; c < 3; c++) donnees[o * 4 + c] = (somme[o * 3 + c] ?? 0) / w;
  }
  return { largeur: L, hauteur: H, donnees };
}
