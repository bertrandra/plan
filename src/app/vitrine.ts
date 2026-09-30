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

/** Les bornes d'une dimension : assez pour voir quelque chose, pas plus qu'un ecran 4K. */
export const DIMENSION_MIN = 200;
export const DIMENSION_MAX = 3840;

export interface Vitrine {
  /** Largeur et hauteur demandees, en pixels CSS ; `null` : la fenetre. */
  largeur: number | null;
  hauteur: number | null;
}

function dimension(brute: string | null): number | null {
  if (brute === null || !/^\d{1,5}$/.test(brute.trim())) return null;
  return Math.min(DIMENSION_MAX, Math.max(DIMENSION_MIN, parseInt(brute, 10)));
}

/** La vitrine demandee par l'adresse, ou `null` pour l'atelier. */
export function lireVitrine(recherche: string): Vitrine | null {
  const p = new URLSearchParams(recherche);
  if (p.get('mode') !== 'demo') return null;
  return { largeur: dimension(p.get('x')), hauteur: dimension(p.get('y')) };
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
