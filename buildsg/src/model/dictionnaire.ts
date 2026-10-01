// Lire un dictionnaire enregistre, quelle que soit la forme sous laquelle il a ete enregistre.
//
// Plusieurs reglages du projet sont des dictionnaires : les prix par longueur de barre, le prix des
// plots par modele, les cadences par poste. `defaultConstruction()` les pose en `{}` — mais les
// projets deja enregistres portent `[]`, et `ensureConstruction` les laisse passer puisqu'un tableau
// *est* un objet (`typeof [] === 'object'`).
//
// **Les deux formes fonctionnent, et il faut que les deux continuent de fonctionner.** Ecrire
// `tableau['piquetage'] = 7` pose bel et bien une propriete lisible ensuite par `tableau['piquetage']`
// — c'est du JavaScript ordinaire, et c'est ce qui se passe aujourd'hui sur le jeu de demonstration,
// dont les `cadences` sont un tableau. Filtrer les tableaux « pour faire propre » ferait donc
// disparaitre une cadence saisie par l'utilisateur, sans erreur et sans trace.
//
// D'ou cette fonction : une seule conversion, ecrite une fois et expliquee ici, plutot que six
// indexations que le compilateur refuse et qu'on serait tente de « nettoyer » chacune a sa facon.

import type { PrixParLongueur } from './types.js';

/**
 * La valeur rangee sous `cle`, ou `undefined`.
 *
 * L'indexation est **exactement celle d'avant** : la conversion ne change pas ce qui est lu, elle
 * dit seulement au compilateur que ces deux formes s'indexent de la meme facon.
 */
export function valeurEnregistree(
  dictionnaire: PrixParLongueur | Record<string, number> | undefined | null,
  cle: string
): number | undefined {
  if (!dictionnaire) return undefined;
  return (dictionnaire as Record<string, number | undefined>)[cle];
}
