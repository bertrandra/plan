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

/** Les bornes d'une dimension : assez pour voir quelque chose, pas plus qu'un ecran 4K. */
export const DIMENSION_MIN = 200;
export const DIMENSION_MAX = 3840;
/** Les bornes du zoom : au-dela, la camera traverse la scene ou la perd de vue. */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 8;

export interface Vitrine {
  /** Largeur et hauteur demandees, en pixels CSS ; `null` : la fenetre. */
  largeur: number | null;
  hauteur: number | null;
  /** Facteur de rapprochement de la camera ; `null` : le cadrage par defaut. */
  zoom: number | null;
}

function dimension(brute: string | null): number | null {
  if (brute === null || !/^\d{1,5}$/.test(brute.trim())) return null;
  return Math.min(DIMENSION_MAX, Math.max(DIMENSION_MIN, parseInt(brute, 10)));
}

function facteurDeZoom(brut: string | null): number | null {
  if (brut === null || !/^\d{1,2}([.,]\d{1,3})?$/.test(brut.trim())) return null;
  const v = parseFloat(brut.replace(',', '.'));
  return v > 0 ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v)) : null;
}

/** La vitrine demandee par l'adresse, ou `null` pour l'atelier. */
export function lireVitrine(recherche: string): Vitrine | null {
  const p = new URLSearchParams(recherche);
  if (p.get('mode') !== 'demo') return null;
  return { largeur: dimension(p.get('x')), hauteur: dimension(p.get('y')), zoom: facteurDeZoom(p.get('zoom')) };
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
 * Attend la scene 3D — la bibliotheque se charge a la demande, depuis un CDN — puis y applique le
 * zoom, une fois. Abandonne apres `delaiMs` : une scene qui ne vient pas n'a rien a zoomer.
 */
export function zoomerQuandPrete(scene: () => SceneZoomable | null, zoom: number, delaiMs = 30_000): void {
  const debut = Date.now();
  const essayer = () => {
    const sc = scene();
    if (sc) { appliquerZoom(sc, zoom); return; }
    if (Date.now() - debut < delaiMs) setTimeout(essayer, 100);
  };
  essayer();
}
