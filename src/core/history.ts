// Pile d'annulation (spec-migration-typescript.md §3.2, core/history.ts).
//
// Seule la pile est ici : elle ne connait ni le plan, ni le DOM, ni le rendu. Prendre et rendre un
// instantane vit dans `core/historique.ts`, qui orchestre le demontage et la reconstruction de la
// scene - ce n'est pas de la gestion de pile.
//
// Le renommage `history` -> `undoStack` (changement A1 de la spec §10.3) evitait la collision
// silencieuse avec `window.history` une fois les modules en place. Le type l'acte : ici, aucune
// ambiguite possible.

/** Un instantane du projet : ce que `snapshotState()` produit et `restoreState()` consomme. */
export interface Instantane<O = unknown, M = unknown> {
  objects: O[];
  measures: M[];
}

/**
 * Profondeur d'annulation. Soixante pas couvrent largement une session d'edition, et bornent
 * la memoire : chaque instantane est une copie complete du plan, pas un diff.
 */
export const LIMITE_HISTORIQUE = 60;

export class PileAnnulation<O = unknown, M = unknown> {
  private readonly pile: Instantane<O, M>[] = [];

  constructor(private readonly limite: number = LIMITE_HISTORIQUE) {}

  /** Empile un instantane ; le plus ancien tombe quand la limite est atteinte. */
  empiler(instantane: Instantane<O, M>): void {
    this.pile.push(instantane);
    if (this.pile.length > this.limite) this.pile.shift();
  }

  /** Depile le dernier instantane, ou `null` si la pile est vide. */
  depiler(): Instantane<O, M> | null {
    return this.pile.pop() ?? null;
  }

  get taille(): number {
    return this.pile.length;
  }

  get vide(): boolean {
    return this.pile.length === 0;
  }

  vider(): void {
    this.pile.length = 0;
  }
}
