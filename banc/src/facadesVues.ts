// Quelles vues d'une photo de rue montrent une facade (demande du proprietaire, 15 novembre 2026 : « sur la zone selectionnee les photos
// proposees sont des facades de maison ou d'immeuble, pas la route ou la campagne »). Le tri se fait par la geometrie, pas par l'image :
// les emprises des batiments de la BD TOPO de l'IGN (WFS de la Geoplateforme, le meme hote que le cadastre, sans cle), et ce que le champ
// d'une vue en rencontre. Un 360 tourne en plus chaque vue vers le batiment le plus present de son cote. Sans DOM, testable seul
// (banc/tests/facadesVues.test.ts). On ne modelise ni les haies ni les arbres : une maison derriere une haie compte comme vue.
// Depuis le 15 novembre 2026 (« tri par la geometrie ») : ce qui n'est pas une maison s'ecarte par ce que la BD TOPO en dit
// (`pasUneMaison`), une photo plate se juge par ce que la facade remplit de son cadre, et chaque vue gardee porte une note de 0 a 100.

import { CHAMP_VUE, type PhotoRue, type VueAExtraire } from './panoramax.js';
import { WFS_URL, type Ll } from './parcelles.js';

export const COUCHE_BATIMENTS = 'BDTOPO_V3:batiment';

/** En deca, la photo est collee au mur (ou dessous : un porche) : on n'y lit pas une facade. */
export const DISTANCE_MIN_M = 3;
/** Au-dela, la facade est trop petite dans le cadre pour y marquer des fenetres. */
export const DISTANCE_MAX_M = 40;
/** La part du champ (75 degres) que des batiments a portee doivent couvrir : un coin de batiment au bord du cadre ne suffit pas. */
export const PART_DU_CHAMP_MIN = 0.25;
/**
 * La meme part pour une photo plate, qu'on ne peut pas tourner vers sa facade : la moitie du cadre. Vu sur la rue de Rivoli (15 novembre
 * 2026) : au quart, les photos prises dans l'axe a un carrefour passaient pour un immeuble d'angle au bord d'un cadre plein de chaussee.
 */
export const PART_DU_CHAMP_MIN_PLATE = 0.5;
/**
 * La part du cadre (largeur et hauteur) que la facade doit remplir dans une photo plate. Vu sur la rue de Rivoli (15 novembre 2026) :
 * une photo prise d'un passage pieton montre l'immeuble d'en face au fond d'un cadre plein de chaussee ; la moitie du champ en largeur
 * y est, mais pas le tiers de l'image.
 */
export const CADRE_MIN_PLATE = 0.3;
/** Au-dela, une photo plate ne montre pas une facade mais une rue : elle ne se tourne pas, et le bas du cadre est de la chaussee. */
export const DISTANCE_MAX_PLATE_M = 30;
/** En deca, ce n'est ni une maison ni un immeuble : un abri de jardin, un transformateur. */
export const SURFACE_MIN_M2 = 20;
/**
 * L'angle minimal entre le regard et le mur : en deca le mur est vu en enfilade (la photo qui regarde l'axe d'une rue bordee de maisons
 * ne montre que la route).
 */
export const INCIDENCE_MIN_DEG = 35;
/** De combien une vue de cote d'un 360 peut quitter les 90 degres de la rue pour mettre la facade au milieu du cadre. */
export const ECART_VISEE_MAX_DEG = 35;

export interface Batiment {
  id: string;
  /** Le contour exterieur, en degres (les cours interieures ne se voient pas de la rue). */
  contour: Ll[];
  /** Ce que la BD TOPO dit du batiment, quand elle le dit : sa nature, ses deux usages, sa hauteur (m), ses logements et ses etages. */
  nature?: string | null;
  usage1?: string | null;
  usage2?: string | null;
  hauteur?: number | null;
  logements?: number | null;
  etages?: number | null;
}

interface Emprise { sud: number; ouest: number; nord: number; est: number }

