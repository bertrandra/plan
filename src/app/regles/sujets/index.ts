// Le registre des sujets de l'audit : tout ce que Claude peut voir, que Plan sache le proposer ou
// seulement le dire.
//
// Chaque module rend un `Sujet` de meme `id` que sa description et declare ce qu'il sait faire : `proposer`
// (ecrire dans le projet, par un effet que le moteur applique) et/ou `observer` (se dire en observation).
// Ajouter un sujet qui propose (un chien-assis, un objet decouvert dans le jardin...) : un module ici, une
// ligne dans `SUJETS`, son attribut dans `AttributClaude` et `ATTRIBUTS_CLAUDE`, son effet dans
// `regles/decisions.ts`. Un sujet qui ne fait que se dire en observation, sans forme propre, n'a meme pas
// besoin de module (observations.ts le montre d'apres son champ). `tests/unit/app/regles/sujets.test.ts`
// refuse un module sans description, un attribut sans sujet et un sujet qui propose sans attribut.
// L'ordre des propositions est celui de ce tableau ; celui des observations, celui du prompt (liste.ts).

import type { Sujet } from './contrat.js';
import { couverture } from './couverture.js';
import { cheminees } from './cheminees.js';
import { terrasse } from './terrasse.js';
import { facades } from './facades.js';
import { formeToit } from './formeToit.js';
import { lucarnes } from './lucarnes.js';
import { elements } from './elements.js';
import { transverse } from './transverse.js';

export const SUJETS: readonly Sujet[] = [couverture, cheminees, terrasse, facades, formeToit, lucarnes, elements, transverse];
