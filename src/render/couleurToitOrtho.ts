// La couleur des toits lue sur l'orthophoto IGN (MD/spec-toit-ign.md §6.1).
//
// Pour chaque batiment dont Plan choisit la couverture, on telecharge les tuiles de l'orthophoto qui
// couvrent son contour, on les recompose sur un canevas, et l'on garde les pixels qui tombent a
// l'interieur du contour, un peu en retrait des murs : la gouttiere, l'ombre du mur et le trottoir
// voisin ne sont pas la couverture. `model/couleurToit.ts` decide ensuite : teinte lue, ou
// couverture de repli rouge, brune ou grise.
//
// Une couleur choisie par l'utilisateur (`couleur` sans `origineCouleur`) n'est jamais touchee. Un
// service injoignable ne bloque rien : le toit garde la tuile rouge par defaut.

import { chargerTuileOrtho } from './ortho.js';
import { latDeTuile } from '../geo/projection.js';
import { au } from '../util/tableaux.js';
import { pointInPolygon } from '../geometry/basic.js';
import { distancePointContour } from '../geometry/proximite.js';
import { couleurToitDepuisPixels } from '../model/couleurToit.js';
import type { ProjecteurLocal } from '../geo/projection.js';
import type { PtBrut, Toit } from '../model/types.js';

/** Niveau de detail lu : environ 20 cm par pixel en France metropolitaine. Le 18 sert de repli. */
const ZOOMS = [19, 18];
const TAILLE_TUILE = 256;
/** Retrait des murs, en metres : la rive et l'ombre portee du mur ne sont pas la couverture. */
const RETRAIT_M = 0.6;
/** Un toit plus grand que ce cote de canevas (en pixels) est lu a un niveau de detail inferieur. */
const CANEVAS_MAX = 1024;
/** Au-dela, on renonce a lire les toits restants : l'import ne doit pas attendre le WMTS. */
const DELAI_MS = 20000;

/** Ce que la lecture a trouve, pour le bilan. */
export interface BilanCouleursToits {
  /** Toits dont la teinte a ete lue telle quelle. */
  lus: number;
  /** Toits dont la photo n'etait pas concluante : couverture rouge, brune ou grise. */
  replis: number;
}

interface ObjetAvecToit {
  pts?: PtBrut[];
  toit?: Toit | null;
}

/** Un toit dont Plan choisit la couleur : sans couleur, ou avec une couleur qu'il avait posee. */
export function couleurAResoudre(toit: Toit | null | undefined): toit is Toit {
  return !!toit && (!toit.couleur || !!toit.origineCouleur);
}

const echelle = (z: number) => TAILLE_TUILE * Math.pow(2, z);
/** Coordonnees en pixels « monde » de la grille PM au niveau z. */
export function versPixelMonde(lon: number, lat: number, z: number): { x: number; y: number } {
  const r = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * echelle(z),
    y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * echelle(z),
  };
}
function depuisPixelMonde(x: number, y: number, z: number): { lon: number; lat: number } {
  return { lon: (x / echelle(z)) * 360 - 180, lat: latDeTuile(y / TAILLE_TUILE, z) };
}

/** Une image recomposee, posee en pixels monde : son coin haut-gauche est (x0, y0). */
export interface ImageMonde {
  data: ArrayLike<number>;
  largeur: number;
  hauteur: number;
  x0: number;
  y0: number;
  z: number;
}

/**
 * Les pixels (RGBA a plat) de l'image qui tombent sous le contour, en retrait des murs. Un contour
 * trop etroit pour le retrait est lu entier.
 */
