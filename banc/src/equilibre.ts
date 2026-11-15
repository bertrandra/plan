// L'equilibre du jeu de donnees (demande du proprietaire, 15 novembre 2026 : « niveau suivant », n° 7) : ce que le banc contient deja,
// compte par ce que les metadonnees portent vraiment — la source, le lieu (departement et region, deduits de la position sans service a
// interroger : departements.ts), la saison et l'annee de la date, le type de vue (360 ou plate) et l'etat d'avancement. Un jeu qui
// n'a que des pavillons d'Ile-de-France pris en ete n'apprend pas les immeubles de Marseille en hiver : on le voit ici avant d'importer.
// Sans DOM, testable seul (banc/tests/equilibre.test.ts).

import { versEcran, type P, type Taille, type VueCarte } from './carte.js';
import { DEPARTEMENTS } from './departements.js';
import { TYPES_DE_BATIMENT, typeDeBatiment } from './murs.js';
import type { MetaImage, Statut } from './types.js';

export interface Lieu { departement: string; nom: string; region: string }

/** Les regions de la metropole et leurs departements (le decoupage de 2016). */
const REGIONS: Record<string, string[]> = {
  'Auvergne-Rhône-Alpes': ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'],
  'Bourgogne-Franche-Comté': ['21', '25', '39', '58', '70', '71', '89', '90'],
  'Bretagne': ['22', '29', '35', '56'],
  'Centre-Val de Loire': ['18', '28', '36', '37', '41', '45'],
  'Corse': ['2A', '2B'],
  'Grand Est': ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'],
  'Hauts-de-France': ['02', '59', '60', '62', '80'],
  'Île-de-France': ['75', '77', '78', '91', '92', '93', '94', '95'],
  'Normandie': ['14', '27', '50', '61', '76'],
  'Nouvelle-Aquitaine': ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'],
  'Occitanie': ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'],
  'Pays de la Loire': ['44', '49', '53', '72', '85'],
  'Provence-Alpes-Côte d’Azur': ['04', '05', '06', '13', '83', '84'],
};
const REGION_DE = new Map(Object.entries(REGIONS).flatMap(([r, l]) => l.map((d) => [d, r] as const)));
export const NOMS_REGIONS: readonly string[] = Object.keys(REGIONS);

/** L'outre-mer : une boite par departement suffit (des iles, loin de tout autre). */
const OUTRE_MER: { code: string; nom: string; sud: number; nord: number; ouest: number; est: number }[] = [
  { code: '971', nom: 'Guadeloupe', sud: 15.8, nord: 16.6, ouest: -61.9, est: -60.9 },
  { code: '972', nom: 'Martinique', sud: 14.3, nord: 14.95, ouest: -61.3, est: -60.7 },
  { code: '973', nom: 'Guyane', sud: 2, nord: 6, ouest: -54.7, est: -51.5 },
  { code: '974', nom: 'La Réunion', sud: -21.5, nord: -20.8, ouest: 55.1, est: 55.9 },
  { code: '976', nom: 'Mayotte', sud: -13.1, nord: -12.5, ouest: 44.9, est: 45.4 },
];

/** Jusqu'ou une photo hors de tout contour se range encore dans le plus proche, en milliemes de degre (5 km environ : la cote, la simplification). */
const TOLERANCE_BORD = 50;

interface Anneau { pts: number[]; x0: number; x1: number; y0: number; y1: number }
let anneaux: { code: string; nom: string; anneaux: Anneau[] }[] | null = null;
function contours() {
  return anneaux ??= DEPARTEMENTS.map((d) => ({ code: d.code, nom: d.nom, anneaux: d.anneaux.map((pts) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { const x = pts[i] ?? 0, y = pts[i + 1] ?? 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { pts, x0, x1, y0, y1 };
  }) }));
}

