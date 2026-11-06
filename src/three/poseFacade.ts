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

/** Le plus petit recul de la camera cadree en perspective : en deca, l'orbite bascule et la maison sort de l'image au moindre geste. */
const RECUL_MIN_M = 6;

/**
 * La camera libre (en perspective) cadree sur `points` (le batiment ou l'un de ses corps, en coordonnees de la scene) : elle garde la
 * direction d'ou l'on regarde (`depuis`, la pose actuelle), recule juste assez pour que la sphere qui les contient tienne dans la partie
 * libre de l'image, et decale sa cible pour que les points se centrent dans cette partie (`reserve` : ce que le panneau recouvre).
 * `fovDeg` : le champ vertical ; `aspect` : largeur / hauteur de l'image.
 */
export function poseEnPerspective(points: readonly PointScene[], depuis: PoseCamera, fovDeg: number, aspect: number, reserve?: Reserve): PoseCamera {
  const n = points.length || 1;
  const c = points.reduce((t, p) => ({ x: t.x + p.x / n, y: t.y + p.y / n, z: t.z + p.z / n }), { x: 0, y: 0, z: 0 });
  const rayon = Math.max(1, ...points.map((p) => Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z)));
  // La direction de la cible vers la camera ; degeneree (camera sur sa cible), on regarde du sud-est, en surplomb.
  let d = { x: depuis.position.x - depuis.cible.x, y: depuis.position.y - depuis.cible.y, z: depuis.position.z - depuis.cible.z };
  const l = Math.hypot(d.x, d.y, d.z);
  d = l > 1e-6 ? { x: d.x / l, y: d.y / l, z: d.z / l } : { x: 0.577, y: 0.577, z: 0.577 };
  const libreL = reserve ? Math.max(0.3, 1 - reserve.droite / reserve.largeur) : 1, libreH = reserve ? Math.max(0.3, 1 - reserve.bas / reserve.hauteur) : 1;
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const demiAngle = Math.min(Math.atan(t * libreH), Math.atan(t * Math.max(aspect, 0.1) * libreL));
  const distance = Math.max(RECUL_MIN_M, (rayon / Math.sin(demiAngle)) * 1.05);
  // Les axes de l'image : la droite (horizontale) et le haut. Decaler la cible a droite pousse les points a gauche, vers le bas les monte.
  let droite = { x: d.z, y: 0, z: -d.x };
  const ld = Math.hypot(droite.x, droite.z);
  droite = ld > 1e-6 ? { x: droite.x / ld, y: 0, z: droite.z / ld } : { x: 1, y: 0, z: 0 };
  const avant = { x: -d.x, y: -d.y, z: -d.z };
  const haut = { x: droite.y * avant.z - droite.z * avant.y, y: droite.z * avant.x - droite.x * avant.z, z: droite.x * avant.y - droite.y * avant.x };
  const parPixel = reserve ? (2 * distance * t) / reserve.hauteur : 0;
  const dx = reserve ? (reserve.droite / 2) * parPixel : 0, dy = reserve ? (reserve.bas / 2) * parPixel : 0;
  const cible = { x: c.x + droite.x * dx - haut.x * dy, y: c.y + droite.y * dx - haut.y * dy, z: c.z + droite.z * dx - haut.z * dy };
  return { cible, position: { x: cible.x + d.x * distance, y: cible.y + d.y * distance, z: cible.z + d.z * distance } };
}

/**
 * Le glissement de la projection oblique de la facade (maquette v8, `#cv-face` : K et M) : un metre en profondeur derriere le mur se voit
 * 0,38 m a droite et 0,22 m plus haut. Le mur reste a l'echelle et sans fuite (les cotes s'y lisent), le toit et le cote droit se voient
 * quand meme : c'est ce qui rend lisibles un pignon, sa saillie, un bow-window.
 */
// La maquette posait 0,38 et 0,22 : sur une maison profonde, le faitage et ses poignees glissaient de plusieurs metres loin du mur, et la
// facade se lisait de biais (retour du proprietaire sur la 5.12.0, « trop de decalage dans la perspective »). La moitie garde le toit et
// le cote lisibles, le mur reste a l'echelle.
export const OBLIQUE = { k: 0.19, m: 0.11 } as const;
/**
 * La marge, en pixels, entre ce que la camera de facade tient (la facade du corps et ses poignees) et le bord de la partie libre de l'image :
 * une cible tactile (44 px) et la moitie d'une poignee, pour qu'aucune ne tombe sous le bord, le panneau ou un bouton de la scene.
 */
export const MARGE_FACADE_PX = 64;
/** Le plus petit cote (en metres) que la camera de facade tient : en deca, une petite saillie remplirait l'ecran et ses poignees se colleraient. */
export const CADRE_FACADE_MIN_M = 5;
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
export function cadreOblique(a: PtBrut, b: PtBrut, n: PtBrut, points: readonly PointScene[], cen: PtBrut, largeur: number, hauteur: number, reserve?: Reserve, margePx = MARGE_FACADE_PX): CadreOblique {
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
  // Des pixels par metre : ce qu'on tient, au moins `CADRE_FACADE_MIN_M` de cote, entre dans la partie libre a `margePx` de ses bords.
  const marge = Math.min(margePx, libreL / 4, libreH / 4);
  const s = Math.min((libreL - 2 * marge) / Math.max(x1 - x0, CADRE_FACADE_MIN_M), (libreH - 2 * marge) / Math.max(y1 - y0, CADRE_FACADE_MIN_M));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const l = cx - libreL / 2 / s, r = l + W / s, t = cy + libreH / 2 / s, bas = t - H / s;
  const A = 2 / (r - l), B = 2 / (t - bas);
  return {
    monde: [droite.x, 0, dos.x, o.x, 0, 1, 0, 0, droite.z, 0, dos.z, o.z, 0, 0, 0, 1],
    projection: [A, 0, -A * k, -(r + l) / (r - l), 0, B, -B * m, -(t + bas) / (t - bas), 0, 0, -1 / PROFONDEUR_M, 0, 0, 0, 0, 1]
  };
}
