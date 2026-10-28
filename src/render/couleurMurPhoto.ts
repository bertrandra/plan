// La couleur des murs lue sur les photos de rue de Panoramax (MD/spec-toit-ign.md §6.5).
//
// Pour chaque mur d'un batiment, les photos qui le regardent de face, d'assez pres, sans autre
// batiment entre elles et lui. On pose sur la photo des points du mur - entre le haut d'une cloture
// et l'egout, loin des angles - par la geometrie de la prise de vue (position, cap, champ ;
// equirectangulaire pour un panoramique), et l'on lit leurs pixels. `model/couleurMur.ts` decide :
// teinte coherente, ou rien. Chaque photo n'est telechargee qu'une fois, en definition reduite, pour
// tous les murs qu'elle montre ; les batiments les plus proches du projet d'abord, dans un delai
// borne, comme la couleur des toits (render/couleurToitOrtho.ts).
//
// La lecture est rangee sur le batiment (`couleurMurs.photo`) ; la source choisie a la main n'est
// jamais touchee. Un service muet ne bloque rien : la couleur du materiau, ou du plan, reste.

import { centroid, signedArea } from '../geometry/basic.js';
import { chercherPhotosRue, ecartAngulaire, type PhotoRue } from '../geo/panoramax.js';
import { couleurMurDepuisPixels, type LectureMur, type PhotoMur } from '../model/couleurMur.js';
import type { ProjecteurLocal } from '../geo/projection.js';
import type { CouleurMurs, PtBrut } from '../model/types.js';
import { obstacle, vueCachee, type Obstacle } from '../geometry/ligneDeVue.js';
import { champsBatiment } from '../model/champsFonction.js';
import { toucher } from '../core/controleurObjets.js';
import { estOuvrage, BATIMENT, TERRAIN } from '../model/ouvrages/index.js';

// La ligne de vue a descendu dans geometry/ (la facade devant soi s'en sert aussi) : on la redonne
// d'ici pour ses lecteurs d'avant.
export { obstacle, vueCachee, type Obstacle } from '../geometry/ligneDeVue.js';

/** La hauteur de l'objectif au-dessus du sol : un vehicule ou un pieton qui tient sa perche. */
export const HAUTEUR_CAMERA_M = 2.2;
/** Une photo plus loin ne montre plus assez le mur ; plus pres, il deborde de l'image. */
export const DISTANCE_MUR_MAX_M = 40;
const DISTANCE_MUR_MIN_M = 3;
/** Un mur vu plus de biais que cela se lit mal (fenetres et tableaux en raccourci). */
const OBLIQUITE_MAX_DEG = 70;
/** Un mur plus court que cela est un ressaut, pas une facade. */
const MUR_MIN_M = 3;
/** Les points du mur : une grille, en retrait des angles, entre le haut d'une cloture et l'egout. */
const COLONNES = 16, RANGEES = 8, RETRAIT_ANGLES = 0.15;
/** Une cloture ou une haie en limite de parcelle monte jusque-la : une ligne de vue plus basse ne voit qu'elle. */
export const HAUTEUR_CLOTURE_M = 2.5;
/** Les photos gardees par mur, et le plus grand cote de l'image lue (la definition reduite suffit). */
const PHOTOS_PAR_MUR = 2;
const COTE_IMAGE_MAX_PX = 2048;
/** Les batiments lus au plus, et le delai : l'import ne doit pas attendre les photos. */
export const MAX_BATIMENTS_PHOTOS = 150;
export const DELAI_PHOTOS_MS = 20000;
/** Le rayon de la recherche Panoramax autour du projet, borne, et le nombre de photos demandees. */
const RAYON_MAX_M = 250;
const LIMITE_RECHERCHE = 500;

/** Un point du plan a une hauteur au-dessus du sol. */
export interface Point3 { x: number; y: number; z: number }

/** Une photo de rue posee dans le repere du plan. */
export interface VueRue { photo: PhotoRue; x: number; y: number }

/** Les pixels d'une image (RGBA a plat). */
export interface Pixels { data: ArrayLike<number>; largeur: number; hauteur: number }

/**
 * Ou tombe un point du mur dans l'image : panoramique equirectangulaire (le cap de la photo au centre,
 * l'horizon a mi-hauteur) ou photo plate (objectif sans distorsion, horizontal). Null hors du champ.
 */
