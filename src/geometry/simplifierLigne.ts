// Douglas-Peucker sur une ligne brisee ouverte : la seule simplification de ligne de la chaine des facades (le gabarit du mur, la
// silhouette lue sur la photo). Le contour ferme d'une parcelle a la sienne (rings.ts::simplifierContour). Pur.

/** Les sommets d'une ligne brisee qui s'ecartent de plus de `tol` de la corde ; les deux bouts restent. */
export function simplifierLigne<T extends { x: number; y: number }>(pts: readonly T[], tol: number): T[] {
  if (pts.length <= 2) return [...pts];
  const a = pts[0] as T, b = pts[pts.length - 1] as T, L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let k = -1, dMax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i] as T, d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L;
    if (d > dMax) { dMax = d; k = i; }
  }
  return dMax <= tol ? [a, b] : [...simplifierLigne(pts.slice(0, k + 1), tol).slice(0, -1), ...simplifierLigne(pts.slice(k), tol)];
}