/** Les batiments d'une emprise (degres), par pages : l'identifiant, ce qui dit si c'est une maison, et la geometrie. */
export function urlBatiments(e: Emprise, limite = 1000, debut = 0): string {
  const bbox = [e.sud, e.ouest, e.nord, e.est].map((v) => v.toFixed(6)).join(',') + ',urn:ogc:def:crs:EPSG::4326';
  return WFS_URL + '?' + new URLSearchParams({ SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: COUCHE_BATIMENTS, OUTPUTFORMAT: 'application/json', PROPERTYNAME: 'cleabs,construction_legere,nature,usage_1,usage_2,hauteur,nombre_de_logements,nombre_d_etages,geometrie', COUNT: String(limite), STARTINDEX: String(debut), BBOX: bbox }).toString();
}

const texte = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const nombre = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Les batiments d'une reponse du WFS (GeoJSON, coordonnees lon, lat, altitude) : un par polygone. Les constructions legeres (hangars
 * ouverts, abris, serres) sont laissees : ce ne sont pas des facades de maison ou d'immeuble.
 */
export function lireBatiments(json: unknown): Batiment[] {
  const feats = ((json as { features?: unknown[] })?.features ?? []) as { id?: unknown; properties?: Record<string, unknown>; geometry?: { type?: string; coordinates?: unknown } }[];
  const out: Batiment[] = [];
  for (const f of feats) {
    const g = f.geometry, p = f.properties ?? {};
    const id = typeof p.cleabs === 'string' ? p.cleabs : typeof f.id === 'string' ? f.id : null;
    if (!id || p.construction_legere === true) continue;
    const attributs = { nature: texte(p.nature), usage1: texte(p.usage_1), usage2: texte(p.usage_2), hauteur: nombre(p.hauteur), logements: nombre(p.nombre_de_logements), etages: nombre(p.nombre_d_etages) };
    const polygones = (g?.type === 'MultiPolygon' ? (g.coordinates as number[][][][]) : g?.type === 'Polygon' ? [g.coordinates as number[][][]] : []) ?? [];
    polygones.forEach((poly, k) => {
      const contour = (poly?.[0] ?? []).filter((c) => typeof c[0] === 'number' && typeof c[1] === 'number').map((c) => ({ lon: c[0] as number, lat: c[1] as number }));
      if (contour.length >= 3) out.push({ id: k ? `${id}#${k}` : id, contour, ...attributs });
    });
  }
  return out;
}

/**
 * Tous les batiments d'une emprise, page apres page comme le cadastre (`lireLesParcelles`). `tronque` : il en reste que l'on n'a pas lus ;
 * l'appelant ne filtre alors rien (des donnees partielles ecarteraient des facades qui existent).
 */
export async function lireLesBatiments(e: Emprise, lire: (url: string) => Promise<unknown>, pages = 5, parPage = 1000): Promise<{ batiments: Batiment[]; tronque: boolean }> {
  const vus = new Map<string, Batiment>();
  for (let k = 0; k < pages; k++) {
    const json = await lire(urlBatiments(e, parPage, k * parPage));
    const recus = ((json as { features?: unknown[] })?.features ?? []).length;
    for (const b of lireBatiments(json)) vus.set(b.id, b);
    const total = (json as { numberMatched?: unknown })?.numberMatched;
    const reste = typeof total === 'number' ? total > (k + 1) * parPage : recus >= parPage;
    if (!reste || !recus) return { batiments: [...vus.values()], tronque: false };
  }
  return { batiments: [...vus.values()], tronque: true };
}

/**
 * « Pas des maisons » (15 novembre 2026). Vu sur le vrai reseau : en campagne (48.12612, 2.88168), cinq vues gardees montraient un
 * local technique de 51 m2 (usage « Commercial et services », 3,7 m de haut, aucun logement). La BD TOPO dit pour chaque batiment sa
 * nature (presque toujours « Indifferenciee »), un ou deux usages, sa hauteur, ses logements et ses etages ; rien de plus fin (ni
 * « transformateur », ni « garage »). La regle s'en tient a ce qu'elle dit, et garde dans le doute : un usage « Indifferencie » ou
 * absent (frequent a la campagne, ou les fichiers fonciers ne sont pas apparies) n'ecarte rien a lui seul.
 */
