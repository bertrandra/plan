// Ce que rend la relecture du dossier (export/relecture.ts, lot L5), a part d'elle : l'ecran de la declaration lit ces types et ces
// libelles sans tirer le moteur des PDF (AD-10), que la relecture charge a la demande.

/** `a-completer` : a faire avant de deposer ; `alerte` : une incoherence ; `a-verifier` : a relire, peut-etre rien. */
export type GraviteRelecture = 'a-completer' | 'alerte' | 'a-verifier';
export const LIBELLES_GRAVITE: Readonly<Record<GraviteRelecture, string>> = { 'a-completer': 'À compléter', alerte: 'Alerte', 'a-verifier': 'À vérifier' };

/** Le geste qui regle un point : une commande du registre, et la valeur qu'elle prend (la piece). */
export interface GesteRelecture { commande: string; valeur?: string; libelle: string }

export interface PointRelecture {
  /** Stable d'une relecture a l'autre : la liste de l'ecran la garde comme cle. */
  cle: string;
  gravite: GraviteRelecture;
  texte: string;
  /** Vrai pour ce que le formulaire lui-meme demande (ce que le cerfa disait manquer) : le message de l'export le cite. */
  cerfa: boolean;
  geste?: GesteRelecture;
}

