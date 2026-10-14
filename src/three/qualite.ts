// Le reglage Qualite de la Vue 3D (MD/roadmap-realisme-3d.md, R0).
//
// Chaque effet qui coute (ombres, occlusion, anticrenelage, densite des details) passe par ce
// reglage, pour que le telephone reste fluide. C'est une preference de l'appareil, pas du projet :
// le meme plan s'ouvre en Soignee sur un bureau et en Econome sur un vieux telephone. Elle est donc
// rangee dans le navigateur (app/ecouteurs/vue3d.ts), jamais dans le fichier, et n'entre dans aucun
// export : les empreintes golden ne la voient pas.
//
// « Normale » est la Vue 3D d'avant ce reglage, a l'identique : un niveau ne fait qu'ajouter ou
// retirer des effets autour d'elle.

export type Qualite3d = 'econome' | 'normale' | 'soignee';

export const QUALITES_3D: readonly { id: Qualite3d; libelle: string; aide: string }[] = [
  { id: 'econome', libelle: 'Économe', aide: 'Pour un téléphone ancien : sans ombres par défaut, sans lissage des arêtes, détails réduits' },
  { id: 'normale', libelle: 'Normale', aide: 'Ombres et lissage des arêtes : le bon compromis sur la plupart des appareils' },
  { id: 'soignee', libelle: 'Soignée', aide: 'Pleine définition de l’écran, ombres fines, effets de lumière : plus lent' }
];

/** Ce que chaque niveau regle dans la scene. */
export interface ParametresQualite {
  /** Plafond du rapport de pixels : 1 garde le cout d'avant, 2 suit un ecran Retina. */
  pixelRatioMax: number;
  /** Lissage des aretes par le contexte WebGL (MSAA). */
  anticrenelage: boolean;
  /** Les ombres portees, cochees par defaut a ce niveau (la case « Ombres » reste libre). */
  ombresParDefaut: boolean;
  /** Cote de la carte d'ombre, en pixels. */
  carteOmbre: number;
  /** Occlusion ambiante (SSAO) : les coins, le pied des murs et le dessous des debords s'assombrissent. */
  occlusion: boolean;
  /** Distance au centre de la parcelle au-dela de laquelle un batiment passe en modele allege, en metres. */
  detailFinM: number;
}

/** Le detail fin s'arrete la : au-dela, le voisinage se voit de loin (roadmap §1). */
export const DETAIL_FIN_M = 120;

const PARAMETRES: Record<Qualite3d, ParametresQualite> = {
  econome: { pixelRatioMax: 1, anticrenelage: false, ombresParDefaut: false, carteOmbre: 1024, occlusion: false, detailFinM: 60 },
  normale: { pixelRatioMax: 1, anticrenelage: true, ombresParDefaut: true, carteOmbre: 2048, occlusion: false, detailFinM: DETAIL_FIN_M },
  soignee: { pixelRatioMax: 2, anticrenelage: true, ombresParDefaut: true, carteOmbre: 4096, occlusion: true, detailFinM: DETAIL_FIN_M }
};

export function parametresQualite(q: Qualite3d): ParametresQualite {
  return PARAMETRES[q];
}

export function estQualite3d(v: unknown): v is Qualite3d {
  return v === 'econome' || v === 'normale' || v === 'soignee';
}

/** Ce qu'on sait de l'appareil sans rien lui demander (navigator). */
export interface Appareil {
  /** `navigator.hardwareConcurrency`, absent sur certains navigateurs. */
  coeurs?: number | undefined;
  /** `navigator.deviceMemory`, en Go (Chrome seulement), arrondi par le navigateur. */
  memoireGo?: number | undefined;
  /** Un ecran tactile sans souris : telephone ou tablette. */
  tactile: boolean;
}

/**
 * Le niveau propose a la premiere ouverture (decision V1) : Econome sur un appareil tactile modeste
 * (deux Go de memoire au plus, ou quatre coeurs au plus), Normale partout ailleurs. Soignee ne
 * s'impose jamais : elle se demande.
 */
export function qualiteParDefaut(a: Appareil): Qualite3d {
  if (!a.tactile) return 'normale';
  const modeste = (a.memoireGo !== undefined && a.memoireGo <= 2) || (a.coeurs !== undefined && a.coeurs <= 4);
  return modeste ? 'econome' : 'normale';
}