export function pointDansImage(vue: VueRue, p: Point3, largeur: number, hauteur: number): { u: number; v: number } | null {
  const dx = p.x - vue.x, dy = p.y - vue.y, d = Math.hypot(dx, dy);
  if (d < 0.1) return null;
  const cap = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  const elev = (Math.atan2(p.z - HAUTEUR_CAMERA_M, d) * 180) / Math.PI;
  const centre = vue.photo.azimut ?? 0;
  if (vue.photo.panoramique) {
    const u = (((((cap - centre + 180) % 360) + 360) % 360) / 360) * largeur;
    return { u, v: ((90 - elev) / 180) * hauteur };
  }
  if (vue.photo.azimut === null) return null;
  const daz = ecartAngulaire(centre, cap);
  if (Math.abs(daz) >= vue.photo.champ / 2) return null;
  const f = largeur / 2 / Math.tan((vue.photo.champ * Math.PI) / 360);
  const a = (daz * Math.PI) / 180;
  const u = largeur / 2 + f * Math.tan(a);
  const v = hauteur / 2 - (f * Math.tan((elev * Math.PI) / 180)) / Math.cos(a);
  return v >= 0 && v < hauteur ? { u, v } : null;
}

/** Les points ou lire un mur de A a B, d'egout `egout` : loin des angles, au-dessus d'une cloture, sous l'egout. */
export function pointsDuMur(a: PtBrut, b: PtBrut, egout: number): Point3[] {
  const bas = Math.min(2.4, Math.max(1.2, 0.45 * egout)), haut = Math.max(bas + 0.4, egout - 0.3);
  const out: Point3[] = [];
  for (let i = 0; i < COLONNES; i++) for (let j = 0; j < RANGEES; j++) {
    const s = RETRAIT_ANGLES + ((1 - 2 * RETRAIT_ANGLES) * (i + 0.5)) / COLONNES;
    out.push({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s, z: bas + ((haut - bas) * (j + 0.5)) / RANGEES });
  }
  return out;
}

/** Un mur a lire sur une photo : le batiment, ses deux angles, son egout, la photo et sa note. */
export interface MurAVoir { cle: string; a: PtBrut; b: PtBrut; egout: number; vue: VueRue; note: number }

/**
 * Les murs que les photos montrent : pour chaque mur assez long, les photos devant lui (du cote de sa
 * normale sortante, a moins de 70 degres de l'aplomb), entre 3 et 40 m, dont le champ le contient, et
 * sans autre contour entre elles et lui ; les deux meilleures (de pres et de face).
 */
export function mursVisibles(batiments: readonly { key: string; pts: readonly PtBrut[]; egout: number }[], vues: readonly VueRue[], obstacles: readonly Obstacle[], parMur = PHOTOS_PAR_MUR): MurAVoir[] {
  const out: MurAVoir[] = [];
  for (const bat of batiments) {
    const pts = bat.pts, sens = signedArea(pts as PtBrut[]) > 0 ? 1 : -1;
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length] as PtBrut;
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < MUR_MIN_M) return;
      // Normale sortante : a droite du cote pour un contour dans le sens trigonometrique.
      const n = { x: (sens * (b.y - a.y)) / L, y: (-sens * (b.x - a.x)) / L };
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, devant = { x: m.x + n.x * 0.2, y: m.y + n.y * 0.2 };
      const notes: MurAVoir[] = [];
      for (const vue of vues) {
        const vx = vue.x - m.x, vy = vue.y - m.y, d = Math.hypot(vx, vy);
        if (d < DISTANCE_MUR_MIN_M || d > DISTANCE_MUR_MAX_M) continue;
        const obliquite = (Math.acos(Math.max(-1, Math.min(1, (vx * n.x + vy * n.y) / d))) * 180) / Math.PI;
        if (obliquite > OBLIQUITE_MAX_DEG) continue;
        if (!pointDansImage(vue, { x: m.x, y: m.y, z: HAUTEUR_CAMERA_M }, 1000, 500)) continue;
        if (vueCachee({ x: vue.x, y: vue.y }, devant, obstacles)) continue;
        notes.push({ cle: bat.key, a, b, egout: bat.egout, vue, note: d + obliquite * 0.2 });
      }
      out.push(...notes.sort((x, y) => x.note - y.note).slice(0, parMur));
    });
  }
  return out;
}

