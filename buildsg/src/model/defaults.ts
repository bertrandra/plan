// Valeurs par defaut du modele (spec §3.2, model/defaults.ts).

/** Libelles francais des fonctions d'objet, utilises par le selecteur et les panneaux. */
export const LIBELLE_FONCTION: Record<string, string> = {
  terrain:'Terrain', batiment:'Bâtiment', terrasse:'Terrasse', arbre:'Arbre', massif:'Massif',
  mobilier:'Mobilier', dalle:'Dalle', equipement:'Équipement', chemin:'Chemin', parasol:'Parasol',
  pergola:'Pergola', carport:'Carport', piscine:'Piscine',
  camera:'Point de vue', limite:'Limite', annexe:'Annexe', autre:'Autre'
};

/** Fonctions qui ne comptent pas comme equipement pose sur une terrasse (dossier PDF). */
export const FONCTIONS_HORS_EQUIPEMENT = ['terrain','limite','camera','terrasse','chemin','parasol'];

/** Lieu de repli quand la parcelle ne porte pas de coordonnees. */
export const LIEU_DEFAUT = { nom: 'Le Vésinet', latitude: 48.8923, longitude: 2.1331 };

// Hauteur par defaut selon la fonction, en metres : ce qui rend la Vue 3D lisible sans reglage.
export const ELEVATION_DEFAUT: Record<string, number> = {
  terrain:0, batiment:2.5, arbre:3, terrasse:0, massif:0.6,
  mobilier:0.9, dalle:0.02, equipement:0.9, chemin:0, parasol:2.2, pergola:2.4, carport:2.3, piscine:0, autre:0.5, limite:0, annexe:2.5
};
export function elevationParDefaut(fonction: string): number {
  return ELEVATION_DEFAUT[fonction] !== undefined ? ELEVATION_DEFAUT[fonction] : 0.5;
}
