// L'algebre lineaire du programme : la resolution d'un systeme par elimination de Gauss-Jordan avec pivot partiel. L'homographie
// d'un quadrilatere (facade/vision/homographie.ts) et l'ajustement d'un toit par moindres carres (facade/toits/toitCorps.ts) avaient
// chacun la leur, a l'ecriture pres (audit d'architecture, 25 octobre 2026). Pur.

/**
 * Resout le systeme dont `M` est la matrice augmentee (n lignes de n + 1 colonnes, la derniere est le second membre), en place.
 * `null` des qu'un pivot tombe sous `seuil` en valeur absolue : le systeme est singulier.
 */
export function resoudreAugmentee(M: number[][], seuil: number): number[] | null {
  const n = M.length;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]?.[c] ?? 0) > Math.abs(M[piv]?.[c] ?? 0)) piv = r;
    if (Math.abs(M[piv]?.[c] ?? 0) < seuil) return null;
    [M[c], M[piv]] = [M[piv] as number[], M[c] as number[]];
    const pivot = M[c] as number[];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const ligne = M[r] as number[];
      const f = (ligne[c] ?? 0) / (pivot[c] ?? 1);
      if (f === 0) continue;
      for (let k = c; k <= n; k++) ligne[k] = (ligne[k] ?? 0) - f * (pivot[k] ?? 0);
    }
  }
  return M.map((ligne, i) => (ligne[n] ?? 0) / (ligne[i] ?? 1));
}
