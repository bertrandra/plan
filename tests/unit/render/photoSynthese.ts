// Une photo de synthese prise au telephone : des murs verticaux (une facade, une cloture) vus depuis
// une prise de vue connue, le ciel au-dessus de l'horizon et le sol en dessous. Le rendu lance un
// rayon par pixel avec le meme modele d'appareil que render/couleurPhotoAudit.ts (champ sur le grand
// cote, inclinaison, roulis), mais a l'envers : du pixel vers la scene.

import { HAUTEUR_TELEPHONE_M, type VueAudit } from '../../../src/render/couleurPhotoAudit.js';
import type { Pixels } from '../../../src/render/couleurMurPhoto.js';
import type { PtBrut } from '../../../src/model/types.js';

export type Rgb = [number, number, number];

/** Un pan vertical, de A a B, du sol `z0` a `z1` ; `couleur` selon la position le long du pan (0 a 1) et la hauteur. */
export interface Pan { a: PtBrut; b: PtBrut; z0: number; z1: number; couleur: (s: number, z: number) => Rgb }

export const CIEL: Rgb = [135, 175, 225];
export const SOL: Rgb = [110, 105, 95];
const RAD = Math.PI / 180;

/** Un bruit fixe, de -a a a : un enduit n'est jamais uni sur une photo. */
export function bruit(s: number, z: number, a = 6): number {
  const x = Math.sin(s * 917.3 + z * 311.7) * 43758.5453;
  return Math.round((x - Math.floor(x)) * 2 * a - a);
}

/** Un enduit de teinte `rgb`, avec des fenetres sombres aux places donnees (parts du pan, hauteurs). */
export function enduit(rgb: Rgb, fenetres: { s0: number; s1: number; z0: number; z1: number }[] = []): (s: number, z: number) => Rgb {
  return (s, z) => {
    if (fenetres.some((f) => s >= f.s0 && s <= f.s1 && z >= f.z0 && z <= f.z1)) return [58, 62, 72];
    const n = bruit(s, z);
    return [rgb[0] + n, rgb[1] + n, rgb[2] + n];
  };
}

export function photoDeSynthese(vue: VueAudit, pans: readonly Pan[], largeur: number, hauteur: number): Pixels {
  const champ = vue.champDeg ?? 67;
  const f = Math.max(largeur, hauteur) / 2 / Math.tan((champ * RAD) / 2);
  const az = (vue.azimutDeg ?? 0) * RAD, sa = Math.sin(az), ca = Math.cos(az);
  const inc = (vue.inclinaisonDeg ?? 0) * RAD, si = Math.sin(inc), ci = Math.cos(inc);
  const r = (vue.roulisDeg ?? 0) * RAD, cr = Math.cos(r), sr = Math.sin(r);
  const avant = { x: sa * ci, y: ca * ci, z: si }, droite = { x: ca, y: -sa, z: 0 }, haut = { x: -sa * si, y: -ca * si, z: ci };
  const data = new Uint8ClampedArray(largeur * hauteur * 4);
  for (let v = 0; v < hauteur; v++) for (let u = 0; u < largeur; u++) {
    // Le pixel, ramene au repere de l'appareil d'aplomb (l'inverse du roulis).
    const xi = u + 0.5 - largeur / 2, yi = v + 0.5 - hauteur / 2;
    const x = xi * cr - yi * sr, y = xi * sr + yi * cr;
    const dx = x / f, dy = -y / f;
    const d = { x: droite.x * dx + haut.x * dy + avant.x, y: droite.y * dx + haut.y * dy + avant.y, z: droite.z * dx + haut.z * dy + avant.z };
    let meilleur = Infinity, rgb: Rgb = d.z > 0 ? CIEL : SOL;
    for (const p of pans) {
      // Le rayon dans le plan du sol coupe le segment [A, B] : t le long du rayon, s le long du pan.
      const ex = p.b.x - p.a.x, ey = p.b.y - p.a.y;
      const den = d.x * ey - d.y * ex;
      if (Math.abs(den) < 1e-12) continue;
      const wx = p.a.x - vue.x, wy = p.a.y - vue.y;
      const t = (wx * ey - wy * ex) / den, s = (wx * d.y - wy * d.x) / den;
      if (t <= 0 || s < 0 || s > 1 || t >= meilleur) continue;
      const z = HAUTEUR_TELEPHONE_M + d.z * t;
      if (z < p.z0 || z > p.z1) continue;
      meilleur = t;
      rgb = p.couleur(s, z);
    }
    const k = (v * largeur + u) * 4;
    data[k] = rgb[0]; data[k + 1] = rgb[1]; data[k + 2] = rgb[2]; data[k + 3] = 255;
  }
  return { data, largeur, hauteur };
}

/** La distance RGB entre une couleur hexadecimale et une teinte. */
export function ecartHex(hex: string, rgb: Rgb): number {
  const n = parseInt(hex.slice(1), 16);
  return Math.hypot(((n >> 16) & 255) - rgb[0], ((n >> 8) & 255) - rgb[1], (n & 255) - rgb[2]);
}
