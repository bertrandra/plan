// DXF (spec §3.2, export/dxf.ts).
//
// `construireDXF` (export/dxfPlan.ts) parcourt `objects` et `measures`, donc l'etat du plan. Seul le
// formatage des nombres, qui ne lit que son argument, est ici - et il compte : le format des
// coordonnees fait partie du contrat du fichier (§10.1).

/** Coordonnee DXF : toujours quatre decimales, jamais de notation exponentielle. */
export function dxfNum(n: number): string {
  return n.toFixed(4);
}
