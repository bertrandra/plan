// Les abris : pergola et carport sont le meme ouvrage (engine/abri/pergola.ts) — le cadre suit le contour, poteaux aux sommets, poutres
// sur les cotes. Seules leurs valeurs par defaut different (MD/spec-ouvrages.md).

import type { Ouvrage } from './ouvrage.js';

/** Les deux natures d'abri : elles ne different que par leurs valeurs par defaut (a la creation, model/creation.ts ; dans le calcul, engine/abri/pergola.ts). */
export type NatureAbri = 'pergola' | 'carport';

export const PERGOLA: Ouvrage = { fonction: 'pergola', libelle: 'Pergola', famille: 'construit', formes: ['polygon'], particularites: ['abri'], elevation: 2.4, auMenu: true };

export const CARPORT: Ouvrage = { fonction: 'carport', libelle: 'Carport', famille: 'construit', formes: ['polygon'], particularites: ['abri'], elevation: 2.3, auMenu: true };
