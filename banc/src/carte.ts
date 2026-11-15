// La carte de l'import Panoramax (etape 1b), sans DOM : la projection des tuiles de la Geoplateforme (Web Mercator, la pyramide « PM »),
// la vue (un centre et un zoom), ses tuiles, ses gestes (molette, glisser, pincement) et le dessin des secteurs de vue. Les fonds viennent
// du WMTS de l'IGN, sans cle. Testable seul (banc/tests/carte.test.ts).

import type { Ll } from './parcelles.js';

export interface P { x: number; y: number }
export interface Taille { l: number; h: number }
/** La vue : le point au milieu de la carte et le zoom (celui des tuiles, fractionnaire : les tuiles s'etirent entre deux niveaux). */
export interface VueCarte { lat: number; lon: number; zoom: number }
/** Une emprise en degres. */
export interface Emprise { sud: number; ouest: number; nord: number; est: number }
export interface Tuile { z: number; x: number; y: number; gauche: number; haut: number; cote: number }
export type Fond = 'plan' | 'photo' | 'aucun';

export const COTE_TUILE = 256;
/** Du quartier (13) a la facade (21) ; au-dela de 19 les tuiles de l'IGN n'existent plus, on etire celles de 19. */
export const ZOOM_MIN = 13, ZOOM_MAX = 21, ZOOM_TUILES_MAX = 19;
/** Le niveau ou se rangent les coordonnees « locales » (des pixels autour d'une origine : de petits nombres, que le SVG garde exacts). */
export const ZOOM_LOCAL = 20;
export const WMTS_URL = 'https://data.geopf.fr/wmts';
const EQUATEUR_M = 40075016.686;

const rad = (d: number) => (d * Math.PI) / 180;
const borne = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Le point dans le carre du monde (0 a 1, l'ouest et le nord a 0). */
export function versMonde(p: Ll): P {
  const s = Math.sin(rad(borne(p.lat, -85.0511, 85.0511)));
  return { x: (p.lon + 180) / 360, y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) };
}

export function duMonde(m: P): Ll {
  return { lon: m.x * 360 - 180, lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * m.y))) * 180) / Math.PI };
}

/** Le nombre de pixels du carre du monde a ce zoom. */
export const pixelsDuMonde = (zoom: number): number => COTE_TUILE * 2 ** zoom;

/** Les metres d'un pixel de l'ecran, a cette latitude et ce zoom. */
export const metresParPixel = (lat: number, zoom: number): number => (EQUATEUR_M * Math.cos(rad(lat))) / pixelsDuMonde(zoom);

/** Un point en pixels de l'ecran (l'origine en haut a gauche de la carte). */
export function versEcran(p: Ll, v: VueCarte, t: Taille): P {
  const m = versMonde(p), c = versMonde(v), k = pixelsDuMonde(v.zoom);
  return { x: t.l / 2 + (m.x - c.x) * k, y: t.h / 2 + (m.y - c.y) * k };
}

/** Le point du terrain sous un pixel de l'ecran. */
export function duEcran(e: P, v: VueCarte, t: Taille): Ll {
  const c = versMonde(v), k = pixelsDuMonde(v.zoom);
  return duMonde({ x: c.x + (e.x - t.l / 2) / k, y: c.y + (e.y - t.h / 2) / k });
}

/** Un point en pixels du niveau ZOOM_LOCAL autour d'une origine : ce que le SVG dessine une fois, puis deplace et met a l'echelle. */
export function versLocal(p: Ll, origine: Ll): P {
  const m = versMonde(p), o = versMonde(origine), k = pixelsDuMonde(ZOOM_LOCAL);
  return { x: (m.x - o.x) * k, y: (m.y - o.y) * k };
}

/** La transformation qui pose le dessin local a l'ecran : `ecran = local * k + (dx, dy)`. */
export function placementLocal(origine: Ll, v: VueCarte, t: Taille): { k: number; dx: number; dy: number } {
  const o = versEcran(origine, v, t);
  return { k: 2 ** (v.zoom - ZOOM_LOCAL), dx: o.x, dy: o.y };
}

