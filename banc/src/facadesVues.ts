// Quelles vues d'une photo de rue montrent une facade (demande du proprietaire, 15 novembre 2026 : « sur la zone selectionnee les photos
// proposees sont des facades de maison ou d'immeuble, pas la route ou la campagne »). Le tri se fait par la geometrie, pas par l'image :
// les emprises des batiments de la BD TOPO de l'IGN (WFS de la Geoplateforme, le meme hote que le cadastre, sans cle), et ce que le champ
// d'une vue en rencontre. Un 360 tourne en plus chaque vue vers le batiment le plus present de son cote. Sans DOM, testable seul
// (banc/tests/facadesVues.test.ts). On ne modelise ni les haies ni les arbres : une maison derriere une haie compte comme vue.

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
}

interface Emprise { sud: number; ouest: number; nord: number; est: number }

/** Les batiments d'une emprise (degres), par pages : seuls l'identifiant, « construction legere » et la geometrie sont demandes. */
export function urlBatiments(e: Emprise, limite = 1000, debut = 0): string {
  const bbox = [e.sud, e.ouest, e.nord, e.est].map((v) => v.toFixed(6)).join(',') + ',urn:ogc:def:crs:EPSG::4326';
  return WFS_URL + '?' + new URLSearchParams({ SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: COUCHE_BATIMENTS, OUTPUTFORMAT: 'application/json', PROPERTYNAME: 'cleabs,construction_legere,geometrie', COUNT: String(limite), STARTINDEX: String(debut), BBOX: bbox }).toString();
}

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
    const polygones = (g?.type === 'MultiPolygon' ? (g.coordinates as number[][][][]) : g?.type === 'Polygon' ? [g.coordinates as number[][][]] : []) ?? [];
    polygones.forEach((poly, k) => {
      const contour = (poly?.[0] ?? []).filter((c) => typeof c[0] === 'number' && typeof c[1] === 'number').map((c) => ({ lon: c[0] as number, lat: c[1] as number }));
      if (contour.length >= 3) out.push({ id: k ? `${id}#${k}` : id, contour });
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

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const norm = (a: number) => ((a % 360) + 360) % 360;
/** Le cote des cases du rangement des murs, en metres : une photo ne lit que les murs des cases a sa portee. */
const CASE_M = 50;

interface Arete { ax: number; ay: number; bx: number; by: number; b: number }

/** Les murs des batiments, en metres autour d'une origine, ranges par cases. */
export interface Scene { origine: Ll; batiments: Batiment[]; aretes: Arete[]; cases: Map<string, number[]> }

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
  const gardes = batiments.filter((b) => surfaceM2(b.contour) >= SURFACE_MIN_M2);
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
  return { origine, batiments: gardes, aretes, cases };
}

/** Les murs a portee d'un point (ceux des cases que touche le carre de DISTANCE_MAX_M autour de lui). */
function mursProches(s: Scene, x: number, y: number): Arete[] {
  const vus = new Set<number>();
  for (let cx = Math.floor((x - DISTANCE_MAX_M) / CASE_M); cx <= Math.floor((x + DISTANCE_MAX_M) / CASE_M); cx++) {
    for (let cy = Math.floor((y - DISTANCE_MAX_M) / CASE_M); cy <= Math.floor((y + DISTANCE_MAX_M) / CASE_M); cy++) {
      for (const n of s.cases.get(cx + ':' + cy) ?? []) vus.add(n);
    }
  }
  return [...vus].map((n) => s.aretes[n] as Arete);
}

/**
 * Ce qu'un regard rencontre d'abord : le batiment (son rang), ou -1 quand le premier mur est hors de portee, trop pres, ou vu en
 * enfilade (il cache alors ce qui est derriere lui : on ne compte rien).
 */
function lancer(murs: readonly Arete[], x: number, y: number, cap: number): number {
  const dx = Math.sin(rad(cap)), dy = Math.cos(rad(cap));
  let d = Infinity, mur: Arete | null = null;
  for (const m of murs) {
    const ex = m.bx - m.ax, ey = m.by - m.ay, det = ex * dy - ey * dx;
    if (Math.abs(det) < 1e-9) continue;
    const t = (ex * (m.ay - y) - ey * (m.ax - x)) / det, u = (dx * (m.ay - y) - dy * (m.ax - x)) / det;
    if (t > 0 && t < d && u >= 0 && u <= 1) { d = t; mur = m; }
  }
  if (!mur || d < DISTANCE_MIN_M || d > DISTANCE_MAX_M) return -1;
  const ex = mur.bx - mur.ax, ey = mur.by - mur.ay;
  const incidence = (Math.asin(Math.min(1, Math.abs(ex * dy - ey * dx) / Math.hypot(ex, ey))) * 180) / Math.PI;
  return incidence >= INCIDENCE_MIN_DEG ? mur.b : -1;
}

/** Les regards d'un balayage, un par degre de `de` a `de + n - 1` : le batiment vu par chacun (-1 : aucun). */
function balayer(s: Scene, pos: Ll, de: number, n: number): number[] {
  const p = enM(pos, s.origine), murs = mursProches(s, p.x, p.y);
  return Array.from({ length: n }, (_, i) => (murs.length ? lancer(murs, p.x, p.y, de + i) : -1));
}

const DEMI = Math.floor(CHAMP_VUE / 2);

/** Le batiment le plus present parmi des regards (de `a` a `b` compris), et le milieu de ce qu'on en voit (un rang dans le balayage). */
function plusPresent(vus: readonly number[], a: number, b: number): { b: number; milieu: number; n: number } | null {
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

export interface Regard {
  /** La part du champ (0 a 1) couverte par des batiments a portee, vus assez de face. */
  part: number;
  /** Le batiment le plus present dans le champ ; null sans aucun. */
  batiment: string | null;
  facade: boolean;
}

/** Ce qu'une vue de 75 degres tournee vers `cap` voit des batiments, depuis `pos`. */
export function regarder(s: Scene, pos: Ll, cap: number): Regard {
  const vus = balayer(s, pos, cap - DEMI, 2 * DEMI + 1), m = plusPresent(vus, 0, vus.length - 1);
  const part = (m?.n ?? 0) / vus.length;
  return { part, batiment: m ? (s.batiments[m.b] as Batiment).id : null, facade: part >= PART_DU_CHAMP_MIN };
}

/**
 * La vue de cote d'un 360 (`cote` : les 90 degres de la rue), tournee vers le milieu de ce qu'on voit du batiment le plus present de ce
 * cote, de ECART_VISEE_MAX_DEG au plus ; si la vue tournee ne montre pas assez de batiment, celle a 90 degres ; null si aucune.
 */
export function viserLaFacade(s: Scene, pos: Ll, cote: number): { cap: number; batiment: string } | null {
  const portee = ECART_VISEE_MAX_DEG + DEMI, vus = balayer(s, pos, cote - portee, 2 * portee + 1);
  const present = plusPresent(vus, 0, vus.length - 1);
  if (!present) return null;
  const ecart = Math.max(-ECART_VISEE_MAX_DEG, Math.min(ECART_VISEE_MAX_DEG, Math.round(present.milieu - portee)));
  for (const e of ecart ? [ecart, 0] : [0]) {
    const m = plusPresent(vus, portee + e - DEMI, portee + e + DEMI);
    if (m && m.n / (2 * DEMI + 1) >= PART_DU_CHAMP_MIN) return { cap: norm(cote + e), batiment: (s.batiments[m.b] as Batiment).id };
  }
  return null;
}

/**
 * Les vues d'une photo qui montrent une facade, parmi celles de la visee : une vue de cote d'un 360 se tourne vers sa facade ; la vue
 * droit vers la parcelle et la photo plate gardent leur cap (les regles de la parcelle visee restent) et ne se gardent que si elles
 * montrent un batiment. Les vues choisies a la main ne passent pas par ici : elles ne sont jamais deplacees ni filtrees.
 */
export function vuesDeFacade(s: Scene, p: Pick<PhotoRue, 'lat' | 'lon' | 'azimut'>, vues: readonly VueAExtraire[]): VueAExtraire[] {
  const pos = { lat: p.lat, lon: p.lon };
  return vues.flatMap((v): VueAExtraire[] => {
    if ((v.vue === 'gauche' || v.vue === 'droite') && p.azimut !== null) {
      const f = viserLaFacade(s, pos, norm(p.azimut + (v.vue === 'gauche' ? -90 : 90)));
      return f ? [{ vue: v.vue, cap: f.cap, batiment: f.batiment }] : [];
    }
    const r = regarder(s, pos, v.cap);
    return r.part >= (v.vue === 'photo' ? PART_DU_CHAMP_MIN_PLATE : PART_DU_CHAMP_MIN) && r.batiment ? [{ ...v, batiment: r.batiment }] : [];
  });
}
