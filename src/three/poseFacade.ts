// Les cameras du mode Toit de la Vue 3D : l'oblique de l'editeur de facade (`cadreOblique`, l'ecran B de la maquette v8) et la vue de dessus.
//
// Les coordonnees de la scene sont celles du plan recentrees sur `cen`, l'axe y du plan devenant -z : x_scene = x - cen.x,
// z_scene = cen.y - y. Chaque camera se cadre pour que le batiment tienne dans la partie de l'image que le panneau laisse libre.
//
// Pur : pas de scene, pas de DOM.

import type { PtBrut } from '../model/types.js';

export interface PoseCamera {
  position: { x: number; y: number; z: number };
  cible: { x: number; y: number; z: number };
}

/** Plus la marge est grande, plus le mur est petit dans l'image. */
const MARGE = 1.25;

/** La part de l'image que le panneau du mode recouvre : la facade se cadre dans le reste, pas derriere lui. Tout en pixels. */
export interface Reserve { largeur: number; hauteur: number; droite: number; bas: number }

/**
 * La camera au-dessus d'un batiment, presque a la verticale (un leger recul evite l'alignement degenere de l'orbite) : `etendue` est le plus grand
 * cote du batiment, `centre` son milieu dans le plan. `reserve` : ce que le panneau recouvre ; le batiment se cadre dans le reste.
 */
export function poseDeDessus(centre: PtBrut, etendue: number, cen: PtBrut, fovDeg: number, aspect: number, reserve?: Reserve): PoseCamera {
  const demiChamp = Math.tan((fovDeg * Math.PI) / 360);
  const libreL = reserve ? Math.max(0.3, 1 - reserve.droite / reserve.largeur) : 1, libreH = reserve ? Math.max(0.3, 1 - reserve.bas / reserve.hauteur) : 1;
  const hauteur = (Math.max(etendue, 4) / (2 * demiChamp * Math.min(Math.max(aspect * libreL, 0.3), libreH))) * MARGE + 2;
  // De dessus, la droite de l'ecran est +x et le bas de l'ecran +z : decaler la camera vers la droite pousse le batiment vers la gauche, vers le bas vers le haut.
  const parMetre = 1 / (2 * hauteur * demiChamp);
  const dx = reserve ? (reserve.droite / reserve.hauteur / 2) / parMetre : 0, dz = reserve ? (reserve.bas / reserve.hauteur / 2) / parMetre : 0;
  const cible = { x: centre.x - cen.x + dx, y: 0, z: cen.y - centre.y + dz };
  return { cible, position: { x: cible.x, y: hauteur, z: cible.z + hauteur * 0.02 } };
}

/**
 * Le glissement de la projection oblique de la facade (maquette v8, `#cv-face` : K et M) : un metre en profondeur derriere le mur se voit
 * 0,38 m a droite et 0,22 m plus haut. Le mur reste a l'echelle et sans fuite (les cotes s'y lisent), le toit et le cote droit se voient
 * quand meme : c'est ce qui rend lisibles un pignon, sa saillie, un bow-window.
 */
export const OBLIQUE = { k: 0.38, m: 0.22 } as const;
/** La profondeur, de part et d'autre du mur, que la camera de facade garde : bien plus que le plus grand batiment. */
const PROFONDEUR_M = 200;

/** Un point de la scene (x, y en hauteur, z), en metres. */
export interface PointScene { x: number; y: number; z: number }

/** Les deux matrices de la camera de facade, par lignes (l'ordre de `Matrix4.set`) : sa pose dans la scene et sa projection oblique. */
export interface CadreOblique { monde: number[]; projection: number[] }

/**
 * La camera de facade : orthographique, alignee sur le mur `a`→`b` (normale sortante `n`, dans le plan), cisaillee par `OBLIQUE`, cadree pour
 * que `points` (le batiment, en coordonnees de la scene) tiennent dans la partie libre de l'image (`reserve` : ce que le panneau recouvre).
 * `largeur`, `hauteur` : l'image, en pixels. La camera tourne avec le mur : une facade de biais se presente de face comme les autres.
 */
export function cadreOblique(a: PtBrut, b: PtBrut, n: PtBrut, points: readonly PointScene[], cen: PtBrut, largeur: number, hauteur: number, reserve?: Reserve): CadreOblique {
  const { k, m } = OBLIQUE;
  // L'origine au pied du milieu du mur ; le dos de la camera vers l'exterieur, sa droite le long du mur, vue de dehors.
  const o = { x: (a.x + b.x) / 2 - cen.x, z: cen.y - (a.y + b.y) / 2 };
  const dos = { x: n.x, z: -n.y }, droite = { x: -n.y, z: -n.x };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of points) {
    const dx = p.x - o.x, dz = p.z - o.z;
    const xv = dx * droite.x + dz * droite.z, zv = dx * dos.x + dz * dos.z;
    const sx = xv - k * zv, sy = p.y - m * zv;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  if (!Number.isFinite(x0)) { x0 = -5; x1 = 5; y0 = 0; y1 = 6; }
  const W = Math.max(largeur, 1), H = Math.max(hauteur, 1);
  const libreL = reserve ? Math.max(W * 0.3, W - reserve.droite) : W, libreH = reserve ? Math.max(H * 0.3, H - reserve.bas) : H;
  // Des pixels par metre : le batiment et sa marge tiennent dans la partie libre.
  const s = Math.min(libreL / (Math.max(x1 - x0, 1) * MARGE), libreH / (Math.max(y1 - y0, 1) * MARGE));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const l = cx - libreL / 2 / s, r = l + W / s, t = cy + libreH / 2 / s, bas = t - H / s;
  const A = 2 / (r - l), B = 2 / (t - bas);
  return {
    monde: [droite.x, 0, dos.x, o.x, 0, 1, 0, 0, droite.z, 0, dos.z, o.z, 0, 0, 0, 1],
    projection: [A, 0, -A * k, -(r + l) / (r - l), 0, B, -B * m, -(t + bas) / (t - bas), 0, 0, -1 / PROFONDEUR_M, 0, 0, 0, 0, 1]
  };
}