/** Les natures qui ne sont ni une maison ni un immeuble. */
export const NATURES_ECARTEES: readonly string[] = ['Serre', 'Silo', 'Tribune', 'Fort, blockhaus, casemate', 'Arène ou théâtre antique', 'Arc de triomphe', 'Moulin à vent'];
/** Les usages qui, sans logement, ne sont pas une facade de maison : hangars agricoles, ateliers et usines, gymnases. */
export const USAGES_ECARTES: readonly string[] = ['Agricole', 'Industriel', 'Sportif'];
/** Une annexe (garage, dependance) plus petite ou plus basse que cela n'est pas une facade ; une grande dependance haute se garde. */
export const SURFACE_ANNEXE_MAX_M2 = 60;
/** Un petit batiment bas sans logement ni usage d'habitation : un local technique, un transformateur, un kiosque. */
export const SURFACE_LOCAL_MAX_M2 = 80;
export const HAUTEUR_LOCAL_MAX_M = 5;
/** Sans hauteur connue, on n'ecarte comme local que les tres petits dont l'usage est dit (commerce, culte) : une maison de campagne mal renseignee fait plus de 40 m2. */
export const SURFACE_LOCAL_SANS_HAUTEUR_M2 = 40;

export type RaisonDEcart = 'nature' | 'usage' | 'annexe' | 'local';

/**
 * Pourquoi ce batiment n'est pas une maison ni un immeuble ; null s'il en est un (ou si rien ne dit le contraire). Tout ce qui loge
 * quelqu'un se garde d'abord : une maison, un immeuble, un commerce en rez-de-chaussee d'immeuble (« Residentiel » en premier ou en
 * second usage, ou au moins un logement).
 */
export function pasUneMaison(b: Batiment, surface = surfaceM2(b.contour)): RaisonDEcart | null {
  if (b.nature && NATURES_ECARTEES.includes(b.nature)) return 'nature';
  if (b.usage1 === 'Résidentiel' || b.usage2 === 'Résidentiel' || (b.logements ?? 0) > 0) return null;
  if (b.usage1 && USAGES_ECARTES.includes(b.usage1)) return 'usage';
  const basse = typeof b.hauteur === 'number' && b.hauteur < HAUTEUR_LOCAL_MAX_M;
  if (b.usage1 === 'Annexe') return surface < SURFACE_ANNEXE_MAX_M2 || basse ? 'annexe' : null;
  if ((basse && surface < SURFACE_LOCAL_MAX_M2) || (b.hauteur == null && !!b.usage1 && b.usage1 !== 'Indifférencié' && surface < SURFACE_LOCAL_SANS_HAUTEUR_M2)) return 'local';
  return null;
}

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const norm = (a: number) => ((a % 360) + 360) % 360;
/** Le cote des cases du rangement des murs, en metres : une photo ne lit que les murs des cases a sa portee. */
const CASE_M = 50;

interface Arete { ax: number; ay: number; bx: number; by: number; b: number }

/**
 * Les murs des batiments, en metres autour d'une origine, ranges par cases. `facade[b]` : le batiment est une maison ou un immeuble ;
 * les autres (garage, local technique, hangar) restent dans la scene parce qu'ils cachent ce qui est derriere eux, sans rien montrer.
 */
export interface Scene { origine: Ll; batiments: Batiment[]; facade: boolean[]; aretes: Arete[]; cases: Map<string, number[]> }

const enM = (p: Ll, o: Ll) => ({ x: rad(p.lon - o.lon) * R * Math.cos(rad(o.lat)), y: rad(p.lat - o.lat) * R });

/** La surface d'un contour, en metres carres. */
export function surfaceM2(contour: readonly Ll[]): number {
  const o = contour[0];
  if (!o) return 0;
  const c = contour.map((p) => enM(p, o));
  let s = 0;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) s += ((c[j] as { x: number }).x * (c[i] as { y: number }).y) - ((c[i] as { x: number }).x * (c[j] as { y: number }).y);
  return Math.abs(s) / 2;
}

