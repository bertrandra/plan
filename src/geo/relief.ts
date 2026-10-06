// Lire le relief a l'IGN : une grille d'altitudes en une requete WMS (MD/spec-relief.md §2, geo/).
//
// Deux calques de la Geoplateforme, en nombres bruts (`image/x-bil;bits=32`) : le MNT LiDAR HD a
// 50 cm la ou ses dalles sont publiees, le RGE ALTI a 1 m ailleurs. Le calque evident
// `ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES` est ecarte : verifie le 6 octobre 2026, il est servi
// depuis une pyramide en degres dont le dernier niveau vaut 3 a 5 m. La precision vient du masque
// de source du RGE ALTI (un calque vecteur WFS) ou, pour le LiDAR, de la dalle elle-meme.
//
// Le reseau est injecte (`rechercher`), comme dans `carteSituation` : les tests lisent des fixtures,
// jamais le service. Une requete coupee est rejouee une fois, avec le meme delai que `apiIgn`.

import { projecteurLocal } from './projection.js';
import { RESEAU_TIMEOUT_MS } from './apiIgn.js';
import {
  cellulesDansPolygone, dimensionsGrille, empriseRelief, pasPourEmprise, pointDeReference, zRefPour, type Emprise
} from '../model/relief.js';
import type { ObjetPlan, PtBrut, Relief } from '../model/types.js';

export const WMS_RELIEF_URL = 'https://data.geopf.fr/wms-r/wms';
export const WFS_RELIEF_URL = 'https://data.geopf.fr/wfs/ows';

/** Une source de relief : son calque, sa maille native, sa valeur « sans donnee ». */
export interface SourceRelief {
  id: Relief['source'];
  couche: string;
  pas: number;
  sansDonnee: number;
}

export const SOURCE_LIDAR: SourceRelief = { id: 'lidar-hd', couche: 'IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93', pas: 0.5, sansDonnee: -9999 };
export const SOURCE_RGE_ALTI: SourceRelief = { id: 'rge-alti', couche: 'RGEALTI-MNT_PYR-ZIP_FXX_LAMB93_WMS', pas: 1, sansDonnee: -99999 };
/** L'index des dalles LiDAR HD : une entite par km², avec ses dates et le nuage. */
export const COUCHE_DALLES_LIDAR = 'IGNF_LIDAR-HD_METADONNEE:metadata';
/** Le masque de source du RGE ALTI : origine, resolution, precision par zone. */
export const COUCHE_SOURCE_RGE_ALTI = 'ELEVATIONGRIDCOVERAGE.HIGHRES.QUALITY:source_fra';
export const PRECISION_LIDAR = 'de l’ordre de 10 cm (IGN)';
export const SYSTEME_ALTIMETRIQUE_DEFAUT = 'NGF-IGN69';

/** Une emprise en degres : longitude, latitude, WGS84. */
export interface EmpriseDeg { lonMin: number; latMin: number; lonMax: number; latMax: number }

const bboxCrs84 = (e: EmpriseDeg): string => [e.lonMin, e.latMin, e.lonMax, e.latMax].map(v => v.toFixed(7)).join(',');

/** L'adresse de la grille : une colonne par cellule, en `CRS:84` (longitude, latitude). */
export function urlGrille(couche: string, e: EmpriseDeg, nx: number, ny: number): string {
  const p = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: couche, STYLES: '', CRS: 'CRS:84',
    BBOX: bboxCrs84(e), WIDTH: String(nx), HEIGHT: String(ny), FORMAT: 'image/x-bil;bits=32'
  });
  return WMS_RELIEF_URL + '?' + p.toString();
}

/** Combien de dalles LiDAR HD couvrent l'emprise : `RESULTTYPE=hits`, la reponse ne porte qu'un nombre. */
export function urlDallesLidar(e: EmpriseDeg): string {
  const p = new URLSearchParams({
    SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: COUCHE_DALLES_LIDAR, RESULTTYPE: 'hits',
    SRSNAME: 'CRS:84', BBOX: bboxCrs84(e) + ',CRS:84'
  });
  return WFS_RELIEF_URL + '?' + p.toString();
}

/** La dalle LiDAR HD sous un point : ses dates, son systeme altimetrique. */
export function urlDalleLidar(lon: number, lat: number): string {
  return urlEntitesAuPoint(COUCHE_DALLES_LIDAR, lon, lat);
}

