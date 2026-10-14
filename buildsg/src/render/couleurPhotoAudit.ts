// La couleur d'une facade sur une photo de l'audit (MD/spec-audit.md §6.2).
//
// La photo est plate et prise a la main : on connait la position, le cap de la boussole, le champ
// (la focale lue dans l'EXIF, sinon celui par defaut du releve), l'inclinaison et le roulis du
// telephone au retour de l'appareil photo. On pose les points du mur sur l'image par cette prise de
// vue, comme pour Panoramax (render/couleurMurPhoto.ts), et `model/couleurMur.ts` decide : une teinte
// coherente, ou rien.
//
// La boussole se trompe de 5 a 15 degres pres d'un mur : on ne lit que la moitie centrale du mur,
// qui reste sur la facade meme quand la projection glisse. Une cloture en limite de parcelle cache
// le bas du mur : la regle de Panoramax vaut aussi (pas de ligne de vue sous 2,5 m a une limite).
//
// Quand la lecture ne conclut pas, la fiche demande de toucher la facade : on lit la teinte autour
// du doigt, fenetres et ombres ecartees par l'ecart a la mediane, comme le releve (facade/analyse.ts).

import { pointsDuMur, hauteurAuxLimites, surLeCiel, chargerPixels, HAUTEUR_CLOTURE_M, type Point3, type Pixels } from './couleurMurPhoto.js';
import { couleurMurDepuisPixels, type LectureMur } from '../model/couleurMur.js';
import { versHex } from '../model/couleurToit.js';
import { teinteMediane } from '../facade/analyse.js';
import { CHAMP_GRAND_COTE_DEFAUT } from '../facade/cadrage.js';
import type { Obstacle } from '../geometry/ligneDeVue.js';
import type { PrisePhoto } from '../model/audit.js';
import type { PtBrut } from '../model/types.js';

/** La hauteur du telephone tenu pour photographier : a hauteur des yeux, plus bas que la perche de Panoramax. */
export const HAUTEUR_TELEPHONE_M = 1.5;
/** La part du mur lue, de part et d'autre de son milieu : la moitie centrale absorbe l'erreur de la boussole. */
export const MOITIE_CENTRALE: readonly [number, number] = [0.25, 0.75];
/** Le rayon lu autour du doigt, en part du grand cote de l'image : un pan de mur, pas une fenetre entiere. */
export const RAYON_TOUCHER = 0.03;
/** Distance RGB a la mediane au-dela de laquelle un pixel est une fenetre, une ombre ou un volet. */
const ECART_TOUCHER = 40;
/** Il faut que la plupart des pixels autour du doigt soient de la teinte : sinon le doigt est sur un bord. */
const PART_TOUCHER_MIN = 0.5;
/** En dessous, le doigt est presque hors de l'image. */
const PIXELS_TOUCHER_MIN = 20;

const RAD = Math.PI / 180;

/** Ce qu'il faut de la prise de vue pour poser un point sur la photo. */
export type VueAudit = Pick<PrisePhoto, 'x' | 'y' | 'azimutDeg'> & Partial<Pick<PrisePhoto, 'inclinaisonDeg' | 'roulisDeg' | 'champDeg'>>;

/**
 * Ou tombe un point du plan (a une hauteur au-dessus du sol) sur une photo plate de `largeur` x
 * `hauteur` : objectif sans distorsion, point principal au centre, champ `champDeg` sur le grand cote,
 * visee inclinee de `inclinaisonDeg` au-dessus de l'horizon, image tournee de `roulisDeg` (sens
 * horaire). Telephone d'aplomb, c'est la projection de `pointDansImage` pour une photo plate. Null
 * sans cap, derriere l'objectif ou hors de l'image.
 */
export function pointDansPhoto(vue: VueAudit, p: Point3, largeur: number, hauteur: number, hauteurCamera = HAUTEUR_TELEPHONE_M): { u: number; v: number } | null {
  if (vue.azimutDeg === null) return null;
  const champ = vue.champDeg && vue.champDeg > 1 && vue.champDeg < 179 ? vue.champDeg : CHAMP_GRAND_COTE_DEFAUT;
  const f = Math.max(largeur, hauteur) / 2 / Math.tan((champ * RAD) / 2);
  const sa = Math.sin(vue.azimutDeg * RAD), ca = Math.cos(vue.azimutDeg * RAD);
  const inc = (vue.inclinaisonDeg ?? 0) * RAD, si = Math.sin(inc), ci = Math.cos(inc);
  const rx = p.x - vue.x, ry = p.y - vue.y, rz = p.z - hauteurCamera;
  // Le repere de l'appareil : l'axe de visee, la droite de l'image (horizontale) et son haut.
  const avant = rx * sa * ci + ry * ca * ci + rz * si;
  if (avant < 0.1) return null;
  const droite = rx * ca - ry * sa;
  const haut = -rx * sa * si - ry * ca * si + rz * ci;
  const x = (f * droite) / avant, y = (-f * haut) / avant;
  // Le telephone tourne dans le sens horaire : la scene tourne dans l'autre sens sur l'image.
  const r = (vue.roulisDeg ?? 0) * RAD, cr = Math.cos(r), sr = Math.sin(r);
  const u = largeur / 2 + x * cr + y * sr, v = hauteur / 2 - x * sr + y * cr;
  return u >= 0 && u < largeur && v >= 0 && v < hauteur ? { u, v } : null;
}

