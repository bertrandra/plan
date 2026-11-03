// Une pile d'annulation pour des gestes qui ne sont pas des donnees du projet : les gestes de la personne sur une facade avant sa
// validation (V4), dans la capture de l'audit ou dans un cas de calibration (decision du proprietaire, 3 novembre 2026). Chaque geste
// garde l'etat d'avant (un instantane, copie) ; annuler rend cet etat et garde l'actuel pour retablir. Un geste nouveau efface ce qui
// etait a retablir, comme l'historique du projet. Pur : ni DOM, ni horloge.

export interface PileGestes<T> {
  /** Un geste fait : `avant` est l'etat d'avant lui (copie par l'appelant), `quoi` ce qu'il touchait (une facade, un cas). */
  empiler(quoi: string, avant: T): void;
  /** Le dernier geste defait : ce qu'il touchait et l'etat a remettre ; `actuel` est garde pour retablir. Null : rien a defaire. */
  annuler(actuel: (quoi: string) => T): { quoi: string; etat: T } | null;
  /** Le dernier geste defait, refait. Null : rien a refaire. */
  retablir(actuel: (quoi: string) => T): { quoi: string; etat: T } | null;
  peutAnnuler(): boolean;
  peutRetablir(): boolean;
  /** Oublie tout (la validation V4 a ecrit dans le projet : son propre Ctrl+Z prend la suite). */
  vider(): void;
}

/** Au-dela, les plus anciens gestes s'oublient : une facade se reprend rarement plus de quelques fois. */
const GESTES_MAX = 50;

export function creerPileGestes<T>(): PileGestes<T> {
  let passes: { quoi: string; etat: T }[] = [];
  let futurs: { quoi: string; etat: T }[] = [];
  return {
    empiler(quoi, avant) {
      passes = [...passes, { quoi, etat: avant }].slice(-GESTES_MAX);
      futurs = [];
    },
    annuler(actuel) {
      const g = passes[passes.length - 1];
      if (!g) return null;
      passes = passes.slice(0, -1);
      futurs = [...futurs, { quoi: g.quoi, etat: actuel(g.quoi) }];
      return g;
    },
    retablir(actuel) {
      const g = futurs[futurs.length - 1];
      if (!g) return null;
      futurs = futurs.slice(0, -1);
      passes = [...passes, { quoi: g.quoi, etat: actuel(g.quoi) }];
      return g;
    },
    peutAnnuler: () => passes.length > 0,
    peutRetablir: () => futurs.length > 0,
    vider() { passes = []; futurs = []; },
  };
}
