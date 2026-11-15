// L'import par lot depuis Panoramax (etape 1b) : une adresse, un rayon, et les photos de rue prises autour, tournees vers elle.
// Panoramax est le commun des photos de rue libres (OpenStreetMap France, IGN) : son API STAC rend, dans une emprise, chaque photo
// avec sa position, son cap (`view:azimuth`) et le champ de son objectif (360 pour un panoramique).

import type { CadreDeVue } from './cadrage.js';

export const GEOCODAGE_URL = 'https://data.geopf.fr/geocodage/search';
/** Le repli quand la Geoplateforme ne repond pas : l'ancienne API Adresse (meme format de reponse). */
export const GEOCODAGE_REPLI_URL = 'https://api-adresse.data.gouv.fr/search/';
export const RECHERCHE_URL = 'https://api.panoramax.xyz/api/search';
/**
 * Les serveurs d'images que la page lit en direct (banc/public/.htaccess). Une photo servie ailleurs (une autre instance federee du
 * meta-catalogue) passe par le relais du serveur du banc (`Relais`, api.php) : toute instance marche d'office, sans nouvelle version.
 * Cette liste n'a donc plus a grandir pour qu'une photo se propose ; un hote y gagne seulement d'etre lu sans passer par le serveur.
 * Le dernier est le stockage de l'instance de l'IGN : la recherche du meta-catalogue y renvoie une grande part de ses photos (lien
 * `via` vers panoramax.ign.fr), servies avec `Access-Control-Allow-Origin: *`. Sans lui, des rues entieres de la couverture ne
 * proposaient aucune photo. Les instances tierces du catalogue se decident une par une : panoramax.mapcomplete.org est admise
 * (demande du proprietaire, 15 novembre 2026 ; lien `via` vers elle, images servies avec `Access-Control-Allow-Origin: *`).
 */
export const HOTES = [
  'https://api.panoramax.xyz', 'https://panoramax.openstreetmap.fr', 'https://panoramax.ign.fr',
  'https://panoramax-storage-public-fast.s3.gra.perf.cloud.ovh.net', 'https://panoramax.mapcomplete.org',
];

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
  /** La version reduite (2048 px pour un 360) : de quoi montrer le panoramique entier et choisir ses vues. */
  sd: string | null;
  vignette: string | null;
  date: string | null;
  auteur: string | null;
  licence: string | null;
  /** Ses images viennent d'un hote que la page ne lit pas en direct : elles passent par le relais du serveur du banc. */
  parRelais: boolean;
  /**
   * Le cap dit-il vraiment ou regarde la photo ? Faux quand il n'y a pas de boussole et que l'appareil avancait a peine (`capDouteux`) :
   * le tri des facades ne peut alors rien affirmer d'une photo plate.
   */
  capSur: boolean;
  /** La forme de l'image (largeur sur hauteur) : 4/3 quand le capteur n'est pas dit ; moins de 1 pour une photo en hauteur. */
  forme: number;
  /** La largeur de l'image d'origine en pixels, quand le capteur est dit : de quoi ne pas agrandir un 360 au-dela de ce qu'il contient (cadrage.ts). */
  largeurPx?: number | null;
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

/** La recherche des photos d'une emprise (ce que la carte montre), en degres. */
export function urlRechercheEmprise(e: { sud: number; ouest: number; nord: number; est: number }, limite = 500): string {
  return RECHERCHE_URL + '?bbox=' + [e.ouest, e.sud, e.est, e.nord].map((v) => v.toFixed(6)).join(',') + '&limit=' + limite;
}

/** Les adresses que le geocodage de la Geoplateforme rend, dans son ordre (la plus probable d'abord). */
export function lireAdresses(json: unknown): Adresse[] {
  const feats = ((json as { features?: unknown[] })?.features ?? []) as { geometry?: { coordinates?: number[] }; properties?: { label?: string } }[];
  return feats.flatMap((f) => { const c = f.geometry?.coordinates; return c && typeof c[0] === 'number' && typeof c[1] === 'number' ? [{ libelle: f.properties?.label ?? '', lon: c[0], lat: c[1] }] : []; });
}