/** Les points du mur de A a B que l'on lit : ceux de `pointsDuMur`, dans la moitie centrale seulement. */
export function pointsCentrauxDuMur(a: PtBrut, b: PtBrut, egout: number): Point3[] {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  if (!(l2 > 0)) return [];
  const [s0, s1] = MOITIE_CENTRALE;
  return pointsDuMur(a, b, egout).filter((p) => {
    const s = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    return s >= s0 && s <= s1;
  });
}

/** Un mur a lire : ses deux angles et son egout. */
export interface MurAudit { a: PtBrut; b: PtBrut; egout: number }

/** Ce que la photo dit du mur, et le nombre de pixels lus (ni hors de l'image, ni sur le ciel, ni derriere une cloture). */
export type LectureFacadePhoto = LectureMur & { pixels: number };

/**
 * La couleur du mur sur la photo : ses points centraux poses par la prise de vue, moins ceux que la
 * ligne de vue n'atteint qu'en passant sous une cloture (`limites` : les contours des parcelles) et
 * ceux qui tombent sur le ciel ; `couleurMurDepuisPixels` decide.
 */
export function lireFacadeSurPhoto(img: Pixels, vue: VueAudit, mur: MurAudit, limites: readonly Obstacle[] = []): LectureFacadePhoto {
  const cam = { x: vue.x, y: vue.y };
  const px: number[] = [];
  let ciel = 0, pixels = 0;
  for (const p of pointsCentrauxDuMur(mur.a, mur.b, mur.egout)) {
    const h = limites.length ? hauteurAuxLimites(cam, p, limites, HAUTEUR_TELEPHONE_M) : null;
    const uv = h !== null && h < HAUTEUR_CLOTURE_M ? null : pointDansPhoto(vue, p, img.largeur, img.hauteur);
    if (!uv) { px.push(0, 0, 0, 0); continue; }
    const i = Math.floor(uv.u), j = Math.floor(uv.v);
    if (surLeCiel(img, i, j)) { ciel++; px.push(0, 0, 0, 0); continue; }
    const k = (j * img.largeur + i) * 4;
    px.push(img.data[k] as number, img.data[k + 1] as number, img.data[k + 2] as number, 255);
    pixels++;
  }
  return { ...couleurMurDepuisPixels(px, ciel), pixels };
}

/**
 * La teinte autour du point touche (u, v en pixels) : la mediane du disque, puis la moyenne des
 * pixels proches d'elle. Null quand le doigt est sur un bord (fenetre, angle, ciel) : trop peu de
 * pixels d'une meme teinte.
 */
export function teinteAuToucher(img: Pixels, u: number, v: number): { couleur: string; pixels: number } | null {
  const r = Math.max(4, Math.round(RAYON_TOUCHER * Math.max(img.largeur, img.hauteur)));
  const cu = Math.floor(u), cv = Math.floor(v), cote = 2 * r + 1;
  // Le disque, recopie dans une petite image : teinteMediane la lit avec son masque.
  const donnees = new Uint8ClampedArray(cote * cote * 4), vu = new Uint8Array(cote * cote);
  let disque = 0;
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const i = cu + di, j = cv + dj;
    if (di * di + dj * dj > r * r || i < 0 || j < 0 || i >= img.largeur || j >= img.hauteur) continue;
    const k = (j * img.largeur + i) * 4, n = (dj + r) * cote + (di + r);
    donnees[n * 4] = img.data[k] as number; donnees[n * 4 + 1] = img.data[k + 1] as number; donnees[n * 4 + 2] = img.data[k + 2] as number; donnees[n * 4 + 3] = 255;
    vu[n] = 1;
    disque++;
  }
  if (disque < PIXELS_TOUCHER_MIN) return null;
  const med = teinteMediane({ largeur: cote, hauteur: cote, donnees }, vu);
  let n = 0, sr = 0, sg = 0, sb = 0;
  for (let q = 0; q < vu.length; q++) {
    if (!vu[q]) continue;
    const rr = donnees[q * 4] as number, gg = donnees[q * 4 + 1] as number, bb = donnees[q * 4 + 2] as number;
    if (Math.hypot(rr - (med[0] ?? 0), gg - (med[1] ?? 0), bb - (med[2] ?? 0)) > ECART_TOUCHER) continue;
    n++; sr += rr; sg += gg; sb += bb;
  }
  if (n < PART_TOUCHER_MIN * disque) return null;
  return { couleur: versHex([sr / n, sg / n, sb / n]), pixels: n };
}

/** Les pixels d'une photo du cas (JPEG en base64) ; null si le navigateur ne sait pas la lire. */
export function pixelsDePhoto(base64: string): Promise<Pixels | null> {
  return chargerPixels('data:image/jpeg;base64,' + base64);
}