/** Range les murs des batiments assez grands pour etre une maison ; les petits (abris) ne comptent pas et ne cachent rien. */
export function ranger(batiments: readonly Batiment[]): Scene {
  const mesures = batiments.map((b) => ({ b, surface: surfaceM2(b.contour) })).filter((m) => m.surface >= SURFACE_MIN_M2);
  const gardes = mesures.map((m) => m.b), facade = mesures.map((m) => pasUneMaison(m.b, m.surface) === null);
  const origine = gardes[0]?.contour[0] ?? { lat: 0, lon: 0 };
  const aretes: Arete[] = [], cases = new Map<string, number[]>();
  gardes.forEach((bat, b) => {
    const c = bat.contour.map((p) => enM(p, origine));
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
      const p = c[j] as { x: number; y: number }, q = c[i] as { x: number; y: number };
      if (p.x === q.x && p.y === q.y) continue;
      const n = aretes.push({ ax: p.x, ay: p.y, bx: q.x, by: q.y, b }) - 1;
      for (let x = Math.floor(Math.min(p.x, q.x) / CASE_M); x <= Math.floor(Math.max(p.x, q.x) / CASE_M); x++) {
        for (let y = Math.floor(Math.min(p.y, q.y) / CASE_M); y <= Math.floor(Math.max(p.y, q.y) / CASE_M); y++) {
          const cle = x + ':' + y, l = cases.get(cle);
          if (l) l.push(n); else cases.set(cle, [n]);
        }
      }
    }
  });
  return { origine, batiments: gardes, facade, aretes, cases };
}

/** Les murs a portee d'un point (ceux des cases que touche le carre de `portee` autour de lui). */
function mursProches(s: Scene, x: number, y: number, portee = DISTANCE_MAX_M): Arete[] {
  const vus = new Set<number>();
  for (let cx = Math.floor((x - portee) / CASE_M); cx <= Math.floor((x + portee) / CASE_M); cx++) {
    for (let cy = Math.floor((y - portee) / CASE_M); cy <= Math.floor((y + portee) / CASE_M); cy++) {
      for (const n of s.cases.get(cx + ':' + cy) ?? []) vus.add(n);
    }
  }
  return [...vus].map((n) => s.aretes[n] as Arete);
}

/**
 * Y a-t-il une facade (le mur d'une maison ou d'un immeuble) a moins de `portee` metres de ce point ? De quoi dire, sur la carte, les
 * rues photographiees ou il n'y a rien a relever (couvertureFacades.ts).
 */
export function facadeAPortee(s: Scene, pos: Ll, portee = DISTANCE_MAX_M): boolean {
  const p = enM(pos, s.origine);
  for (const m of mursProches(s, p.x, p.y, portee)) {
    if (!s.facade[m.b]) continue;
    const ex = m.bx - m.ax, ey = m.by - m.ay, t = Math.max(0, Math.min(1, ((p.x - m.ax) * ex + (p.y - m.ay) * ey) / (ex * ex + ey * ey)));
    if (Math.hypot(p.x - m.ax - t * ex, p.y - m.ay - t * ey) <= portee) return true;
  }
  return false;
}

/** Un regard : le batiment qu'il rencontre d'abord (-1 : aucune facade), a quelle distance et sous quel angle avec le mur. */
interface Rayons { b: Int32Array; d: Float32Array; inc: Float32Array }

/**
 * Ce qu'un regard rencontre d'abord. Le batiment ne compte (son rang, sinon -1) que si c'est une facade a portee, ni trop pres, ni vue
 * en enfilade ; un mur qui ne compte pas cache quand meme ce qui est derriere lui.
 */
function lancer(s: Scene, murs: readonly Arete[], x: number, y: number, cap: number, r: Rayons, i: number): void {
  const dx = Math.sin(rad(cap)), dy = Math.cos(rad(cap));
  let d = Infinity, mur: Arete | null = null;
  for (const m of murs) {
    const ex = m.bx - m.ax, ey = m.by - m.ay, det = ex * dy - ey * dx;
    if (Math.abs(det) < 1e-9) continue;
    const t = (ex * (m.ay - y) - ey * (m.ax - x)) / det, u = (dx * (m.ay - y) - dy * (m.ax - x)) / det;
    if (t > 0 && t < d && u >= 0 && u <= 1) { d = t; mur = m; }
  }
  r.b[i] = -1;
  if (!mur || d < DISTANCE_MIN_M || d > DISTANCE_MAX_M || !s.facade[mur.b]) return;
  const ex = mur.bx - mur.ax, ey = mur.by - mur.ay;
  const incidence = deg(Math.asin(Math.min(1, Math.abs(ex * dy - ey * dx) / Math.hypot(ex, ey))));
  if (incidence < INCIDENCE_MIN_DEG) return;
  r.b[i] = mur.b; r.d[i] = d; r.inc[i] = incidence;
}

