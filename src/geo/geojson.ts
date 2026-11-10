// Les coordonnees GeoJSON, seules : le cadastre et l'API IGN les partagent sans dependre l'un de l'autre.

/** Une position GeoJSON : `[lon, lat]`, parfois suivie de l'altitude — jamais moins de deux nombres. */
export type Position = [number, number, ...number[]];
/** Un anneau de coordonnees GeoJSON, non ferme cote appli. */
export type Anneau = Position[];
