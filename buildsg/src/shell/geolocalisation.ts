// La position de l'appareil, par l'API de geolocalisation du navigateur.
//
// Elle sert a l'import depuis une adresse : sur le terrain, telephone en main, la parcelle est
// celle sous les pieds. Le navigateur demande la permission ; un refus, une absence de GPS ou un
// delai depasse rendent une erreur qui dit laquelle, pour que l'appelant choisisse s'il le dit.
// Sur le serveur, l'en-tete `Permissions-Policy` doit autoriser `geolocation=(self)`.

/** Une position lue : en degres WGS84, et sa precision annoncee, en metres. */
export interface PositionGps {
  lat: number;
  lon: number;
  precisionM: number;
}

export type RaisonSansPosition = 'refusee' | 'indisponible' | 'delai';

/** L'erreur d'une lecture sans position, avec sa raison. */
export class SansPosition extends Error {
  constructor(public raison: RaisonSansPosition) {
    super(raison === 'refusee' ? 'position refusee' : raison === 'delai' ? 'position trop longue a obtenir' : 'position indisponible');
  }
}

/** Le navigateur sait-il donner une position ? Faux hors contexte securise (http) et dans les tests. */
export function geolocalisationDisponible(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.geolocation && (typeof isSecureContext === 'undefined' || isSecureContext);
}

/** La position de l'appareil, au plus precis, en `delaiMs` au plus ; une position d'il y a une minute suffit. */
export function lirePositionGps(delaiMs = 15000): Promise<PositionGps> {
  if (!geolocalisationDisponible()) return Promise.reject(new SansPosition('indisponible'));
  return new Promise((ok, ko) => {
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude, precisionM: p.coords.accuracy }),
      (err) => ko(new SansPosition(err.code === err.PERMISSION_DENIED ? 'refusee' : err.code === err.TIMEOUT ? 'delai' : 'indisponible')),
      { enableHighAccuracy: true, timeout: delaiMs, maximumAge: 60000 },
    );
  });
}

/**
 * Suit la position de l'appareil : `sur` est appele a chaque nouvelle position que le navigateur
 * donne (environ une par seconde quand on marche), `erreur` sur un refus ou une absence de GPS. Rend
 * de quoi arreter le suivi. Une position vieille de deux secondes suffit : elle evite de reveiller le
 * GPS plus souvent que ce que l'ecran montre.
 */
export function suivrePositionGps(sur: (p: PositionGps) => void, erreur: (e: SansPosition) => void): () => void {
  if (!geolocalisationDisponible()) { erreur(new SansPosition('indisponible')); return () => {}; }
  const id = navigator.geolocation.watchPosition(
    (p) => sur({ lat: p.coords.latitude, lon: p.coords.longitude, precisionM: p.coords.accuracy }),
    (err) => erreur(new SansPosition(err.code === err.PERMISSION_DENIED ? 'refusee' : err.code === err.TIMEOUT ? 'delai' : 'indisponible')),
    { enableHighAccuracy: true, maximumAge: 2000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
