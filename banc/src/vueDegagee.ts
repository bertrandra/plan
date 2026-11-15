// « La maison se voit-elle ? » (demande du proprietaire, 15 novembre 2026). Le tri par la geometrie (facadesVues.ts) ne voit ni les haies
// ni les arbres : au Vesinet, environ une vue gardee sur trois montre la maison derriere une haie, des arbres ou une cloture. Ce module
// lit l'apercu deja calcule, sans modele ni reseau : dans la zone du cadre ou la geometrie dit que le batiment se trouve, au-dessus de
// l'horizon (plus bas, c'est la rue, la cloture et le pied de la haie pour toutes les vues), il compte ce qui a la couleur du bati
// (teintes peu saturees et claires, teintes chaudes des tuiles et des enduits) et ce qui a celle de la vegetation (verts, et sombres a
// dominante verte : une haie a l'ombre). Le score est leur difference, fois la hauteur de la zone lue : un batiment proche et haut se
// voit par-dessus sa cloture. Mesure sur 76 vues du Vesinet etiquetees a l'oeil (banc/tests/fixtures/vue-degagee/) : voir
// SEUIL_DEGAGEE. Limites connues : des arbres nus (l'hiver) cachent peu et se lisent mal ; un mur de pierre ou un portail plein a la
// couleur du bati ; une facade verte, ou a l'ombre profonde, a celle d'une haie. Les aretes droites ont ete essayees : elles ne
// separent pas les deux cas (60 % de bonnes reponses), elles ne sont pas lues. Sans DOM, testable seul (banc/tests/vueDegagee.test.ts).

import type { ImageRgba } from './equirect.js';
import { CADRE_VUE, type Cadre, type Zone } from './facadesVues.js';

/** La taille de l'image lue : l'apercu se calcule au double puis se reduit de moitie (la moyenne de quatre pixels lisse le grain). */
export const LARGEUR_LUE = 160, HAUTEUR_LUE = 120;

/**
 * En deca de ce score, la facade est dite cachee. Cale sur les 76 temoins du Vesinet (32 degagees, 44 cachees) : voir le test, qui
 * tient le taux d'erreur. Le hasard ferait 58 % en repondant toujours « cachee ».
 */
export const SEUIL_DEGAGEE = 0.07;
/** Ce que vaut la note d'une vue dont la facade est cachee : elle passe apres les vues degagees du meme batiment. */
export const COEF_NOTE_CACHEE = 0.5;

/** Ou l'horizon tombe dans le cadre (part de la hauteur depuis le haut) : plus bas que le milieu quand la vue regarde vers le haut. */
export function horizonDuCadre(c: Cadre = CADRE_VUE): number {
  const demiH = Math.tan((c.champ / 2) * (Math.PI / 180)) / c.forme;
  return Math.max(0, Math.min(1, 0.5 + Math.tan(c.tangage * (Math.PI / 180)) / (2 * demiH)));
}

export interface Lecture {
  /** Les parts de la zone lue (0 a 1) qui ont la couleur du bati, de la vegetation, du ciel. */
  bati: number;
  vegetation: number;
  ciel: number;
  /** La hauteur de la zone lue, en part de la hauteur de l'image. */
  hauteur: number;
  score: number;
  cachee: boolean;
}

/** Reduit une image de moitie : chaque pixel est la moyenne de quatre. */
export function reduireDeMoitie(src: ImageRgba): ImageRgba {
  const l = src.largeur >> 1, h = src.hauteur >> 1, d = new Uint8ClampedArray(l * h * 4), s = src.donnees, L = src.largeur * 4;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const i = (2 * y) * L + 8 * x, o = (y * l + x) * 4;
      for (let k = 0; k < 3; k++) d[o + k] = ((s[i + k] as number) + (s[i + 4 + k] as number) + (s[i + L + k] as number) + (s[i + L + 4 + k] as number) + 2) >> 2;
      d[o + 3] = 255;
    }
  }
  return { largeur: l, hauteur: h, donnees: d };
}

/** Ce qu'un pixel montre : 1 du bati, 2 de la vegetation, 3 du ciel, 0 autre chose. */
export function nature(r: number, g: number, b: number): 0 | 1 | 2 | 3 {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, v = max / 255, s = max ? d / max : 0;
  let t = 0;
  if (d > 0) t = 60 * (max === r ? (((g - b) / d) % 6 + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
  // Vert sature, ou sombre a dominante verte (une haie a l'ombre, un sapin).
  if ((t >= 60 && t <= 170 && s > 0.18 && v > 0.12) || (v < 0.22 && g >= r - 4 && g >= b - 2)) return 2;
  // Bleu clair, ou blanc brule.
  if ((t >= 190 && t <= 250 && s > 0.15 && v > 0.5) || (v > 0.92 && s < 0.08)) return 3;
  // Teintes chaudes (tuiles, briques, enduits ocre), ou gris et blancs casses des murs.
  if (((t <= 45 || t >= 340) && s > 0.15 && v > 0.25) || (s < 0.18 && v >= 0.3 && v <= 0.92)) return 1;
  return 0;
}

/**
 * Lit, dans l'image d'une vue, la zone ou le batiment se trouve : de son faite a l'horizon (ou a son pied, s'il est plus haut), sur sa
 * largeur. La zone a huit pixels de large et six de haut au moins : un batiment lointain se lit sur ce qui l'entoure.
 */
export function lireLaZone(img: ImageRgba, zone: Zone, horizon = horizonDuCadre()): Lecture {
  const L = img.largeur, H = img.hauteur;
  const x0 = Math.min(L - 1, Math.floor(zone.gauche * L)), x1 = Math.min(L, Math.max(x0 + 8, Math.ceil(zone.droite * L)));
  const y0 = Math.min(H - 1, Math.floor(zone.haut * H)), y1 = Math.min(H, Math.max(y0 + 6, Math.floor(Math.min(horizon, zone.bas) * H)));
  const n = [0, 0, 0, 0], d = img.donnees;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * L + x) * 4; (n[nature(d[i] as number, d[i + 1] as number, d[i + 2] as number)] as number)++; }
  const total = Math.max(1, (x1 - x0) * (y1 - y0)), bati = (n[1] as number) / total, vegetation = (n[2] as number) / total, hauteur = (y1 - y0) / H;
  const score = (bati - vegetation) * hauteur;
  return { bati, vegetation, ciel: (n[3] as number) / total, hauteur, score, cachee: score < SEUIL_DEGAGEE };
}

/** La note d'une vue, sa facade cachee prise en compte. */
export const noteAvecLecture = (note: number, cachee: boolean): number => (cachee ? Math.round(note * COEF_NOTE_CACHEE) : note);
