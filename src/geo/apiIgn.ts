// Acquisition des donnees IGN : adresse, cadastre, BD TOPO, PLU (spec §3.2, geo/).
//
// Tout ce qui parle au reseau vit ici, et rien d'autre : ce module ne connait ni le DOM ni l'etat
// de l'application. C'est ce qui permet de lire d'un seul coup d'oeil ce qu'on demande aux services
// publics, et a quelles conditions.
//
// Les pieges qui ont faconne ce code sont documentes a l'endroit ou ils mordent, pas ici - sauf
// celui-la, qui vaut pour tout le fichier : API Carto **ignore** les parametres qu'il ne connait
// pas au lieu de renvoyer une erreur, si bien qu'une requete mal formee degenere en vidage national
// avec un franc 200 OK.

import { simplifierContour } from '../geometry/rings.js';
import { signedArea, shoelace, centroid, pointInPolygon } from '../geometry/basic.js';
import { distancePointContour, distanceContours, longueurFrontiere } from '../geometry/proximite.js';
import { SIMPLIF_M, ADJACENCE_TOL_M, MAX_VOISINES } from './constantesCadastre.js';
import type { PtBrut, ZoneUrba, PrescriptionPlu, InformationPlu, ServitudePlu, ZonagePlu } from '../model/types.js';
import type { ParcelleCadastrale, ObjetBdTopo, AdresseRecherchee } from './cadastreObjets.js';
import type { ProjecteurLocal } from './projection.js';

/** Un anneau de coordonnees GeoJSON : `[lon, lat]` (ou `[lon, lat, alt]`), non ferme cote appli. */
export type Anneau = number[][];

/** Une geometrie GeoJSON telle que la rendent API Carto et le WFS — Polygon ou MultiPolygon. */
export interface GeometrieGeoJSON {
  type: string;
  coordinates: unknown;
}

/**
 * Une feature GeoJSON, telle que la rendent API Carto, le WFS BD TOPO, et le GPU (PLU).
 *
 * `P` type les proprietes : chaque service a les siennes, et les lire via l'index par defaut
 * (`Record<string, unknown>`) suffit — ce module ne fait qu'extraire des champs nommes un par un,
 * jamais un objet entier.
 */
export interface FeatureGeoJSON<P = Record<string, unknown>> {
  id?: string | number;
  properties?: P;
  geometry?: GeometrieGeoJSON | null;
}

/** Une reponse GeoJSON `FeatureCollection`, ou ce que rend un service en panne partielle (`null`). */
export interface CollectionGeoJSON<P = Record<string, unknown>> {
  features?: FeatureGeoJSON<P>[];
}

/** Une emprise rectangulaire, en polygone GeoJSON — ce que produisent les deux fonctions d'emprise. */
export interface EmpriseGeoJSON {
  type: 'Polygon';
  coordinates: number[][][];
}

/** Une bbox en degres, cote LAT/LON separes — ce que le WFS attend pour son parametre `BBOX`. */
export interface BboxDeg {
  lonMin: number; lonMax: number; latMin: number; latMax: number;
}
// ================= Import cadastre : adresse -> parcelle (+ voisines) =================
// Geocodage : Base Adresse Nationale. Geometrie : API Carto Cadastre (PCI), en WGS84.
// Deux pieges verifies sur le terrain expliquent la forme de ce code :
//   1. le point d'adresse de la BAN est DEVANT LA PORTE, donc sur la voirie - qui n'est pas
//      cadastree. L'interroger tel quel renvoie zero parcelle (et, sur une adresse d'angle,
//      parfois celle d'en face). On cherche donc toujours sur une EMPRISE autour du point ;
//      le point ne sert plus qu'a classer les candidates.
//   2. API Carto IGNORE les parametres qu'il ne connait pas (?lon=&lat= n'existe pas) au lieu
//      de renvoyer une erreur : la requete degenere en vidage national, en 200 OK, a l'autre
//      bout de la France. D'ou les garde-fous de interrogerCadastre().
export const BAN_URL = 'https://api-adresse.data.gouv.fr/search/';
export const CADASTRE_URL = 'https://apicarto.ign.fr/api/cadastre/parcelle';
export const RESEAU_TIMEOUT_MS = 8000;
export const RAYONS_RECHERCHE_M = [12, 25, 50];
export const ECART_AUTO_M = 3;        // en dessous, on ne tranche pas a la place de l'utilisateur

