// Ce que fait l'editeur du marquage (etape 4), sans DOM : creer, deplacer, tirer un sommet, supprimer, changer de classe, annuler.
// Chaque geste rend une nouvelle liste d'objets ; l'historique garde les precedentes.

import type { Classe, Objet, P } from './types.js';
import { boite, borner, deplacer as deplacerObjet, nouvelId } from './geometrie.js';

/** Un objet touche par la personne : celui du brouillon devient « corrige ». */
const touche = (o: Objet): Objet => (o.origine === 'auto' ? { ...o, origine: 'corrige' } : o);

export function creerRectangle(objets: readonly Objet[], classe: string, a: P, b: P): Objet {
  return { id: nouvelId(objets, 'm'), classe, forme: 'rectangle', points: [{ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) }], parent: null, attributs: {}, origine: 'main' };
}

export function creerPolygone(objets: readonly Objet[], classe: string, points: readonly P[], forme: 'polygone' | 'ligne' | 'point' = 'polygone'): Objet {
  return { id: nouvelId(objets, 'm'), classe, forme, points: points.map((p) => ({ ...p })), parent: null, attributs: {}, origine: 'main' };
}

/** Les poignees d'un objet : les quatre coins d'un rectangle (hg, hd, bd, bg), les sommets d'un polygone ou d'une ligne. */
export function poignees(o: Objet): P[] {
  if (o.forme !== 'rectangle') return o.points;
  const b = boite(o.points);
  return [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }];
}