/** La premiere adresse que le geocodage rend ; null sans resultat. */
export const lireAdresse = (json: unknown): Adresse | null => lireAdresses(json)[0] ?? null;

/** Des coordonnees tapees a la place d'une adresse : « 48.8957, 2.1456 » (latitude, longitude, en degres) ; null sinon. */
export function coordonneesTapees(texte: string): Adresse | null {
  const m = /^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[;,\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/.exec(texte.replace(/,(\d)/g, '.$1').replace(/\.(\d+)\s*\.\s*/, '.$1, '));
  if (!m) return null;
  const lat = Number((m[1] ?? '').replace(',', '.')), lon = Number((m[2] ?? '').replace(',', '.'));
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { libelle: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat, lon } : null;
}

/** Les adresses proposees : des coordonnees tapees, sinon le geocodage de la Geoplateforme (cinq au plus), sinon son repli. */
export async function trouverAdresses(texte: string, lire: (url: string) => Promise<unknown>, limite = 5): Promise<Adresse[]> {
  const c = coordonneesTapees(texte);
  if (c) return [c];
  const q = new URLSearchParams({ q: texte, limit: String(limite) }).toString();
  try { return lireAdresses(await lire(GEOCODAGE_URL + '?' + q)); } catch { return lireAdresses(await lire(GEOCODAGE_REPLI_URL + '?' + q)); }
}

/** La premiere adresse proposee ; null sans resultat. */
export const trouverAdresse = async (texte: string, lire: (url: string) => Promise<unknown>): Promise<Adresse | null> => (await trouverAdresses(texte, lire))[0] ?? null;

/** En deca de ce pas entre deux photos d'une sequence, le sens de la marche (donc le cap) n'est que le bruit du GPS. */
export const PAS_MIN_CAP_M = 2;

interface PhotoStac { id?: string; collection?: string; geometry?: { coordinates?: number[] }; properties?: Record<string, unknown>; assets?: Record<string, { href?: string }> }

/**
 * Les photos dont le cap est douteux (15 novembre 2026, vu rue de Rivoli : 35 photos d'une camera d'action portee par un pieton arrete a
 * un passage, proposees comme des facades). Sans boussole dans l'EXIF, le serveur tire le cap du deplacement entre deux photos ; quand
 * l'appareil n'a presque pas bouge, ce deplacement est le bruit du GPS et le cap ne dit rien. Une photo seule de sa sequence dans la
 * reponse n'est pas jugee : on ne sait pas.
 */
export function capsDouteux(feats: readonly PhotoStac[]): Set<string> {
  const rangs = new Map<string, { lat: number; lon: number }>();
  const cle = (f: PhotoStac, d = 0) => f.collection + '|' + (Number(f.properties?.['geovisio:rank_in_collection']) + d);
  for (const f of feats) { const c = f.geometry?.coordinates; if (f.collection && c && typeof c[0] === 'number' && typeof c[1] === 'number') rangs.set(cle(f), { lat: c[1], lon: c[0] }); }
  const out = new Set<string>();
  for (const f of feats) {
    const exif = (f.properties?.['exif'] ?? {}) as Record<string, unknown>, moi = rangs.get(cle(f));
    if (!f.id || !moi || exif['Exif.GPSInfo.GPSImgDirection'] != null) continue;
    const voisines = [rangs.get(cle(f, -1)), rangs.get(cle(f, 1))].filter((v): v is { lat: number; lon: number } => !!v);
    if (voisines.length && voisines.every((v) => distanceM(moi, v) < PAS_MIN_CAP_M)) out.add(f.id);
  }
  return out;
}

const autorise = (url: unknown): url is string => typeof url === 'string' && HOTES.some((h) => url.startsWith(h + '/'));

export type TailleRelais = 'hd' | 'sd' | 'vignette';
/**
 * L'adresse du relais pour une photo et une taille (api.ts::relais). Le relais ne recoit jamais une adresse d'image : seulement
 * l'identifiant de la photo, que le serveur redemande lui-meme au meta-catalogue.
 */
export type Relais = (id: string, taille: TailleRelais) => string;
/** Ce que la carte dit quand le relais ne marche pas : ces photos ne se proposent pas, et pourquoi. */
export function avisDuRelais(n: number, raison: string): string {
  const s = n > 1 ? 's' : '';
  return `${n} photo${s} servie${s} par un hôte que le banc ne lit pas en direct ${n > 1 ? 'ne sont' : 'n’est'} pas proposée${s} : le relais du serveur a échoué${raison ? ` (${raison.replace(/\.$/, '')})` : ''}.`;
}

/** Les identifiants de Panoramax sont des UUID : le relais n'en accepte pas d'autre. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Les photos d'une reponse de recherche, rapportees a l'adresse : dans le rayon, les plus proches d'abord. `vise` : l'adresse est dans
 * le champ de la photo (un panoramique la voit toujours ; une photo plate, a moins de la moitie de son champ, plus 10 degres).
 * `relais` : avec lui, une photo d'un hote non liste se propose aussi, ses images lues par le serveur du banc ; sans lui, elle est
 * laissee (comme avant le relais).
 */
export function lirePhotos(json: unknown, cible: { lat: number; lon: number }, rayonM: number, relais?: Relais): PhotoRue[] {
  const feats = ((json as { features?: unknown[] })?.features ?? []) as PhotoStac[];
  const out: PhotoRue[] = [], douteux = capsDouteux(feats);
  for (const f of feats) {
    const c = f.geometry?.coordinates;
    const brute = f.assets?.hd?.href ?? f.assets?.sd?.href, id = f.id;
    if (!id || !c || typeof c[0] !== 'number' || typeof c[1] !== 'number' || typeof brute !== 'string') continue;
    // Chaque image en direct si son hote est liste, sinon par le relais (qui ne prend que des identifiants de Panoramax).
    const parRelais = !autorise(brute), relayer = relais && UUID.test(id) ? relais : null;
    if (parRelais && !relayer) continue;
    const lien = (url: unknown, taille: TailleRelais): string | null => (autorise(url) ? url : relayer && typeof url === 'string' ? relayer(id, taille) : null);
    const hd = lien(brute, f.assets?.hd?.href ? 'hd' : 'sd') as string;
    const p = f.properties ?? {};
    const orient = (p['pers:interior_orientation'] ?? {}) as { field_of_view?: unknown; sensor_array_dimensions?: unknown };
    const capteur = Array.isArray(orient.sensor_array_dimensions) ? (orient.sensor_array_dimensions as unknown[]) : [];
    const forme = typeof capteur[0] === 'number' && typeof capteur[1] === 'number' && capteur[0] > 0 && capteur[1] > 0 ? capteur[0] / capteur[1] : 4 / 3;
    const largeurPx = typeof capteur[0] === 'number' && capteur[0] > 0 ? capteur[0] : null;
    const champ = typeof orient.field_of_view === 'number' && orient.field_of_view > 0 ? orient.field_of_view : 70;
    const az = typeof p['view:azimuth'] === 'number' ? ((p['view:azimuth'] % 360) + 360) % 360 : null;
    const pos = { lat: c[1], lon: c[0] };
    const distance = distanceM(pos, cible);
    if (distance > rayonM) continue;
    const cap = capVers(pos, cible);
    const panoramique = champ >= 300;
    const vise = panoramique || (az !== null && Math.abs(ecartAngle(az, cap)) <= champ / 2 + 10);
    out.push({
      id, collection: f.collection ?? null, lat: pos.lat, lon: pos.lon, azimut: az, champ, panoramique, hd,
      sd: lien(f.assets?.sd?.href, 'sd'),
      vignette: lien(f.assets?.thumb?.href, 'vignette'),
      date: typeof p['datetime'] === 'string' ? p['datetime'] : null,
      auteur: typeof p['geovisio:producer'] === 'string' ? p['geovisio:producer'] : null,
      licence: typeof p['license'] === 'string' ? p['license'] : null,
      parRelais, capSur: !douteux.has(id), forme, largeurPx,
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
/**
 * `batiment` : le batiment que la vue regarde, quand le tri des facades l'a trouve (facadesVues.ts), le cote par lequel elle le voit
 * (`cote`, 0 a 3), sa note de 0 a 100 et la distance a sa facade. `doublon` : d'autres vues montrent mieux ce batiment (meilleuresVues.ts) ; elle reste visible, pas importee.
 */
export interface VueAExtraire {
  vue: 'gauche' | 'droite' | 'adresse' | 'photo' | 'choisie'; cap: number; batiment?: string; cote?: number; note?: number; distanceFacade?: number; doublon?: boolean;
  /** Le banc a deja une image de cette facade (ce batiment par ce cote, murs.ts) : la vue reste visible, marquee, pas proposee cochee. */
  dejaLa?: boolean;
  /** Le cadre de la vue tiree d'un 360 (cadrage.ts) : son champ, son tangage, ou la vue face au mur ; absent : 75 degres, 8 vers le haut. */
  cadre?: CadreDeVue;
  /** Ou le batiment se trouve dans l'image de la vue, d'apres la geometrie (parts de la largeur et de la hauteur). */
  zone?: { gauche: number; droite: number; haut: number; bas: number };
  /** La facade est cachee par une haie, des arbres ou une cloture (vueDegagee.ts) : la note en tient compte. */
  cachee?: boolean;
}

export function vuesAExtraire(p: Pick<PhotoRue, 'panoramique' | 'azimut' | 'cap'>, visee: Visee): VueAExtraire[] {
  if (!p.panoramique) return [{ vue: 'photo', cap: p.azimut ?? p.cap }];
  // Sans cap de prise de vue, le sens de la rue n'est pas connu : la vue vers l'adresse.
  if (visee === 'adresse' || p.azimut === null) return [{ vue: 'adresse', cap: p.cap }];
  const norm = (a: number) => ((a % 360) + 360) % 360;
  const gauche: VueAExtraire = { vue: 'gauche', cap: norm(p.azimut - 90) }, droite: VueAExtraire = { vue: 'droite', cap: norm(p.azimut + 90) };
  if (visee === 'cotes') return [gauche, droite];
  return [Math.abs(ecartAngle(gauche.cap, p.cap)) <= Math.abs(ecartAngle(droite.cap, p.cap)) ? gauche : droite];
}

/** Le champ d'une vue tiree d'un panoramique, en degres (celui de l'import). */
export const CHAMP_VUE = 75;

const norm = (a: number) => ((a % 360) + 360) % 360;

/**
 * Ou tombe un cap dans le panoramique equirectangulaire, de 0 (bord gauche) a 1 (bord droit) : le milieu de l'image est le cap de la
 * prise de vue (`azimut`, l'axe de la rue), 360 degres sur toute la largeur.
 */
export const xDuCap = (cap: number, azimut: number): number => 0.5 + ecartAngle(azimut, cap) / 360;

/** Le cap vise a la position `x` (0 a 1) du panoramique. */
export const capDuX = (x: number, azimut: number): number => Math.round(norm(azimut + (x - 0.5) * 360));

/** Ajoute une vue au cap donne, ou retire celle qui le couvre deja (a moins d'un demi-champ de vue). */
export function basculerCap(caps: readonly number[], cap: number): number[] {
  const k = caps.findIndex((c) => Math.abs(ecartAngle(c, cap)) < CHAMP_VUE / 2);
  return k >= 0 ? caps.filter((_, i) => i !== k) : [...caps, norm(cap)].sort((a, b) => a - b);
}

/**
 * Les vues a tirer d'une photo pour les caps choisis a la main (demande du proprietaire, 12 novembre 2026 : regarder a gauche, a
 * droite, ou ailleurs dans le 360). Un cap qui tombe sur une vue de la visee garde son nom (gauche, droite, adresse) ; les autres sont
 * « choisies ». Sans choix, la visee. Une photo plate n'a qu'une vue.
 */
export function vuesDesCaps(p: Pick<PhotoRue, 'panoramique' | 'azimut' | 'cap'>, caps: readonly number[] | undefined, visee: Visee): VueAExtraire[] {
  if (!p.panoramique || !caps) return vuesAExtraire(p, visee);
  const connues = [...vuesAExtraire(p, 'cotes'), ...vuesAExtraire(p, 'adresse')];
  return caps.map((cap) => ({ vue: connues.find((v) => Math.abs(ecartAngle(v.cap, cap)) < 1)?.vue ?? 'choisie', cap: norm(cap) }));
}
