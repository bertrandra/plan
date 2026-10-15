// La camera et la presentation de la Vue 3D (MD/roadmap-realisme-3d.md, R6) : une focale proche de
// l'oeil a hauteur d'homme, l'heure doree en un geste, une capture en haute definition pour le
// client, et la promenade qui enchaine les points de vue enregistres.
//
// Rien de ceci ne touche au projet : ni annulation, ni « projet modifie », ni export. L'heure doree
// regle le soleil de la vue, comme le curseur d'heure.

import type * as THREE_NS from 'three';
import type { SceneVue3d } from './etat3d.js';
import { leverEtCoucher } from '../geo/soleil.js';
import { lireDate } from '../util/date.js';

/** La focale verticale a hauteur d'homme : celle d'un oeil qui regarde devant lui, plus large que la vue d'ensemble. */
export const FOCALE_YEUX_DEG = 55;
/** Celle de la vue d'ensemble (three/scene.ts) : la camera aerienne la garde. */
export const FOCALE_VUE_DEG = 45;
/** En dessous de cette hauteur au-dessus du sol, la camera est a hauteur d'homme ; au-dessus de la seconde, aerienne. */
export const HAUTEUR_HOMME_M = 3;
export const HAUTEUR_AERIENNE_M = 6;

/** La focale voulue a une hauteur de camera au-dessus du sol : de l'oeil a la vue d'ensemble, sans saut. */
export function focaleVoulue(hauteurAuSol: number): number {
  if (hauteurAuSol <= HAUTEUR_HOMME_M) return FOCALE_YEUX_DEG;
  if (hauteurAuSol >= HAUTEUR_AERIENNE_M) return FOCALE_VUE_DEG;
  const t = (hauteurAuSol - HAUTEUR_HOMME_M) / (HAUTEUR_AERIENNE_M - HAUTEUR_HOMME_M);
  return FOCALE_YEUX_DEG + (FOCALE_VUE_DEG - FOCALE_YEUX_DEG) * t;
}

/**
 * Rapproche la focale de celle voulue, d'un quart de l'ecart par image : la transition se voit a
 * peine. `solCentre` : la hauteur du sol au centre de la scene. Rend `true` si la focale a bouge.
 */
export function accorderFocale(camera: THREE_NS.PerspectiveCamera, solCentre: number): boolean {
  const voulue = focaleVoulue(camera.position.y - solCentre);
  const ecart = voulue - camera.fov;
  if (Math.abs(ecart) < 0.05) return false;
  camera.fov = Math.abs(ecart) < 0.3 ? voulue : camera.fov + ecart * 0.25;
  camera.updateProjectionMatrix();
  return true;
}

/** Combien de minutes avant le coucher commence l'heure doree. */
export const HEURE_DOREE_AVANT_COUCHER_MIN = 50;

/**
 * L'heure doree du jour choisi, en minutes depuis minuit (heure legale) : une cinquantaine de minutes
 * avant le coucher du soleil. `null` si la date est illisible ou que le soleil ne se couche pas.
 */
export function minutesHeureDoree(dateStr: string, lieu: { latitude: number; longitude: number }): number | null {
  const d = lireDate(dateStr);
  if (!d) return null;
  const lc = leverEtCoucher(d.annee, d.mois, d.jour, lieu.latitude, lieu.longitude);
  if (!lc) return null;
  // `leverEtCoucher` rend des minutes depuis minuit.
  return Math.max(0, Math.round(lc.coucher - HEURE_DOREE_AVANT_COUCHER_MIN));
}

/** Le facteur de definition d'une capture haute definition. */
export const FACTEUR_CAPTURE_HD = 3;

/**
 * Une image de la vue en haute definition : le rendu passe un instant a `facteur` fois sa definition,
 * le temps d'une image, puis revient. Le canevas affiche n'en garde aucune trace.
 */
export function capturerHd(sc: SceneVue3d, rendre: () => void, facteur = FACTEUR_CAPTURE_HD): Promise<Blob | null> {
  const r = sc.renderer;
  const avant = r.getPixelRatio();
  // `setPixelRatio` redimensionne le tampon du canevas ; les passes de l'occlusion suivent (`rapportPixels`).
  const regler = (k: number) => { r.setPixelRatio(k); sc.rapportPixels?.(k); };
  return new Promise((fin) => {
    try {
      regler(avant * facteur);
      rendre();
      // `toBlob` copie l'image a l'appel : la definition peut revenir aussitot.
      r.domElement.toBlob((b) => fin(b), 'image/png');
      regler(avant);
      rendre();
    } catch {
      regler(avant);
      fin(null);
    }
  });
}

// ---- La promenade --------------------------------------------------------------------------------

/** Un point de vue de la promenade, en coordonnees de la scene. */
export interface EtapePromenade {
  position: { x: number; y: number; z: number };
  cible: { x: number; y: number; z: number };
}

/** La duree d'un trajet d'un point de vue au suivant, et de l'arret sur chacun, en millisecondes. */
export const TRAJET_MS = 2600;
export const ARRET_MS = 1400;

/** Un mouvement doux : lent au depart, lent a l'arrivee. */
export function adoucir(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

/** La position et la cible a l'instant `t` (millisecondes) d'une promenade, ou `null` une fois finie. */
export function instantPromenade(etapes: readonly EtapePromenade[], t: number): EtapePromenade | null {
  if (etapes.length < 2) return null;
  const pas = TRAJET_MS + ARRET_MS;
  const k = Math.floor(t / pas);
  if (k >= etapes.length - 1) return null;
  const a = etapes[k] as EtapePromenade, b = etapes[k + 1] as EtapePromenade;
  const u = adoucir((t - k * pas) / TRAJET_MS);
  const m = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) => ({ x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u, z: p.z + (q.z - p.z) * u });
  return { position: m(a.position, b.position), cible: m(a.cible, b.cible) };
}

let promenadeEnCours: { arreter: () => void } | null = null;

export function promenadeActive(): boolean {
  return promenadeEnCours !== null;
}

/**
 * Lance la promenade : la camera part du premier point de vue et enchaine les suivants. Un geste de
 * l'utilisateur sur la vue (les controles d'orbite qui demarrent) l'arrete, comme la commande.
 * `fin` est appelee a l'arret, quel qu'il soit.
 */
export function lancerPromenade(sc: SceneVue3d, etapes: readonly EtapePromenade[], fin: () => void): void {
  arreterPromenade();
  if (etapes.length < 2 || typeof requestAnimationFrame !== 'function') return;
  const depart = performance.now();
  let raf = 0;
  const controles = sc.controls as unknown as { addEventListener?: (e: string, f: () => void) => void; removeEventListener?: (e: string, f: () => void) => void };
  const arreter = () => {
    cancelAnimationFrame(raf);
    controles.removeEventListener?.('start', arreter);
    promenadeEnCours = null;
    fin();
  };
  controles.addEventListener?.('start', arreter);
  const pas = () => {
    const e = instantPromenade(etapes, performance.now() - depart);
    if (!e) { arreter(); return; }
    sc.camera.position.set(e.position.x, e.position.y, e.position.z);
    sc.controls.target.set(e.cible.x, e.cible.y, e.cible.z);
    sc.controls.update();
    raf = requestAnimationFrame(pas);
  };
  promenadeEnCours = { arreter };
  pas();
}

export function arreterPromenade(): void {
  promenadeEnCours?.arreter();
}
