// Reglages de la lumiere solaire des deux scenes 3D (spec §3.2, three/).
//
// La Vue 3D et la visionneuse GLB eclairent des scenes differentes, mais avec le meme soleil : ces
// deux nombres decrivent OU se pose la lumiere, pas quelle heure il est. L'heure, elle, vient de
// `geo/soleil.ts`.
//
// Ils ont ete retrouves depuis l'ancienne position fixe de la lumiere (centre + rayon x (2, 3, 1,2))
// pour rester dans la gamme deja reglee a l'oeil : changer l'un des deux change l'aspect de toutes
// les images produites.

import { positionSoleil } from '../geo/soleil.js';
import type { SceneTrois } from './etat3d.js';

/**
 * Elevation minimale du point d'origine du rayon, en radians (3°).
 *
 * La lumiere ne descend jamais pile a l'horizon : un rasant parfait produit des artefacts d'ombre.
 * L'intensite, elle, peut tomber a zero independamment — c'est ainsi qu'on obtient la nuit.
 */
export const SOLEIL_ELEV_PLANCHER = 3 * Math.PI / 180;

/** Distance de la lumiere a la scene, en rayons de la scene. */
export const SOLEIL_DIST_FACTOR = Math.hypot(2, 3, 1.2);

/** Date, heure et reglages du curseur, identiques dans les deux vues. */
export interface ReglagesSoleil {
  dateStr: string;
  minutes: number;
  intensiteSoleil: number;
  lumiereAppoint: boolean;
}

const ORIGINE = { x: 0, y: 0, z: 0 };

/**
 * Pose hauteur, azimut, intensite et couleur du soleil — ensemble, deduits de la date, de l'heure
 * et du lieu. Ce n'est pas un gradateur.
 *
 * Trois regles que le code seul ne dit pas :
 *
 * - **La nuit, le soleil s'eteint vraiment.** `facteurJour` retombe a 0 sur les dix derniers degres
 *   avant l'horizon, independamment du plancher de position — celui-ci evite seulement un rayon
 *   exactement rasant, qui produit des artefacts d'ombre. Restent l'ambiante et un fond de ciel,
 *   pour que la scene reste lisible sans jamais aller au noir complet.
 * - **Le multiplicateur d'intensite ne touche que le soleil**, et multiplie `facteurJour` : le
 *   monter eclaircit le jour sans jamais rallumer un soleil couche.
 * - **La case « lumiere d'appoint » coupe les deux lumieres autres que le soleil**, l'appoint
 *   directe et l'ambiante. N'en couper qu'une laissait l'autre eclairer seule en pleine nuit, ce qui
 *   contredisait la case.
 *
 * Rend la position du soleil, pour la lecture chiffree affichee a cote du curseur.
 *
 * `lum` porte les trois lumieres (`dirLight`, `dirFill`, `hemiLight`), un `rayon` — la lumiere se
 * pose a `SOLEIL_DIST_FACTOR` fois cette distance — et, optionnellement, un `centre` : la Vue 3D est
 * centree sur l'origine, la visionneuse GLB sur la boite englobante de son modele.
 */
export function reglerSoleil(lum: SceneTrois, r: ReglagesSoleil, lieu: { latitude: number; longitude: number }) {
  const { dirLight, dirFill, hemiLight } = lum;
  const centre = lum.centre || ORIGINE;
  const [annee, mois, jour] = r.dateStr.split('-').map(Number);
  const { elevRad, azRad } = positionSoleil(annee, mois, jour, r.minutes / 60, lieu.latitude, lieu.longitude);
  const facteurJour = Math.max(0, Math.min(1, (elevRad * 180 / Math.PI) / 10));
  const elevAffichee = Math.max(SOLEIL_ELEV_PLANCHER, elevRad);
  const dist = SOLEIL_DIST_FACTOR * lum.rayon;
  const horiz = Math.cos(elevAffichee) * dist;
  // Repere de la scene : X = Est, Y = hauteur, Nord = -Z.
  dirLight.position.set(
    centre.x + Math.sin(azRad) * horiz,
    centre.y + Math.sin(elevAffichee) * dist,
    centre.z - Math.cos(azRad) * horiz
  );
  dirLight.intensity = facteurJour * 0.75 * r.intensiteSoleil;
  dirLight.color.copy(new THREE.Color(0xff8a4c)).lerp(new THREE.Color(0xffffff), facteurJour);
  dirFill.intensity = 0.03 + facteurJour * 0.27;
  hemiLight.intensity = 0.12 + facteurJour * 0.38;
  dirFill.visible = r.lumiereAppoint;
  hemiLight.visible = r.lumiereAppoint;
  return { elevRad, azRad };
}

/**
 * Lecture chiffree de la position du soleil, affichee a cote du curseur.
 *
 * Sans elle, impossible de savoir si une scene sombre vient d'un soleil couche, d'un batiment qui
 * fait de l'ombre, ou du reglage d'intensite.
 */
export function libelleSoleil(elevRad: number, azRad: number): string {
  const elevDeg = elevRad * 180 / Math.PI;
  let azDeg = (azRad * 180 / Math.PI) % 360;
  if (azDeg < 0) azDeg += 360;
  const rose = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(azDeg / 45) % 8];
  return elevDeg <= 0
    ? '🌙 soleil couché'
    : '↑ ' + Math.round(elevDeg) + '° — vient du ' + rose + ' (' + Math.round(azDeg) + '°)';
}
