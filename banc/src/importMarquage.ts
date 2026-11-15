// Le pre-marquage a l'import (demande du proprietaire, 15 novembre 2026, « niveau suivant » n° 3) : ce qui decide qu'une vue importee
// recoit tout de suite un brouillon, et ce que l'import en dit. Le banc marque sur des photos redressees : un brouillon pose sur une
// vue qui passera ensuite par le redressement serait jete avec elle. Seules les vues que l'import a deja rendues face au mur
// (cadrage.ts, « Redresser sur le mur ») le recoivent donc : elles sont enregistrees telles quelles comme redressees et passent au
// brouillon, sans l'etape 2 ni la mosaique (2a) ; les autres suivent le chemin ordinaire. Les objets proposes sont « auto », comme
// ceux de l'etape 3 : jamais dans le jeu avant d'etre relus. Sans DOM, testable seul ; les modeles tournent dans l'ecran (yolo.ts).

import type { CadreDeVue } from './cadrage.js';
import type { Modele } from './types.js';

/** Les modeles qui proposeraient : installes et actifs, comme a l'etape 3. */
export const modelesActifs = (modeles: readonly Modele[]): Modele[] => modeles.filter((m) => m.installe && m.actif !== false);

/**
 * Pourquoi « Proposer un marquage » ne peut pas se cocher ; null quand elle le peut. Il faut des vues deja de face (« Redresser sur le
 * mur ») et au moins un modele actif : le banc n'en embarque aucun, ils s'installent a l'etape 3.
 */
export function raisonSansMarquage(surLeMur: boolean, nModeles: number): string | null {
  if (!nModeles) return 'Aucun modèle n’est installé et actif : installez-en un à l’étape 3, Brouillon.';
  if (!surLeMur) return 'Cochez d’abord « Redresser sur le mur » : le banc marque sur des vues de face, et un brouillon posé sur une vue à redresser serait jeté avec elle.';
  return null;
}

/** Cette vue recoit-elle un brouillon a l'import : le reglage est coche, et l'import l'a rendue face au mur. */
export const vueAMarquer = (marquage: boolean, cadre: CadreDeVue | undefined): boolean => marquage && !!cadre?.plan;

export interface BilanDuMarquage { marquees: number; objets: number; echecs: number }

/** Ce que l'import dit a la fin : les vues importees, et parmi elles celles passees au brouillon et celles qui attendent le redressement. */
export function texteDeLImportFait(ok: number, lot: string, b: BilanDuMarquage | null): string {
  const base = `${ok} vue(s) importée(s), lot ${lot}`;
  if (!b) return base + '.';
  const reste = ok - b.marquees;
  return `${base} ; ${b.marquees} passée(s) au brouillon (${b.objets} objet(s) proposé(s), à relire à l’étape 4)${reste > 0 ? `, ${reste} à redresser` : ''}${b.echecs ? ` ; ${b.echecs} brouillon(s) en échec` : ''}.`;
}
