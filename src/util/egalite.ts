// L'egalite de deux valeurs de donnees (ce qu'un instantane ou un fichier porte : nombres, textes, booleens, null, tableaux et
// objets simples). Pure.

/**
 * Deux valeurs de donnees sont-elles egales, champ par champ ? Une cle absente et une cle a `undefined` se valent (la serialisation
 * les confond). Les textes se comparent par `===` : une photo en data URL partagee par les deux cotes ne se relit pas.
 */
export function egalProfond(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    // NaN n'est egal a rien, sauf a lui-meme ici : deux instantanes du meme objet le portent tous les deux.
    return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b);
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const t = b as unknown[];
    if (a.length !== t.length) return false;
    for (let i = 0; i < a.length; i++) if (!egalProfond(a[i], t[i])) return false;
    return true;
  }
  const oa = a as Record<string, unknown>, ob = b as Record<string, unknown>;
  for (const k of Object.keys(oa)) if (!egalProfond(oa[k], ob[k])) return false;
  for (const k of Object.keys(ob)) if (!(k in oa) && ob[k] !== undefined) return false;
  return true;
}
