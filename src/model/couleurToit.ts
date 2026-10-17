// La couleur d'une couverture lue sur l'orthophoto (MD/spec-toit-ign.md §6.1).
//
// On ne sait de la couverture que ce que la photo aerienne en montre : les pixels sous le contour du
// batiment. Quand ils sont coherents — une seule teinte dominante, ni arbre ni ombre portee qui la
// masque — la couverture prend cette teinte. Sinon la photo ne dit rien de sur, et l'on se rabat sur
// l'une des trois couvertures courantes, celle dont la teinte moyenne est la plus proche : tuile
// rouge, tuile brune, ardoise ou zinc gris. Sans aucun pixel, c'est la tuile rouge par defaut.
//
// Ce module est pur : il recoit les pixels, `render/couleurToitOrtho.ts` va les chercher.

import { au } from '../util/tableaux.js';
import type { CouvertureChoisie } from './types.js';

/** Les trois couvertures de repli, quand la photo n'est pas concluante. */
export const COULEURS_TOIT_REPLI = {
  rouge: '#B0432F',
  brun: '#6E4B36',
  gris: '#6F7275',
} as const;

export type CouvertureRepli = keyof typeof COULEURS_TOIT_REPLI;

/** Ce que la lecture rend : la couleur, et d'ou elle vient. */
export interface CouleurToitLue {
  couleur: string;
  /** `orthophoto` : teinte lue telle quelle ; sinon, la couverture de repli retenue. */
  origine: 'orthophoto' | CouvertureRepli;
}

/** En dessous, pas assez de pixels pour juger : un toit de quelques metres carres a 20 cm/pixel en a des centaines. */
export const PIXELS_MIN = 40;
/** Distance RGB sous laquelle un pixel est « de la teinte dominante ». */
const ECART_TEINTE = 42;
/** Part des pixels qui doivent etre de la teinte dominante pour que la lecture soit retenue. */
const PART_COHERENTE = 0.6;
/** Au-dela, des arbres couvrent le toit : sa teinte n'est pas lisible. */
const PART_VEGETATION_MAX = 0.2;
/** Luminance (0–255) en dessous de laquelle la teinte est une ombre plus qu'une couverture. */
const LUMINANCE_MIN = 40;
/** Au-dessus, une surface eblouie (verriere, bac acier au soleil) : la teinte n'est pas celle de la couverture. */
const LUMINANCE_MAX = 235;

type Rgb = [number, number, number];

const luminance = ([r, g, b]: Rgb) => 0.299 * r + 0.587 * g + 0.114 * b;
const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Un pixel de feuillage : le vert l'emporte nettement. */
const estVegetation = ([r, g, b]: Rgb) => g > r + 8 && g > b + 8;

function mediane(valeurs: number[]): number {
  const t = [...valeurs].sort((a, b) => a - b);
  const m = t.length >> 1;
  return t.length % 2 ? au(t, m) : (au(t, m - 1) + au(t, m)) / 2;
}

function medianeRgb(px: Rgb[]): Rgb {
  return [mediane(px.map((p) => p[0])), mediane(px.map((p) => p[1])), mediane(px.map((p) => p[2]))];
}