/** La zone du masque de source du RGE ALTI sous un point : origine, resolution, precision. */
export function urlSourceRgeAlti(lon: number, lat: number): string {
  return urlEntitesAuPoint(COUCHE_SOURCE_RGE_ALTI, lon, lat);
}

function urlEntitesAuPoint(couche: string, lon: number, lat: number): string {
  const d = 0.00002;
  const p = new URLSearchParams({
    SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: couche, OUTPUTFORMAT: 'application/json', COUNT: '1',
    SRSNAME: 'CRS:84', BBOX: bboxCrs84({ lonMin: lon - d, latMin: lat - d, lonMax: lon + d, latMax: lat + d }) + ',CRS:84'
  });
  return WFS_RELIEF_URL + '?' + p.toString();
}

/**
 * Une reponse BIL en grille : `nx × ny` flottants 32 bits petit-boutistes, du nord au sud ; la
 * valeur « sans donnee » devient `null`, le reste est arrondi au centimetre.
 */
export function decoderBil(octets: ArrayBuffer, nx: number, ny: number, sansDonnee: number): (number | null)[] {
  if (octets.byteLength !== nx * ny * 4) throw new Error('grille inattendue : ' + octets.byteLength + ' octets pour ' + nx + ' × ' + ny + ' cellules');
  const vue = new DataView(octets);
  const out: (number | null)[] = new Array(nx * ny);
  for (let k = 0; k < nx * ny; k++) {
    const v = vue.getFloat32(k * 4, true);
    out[k] = !Number.isFinite(v) || Math.abs(v - sansDonnee) < 0.5 || v < -1000 ? null : Math.round(v * 100) / 100;
  }
  return out;
}

/** Le nombre d'entites d'une reponse `RESULTTYPE=hits`. */
export function lireNombreMatched(xml: string): number {
  const m = /numberMatched="(\d+)"/.exec(xml);
  return m ? parseInt(m[1] as string, 10) : 0;
}

/** Ce qu'une requete rend : les octets, le texte ou le JSON, selon ce qu'on en attend. */
type Lecteur<T> = (r: Response) => Promise<T>;

/** Une requete avec delai, rejouee une fois sur une coupure ou un 5xx : jamais sur un 4xx. */
export async function requeteAvecReprise<T>(url: string, lire: Lecteur<T>, rechercher: typeof fetch): Promise<T> {
  const essai = async (): Promise<T> => {
    const r = await rechercher(url, { signal: AbortSignal.timeout(RESEAU_TIMEOUT_MS), cache: 'no-store' });
    if (!r.ok) throw Object.assign(new Error('Le service a répondu HTTP ' + r.status + '.'), { statut: r.status });
    return lire(r);
  };
  try {
    return await essai();
  } catch (e) {
    const statut = (e as { statut?: number }).statut;
    if (statut && statut < 500) throw e;
    return essai();
  }
}

/** Ce que la lecture demande : la parcelle, son calage, les objets (pour le point de reference), le reseau. */
export interface DemandeRelief {
  parcelle: readonly PtBrut[];
  /** Le point de calage : `(x, y)` du plan qui vaut `(lat, lon)` — le calage cadastral vaut (0, 0). */
  ref: { lat: number; lon: number; x: number; y: number };
  objets: ObjetPlan[];
  cleTerrasse?: string | null;
  rechercher?: typeof fetch;
  /** L'horloge, pour `dateLecture`. */
  aujourdhui?: () => Date;
}

/** Les deux textes et la date qu'une source donne sur elle-meme. */
interface Provenance { origine: string; precision: string; dateDonnees?: string; systemeAltimetrique: string }

interface Entites { features?: { properties?: Record<string, unknown> }[] }

const texte = (v: unknown, defaut: string): string => (typeof v === 'string' && v.trim() ? v.trim() : defaut);

