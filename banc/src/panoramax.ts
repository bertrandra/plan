// L'import par lot depuis Panoramax (etape 1b) : une adresse, un rayon, et les photos de rue prises autour, tournees vers elle.
// Panoramax est le commun des photos de rue libres (OpenStreetMap France, IGN) : son API STAC rend, dans une emprise, chaque photo
// avec sa position, son cap (`view:azimuth`) et le champ de son objectif (360 pour un panoramique).

export const GEOCODAGE_URL = 'https://data.geopf.fr/geocodage/search';
/** Le repli quand la Geoplateforme ne repond pas : l'ancienne API Adresse (meme format de reponse). */
export const GEOCODAGE_REPLI_URL = 'https://api-adresse.data.gouv.fr/search/';
export const RECHERCHE_URL = 'https://api.panoramax.xyz/api/search';
/** Les serveurs d'images que la page peut lire (banc/public/.htaccess) : une photo servie ailleurs n'est pas proposee. */
export const HOTES = ['https://api.panoramax.xyz', 'https://panoramax.openstreetmap.fr', 'https://panoramax.ign.fr'];

export interface Adresse { libelle: string; lat: number; lon: number }

export interface PhotoRue {
  id: string;
  collection: string | null;
  lat: number;
  lon: number;
  azimut: number | null;
  champ: number;
  panoramique: boolean;
  hd: string;
  vignette: string | null;
  date: string | null;
  auteur: string | null;
  licence: string | null;
  /** Calcules pour l'adresse cherchee : la distance, le cap de la photo vers l'adresse, et si l'adresse est dans le champ. */
  distance: number;
  cap: number;
  vise: boolean;
}

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** La distance entre deux points, en metres (haversine). */
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Le cap de `a` vers `b`, en degres depuis le nord, de 0 a 360. */
export function capVers(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (((Math.atan2(y, x) * 180) / Math.PI) % 360 + 360) % 360;
}

/** L'ecart signe le plus court de `a` vers `b`, dans ]-180, 180]. */
export function ecartAngle(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d <= -180) d += 360;
  if (d > 180) d -= 360;
  return d;
}

