// Les identifiants cadastraux qu'un objet du plan porte : le sien, et, pour une propriete fusionnee a
// l'import (geo/cadastreObjets.ts), ceux de chacune de ses parcelles (`cadastre.fusionDe`).
//
// Toute relecture du voisinage ecarte ce qui est deja dans le plan par ces identifiants : avec le seul
// `cadastre.idu` (celui de la principale), les autres parcelles de la propriete revenaient comme
// voisines par-dessus le terrain, et la propriete ne se lisait plus d'un seul tenant.

/** Ce que l'on lit de la fiche cadastrale d'un objet. */
interface PorteCadastre { cadastre?: { [champ: string]: unknown } | null }

/** Les identifiants cadastraux (IDU) d'un objet : le sien et ceux des parcelles qu'il fusionne. */
export function idusCadastraux(o: PorteCadastre): string[] {
  const cad = o.cadastre;
  if (!cad) return [];
  const idus = typeof cad.idu === 'string' ? [cad.idu] : [];
  if (Array.isArray(cad.fusionDe)) {
    for (const f of cad.fusionDe as unknown[]) {
      const idu = (f as { idu?: unknown } | null)?.idu;
      if (typeof idu === 'string' && !idus.includes(idu)) idus.push(idu);
    }
  }
  return idus;
}
