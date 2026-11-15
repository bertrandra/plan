// Une file de lectures en tache de fond (« la maison se voit-elle ? », vueDegagee.ts) : une seule a la fois, une file bornee, et tout
// s'arrete quand on ne demande plus rien. De quoi lire les apercus sans bloquer l'ecran ni telecharger en rafale. Chaque tache a une
// cle : une tache deja lue, ou qui a echoue, ne se relit pas. Sans DOM (la lecture est donnee), testable seul.

import { Recents } from './cache.js';

export interface Tache<C> { cle: string; charge: C }

/** Les taches gardees en attente : au-dela, les dernieres demandees attendent d'etre redemandees. */
export const FILE_MAX = 40;
/** Les resultats gardes en memoire. */
const RESULTATS_MAX = 2000;

export class FileDeLectures<C, R> {
  private readonly resultats = new Recents<{ r: R | null }>(RESULTATS_MAX);
  private file: Tache<C>[] = [];
  private enCours: { cle: string; arret: AbortController } | null = null;
  private readonly abonnes = new Set<() => void>();
  private n = 0;

  /** `lire` fait une lecture (et peut etre abandonnee) ; `plusTard` rend la main a l'ecran entre deux lectures. */
  constructor(private readonly lire: (charge: C, signal: AbortSignal) => Promise<R>, private readonly max = FILE_MAX, private readonly plusTard: (f: () => void) => void = (f) => { setTimeout(f, 0); }) {}

  get version(): number { return this.n; }
  readonly abonner = (f: () => void): (() => void) => { this.abonnes.add(f); return () => { this.abonnes.delete(f); }; };

  /** Le resultat d'une tache : `undefined` tant qu'elle n'est pas lue, `null` si sa lecture a echoue (elle ne sera pas reessayee). */
  resultat(cle: string): R | null | undefined { return this.resultats.lire(cle)?.r; }

  /**
   * Les taches voulues maintenant, dans l'ordre (toute la file, pas un ajout) : les `max` premieres qui ne sont pas deja lues. La
   * lecture en cours s'arrete si elle n'est plus demandee.
   */
  demander(taches: readonly Tache<C>[]): void {
    const vues = new Set<string>();
    this.file = taches.filter((t) => !this.resultats.lire(t.cle) && !vues.has(t.cle) && !!vues.add(t.cle)).slice(0, this.max);
    if (this.enCours && !vues.has(this.enCours.cle)) { this.enCours.arret.abort(); this.enCours = null; }
    this.avancer();
  }

  private avancer(): void {
    if (this.enCours) return;
    const t = this.file.find((x) => !this.resultats.lire(x.cle));
    if (!t) return;
    const arret = new AbortController(), moi = { cle: t.cle, arret };
    this.enCours = moi;
    const finir = (r: R | null) => {
      if (arret.signal.aborted) return;
      this.resultats.garder(t.cle, { r });
      this.enCours = null;
      this.n++;
      for (const f of this.abonnes) f();
      this.plusTard(() => { this.avancer(); });
    };
    this.lire(t.charge, arret.signal).then(finir, () => finir(null));
  }
}
