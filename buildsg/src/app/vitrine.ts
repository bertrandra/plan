// La vitrine : la Vue 3D du plan de demonstration, publique, faite pour etre encadree (2.2.1).
//
//   https://plan.raillard.org/?mode=demo&x=1024&y=768
//
// La page d'accueil du catalogue de la plateforme (backprod) montre Plan en marche dans un <iframe>.
// Il lui faut une adresse qui ne demande pas de compte, ne montre que la scene 3D, et a la taille
// qu'on lui donne. C'est celle-ci.
//
// **Ce qu'elle n'ouvre pas.** Pas de porte, donc pas de session : elle ne lit rien chez la
// plateforme et n'y ecrit rien — aucun depot n'est pose (io/api.ts), et le plan est en lecture
// seule (app/acces.ts). Ce qu'elle montre est le plan de demonstration embarque dans le fichier,
// deja public. Elle ne donne acces a aucune donnee qu'une personne aurait saisie.
//
// **Ce qu'elle regle autrement.** Les ombres sont cochees d'office : c'est une vitrine, et la
// scene sans ombre y parait plate. Dans l'atelier elles restent a la demande — elles coutent cher
// et changent a chaque heure (three/etat3d.ts).
//
// `x` et `y` sont la largeur et la hauteur de la scene, en pixels CSS, bornees ; sans elles, la
// scene prend la fenetre (ce qui est le cas utile dans un <iframe> deja dimensionne).
//
// `zoom` rapproche (> 1) ou eloigne (< 1) la camera du cadrage par defaut : `zoom=2` la met a mi-
// distance de ce qu'elle vise, `zoom=0.5` deux fois plus loin. Borne de 0,25 a 8 ; la virgule vaut
// le point.
//
// `orthophoto=y` pose la photo aerienne de l'IGN sous la scene, comme le fond orthophoto de
// l'atelier ; `orthophoto=n`, ou rien, s'en passe. Les tuiles viennent de data.geopf.fr : la scene
// s'ouvre sans elles, puis se reconstruit quand elles sont la, a la meme place de camera.
//
// `heureauto=y` fait courir le soleil sur la journee du jour, de `hrsstart` a `hrsend` (heures
// locales, `14`, `14:30` ou `14h30` ; par defaut 7 h et 20 h), en `duree` secondes (30 par defaut,
// de 5 a 3 600), puis recommence. La progression suit l'horloge, pas le nombre d'images : un onglet ralenti par le
// navigateur reprend a la bonne heure au lieu de rattraper son retard. `heureauto=n`, ou rien : le
// soleil reste a l'heure par defaut.
//
// `pdv` place la camera sur un point de vue du plan (les objets « Point de vue », fonction
// `camera`) : par son nom, sans egard aux majuscules ni aux accents (`pdv=entree`, `pdv=Fenetre
// cuisine`), ou par son rang dans la liste, a partir de 1 (`pdv=2`). Un point de vue inconnu laisse
// le cadrage par defaut. `zoom` s'applique ensuite, depuis ce point de vue.
//
// `file` montre une demo de l'admin au lieu de la demonstration integree : `file=2` lit le fichier
// de demo 2 (MD/spec-demos-admin.md) par `admin/vitrine/2`, la route publique, en lecture seule, de
// admin.php ou de buildsg/demosAdmin.mjs. Un fichier absent, illisible ou sans objet laisse la
// demonstration integree : la vitrine encadree sur une page d'accueil ne doit jamais etre vide.
//
// Le clic droit y propose « Rafraichir » et « Copier l'adresse » (app/menuVitrine.ts).

import { migrer } from '../model/migrations.js';
import { SCHEMA_VERSION } from '../model/version.js';
import type { ObjetBrut, Mesure } from '../model/types.js';

/** Les bornes d'une dimension : assez pour voir quelque chose, pas plus qu'un ecran 4K. */
export const DIMENSION_MIN = 200;
export const DIMENSION_MAX = 3840;
/** Les bornes du zoom : au-dela, la camera traverse la scene ou la perd de vue. */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 8;
/** Les heures par defaut de la course du soleil, en minutes depuis minuit. */
export const HEURE_DEBUT_DEFAUT = 7 * 60;
export const HEURE_FIN_DEFAUT = 20 * 60;
/** Le temps d'une journee de vitrine, de `hrsstart` a `hrsend`, par defaut, et ses bornes (`duree`). */
export const DUREE_JOURNEE_MS = 30_000;
export const DUREE_MIN_S = 5;
export const DUREE_MAX_S = 3600;

