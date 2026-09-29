// Distance au mur et cadrage, sans capteur de profondeur (MD/spec-releve-facade.md §5).
//
// Une page web sur iPhone n'a pas acces au LiDAR. Elle connait pourtant deux choses : la taille
// reelle de la facade, lue sur le plan, et le champ de la camera. Un mur de 4,20 m qui occupe
// 60 % de la largeur de l'image est a une distance que la trigonometrie donne a quelques
// centimetres pres - le modele du stenope suffit, les objectifs principaux des telephones
// corrigent leur distorsion avant de livrer l'image.
//
// Quand un vrai capteur repond (LiDAR par le module natif, profondeur WebXR sur Android), sa
// mesure remplace l'estimation : `facade/profondeur.ts` choisit la source.

/**
 * Champ horizontal par defaut du grand cote de l'image, en degres : l'objectif principal d'un
 * telephone recent (26 mm equivalent 24x36, capteur 4:3) couvre environ 67 degres sur son grand
 * cote. C'est une valeur de depart ; l'etalonnage la remplace (`etalonnerChamp`).
 */
export const CHAMP_GRAND_COTE_DEFAUT = 67;

/** Distance de prise de vue proposee par defaut, en metres. */
export const DISTANCE_CIBLE_DEFAUT = 3;

/** Ecart toleree autour de la distance cible, en metres. */
export const TOLERANCE_DISTANCE = 0.25;

const rad = (d: number) => (d * Math.PI) / 180;
const degres = (r: number) => (r * 180) / Math.PI;

/**
 * Focale en pixels, pour une image de `largeurPx` x `hauteurPx`, dont le grand cote couvre
 * `champGrandCote` degres. Le petit cote en decoule : le stenope a une seule focale.
 */
export function focalePx(largeurPx: number, hauteurPx: number, champGrandCote = CHAMP_GRAND_COTE_DEFAUT): number {
  const grand = Math.max(largeurPx, hauteurPx);
  return grand / 2 / Math.tan(rad(champGrandCote) / 2);
}

/** Champ couvert par `px` pixels centres, pour une focale donnee, en degres. */
export function champPx(px: number, focale: number): number {
  return degres(2 * Math.atan(px / 2 / focale));
}

/**
 * Distance a un objet de `tailleReelle` metres qui occupe `taillePx` pixels dans l'image.
 * Renvoie `null` si la mesure n'a pas de sens (moins de 4 pixels : un geste accidentel).
 */
export function distanceParCadrage(tailleReelle: number, taillePx: number, focale: number): number | null {
  if (!(taillePx >= 4) || !(tailleReelle > 0) || !(focale > 0)) return null;
  return (tailleReelle * focale) / taillePx;
}

/** Ce que couvre l'image a une distance donnee : largeur et hauteur de mur visibles, en metres. */
export function couverture(distance: number, largeurPx: number, hauteurPx: number, focale: number): { largeur: number; hauteur: number } {
  return { largeur: (distance * largeurPx) / focale, hauteur: (distance * hauteurPx) / focale };
}

/**
 * Distance minimale pour voir toute la facade dans l'image, avec une marge de 10 % de chaque cote
 * pour que les coins restent attrapables au doigt.
 */
export function distancePourToutCadrer(largeurMur: number, hauteurMur: number, largeurPx: number, hauteurPx: number, focale: number): number {
  const marge = 1.2;
  return Math.max((largeurMur * marge * focale) / largeurPx, (hauteurMur * marge * focale) / hauteurPx);
}

/**
 * Etalonnage : l'utilisateur se place a une distance mesuree d'un objet de taille connue et le
 * cadre ; on en deduit le champ du grand cote. C'est le reglage qui rend l'estimation fiable sur un
 * telephone dont on ne connait pas l'objectif.
 */
export function etalonnerChamp(distance: number, tailleReelle: number, taillePx: number, grandCotePx: number): number {
  const focale = (taillePx * distance) / tailleReelle;
  return champPx(grandCotePx, focale);
}

/** Etat du guidage de distance, tel que l'affiche la surimpression de la camera. */
export interface ConsigneDistance {
  /** `true` quand on est dans la tolerance autour de la cible. */
  bon: boolean;
  /** Ecart signe en metres : positif = trop loin, il faut avancer. */
  ecart: number;
  /** Phrase courte a afficher. */
  message: string;
}

const fr = (v: number) => v.toFixed(1).replace('.', ',');

/** Ce qu'il faut dire a l'utilisateur, a `distance` metres d'un mur, pour une cible donnee. */
export function consigneDistance(distance: number | null, cible = DISTANCE_CIBLE_DEFAUT, tolerance = TOLERANCE_DISTANCE): ConsigneDistance {
  if (distance === null || !Number.isFinite(distance)) {
    return { bon: false, ecart: NaN, message: 'Distance inconnue' };
  }
  const ecart = distance - cible;
  if (Math.abs(ecart) <= tolerance) return { bon: true, ecart, message: `${fr(distance)} m, bonne distance` };
  return ecart > 0
    ? { bon: false, ecart, message: `${fr(distance)} m : avancez de ${fr(ecart)} m` }
    : { bon: false, ecart, message: `${fr(distance)} m : reculez de ${fr(-ecart)} m` };
}

/**
 * Consigne d'aplomb, depuis l'inclinaison du telephone (`DeviceOrientationEvent.beta`, en degres :
 * 90 = tenu droit en portrait). Un telephone penche fuit les verticales ; le redressement le
 * rattrape, mais au prix de la definition en haut du mur.
 */
export function consigneAplomb(beta: number | null, tolerance = 6): { bon: boolean; message: string } {
  if (beta === null || !Number.isFinite(beta)) return { bon: true, message: '' };
  const ecart = beta - 90;
  if (Math.abs(ecart) <= tolerance) return { bon: true, message: 'Téléphone droit' };
  return ecart > 0 ? { bon: false, message: 'Ramenez le haut du téléphone vers vous' } : { bon: false, message: 'Inclinez le haut du téléphone vers le mur' };
}
