// Les trois formes du plan, et comment on passe de l'une a l'autre (model/types.ts, `ObjetPlan`).
//
// Depuis le 21 septembre 2026, `ObjetPlan` est une union discriminee par `type` : le compilateur ne
// laisse plus lire `pts` sur ce qui pourrait etre un cercle. La plupart du code se retrecit tout
// seul, par le `if (obj.type === 'circle')` qu'il ecrivait deja. Ce module sert au reste :
//
// - `estCercle` / `aDesSommets` sont les gardes nommees, pour les endroits ou la condition n'etait
//   pas ecrite sur `type` (un `obj.pts ? ... : ...`, un `obj.center ? ...`) ;
// - `sommetsDe` rend ce que `obj.pts || []` rendait : les sommets, ou aucun pour un cercle ;
// - `enPoints` est l'ancien `obj.pts!` sous un nom qu'on peut chercher : l'appelant affirme que la
//   forme a des sommets parce que son contexte le garantit (une terrasse, une parcelle, un objet
//   deja filtre sur `type`). Il ne verifie rien et ne change rien a l'execution — exactement comme
//   l'assertion qu'il remplace — mais il dit ou l'invariant est suppose plutot que prouve.

import type { ObjetPlan, ObjetAPoints, ObjetCercle, PtBrut } from './types.js';

export function estCercle(o: ObjetPlan): o is ObjetCercle {
  return o.type === 'circle';
}

export function aDesSommets(o: ObjetPlan): o is ObjetAPoints {
  return o.type !== 'circle';
}

/** Les sommets d'une forme, ou aucun pour un cercle — ce que `obj.pts || []` disait. */
export function sommetsDe(o: ObjetPlan): PtBrut[] {
  return o.type === 'circle' ? [] : o.pts;
}

/**
 * Affirme qu'une forme a des sommets. A n'utiliser que la ou le contexte le garantit deja (voir
 * l'en-tete) : sur un cercle, le resultat ment, comme mentait le `!` qu'il remplace.
 */
export function enPoints(o: ObjetPlan): ObjetAPoints {
  return o as ObjetAPoints;
}

/** Le pendant d'`enPoints` pour un cercle — un parasol, un arbre, un spa — sous les memes reserves. */
export function enCercle(o: ObjetPlan): ObjetCercle {
  return o as ObjetCercle;
}

// Les trois tableaux paralleles aux sommets. `normalizeObjects` les pose toujours, aux valeurs
// ci-dessous ; le type les garde facultatifs parce qu'un objet brut peut arriver sans. Ces lecteurs
// les rendent, et les completent aux memes valeurs par defaut s'ils manquent — au lieu du `!` qui
// les affirmait presents.

/** Les sommets geles, un par sommet. */
export function gelsDe(o: ObjetAPoints): boolean[] {
  return o.frozenVertices ??= o.pts.map(() => false);
}

/** Les noms des sommets. */
export function nomsSommetsDe(o: ObjetAPoints): string[] {
  return o.vertexNames ??= o.pts.map((_, i) => 'Point ' + (i + 1));
}

/** Les noms des cotes. */
export function nomsCotesDe(o: ObjetAPoints): string[] {
  return o.segmentNames ??= o.pts.map((_, i) => 'Cote ' + (i + 1));
}

/**
 * Un nom de cote ou de coin donne par defaut (« Cote 3 », « Côté 3 », « Coin 2 », « Point 2 ») : ce n'est qu'un numero, que
 * l'ecran redit d'apres la place et qu'une insertion renumerote. Un nom saisi par la personne n'en est pas un.
 */
export const NOM_DE_COTE_PAR_DEFAUT = /^C[oô]t[eé] \d+$/;
export const NOM_DE_COIN_PAR_DEFAUT = /^(Coin|Point) \d+$/;

/**
 * Le nom du cote `i` (0, 1…) tel que l'ecran le montre, sur le plan comme dans l'inspecteur : un nom par defaut se lit d'apres la
 * place du cote (« Côté 4 » est le quatrieme), un nom saisi reste le sien (audit UX de la 5.45.0, constat 8 : « Côté 6 « Côté 4 » »,
 * et l'ordre 1, 2, 5, 3, 6, 4 apres des insertions). Le projet et les exports gardent le nom enregistre.
 */
export function nomAfficheDuCote(nom: string | null | undefined, i: number): string {
  return !nom || NOM_DE_COTE_PAR_DEFAUT.test(nom) ? 'Côté ' + (i + 1) : nom;
}

/** Le nom du coin `i` tel que l'ecran le montre : par defaut d'apres sa place, saisi tel quel. */
export function nomAfficheDuCoin(nom: string | null | undefined, i: number): string {
  if (!nom) return '';
  const m = NOM_DE_COIN_PAR_DEFAUT.exec(nom);
  return m ? m[1] + ' ' + (i + 1) : nom;
}