export interface Vitrine {
  /** Largeur et hauteur demandees, en pixels CSS ; `null` : la fenetre. */
  largeur: number | null;
  hauteur: number | null;
  /** Facteur de rapprochement de la camera ; `null` : le cadrage par defaut. */
  zoom: number | null;
  /** La photo aerienne sous la scene. Faux par defaut. */
  orthophoto: boolean;
  /**
   * La course du soleil, en minutes depuis minuit, et le temps qu'elle prend en millisecondes ;
   * `null` : le soleil ne bouge pas.
   */
  heureAuto: { debut: number; fin: number; dureeMs: number } | null;
  /** Le point de vue demande, tel qu'ecrit dans l'adresse ; `null` : le cadrage par defaut. */
  pdv: string | null;
  /** La demo de l'admin a montrer (`file`) ; `null` : la demonstration integree. */
  fichier: string | null;
}

/** Les identifiants de demo, ceux qu'admin.php et demosAdmin.mjs acceptent. */
const ID_DEMO = /^[A-Za-z0-9_-]{1,64}$/;

function dimension(brute: string | null): number | null {
  if (brute === null || !/^\d{1,5}$/.test(brute.trim())) return null;
  return Math.min(DIMENSION_MAX, Math.max(DIMENSION_MIN, parseInt(brute, 10)));
}

function facteurDeZoom(brut: string | null): number | null {
  if (brut === null || !/^\d{1,2}([.,]\d{1,3})?$/.test(brut.trim())) return null;
  const v = parseFloat(brut.replace(',', '.'));
  return v > 0 ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v)) : null;
}

const OUI = /^(y|o|oui|yes|1|true)$/i;

/** « 14 », « 14:30 », « 14h30 » → minutes depuis minuit ; `null` si illisible ou hors de la journee. */
export function lireHeure(brute: string | null): number | null {
  const m = /^(\d{1,2})(?:[:h](\d{2}))?$/i.exec((brute ?? '').trim());
  if (!m) return null;
  const h = parseInt(m[1] ?? '', 10), min = m[2] ? parseInt(m[2], 10) : 0;
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

/** `duree` en secondes, entiere ou decimale, bornee ; la duree par defaut sinon. */
function dureeDeLaCourse(brute: string | null): number {
  if (brute === null || !/^\d{1,6}([.,]\d{1,3})?$/.test(brute.trim())) return DUREE_JOURNEE_MS;
  const s = parseFloat(brute.replace(',', '.'));
  return Math.round(Math.min(DUREE_MAX_S, Math.max(DUREE_MIN_S, s)) * 1000);
}

function courseDuSoleil(p: URLSearchParams): { debut: number; fin: number; dureeMs: number } | null {
  if (!OUI.test((p.get('heureauto') ?? '').trim())) return null;
  const debut = lireHeure(p.get('hrsstart')) ?? HEURE_DEBUT_DEFAUT;
  const fin = lireHeure(p.get('hrsend')) ?? HEURE_FIN_DEFAUT;
  // Des bornes inversees se lisent dans l'ordre ; egales, il n'y a pas de course a faire.
  if (debut === fin) return null;
  return { debut: Math.min(debut, fin), fin: Math.max(debut, fin), dureeMs: dureeDeLaCourse(p.get('duree')) };
}

/** La vitrine demandee par l'adresse, ou `null` pour l'atelier. */
export function lireVitrine(recherche: string): Vitrine | null {
  const p = new URLSearchParams(recherche);
  if (p.get('mode') !== 'demo') return null;
  return {
    largeur: dimension(p.get('x')), hauteur: dimension(p.get('y')), zoom: facteurDeZoom(p.get('zoom')),
    orthophoto: OUI.test((p.get('orthophoto') ?? '').trim()),
    heureAuto: courseDuSoleil(p),
    pdv: (p.get('pdv') ?? '').trim().slice(0, 80) || null,
    fichier: ID_DEMO.test((p.get('file') ?? '').trim()) ? (p.get('file') ?? '').trim() : null
  };
}

/**
 * Pose la vitrine sur la page, avant le demarrage : `<html data-vitrine>`, que la feuille de style
 * lit pour ne garder que la scene, et la taille de la scene en variables CSS.
 */
export function poserVitrine(v: Vitrine, racine: HTMLElement = document.documentElement): void {
  racine.dataset.vitrine = '';
  if (v.largeur !== null) racine.style.setProperty('--vitrine-largeur', v.largeur + 'px');
  if (v.hauteur !== null) racine.style.setProperty('--vitrine-hauteur', v.hauteur + 'px');
}

/** Ce que le zoom demande de la scene : une camera, et le point que les controles visent. */
interface Vecteur { clone(): Vecteur; sub(v: Vecteur): Vecteur; multiplyScalar(k: number): Vecteur; copy(v: Vecteur): Vecteur; add(v: Vecteur): Vecteur }
export interface SceneZoomable {
  camera: { position: Vecteur };
  controls: { target: Vecteur; update(): void };
}

/** Rapproche la camera de ce qu'elle vise, d'un facteur `zoom` (> 1 : plus pres). */
export function appliquerZoom(sc: SceneZoomable, zoom: number): void {
  const ecart = sc.camera.position.clone().sub(sc.controls.target).multiplyScalar(1 / zoom);
  sc.camera.position.copy(sc.controls.target).add(ecart);
  sc.controls.update();
}

/**
 * Attend la scene 3D — la bibliotheque se charge a la demande, depuis un CDN — puis y fait `faire`,
 * une fois. Abandonne apres `delaiMs` : une scene qui ne vient pas n'a rien a cadrer.
 */
export function quandScenePrete<S>(scene: () => S | null, faire: (sc: S) => void, delaiMs = 30_000): void {
  const debut = Date.now();
  const essayer = () => {
    const sc = scene();
    if (sc) { faire(sc); return; }
    if (Date.now() - debut < delaiMs) setTimeout(essayer, 100);
  };
  essayer();
}

/** Un nom tel qu'on le tape : sans majuscules, sans accents, espaces resserres. */
const normaliser = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Le point de vue que l'adresse designe, parmi ceux du plan : par son nom exact (a la casse et aux
 * accents pres), sinon par son rang a partir de 1, sinon par un debut de nom s'il n'y en a qu'un.
 */
