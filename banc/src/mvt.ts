// Un lecteur de tuiles vectorielles (Mapbox Vector Tile, du protobuf), pour la couverture de Panoramax sur la carte de l'import (demande
// du proprietaire, 15 novembre 2026 : savoir ou il y a des photos avant de zoomer). Juste ce qu'il faut : les couches, leurs objets
// (points, lignes, polygones, en unites de la tuile) et leurs attributs. Sans dependance ni DOM, testable seul (banc/tests/mvt.test.ts).

export type Attribut = string | number | boolean;
export interface ObjetMvt {
  type: 'point' | 'ligne' | 'polygone' | 'inconnu';
  /** Les parties de la geometrie (un point seul, une ligne, un anneau), chacune a plat : x0, y0, x1, y1… de 0 a `etendue`. */
  parties: number[][];
  attributs: Record<string, Attribut>;
}
export interface CoucheMvt { nom: string; etendue: number; objets: ObjetMvt[] }

/** Un curseur sur les octets d'un message protobuf. */
class Lecteur {
  p: number;
  constructor(readonly o: Uint8Array, debut = 0, readonly fin = o.length) { this.p = debut; }
  get reste(): boolean { return this.p < this.fin; }
  /** Un entier a longueur variable (sept bits par octet, les petits d'abord) ; en flottant au-dela de 32 bits, sans perte jusqu'a 2^53. */
  varint(): number {
    let v = 0, k = 1;
    for (;;) {
      const b = this.o[this.p++];
      if (b === undefined || this.p > this.fin) throw new Error('Tuile tronquée');
      v += (b & 0x7f) * k;
      if (b < 0x80) return v;
      k *= 128;
    }
  }
  /** Le champ suivant : son numero et son type de codage. */
  champ(): { n: number; t: number } { const c = this.varint(); return { n: Math.floor(c / 8), t: c & 7 }; }
  /** Un sous-message (ou une chaine, ou une suite compacte) : un lecteur borne a ses octets. */
  bloc(): Lecteur { const l = this.varint(), d = this.p; this.p += l; if (this.p > this.fin) throw new Error('Tuile tronquée'); return new Lecteur(this.o, d, d + l); }
  texte(): string { return new TextDecoder().decode(this.o.subarray(this.p, this.fin)); }
  vue(): DataView { return new DataView(this.o.buffer, this.o.byteOffset + this.p, this.fin - this.p); }
  /** Passe un champ qu'on ne lit pas. */
  passer(t: number): void {
    if (t === 0) this.varint(); else if (t === 1) this.p += 8; else if (t === 2) this.bloc(); else if (t === 5) this.p += 4; else throw new Error('Tuile illisible');
  }
}

const zigzag = (n: number): number => (n % 2 ? -(n + 1) / 2 : n / 2);

function valeur(l: Lecteur): Attribut {
  let v: Attribut = '';
  while (l.reste) {
    const { n, t } = l.champ();
    if (n === 1 && t === 2) v = l.bloc().texte();
    else if (n === 2 && t === 5) { v = l.vue().getFloat32(0, true); l.p += 4; }
    else if (n === 3 && t === 1) { v = l.vue().getFloat64(0, true); l.p += 8; }
    else if ((n === 4 || n === 5) && t === 0) v = l.varint();
    else if (n === 6 && t === 0) v = zigzag(l.varint());
    else if (n === 7 && t === 0) v = l.varint() !== 0;
    else l.passer(t);
  }
  return v;
}

/** La geometrie : des commandes (aller a, tracer jusqu'a, fermer) et des deplacements en zigzag depuis le point precedent. */
function geometrie(l: Lecteur): number[][] {
  const parties: number[][] = [];
  let x = 0, y = 0, partie: number[] | null = null;
  while (l.reste) {
    const c = l.varint(), commande = c & 7;
    let n = Math.floor(c / 8);
    if (commande === 7) { if (partie && partie.length >= 2) partie.push(partie[0] as number, partie[1] as number); continue; }
    for (; n > 0 && l.reste; n--) {
      x += zigzag(l.varint()); y += zigzag(l.varint());
      if (commande === 1 || !partie) { partie = []; parties.push(partie); }
      partie.push(x, y);
    }
  }
  return parties;
}

const TYPES: ObjetMvt['type'][] = ['inconnu', 'point', 'ligne', 'polygone'];

function couche(l: Lecteur, garder: (nom: string) => boolean): CoucheMvt | null {
  let nom = '', etendue = 4096;
  const cles: string[] = [], valeurs: Attribut[] = [], bruts: { type: number; tags: number[]; geo: Lecteur | null }[] = [];
  while (l.reste) {
    const { n, t } = l.champ();
    if (n === 1 && t === 2) { nom = l.bloc().texte(); if (!garder(nom)) return null; }
    else if (n === 3 && t === 2) cles.push(l.bloc().texte());
    else if (n === 4 && t === 2) valeurs.push(valeur(l.bloc()));
    else if (n === 5 && t === 0) etendue = l.varint();
    else if (n === 2 && t === 2) {
      const f = l.bloc(), o = { type: 0, tags: [] as number[], geo: null as Lecteur | null };
      while (f.reste) {
        const c = f.champ();
        if (c.n === 2 && c.t === 2) { const s = f.bloc(); while (s.reste) o.tags.push(s.varint()); }
        else if (c.n === 3 && c.t === 0) o.type = f.varint();
        else if (c.n === 4 && c.t === 2) o.geo = f.bloc();
        else f.passer(c.t);
      }
      bruts.push(o);
    } else l.passer(t);
  }
  const objets = bruts.map((o): ObjetMvt => {
    const attributs: Record<string, Attribut> = {};
    for (let i = 0; i + 1 < o.tags.length; i += 2) { const c = cles[o.tags[i] as number], v = valeurs[o.tags[i + 1] as number]; if (c !== undefined && v !== undefined) attributs[c] = v; }
    return { type: TYPES[o.type] ?? 'inconnu', parties: o.geo ? geometrie(o.geo) : [], attributs };
  });
  return { nom, etendue, objets };
}

/** Les couches d'une tuile ; `garder` ne lit que celles qu'on veut (les autres sont passees sans etre decodees). */
export function lireTuile(octets: Uint8Array, garder: (nom: string) => boolean = () => true): CoucheMvt[] {
  const l = new Lecteur(octets), out: CoucheMvt[] = [];
  while (l.reste) {
    const { n, t } = l.champ();
    if (n === 3 && t === 2) { const c = couche(l.bloc(), garder); if (c) out.push(c); } else l.passer(t);
  }
  return out;
}