/** Les regards d'un balayage, un par degre de `de` a `de + n - 1`. */
function balayer(s: Scene, pos: Ll, de: number, n: number): Rayons {
  const p = enM(pos, s.origine), murs = mursProches(s, p.x, p.y);
  const r: Rayons = { b: new Int32Array(n).fill(-1), d: new Float32Array(n), inc: new Float32Array(n) };
  if (murs.length) for (let i = 0; i < n; i++) lancer(s, murs, p.x, p.y, de + i, r, i);
  return r;
}

const DEMI = Math.floor(CHAMP_VUE / 2);

/** Le batiment le plus present parmi des regards (de `a` a `b` compris), et le milieu de ce qu'on en voit (un rang dans le balayage). */
function plusPresent(vus: Int32Array, a: number, b: number): { b: number; milieu: number; n: number } | null {
  const par = new Map<number, { n: number; min: number; max: number }>();
  let couverts = 0;
  for (let i = Math.max(0, a); i <= Math.min(vus.length - 1, b); i++) {
    const v = vus[i] as number;
    if (v < 0) continue;
    couverts++;
    const e = par.get(v);
    if (e) { e.n++; e.max = i; } else par.set(v, { n: 1, min: i, max: i });
  }
  let mieux: { b: number; milieu: number; n: number } | null = null;
  for (const [bat, e] of par) if (!mieux || e.n > mieux.n) mieux = { b: bat, milieu: (e.min + e.max) / 2, n: e.n };
  return mieux ? { ...mieux, n: couverts } : null;
}

/** La hauteur de l'objectif au-dessus du sol (une voiture de releve, un velo, un pieton : entre 1,5 et 2,5 m). */
export const HAUTEUR_APPAREIL_M = 2;
/** La hauteur d'un batiment dont la BD TOPO ne dit rien : un rez-de-chaussee et un etage. */
export const HAUTEUR_PAR_DEFAUT_M = 6;

export interface Regard {
  /** La part du champ (0 a 1) couverte par des batiments a portee, vus assez de face. */
  part: number;
  /** Le batiment le plus present dans le champ ; null sans aucun. */
  batiment: string | null;
  facade: boolean;
  /** Du batiment le plus present : sa distance et l'angle du regard avec son mur (90 : de face), en moyenne sur ce qu'on en voit. */
  distance: number;
  incidence: number;
  /** La part du cadre (largeur et hauteur, 0 a 1) que les facades remplissent : le reste est de la chaussee, du ciel ou du vide. */
  cadre: number;
}

/** Le cadre d'une vue : son champ horizontal, de combien elle regarde vers le haut, et sa forme (largeur sur hauteur). */
export interface Cadre { champ: number; tangage: number; forme: number }
/** Une vue tiree d'un 360 : 75 degres, 8 vers le haut, en 4/3 (panoramiques.tsx). Une photo plate : son champ, a l'horizontale. */
export const CADRE_VUE: Cadre = { champ: CHAMP_VUE, tangage: 8, forme: 4 / 3 };
export const cadrePlat = (champ: number, forme = 4 / 3): Cadre => ({ champ: Math.max(30, Math.min(120, champ)), tangage: 0, forme });

/** La part de la hauteur du cadre qu'occupe un mur de hauteur `h` a `d` metres : du pied (sous l'horizon) au faite. */
function partEnHauteur(d: number, h: number, c: Cadre): number {
  const demi = deg(Math.atan(Math.tan(rad(c.champ / 2)) / c.forme));
  const bas = Math.max(c.tangage - demi, -deg(Math.atan(HAUTEUR_APPAREIL_M / d))), haut = Math.min(c.tangage + demi, deg(Math.atan((h - HAUTEUR_APPAREIL_M) / d)));
  return Math.max(0, haut - bas) / (2 * demi);
}

