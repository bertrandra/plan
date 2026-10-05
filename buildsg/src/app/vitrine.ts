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
// locales, `14`, `14:30` ou `14h30` ; sans elles, du lever au coucher du soleil, a la date et au
// lieu de la parcelle — 7 h et 20 h si le plan n'a pas de lieu), en `duree` secondes (30 par defaut,
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
// `date=AAAA-MM-JJ` pose le jour du soleil (par defaut, aujourd'hui). La camera tourne autour de la
// scene, depuis sa position, a un tour par minute PAR DEFAUT ; `rotation=<n>` en regle la vitesse
// (tours par minute, negatif : l'autre sens ; de -10 a 10), `rotation=n` (ou 0) l'arrete.
//
// A l'ouverture, la camera se cadre sur la PARCELLE — sauf si `pdv` en demande une autre.
//
// Un disque de soleil tourne autour de la parcelle, a l'azimut du vrai soleil et plus bas que lui
// pour rester dans le champ ; pres du coucher, le ciel vire au beige de savane (three/soleilVitrine.ts).
// Les deux sont la par defaut ; `soleil=n` et `couchant=n` les retirent, le clic droit aussi. Les deux se reglent aussi au clic droit, qui propose encore « Rafraichir » et
// « Copier l'adresse » — l'adresse copiee porte la date et la rotation choisies (app/menuVitrine.ts).

import { migrer } from '../model/migrations.js';
import { centroid } from '../geometry/basic.js';
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
   * `null` : le soleil ne bouge pas. Une borne `null` suit le soleil : lever pour le debut, coucher
   * pour la fin (`resoudreCourse`).
   */
  heureAuto: { debut: number | null; fin: number | null; dureeMs: number } | null;
  /** Le point de vue demande, tel qu'ecrit dans l'adresse ; `null` : le cadrage par defaut. */
  pdv: string | null;
  /** La demo de l'admin a montrer (`file`) ; `null` : la demonstration integree. */
  fichier: string | null;
  /** Le jour du soleil, AAAA-MM-JJ (`date`) ; `null` : aujourd'hui. */
  date: string | null;
  /** La rotation automatique, en tours par minute (`rotation`) ; `null` : la camera ne tourne pas. */
  rotation: number | null;
  /** Le disque du soleil autour de la parcelle (`soleil`). Vrai par defaut. */
  soleil: boolean;
  /** Le ciel du couchant, beige de savane (`couchant`). Vrai par defaut. */
  couchant: boolean;
}

/** Les bornes de la rotation automatique, en tours par minute. */
export const ROTATION_MAX = 10;
/** La rotation d'une vitrine sans `rotation=` : elle tourne, a un tour par minute. */
export const ROTATION_VITRINE = 1;
const NON = /^(n|non|no|0|false|off)$/i;

