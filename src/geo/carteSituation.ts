// La carte qui situe le terrain dans la commune, pour la piece DP1 d'une declaration prealable (geo/).
//
// Une image du Plan IGN, demandee au service WMS raster de la Geoplateforme, centree sur la
// parcelle : environ 1/10 000 sur une page A4 a l'italienne, de quoi reconnaitre les rues et le
// quartier. Le service est public et sans cle ; s'il ne repond pas, la piece DP1 se contente de
// l'extrait cadastral.

export const URL_WMS_IGN = 'https://data.geopf.fr/wms-r';

/** L'adresse de la carte : `largeurM` metres de large autour du point, `px` pixels de large. */
export function urlCarteSituation(lat: number, lon: number, largeurM = 2400, px = 1600): string {
  const hauteurM = largeurM * 0.66;
  const dLat = hauteurM / 2 / 111320, dLon = largeurM / 2 / (111320 * Math.cos(lat * Math.PI / 180));
  const p = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', STYLES: '',
    CRS: 'EPSG:4326', BBOX: [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map(v => v.toFixed(6)).join(','),
    WIDTH: String(px), HEIGHT: String(Math.round(px * 0.66)), FORMAT: 'image/png'
  });
  return URL_WMS_IGN + '?' + p.toString();
}

/** La carte en PNG, ou `null` si le service ne repond pas (hors ligne, panne, delai de 10 s). */
export async function carteSituation(lat: number, lon: number, rechercher: typeof fetch = fetch): Promise<Uint8Array | null> {
  try {
    const r = await rechercher(urlCarteSituation(lat, lon), { signal: AbortSignal.timeout(10000) });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('png')) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}
