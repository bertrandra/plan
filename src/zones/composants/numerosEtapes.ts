// Les numeros des etapes d'une facade (E1 a E14) et ses points de validation (V1 a V4), montres ou non (lot 3 de la simplification,
// 16 novembre 2026). La calibration et l'admin les gardent : le proprietaire designe les etapes par eux. L'audit de la personne
// ordinaire les cache : la barre, les lignes et les actions disent le nom de l'etape, et les textes de la chaine se lisent sans
// eux (`sansNumeros`, model/etapeFacade.ts). L'audit cache, il ne calcule rien autrement : seule la lecture change.

import { createContext } from 'react';

/** Vrai par defaut : un ecran qui ne dit rien (la calibration) garde les numeros. */
export const NumerosEtapes = createContext(true);
