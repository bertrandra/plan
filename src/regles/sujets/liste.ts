// Les descriptions de tous les sujets, dans l'ordre du prompt. Ajouter un sujet : sa description dans
// descriptions/, une ligne ici (avant `transverse`, qui ferme la reponse), puis `npm run regles:generer`.

import type { DescriptionSujet } from './description.js';
import { formeToit } from './descriptions/formeToit.js';
import { lucarnes } from './descriptions/lucarnes.js';
import { cheminees } from './descriptions/cheminees.js';
import { terrasse } from './descriptions/terrasse.js';
import { couverture } from './descriptions/couverture.js';
import { elements } from './descriptions/elements.js';
import { facades } from './descriptions/facades.js';
import { transverse } from './descriptions/transverse.js';

export const DESCRIPTIONS_SUJETS: readonly DescriptionSujet[] = [formeToit, lucarnes, cheminees, terrasse, couverture, elements, facades, transverse];
