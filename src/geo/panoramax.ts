// Les photos de rue de Panoramax (MD/spec-releve-facade.md §4.3) : la couleur des murs vus de la rue (render/couleurMurPhoto.ts) et
// les cas candidats des toits (app/toits/candidatsPanoramax.ts).
//
// Panoramax est le commun des photos de rue libres (OpenStreetMap France, IGN) : son API STAC rend,
// dans une emprise, les photos avec leur position, le cap de la vue (`view:azimuth`) et le champ de
// l'objectif (40 a 120 degres pour une photo plate, 360 pour un panoramique). Le releve d'une facade
// sur une photo de rue est parti avec la capture du releve (lot F6) : les photos d'une facade se
// prennent dans l'audit de la parcelle.
//
// Les hotes autorises sont ceux de la politique de securite livree (deploy/htaccess.template) :
// une photo servie ailleurs ne pourrait pas etre chargee, elle n'est pas proposee.

import { projecteurLocal } from './projection.js';
import { fetchJSONReseau } from './apiIgn.js';

export const PANORAMAX_RECHERCHE_URL = 'https://api.panoramax.xyz/api/search';
/** Les serveurs que l'API cite pour les images, et que la page a le droit d'atteindre (CSP : connect-src et img-src). */
export const HOTES_PANORAMAX = ['https://api.panoramax.xyz', 'https://panoramax.openstreetmap.fr', 'https://panoramax.ign.fr'];
/** Ou l'instance IGN redirige ses images (un stockage S3) : la CSP doit le permettre aussi, la redirection s'y heurte sinon. */
export const HOTES_REDIRECTION_PANORAMAX = ['https://panoramax-storage-public-fast.s3.gra.perf.cloud.ovh.net'];
/** Rayon de recherche autour du milieu du mur. */
export const RAYON_RECHERCHE_M = 80;
/** Sous ce champ, une photo plate ; a partir de la, un panoramique equirectangulaire. */
const CHAMP_PANORAMIQUE = 300;

export interface PhotoRue {
  id: string;
  lat: number;
  lon: number;
  /** Cap de la vue (0 = nord, 90 = est), ou null quand la photo ne le dit pas. */
  azimut: number | null;
  /** Champ horizontal de l'objectif, en degres (360 pour un panoramique). */
  champ: number;
  panoramique: boolean;
  /** Dimensions de l'image en pixels, quand le serveur les donne. */
  largeurPx: number | null;
  hauteurPx: number | null;
  /** L'image pleine definition, sa version reduite (assez pour lire une couleur de mur), et la vignette. */
  hd: string;
  sd?: string | null;
  vignette: string | null;
  /** Date de la prise de vue (ISO), auteur et licence : a dire, la photo n'est pas la notre. */
  date: string | null;
  auteur: string | null;
  licence: string | null;
}

interface AssetStac { href?: string }
interface FeatureStac {
  id?: string;
  geometry?: { type?: string; coordinates?: [number, number] };
  properties?: Record<string, unknown>;
  assets?: Record<string, AssetStac>;
}

function hoteAutorise(url: string): boolean {
  return HOTES_PANORAMAX.some((h) => url.startsWith(h + '/'));
}

/** Les photos d'une reponse de recherche ; celles sans position, sans image ou servies hors des hotes permis sont ecartees. */
export function lirePhotosRue(json: unknown): PhotoRue[] {
  const feats = ((json as { features?: unknown })?.features ?? []) as FeatureStac[];
  const res: PhotoRue[] = [];
  for (const f of feats) {
    const c = f.geometry?.coordinates;
    const hd = f.assets?.hd?.href ?? f.assets?.sd?.href;
    if (!f.id || !c || typeof c[0] !== 'number' || typeof c[1] !== 'number' || !hd || !hoteAutorise(hd)) continue;
    const p = f.properties ?? {};
    const orient = (p['pers:interior_orientation'] ?? {}) as { field_of_view?: unknown; sensor_array_dimensions?: unknown };
    const champ = typeof orient.field_of_view === 'number' && orient.field_of_view > 0 ? orient.field_of_view : 70;
    const dims = Array.isArray(orient.sensor_array_dimensions) ? (orient.sensor_array_dimensions as unknown[]) : [];
    const az = p['view:azimuth'];
    const vignette = f.assets?.thumb?.href ?? f.assets?.sd?.href ?? null;
    const sd = f.assets?.sd?.href ?? null;
    res.push({
      id: f.id,
      lon: c[0],
      lat: c[1],
      azimut: typeof az === 'number' ? ((az % 360) + 360) % 360 : null,
      champ,
      panoramique: champ >= CHAMP_PANORAMIQUE,
      largeurPx: typeof dims[0] === 'number' ? dims[0] : null,
      hauteurPx: typeof dims[1] === 'number' ? dims[1] : null,
      hd,
      sd: sd && hoteAutorise(sd) ? sd : null,
      vignette: vignette && hoteAutorise(vignette) ? vignette : null,
      date: typeof p['datetime'] === 'string' ? p['datetime'] : null,
      auteur: typeof p['geovisio:producer'] === 'string' ? p['geovisio:producer'] : null,
      licence: typeof p['license'] === 'string' ? p['license'] : null,
    });
  }
  return res;
}

/** L'URL de recherche : une emprise carree de `rayonM` autour du point. */
export function urlRechercheRue(lat: number, lon: number, rayonM = RAYON_RECHERCHE_M, limite = 100): string {
  const proj = projecteurLocal(lat, lon);
  const a = proj.versDegres(-rayonM, -rayonM), b = proj.versDegres(rayonM, rayonM);
  const bbox = [a.lon, a.lat, b.lon, b.lat].map((v) => v.toFixed(6)).join(',');
  return PANORAMAX_RECHERCHE_URL + '?bbox=' + bbox + '&limit=' + limite;
}

export async function chercherPhotosRue(lat: number, lon: number, rayonM = RAYON_RECHERCHE_M, lire: (url: string) => Promise<unknown> = fetchJSONReseau, limite = 100): Promise<PhotoRue[]> {
  return lirePhotosRue(await lire(urlRechercheRue(lat, lon, rayonM, limite)));
}

/** L'ecart angulaire signe le plus court, de `a` vers `b`, dans ]-180, 180]. */
export function ecartAngulaire(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d <= -180) d += 360;
  if (d > 180) d -= 360;
  return d;
}

/** Cap (0 = nord, 90 = est) du point A vers le point B. */
export function capVers(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const v = projecteurLocal(aLat, aLon).versMetres(bLon, bLat);
  return ((Math.atan2(v.x, v.y) * 180) / Math.PI + 360) % 360;
}