/** Ce que `fetchJSONReseau` lit d'une erreur : le nom (`AbortError`) et le `statut` pose ci-dessous sur un HTTP non-2xx. */
type ErreurReseau = { name?: string; statut?: number } | null | undefined;

export function fetchJSONTimeout(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), RESEAU_TIMEOUT_MS);
  return fetch(url, {signal:controller.signal, cache:'no-store'})
    .then(r=>{
      if(!r.ok) throw Object.assign(new Error('Le service a repondu HTTP ' + r.status + '.'), {statut:r.status});
      return r.json();
    })
    .finally(()=>clearTimeout(timer));
}
// Une seule reprise, et seulement sur ce qui peut passer tout seul (reseau coupe, 5xx) :
// rejouer une erreur de validation ne ferait que la repeter.
export async function fetchJSONReseau(url: string): Promise<unknown> {
  try {
    return await fetchJSONTimeout(url);
  } catch(e){
    const err = e as ErreurReseau;
    if(err && err.name === 'AbortError') throw new Error('Le service ne repond pas (8 s). Reessaie.');
    if(err && err.statut && err.statut < 500) throw e;
    try {
      return await fetchJSONTimeout(url);
    } catch(e2){
      const err2 = e2 as ErreurReseau;
      if(err2 && err2.name === 'AbortError') throw new Error('Le service ne repond pas (8 s). Reessaie.');
      if(e2 instanceof TypeError && location.protocol === 'file:'){
        throw new Error('Import cadastre indisponible quand la page est ouverte en fichier local : sers-la par un serveur web.');
      }
      throw e2;
    }
  }
}



// API Carto renvoie un MultiPolygon meme pour une parcelle simple : l'anneau exterieur est en
// coordinates[0][0], pas en coordinates[0]. Un code ecrit pour le seul cas Polygon se trompe
// d'un niveau de profondeur et lit des tableaux la ou il attend des nombres.
export function anneauExterieur(geometry: GeometrieGeoJSON | null | undefined): Anneau | null {
  if(!geometry) return null;
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates as Anneau[][]
              : geometry.type === 'Polygon' ? [geometry.coordinates as Anneau[]] : null;
  if(!polys || !polys.length) return null;
  let meilleur: Anneau | null = null, aireMax = -1;
  polys.forEach(poly=>{
    const anneau = poly && poly[0];
    if(!Array.isArray(anneau) || anneau.length < 4) return;
    let s = 0;
    for(let i=0;i<anneau.length;i++){
      const p1 = anneau[i]!, p2 = anneau[(i+1)%anneau.length]!;
      s += p1[0]!*p2[1]! - p2[0]!*p1[1]!;
    }
    const a = Math.abs(s/2);
    if(a > aireMax){ aireMax = a; meilleur = anneau; }
  });
  return meilleur;
}
export function anneauVersPts(anneau: Anneau, proj: ProjecteurLocal, simplifier: boolean): PtBrut[] {
  let pts = anneau.map(c=>proj.versMetres(c[0]!, c[1]!));
  // GeoJSON ferme l'anneau ; l'appli, elle, garde des pts implicitement fermes.
  if(pts.length > 1 && Math.hypot(pts[0]!.x-pts[pts.length-1]!.x, pts[0]!.y-pts[pts.length-1]!.y) < 1e-6) pts.pop();
  const nets: PtBrut[] = [];
  pts.forEach(p=>{
    if(!nets.length || Math.hypot(p.x-nets[nets.length-1]!.x, p.y-nets[nets.length-1]!.y) > 0.01) nets.push(p);
  });
  pts = simplifier ? simplifierContour(nets, SIMPLIF_M) : nets;
  // Sens horaire, comme les parcelles des projets existants (l'aire, elle, est en valeur absolue).
  if(signedArea(pts) > 0) pts.reverse();
  return pts.map(p=>({ x:Math.round(p.x*1000)/1000, y:Math.round(p.y*1000)/1000 }));
}

