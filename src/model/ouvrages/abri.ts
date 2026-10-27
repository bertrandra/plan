// Les abris : pergola et carport sont le meme ouvrage (engine/pergola.ts) — le cadre suit le contour, poteaux aux sommets, poutres
// sur les cotes. Seules leurs valeurs par defaut different (MD/spec-ouvrages.md).

import type { Ouvrage } from './ouvrage.js';

export const PERGOLA: Ouvrage = { fonction: 'pergola', libelle: 'Pergola', famille: 'construit', formes: ['polygon'], particularites: ['abri'], elevation: 2.4, auMenu: true };

export const CARPORT: Ouvrage = { fonction: 'carport', libelle: 'Carport', famille: 'construit', formes: ['polygon'], particularites: ['abri'], elevation: 2.3, auMenu: true };