/**
 * La hauteur de la ligne de vue de l'objectif vers un point du mur, la ou elle franchit une limite de
 * parcelle (la plus basse si elle en franchit plusieurs) ; null quand elle n'en franchit aucune.
 * `hauteurCamera` : un telephone tenu a la main est plus bas que la perche de Panoramax.
 */
export function hauteurAuxLimites(cam: PtBrut, p: Point3, limites: readonly Obstacle[], hauteurCamera = HAUTEUR_CAMERA_M): number | null {
  const d = Math.hypot(p.x - cam.x, p.y - cam.y);
  let bas: number | null = null;
  for (const o of limites) {
    if (o.x1 < Math.min(cam.x, p.x) || o.x0 > Math.max(cam.x, p.x) || o.y1 < Math.min(cam.y, p.y) || o.y0 > Math.max(cam.y, p.y)) continue;
    o.pts.forEach((a, i) => {
      const b = o.pts[(i + 1) % o.pts.length] as PtBrut;
      const t = fractionCroisement(cam, p, a, b);
      // Au pied du mur (le dernier demi-metre), c'est le mur lui-meme, pas une cloture devant lui.
      if (t === null || t * d > d - 0.5) return;
      const h = hauteurCamera + (p.z - hauteurCamera) * t;
      if (bas === null || h < bas) bas = h;
    });
  }
  return bas;
}

/** La fraction de [p, q] ou il coupe [a, b] ; null s'ils ne se coupent pas. */
function fractionCroisement(p: PtBrut, q: PtBrut, a: PtBrut, b: PtBrut): number | null {
  const rx = q.x - p.x, ry = q.y - p.y, sx = b.x - a.x, sy = b.y - a.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den, u = ((a.x - p.x) * ry - (a.y - p.y) * rx) / den;
  return t > 0 && t < 1 && u >= 0 && u <= 1 ? t : null;
}

/**
 * Les pixels sous les points du mur (RGBA a plat ; alpha nul hors de l'image, et pour un point que
 * la ligne de vue n'atteint qu'en passant sous HAUTEUR_CLOTURE_M a une limite de parcelle : la
 * photo y voit la cloture ou la haie, pas le mur - une facade en retrait derriere une palissade).
 */
export function pixelsDuMur(img: Pixels, mur: MurAVoir, limites: readonly Obstacle[] = []): number[] {
  const out: number[] = [];
  const cam = { x: mur.vue.x, y: mur.vue.y };
  for (const p of pointsDuMur(mur.a, mur.b, mur.egout)) {
    const h = limites.length ? hauteurAuxLimites(cam, p, limites) : null;
    if (h !== null && h < HAUTEUR_CLOTURE_M) { out.push(0, 0, 0, 0); continue; }
    const uv = pointDansImage(mur.vue, p, img.largeur, img.hauteur);
    const i = uv ? Math.floor(uv.u) : -1, j = uv ? Math.floor(uv.v) : -1;
    if (i < 0 || j < 0 || i >= img.largeur || j >= img.hauteur) { out.push(0, 0, 0, 0); continue; }
    const k = (j * img.largeur + i) * 4;
    out.push(img.data[k] as number, img.data[k + 1] as number, img.data[k + 2] as number, 255);
  }
  return out;
}

/**
 * Un point de la photo sur le ciel : clair, pas chaud, lisse avec ses voisins (ciel bleu, couvert, ou
 * nuage). Une facade blanche en plein soleil peut y ressembler : elle se perd alors, et le materiau
 * reprend la main, plutot qu'un nuage pris pour une facade blanche (mesure d'octobre 2026).
 */
export function surLeCiel(img: Pixels, i: number, j: number): boolean {
  const W = img.largeur, d = img.data;
  if (i < 1 || j < 1 || i >= W - 1 || j >= img.hauteur - 1) return false;
  const L = (k: number) => 0.299 * (d[k] as number) + 0.587 * (d[k + 1] as number) + 0.114 * (d[k + 2] as number);
  const k = (j * W + i) * 4;
  const grad = Math.abs(L(k + 4) - L(k - 4)) + Math.abs(L(k + W * 4) - L(k - W * 4));
  return L(k) > CIEL_LUMINANCE_MIN && (d[k + 2] as number) >= (d[k] as number) - 4 && grad < CIEL_GRADIENT_MAX;
}
const CIEL_LUMINANCE_MIN = 135, CIEL_GRADIENT_MAX = 14;