export async function geocoderBAN(texte: string, autocomplete: boolean): Promise<AdresseRecherchee[]> {
  const url = BAN_URL + '?q=' + encodeURIComponent(texte) + '&limit=5' + (autocomplete ? '&autocomplete=1' : '');
  const data = await fetchJSONReseau(url) as CollectionGeoJSON;
  return ((data && data.features) || []).map(f=>({
    label: (f.properties && f.properties.label as string) || '',
    score: (f.properties && f.properties.score as number) || 0,
    genre: (f.properties && f.properties.type as string) || '',
    citycode: (f.properties && f.properties.citycode as string) || '',
    ville: (f.properties && f.properties.city as string) || '',
    // La BAN rend un Point : `[lon, lat]`, jamais un anneau.
    lon: (f.geometry?.coordinates as [number, number])[0],
    lat: (f.geometry?.coordinates as [number, number])[1]
  }));
}
export function empriseGeoJSON(lon: number, lat: number, proj: ProjecteurLocal, rayonM: number): EmpriseGeoJSON {
  const dLon = rayonM/proj.kx, dLat = rayonM/proj.ky;
  return { type:'Polygon', coordinates:[[
    [lon-dLon, lat-dLat], [lon+dLon, lat-dLat], [lon+dLon, lat+dLat], [lon-dLon, lat+dLat], [lon-dLon, lat-dLat]
  ]]};
}
// Emprise autour d'une PARCELLE, pas autour du point d'adresse : une parcelle fait couramment
// 30 a 40 m de long, donc la boite de recherche initiale (centree sur l'adresse, en bordure de
// voirie) ne voit jamais les mitoyennes du fond de terrain. Sur la parcelle de test, la boite
// d'adresse ramenait 5 parcelles la ou celle de la parcelle en ramene 13.
export function empriseAutourAnneau(anneau: Anneau, proj: ProjecteurLocal, margeM: number): EmpriseGeoJSON {
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  anneau.forEach(c=>{
    lonMin = Math.min(lonMin, c[0]!); lonMax = Math.max(lonMax, c[0]!);
    latMin = Math.min(latMin, c[1]!); latMax = Math.max(latMax, c[1]!);
  });
  const dLon = margeM/proj.kx, dLat = margeM/proj.ky;
  return { type:'Polygon', coordinates:[[
    [lonMin-dLon, latMin-dLat], [lonMax+dLon, latMin-dLat], [lonMax+dLon, latMax+dLat],
    [lonMin-dLon, latMax+dLat], [lonMin-dLon, latMin-dLat]
  ]]};
}
export async function interrogerCadastre(geom: EmpriseGeoJSON, codeInsee: string | null | undefined): Promise<FeatureGeoJSON[]> {
  let url = CADASTRE_URL + '?geom=' + encodeURIComponent(JSON.stringify(geom)) + '&_limit=60';
  if(codeInsee) url += '&code_insee=' + encodeURIComponent(codeInsee);
  const data = await fetchJSONReseau(url) as CollectionGeoJSON;
  const features = (data && data.features) || [];
  // Garde-fou du piege n°2 : une reponse qui ne ressemble pas a un voisinage n'est pas affichee
  // du tout, plutot que d'etre prise pour un resultat. _limit plafonne deja le nombre, donc
  // c'est la commune qui trahit un filtre ignore (le vidage national commence dans le 13).
  if(features.length > 200) throw new Error('Reponse incoherente du service cadastre (' + features.length + ' parcelles).');
  if(codeInsee){
    const etrangere = features.find(f=>f.properties && f.properties.code_insee && f.properties.code_insee !== codeInsee);
    if(etrangere) throw new Error('Reponse incoherente du service cadastre (commune ' + etrangere.properties?.code_insee + ' au lieu de ' + codeInsee + ').');
  }
  return features;
}

/** Une parcelle candidate : la fiche cadastrale, plus sa position par rapport au point cherche. */
export interface Candidate extends ParcelleCadastrale {
  aire: number;
  /** Le point d'adresse tombe-t-il dans cette parcelle ? */
  dedans: boolean;
  /** Distance de ce point au contour, en metres. */
  distance: number;
  /** Pose par `trierVoisines` : distance a la parcelle principale. */
  distancePrincipale?: number;
  /** Pose par `trierVoisines` : longueur de la limite commune avec la parcelle principale. */
  frontiere?: number;
}

