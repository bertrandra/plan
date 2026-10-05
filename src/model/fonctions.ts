// Ce que la fonction d'un objet lui donne (spec-ihm-zones §4.5, model/).
//
// La fonction d'un objet (terrasse, batiment, parasol…) decide de ses sections propres dans
// l'inspecteur et de sa place dans la Vue 3D. Ces regles vivaient en six predicats repartis dans
// trois fichiers (ui/champs/objet.ts, ui/champs/facade.ts, app/inspecteur.ts) : pour ajouter une
// fonction, il fallait les retrouver tous. Elles sont ici, une fois, avec la forme qu'exige chaque
// fonction : le menu « Fonction » de l'inspecteur ne propose plus que celles qui ont un effet sur
// la forme de l'objet.

import type { ObjetPlan } from './types.js';

export type Forme = ObjetPlan['type'];

/** Les sections propres a une fonction, au-dela de celles que tout objet porte. */
export type Particularite = 'parasol' | 'pointDeVue' | 'arbre' | 'construction' | 'releve' | 'abri';

interface ProfilFonction {
  /** Les formes ou la fonction a un sens. Absent : toutes. */
  formes?: readonly Forme[];
  /** Ce que la fonction ajoute a l'inspecteur, sur une forme admise. */
  particularites?: readonly Particularite[];
}

/**
 * Le profil de chaque fonction. Une fonction absente (ou inconnue, venue d'un ancien fichier) se
 * comporte comme `autre` : toutes les formes, aucune section propre.
 *
 * Les formes exigees le sont par le moteur : une terrasse se calcule sur un polygone, le releve
 * de facade suit les cotes d'un polygone, l'ombre d'un parasol est celle d'une toile ronde, la
 * cloture suit le contour d'une parcelle, un point de vue est deux points (position, direction).
 */
const PROFILS: Record<string, ProfilFonction> = {
  // La section Parcelle suit `estTerrain` (la cle `parcelle` compte aussi), pas ce profil.
  terrain: { formes: ['polygon'] },
  batiment: { formes: ['polygon'], particularites: ['releve'] },
  annexe: { formes: ['polygon'], particularites: ['releve'] },
  terrasse: { formes: ['polygon'], particularites: ['construction'] },
  parasol: { formes: ['circle'], particularites: ['parasol'] },
  // Pergola et carport sont le meme ouvrage (engine/pergola.ts) : le cadre suit le contour, poteaux
  // aux sommets, poutres sur les cotes. Seules leurs valeurs par defaut different.
  pergola: { formes: ['polygon'], particularites: ['abri'] },
  carport: { formes: ['polygon'], particularites: ['abri'] },
  camera: { formes: ['path'], particularites: ['pointDeVue'] },
  // Le feuillage est une sphere posee sur le tronc : toute forme de tronc convient.
  arbre: { particularites: ['arbre'] }
};

const profil = (fonction: string | undefined): ProfilFonction => PROFILS[fonction || ''] ?? {};

/** La fonction a-t-elle un sens sur cette forme ? */
export function fonctionAdmise(fonction: string, forme: Forme): boolean {
  const f = profil(fonction).formes;
  return !f || f.includes(forme);
}

/**
 * L'objet porte-t-il cette particularite ? Il faut la fonction ET une forme admise : un parasol
 * dessine en polygone (un ancien fichier) n'a pas de section Parasol, faute d'ombre a calculer.
 */
export function aParticularite(o: ObjetPlan, p: Particularite): boolean {
  const pr = profil(o.fonction);
  return !!pr.particularites?.includes(p) && fonctionAdmise(o.fonction || '', o.type);
}

/** Un terrain : la parcelle, ou une parcelle voisine importee du cadastre. */
export const estTerrain = (o: ObjetPlan): boolean => o.key === 'parcelle' || o.fonction === 'terrain';
export const estPointDeVue = (o: ObjetPlan): boolean => o.fonction === 'camera';

/**
 * Une terrasse calculable : la fonction ET un polygone. Le contexte terrasse, l'explorateur, les
 * resultats, la 3D et le dossier lisent tous cette definition : un cercle marque `terrasse` (un
 * import SVG, un ancien fichier) ne devient pas la terrasse courante, dont le calcul echouerait.
 */
export const estTerrasse = (o: ObjetPlan): boolean => aParticularite(o, 'construction');
/** Un parasol dont on sait calculer l'ombre : une toile ronde. */
export const estParasol = (o: ObjetPlan): boolean => aParticularite(o, 'parasol');
/** Un bâtiment ou une annexe dont on sait relever les facades. */
export const estBatiment = (o: ObjetPlan): boolean => aParticularite(o, 'releve');
/** Une pergola ou un carport dont on sait calculer les pieces : un polygone. */
export const estAbri = (o: ObjetPlan): boolean => aParticularite(o, 'abri');
/** Un point de vue utilisable : deux points, position et direction. */
export const estVueUtilisable = (o: ObjetPlan): boolean => aParticularite(o, 'pointDeVue');

/**
 * La parcelle du projet — celle qui porte la cloture, le lieu, l'orthophoto et le PLU.
 *
 * **Deux passes plutot qu'un `find()` a deux criteres**, et c'est le piege : depuis l'import
 * cadastre, les parcelles *voisines* sont elles aussi `fonction === 'terrain'`. Un `find()` unique
 * rendrait la premiere du tableau, donc potentiellement une voisine.
 */
export function parcelleDuProjet(objets: ObjetPlan[]): ObjetPlan | undefined {
  return objets.find(o => o.key === 'parcelle') || objets.find(o => o.fonction === 'terrain');
}

/** La terrasse courante si elle existe encore, sinon la premiere du plan. */
export function terrasseOuPremiere(objets: ObjetPlan[], cleCourante: string | null | undefined): ObjetPlan | undefined {
  return objets.find(o => o.key === cleCourante && estTerrasse(o)) || objets.find(estTerrasse);
}
