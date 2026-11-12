// Les parcelles du cadastre autour d'une adresse (demande du proprietaire, 12 novembre 2026), lues dans le Parcellaire Express de l'IGN
// par le WFS de la Geoplateforme : la parcelle de l'adresse, et ce qu'une photo de rue en voit (sa distance, l'angle qu'elle occupe).
// API Carto (apicarto.ign.fr) ne repondait plus (404, 12 novembre 2026) : le WFS donne les memes parcelles. Sans DOM, testable seul.

import { capVers, ecartAngle } from './panoramax.js';

export const WFS_URL = 'https://data.geopf.fr/wfs/ows';
const COUCHE = 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle';

export interface Ll { lat: number; lon: number }

export interface Parcelle {
  idu: string;
  section: string;
  numero: string;
  commune: string;
  /** Surface cadastrale, en metres carres. */
  contenance: number | null;
  /** Le contour exterieur (le premier polygone), en degres. */
  contour: Ll[];
}

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** L'emprise de `rayonM` autour d'un point, pour le WFS (EPSG:4326 : latitude d'abord). */
export function urlParcelles(lat: number, lon: number, rayonM: number, limite = 200): string {
  const dLat = (rayonM / R) * (180 / Math.PI), dLon = dLat / Math.cos(rad(lat));
  const bbox = [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((v) => v.toFixed(6)).join(',') + ',urn:ogc:def:crs:EPSG::4326';
  return WFS_URL + '?' + new URLSearchParams({ SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: COUCHE, OUTPUTFORMAT: 'application/json', COUNT: String(limite), BBOX: bbox }).toString();
}

/** Les parcelles d'une reponse du WFS (GeoJSON, coordonnees lon, lat) ; celles sans contour sont laissees. */
export function lireParcelles(json: unknown): Parcelle[] {
  const feats = ((json as { features?: unknown[] })?.features ?? []) as { properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } }[];
  const out: Parcelle[] = [];
  for (const f of feats) {
    const g = f.geometry, p = f.properties ?? {};
    const anneau = (g?.type === 'MultiPolygon' ? (g.coordinates as number[][][][])?.[0]?.[0] : g?.type === 'Polygon' ? (g.coordinates as number[][][])?.[0] : null) ?? [];
    const contour = anneau.filter((c) => typeof c[0] === 'number' && typeof c[1] === 'number').map((c) => ({ lon: c[0] as number, lat: c[1] as number }));
    if (contour.length < 3 || typeof p.idu !== 'string') continue;
    out.push({ idu: p.idu, section: String(p.section ?? ''), numero: String(p.numero ?? ''), commune: String(p.nom_com ?? ''), contenance: typeof p.contenance === 'number' ? p.contenance : null, contour });
  }
  return out;
}

/** Le contour en metres autour d'une origine (projection locale, suffisante a l'echelle d'une rue). */
export function enMetres(points: readonly Ll[], o: Ll): { x: number; y: number }[] {
  const k = Math.cos(rad(o.lat));
  return points.map((p) => ({ x: rad(p.lon - o.lon) * R * k, y: rad(p.lat - o.lat) * R }));
}

/** Le centre d'une parcelle (moyenne de ses sommets, le dernier repetant le premier compte une fois). */
export function centre(p: Pick<Parcelle, 'contour'>): Ll {
  const l = p.contour.length > 3 && p.contour[0]?.lat === p.contour[p.contour.length - 1]?.lat && p.contour[0]?.lon === p.contour[p.contour.length - 1]?.lon ? p.contour.slice(0, -1) : p.contour;
  return { lat: l.reduce((s, q) => s + q.lat, 0) / l.length, lon: l.reduce((s, q) => s + q.lon, 0) / l.length };
}

/** La distance d'un point a une parcelle, en metres : 0 dedans, sinon au plus proche de ses cotes. */
export function distanceAParcelle(pt: Ll, p: Pick<Parcelle, 'contour'>): number {
  const c = enMetres(p.contour, pt);
  let dedans = false, d = Infinity;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const a = c[i] as { x: number; y: number }, b = c[j] as { x: number; y: number };
    if (a.y > 0 !== b.y > 0 && 0 < ((b.x - a.x) * (0 - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
    const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
    const t = l2 ? Math.max(0, Math.min(1, (-a.x * vx - a.y * vy) / l2)) : 0;
    d = Math.min(d, Math.hypot(a.x + t * vx, a.y + t * vy));
  }
  return dedans ? 0 : d;
}

/**
 * La parcelle d'une adresse : celle qui contient le point, sinon la plus proche (le point de la Base Adresse Nationale est souvent devant
 * la porte, sur la voirie, qui n'est pas cadastree).
 */
export function parcelleDuPoint(parcelles: readonly Parcelle[], pt: Ll): Parcelle | null {
  let mieux: { p: Parcelle; d: number } | null = null;
  for (const p of parcelles) { const d = distanceAParcelle(pt, p); if (!mieux || d < mieux.d) mieux = { p, d }; }
  return mieux?.p ?? null;
}

/** L'angle qu'une parcelle occupe vue d'un point : le cap de son milieu et la demi-ouverture (de quoi dire si une photo la voit). */
export function etendueAngulaire(depuis: Ll, p: Pick<Parcelle, 'contour'>): { cap: number; demi: number } {
  const c = centre(p), cap = capVers(depuis, c);
  const demi = Math.max(0, ...p.contour.map((q) => Math.abs(ecartAngle(cap, capVers(depuis, q)))));
  return { cap, demi: Math.min(180, demi) };
}

/** Une photo de champ `champ` tournee vers `azimut` voit-elle la parcelle (leurs angles se recouvrent) ? */
export function voitLaParcelle(depuis: Ll, azimut: number, champ: number, p: Pick<Parcelle, 'contour'>): boolean {
  if (distanceAParcelle(depuis, p) === 0) return true;
  const e = etendueAngulaire(depuis, p);
  return Math.abs(ecartAngle(azimut, e.cap)) <= champ / 2 + e.demi;
}

/**
 * Les photos rapportees a une parcelle plutot qu'au point de l'adresse : leur distance a la parcelle (0 dedans), le cap vers son milieu,
 * et si elles la voient. Celles au-dela du rayon partent ; les plus proches d'abord.
 */
export function rapporterALaParcelle<T extends { lat: number; lon: number; azimut: number | null; champ: number; panoramique: boolean; distance: number; cap: number; vise: boolean }>(photos: readonly T[], p: Parcelle, rayonM: number): T[] {
  const c = centre(p);
  return photos.map((ph) => {
    const pos = { lat: ph.lat, lon: ph.lon };
    const distance = Math.round(distanceAParcelle(pos, p) * 10) / 10;
    return { ...ph, distance, cap: Math.round(capVers(pos, c) * 10) / 10, vise: ph.panoramique || (ph.azimut !== null && voitLaParcelle(pos, ph.azimut, ph.champ, p)) };
  }).filter((ph) => ph.distance <= rayonM).sort((a, b) => a.distance - b.distance);
}