export function construireCandidats(features: FeatureGeoJSON[], proj: ProjecteurLocal, ptRef: PtBrut, simplifier: boolean): Candidate[] {
  const vus = new Set<string>();
  const out: Candidate[] = [];
  features.forEach(f=>{
    const p = f.properties || {};
    const idu = p.idu as string | undefined;
    if(!idu || vus.has(idu)) return;
    const anneau = anneauExterieur(f.geometry);
    if(!anneau) return;
    const pts = anneauVersPts(anneau, proj, simplifier);
    if(pts.length < 3) return;
    const aire = shoelace(pts);
    if(!(aire > 0)) return;
    vus.add(idu);
    out.push({
      idu,
      section: (p.section as string) || '',
      numero: (p.numero as string) || '',
      codeInsee: (p.code_insee as string) || '',
      commune: (p.nom_com as string) || '',
      contenance: typeof p.contenance === 'number' ? p.contenance : null,
      anneauDeg: anneau,
      pts, aire,
      dedans: pointInPolygon(ptRef, pts),
      distance: distancePointContour(ptRef, pts)
    });
  });
  return out;
}
export function classerCandidats(cands: Candidate[]): Candidate[] {
  return cands.slice().sort((a,b)=>{
    if(a.dedans !== b.dedans) return a.dedans ? -1 : 1;
    if(Math.abs(a.distance - b.distance) > 0.30) return a.distance - b.distance;
    return (b.contenance || b.aire) - (a.contenance || a.aire);
  });
}
export interface VoisinesTriees {
  adjacentes: Candidate[];
  autres: Candidate[];
  tropDense: boolean;
}
/**
 * Ce que `trierVoisines` a besoin de connaitre de la parcelle principale : sa cle et son contour,
 * jamais plus — la fonction ne lit ni son aire ni sa distance a l'adresse. Une reconstruction
 * minimale (parcelle deja enregistree, reactualisation) le satisfait sans en fabriquer un candidat
 * complet.
 */
export type ParcellePrincipale = Pick<Candidate, 'idu' | 'pts'>;

export function trierVoisines(principale: ParcellePrincipale, cands: Candidate[]): VoisinesTriees {
  const adjacentes: Candidate[] = [], autres: Candidate[] = [];
  cands.forEach(c=>{
    if(c.idu === principale.idu) return;
    c.distancePrincipale = distanceContours(principale.pts, c.pts);
    if(c.distancePrincipale < ADJACENCE_TOL_M){
      c.frontiere = longueurFrontiere(principale.pts, c.pts, ADJACENCE_TOL_M);
      adjacentes.push(c);
    } else {
      autres.push(c);
    }
  });
  adjacentes.sort((a,b)=> (b.frontiere! - a.frontiere!) || (b.aire - a.aire));
  autres.sort((a,b)=> a.distancePrincipale! - b.distancePrincipale!);
  return {
    adjacentes: adjacentes.slice(0, MAX_VOISINES),
    autres: autres.slice(0, MAX_VOISINES),
    tropDense: adjacentes.length > MAX_VOISINES
  };
}

// ---- BD TOPO (batiments, haies, vegetation) et GPU (PLU), memes conventions que le cadastre ----
// Le WFS de la Geoplateforme sert la BD TOPO. Deux details qui se paient cher si on les rate :
//   - en EPSG:4326 "urn:ogc:def:crs", l'ordre des coordonnees de BBOX est LAT,LON (pas lon,lat) ;
//   - les nombres arrivent en texte a virgule francaise ("5,2"), parseFloat les tronque a 5.
export const WFS_URL = 'https://data.geopf.fr/wfs/ows';
export const GPU_URL = 'https://apicarto.ign.fr/api/gpu';
export const COUCHE_BATIMENT = 'BDTOPO_V3:batiment';
export const COUCHE_VEGETATION = 'BDTOPO_V3:zone_de_vegetation';
export const COUCHE_HAIE = 'BDTOPO_V3:haie';