/** L'emprise carree de `rayonM` autour du point, en degres (lon0, lat0, lon1, lat1). */
export function emprise(lat: number, lon: number, rayonM: number): [number, number, number, number] {
  const dLat = (rayonM / R) * (180 / Math.PI), dLon = dLat / Math.cos(rad(lat));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

export function urlRecherche(lat: number, lon: number, rayonM: number, limite = 200): string {
  return RECHERCHE_URL + '?bbox=' + emprise(lat, lon, rayonM).map((v) => v.toFixed(6)).join(',') + '&limit=' + limite;
}

/** La premiere adresse que le geocodage de la Geoplateforme rend ; null sans resultat. */
export function lireAdresse(json: unknown): Adresse | null {
  const f = ((json as { features?: unknown[] })?.features ?? [])[0] as { geometry?: { coordinates?: number[] }; properties?: { label?: string } } | undefined;
  const c = f?.geometry?.coordinates;
  return c && typeof c[0] === 'number' && typeof c[1] === 'number' ? { libelle: f?.properties?.label ?? '', lon: c[0], lat: c[1] } : null;
}

/** Des coordonnees tapees a la place d'une adresse : « 48.8957, 2.1456 » (latitude, longitude, en degres) ; null sinon. */
export function coordonneesTapees(texte: string): Adresse | null {
  const m = /^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[;,\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/.exec(texte.replace(/,(\d)/g, '.$1').replace(/\.(\d+)\s*\.\s*/, '.$1, '));
  if (!m) return null;
  const lat = Number((m[1] ?? '').replace(',', '.')), lon = Number((m[2] ?? '').replace(',', '.'));
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { libelle: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat, lon } : null;
}

/** L'adresse : des coordonnees tapees, sinon le geocodage de la Geoplateforme, sinon son repli. */
export async function trouverAdresse(texte: string, lire: (url: string) => Promise<unknown>): Promise<Adresse | null> {
  const c = coordonneesTapees(texte);
  if (c) return c;
  const q = new URLSearchParams({ q: texte, limit: '1' }).toString();
  try { return lireAdresse(await lire(GEOCODAGE_URL + '?' + q)); } catch { return lireAdresse(await lire(GEOCODAGE_REPLI_URL + '?' + q)); }
}

const autorise = (url: unknown): url is string => typeof url === 'string' && HOTES.some((h) => url.startsWith(h + '/'));

/**
 * Les photos d'une reponse de recherche, rapportees a l'adresse : dans le rayon, les plus proches d'abord. `vise` : l'adresse est dans
 * le champ de la photo (un panoramique la voit toujours ; une photo plate, a moins de la moitie de son champ, plus 10 degres).
 */
export function lirePhotos(json: unknown, cible: { lat: number; lon: number }, rayonM: number): PhotoRue[] {
  const feats = ((json as { features?: unknown[] })?.features ?? []) as { id?: string; collection?: string; geometry?: { coordinates?: number[] }; properties?: Record<string, unknown>; assets?: Record<string, { href?: string }> }[];
  const out: PhotoRue[] = [];
  for (const f of feats) {
    const c = f.geometry?.coordinates;
    const hd = f.assets?.hd?.href ?? f.assets?.sd?.href;
    if (!f.id || !c || typeof c[0] !== 'number' || typeof c[1] !== 'number' || !autorise(hd)) continue;
    const p = f.properties ?? {};
    const orient = (p['pers:interior_orientation'] ?? {}) as { field_of_view?: unknown };
    const champ = typeof orient.field_of_view === 'number' && orient.field_of_view > 0 ? orient.field_of_view : 70;
    const az = typeof p['view:azimuth'] === 'number' ? ((p['view:azimuth'] % 360) + 360) % 360 : null;
    const pos = { lat: c[1], lon: c[0] };
    const distance = distanceM(pos, cible);
    if (distance > rayonM) continue;
    const cap = capVers(pos, cible);
    const panoramique = champ >= 300;
    const vise = panoramique || (az !== null && Math.abs(ecartAngle(az, cap)) <= champ / 2 + 10);
    const vignette = f.assets?.thumb?.href ?? null;
    out.push({
      id: f.id, collection: f.collection ?? null, lat: pos.lat, lon: pos.lon, azimut: az, champ, panoramique, hd,
      vignette: autorise(vignette) ? vignette : null,
      date: typeof p['datetime'] === 'string' ? p['datetime'] : null,
      auteur: typeof p['geovisio:producer'] === 'string' ? p['geovisio:producer'] : null,
      licence: typeof p['license'] === 'string' ? p['license'] : null,
      distance: Math.round(distance * 10) / 10, cap: Math.round(cap * 10) / 10, vise,
    });
  }
  return out.sort((a, b) => a.distance - b.distance);
}

/**
 * Ce qu'on tire d'un panoramique (demande du proprietaire, 12 novembre 2026) : les facades sont de part et d'autre de la rue, a 90 degres
 * du sens de la prise de vue (`view:azimuth`, le cap de l'appareil, qui roule dans la rue). « cotes » : une vue de chaque cote, pour
 * trouver les batiments ; « cote-adresse » : le seul cote ou est l'adresse ; « adresse » : la vue tournee droit vers l'adresse. Une photo
 * plate se garde telle quelle.
 */
export type Visee = 'cotes' | 'cote-adresse' | 'adresse';
export interface VueAExtraire { vue: 'gauche' | 'droite' | 'adresse' | 'photo'; cap: number }

export function vuesAExtraire(p: Pick<PhotoRue, 'panoramique' | 'azimut' | 'cap'>, visee: Visee): VueAExtraire[] {
  if (!p.panoramique) return [{ vue: 'photo', cap: p.azimut ?? p.cap }];
  // Sans cap de prise de vue, le sens de la rue n'est pas connu : la vue vers l'adresse.
  if (visee === 'adresse' || p.azimut === null) return [{ vue: 'adresse', cap: p.cap }];
  const norm = (a: number) => ((a % 360) + 360) % 360;
  const gauche: VueAExtraire = { vue: 'gauche', cap: norm(p.azimut - 90) }, droite: VueAExtraire = { vue: 'droite', cap: norm(p.azimut + 90) };
  if (visee === 'cotes') return [gauche, droite];
  return [Math.abs(ecartAngle(gauche.cap, p.cap)) <= Math.abs(ecartAngle(droite.cap, p.cap)) ? gauche : droite];
}
