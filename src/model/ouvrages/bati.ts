// Le bati : ce qui se releve (toit, facades), sur un polygone (MD/spec-ouvrages.md).

import type { Ouvrage } from './ouvrage.js';

export const BATIMENT: Ouvrage = { fonction: 'batiment', libelle: 'Bâtiment', famille: 'bati', formes: ['polygon'], particularites: ['releve'], elevation: 2.5, auMenu: true };

export const ANNEXE: Ouvrage = { fonction: 'annexe', libelle: 'Annexe', famille: 'bati', formes: ['polygon'], particularites: ['releve'], elevation: 2.5, auMenu: true };
