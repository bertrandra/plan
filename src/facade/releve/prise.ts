// Ce qu'est une prise de vue d'une facade, pour la chaine qui la redresse (facade/releve/chaine.ts) : la photo, la distance mesuree,
// les reperes de la visee, le champ, le cap et l'attitude. Des types seuls : la camera (ui/releve/camera.ts), les capteurs de distance
// (ui/releve/profondeur.ts) et la visee (zones/releve/capteurs.ts) les remplissent et les re-exportent.

import type { Image } from '../homographie.js';
import type { Attitude } from '../../shell/boussole.js';

/** Une photo prete a traiter, et ce qu'on sait de l'objectif. */
export interface Photo {
  image: Image;
  /** L'URL de la photo pour l'afficher (objet blob ou data:). */
  url: string;
  /** Champ du grand cote, en degres, quand on le connait (EXIF, module natif). */
  champ: number | null;
  /** Focale en pixels quand le module natif la donne directement (intrinseques ARKit). */
  focalePx: number | null;
  /**
   * La distorsion du grand-angle corrigee sur `image` (facade/distorsion.ts, lot L8) : son coefficient,
   * et le facteur dont l'image corrigee a ete reduite pour garder ses coins, qui reduit la focale
   * d'autant. Absente d'une photo non corrigee.
   */
  distorsion?: { k1: number; echelle: number } | null;
}

// `gps` : la position de la photo d'un audit de la parcelle, a quelques metres pres (app/audit/parcelle/mesures.ts).
export type SourceDistance = 'lidar' | 'webxr' | 'cadrage' | 'rue' | 'gps';

export interface MesureDistance {
  distance: number;
  source: SourceDistance;
  /**
   * La geometrie de l'image que voit le capteur, quand il la donne (module natif) : sans video dans
   * la page, c'est elle - et non la taille de l'ecran - qui dit ce que la photo couvrira.
   */
  camera?: { largeurPx: number; hauteurPx: number; focalePx: number };
}

/**
 * Les deux reperes a poser sur les bords du mur : sa largeur est la seule taille connue (le plan), la
 * distance s'en deduit. La hauteur, elle, ne l'est pas - c'est la photo qui la mesure.
 */
export interface Reperes {
  a: number;
  b: number;
  touches: boolean;
}

export interface Prise {
  photo: Photo;
  mesure: MesureDistance | null;
  reperes: Reperes | null;
  champ: number;
  /** Photos que le plan de prise prevoyait au declenchement (null sans distance). */
  photosPrevues: number | null;
  /**
   * Le cap de la boussole et l'attitude du telephone au declenchement : ils placent les coins
   * proposes la ou le mur se trouve (facade/calage.ts). Absents d'une photo importee.
   */
  cap?: number | null;
  attitude?: Attitude | null;
}