/**
 * La lecture d'un mur sur une photo : ses points (pixelsDuMur), moins ceux qui tombent sur le ciel de
 * la photo, comptes a part (model/couleurMur.ts::PART_CIEL_MAX : trop de ciel, le mur n'est pas la).
 */
export function lectureDuMur(img: Pixels, mur: MurAVoir, limites: readonly Obstacle[] = []): LectureMur {
  const px = pixelsDuMur(img, mur, limites);
  let ciel = 0;
  pointsDuMur(mur.a, mur.b, mur.egout).forEach((p, n) => {
    if (!px[n * 4 + 3]) return;
    const uv = pointDansImage(mur.vue, p, img.largeur, img.hauteur);
    if (!uv || !surLeCiel(img, Math.floor(uv.u), Math.floor(uv.v))) return;
    ciel++;
    px[n * 4 + 3] = 0;
  });
  return couleurMurDepuisPixels(px, ciel);
}

/** Telecharge une photo et rend ses pixels, reduite a COTE_IMAGE_MAX_PX ; null si elle ne vient pas. */
export async function chargerPixels(url: string): Promise<Pixels | null> {
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) return null;
    const bmp = await createImageBitmap(await r.blob());
    const k = Math.min(1, COTE_IMAGE_MAX_PX / Math.max(bmp.width, bmp.height));
    const largeur = Math.max(1, Math.round(bmp.width * k)), hauteur = Math.max(1, Math.round(bmp.height * k));
    const canevas = document.createElement('canvas');
    canevas.width = largeur;
    canevas.height = hauteur;
    const ctx = canevas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, largeur, hauteur);
    bmp.close();
    return { data: ctx.getImageData(0, 0, largeur, hauteur).data, largeur, hauteur };
  } catch {
    return null;
  }
}

/** Ce que la lecture a fait, pour le bilan. */
export interface BilanCouleursMurs {
  /** Batiments dont la couleur des murs a ete lue sur une photo. */
  photos: number;
  /** Batiments dont les photos n'etaient pas concluantes : leur materiau, ou la couleur du plan, reste. */
  ambigus: number;
}