/** Le point est-il dans l'anneau (pair-impair) ; et sa distance au bord, en milliemes de degre (la longitude ramenee a la latitude). */
function dansAnneau(a: Anneau, x: number, y: number): boolean {
  if (x < a.x0 || x > a.x1 || y < a.y0 || y > a.y1) return false;
  let dedans = false;
  const n = a.pts.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = a.pts[i] ?? 0, yi = a.pts[i + 1] ?? 0, xj = a.pts[j] ?? 0, yj = a.pts[j + 1] ?? 0;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

function distanceAuBord(a: Anneau, x: number, y: number, kx: number): number {
  if (x < a.x0 - TOLERANCE_BORD / kx || x > a.x1 + TOLERANCE_BORD / kx || y < a.y0 - TOLERANCE_BORD || y > a.y1 + TOLERANCE_BORD) return Infinity;
  let d = Infinity;
  const n = a.pts.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const ax = ((a.pts[j] ?? 0) - x) * kx, ay = (a.pts[j + 1] ?? 0) - y, bx = ((a.pts[i] ?? 0) - x) * kx, by = (a.pts[i + 1] ?? 0) - y;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    d = Math.min(d, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return d;
}

/**
 * Le departement et la region d'une position : celui dont le contour simplifie la contient, sinon le plus proche a moins de 5 km (une
 * photo du front de mer, ou tombee dans l'interstice de deux contours simplifies). Null ailleurs (hors de France). A un kilometre d'une
 * limite, la reponse peut etre celle du voisin : c'est un compte d'equilibre, pas un cadastre.
 */
export function lieuDe(lat: number, lon: number): Lieu | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  for (const o of OUTRE_MER) if (lat >= o.sud && lat <= o.nord && lon >= o.ouest && lon <= o.est) return { departement: o.code, nom: o.nom, region: 'Outre-mer' };
  const x = lon * 1000, y = lat * 1000;
  for (const d of contours()) if (d.anneaux.some((a) => dansAnneau(a, x, y))) return { departement: d.code, nom: d.nom, region: REGION_DE.get(d.code) ?? '?' };
  const kx = Math.cos((lat * Math.PI) / 180);
  let mieux: { code: string; nom: string } | null = null, dMin = TOLERANCE_BORD;
  for (const d of contours()) for (const a of d.anneaux) { const dist = distanceAuBord(a, x, y, kx); if (dist < dMin) { dMin = dist; mieux = d; } }
  return mieux ? { departement: mieux.code, nom: mieux.nom, region: REGION_DE.get(mieux.code) ?? '?' } : null;
}

export type Saison = 'hiver' | 'printemps' | 'ete' | 'automne';
export const SAISONS: readonly { cle: Saison; libelle: string }[] = [
  { cle: 'hiver', libelle: 'Hiver (déc. à fév.)' }, { cle: 'printemps', libelle: 'Printemps (mars à mai)' },
  { cle: 'ete', libelle: 'Été (juin à août)' }, { cle: 'automne', libelle: 'Automne (sept. à nov.)' },
];

/** L'annee et le mois (1 a 12) d'une date du banc (« 2018-03-21T… », celle de l'EXIF ou de Panoramax) ; null si elle ne se lit pas. */
export function anneeEtMois(date: string | null | undefined): { annee: number; mois: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(date ?? '');
  if (!m) return null;
  const annee = Number(m[1]), mois = Number(m[2]);
  return annee >= 1990 && annee <= 2100 && mois >= 1 && mois <= 12 ? { annee, mois } : null;
}

/** La saison d'un mois, dans l'hemisphere nord (les saisons du calendrier meteorologique : l'hiver de decembre a fevrier). */
export const saisonDuMois = (mois: number): Saison => (mois === 12 || mois <= 2 ? 'hiver' : mois <= 5 ? 'printemps' : mois <= 8 ? 'ete' : 'automne');

/** Les arbres sont-ils sans feuilles ce mois-la (novembre a mars, hemisphere nord) : les facades se voient mieux. */
export const sansFeuilles = (mois: number): boolean => mois >= 11 || mois <= 3;

/** Le type de vue : tiree d'un panoramique 360, ou une photo plate (l'iPhone, un fichier, une photo plate de Panoramax). */
export const typeDeVue = (m: MetaImage): '360' | 'plate' => (m.panoramax?.panoramique ? '360' : 'plate');

const LIBELLES_SOURCE: Record<MetaImage['source'], string> = { panoramax: 'Panoramax', iphone: 'iPhone', fichier: 'Fichier' };
/** Les etats dans l'ordre du travail, dits par ce qui attend la photo. */
export const ETATS: readonly { cle: Statut; libelle: string }[] = [
  { cle: 'importee', libelle: 'Importée, à redresser' }, { cle: 'redressee', libelle: 'Redressée, à valider' }, { cle: 'validee', libelle: 'Validée, à marquer' },
  { cle: 'brouillon', libelle: 'Brouillon, à relire' }, { cle: 'corrigee', libelle: 'Corrigée (dans le jeu)' },
];

export interface Compte { cle: string; libelle: string; n: number }
export interface PointImage { id: string; lat: number; lon: number }
export interface Equilibre {
  total: number;
  /** Ce que les metadonnees ne disent pas : autant de photos qui echappent aux comptes par lieu ou par saison. */
  sansPosition: number; sansDate: number; horsFrance: number;
  /** Les photos prises de novembre a mars (arbres sans feuilles), parmi celles qui ont une date. */
  sansFeuilles: number;
  /** Les photos dont le mur vise n'est pas connu (importees avant que l'import ne le garde, ou sans batiment dans le cadre). */
  sansMur: number;
  /** Par type de batiment (murs.ts::typeDeBatiment), parmi les photos dont le mur est connu. */
  batiment: Compte[];
  source: Compte[]; region: Compte[]; departement: Compte[]; saison: Compte[]; annee: Compte[]; vue: Compte[]; etat: Compte[];
  points: PointImage[];
}

export type Perimetre = 'toutes' | 'jeu';
/** Les photos comptees : toutes sauf les rejetees, ou seulement celles du jeu (corrigees, hors reserve : ce que l'export prend). */
export const duPerimetre = (images: readonly MetaImage[], p: Perimetre): MetaImage[] =>
  images.filter((m) => (p === 'jeu' ? m.statut === 'corrigee' && m.bloc !== 'reserve' : m.statut !== 'rejetee'));

const aPosition = (m: MetaImage): m is MetaImage & { lat: number; lon: number } => typeof m.lat === 'number' && typeof m.lon === 'number' && Number.isFinite(m.lat) && Number.isFinite(m.lon) && (m.lat !== 0 || m.lon !== 0);

/**
 * Les comptes d'un ensemble de photos. Les listes fermees (saison, type de vue, etat, source) gardent leurs lignes a zero : un zero est
 * ce qu'on cherche a voir ; les regions de la metropole aussi. Departements et annees ne montrent que ce qui existe, du plus fourni au moins.
 */
export function equilibre(images: readonly MetaImage[]): Equilibre {
  const compter = () => new Map<string, number>();
  const plus = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const batiment = compter(), source = compter(), region = compter(), dep = compter(), saison = compter(), annee = compter(), vue = compter(), etat = compter();
  const nomsDep = new Map<string, string>();
  const points: PointImage[] = [];
  let sansPosition = 0, sansDate = 0, horsFrance = 0, nus = 0, sansMur = 0;
  for (const m of images) {
    if (m.mur) plus(batiment, typeDeBatiment(m.mur)); else sansMur++;
    plus(source, m.source); plus(vue, typeDeVue(m)); plus(etat, m.statut);
    if (aPosition(m)) {
      points.push({ id: m.id, lat: m.lat, lon: m.lon });
      const l = lieuDe(m.lat, m.lon);
      if (l) { plus(region, l.region); plus(dep, l.departement); nomsDep.set(l.departement, l.nom); } else horsFrance++;
    } else sansPosition++;
    const d = anneeEtMois(m.date);
    if (d) { plus(saison, saisonDuMois(d.mois)); plus(annee, String(d.annee)); if (sansFeuilles(d.mois)) nus++; } else sansDate++;
  }
  const fermee = <K extends string>(m: Map<string, number>, l: readonly { cle: K; libelle: string }[]): Compte[] => l.map((x) => ({ ...x, n: m.get(x.cle) ?? 0 }));
  const parNombre = (a: Compte, b: Compte) => b.n - a.n || a.libelle.localeCompare(b.libelle, 'fr');
  const regions = [...NOMS_REGIONS, ...(region.has('Outre-mer') ? ['Outre-mer'] : [])];
  return {
    total: images.length, sansPosition, sansDate, horsFrance, sansFeuilles: nus, points, sansMur,
    batiment: fermee(batiment, TYPES_DE_BATIMENT),
    source: fermee(source, (['panoramax', 'iphone', 'fichier'] as const).map((cle) => ({ cle, libelle: LIBELLES_SOURCE[cle] }))),
    region: regions.map((r) => ({ cle: r, libelle: r, n: region.get(r) ?? 0 })).sort(parNombre),
    departement: [...dep].map(([cle, n]) => ({ cle, libelle: `${cle} · ${nomsDep.get(cle) ?? ''}`, n })).sort(parNombre),
    saison: fermee(saison, SAISONS),
    annee: [...annee].map(([cle, n]) => ({ cle, libelle: cle, n })).sort((a, b) => b.cle.localeCompare(a.cle)),
    vue: fermee(vue, [{ cle: '360', libelle: 'Vue tirée d’un 360' }, { cle: 'plate', libelle: 'Photo plate' }]),
    etat: fermee(etat, ETATS),
  };
}

export interface Amas { x: number; y: number; n: number; lat: number; lon: number }

/**
 * Les points de la carte, regroupes par cases de `pas` pixels de l'ecran : de loin, mille photos d'une ville sont un seul rond qui dit
 * leur nombre ; de pres, chacune a sa place. Chaque amas se pose au milieu de ses photos. Hors de l'ecran (a un pas pres), rien.
 */
export function amasser(points: readonly PointImage[], v: VueCarte, t: Taille, pas = 44): Amas[] {
  const cases = new Map<string, { sx: number; sy: number; slat: number; slon: number; n: number }>();
  for (const p of points) {
    const e: P = versEcran(p, v, t);
    if (e.x < -pas || e.y < -pas || e.x > t.l + pas || e.y > t.h + pas) continue;
    const k = Math.floor(e.x / pas) + ':' + Math.floor(e.y / pas);
    const c = cases.get(k) ?? { sx: 0, sy: 0, slat: 0, slon: 0, n: 0 };
    c.sx += e.x; c.sy += e.y; c.slat += p.lat; c.slon += p.lon; c.n++;
    cases.set(k, c);
  }
  return [...cases.values()].map((c) => ({ x: c.sx / c.n, y: c.sy / c.n, n: c.n, lat: c.slat / c.n, lon: c.slon / c.n })).sort((a, b) => a.n - b.n);
}

/** Le rayon du rond d'un amas, en pixels : il grandit comme la racine du nombre (l'aire dit le compte), borne pour rester lisible. */
export const rayonAmas = (n: number): number => Math.min(26, 7 + 3.2 * Math.sqrt(Math.max(0, n - 1)));

/** L'emprise de tous les points (null sans point), elargie pour qu'un point seul ne soit pas un zoom maximal. */
export function empriseDesPoints(points: readonly PointImage[]): { sud: number; ouest: number; nord: number; est: number } | null {
  if (!points.length) return null;
  let sud = Infinity, nord = -Infinity, ouest = Infinity, est = -Infinity;
  for (const p of points) { sud = Math.min(sud, p.lat); nord = Math.max(nord, p.lat); ouest = Math.min(ouest, p.lon); est = Math.max(est, p.lon); }
  const m = Math.max(0.02, (nord - sud) * 0.15, (est - ouest) * 0.15);
  return { sud: sud - m, ouest: ouest - m, nord: nord + m, est: est + m };
}
