// La terrasse de depart d'un plan cree depuis une adresse (lot 2 de la simplification, 16 novembre 2026).
//
// Rangee a part de l'import (app/cadastre/importCadastre.ts), qui la recoit par son contexte : la regle de pose est celle du modele
// (`model/creation.ts::terrasseDeDepart`, contre la maison, jamais sur un batiment), la construction celle d'une terrasse neuve du
// moteur (sur plots, plots dans l'emprise), la cle celle de tout objet neuf.

import { terrasseDeDepart } from '../../model/creation.js';
import { cleObjet } from '../../model/cles.js';
import { constructionTerrasseNeuve } from '../../engine/construction.js';
import type { ObjetPlan } from '../../model/types.js';

/** La terrasse de 4 x 3 m contre la maison de ces objets, ou `null` (pas de maison, pas de place hors du bati). */
export function terrasseDeDepartDuPlan(objets: ObjetPlan[]): ObjetPlan | null {
  return terrasseDeDepart(objets, cleObjet('obj', { newObjCounter: 0 }), constructionTerrasseNeuve());
}