/** La phrase du bilan d'une actualisation ; null s'il n'y a rien a dire. */
export function texteBilanCouleursMurs(b: BilanCouleursMurs | null, materiaux: number): string | null {
  const parts = [
    b?.photos ? b.photos + ' couleur(s) de murs lue(s) sur les photos de rue' : '',
    materiaux ? materiaux + ' materiau(x) de murs connu(s) (fichiers fonciers)' : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** Ce que l'etape lit et ecrit d'un objet du plan. */
interface ObjetAMurs {
  key?: string;
  fonction?: string;
  pts?: PtBrut[];
  elevation?: number;
  batiment?: { couleurMurs?: CouleurMurs | null } | null;
}

export interface OptionsCouleursMurs {
  delaiMs?: number;
  maxBatiments?: number;
  chercher?: typeof chercherPhotosRue;
  charger?: (url: string) => Promise<Pixels | null>;
  maintenant?: () => number;
}

/** Ce qu'une lecture de photos a donne : la meilleure lecture par batiment, et combien de ses murs etaient a lire et ont ete lus. */
interface LecturesMurs {
  lectures: Map<string, { couleur: string; coherence: number; photo: PhotoRue }>;
  tentes: Map<string, number>;
  lus: Map<string, number>;
}

/**
 * Lit les murs que les photos montrent : une photo par telechargement, pour tous les murs qu'elle
 * montre, celles qui en montrent le plus d'abord, `enParallele` a la fois, jusqu'a `fin`.
 */
async function lireLesMurs(murs: readonly MurAVoir[], limites: readonly Obstacle[], charger: (url: string) => Promise<Pixels | null>, fin: number, maintenant: () => number, enParallele = 1): Promise<LecturesMurs> {
  const parPhoto = new Map<string, MurAVoir[]>();
  for (const m of murs) parPhoto.set(m.vue.photo.id, [...(parPhoto.get(m.vue.photo.id) ?? []), m]);
  const r: LecturesMurs = { lectures: new Map(), tentes: new Map(), lus: new Map() };
  for (const m of murs) r.tentes.set(m.cle, (r.tentes.get(m.cle) ?? 0) + 1);
  const file = [...parPhoto.values()].sort((x, y) => y.length - x.length);
  let suivant = 0;
  const ouvrier = async (): Promise<void> => {
    while (suivant < file.length && maintenant() <= fin) {
      const ms = file[suivant++] as MurAVoir[];
      const photo = (ms[0] as MurAVoir).vue.photo;
      const img = await charger(photo.sd ?? photo.hd);
      if (!img) continue;
      for (const m of ms) {
        r.lus.set(m.cle, (r.lus.get(m.cle) ?? 0) + 1);
        const l = lectureDuMur(img, m, limites);
        const avant = r.lectures.get(m.cle);
        if (l.couleur && (!avant || l.coherence > avant.coherence)) r.lectures.set(m.cle, { couleur: l.couleur, coherence: l.coherence, photo });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, enParallele) }, ouvrier));
  return r;
}

/** La lecture d'un batiment, telle qu'elle se range dans `couleurMurs.photo`. */
const photoMur = (l: { couleur: string; photo: PhotoRue }): PhotoMur => ({ couleur: l.couleur, id: l.photo.id, date: l.photo.date, auteur: l.photo.auteur, licence: l.photo.licence });

/** Les batiments du plan dont on peut lire les murs : un contour, une cle. */
const batimentsAMurs = (objets: readonly ObjetAMurs[]) =>
  objets.filter((o): o is ObjetAMurs & { key: string; pts: PtBrut[] } => estOuvrage(o, BATIMENT) && !!o.key && Array.isArray(o.pts) && o.pts.length >= 3);
/** Les limites de parcelle, ou se tiennent les clotures et les haies. */
export const limitesDesParcelles = (objets: readonly ObjetAMurs[]): Obstacle[] =>
  objets.filter((o) => (o.key === 'parcelle' || estOuvrage(o, TERRAIN)) && Array.isArray(o.pts) && o.pts.length >= 3).map((o) => obstacle(o.pts as PtBrut[]));
const egoutDe = (o: ObjetAMurs) => (o.elevation && o.elevation > 1 ? o.elevation : 3);

/**
 * Lit la couleur des murs des batiments sur les photos de rue autour du projet. Modifie les objets
 * en place : `couleurMurs.photo` prend la lecture concluante (la plus coherente des murs lus), ou
 * devient null quand toutes les photos ont ete lues sans conclure ; la source choisie reste.
 */
export async function couleursMursDepuisPhotos(objets: readonly ObjetAMurs[], proj: ProjecteurLocal, options: OptionsCouleursMurs = {}): Promise<BilanCouleursMurs> {
  const bilan: BilanCouleursMurs = { photos: 0, ambigus: 0 };
  const maintenant = options.maintenant ?? Date.now;
  const fin = maintenant() + (options.delaiMs ?? DELAI_PHOTOS_MS);
  const parcelle = objets.find((o) => o.key === 'parcelle');
  const batimentsTous = batimentsAMurs(objets);
  if (!batimentsTous.length) return bilan;
  const centre = parcelle?.pts && parcelle.pts.length >= 3 ? centroid(parcelle.pts) : centroid(batimentsTous.flatMap((o) => o.pts));
  const dist = (o: { pts: PtBrut[] }) => { const c = centroid(o.pts); return Math.hypot(c.x - centre.x, c.y - centre.y); };
  const batiments = [...batimentsTous].sort((a, b) => dist(a) - dist(b)).slice(0, options.maxBatiments ?? MAX_BATIMENTS_PHOTOS);
  const rayon = Math.min(RAYON_MAX_M, Math.max(...batiments.map(dist)) + DISTANCE_MUR_MAX_M);
  const g = proj.versDegres(centre.x, centre.y);
  let photos: PhotoRue[];
  try { photos = await (options.chercher ?? ((la, lo, r) => chercherPhotosRue(la, lo, r, undefined, LIMITE_RECHERCHE)))(g.lat, g.lon, rayon); } catch { return bilan; }
  if (!photos.length) return bilan;
  const vues: VueRue[] = photos.map((photo) => ({ photo, ...proj.versMetres(photo.lon, photo.lat) }));
  const murs = mursVisibles(batiments.map((o) => ({ key: o.key, pts: o.pts, egout: egoutDe(o) })), vues, batimentsTous.map((o) => obstacle(o.pts)));
  const { lectures, tentes, lus } = await lireLesMurs(murs, limitesDesParcelles(objets), options.charger ?? chargerPixels, fin, maintenant);
  for (const o of batiments) {
    const l = lectures.get(o.key);
    if (l) {
      champsBatiment(o).couleurMurs = { ...(o.batiment?.couleurMurs ?? {}), photo: photoMur(l) };
      toucher(o);
      bilan.photos++;
    } else if ((tentes.get(o.key) ?? 0) > 0 && lus.get(o.key) === tentes.get(o.key)) {
      // Toutes ses photos lues, aucune concluante : la photo ne dit rien, le materiau reprend la main.
      champsBatiment(o).couleurMurs = { ...(o.batiment?.couleurMurs ?? {}), photo: null };
      toucher(o);
      bilan.ambigus++;
    }
  }
  return bilan;
}

/**
 * La lecture d'une zone du voisinage en tache de fond (app/toits/mursFond.ts) : ou en est chaque batiment
 * demande. `photo` : lue ; `rien` : aucune photo ne montre ses murs, ou toutes ont ete lues sans
 * conclure (il ne sera pas relu) ; `echec` : une photo n'a pas pu se telecharger (il le sera).
 */
export type IssueMurs = { cle: string; photo: PhotoMur } | { cle: string; photo: null } | { cle: string; echec: true };

/** Le cote d'une zone : ses photos se cherchent d'un coup, a moins de DISTANCE_MUR_MAX_M de ses bords. */
export const COTE_ZONE_MURS_M = 80;
/** Les photos demandees pour une zone : une rue photographiee tous les trois metres en donne quelques centaines. */
const LIMITE_RECHERCHE_ZONE = 1000;

/**
 * Lit les murs des batiments `cibles` sur les photos de rue qui les entourent, sans limite de distance
 * au projet : la recherche se fait autour d'eux. `obstacles` : tous les batiments qui peuvent cacher
 * un mur (ceux de la zone et ses abords). Ne modifie rien : rend l'issue de chaque cible ; un service
 * de recherche muet fait echouer la zone entiere.
 */
export async function couleursMursDUneZone(cibles: readonly ObjetAMurs[], obstacles: readonly ObjetAMurs[], parcelles: readonly ObjetAMurs[], proj: ProjecteurLocal, options: OptionsCouleursMurs & { enParallele?: number } = {}): Promise<IssueMurs[]> {
  const batiments = batimentsAMurs(cibles);
  if (!batiments.length) return [];
  const pts = batiments.flatMap((o) => o.pts);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const centre = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const rayon = Math.hypot(x1 - x0, y1 - y0) / 2 + DISTANCE_MUR_MAX_M;
  const g = proj.versDegres(centre.x, centre.y);
  let photos: PhotoRue[];
  try { photos = await (options.chercher ?? ((la, lo, r) => chercherPhotosRue(la, lo, r, undefined, LIMITE_RECHERCHE_ZONE)))(g.lat, g.lon, rayon); }
  catch { return batiments.map((o) => ({ cle: o.key, echec: true as const })); }
  const vues: VueRue[] = photos.map((photo) => ({ photo, ...proj.versMetres(photo.lon, photo.lat) }));
  const murs = mursVisibles(batiments.map((o) => ({ key: o.key, pts: o.pts, egout: egoutDe(o) })), vues, batimentsAMurs(obstacles).map((o) => obstacle(o.pts)));
  const { lectures, tentes, lus } = await lireLesMurs(murs, limitesDesParcelles(parcelles), options.charger ?? chargerPixels, Number.POSITIVE_INFINITY, options.maintenant ?? Date.now, options.enParallele ?? 1);
  return batiments.map((o): IssueMurs => {
    const l = lectures.get(o.key);
    if (l) return { cle: o.key, photo: photoMur(l) };
    return (lus.get(o.key) ?? 0) === (tentes.get(o.key) ?? 0) ? { cle: o.key, photo: null } : { cle: o.key, echec: true };
  });
}