/** Des metres du terrain en unites locales, a cette latitude (pour le halo du rayon de recherche). */
export const metresEnLocal = (metres: number, lat: number): number => metres / metresParPixel(lat, ZOOM_LOCAL);

export const bornerZoom = (z: number): number => borne(z, ZOOM_MIN, ZOOM_MAX);

/** Le zoom ou un cercle de `rayonM` autour du centre tient dans la carte, avec une marge (10 % par defaut). */
export function zoomPourRayon(lat: number, rayonM: number, t: Taille, marge = 1.1): number {
  const demi = Math.max(1, Math.min(t.l, t.h) / 2);
  return bornerZoom(Math.log2((EQUATEUR_M * Math.cos(rad(lat)) * demi) / (COTE_TUILE * Math.max(1, rayonM) * marge)));
}

/** Zoome de `dz` niveaux en gardant sous `ancre` (pixels de l'ecran) le meme point du terrain : la molette, les boutons. */
export function zoomerAutour(v: VueCarte, ancre: P, t: Taille, dz: number): VueCarte {
  const zoom = bornerZoom(v.zoom + dz);
  const sous = versMonde(duEcran(ancre, v, t)), k = pixelsDuMonde(zoom);
  return { ...duMonde({ x: sous.x - (ancre.x - t.l / 2) / k, y: sous.y - (ancre.y - t.h / 2) / k }), zoom };
}

/** La vue deplacee de (dx, dy) pixels : le terrain suit le doigt. */
export function glisser(v: VueCarte, dx: number, dy: number): VueCarte {
  const c = versMonde(v), k = pixelsDuMonde(v.zoom);
  return { ...duMonde({ x: c.x - dx / k, y: borne(c.y - dy / k, 0, 1) }), zoom: v.zoom };
}

/**
 * Le pincement : les doigts partis de `milieu0` a `ecart0` sont en `milieu` a `ecart`. Le point du terrain qui etait sous les doigts y
 * reste, ce qui deplace aussi la carte quand ils glissent ensemble.
 */
export function pincer(v0: VueCarte, t: Taille, milieu0: P, ecart0: number, milieu: P, ecart: number): VueCarte {
  const zoom = bornerZoom(v0.zoom + Math.log2(Math.max(1, ecart) / Math.max(1, ecart0)));
  const sous = versMonde(duEcran(milieu0, v0, t)), k = pixelsDuMonde(zoom);
  return { ...duMonde({ x: sous.x - (milieu.x - t.l / 2) / k, y: sous.y - (milieu.y - t.h / 2) / k }), zoom };
}

/** Ce que la carte montre, en degres. */
export function empriseVue(v: VueCarte, t: Taille): Emprise {
  const a = duEcran({ x: 0, y: 0 }, v, t), b = duEcran({ x: t.l, y: t.h }, v, t);
  return { sud: b.lat, ouest: a.lon, nord: a.lat, est: b.lon };
}

/** L'emprise carree de `rayonM` autour d'un point. */
export function empriseAutour(p: Ll, rayonM: number): Emprise {
  const dLat = (rayonM / EQUATEUR_M) * 360, dLon = dLat / Math.cos(rad(p.lat));
  return { sud: p.lat - dLat, ouest: p.lon - dLon, nord: p.lat + dLat, est: p.lon + dLon };
}

/** `a` contient-elle `b` en entier ? */
export const contient = (a: Emprise, b: Emprise): boolean => a.sud <= b.sud && a.ouest <= b.ouest && a.nord >= b.nord && a.est >= b.est;

/** L'emprise agrandie d'une part de sa taille de chaque cote (0.25 : un quart) : on lit un peu plus que l'ecran, pour ne pas relire a chaque geste. */
export function elargir(e: Emprise, part: number): Emprise {
  const dLat = (e.nord - e.sud) * part, dLon = (e.est - e.ouest) * part;
  return { sud: e.sud - dLat, ouest: e.ouest - dLon, nord: e.nord + dLat, est: e.est + dLon };
}

