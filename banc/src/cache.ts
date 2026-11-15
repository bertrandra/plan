// Une petite memoire des dernieres choses lues (les panoramiques reduits de l'import Panoramax : 8 Mo de pixels chacun). On en garde
// quelques-unes pour que revenir sur une photo deja survolee soit immediat, et on rend la plus ancienne des qu'il y en a trop.

export class Recents<V> {
  private readonly m = new Map<string, V>();
  constructor(private readonly max: number, private readonly rendre: (v: V) => void = () => {}) {}

  /** La valeur gardee ; la lire la remet en tete (la moins recemment lue part la premiere). */
  lire(cle: string): V | undefined {
    const v = this.m.get(cle);
    if (v !== undefined) { this.m.delete(cle); this.m.set(cle, v); }
    return v;
  }

  garder(cle: string, v: V): void {
    const avant = this.m.get(cle);
    if (avant !== undefined && avant !== v) this.rendre(avant);
    this.m.delete(cle);
    this.m.set(cle, v);
    while (this.m.size > this.max) {
      const vieille = this.m.keys().next().value as string;
      const w = this.m.get(vieille) as V;
      this.m.delete(vieille);
      this.rendre(w);
    }
  }

  vider(): void { for (const v of this.m.values()) this.rendre(v); this.m.clear(); }
  get taille(): number { return this.m.size; }
  get cles(): string[] { return [...this.m.keys()]; }
}
