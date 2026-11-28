// L'explorateur du bureau, replie ou ouvert : une preference retenue sur cet appareil (audit UX de la 5.45.0, constat 2).
//
// Sous 1 200 px de large, la palette, l'explorateur et l'inspecteur laissaient 340 px au plan (1 024 px) : l'explorateur s'y
// ouvre donc replie par defaut. Le geste de la personne (le pli de sa colonne) est retenu, et l'emporte ensuite a toute largeur.

/** En dessous de cette largeur, au bureau, l'explorateur s'ouvre replie tant que la personne n'a rien choisi. */
export const LARGEUR_EXPLORATEUR_REPLIE = 1200;
const CLE = 'plan.explorateurOuvert';

/** Ce que la personne a choisi pour l'explorateur du bureau, ou `null` si elle n'a rien choisi. */
export function ouvertureRetenue(): boolean | null {
  try {
    const v = localStorage.getItem(CLE);
    return v === '1' ? true : v === '0' ? false : null;
  } catch { return null; }
}

/** Retient le geste de la personne. Sans stockage, la regle par defaut reviendra. */
export function retenirOuverture(ouvert: boolean): void {
  try { localStorage.setItem(CLE, ouvert ? '1' : '0'); } catch { /* navigation privee */ }
}

/** L'explorateur doit-il s'ouvrir ouvert, au bureau, a cette largeur ? */
export function explorateurOuvertAuBureau(largeur: number): boolean {
  return ouvertureRetenue() ?? largeur >= LARGEUR_EXPLORATEUR_REPLIE;
}
