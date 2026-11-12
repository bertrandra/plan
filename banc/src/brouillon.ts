// Le marquage brouillon (etape 3) : ce que trouvent les modeles YOLO actifs et l'algorithme de recherche des baies (la copie figee de
// Plan), fondu en une liste d'objets « auto » que la personne corrige ensuite (etape 4).

import type { Classe, Modele, Objet } from './types.js';
import { cibleDuNom } from './classes.js';
import { iou, rangerLesParents, type Boite } from './geometrie.js';
import { detecterBaies } from './plan/facade/detection/baies/vote.js';
import type { Image } from './plan/facade/vision/homographie.js';

/** Une proposition avant fusion : sa classe du banc (et son type quand le modele le dit), sa boite, son score, qui l'a faite. */
export interface Proposition { classe: string; type?: string; boite: Boite; score: number; modele: string }

/** Les types de baie de l'algorithme de recherche, rapportes aux classes du banc (« classe:type » quand il dit le type). */
export const TYPES_RECHERCHE: Record<string, string> = { fenetre: 'fenetre', 'porte-fenetre': 'fenetre:porte_fenetre', porte: 'porte', garage: 'porte:porte_garage' };
/** Deux propositions de la meme classe qui se recouvrent a ce point n'en font qu'une. */
const MEME_OBJET = 0.5;
/** Les classes qu'un detecteur confond : une fenetre (une porte-fenetre) et une porte au meme endroit sont la meme baie. */
const VOISINES: Record<string, string> = { porte: 'baie', fenetre: 'baie' };

/**
 * La cible d'une correspondance : « classe » ou « classe:type » ; null quand la classe n'est pas dans l'arbre, ou que le type n'est pas
 * un des siens (la classe seule est alors gardee).
 */
export function lireCible(cible: string | undefined, classes: readonly Classe[]): { classe: string; type?: string } | null {
  if (!cible) return null;
  const [classe = '', type] = cible.split(':');
  const c = classes.find((x) => x.id === classe);
  if (!c) return null;
  return type && c.types?.some((t) => t.id === type) ? { classe, type } : { classe };
}

/** La correspondance par defaut d'un modele : chaque nom qui est un type ou une classe de l'arbre va vers lui. */
export function correspondanceParDefaut(noms: readonly string[], classes: readonly Classe[]): Record<string, string> {
  return Object.fromEntries(noms.map((n) => { const c = cibleDuNom(n, classes); return [n, c ? (c.type ? c.classe + ':' + c.type : c.classe) : '']; }));
}

/** L'algorithme de recherche des baies (vote de trois detecteurs) : ses baies, notees par leur nombre de voix sur trois. */
export function parLaRecherche(img: Image): Proposition[] {
  const r = detecterBaies(img, null, null);
  return r.baies.flatMap((b) => {
    const [classe, type] = (TYPES_RECHERCHE[b.type] ?? '').split(':');
    return classe ? [{ classe, ...(type ? { type } : {}), boite: { x0: b.px.x, y0: b.px.y, x1: b.px.x + b.px.l, y1: b.px.y + b.px.h }, score: Math.min(1, 0.35 + 0.2 * b.carreaux), modele: 'recherche' }] : [];
  });
}

/** Les detections d'un modele rapportees aux classes du banc par sa correspondance ; une classe sans correspondance est laissee. */
export function selonLaCorrespondance(m: Modele, dets: readonly { classe: number; score: number; boite: Boite }[], classes: readonly Classe[]): Proposition[] {
  return dets.flatMap((d) => {
    const nom = m.classes[d.classe];
    const c = lireCible(nom !== undefined ? m.correspondance[nom] : undefined, classes);
    return c ? [{ ...c, boite: d.boite, score: d.score, modele: m.id }] : [];
  });
}

/** Fond les propositions : de la meme classe (ou de classes voisines) et qui se recouvrent, la mieux notee reste. */
export function fusionner(props: readonly Proposition[]): Proposition[] {
  const garde: Proposition[] = [];
  for (const p of [...props].sort((a, b) => b.score - a.score)) {
    const famille = VOISINES[p.classe] ?? p.classe;
    if (!garde.some((g) => (VOISINES[g.classe] ?? g.classe) === famille && iou(g.boite, p.boite) >= MEME_OBJET)) garde.push(p);
  }
  return garde;
}

/** Les objets du brouillon, numerotes a1, a2…, rectangles, ranges sous leurs parents. */
export function objetsDuBrouillon(props: readonly Proposition[], classes: readonly Classe[]): Objet[] {
  const objets: Objet[] = fusionner(props).map((p, i) => ({
    id: 'a' + (i + 1), classe: p.classe, ...(p.type ? { type: p.type } : {}), forme: 'rectangle',
    points: [{ x: Math.round(p.boite.x0 * 10) / 10, y: Math.round(p.boite.y0 * 10) / 10 }, { x: Math.round(p.boite.x1 * 10) / 10, y: Math.round(p.boite.y1 * 10) / 10 }],
    parent: null, attributs: {}, origine: 'auto', score: Math.round(p.score * 1000) / 1000, modele: p.modele,
  }));
  return rangerLesParents(objets, classes);
}

/**
 * Le brouillon d'une image qui a deja un marquage : les objets poses ou corriges a la main restent, ceux du brouillon precedent partent,
 * et les nouveaux qui recouvrent un objet garde de la meme famille ne s'ajoutent pas.
 */
export function brouillonSurExistant(existants: readonly Objet[], nouveaux: readonly Objet[], classes: readonly Classe[]): Objet[] {
  const gardes = existants.filter((o) => o.origine !== 'auto');
  const boiteDe = (o: Objet): Boite => ({ x0: Math.min(...o.points.map((p) => p.x)), y0: Math.min(...o.points.map((p) => p.y)), x1: Math.max(...o.points.map((p) => p.x)), y1: Math.max(...o.points.map((p) => p.y)) });
  const famille = (c: string) => VOISINES[c] ?? c;
  const ajouts = nouveaux.filter((n) => !gardes.some((g) => famille(g.classe) === famille(n.classe) && iou(boiteDe(g), boiteDe(n)) >= MEME_OBJET));
  const ids = new Set(gardes.map((o) => o.id));
  let k = 1;
  const renum = ajouts.map((o) => { while (ids.has('a' + k)) k++; ids.add('a' + k); return { ...o, id: 'a' + k, parent: null }; });
  return rangerLesParents([...gardes, ...renum], classes);
}