export function bboxDegDesAnneaux(anneaux: Anneau[], proj: ProjecteurLocal, margeM: number): BboxDeg {
  let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
  anneaux.forEach(anneau=>anneau.forEach(c=>{
    lonMin = Math.min(lonMin, c[0]!); lonMax = Math.max(lonMax, c[0]!);
    latMin = Math.min(latMin, c[1]!); latMax = Math.max(latMax, c[1]!);
  }));
  const dLon = margeM/proj.kx, dLat = margeM/proj.ky;
  return { lonMin:lonMin-dLon, lonMax:lonMax+dLon, latMin:latMin-dLat, latMax:latMax+dLat };
}
export async function interrogerWfs(couche: string, bbox: BboxDeg, max: number | undefined): Promise<FeatureGeoJSON[]> {
  const bboxParam = [bbox.latMin, bbox.lonMin, bbox.latMax, bbox.lonMax, 'urn:ogc:def:crs:EPSG::4326'].join(',');
  const url = WFS_URL + '?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature'
    + '&TYPENAMES=' + encodeURIComponent(couche)
    + '&SRSNAME=EPSG:4326&BBOX=' + encodeURIComponent(bboxParam)
    + '&OUTPUTFORMAT=application/json&COUNT=' + (max || 80);
  const data = await fetchJSONReseau(url) as CollectionGeoJSON;
  return (data && data.features) || [];
}

/** Un element BD TOPO converti, avant rattachement aux parcelles (`parcelles` reste vide). */
export interface ElementIgn extends ObjetBdTopo {
  genre: string;
  anneauDeg: Anneau;
  aire: number;
  parcelles: Set<string>;
}

export function construireElementsIgn(features: FeatureGeoJSON[], proj: ProjecteurLocal, simplifier: boolean, genre: string): ElementIgn[] {
  const out: ElementIgn[] = [];
  features.forEach(f=>{
    const anneau = anneauExterieur(f.geometry);
    if(!anneau) return;
    // Les geometries BD TOPO portent une 3e coordonnee (altitude) : anneauVersPts n'en lit que
    // les deux premieres, l'altitude reste dans les attributs (altitude_minimale_sol).
    const pts = anneauVersPts(anneau, proj, simplifier);
    if(pts.length < 3) return;
    const aire = shoelace(pts);
    if(!(aire > 0)) return;
    const p = f.properties || {};
    out.push({ id: (f.id as string) || (p.cleabs as string), genre, pts, anneauDeg: anneau, props: p, aire, parcelles: new Set() });
  });
  return out;
}
export function polygonesSeTouchent(A: PtBrut[], B: PtBrut[]): boolean {
  if(A.some(p=>pointInPolygon(p, B))) return true;
  if(B.some(p=>pointInPolygon(p, A))) return true;
  return pointInPolygon(centroid(A), B);
}
// Un batiment appartient a toutes les parcelles qu'il recouvre : une annexe a cheval sur la limite
// doit pouvoir arriver aussi bien avec la parcelle principale qu'avec la voisine cochee.
export function rattacherElementsAuxParcelles(elements: ElementIgn[], parcelles: ParcelleCadastrale[]): void {
  elements.forEach(e=>{
    e.parcelles = new Set();
    parcelles.forEach(p=>{ if(polygonesSeTouchent(e.pts, p.pts)) e.parcelles.add(p.idu); });
  });
}

