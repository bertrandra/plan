// Le redressement d'une photo (etape 2) : vue de face, verticales et horizontales du mur droites. Automatique par les points de fuite
// (la copie figee de Plan, src/plan/), ou par quatre coins poses a la main quand il echoue. Sans DOM, testable seul.

import { detecterSegments } from './plan/facade/vision/segments.js';
import { redresserParFuites } from './plan/facade/vision/redressementFuites.js';
import { redresser, type Image, type P2 } from './plan/facade/vision/homographie.js';

export interface Redressee {
  image: Image;
  methode: 'fuites' | 'coins' | 'aucun';
  horizontale?: boolean;
  focale?: 'donnee' | 'fuites' | 'defaut';
}

/** La boite des pixels vus d'un masque, et l'image coupee a elle (le hors champ du redressement autour ne sert a rien). */
export function couperAuVu(img: Image, vu: Uint8Array): Image {
  const L = img.largeur, H = img.hauteur;
  let x0 = L, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) if (vu[y * L + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < x0) return img;
  const l = x1 - x0 + 1, h = y1 - y0 + 1, d = new Uint8ClampedArray(l * h * 4);
  for (let y = 0; y < h; y++) d.set(img.donnees.subarray(((y0 + y) * L + x0) * 4, ((y0 + y) * L + x1 + 1) * 4), y * l * 4);
  return { largeur: l, hauteur: h, donnees: d };
}

/** Par les points de fuite ; null quand la photo n'a pas assez de verticales. `focale35` : la focale de l'EXIF, en equivalent 24 x 36. */
export function redresserAuto(img: Image, focale35: number | null = null): Redressee | null {
  const segs = detecterSegments(img);
  // La focale en pixels : 36 mm de largeur de capteur pour le grand cote, quand l'EXIF la donne.
  const f = focale35 ? (focale35 / 36) * Math.max(img.largeur, img.hauteur) : null;
  const r = redresserParFuites(img, segs, f);
  if (!r) return null;
  return { image: couperAuVu(r.image, r.vu), methode: 'fuites', horizontale: r.horizontale, focale: r.sourceFocale };
}

/**
 * Par quatre coins poses a la main (haut gauche, haut droit, bas droit, bas gauche) : un rectangle du mur, rendu a ses proportions vues
 * (la moyenne de ses cotes opposes), ou a `rapport` (largeur sur hauteur) quand on le connait. Le grand cote garde au plus `coteMax`.
 */
export function redresserParCoins(img: Image, coins: readonly P2[], rapport: number | null = null, coteMax = 2400): Redressee | null {
  if (coins.length !== 4) return null;
  const d = (a: P2, b: P2) => Math.hypot(b.x - a.x, b.y - a.y);
  const [hg, hd, bd, bg] = coins as [P2, P2, P2, P2];
  const l = (d(hg, hd) + d(bg, bd)) / 2, h = (d(hg, bg) + d(hd, bd)) / 2;
  if (!(l > 4) || !(h > 4)) return null;
  const k = rapport && rapport > 0 ? rapport : l / h;
  const grand = Math.min(coteMax, Math.max(l, h));
  const L = k >= 1 ? grand : grand * k, H = k >= 1 ? grand / k : grand;
  const r = redresser(img, coins, Math.round(L), Math.round(H), 1);
  return r ? { image: r.image, methode: 'coins' } : null;
}

