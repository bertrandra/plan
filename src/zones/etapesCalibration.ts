// Les images des etapes d'un cas de calibration (admin › Calibrer la detection) : chaque photo redressee a l'echelle du mur sans etre
// coupee a lui (le cadre autour du mur), et l'elevation fusionnee avec la part du mur cachee sur toutes les vues, hachuree. Sans DOM :
// l'ecran les met en JPEG (outils.elevationEnUrl).

import { appliquer, homographie, type Image, type P2 } from '../facade/homographie.js';
import { relief, type GabaritMur } from '../facade/gabaritMur.js';

/** Le grand cote d'une vignette d'etape : de quoi juger un redressement, sans le poids d'une elevation entiere. */
const COTE_VIGNETTE_PX = 480;

/** L'elevation, la part cachee sur toutes les vues hachuree (une rayure sur trois assombrie) : ce que la detection n'a pas lu. */
export function elevationAvecMasque(elevation: Image, occlusion: Uint8Array | null): Image {
  const donnees = new Uint8ClampedArray(elevation.donnees);
  if (occlusion && occlusion.length === elevation.largeur * elevation.hauteur) {
    for (let y = 0; y < elevation.hauteur; y++) for (let x = 0; x < elevation.largeur; x++) {
      const i = y * elevation.largeur + x;
      if (!occlusion[i] || (x + y) % 9 > 2) continue;
      donnees[i * 4] = (donnees[i * 4] ?? 0) * 0.3; donnees[i * 4 + 1] = (donnees[i * 4 + 1] ?? 0) * 0.3; donnees[i * 4 + 2] = (donnees[i * 4 + 2] ?? 0) * 0.3;
    }
  }
  return { largeur: elevation.largeur, hauteur: elevation.hauteur, donnees };
}

/** Le cadre d'une vue autour du mur, en metres : x depuis l'angle gauche, y depuis l'egout vers le bas (le sol a la hauteur du mur). */
export interface CadreAutour { x0: number; y0: number; l: number; h: number }

/** Autour du mur, ces parts de sa largeur de chaque cote et de sa hauteur sous le sol ; au-dessus, le gabarit et cette part en plus. */
const MARGE_COTES = 0.25, MARGE_SOL = 0.2, MARGE_HAUT = 0.35;

/** Le cadre autour du mur : ce qui l'entoure (le toit au-dessus du gabarit, le sol, les voisins), pour ne pas couper la photo au mur. */
export function cadreAutour(largeurM: number, hauteurM: number, gabarit: GabaritMur): CadreAutour {
  const haut = (relief(gabarit) + MARGE_HAUT) * hauteurM;
  return { x0: -MARGE_COTES * largeurM, y0: -haut, l: (1 + 2 * MARGE_COTES) * largeurM, h: haut + (1 + MARGE_SOL) * hauteurM };
}

/** Le contour du mur dans ce repere : le sol, puis le haut du gabarit de l'angle gauche a l'angle droit. */
export function contourDuGabarit(largeurM: number, hauteurM: number, gabarit: GabaritMur): P2[] {
  return [{ x: 0, y: hauteurM }, ...gabarit.map((p) => ({ x: p.u * largeurM, y: (1 - p.v) * hauteurM })), { x: largeurM, y: hauteurM }];
}

/**
 * La photo redressee a l'echelle du mur, sans etre coupee a lui : le cadre `c` autour du mur (metres), a la taille d'une vignette. Ce
 * qui tombe hors de la photo, ou derriere l'appareil (au-dela de la ligne de fuite), reste noir. Null quand les coins ne forment pas un mur.
 */
export function photoAutourDuMur(image: Image, coins: readonly P2[], largeurM: number, hauteurM: number, c: CadreAutour): Image | null {
  if (coins.length !== 4 || !(largeurM > 0) || !(hauteurM > 0)) return null;
  const k = COTE_VIGNETTE_PX / Math.max(c.l, c.h);
  const W = Math.max(1, Math.round(c.l * k)), H = Math.max(1, Math.round(c.h * k));
  const px = (x: number, y: number): P2 => ({ x: (x - c.x0) * k, y: (y - c.y0) * k });
  const versPhoto = homographie([px(0, 0), px(largeurM, 0), px(largeurM, hauteurM), px(0, hauteurM)], coins);
  if (!versPhoto) return null;
  // Le signe du denominateur au centre du mur : un point de l'autre signe est derriere l'appareil.
  const w = (x: number, y: number) => versPhoto[6] * x + versPhoto[7] * y + versPhoto[8];
  const devant = Math.sign(w(px(largeurM / 2, hauteurM / 2).x, px(largeurM / 2, hauteurM / 2).y));
  const { largeur: L, hauteur: Hp, donnees: d } = image;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    out[o + 3] = 255;
    if (Math.sign(w(x + 0.5, y + 0.5)) !== devant) continue;
    const q = appliquer(versPhoto, { x: x + 0.5, y: y + 0.5 });
    const xi = Math.floor(q.x), yi = Math.floor(q.y);
    if (xi < 0 || yi < 0 || xi >= L || yi >= Hp) continue;
    const i = (yi * L + xi) * 4;
    out[o] = d[i] ?? 0; out[o + 1] = d[i + 1] ?? 0; out[o + 2] = d[i + 2] ?? 0;
  }
  return { largeur: W, hauteur: H, donnees: out };
}
