// Cote de reference de l'outil d'alignement (spec §3.2, interaction/).
//
// Une seule donnee, mais partagee par trois endroits qui ne se connaissent pas : le panneau
// d'attributs l'affiche et active son bouton, le `pointerdown` du plan l'ecrit quand on designe un
// cote, et l'alignement la lit pour calculer la rotation.
//
// Elle vit donc ici plutot que dans une variable de module partagee de fait : trois lecteurs et un
// ecrivain, c'est exactement ce qui merite une frontiere explicite.

/** Un cote designe sur le plan : la cle de l'objet et l'indice du cote. */
export interface CoteDesigne {
  objKey: string;
  segIndex: number;
}

let cible: CoteDesigne | null = null;

/** Le cote de reference en cours, ou `null` si l'utilisateur n'en a pas encore designe. */
export function cibleAlignement(): CoteDesigne | null {
  return cible;
}

export function definirCibleAlignement(v: CoteDesigne | null): void {
  cible = v;
}
