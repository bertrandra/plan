// Les ouvrages de contexte : ce qui situe le projet, sans regle de construction (MD/spec-ouvrages.md).

import type { Ouvrage } from './ouvrage.js';
import type { ObjetPlan } from '../types.js';
import { borne, coteOuTombe, coteSuivi, memeCote, milieuReporte, origineDansLaListe, type Deformation } from '../referencesContour.js';

/**
 * La cloture d'une parcelle suit son contour deforme : un cote regle a part le reste sur le mur qui le porte (les deux parts d'un
 * cote coupe par un sommet ajoute), un portail ou un portillon reste a sa place sur la limite, sur la part ou il tombe, borne au
 * cote, piliers compris. Sans cela, un sommet ajoute sur le cote 1 mettait le portail du cote 3 sur l'ancien cote 2.
 */
function suivreDeformationTerrain(o: ObjetPlan, d: Deformation): void {
  const cl = o.cloture;
  if (!cl) return;
  if (cl.cotes?.length) {
    const regles = new Map(cl.cotes.map((c) => [c.cote, c]));
    const rangs = new Set(regles.keys());
    const suivis = d.apres.flatMap((_, j) => {
      const i = origineDansLaListe(d, j, rangs);
      const c = i < 0 ? undefined : regles.get(i);
      return c ? [{ ...JSON.parse(JSON.stringify(c)) as typeof c, cote: j }] : [];
    });
    // Un cote regle qui ne designait aucun cote du contour (un ancien fichier) reste : la lecture l'ignore deja (`coteValide`).
    const horsContour = cl.cotes.filter((c) => !(Number.isInteger(c.cote) && c.cote >= 0 && c.cote < d.avant.length));
    cl.cotes = [...suivis, ...horsContour].sort((a, b) => a.cote - b.cote);
  }
  if (cl.portails?.length) cl.portails = cl.portails.map((a) => {
    const milieu = a.x + a.largeur / 2;
    const vers = d.nombreChange ? coteOuTombe(d, a.cote, milieu) : coteSuivi(d, a.cote);
    const r = memeCote(d, a.cote, vers) ? null : milieuReporte(d, a.cote, vers, milieu);
    if (!r) return vers === a.cote ? a : { ...a, cote: vers };
    const pilier = a.piliers ? a.piliers.largeur : 0;
    return { ...a, cote: vers, x: borne(r.milieu - a.largeur / 2, pilier, r.longueur - a.largeur - pilier) };
  });
}

/** La parcelle du projet, ou une parcelle voisine importee du cadastre. La section Parcelle suit `estTerrain`, pas ce profil. */
export const TERRAIN: Ouvrage = { fonction: 'terrain', libelle: 'Terrain', famille: 'contexte', formes: ['polygon'], elevation: 0, auMenu: true, horsEquipement: true, sansEmprise: true,
  suivreDeformation: suivreDeformationTerrain };

/** Le feuillage est une sphere posee sur le tronc : toute forme de tronc convient. */
export const ARBRE: Ouvrage = { fonction: 'arbre', libelle: 'Arbre', famille: 'contexte', particularites: ['arbre'], elevation: 3, auMenu: true, sansEmprise: true };

export const LIMITE: Ouvrage = { fonction: 'limite', libelle: 'Limite', famille: 'contexte', elevation: 0, auMenu: true, horsEquipement: true };

/** Un point de vue est deux points (position, direction) ; il se cree, il ne se choisit pas dans le menu. */
export const POINT_DE_VUE: Ouvrage = { fonction: 'camera', libelle: 'Point de vue', famille: 'contexte', formes: ['path'], particularites: ['pointDeVue'], auMenu: false, horsEquipement: true, sansEmprise: true };

/** Un objet sans fonction particuliere. Une fonction absente ou inconnue (un ancien fichier) se comporte comme lui. */
export const AUTRE: Ouvrage = { fonction: 'autre', libelle: 'Autre', famille: 'contexte', elevation: 0.5, auMenu: true };