export function trouverPointDeVue<T extends { name?: string }>(pointsDeVue: T[], demande: string | null): T | null {
  if (!demande) return null;
  const cle = normaliser(demande);
  const exact = pointsDeVue.find((v) => normaliser(v.name ?? '') === cle);
  if (exact) return exact;
  if (/^\d{1,3}$/.test(cle)) return pointsDeVue[parseInt(cle, 10) - 1] ?? null;
  const debuts = pointsDeVue.filter((v) => normaliser(v.name ?? '').startsWith(cle));
  return debuts.length === 1 ? debuts[0] ?? null : null;
}

/** L'heure de la course a l'instant `ecouleMs` depuis son depart, en minutes entieres ; elle boucle. */
export function heureALInstant(course: { debut: number; fin: number }, ecouleMs: number, dureeMs = DUREE_JOURNEE_MS): number {
  const t = (((ecouleMs % dureeMs) + dureeMs) % dureeMs) / dureeMs;
  return Math.round(course.debut + t * (course.fin - course.debut));
}

/** La date du jour, en local, au format des champs de date (AAAA-MM-JJ). */
export function dateDuJour(d: Date = new Date()): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Fait courir le soleil : pose l'heure a chaque pas, seulement quand elle change d'une minute.
 * Rend de quoi l'arreter.
 */
export function animerHeure(course: { debut: number; fin: number; dureeMs?: number }, poserHeure: (minutes: number) => void,
  maintenant: () => number = () => performance.now(), pasMs = 100): () => void {
  const depart = maintenant();
  let derniere = -1;
  const pas = () => {
    const m = heureALInstant(course, maintenant() - depart, course.dureeMs);
    if (m !== derniere) { derniere = m; poserHeure(m); }
  };
  pas();
  const id = setInterval(pas, pasMs);
  return () => clearInterval(id);
}

/** Le document d'une demo, lu pour la vitrine : ses objets et ses cotes, dans la forme courante. */
export interface DemoVitrine { objects: ObjetBrut[]; measures: Mesure[] }

/**
 * Lit la demo `id` par la route publique `admin/vitrine/<id>`, relative a la page (Plan peut vivre
 * dans un sous-dossier). Rend `null` — et la vitrine garde la demonstration integree — si le
 * fichier manque, ne se lit pas, n'a pas d'objet, ou vient d'un schema plus recent que ce programme.
 */
export async function chargerDemoVitrine(id: string, lire: typeof fetch = fetch): Promise<DemoVitrine | null> {
  if (!ID_DEMO.test(id)) return null;
  try {
    const r = await lire('admin/vitrine/' + encodeURIComponent(id), { credentials: 'omit', headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    const d = await r.json() as { meta?: { schemaVersion?: unknown } | null; objects?: unknown; measures?: unknown };
    if (!d || !Array.isArray(d.objects) || !d.objects.length) return null;
    const schema = typeof d.meta?.schemaVersion === 'number' ? d.meta.schemaVersion : 1;
    if (schema > SCHEMA_VERSION) return null;
    const lu = migrer({ objects: d.objects as ObjetBrut[], measures: Array.isArray(d.measures) ? d.measures as Mesure[] : [] }, schema);
    return { objects: lu.objects, measures: (lu.measures ?? []) as Mesure[] };
  } catch {
    return null;
  }
}