function moyenneRgb(px: Rgb[]): Rgb {
  const s = px.reduce<Rgb>((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
  return [s[0] / px.length, s[1] / px.length, s[2] / px.length];
}

export function versHex([r, g, b]: Rgb): string {
  const h = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return ('#' + h(r) + h(g) + h(b)).toUpperCase();
}

/** Teinte (0–360) et saturation (0–1) d'une couleur. */
function teinteSaturation([r, g, b]: Rgb): { teinte: number; saturation: number } {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  if (max === 0 || d === 0) return { teinte: 0, saturation: 0 };
  let t: number;
  if (max === r) t = ((g - b) / d) % 6;
  else if (max === g) t = (b - r) / d + 2;
  else t = (r - g) / d + 4;
  return { teinte: (t * 60 + 360) % 360, saturation: d / max };
}

/**
 * La couverture de repli la plus proche d'une teinte : une couleur peu saturee, ou d'une teinte qui
 * n'est pas celle d'une terre cuite (verte, bleue), est grise ; une terre cuite vive est rouge ; une
 * terre cuite sombre ou tirant sur l'ocre est brune.
 */
export function couvertureRepli(c: Rgb): CouvertureRepli {
  const { teinte, saturation } = teinteSaturation(c);
  if (saturation < 0.2) return 'gris';
  const terreCuite = teinte < 50 || teinte >= 340;
  if (!terreCuite) return 'gris';
  if ((teinte < 22 || teinte >= 340) && saturation >= 0.35 && luminance(c) >= 60) return 'rouge';
  return 'brun';
}

/**
 * La couleur d'une couverture, d'apres les pixels de l'orthophoto pris sous son contour, en RGBA
 * a plat (le format de `ImageData.data`). Les pixels transparents (hors tuile) sont ignores.
 * `plat` : un toit-terrasse (membrane, gravillons, zinc) ne se rabat jamais sur une tuile — quand
 * la photo n'est pas concluante, il est gris.
 */
export function couleurToitDepuisPixels(rgba: ArrayLike<number>, plat = false): CouleurToitLue {
  const lue = lireCouleur(rgba);
  return plat && lue.origine !== 'orthophoto' ? { couleur: COULEURS_TOIT_REPLI.gris, origine: 'gris' } : lue;
}

/**
 * La couleur d'un toit-terrasse en 3D : celle lue sur l'orthophoto, ou choisie ; grise quand Plan
 * l'avait rabattue sur une tuile (un plan lu avant que le toit plat ait son repli).
 */
export function couleurToitPlat(toit: { couleur?: string; origineCouleur?: string } | null | undefined): string {
  const o = toit?.origineCouleur;
  if (!toit?.couleur || o === 'rouge' || o === 'brun') return COULEURS_TOIT_REPLI.gris;
  return toit.couleur;
}

function lireCouleur(rgba: ArrayLike<number>): CouleurToitLue {
  const px: Rgb[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (au(rgba, i + 3) < 128) continue;
    px.push([au(rgba, i), au(rgba, i + 1), au(rgba, i + 2)]);
  }
  if (!px.length) return { couleur: COULEURS_TOIT_REPLI.rouge, origine: 'rouge' };
  const repli = (c: Rgb): CouleurToitLue => {
    const r = couvertureRepli(c);
    return { couleur: COULEURS_TOIT_REPLI[r], origine: r };
  };
  // La teinte du toit, sans ce qui le couvre : les arbres ne disent rien de la couverture.
  const mineraux = px.filter((p) => !estVegetation(p));
  const base = mineraux.length ? mineraux : px;
  const dominante = medianeRgb(base);
  if (px.length < PIXELS_MIN) return repli(dominante);
  if (1 - mineraux.length / px.length > PART_VEGETATION_MAX) return repli(dominante);
  const proches = px.filter((p) => distance(p, dominante) <= ECART_TEINTE);
  if (proches.length / px.length < PART_COHERENTE) return repli(dominante);
  const teinte = moyenneRgb(proches);
  const lum = luminance(teinte);
  if (lum < LUMINANCE_MIN || lum > LUMINANCE_MAX) return repli(teinte);
  return { couleur: versHex(teinte), origine: 'orthophoto' };
}

/**
 * Le materiau dessine sur la couverture en 3D (three/couverture.ts) : tuiles romanes (mecaniques),
 * tuiles plates d'un toit raide, tuiles canal d'un toit peu pentu, ardoises (et la grande ardoise posee en losange), zinc a joints debout,
 * gravillons d'un toit-terrasse.
 */
export type MateriauCouverture = CouvertureChoisie | 'terrasse';

/** Au-dessus, une tuile est plate (elle tient sur un toit raide) ; en dessous, une tuile canal (le toit provencal). */
export const PENTE_TUILE_PLATE_DEG = 40;
export const PENTE_TUILE_CANAL_DEG = 25;

/** Ce que l'on sait de la couverture en plus de sa couleur : le materiau des fichiers fonciers, la pente. */
export interface ContexteCouverture {
  /** `bdtopo.materiauxToiture` : les codes des fichiers fonciers (1 tuiles, 2 ardoises, 3 zinc, 4 beton). */
  materiauxToiture?: unknown;
  /** La pente des pans, en degres ; absente : la tuile romane, sans choix de modele. */
  pente?: number | null;
  /** La latitude du projet : la tuile canal est celle du Midi, au nord un toit peu pentu porte une tuile mecanique. */
  latitude?: number | null;
  /** Le materiau choisi dans l'inspecteur (`Toit.couverture`) : il l'emporte sur tout le reste, sauf sur un toit plat. */
  choix?: CouvertureChoisie | null;
}

/** Au nord de cette latitude (la Loire, le Lyonnais), un toit peu pentu n'est pas en tuiles canal. */
export const LATITUDE_TUILE_CANAL_MAX = 46;

/** La couverture d'apres le code des fichiers fonciers (`materiaux_de_la_toiture`) : tuiles, ardoises, zinc, beton. */
export function couvertureDesFichiersFonciers(code: unknown): 'tuile' | 'ardoise' | 'zinc' | 'beton' | null {
  if (typeof code !== 'string') return null;
  for (const c of code.trim()) {
    if (c === '1') return 'tuile';
    if (c === '2') return 'ardoise';
    if (c === '3') return 'zinc';
    if (c === '4') return 'beton';
  }
  return null;
}

/** Une couverture grise et lisse (ardoise, zinc) : sa cheminee, sa brillance ne sont pas celles d'une tuile. */
export const couvertureGrise = (m: MateriauCouverture): boolean => m === 'ardoise' || m === 'ardoise-losange' || m === 'zinc';

function rgbDeHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Le materiau d'une couverture. Un toit-terrasse (`plat`) est en gravillons. Sinon le materiau des
 * fichiers fonciers decide quand il est connu (une ardoise, du zinc ; une tuile, meme si la photo la
 * voyait grise ; un beton en pente est une tuile de beton) ; a defaut, la couleur : le repli gris est
 * une ardoise, le rouge et le brun des tuiles, une couleur lue ou choisie se classe comme son repli,
 * et sans couleur c'est la tuile. Une tuile est plate sur un toit raide, canal sur un toit peu pentu
 * du Midi, romane entre les deux, au nord sur un toit peu pentu, ou quand la pente n'est pas connue.
 */
export function materiauCouverture(toit: { couleur?: string; origineCouleur?: string } | null | undefined, c: ContexteCouverture = {}, plat = false): MateriauCouverture {
  if (plat) return 'terrasse';
  if (c.choix) return c.choix;
  const ff = couvertureDesFichiersFonciers(c.materiauxToiture);
  if (ff === 'ardoise' || ff === 'zinc') return ff;
  if (!ff && couleurGrise(toit)) return 'ardoise';
  const pente = c.pente ?? null;
  if (pente !== null && pente >= PENTE_TUILE_PLATE_DEG) return 'tuile-plate';
  const midi = c.latitude === null || c.latitude === undefined || c.latitude < LATITUDE_TUILE_CANAL_MAX;
  if (midi && pente !== null && pente > 0 && pente <= PENTE_TUILE_CANAL_DEG) return 'tuile-canal';
  return 'tuile';
}

/** Une couverture de couleur grise : le repli gris, ou une couleur lue ou choisie qui s'y classerait. */
function couleurGrise(toit: { couleur?: string; origineCouleur?: string } | null | undefined): boolean {
  if (toit?.origineCouleur === 'gris') return true;
  if (toit?.origineCouleur === 'rouge' || toit?.origineCouleur === 'brun') return false;
  const rgb = toit?.couleur ? rgbDeHex(toit.couleur) : null;
  return !!rgb && couvertureRepli(rgb) === 'gris';
}
