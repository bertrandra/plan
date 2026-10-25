// Distance au mur et cadrage, sans capteur de profondeur (MD/spec-releve-facade.md §5).
//
// Une page web sur iPhone n'a pas acces au LiDAR (et Plan ne s'en sert plus : il ne porte qu'a 5 m
// environ). Elle connait pourtant deux choses : la largeur de la facade, lue sur le plan - la seule
// taille connue, la hauteur du cadastre n'etant qu'une estimation -, et le champ de la camera. Un
// mur de 4,20 m qui occupe 60 % de la largeur de l'image est a une distance que la trigonometrie
// donne a quelques centimetres pres - le modele du stenope suffit, les objectifs principaux des
// telephones corrigent leur distorsion avant de livrer l'image.
//
// Quand un vrai capteur repond (profondeur WebXR sur Android), sa mesure remplace l'estimation :
// `ui/releve/profondeur.ts` choisit la source.

/**
 * Champ horizontal par defaut du grand cote de l'image, en degres : l'objectif principal d'un
 * telephone recent (26 mm equivalent 24x36, capteur 4:3) couvre environ 67 degres sur son grand
 * cote. C'est une valeur de depart ; l'etalonnage la remplace (`etalonnerChamp`).
 */
export const CHAMP_GRAND_COTE_DEFAUT = 67;

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

const fr = (v: number) => v.toFixed(1).replace('.', ',');

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

/**
 * Ce que la distance mesuree permet, pour un mur de `largeur` x `hauteur` metres (spec §5.4). Il n'y
 * a plus de distance cible : on mesure ou l'on est, et l'on en deduit s'il faut une photo, plusieurs
 * en se decalant le long du mur, ou reculer parce que la hauteur ne tient pas - le releve assemble
 * des photos cote a cote, pas l'une au-dessus de l'autre.
 */
export interface PlanDePrise {
  /** Ce que l'image couvre du mur a cette distance, en metres. */
  couvre: { largeur: number; hauteur: number };
  /** Toute la hauteur du mur, avec 10 % de marge, tient dans l'image. */
  hauteurTient: boolean;
  /** Nombre de photos pour couvrir la largeur, en se recouvrant d'un tiers. */
  photos: number;
  /** Decalage le long du mur entre deux photos, en metres (0 pour une seule). */
  pas: number;
  /** Distance a partir de laquelle tout le mur tient dans une photo. */
  reculPourUne: number;
  /** Distance a partir de laquelle la hauteur tient. */
  reculPourHauteur: number;
}

export const RECOUVREMENT = 1 / 3;

export function planDePrise(largeur: number, hauteur: number, distance: number, largeurPx: number, hauteurPx: number, focale: number): PlanDePrise {
  const couvre = couverture(distance, largeurPx, hauteurPx, focale);
  const hauteurTient = couvre.hauteur >= hauteur * 1.1;
  // Largeur utile d'une photo : ce qu'elle couvre, moins une petite marge pour attraper les coins.
  const utile = couvre.largeur * 0.9;
  let photos = 1,
    pas = 0;
  if (utile < largeur) {
    photos = Math.ceil((largeur - utile) / (utile * (1 - RECOUVREMENT))) + 1;
    pas = (largeur - utile) / (photos - 1);
  }
  return {
    couvre,
    hauteurTient,
    photos,
    pas,
    reculPourUne: distancePourToutCadrer(largeur, hauteur, largeurPx, hauteurPx, focale),
    reculPourHauteur: (hauteur * 1.1 * focale) / hauteurPx,
  };
}

/** Une consigne de prise de vue : ce qui s'affiche sous la distance, et son ton. */
export interface ConsignePrise {
  ton: 'bon' | 'info' | 'alerte';
  message: string;
}

/** La consigne d'apres le plan de prise, la photo en cours (0 = la premiere) et l'objectif. */
export function consignePrise(plan: PlanDePrise, faites: number, grandAngleDisponible: boolean): ConsignePrise {
  if (!plan.hauteurTient) {
    return {
      ton: 'alerte',
      message: `La hauteur du mur ne tient pas : l'image n'en couvre que ${fr(plan.couvre.hauteur)} m. Reculez à au moins ${fr(plan.reculPourHauteur)} m${grandAngleDisponible ? ', ou passez au grand-angle' : ''}.`,
    };
  }
  if (plan.photos === 1) return { ton: 'bon', message: faites ? 'Tout le mur tient dans l’image : une photo suffisait.' : 'Tout le mur tient dans l’image : une photo suffit.' };
  if (faites === 0) {
    return {
      ton: 'info',
      message: `Le mur ne tient pas en largeur : ${plan.photos} photos, de gauche à droite (ou reculez à ${fr(plan.reculPourUne)} m pour une seule). Photo 1 : cadrez le coin gauche du mur.`,
    };
  }
  const derniere = faites + 1 >= plan.photos;
  return {
    ton: 'info',
    message: `Photo ${faites + 1} sur ${plan.photos} : décalez-vous d’environ ${fr(plan.pas)} m vers la droite, en gardant un tiers de la photo précédente${derniere ? ' ; cadrez le coin droit du mur' : ''}.`,
  };
}
