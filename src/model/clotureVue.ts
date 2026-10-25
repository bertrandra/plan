// Ce que l'audit de parcelle dit d'une cloture vue de la rue : sa nature et ou est le portail. Seuls, pour que les decisions de
// l'audit (regles/decisions.ts) les lisent sans dependre du fichier d'audit, qui garde leurs propositions.

export type TypeCloture = 'mur' | 'grillage' | 'palissade' | 'haie';
/** Ou est le portail le long de la limite, vu de la rue. */
export type PositionPortail = 'gauche' | 'centre' | 'droite';
