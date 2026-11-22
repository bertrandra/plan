// La selection d'accueil : celle que l'ouverture d'un projet pose d'office (la terrasse, ou la parcelle d'un fichier relu), sans
// que la personne ait rien choisi.
//
// Sur le plan elle sert : l'inspecteur et le chiffrage s'ouvrent sur la terrasse. En Vue 3D elle trompe : la personne n'a rien
// choisi et trouve pourtant un objet cerne (demande du proprietaire, 22 novembre 2026 : « quand je rentre en mode 3D aucun objet
// n'est selectionne »). La regle : tant que la selection est encore celle de l'ouverture et que la personne ne s'en est pas servie,
// entrer en Vue 3D la lache, et le retour au plan n'en invente pas d'autre. Une selection faite par la personne (un clic, un
// toucher, une ligne de l'explorateur, un champ de l'inspecteur ecrit) est gardee.

/** Ce que la regle lit et ecrit. */
export interface EtatSelectionAccueil {
  selectedKey: string | null;
  /** La cle posee d'office a l'ouverture, tant que la personne n'a rien choisi ; `null` ensuite. */
  selectionAccueil?: string | null;
}

/** La selection courante vient d'etre posee d'office (ouverture, fichier relu). */
export function poserSelectionAccueil(etat: EtatSelectionAccueil): void {
  etat.selectionAccueil = etat.selectedKey;
}

/** La personne s'est servie de la selection (elle l'a choisie, ou elle a ecrit dedans) : elle est a elle. */
export function confirmerSelection(etat: EtatSelectionAccueil): void {
  etat.selectionAccueil = null;
}

/** A chaque changement du plan : une selection qui n'est plus celle de l'ouverture a ete choisie. */
export function suivreSelectionAccueil(etat: EtatSelectionAccueil): void {
  if (etat.selectionAccueil != null && etat.selectedKey !== etat.selectionAccueil) etat.selectionAccueil = null;
}

/** La selection est-elle encore celle de l'ouverture, jamais choisie ni utilisee ? */
export function selectionEstDAccueil(etat: EtatSelectionAccueil): boolean {
  return etat.selectionAccueil != null && etat.selectedKey === etat.selectionAccueil;
}

/** En entrant en Vue 3D : lache la selection d'accueil. Rend `true` quand elle l'a ete. */
export function lacherSelectionAccueil(etat: EtatSelectionAccueil): boolean {
  const lachee = selectionEstDAccueil(etat);
  if (lachee) etat.selectedKey = null;
  etat.selectionAccueil = null;
  return lachee;
}