/** Ce que des regards (du rang `a` au rang `b`) voient des batiments. */
function resumer(s: Scene, r: Rayons, a: number, b: number, c: Cadre): Regard {
  const m = plusPresent(r.b, a, b), n = b - a + 1;
  let cadre = 0, distance = 0, incidence = 0, k = 0;
  for (let i = Math.max(0, a); i <= Math.min(r.b.length - 1, b); i++) {
    const v = r.b[i] as number;
    if (v < 0) continue;
    cadre += partEnHauteur(r.d[i] as number, (s.batiments[v] as Batiment).hauteur ?? HAUTEUR_PAR_DEFAUT_M, c);
    if (v === m?.b) { distance += r.d[i] as number; incidence += r.inc[i] as number; k++; }
  }
  const part = (m?.n ?? 0) / n;
  return { part, batiment: m ? (s.batiments[m.b] as Batiment).id : null, facade: part >= PART_DU_CHAMP_MIN, distance: k ? distance / k : 0, incidence: k ? incidence / k : 0, cadre: cadre / n };
}

/** Ce qu'une vue tournee vers `cap` voit des batiments, depuis `pos` (par defaut, une vue de 75 degres tiree d'un 360). */
export function regarder(s: Scene, pos: Ll, cap: number, c: Cadre = CADRE_VUE): Regard {
  const demi = Math.floor(c.champ / 2), r = balayer(s, pos, cap - demi, 2 * demi + 1);
  return resumer(s, r, 0, 2 * demi, c);
}

/**
 * La vue de cote d'un 360 (`cote` : les 90 degres de la rue), tournee vers le milieu de ce qu'on voit du batiment le plus present de ce
 * cote, de ECART_VISEE_MAX_DEG au plus ; si la vue tournee ne montre pas assez de batiment, celle a 90 degres ; null si aucune.
 */
export function viserLaFacade(s: Scene, pos: Ll, cote: number): ({ cap: number } & Regard & { batiment: string }) | null {
  const portee = ECART_VISEE_MAX_DEG + DEMI, vus = balayer(s, pos, cote - portee, 2 * portee + 1);
  const present = plusPresent(vus.b, 0, vus.b.length - 1);
  if (!present) return null;
  const ecart = Math.max(-ECART_VISEE_MAX_DEG, Math.min(ECART_VISEE_MAX_DEG, Math.round(present.milieu - portee)));
  for (const e of ecart ? [ecart, 0] : [0]) {
    const m = resumer(s, vus, portee + e - DEMI, portee + e + DEMI, CADRE_VUE);
    if (m.facade && m.batiment) return { ...m, batiment: m.batiment, cap: norm(cote + e) };
  }
  return null;
}

/**
 * Une photo plate montre-t-elle une facade ? Elle ne se tourne pas : il lui faut la moitie de son champ (le sien, pas les 75 degres
 * d'une vue de 360), une facade a moins de DISTANCE_MAX_PLATE_M, et que cette facade remplisse CADRE_MIN_PLATE de l'image. Les deux
 * dernieres ecartent la photo prise de la chaussee vers l'immeuble du bout de la rue. Il faut aussi que son cap soit sur (`vuesDeFacade`).
 */
export const plateMontreUneFacade = (r: Regard): boolean => r.part >= PART_DU_CHAMP_MIN_PLATE && r.distance <= DISTANCE_MAX_PLATE_M && r.cadre >= CADRE_MIN_PLATE;

/**
 * La note d'une vue, de 0 a 100 (15 novembre 2026) : de quoi proposer d'abord les vues ou la facade se lit le mieux. Quatre parts :
 * la distance a la facade (30 : le mieux de 8 a 20 m, la ou une maison tient dans le cadre avec ses fenetres lisibles), la face vue
 * de front (25 : de l'incidence minimale a 90 degres), la part du cadre que le batiment remplit (35 : pleine a 50 %,
 * ce que remplit une maison a etage vue de face a dix metres), et la date de
 * la photo (10 : pleine a moins de deux ans, nulle a dix ; la moitie sans date). Elle ne sait rien des haies ni des arbres.
 */
