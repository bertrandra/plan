// Tolerances de l'import cadastral (spec §3.2, geo/).
//
// Quatre nombres qui decident de ce qui est « la meme limite », de ce qui est « a cote », et de ce
// qu'on renonce a afficher. Ils sont ici, ensemble, parce qu'ils se lisent les uns par rapport aux
// autres : deux parcelles mitoyennes au demi-metre pres sont voisines (ADJACENCE_TOL_M), mais leurs
// limites ne se soudent qu'au demi-centimetre (FUSION_TOL_M).

/**
 * Deux sommets a moins de 5 cm sont le meme point lors de la fusion de parcelles.
 *
 * Le plan cadastral n'est pas un releve : deux parcelles mitoyennes n'ont presque jamais des
 * coordonnees strictement egales le long de leur limite commune. Sans tolerance, la fusion
 * echouerait toujours ; trop large, elle souderait des parcelles reellement disjointes.
 */
export const FUSION_TOL_M = 0.05;

/** Deux parcelles a moins de 50 cm l'une de l'autre sont considerees mitoyennes. */
export const ADJACENCE_TOL_M = 0.5;

/**
 * Simplification du contour importe : on retire les sommets qui ne s'ecartent pas de 2 cm de la
 * droite de leurs voisins. Le PCI en aligne parfois des dizaines sur un meme cote droit.
 */
export const SIMPLIF_M = 0.02;

/** Au-dela, le pourtour est trop dense pour etre lisible : on garde les plus grandes limites. */
export const MAX_VOISINES = 20;