/** La largeur d'une emprise, en metres (a sa latitude moyenne). */
export const largeurM = (e: Emprise): number => ((e.est - e.ouest) / 360) * EQUATEUR_M * Math.cos(rad((e.sud + e.nord) / 2));

/**
 * Les tuiles qui couvrent la carte : celles du niveau entier le plus proche du zoom (19 au plus), etirees a la taille que le zoom leur
 * donne, placees en pixels de l'ecran. Au niveau le plus proche plutot qu'au-dessus : les noms de rues gardent une taille lisible.
 */
export function tuiles(v: VueCarte, t: Taille): Tuile[] {
  const z = borne(Math.round(v.zoom), 0, ZOOM_TUILES_MAX), n = 2 ** z, cote = COTE_TUILE * 2 ** (v.zoom - z);
  const c = versMonde(v), cx = c.x * n * cote, cy = c.y * n * cote;
  const x0 = Math.floor((cx - t.l / 2) / cote), x1 = Math.floor((cx + t.l / 2) / cote);
  const y0 = Math.max(0, Math.floor((cy - t.h / 2) / cote)), y1 = Math.min(n - 1, Math.floor((cy + t.h / 2) / cote));
  const out: Tuile[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ z, x: ((x % n) + n) % n, y, gauche: x * cote - cx + t.l / 2, haut: y * cote - cy + t.h / 2, cote });
  return out;
}

const COUCHES: Record<Exclude<Fond, 'aucun'>, { couche: string; format: string }> = {
  plan: { couche: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', format: 'image/png' },
  photo: { couche: 'ORTHOIMAGERY.ORTHOPHOTOS', format: 'image/jpeg' },
};

/** L'adresse d'une tuile du WMTS de la Geoplateforme (Plan IGN v2 ou photo aerienne, sans cle). */
export function urlTuile(fond: Exclude<Fond, 'aucun'>, z: number, x: number, y: number): string {
  const c = COUCHES[fond];
  return WMTS_URL + '?' + new URLSearchParams({ SERVICE: 'WMTS', REQUEST: 'GetTile', VERSION: '1.0.0', LAYER: c.couche, STYLE: 'normal', FORMAT: c.format, TILEMATRIXSET: 'PM', TILEMATRIX: String(z), TILEROW: String(y), TILECOL: String(x) }).toString();
}

/**
 * Le secteur que regarde une vue, en chemin SVG : de `centre`, ouvert de `champ` degres autour du `cap` (depuis le nord, dans le sens des
 * aiguilles), long de `r` pixels. Le nord est en haut de la carte.
 */
export function secteur(centre: P, cap: number, champ: number, r: number): string {
  const ouverture = borne(champ, 1, 359);
  const pt = (a: number) => `${(centre.x + r * Math.sin(rad(a))).toFixed(1)} ${(centre.y - r * Math.cos(rad(a))).toFixed(1)}`;
  return `M${centre.x.toFixed(1)} ${centre.y.toFixed(1)}L${pt(cap - ouverture / 2)}A${r} ${r} 0 ${ouverture > 180 ? 1 : 0} 1 ${pt(cap + ouverture / 2)}Z`;
}

/** La barre d'echelle : la plus grande longueur ronde (1, 2 ou 5 fois une puissance de dix) qui tient dans `largeurMax` pixels. */
export function barreEchelle(mParPx: number, largeurMax = 110): { metres: number; px: number } {
  const max = mParPx * largeurMax, p = 10 ** Math.floor(Math.log10(Math.max(1e-9, max)));
  const metres = [5, 2, 1].map((k) => k * p).find((m) => m <= max) ?? p;
  return { metres, px: metres / mParPx };
}

/** Le texte d'une longueur de la barre d'echelle. */
export const texteEchelle = (metres: number): string => (metres >= 1000 ? `${metres / 1000} km` : `${metres} m`);