// PLU : zonage du Geoportail de l'urbanisme au point donne. urlfic pointe le reglement PDF reel
// de la commune - c'est le seul lien qui evite d'aller le chercher a la main.
export async function interrogerPlu(lon: number, lat: number): Promise<ZonagePlu> {
  const geom = encodeURIComponent(JSON.stringify({ type:'Point', coordinates:[lon, lat] }));
  const lire = async (endpoint: string): Promise<CollectionGeoJSON | null> => {
    try { return await fetchJSONReseau(GPU_URL + '/' + endpoint + '?geom=' + geom) as CollectionGeoJSON; }
    catch { return null; }   // le GPU est incomplet sur certaines communes : absence != panne
  };
  const [zonesRep, communeRep, prescRep, infoRep, docRep, supSRep, supLRep, supPRep, genSRep] = await Promise.all([
    lire('zone-urba'), lire('municipality'), lire('prescription-surf'), lire('info-surf'),
    lire('document'),
    // Servitudes d'utilite publique : l'ASSIETTE est l'emprise qui touche la parcelle, le
    // GENERATEUR ce qui la produit. C'est le generateur qui porte le type reel (typegen = "SPR",
    // "Site", "Monument historique"...) ; les deux se recoupent par idgen.
    lire('assiette-sup-s'), lire('assiette-sup-l'), lire('assiette-sup-p'), lire('generateur-sup-s')
  ]);
  const zones: ZoneUrba[] = ((zonesRep && zonesRep.features) || []).map(f=>{
    const p = f.properties || {};
    return {
      libelle: (p.libelle as string) || '', libelong: (p.libelong as string) || '', typezone: (p.typezone as string) || '',
      partition: (p.partition as string) || '', urlfic: (p.urlfic as string) || '', nomfic: (p.nomfic as string) || '', datappro: (p.datappro as string) || ''
    };
  });
  const commune = (communeRep && communeRep.features && communeRep.features[0] && communeRep.features[0].properties) || null;
  const prescriptions: PrescriptionPlu[] = ((prescRep && prescRep.features) || []).map(f=>{
    const p = f.properties || {};
    return { libelle: (p.libelle as string) || (p.txt as string) || '', typepsc: (p.typepsc as string) || '', urlfic: (p.urlfic as string) || '' };
  });
  const informations: InformationPlu[] = ((infoRep && infoRep.features) || []).map(f=>{
    const p = f.properties || {};
    return { libelle: (p.libelle as string) || (p.txt as string) || '', typeinf: (p.typeinf as string) || '', nomfic: (p.nomfic as string) || '', urlfic: (p.urlfic as string) || '' };
  });
  const generateurs: Record<string, Record<string, unknown>> = {};
  ((genSRep && genSRep.features) || []).forEach(f=>{
    const p = f.properties || {};
    if(p.idgen) generateurs[p.idgen as string] = p;
  });
  const servitudes: ServitudePlu[] = [];
  ([[supSRep,'surfacique'], [supLRep,'lineaire'], [supPRep,'ponctuelle']] as [CollectionGeoJSON | null, string][]).forEach(([rep, forme])=>{
    ((rep && rep.features) || []).forEach(f=>{
      const p = f.properties || {};
      const g = generateurs[p.idgen as string] || {};
      servitudes.push({
        type: ((p.suptype as string) || '').toUpperCase(),   // AC1, AC2, AC4 (SPR), PT1, I4...
        nom: (p.nomsuplitt as string) || (p.nomass as string) || '',
        assiette: (p.typeass as string) || '',               // "Perimetre du SPR", "Enceinte du site"...
        forme,
        generateur: (g.typegen as string) || '',             // "SPR", "Site", "Monument historique"...
        nature: (g.type as string) || '',                    // "Inscrit", "Classe"...
        source: (g.srcgeogen as string) || (p.srcgeoass as string) || '',
        fichier: (p.fichier as string) || '',
        partition: (p.partition as string) || '',
        urlreg: (p.urlreg as string) || (g.urlreg as string) || ''
      });
    });
  });
  // Un SPR est une servitude AC4 : il n'existe pas d'endpoint dedie, on le reconnait a son type -
  // c'est ce que porte la donnee elle-meme.
  const spr = servitudes.filter(s=>s.type === 'AC4' || /SPR/i.test(s.generateur) || /SPR/i.test(s.assiette));
  const doc = (docRep && docRep.features && docRep.features[0] && docRep.features[0].properties) || null;
  return {
    zones, prescriptions, informations, servitudes, spr,
    document: doc ? { nom: (doc.name as string) || '', type: (doc.du_type as string) || '', partition: (doc.partition as string) || '' } : null,
    commune: commune ? { nom: (commune.name as string) || '', insee: (commune.insee as string) || '', rnu: !!(commune.is_rnu === true || commune.is_rnu === 'True') } : null,
    interrogeLe: new Date().toISOString(),
    lon, lat
  };
}
export function lienGeoportailUrbanisme(lon: number, lat: number): string {
  return 'https://www.geoportail-urbanisme.gouv.fr/map/#tile=1&lon=' + lon.toFixed(6) + '&lat=' + lat.toFixed(6) + '&zoom=18';
}
// Page "territoire" du Geoportail de l'urbanisme : c'est la que se telechargent le reglement, les
// annexes et les actes des servitudes de la commune - la seule page qui les rassemble.
export function lienTerritoireUrbanisme(insee: string | null | undefined): string {
  return insee ? 'https://www.geoportail-urbanisme.gouv.fr/territoire/' + insee : '';
}