/** Une date AAAA-MM-JJ qui existe au calendrier, ou `null`. */
export function lireDate(brute: string | null): string | null {
  const t = (brute ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(t + 'T12:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t ? t : null;
}

/**
 * La vitesse de rotation en tours par minute, bornee. Absente ou « oui » : la vitesse par defaut
 * (la vitrine tourne). « n », « non », 0 : `null`, arretee. Illisible : la vitesse par defaut.
 */
export function lireRotation(brute: string | null): number | null {
  const t = (brute ?? '').trim().replace(',', '.');
  if (NON.test(t)) return null;
  if (!/^-?\d{1,2}(\.\d{1,2})?$/.test(t)) return ROTATION_VITRINE;
  const v = Math.max(-ROTATION_MAX, Math.min(ROTATION_MAX, parseFloat(t)));
  return v === 0 ? null : v;
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

function courseDuSoleil(p: URLSearchParams): { debut: number | null; fin: number | null; dureeMs: number } | null {
  if (!OUI.test((p.get('heureauto') ?? '').trim())) return null;
  const debut = lireHeure(p.get('hrsstart'));
  const fin = lireHeure(p.get('hrsend'));
  const dureeMs = dureeDeLaCourse(p.get('duree'));
  if (debut === null || fin === null) return { debut, fin, dureeMs };
  // Des bornes inversees se lisent dans l'ordre ; egales, il n'y a pas de course a faire.
  if (debut === fin) return null;
  return { debut: Math.min(debut, fin), fin: Math.max(debut, fin), dureeMs };
}

/**
 * La course du soleil a jouer, bornes resolues : une borne absente prend le lever ou le coucher du
 * jour (`leverCoucher`), sinon 7 h ou 20 h. `null` si la course est vide.
 */
export function resoudreCourse(
  course: { debut: number | null; fin: number | null; dureeMs: number },
  leverCoucher: { lever: number; coucher: number } | null
): { debut: number; fin: number; dureeMs: number } | null {
  const debut = course.debut ?? leverCoucher?.lever ?? HEURE_DEBUT_DEFAUT;
  const fin = course.fin ?? leverCoucher?.coucher ?? HEURE_FIN_DEFAUT;
  if (debut === fin) return null;
  return { debut: Math.min(debut, fin), fin: Math.max(debut, fin), dureeMs: course.dureeMs };
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
    fichier: ID_DEMO.test((p.get('file') ?? '').trim()) ? (p.get('file') ?? '').trim() : null,
    date: lireDate(p.get('date')),
    rotation: lireRotation(p.get('rotation')),
    soleil: !NON.test((p.get('soleil') ?? '').trim()),
    couchant: !NON.test((p.get('couchant') ?? '').trim())
  };
}

/** L'adresse de la vitrine, avec la date et la rotation telles qu'elles sont a l'ecran. */
export function adresseVitrine(href: string, date: string | null, rotation: number | null,
  scene: { soleil: boolean; couchant: boolean } = { soleil: true, couchant: true }): string {
  const u = new URL(href);
  // Presents par defaut : seule leur absence s'ecrit.
  if (scene.soleil) u.searchParams.delete('soleil'); else u.searchParams.set('soleil', 'n');
  if (scene.couchant) u.searchParams.delete('couchant'); else u.searchParams.set('couchant', 'n');
  if (date) u.searchParams.set('date', date); else u.searchParams.delete('date');
  // Arretee se dit (`rotation=0`) : sans le parametre, la vitrine tourne.
  u.searchParams.set('rotation', String(rotation ?? 0));
  return u.toString();
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

/**
 * Le cadrage sur la parcelle, dans le repere de la scene 3D (origine au centre de la scene `centre`,
 * x vers l'Est, z vers le Sud — three/primitives.ts `versLocalDepuis`) : la cible au centre de la
 * parcelle, la camera dans la meme direction diagonale que le cadrage par defaut (three/scene.ts),
 * assez loin pour que la parcelle entiere tienne dans le champ. `aspect` = largeur / hauteur de la
 * scene : le champ de la camera (45 degres) est VERTICAL, donc plus etroit en largeur sur un
 * telephone en portrait — la distance s'allonge d'autant, sans quoi la parcelle deborde des cotes.
 */
/** Le centre (barycentre des sommets) et le rayon de la parcelle, dans le repere de la scene. */
export function cercleParcelle(pts: readonly { x: number; y: number }[], centre: { x: number; y: number }): { x: number; z: number; rayon: number } | null {
  if (pts.length < 3) return null;
  const { x: cx, y: cy } = centroid(pts);
  const rayon = Math.max(3, ...pts.map((p) => Math.hypot(p.x - cx, p.y - cy)));
  return { x: cx - centre.x, z: centre.y - cy, rayon };
}

export function cadrageSurParcelle(pts: readonly { x: number; y: number }[], centre: { x: number; y: number }, aspect = 1): {
  cible: { x: number; y: number; z: number }; camera: { x: number; y: number; z: number };
} | null {
  const c = cercleParcelle(pts, centre);
  if (!c) return null;
  // Meme formule que la scene : etendue = 2 x rayon, camera a 0,9 x etendue sur chaque axe.
  const d = c.rayon * 2 * 0.9 * (aspect > 0 && aspect < 1 ? 1 / aspect : 1);
  const cible = { x: c.x, y: 0, z: c.z };
  return { cible, camera: { x: cible.x + d, y: d, z: cible.z + d } };
}
