// Ce que fait l'editeur du marquage (etape 4), sans DOM : creer, deplacer, tirer un sommet, supprimer, changer de classe, annuler.
// Chaque geste rend une nouvelle liste d'objets ; l'historique garde les precedentes.

import type { Classe, Objet, P } from './types.js';
import { boite, borner, deplacer as deplacerObjet, nouvelId } from './geometrie.js';

/** Un objet touche par la personne : celui du brouillon devient « corrige ». */
const touche = (o: Objet): Objet => (o.origine === 'auto' ? { ...o, origine: 'corrige' } : o);

export function creerRectangle(objets: readonly Objet[], classe: string, a: P, b: P): Objet {
  return { id: nouvelId(objets, 'm'), classe, forme: 'rectangle', points: [{ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }], parent: null, attributs: {}, origine: 'main' };
}

export function creerPolygone(objets: readonly Objet[], classe: string, points: readonly P[]): Objet {
  return { id: nouvelId(objets, 'm'), classe, forme: 'polygone', points: points.map((p) => ({ ...p })), parent: null, attributs: {}, origine: 'main' };
}

/** Les poignees d'un objet : les quatre coins d'un rectangle (hg, hd, bd, bg), les sommets d'un polygone. */
export function poignees(o: Objet): P[] {
  if (o.forme === 'polygone') return o.points;
  const b = boite(o.points);
  return [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }];
}

/** Tire la poignee `k` d'un objet en `p` : le coin oppose d'un rectangle reste ou il est. */
export function tirerPoignee(o: Objet, k: number, p: P, L: number, H: number): Objet {
  if (o.forme === 'polygone') return borner(touche({ ...o, points: o.points.map((q, i) => (i === k ? p : q)) }), L, H);
  const c = poignees(o);
  const oppose = c[(k + 2) % 4] as P;
  return borner(touche({ ...o, points: [{ x: Math.min(oppose.x, p.x), y: Math.min(oppose.y, p.y) }, { x: Math.max(oppose.x, p.x), y: Math.max(oppose.y, p.y) }] }), L, H);
}

/** Deplace un objet de (dx, dy), sans le sortir de l'image. */
export function deplacer(o: Objet, dx: number, dy: number, L: number, H: number): Objet {
  const b = boite(o.points);
  const ddx = Math.min(L - b.x1, Math.max(-b.x0, dx)), ddy = Math.min(H - b.y1, Math.max(-b.y0, dy));
  return touche(deplacerObjet(o, ddx, ddy));
}

/** Retire un objet ; ses enfants perdent leur parent (ils restent). */
export function supprimer(objets: readonly Objet[], id: string): Objet[] {
  return objets.filter((o) => o.id !== id).map((o) => (o.parent === id ? { ...o, parent: null } : o));
}

/** Change la classe d'un objet ; ses attributs qui n'existent pas dans la nouvelle classe partent. */
export function changerClasse(o: Objet, c: Classe): Objet {
  const cles = new Set(c.attributs.map((a) => a.cle));
  const { type, ...reste } = o;
  // Un type qui n'est pas de la nouvelle classe part : l'objet est a qualifier de nouveau.
  const garde = type && c.types?.some((t) => t.id === type) ? { type } : {};
  return touche({ ...reste, ...garde, classe: c.id, attributs: Object.fromEntries(Object.entries(o.attributs).filter(([k]) => cles.has(k))) });
}

/** Qualifie un objet par un type de sa classe (vide : le retire). */
export function changerType(o: Objet, type: string): Objet {
  const { type: _avant, ...reste } = o;
  void _avant;
  return touche(type ? { ...reste, type } : reste);
}

export function changerAttribut(o: Objet, cle: string, valeur: string | number | boolean | null): Objet {
  const a = { ...o.attributs };
  if (valeur === null || valeur === '') delete a[cle];
  else a[cle] = valeur;
  return touche({ ...o, attributs: a });
}

/** Ajoute un sommet a un polygone, au milieu de son cote `k` (de k a k + 1). */
export function ajouterSommet(o: Objet, k: number): Objet {
  if (o.forme !== 'polygone') return o;
  const a = o.points[k] as P, b = o.points[(k + 1) % o.points.length] as P;
  const pts = [...o.points];
  pts.splice(k + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return touche({ ...o, points: pts });
}

/** Retire un sommet d'un polygone qui en garde au moins trois. */
export function retirerSommet(o: Objet, k: number): Objet {
  return o.forme === 'polygone' && o.points.length > 3 ? touche({ ...o, points: o.points.filter((_, i) => i !== k) }) : o;
}

/** Un rectangle devient le polygone de ses quatre coins (pour suivre un cintre, un pignon). */
export function enPolygone(o: Objet): Objet {
  return o.forme === 'polygone' ? o : touche({ ...o, forme: 'polygone', points: poignees(o) });
}

/** Un historique borne : annuler et refaire. */
export class Historique<T> {
  private passe: T[] = [];
  private futur: T[] = [];
  constructor(private max = 100) {}
  noter(etat: T): void { this.passe.push(etat); if (this.passe.length > this.max) this.passe.shift(); this.futur = []; }
  annuler(courant: T): T | null { const p = this.passe.pop(); if (p === undefined) return null; this.futur.push(courant); return p; }
  refaire(courant: T): T | null { const f = this.futur.pop(); if (f === undefined) return null; this.passe.push(courant); return f; }
  vider(): void { this.passe = []; this.futur = []; }
}
