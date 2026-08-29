// Reglages de la lumiere solaire des deux scenes 3D (spec §3.2, three/).
//
// La Vue 3D et la visionneuse GLB eclairent des scenes differentes, mais avec le meme soleil : ces
// deux nombres decrivent OU se pose la lumiere, pas quelle heure il est. L'heure, elle, vient de
// `geo/soleil.ts`.
//
// Ils ont ete retrouves depuis l'ancienne position fixe de la lumiere (centre + rayon x (2, 3, 1,2))
// pour rester dans la gamme deja reglee a l'oeil : changer l'un des deux change l'aspect de toutes
// les images produites.

/**
 * Elevation minimale du point d'origine du rayon, en radians (3°).
 *
 * La lumiere ne descend jamais pile a l'horizon : un rasant parfait produit des artefacts d'ombre.
 * L'intensite, elle, peut tomber a zero independamment — c'est ainsi qu'on obtient la nuit.
 */
export const SOLEIL_ELEV_PLANCHER = 3 * Math.PI / 180;

/** Distance de la lumiere a la scene, en rayons de la scene. */
export const SOLEIL_DIST_FACTOR = Math.hypot(2, 3, 1.2);