export function pixelsSousContour(img: ImageMonde, pts: readonly PtBrut[], proj: ProjecteurLocal): number[] {
  const lire = (retrait: number) => {
    const out: number[] = [];
    for (let j = 0; j < img.hauteur; j++) {
      for (let i = 0; i < img.largeur; i++) {
        const g = depuisPixelMonde(img.x0 + i + 0.5, img.y0 + j + 0.5, img.z);
        const p = proj.versMetres(g.lon, g.lat);
        if (!pointInPolygon(p, pts)) continue;
        if (retrait > 0 && distancePointContour(p, pts) < retrait) continue;
        const k = (j * img.largeur + i) * 4;
        out.push(au(img.data, k), au(img.data, k + 1), au(img.data, k + 2), au(img.data, k + 3));
      }
    }
    return out;
  };
  const enRetrait = lire(RETRAIT_M);
  return enRetrait.length ? enRetrait : lire(0);
}

function chargerImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('tuile illisible'));
    img.src = uri;
  });
}

/** L'orthophoto sous l'emprise d'un contour, recomposee ; `null` si aucun niveau ne repond. */
async function imageSous(pts: readonly PtBrut[], proj: ProjecteurLocal): Promise<ImageMonde | null> {
  for (const z of ZOOMS) {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const p of pts) {
      const g = proj.versDegres(p.x, p.y);
      const m = versPixelMonde(g.lon, g.lat, z);
      x0 = Math.min(x0, m.x);
      y0 = Math.min(y0, m.y);
      x1 = Math.max(x1, m.x);
      y1 = Math.max(y1, m.y);
    }
    x0 = Math.floor(x0);
    y0 = Math.floor(y0);
    const largeur = Math.ceil(x1) - x0,
      hauteur = Math.ceil(y1) - y0;
    if (largeur < 1 || hauteur < 1) return null;
    if (largeur > CANEVAS_MAX || hauteur > CANEVAS_MAX) continue;
    const canevas = document.createElement('canvas');
    canevas.width = largeur;
    canevas.height = hauteur;
    const c2d = canevas.getContext('2d', { willReadFrequently: true });
    if (!c2d) return null;
    let posees = 0;
    for (let tx = Math.floor(x0 / TAILLE_TUILE); tx <= Math.floor((x0 + largeur - 1) / TAILLE_TUILE); tx++) {
      for (let ty = Math.floor(y0 / TAILLE_TUILE); ty <= Math.floor((y0 + hauteur - 1) / TAILLE_TUILE); ty++) {
        try {
          const img = await chargerImage(await chargerTuileOrtho(z, tx, ty));
          c2d.drawImage(img, tx * TAILLE_TUILE - x0, ty * TAILLE_TUILE - y0);
          posees++;
        } catch {
          // Une tuile manquante laisse des pixels transparents : ils sont ignores a la lecture.
        }
      }
    }
    if (!posees) continue;
    return { data: c2d.getImageData(0, 0, largeur, hauteur).data, largeur, hauteur, x0, y0, z };
  }
  return null;
}

/**
 * Pose sur chaque toit dont Plan choisit la couleur celle que l'orthophoto montre, ou la couverture
 * de repli. Modifie les toits en place. Un toit dont l'orthophoto ne repond pas reste tel quel.
 */
export async function couleursToitsDepuisOrtho(objets: readonly ObjetAvecToit[], proj: ProjecteurLocal, delaiMs = DELAI_MS): Promise<BilanCouleursToits> {
  const bilan: BilanCouleursToits = { lus: 0, replis: 0 };
  const fin = Date.now() + delaiMs;
  for (const o of objets) {
    const toit = o.toit;
    if (!couleurAResoudre(toit) || !Array.isArray(o.pts) || o.pts.length < 3) continue;
    if (Date.now() > fin) break;
    let img: ImageMonde | null = null;
    try {
      // Une tuile qui ne repond jamais ne doit pas tenir l'import : au-dela du delai, on s'arrete.
      img = await Promise.race([imageSous(o.pts, proj), new Promise<null>((r) => setTimeout(() => r(null), Math.max(0, fin - Date.now())))]);
    } catch {
      img = null;
    }
    if (!img) continue;
    const lue = couleurToitDepuisPixels(pixelsSousContour(img, o.pts, proj));
    toit.couleur = lue.couleur;
    toit.origineCouleur = lue.origine;
    if (lue.origine === 'orthophoto') bilan.lus++;
    else bilan.replis++;
  }
  return bilan;
}
