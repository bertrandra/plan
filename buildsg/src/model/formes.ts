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
