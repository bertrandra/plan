// Les batiments de la BD TOPO, lus par cases et gardes en memoire (15 novembre 2026). Deux choses les demandent : le tri des photos
// (« Seulement les facades ») et la couverture grise de la carte. Une seule lecture par case pour les deux, deux a la fois au plus,
// abandonnee quand plus personne n'en veut ; une case en panne attend avant d'etre redemandee. De quoi ne pas inonder le WFS de la
// Geoplateforme en se promenant. Sans DOM (la lecture est donnee), testable seul.

import { Recents } from './cache.js';
import { cleDeCase, empriseDeLaCase, type Case } from './couvertureFacades.js';
import { lireLesBatiments, ranger, type Batiment, type Scene } from './facadesVues.js';

export type EtatCase = 'lue' | 'tronquee' | 'panne' | 'lecture' | 'absente';

/** Les cases gardees : une quinzaine de kilometres carres, quelques milliers de batiments en ville. */
const CASES_MAX = 24;
const LECTURES_A_LA_FOIS = 2;
/** Une case refusee ne se redemande pas avant ce delai. */
export const DELAI_PANNE_MS = 20000;

export class LecteurDeCases {
  private readonly lues = new Recents<Batiment[] | 'tronquee'>(CASES_MAX);
  private readonly enCours = new Map<string, AbortController>();
  private readonly pannes = new Map<string, number>();
  private readonly voulues = new Map<string, Map<string, Case>>();
  private readonly abonnes = new Set<() => void>();
  private scenes = new Map<string, Scene>();
  private n = 0;

  /** `lire` lit un JSON du WFS (et peut etre abandonnee) ; `maintenant` et `plusTard` : l'horloge, pour les essais. */
  constructor(private readonly lire: (url: string, signal: AbortSignal) => Promise<unknown>, private readonly maintenant: () => number = () => Date.now(), private readonly plusTard: (f: () => void, ms: number) => void = (f, ms) => { setTimeout(f, ms); }) {}

  /** Change a chaque case lue, tronquee ou en panne : de quoi savoir quand redessiner. */
  get version(): number { return this.n; }
  readonly abonner = (f: () => void): (() => void) => { this.abonnes.add(f); return () => { this.abonnes.delete(f); }; };
  private dire(): void { this.n++; this.scenes = new Map(); for (const f of this.abonnes) f(); }

  /** Les cases que `qui` veut maintenant (toutes ses cases, pas un ajout) : les lectures dont plus personne ne veut s'arretent. */
  vouloir(qui: string, cases: readonly Case[]): void {
    this.voulues.set(qui, new Map(cases.map((c) => [cleDeCase(c), c])));
    for (const [cle, arret] of this.enCours) if (!this.estVoulue(cle)) { arret.abort(); this.enCours.delete(cle); }
    this.avancer();
  }

  private estVoulue(cle: string): boolean { for (const m of this.voulues.values()) if (m.has(cle)) return true; return false; }

  private avancer(): void {
    for (const m of this.voulues.values()) {
      for (const [cle, c] of m) {
        if (this.enCours.size >= LECTURES_A_LA_FOIS) return;
        if (this.lues.lire(cle) || this.enCours.has(cle) || this.maintenant() - (this.pannes.get(cle) ?? -Infinity) < DELAI_PANNE_MS) continue;
        this.lancer(cle, c);
      }
    }
  }

  private lancer(cle: string, c: Case): void {
    const arret = new AbortController();
    this.enCours.set(cle, arret);
    lireLesBatiments(empriseDeLaCase(c), (url) => this.lire(url, arret.signal)).then((r) => {
      if (arret.signal.aborted) return;
      this.pannes.delete(cle);
      this.lues.garder(cle, r.tronque ? 'tronquee' : r.batiments);
    }, () => {
      if (arret.signal.aborted) return;
      this.pannes.set(cle, this.maintenant());
      this.plusTard(() => { this.avancer(); }, DELAI_PANNE_MS + 50);
    }).finally(() => {
      if (this.enCours.get(cle) === arret) this.enCours.delete(cle);
      if (!arret.signal.aborted) this.dire();
      this.avancer();
    });
  }

  etat(cle: string): EtatCase {
    const l = this.lues.lire(cle);
    if (l) return l === 'tronquee' ? 'tronquee' : 'lue';
    if (this.enCours.has(cle)) return 'lecture';
    return this.pannes.has(cle) ? 'panne' : 'absente';
  }

  /** Les murs des cases lues parmi celles-ci (un batiment a cheval sur deux cases n'y est qu'une fois) ; la meme scene tant que rien ne change. */
  scene(cles: readonly string[]): Scene {
    const lues = cles.filter((c) => this.etat(c) === 'lue').sort(), k = lues.join(' ');
    let s = this.scenes.get(k);
    if (!s) {
      const vus = new Map<string, Batiment>();
      for (const c of lues) for (const b of this.lues.lire(c) as Batiment[]) vus.set(b.id, b);
      s = ranger([...vus.values()]);
      // Deux consommateurs, deux jeux de cases au plus : on ne garde pas les scenes d'avant.
      if (this.scenes.size >= 4) this.scenes = new Map();
      this.scenes.set(k, s);
    }
    return s;
  }
}
