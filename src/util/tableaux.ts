// Lire un element d'un tableau dont on sait l'indice valide (util/).
//
// Le code lisait `pts[i]!`, `hits[i + 1]!`, `cands[0]!` : un `!` qui affirmait que l'indice tombait
// dans le tableau, sans que rien ne le verifie. Il y tombe — c'est ce que la boucle ou la garde
// au-dessus garantit —, mais le jour ou il n'y tombe plus, la valeur `undefined` passait en silence
// et ressortait trois fonctions plus loin en `NaN`. `au` fait la meme lecture et le dit : l'element,
// ou une `RangeError` qui nomme l'indice, a l'endroit meme de l'erreur.
//
// Pour un contour ferme, ou l'indice se lit modulo la longueur, voir `sommetDe` (geometry/anneau.ts).

/** L'element d'indice `i`, ou une `RangeError` s'il n'y en a pas. */
export function au<T>(tableau: ArrayLike<T>, i: number): T {
  const v = tableau[i];
  if (v === undefined) throw new RangeError('Indice ' + i + ' hors du tableau (' + tableau.length + ' element(s)).');
  return v;
}

// `Math.min(...valeurs)` passe chaque valeur en argument : au-dela d'environ 120 000, la pile deborde
// (« Maximum call stack size exceeded »). Une grille de relief en compte jusqu'a un million.

/** La plus petite valeur, `Infinity` pour une liste vide (comme `Math.min()`), sans limite de taille. */
export function minimum(valeurs: ArrayLike<number>): number {
  let m = Infinity;
  for (let i = 0; i < valeurs.length; i++) { const v = valeurs[i] as number; if (v < m || Number.isNaN(v)) m = v; }
  return m;
}

/** La plus grande valeur, `-Infinity` pour une liste vide (comme `Math.max()`), sans limite de taille. */
export function maximum(valeurs: ArrayLike<number>): number {
  let m = -Infinity;
  for (let i = 0; i < valeurs.length; i++) { const v = valeurs[i] as number; if (v > m || Number.isNaN(v)) m = v; }
  return m;
}