/** Tire la poignee `k` d'un objet en `p` : le coin oppose d'un rectangle reste ou il est. */
export function tirerPoignee(o: Objet, k: number, p: P, L: number, H: number): Objet {
  if (o.forme !== 'rectangle') return borner(touche({ ...o, points: o.points.map((q, i) => (i === k ? p : q)) }), L, H);
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

/** Ajoute un sommet a un polygone ou a une ligne, au milieu de son cote `k` (de k a k + 1 ; une ligne n'a pas de cote de fermeture). */
export function ajouterSommet(o: Objet, k: number): Objet {
  if (o.forme === 'rectangle' || o.forme === 'point' || (o.forme === 'ligne' && k >= o.points.length - 1)) return o;
  const a = o.points[k] as P, b = o.points[(k + 1) % o.points.length] as P;
  const pts = [...o.points];
  pts.splice(k + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return touche({ ...o, points: pts });
}

/** Retire un sommet d'un polygone qui en garde au moins trois, d'une ligne qui en garde au moins deux. */
export function retirerSommet(o: Objet, k: number): Objet {
  const min = o.forme === 'polygone' ? 3 : o.forme === 'ligne' ? 2 : Infinity;
  return o.points.length > min ? touche({ ...o, points: o.points.filter((_, i) => i !== k) }) : o;
}

/** Un rectangle devient le polygone de ses quatre coins (pour suivre un cintre, un pignon). */
export function enPolygone(o: Objet): Objet {
  return o.forme !== 'rectangle' ? o : touche({ ...o, forme: 'polygone', points: poignees(o) });
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

/** Un objet et tous ses descendants (une fenetre et ses cadres), dans l'ordre de la liste : ce que copient Ctrl+C et Ctrl+X. */
export function avecDescendants(objets: readonly Objet[], id: string): Objet[] {
  const ids = new Set([id]);
  for (let ajout = true; ajout;) {
    ajout = false;
    for (const o of objets) if (o.parent && ids.has(o.parent) && !ids.has(o.id)) { ids.add(o.id); ajout = true; }
  }
  return objets.filter((o) => ids.has(o.id));
}

/**
 * Colle des objets copies (Ctrl+V) : de nouveaux identifiants, les liens parent-enfant gardes entre eux, le premier sans parent (le
 * rangement le replacera), poses « a la main ». Sur la photo d'ou ils viennent, ils se decalent de `decalage` pour ne pas tomber sur
 * l'original ; ils restent dans l'image (un decalage qui sortirait est retourne). Rend la liste complete et l'identifiant du premier colle.
 */
export function coller(objets: readonly Objet[], copies: readonly Objet[], L: number, H: number, decalage: number): { objets: Objet[]; premier: string | null } {
  if (!copies.length) return { objets: [...objets], premier: null };
  const b = boite(copies.flatMap((o) => o.points));
  const dx = b.x1 + decalage <= L ? decalage : -Math.min(decalage, b.x0), dy = b.y1 + decalage <= H ? decalage : -Math.min(decalage, b.y0);
  const nouveaux = new Map<string, string>();
  const liste = [...objets];
  for (const c of copies) { const id = nouvelId(liste, 'm'); nouveaux.set(c.id, id); liste.push({ ...c, id }); }
  const colles = copies.map((c) => {
    const { score: _score, modele: _modele, ...reste } = c;
    void _score; void _modele;
    return borner(deplacerObjet({ ...reste, id: nouveaux.get(c.id) as string, parent: c.parent ? nouveaux.get(c.parent) ?? null : null, origine: 'main' }, dx, dy), L, H);
  });
  return { objets: [...objets, ...colles], premier: colles[0]?.id ?? null };
}

/** Le point est-il dans le polygone (regle du nombre de traversees) ? */
function dansPolygone(p: P, poly: readonly P[]): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i] as P, b = poly[j] as P;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

/** La zone d'une selection : la boite tiree (deux coins opposes) ou le lasso (le trace du doigt), en polygone. */
export function zoneDeSelection(points: readonly P[], mode: 'boite' | 'lasso'): P[] {
  if (mode === 'lasso') return [...points];
  const a = points[0], b = points[points.length - 1];
  if (!a || !b) return [];
  return [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }];
}

/** Les objets entierement dans la zone (tous les points de leur contour) : une facade autour ne se prend pas avec ses fenetres. */
export function objetsDansLaZone(objets: readonly Objet[], zone: readonly P[]): string[] {
  if (zone.length < 3) return [];
  return objets.filter((o) => poignees(o).every((p) => dansPolygone(p, zone))).map((o) => o.id);
}

export type Cote = 'haut' | 'bas' | 'gauche' | 'droite';

/** Aligne les objets choisis sur un bord de l'objet de reference (sa boite) ; la reference ne bouge pas. */
export function aligner(objets: readonly Objet[], ids: ReadonlySet<string>, reference: string, cote: Cote): Objet[] {
  const ref = objets.find((o) => o.id === reference);
  if (!ref) return [...objets];
  const r = boite(ref.points);
  return objets.map((o) => {
    if (o.id === reference || !ids.has(o.id)) return o;
    const b = boite(o.points);
    const dx = cote === 'gauche' ? r.x0 - b.x0 : cote === 'droite' ? r.x1 - b.x1 : 0;
    const dy = cote === 'haut' ? r.y0 - b.y0 : cote === 'bas' ? r.y1 - b.y1 : 0;
    return dx || dy ? touche(deplacerObjet(o, dx, dy)) : o;
  });
}

/**
 * Donne aux objets choisis la largeur, la hauteur ou les deux de l'objet de reference : chacun s'etire depuis son coin haut gauche
 * (alignez ensuite). Un point n'a pas de taille ; un objet sans largeur (ou sans hauteur) garde la sienne.
 */
export function memeTaille(objets: readonly Objet[], ids: ReadonlySet<string>, reference: string, sens: 'largeur' | 'hauteur' | 'les-deux'): Objet[] {
  const ref = objets.find((o) => o.id === reference);
  if (!ref) return [...objets];
  const r = boite(ref.points);
  return objets.map((o) => {
    if (o.id === reference || !ids.has(o.id) || o.forme === 'point') return o;
    const b = boite(o.points), w = b.x1 - b.x0, h = b.y1 - b.y0;
    const kx = sens !== 'hauteur' && w > 0 ? (r.x1 - r.x0) / w : 1, ky = sens !== 'largeur' && h > 0 ? (r.y1 - r.y0) / h : 1;
    if (kx === 1 && ky === 1) return o;
    return touche({ ...o, points: o.points.map((p) => ({ x: b.x0 + (p.x - b.x0) * kx, y: b.y0 + (p.y - b.y0) * ky })) });
  });
}
