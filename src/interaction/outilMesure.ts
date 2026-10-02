// Etat de l'outil de cotation, pendant qu'on l'utilise (spec §3.2, interaction/).
//
// Poser une cote se fait en plusieurs clics : on designe d'abord un cote de reference, puis un ou
// plusieurs points a coter. Entre ces clics, la cote n'existe pas encore - elle est un **brouillon**
// que trois endroits du programme regardent : le `pointerdown` du plan qui l'alimente, le panneau
// de mesure qui l'affiche, et le rendu qui met en evidence ce qui est deja designe.
//
// D'ou ce module : trois lecteurs, deux ecrivains, et un etat qui doit pouvoir etre annule d'un
// coup. Il vit ici plutot que dans `etat` (spec §6.1) parce qu'il ne fait pas partie du plan : rien
// de tout cela ne s'enregistre, et une cote n'apparait dans `etat.measures` qu'une fois terminee.

/** Ce que l'outil attend du prochain clic. */
export interface Pointage {
  mode: 'ref' | 'target';
  /** Vrai quand plusieurs points peuvent etre designes a la suite. */
  multi: boolean;
  /** L'outil qui a demande ce pointage : la cotation, ou l'alignement. */
  purpose: 'measure' | 'align';
}

export const mesure: {
  /** Pointage en cours, ou `null` quand l'outil n'attend rien. */
  pointage: Pointage | null;
  /** Cote de reference deja designe. */
  ref: { objKey: string; segIndex: number } | null;
  /** Extremite du cote qui sert d'origine : « A » ou « B ». */
  startEnd: string;
  /** Points a coter deja designes. */
  cibles: { objKey: string; ptIndex: number }[];
} = {
  pointage: null,
  ref: null,
  startEnd: 'A',
  cibles: []
};
