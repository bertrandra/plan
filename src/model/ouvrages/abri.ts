// Les abris : pergola et carport sont le meme ouvrage (engine/abri/pergola.ts) — le cadre suit le contour, poteaux aux sommets, poutres
// sur les cotes. Seules leurs valeurs par defaut different (MD/spec-ouvrages.md).

import type { Ouvrage } from './ouvrage.js';
import type { ObjetPlan } from '../types.js';
import { coteSuivi, type Deformation } from '../referencesContour.js';

/** Le cote de reference (chevrons, bas d'un appentis, titre de l'elevation de la DP) et le cote adosse suivent leur mur. */
function suivreDeformationAbri(o: ObjetPlan, d: Deformation): void {
  const p = o.pergola;
  if (!p) return;
  if (typeof p.coteReference === 'number') p.coteReference = coteSuivi(d, p.coteReference);
  if (typeof p.coteMur === 'number') p.coteMur = coteSuivi(d, p.coteMur);
}

/** Les deux natures d'abri : elles ne different que par leurs valeurs par defaut (a la creation, model/creation.ts ; dans le calcul, engine/abri/pergola.ts). */
export type NatureAbri = 'pergola' | 'carport';

export const PERGOLA: Ouvrage = { fonction: 'pergola', libelle: 'Pergola', famille: 'construit', formes: ['polygon'], particularites: ['abri'], elevation: 2.4, auMenu: true, dossierPiscine: { masse: true }, suivreDeformation: suivreDeformationAbri };

export const CARPORT: Ouvrage = { fonction: 'carport', libelle: 'Carport', famille: 'construit', formes: ['polygon'], particularites: ['abri'], elevation: 2.3, auMenu: true, dossierPiscine: { masse: true }, suivreDeformation: suivreDeformationAbri };
