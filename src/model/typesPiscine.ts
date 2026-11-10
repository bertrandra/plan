// Les reglages d'une piscine (engine/piscine.ts). Re-exporte par model/types.ts.

/** Ou le bassin se trouve par rapport au sol fini. */
export type ImplantationPiscine = 'enterree' | 'semi-enterree' | 'hors-sol';
/** Ce qui tient l'eau : une coque polyester, des parois maconnees (blocs a bancher), un kit de panneaux. */
export type StructurePiscine = 'coque' | 'maconnerie' | 'kit';
/** La peau etanche, selon la structure : une coque a son gelcoat, le reste choisit. */
export type RevetementPiscine = 'liner' | 'membrane-armee' | 'carrelage' | 'enduit' | 'gelcoat';
/** Le fond : plat, en pente reguliere, ou plat puis une fosse a plonger au grand bain. */
export type FondPiscine = 'plat' | 'pente' | 'fosse';
/**
 * Ce qui entoure le bassin au-dela des margelles. `terrasse` : une terrasse du plan, objet a part
 * dessine et chiffre comme toute terrasse, que le bassin perce (`Piscine.terrasseKey`).
 * `terrasse-bois` : la plage en bois que la piscine calculait elle-meme jusqu'a la 2.2.0, gardee
 * telle quelle pour qu'un projet enregistre alors redonne les memes quantites.
 */
export type PlagePiscine = 'aucune' | 'terrasse' | 'terrasse-bois' | 'dallage';
/** Le dispositif de securite obligatoire (loi du 3 janvier 2003, normes NF P90-306 a 309). */
export type SecuritePiscine = 'barriere' | 'alarme' | 'couverture' | 'abri';
export type TraitementPiscine = 'chlore' | 'sel' | 'brome' | 'oxygene-actif';
export type ChauffagePiscine = 'aucun' | 'pac' | 'solaire' | 'echangeur';
/** Ou vit la filtration : un coffre pose a cote, un local enterre prefabrique, un local maconne, un local existant. */
export type LocalTechniquePiscine = 'coffre' | 'enterre' | 'maconne' | 'existant';

/**
 * Les reglages d'une piscine. **Tout est facultatif**, comme `Pergola` : `piscineDe`
 * (engine/piscine.ts) comble les manques a la lecture, sans les ecrire dans l'objet. Les longueurs
 * sont en metres, les profondeurs sont celles de l'eau.
 */
export interface Piscine {
  implantation?: ImplantationPiscine;
  structure?: StructurePiscine;
  revetement?: RevetementPiscine;
  fond?: FondPiscine;
  profondeurPetitBain?: number;
  profondeurGrandBain?: number;
  /** Indice du cote du petit bain : la pente descend en s'en eloignant. Absent : le plus court cote. */
  cotePetitBain?: number;
  /** Fosse : part de la longueur du bassin, cote grand bain, occupee par la descente et la fosse (0,2 a 0,7). */
  partFosse?: number;
  /** Hauteur du haut des parois au-dessus du sol fini (semi-enterree, hors-sol). */
  hauteurHorsSol?: number;
  margelle?: boolean;
  largeurMargelle?: number;
  plage?: PlagePiscine;
  /** La terrasse du plan qui sert de plage (`plage: 'terrasse'`), creee autour du bassin. */
  terrasseKey?: string;
  /** Largeur de la plage autour des margelles, la meme sur tout le tour. */
  largeurPlage?: number;
  /** Essence des lames d'une plage en bois (cles d'`ESSENCE_PRICES`). */
  essencePlage?: string;
  /** Temps de recyclage du volume, en heures (4 h par defaut). */
  tempsRecyclage?: number;
  traitement?: TraitementPiscine;
  chauffage?: ChauffagePiscine;
  eclairage?: boolean;
  securite?: SecuritePiscine;
  local?: LocalTechniquePiscine;
  /** Distance du bassin au local technique, en metres : la longueur des canalisations. */
  distanceLocal?: number;
  couleurEau?: string;
  couleurMargelle?: string;
  couleurPlage?: string;
  /** Prix unitaires saisis, par poste du chiffrage (`'terrassement'`, `'margelles'`…). */
  prix?: Record<string, number>;
}