async function provenance(source: SourceRelief, lon: number, lat: number, rechercher: typeof fetch): Promise<Provenance> {
  const lireJson: Lecteur<Entites> = r => r.json() as Promise<Entites>;
  if (source.id === 'lidar-hd') {
    let p: Record<string, unknown> = {};
    try { p = (await requeteAvecReprise(urlDalleLidar(lon, lat), lireJson, rechercher)).features?.[0]?.properties ?? {}; } catch { /* la dalle existe (comptee) ; sa fiche manque : on garde les defauts */ }
    const fin = texte(p['date_fin_acquisition'], '').slice(0, 10);
    return {
      origine: 'LiDAR HD', precision: PRECISION_LIDAR,
      ...(fin ? { dateDonnees: fin } : {}),
      systemeAltimetrique: texte(p['systeme_altimetrique'], SYSTEME_ALTIMETRIQUE_DEFAUT).replace(/^IGN69$/, SYSTEME_ALTIMETRIQUE_DEFAUT)
    };
  }
  let p: Record<string, unknown> = {};
  try { p = (await requeteAvecReprise(urlSourceRgeAlti(lon, lat), lireJson, rechercher)).features?.[0]?.properties ?? {}; } catch { /* sans masque, la precision reste inconnue : on le dit */ }
  const origine = texte(p['origine'], 'source non renseignée'), resolution = texte(p['resolution'], '');
  return {
    origine: resolution && resolution !== 'NR' ? origine + ' (' + resolution + ')' : origine,
    precision: texte(p['precision'], 'précision non renseignée'),
    systemeAltimetrique: SYSTEME_ALTIMETRIQUE_DEFAUT
  };
}

/**
 * Lit la grille du relief sur la parcelle et ses abords : LiDAR HD si l'index des dalles couvre
 * l'emprise et que la grille est pleine sur la parcelle, sinon RGE ALTI ; refuse si le RGE ALTI
 * n'a rien non plus, ou si la parcelle est trop grande (pas au-dela de 5 m).
 */
export async function lireRelief(d: DemandeRelief): Promise<Relief> {
  const rechercher = d.rechercher ?? fetch;
  const proj = projecteurLocal(d.ref.lat, d.ref.lon);
  const versDeg = (x: number, y: number) => proj.versDegres(x - d.ref.x, y - d.ref.y);
  const emprise = empriseRelief(d.parcelle);
  const enDegres = (e: Emprise): EmpriseDeg => {
    const so = versDeg(e.xMin, e.yMin), ne = versDeg(e.xMax, e.yMax);
    return { lonMin: so.lon, latMin: so.lat, lonMax: ne.lon, latMax: ne.lat };
  };
  const lireOctets: Lecteur<ArrayBuffer> = r => r.arrayBuffer();
  const lireTexte: Lecteur<string> = r => r.text();

  const lireGrille = async (source: SourceRelief): Promise<Omit<Relief, 'zRef' | 'origine' | 'precision' | 'systemeAltimetrique' | 'dateDonnees'> | null> => {
    const pas = pasPourEmprise(source.pas, emprise);
    if (pas === null) throw new Error('Parcelle trop grande pour le relief : la grille dépasserait un pas de 5 m.');
    const { x0, y0, nx, ny } = dimensionsGrille(emprise, pas);
    // Le bord exterieur des cellules, pour que chaque pixel du service soit une cellule entiere.
    const bords: Emprise = { xMin: x0 - pas / 2, xMax: x0 + (nx - 0.5) * pas, yMin: y0 - (ny - 0.5) * pas, yMax: y0 + pas / 2 };
    const octets = await requeteAvecReprise(urlGrille(source.couche, enDegres(bords), nx, ny), lireOctets, rechercher);
    const z = decoderBil(octets, nx, ny, source.sansDonnee);
    const grille = { source: source.id, couche: source.couche, dateLecture: (d.aujourdhui ?? (() => new Date()))().toISOString().slice(0, 10), pas, x0, y0, nx, ny, z };
    // Une cellule sans donnee sur la parcelle : cette source ne vaut pas ici.
    const trous = cellulesDansPolygone(grille, d.parcelle).some(c => c.z === null);
    return trous ? null : grille;
  };

  let grille = null;
  let source = SOURCE_LIDAR;
  const dalles = lireNombreMatched(await requeteAvecReprise(urlDallesLidar(enDegres(emprise)), lireTexte, rechercher).catch(() => ''));
  if (dalles > 0) grille = await lireGrille(SOURCE_LIDAR);
  if (!grille) { source = SOURCE_RGE_ALTI; grille = await lireGrille(SOURCE_RGE_ALTI); }
  if (!grille) throw new Error('Pas de relief IGN pour cette parcelle.');

  const pRef = pointDeReference(d.objets, d.cleTerrasse) ?? { x: (emprise.xMin + emprise.xMax) / 2, y: (emprise.yMin + emprise.yMax) / 2 };
  const refDeg = versDeg(pRef.x, pRef.y);
  const prov = await provenance(source, refDeg.lon, refDeg.lat, rechercher);
  const zRef = zRefPour(grille, d.objets, d.cleTerrasse);
  return { ...grille, ...prov, zRef };
}
