// La suppression differee d'une photo (demande du proprietaire, 15 novembre 2026 : « Ajouter icone supprimer (icone poubelle) sans
// double validation »). Sans fenetre de confirmation, un doigt qui glisse sur un telephone efface une photo : la photo disparait donc
// de l'ecran tout de suite, mais l'appel au serveur (qui efface son dossier pour de bon) ne part qu'au bout du delai, pendant lequel
// « Annuler » la rend. Plusieurs suppressions de suite font une file : chacune a son propre delai et s'annule seule.
// Quand la page se ferme (pagehide), rien n'est envoye : une suppression jamais faite (la photo revient a la visite suivante) vaut
// mieux qu'une perte que l'on n'a pas eu le temps d'annuler. Module sans DOM : la minuterie se donne, pour les tests.

/** Le temps laisse pour annuler, en millisecondes. */
export const DELAI_SUPPRESSION = 6000;

export interface Minuterie {
  poser: (f: () => void, ms: number) => unknown;
  lever: (t: unknown) => void;
  maintenant: () => number;
}

const MINUTERIE: Minuterie = {
  poser: (f, ms) => setTimeout(f, ms),
  lever: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
  maintenant: () => Date.now(),
};

/** Une suppression demandee : en attente (annulable) jusqu'a `fin`, puis envoyee (plus annulable, encore cachee). */
export interface Suppression<T> {
  element: T;
  fin: number;
  etat: 'attente' | 'envoi';
}

/** Ce que la file dit a qui l'ecoute, en plus de chaque changement : la fin d'un envoi. */
export type Issue<T> = { genre: 'supprimee'; element: T } | { genre: 'echec'; element: T; erreur: Error };

export class FileDeSuppressions<T extends { id: string }> {
  private readonly file = new Map<string, Suppression<T> & { minuteur: unknown }>();
  private readonly ecouteurs = new Set<(issue?: Issue<T>) => void>();

  constructor(
    private readonly envoyer: (id: string) => Promise<unknown>,
    private readonly delai = DELAI_SUPPRESSION,
    private readonly minuterie: Minuterie = MINUTERIE,
  ) {}

  /** Demande la suppression ; deja demandee, rien ne change (son delai court toujours). */
  demander(element: T): void {
    if (this.file.has(element.id)) return;
    const fin = this.minuterie.maintenant() + this.delai;
    const minuteur = this.minuterie.poser(() => { void this.envoyerUne(element.id); }, this.delai);
    this.file.set(element.id, { element, fin, etat: 'attente', minuteur });
    this.dire();
  }

  /** Annule une suppression encore en attente et rend l'element ; null si elle est deja partie (ou inconnue). */
  annuler(id: string): T | null {
    const s = this.file.get(id);
    if (!s || s.etat !== 'attente') return null;
    this.minuterie.lever(s.minuteur);
    this.file.delete(id);
    this.dire();
    return s.element;
  }

  /** La page se ferme : tout ce qui attend est abandonne, rien n'est envoye (voir l'en-tete). */
  abandonner(): void {
    let n = 0;
    for (const [id, s] of this.file) if (s.etat === 'attente') { this.minuterie.lever(s.minuteur); this.file.delete(id); n++; }
    if (n) this.dire();
  }

  /** Les identifiants a cacher : en attente comme en cours d'envoi. */
  cachees(): Set<string> { return new Set(this.file.keys()); }

  /** Les suppressions encore annulables, la plus recente en dernier. */
  annulables(): Suppression<T>[] {
    return [...this.file.values()].filter((s) => s.etat === 'attente').map(({ element, fin, etat }) => ({ element, fin, etat }));
  }

  abonner(f: (issue?: Issue<T>) => void): () => void {
    this.ecouteurs.add(f);
    return () => { this.ecouteurs.delete(f); };
  }

  private async envoyerUne(id: string): Promise<void> {
    const s = this.file.get(id);
    if (!s || s.etat !== 'attente') return;
    s.etat = 'envoi';
    this.dire();
    try {
      await this.envoyer(id);
      this.file.delete(id);
      this.dire({ genre: 'supprimee', element: s.element });
    } catch (e) {
      // L'envoi a echoue : la photo est encore sur le serveur, elle revient a l'ecran.
      this.file.delete(id);
      this.dire({ genre: 'echec', element: s.element, erreur: e instanceof Error ? e : new Error(String(e)) });
    }
  }

  private dire(issue?: Issue<T>): void { for (const f of this.ecouteurs) f(issue); }
}
