// Ce que la fonction d'un objet lui donne (spec-ihm-zones §4.5, model/).
//
// La fonction d'un objet (terrasse, batiment, parasol…) decide de ses sections propres dans
// l'inspecteur et de sa place dans la Vue 3D. Ces regles vivaient en six predicats repartis dans
// trois fichiers (ui/champs/objet.ts, ui/champs/facade.ts, app/inspecteur.ts) : pour ajouter une
// fonction, il fallait les retrouver tous. Elles sont ici, une fois, avec la forme qu'exige chaque
// fonction : le menu « Fonction » de l'inspecteur ne propose plus que celles qui ont un effet sur
// la forme de l'objet. Ce que chaque fonction declare vit dans son ouvrage (model/ouvrages/,
// MD/spec-ouvrages.md) ; ce module en tire les predicats que le reste du code lit.

import type { ObjetPlan } from './types.js';
import { ouvrage, ouvrageDeclare, estOuvrage, TERRAIN, POINT_DE_VUE, type Forme, type Particularite } from './ouvrages/index.js';

export type { Forme, Particularite };

interface ProfilFonction {
  formes?: readonly Forme[];
  particularites?: readonly Particularite[];
}

/**
 * Le profil de chaque fonction : celui de son ouvrage (model/ouvrages/). Une fonction absente ou inconnue (un ancien fichier) se
 * comporte comme `autre` : toutes les formes, aucune section propre.
 */
const profil = (fonction: string | undefined): ProfilFonction => ouvrageDeclare(fonction) ?? {};

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
export const estTerrain = (o: { key?: string; fonction?: string | null }): boolean => o.key === 'parcelle' || estOuvrage(o, TERRAIN);
export const estPointDeVue = (o: ObjetPlan): boolean => estOuvrage(o, POINT_DE_VUE);

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
/**
 * Un ouvrage dont le toit se lit au LiDAR HD (`Ouvrage.toitLuAuLidar`) : un batiment ou une annexe, depuis la 4.0.0. La lecture,
 * le recalage, les mitoyens et la question du toit a cheval le demandent ici ; ce qu'elle peut ecrire, model/protections.ts le dit.
 */
export const toitLuAuLidar = (o: { fonction?: string | null | undefined }): boolean => ouvrageDeclare(o.fonction)?.toitLuAuLidar === true;
/** Du bati (un batiment, une annexe), quelle que soit sa forme : la famille de son ouvrage. */
export const estBati = (o: { fonction?: string | null | undefined }): boolean => ouvrage(o.fonction).famille === 'bati';

/**
 * Un batiment importe sur la parcelle du projet (BD TOPO, `surParcellePrincipale`) : celui que Plan
 * regarde de pres (toit mesure, corps decoupes) ; les autres batiments importes sont le voisinage.
 */
export const surParcelleDuProjet = (o: { bdtopo?: unknown }): boolean =>
  (o.bdtopo as { surParcellePrincipale?: unknown } | null | undefined)?.surParcellePrincipale === true;
/** Une pergola ou un carport dont on sait calculer les pieces : un polygone. */
export const estAbri = (o: ObjetPlan): boolean => aParticularite(o, 'abri');
/** Une piscine dont on sait calculer le bassin : un polygone ou un cercle. */
export const estPiscine = (o: ObjetPlan): boolean => aParticularite(o, 'bassin');
/** Un trou qui coupe la terrasse qu'il chevauche : un polygone ou un cercle. */
export const estTrou = (o: ObjetPlan): boolean => aParticularite(o, 'ouverture');
/** Un point de vue utilisable : deux points, position et direction. */
export const estVueUtilisable = (o: ObjetPlan): boolean => aParticularite(o, 'pointDeVue');

