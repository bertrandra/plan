// Les dates civiles `AAAA-MM-JJ` des curseurs de soleil (util/).
//
// Trois lecteurs les decoupaient chacun par `split('-').map(Number)` suivi de trois `!` : une date
// qui n'avait pas ses trois segments donnait `NaN` a `Date.UTC` en silence, et `toISOString()`
// levait plus loin. Ils partagent maintenant cet analyseur, qui refuse au lieu de deviner : a
// chacun de dire ce qu'il fait d'une date illisible.

export interface DateCivile { annee: number; mois: number; jour: number }

/** Les trois nombres d'une date `AAAA-MM-JJ`, sans passer par `new Date()` et son fuseau ; `null` sinon. */
export function lireDate(texte: string): DateCivile | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(texte.trim());
  if (!m) return null;
  const [, a, mo, j] = m;
  const annee = Number(a), mois = Number(mo), jour = Number(j);
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
  return { annee, mois, jour };
}
