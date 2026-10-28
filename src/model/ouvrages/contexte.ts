// Les ouvrages de contexte : ce qui situe le projet, sans regle de construction (MD/spec-ouvrages.md).

import type { Ouvrage } from './ouvrage.js';

/** La parcelle du projet, ou une parcelle voisine importee du cadastre. La section Parcelle suit `estTerrain`, pas ce profil. */
export const TERRAIN: Ouvrage = { fonction: 'terrain', libelle: 'Terrain', famille: 'contexte', formes: ['polygon'], elevation: 0, auMenu: true, horsEquipement: true, sansEmprise: true };

/** Le feuillage est une sphere posee sur le tronc : toute forme de tronc convient. */
export const ARBRE: Ouvrage = { fonction: 'arbre', libelle: 'Arbre', famille: 'contexte', particularites: ['arbre'], elevation: 3, auMenu: true, sansEmprise: true,
  reglagesAuFichier: ['diametreArbre', 'couleurArbre', 'especeArbre'] };

export const LIMITE: Ouvrage = { fonction: 'limite', libelle: 'Limite', famille: 'contexte', elevation: 0, auMenu: true, horsEquipement: true };

/** Un point de vue est deux points (position, direction) ; il se cree, il ne se choisit pas dans le menu. */
export const POINT_DE_VUE: Ouvrage = { fonction: 'camera', libelle: 'Point de vue', famille: 'contexte', formes: ['path'], particularites: ['pointDeVue'], auMenu: false, horsEquipement: true, sansEmprise: true,
  nommeParSaFonction: true };

/** Un objet sans fonction particuliere. Une fonction absente ou inconnue (un ancien fichier) se comporte comme lui. */
export const AUTRE: Ouvrage = { fonction: 'autre', libelle: 'Autre', famille: 'contexte', elevation: 0.5, auMenu: true };