/**
 * L'objet occupe-t-il le sol de la parcelle ? Le gazon de la Vue 3D (three/gazon.ts) s'arrete a
 * son empreinte : une piscine, une terrasse, un chemin, un batiment, une annexe, une pergola, un
 * massif, une dalle. Restent sur l'herbe ce qui n'a pas d'emprise pleine : un terrain, un point de
 * vue, un arbre (l'herbe pousse sous son houppier), un parasol (son mat seul touche le sol), un trou
 * de terrasse (ce qu'il garde, un arbre, reste dans l'herbe). Un trace qui n'est pas un chemin n'a
 * pas de largeur : il ne couvre rien.
 */
export function occupeLeSol(o: ObjetPlan): boolean {
  const ouv = ouvrage(o.fonction);
  if (estTerrain(o) || ouv.sansEmprise) return false;
  if (o.type === 'path') return !!ouv.aUneLargeur;
  return o.type === 'polygon' || o.type === 'circle';
}

/**
 * L'objet est-il pose sur le terrain reel ? Une parcelle du cadastre, un batiment ou un element de l'IGN : l'actualisation IGN, la
 * lecture des toits au LiDAR, la photo aerienne, le relief, le soleil et le voisinage le lisent a sa place. Il ne se deplace ni ne
 * tourne (decision du 27 octobre 2026) ; un decalage se corrige par le recalage, pas a la main.
 */
export const estPoseSurLeTerrain = (o: { cadastre?: unknown; bdtopo?: unknown }): boolean => !!o.cadastre || !!o.bdtopo;

/**
 * Un ouvrage qui existe deja (lot L3 : une piscine, une terrasse, un chemin lus sur la photo aerienne, `existant`) : il situe le projet
 * et se dessine, mais aucune quantite ne le compte (ni chiffrage, ni dossier, ni zone d'equipement sous une terrasse).
 */
export const estExistant = (o: { existant?: unknown }): boolean => o.existant === true;

/** Un objet qu'on peut isoler (app/isolement.ts) : une terrasse, une piscine, une pergola, un carport. */
export const estIsolable = (o: ObjetPlan): boolean => estTerrasse(o) || estPiscine(o) || estAbri(o);

/**
 * Les objets lies a celui-ci : la terrasse qui sert de plage a une piscine (`piscine.terrasseKey`),
 * ou les piscines dont une terrasse est la plage. Ils s'isolent ensemble.
 */
export function objetsAssocies(o: ObjetPlan, objets: ObjetPlan[]): ObjetPlan[] {
  if (estPiscine(o)) {
    const cle = o.piscine?.terrasseKey;
    return cle ? objets.filter(x => x.key === cle && estTerrasse(x)) : [];
  }
  if (estTerrasse(o)) return objets.filter(x => estPiscine(x) && x.piscine?.terrasseKey === o.key);
  return [];
}

/** L'objet se montre-t-il quand l'objet de cle `cle` est isole ? Lui-meme et ses associes ; tout, hors isolement. */
export function visibleEnIsolement(o: ObjetPlan, objets: ObjetPlan[], cle: string | null | undefined): boolean {
  if (cle === null || cle === undefined || o.key === cle) return true;
  const isole = objets.find(x => x.key === cle);
  return !!isole && objetsAssocies(isole, objets).includes(o);
}

/**
 * La parcelle du projet — celle qui porte la cloture, le lieu, l'orthophoto et le PLU.
 *
 * **Deux passes plutot qu'un `find()` a deux criteres**, et c'est le piege : depuis l'import
 * cadastre, les parcelles *voisines* sont elles aussi des terrains. Un `find()` unique
 * rendrait la premiere du tableau, donc potentiellement une voisine.
 */
export function parcelleDuProjet<T extends { key?: string; fonction?: string | null } = ObjetPlan>(objets: readonly T[]): T | undefined {
  return objets.find(o => o.key === 'parcelle') || objets.find(o => estOuvrage(o, TERRAIN));
}

/** La terrasse courante si elle existe encore, sinon la premiere du plan. */
export function terrasseOuPremiere(objets: ObjetPlan[], cleCourante: string | null | undefined): ObjetPlan | undefined {
  return objets.find(o => o.key === cleCourante && estTerrasse(o)) || objets.find(estTerrasse);
}
