// Recadrer un panoramique equirectangulaire en photo plate (MD/spec-releve-facade.md §4.3).
//
// Une photo de rue a 360 degres (Panoramax) range tout l'horizon dans une image dont la colonne
// est un cap et la ligne une elevation. Le releve, lui, veut une photo plate : ce que verrait un
// objectif de `champ` degres tourne vers le mur. Pour chaque pixel de la photo plate, on remonte au
// rayon qu'il voit, puis au pixel du panoramique qui le porte (interpolation bilineaire).
//
// La bande source n'est pas forcement le panoramique entier : ui/releve/panoramax.ts n'en decoupe
// que la part utile, a pleine definition, et dit quels caps et elevations elle couvre.

import type { Image } from './homographie.js';

/** Ce que couvre une bande d'equirectangulaire : du cap de sa colonne 0 a celui de sa derniere colonne, de l'elevation de sa ligne 0 a celle de sa derniere. */
export interface FenetreEquirect {
  azimutGauche: number;
  azimutDroit: number;
  elevationHaut: number;
  elevationBas: number;
}

/** La fenetre d'un panoramique entier dont `azimutCentre` est le cap du milieu de l'image. */
export function fenetreEntiere(azimutCentre: number): FenetreEquirect {
  return { azimutGauche: azimutCentre - 180, azimutDroit: azimutCentre + 180, elevationHaut: 90, elevationBas: -90 };
}

/** Le champ vertical d'une photo plate de proportions `hauteur / largeur` et de champ horizontal `champ`. */
export function champVertical(champ: number, largeur: number, hauteur: number): number {
  return (2 * Math.atan((hauteur / largeur) * Math.tan((champ * Math.PI) / 360)) * 180) / Math.PI;
}

/** La fenetre (en degres) qu'il faut decouper dans le panoramique pour recadrer vers `cap` avec `marge` autour. */
export function fenetreUtile(cap: number, champ: number, largeur: number, hauteur: number, marge = 4): FenetreEquirect {
  const v = champVertical(champ, largeur, hauteur);
  return { azimutGauche: cap - champ / 2 - marge, azimutDroit: cap + champ / 2 + marge, elevationHaut: Math.min(90, v / 2 + marge), elevationBas: Math.max(-90, -v / 2 - marge) };
}

function lirePixel(src: Image, x: number, y: number, k: number): number {
  const xi = Math.min(src.largeur - 1, Math.max(0, x)), yi = Math.min(src.hauteur - 1, Math.max(0, y));
  return src.donnees[(yi * src.largeur + xi) * 4 + k] ?? 0;
}

/**
 * La photo plate de `largeur` x `hauteur` pixels, de champ horizontal `champ`, tournee vers `cap`
 * (horizon au milieu), lue dans la bande `src` qui couvre `fenetre`.
 */
export function recadrerEquirectangulaire(src: Image, fenetre: FenetreEquirect, cap: number, champ: number, largeur: number, hauteur: number): Image {
  const donnees = new Uint8ClampedArray(largeur * hauteur * 4);
  const f = largeur / 2 / Math.tan((champ * Math.PI) / 360);
  const etendueAz = fenetre.azimutDroit - fenetre.azimutGauche;
  const etendueEl = fenetre.elevationHaut - fenetre.elevationBas;
  const colParDeg = (src.largeur - 1) / etendueAz;
  const ligParDeg = (src.hauteur - 1) / etendueEl;
  const capRad = (cap * Math.PI) / 180;
  for (let v = 0; v < hauteur; v++) {
    const dy = (v + 0.5 - hauteur / 2) / f;
    for (let u = 0; u < largeur; u++) {
      const dx = (u + 0.5 - largeur / 2) / f;
      // Le rayon vu par ce pixel : cap et elevation.
      const az = capRad + Math.atan(dx);
      const el = Math.atan2(-dy, Math.sqrt(1 + dx * dx));
      let dAz = ((az * 180) / Math.PI - fenetre.azimutGauche) % 360;
      if (dAz < 0) dAz += 360;
      const sx = dAz * colParDeg;
      const sy = (fenetre.elevationHaut - (el * 180) / Math.PI) * ligParDeg;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const tx = sx - x0, ty = sy - y0;
      const o = (v * largeur + u) * 4;
      for (let k = 0; k < 3; k++) {
        const haut = lirePixel(src, x0, y0, k) * (1 - tx) + lirePixel(src, x0 + 1, y0, k) * tx;
        const bas = lirePixel(src, x0, y0 + 1, k) * (1 - tx) + lirePixel(src, x0 + 1, y0 + 1, k) * tx;
        donnees[o + k] = haut * (1 - ty) + bas * ty;
      }
      donnees[o + 3] = 255;
    }
  }
  return { largeur, hauteur, donnees };
}
