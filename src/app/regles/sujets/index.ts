// Le registre des sujets de l'audit : tout ce que Claude peut voir et que Plan sait proposer.
//
// Ajouter un sujet qui propose (une lucarne, un objet decouvert dans le jardin...) : un module ici qui
// rend un `Sujet` de meme `id` que sa description, une ligne dans `SUJETS`, son attribut dans
// `AttributClaude` et `ATTRIBUTS_CLAUDE`, son effet dans `regles/decisions.ts`.
// `tests/unit/app/regles/sujets.test.ts` refuse un module sans description, une description d'un
// sujet qui propose sans module, et un attribut sans sujet. L'ordre est celui des lignes de l'ecran
// des propositions.

import type { Sujet } from './contrat.js';
import { couverture } from './couverture.js';
import { cheminees } from './cheminees.js';
import { terrasse } from './terrasse.js';
import { materiau } from './materiau.js';
import { formeToit } from './formeToit.js';

export const SUJETS: readonly Sujet[] = [couverture, cheminees, terrasse, materiau, formeToit];