export const POIDS_NOTE = { distance: 30, incidence: 25, cadre: 35, date: 10 } as const;
export const DISTANCE_IDEALE_M: readonly [number, number] = [8, 20];
export const CADRE_PLEIN = 0.5;
export const AGE_PLEIN_ANS = 2, AGE_NUL_ANS = 10;

const entre = (v: number) => Math.max(0, Math.min(1, v));

export function noteDeVue(r: Pick<Regard, 'distance' | 'incidence' | 'cadre'>, date: string | null, aujourdhui: Date): number {
  const [pres, loin] = DISTANCE_IDEALE_M;
  const distance = r.distance < pres ? entre((r.distance - DISTANCE_MIN_M) / (pres - DISTANCE_MIN_M)) : 1 - entre((r.distance - loin) / (DISTANCE_MAX_M - loin));
  const incidence = entre((r.incidence - INCIDENCE_MIN_DEG) / (90 - INCIDENCE_MIN_DEG));
  const t = date ? Date.parse(date) : NaN, ans = (aujourdhui.getTime() - t) / (365.25 * 24 * 3600 * 1000);
  const age = Number.isNaN(t) ? 0.5 : 1 - entre((ans - AGE_PLEIN_ANS) / (AGE_NUL_ANS - AGE_PLEIN_ANS));
  // La distance et l'incidence ne tombent pas a zero : une vue gardee par le tri reste une facade lisible.
  // Trop pres, le cadre est plein d'un morceau de mur (une porte, un porche) : sa part ne vaut qu'a mesure qu'on recule.
  const recul = r.distance < pres ? 0.4 + 0.6 * distance : 1;
  return Math.round(POIDS_NOTE.distance * (0.2 + 0.8 * distance) + POIDS_NOTE.incidence * incidence + POIDS_NOTE.cadre * entre(r.cadre / CADRE_PLEIN) * recul + POIDS_NOTE.date * age);
}

/**
 * Les vues d'une photo qui montrent une facade, parmi celles de la visee : une vue de cote d'un 360 se tourne vers sa facade ; la vue
 * droit vers la parcelle et la photo plate gardent leur cap (les regles de la parcelle visee restent) et ne se gardent que si elles
 * montrent un batiment. Chaque vue gardee dit son batiment, sa note et sa distance a la facade. Les vues choisies a la main ne passent
 * pas par ici : elles ne sont jamais deplacees ni filtrees.
 */
export function vuesDeFacade(s: Scene, p: Pick<PhotoRue, 'lat' | 'lon' | 'azimut'> & Partial<Pick<PhotoRue, 'champ' | 'date' | 'capSur' | 'forme'>>, vues: readonly VueAExtraire[], aujourdhui = new Date()): VueAExtraire[] {
  const pos = { lat: p.lat, lon: p.lon };
  const notee = (v: VueAExtraire, r: Regard & { batiment: string }, cap = v.cap): VueAExtraire => ({ vue: v.vue, cap, batiment: r.batiment, note: noteDeVue(r, p.date ?? null, aujourdhui), distanceFacade: Math.round(r.distance * 10) / 10 });
  return vues.flatMap((v): VueAExtraire[] => {
    if ((v.vue === 'gauche' || v.vue === 'droite') && p.azimut !== null) {
      const f = viserLaFacade(s, pos, norm(p.azimut + (v.vue === 'gauche' ? -90 : 90)));
      return f ? [notee(v, f, f.cap)] : [];
    }
    const plate = v.vue === 'photo';
    // Une photo plate dont le cap est douteux (panoramax.ts::capsDouteux) : on ne sait pas ou elle regarde, on n'affirme pas une facade.
    if (plate && p.capSur === false) return [];
    const r = regarder(s, pos, v.cap, plate ? cadrePlat(p.champ ?? CHAMP_VUE, p.forme) : CADRE_VUE);
    return r.batiment && (plate ? plateMontreUneFacade(r) : r.facade) ? [notee(v, { ...r, batiment: r.batiment })] : [];
  });
}
