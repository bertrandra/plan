// La bibliotheque d'essences livree avec Plan : le fichier data/admin/arbres.json, lu tel qu'un serveur le sert. Le code n'a aucune
// essence ; les tests qui en ont besoin la lisent ici, comme les pages la liront du serveur.

import { readFileSync } from 'node:fs';
import { lireDocumentArbres, type EspeceArbre } from '../../src/model/especesArbre.js';

export const FICHIER_BIBLIOTHEQUE_LIVREE = new URL('../../data/admin/arbres.json', import.meta.url);
export const BIBLIOTHEQUE_LIVREE: readonly EspeceArbre[] = lireDocumentArbres(JSON.parse(readFileSync(FICHIER_BIBLIOTHEQUE_LIVREE, 'utf8')))?.especes ?? [];
