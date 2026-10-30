// Ce qu'est une prise de vue d'une facade, pour la chaine qui la redresse (facade/releve/chaine.ts) : la photo, la distance mesuree,
// le champ, le cap et l'attitude. Des types seuls : l'audit de la parcelle les remplit (app/audit/parcelle/mesures.ts), la calibration
// aussi (une photo sans capteurs, chaine.ts::priseSansCapteurs). La visee du releve (ses reperes sur les bords du mur, son plan de
// prise, ses capteurs de distance) est partie avec sa capture (lot F6).

import type { Image } from '../vision/homographie.js';
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
   * La distorsion du grand-angle corrigee sur `image` (facade/vision/distorsion.ts, lot L8) : son coefficient,
   * et le facteur dont l'image corrigee a ete reduite pour garder ses coins, qui reduit la focale
   * d'autant. Absente d'une photo non corrigee.
   */
  distorsion?: { k1: number; echelle: number } | null;
}

// `gps` : la position de la photo d'un audit de la parcelle, a quelques metres pres (app/audit/parcelle/mesures.ts).
type SourceDistance = 'lidar' | 'webxr' | 'cadrage' | 'rue' | 'gps';

export interface MesureDistance {
  distance: number;
  source: SourceDistance;
}

export interface Prise {
  photo: Photo;
  mesure: MesureDistance | null;
  champ: number;
  /**
   * Le cap de la boussole et l'attitude du telephone au declenchement : ils placent les coins
   * proposes la ou le mur se trouve (facade/calage/calage.ts). Absents d'une photo importee.
   */
  cap?: number | null;
  attitude?: Attitude | null;
}
