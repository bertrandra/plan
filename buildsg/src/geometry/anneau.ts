// Lire un sommet d'un contour ferme (geometry/).
//
// Un polygone est un anneau : le sommet qui suit le dernier est le premier. Les calculs le lisaient
// par `pts[(i + 1) % n]!`, un `!` qui affirmait que l'indice tombait dans le tableau. Il y tombe
// toujours — sauf sur un anneau vide ou un indice qui n'est pas un entier, ou le `%` rend `NaN` et la
// lecture `undefined`. Ce module dit les deux choses : l'indice est pris modulo la longueur, et un
// anneau vide ou un indice non entier est refuse, pas lu.

/** Le sommet d'indice `i` de l'anneau, pris modulo sa longueur (les negatifs comptent depuis la fin). */
export function sommetDe<T>(anneau: readonly T[], i: number): T {
  const n = anneau.length;
  const p = Number.isInteger(i) ? anneau[((i % n) + n) % n] : undefined;
  if (p === undefined) throw new RangeError('Sommet ' + i + ' demande sur un contour de ' + n + ' sommet(s).');
  return p;
}

/** Vrai si `i` designe un sommet existant, sans passer par le modulo : la borne des indices saisis. */
export function indiceValide(anneau: readonly unknown[], i: number): boolean {
  return Number.isInteger(i) && i >= 0 && i < anneau.length;
}
