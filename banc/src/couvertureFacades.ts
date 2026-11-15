// La couverture qui dit ou sont les facades (demande du proprietaire, 15 novembre 2026). La couverture orange de Panoramax montre ou il
// y a des photos, pas ou il y a des facades : une route de campagne photographiee de bout en bout est orange et l'on zoome pour rien. A
// l'echelle ou les batiments de la BD TOPO se lisent sans inonder le serveur (une vue de LARGEUR_FACADES_MAX_M au plus, par cases
// gardees en memoire), les troncons des traces sans facade a portee se dessinent en gris. Ce module fait le partage ; il ne lit rien.
// Regle d'or : un troncon dont on ne sait rien (batiments pas lus, en panne, tronques) reste orange. Sans DOM, testable seul.

import { duMonde, versMonde, type Emprise } from './carte.js';
import type { Ll } from './parcelles.js';

/** Au-dela de cette largeur de vue, les batiments ne se lisent pas pour la couverture : rien ne change, tout est orange. */
export const LARGEUR_FACADES_MAX_M = 800;
/** Le niveau des cases par lesquelles les batiments se lisent : environ 800 m de cote en France, quatre cases au plus pour une vue. */
export const NIVEAU_CASES = 15;
/** Ce qu'une case lit autour d'elle : la portee d'une vue (40 m) et un peu plus, pour qu'un point au bord de la case ait tous ses murs. */
export const MARGE_CASE_M = 60;
/** Le pas du partage d'un trace, en metres : un troncon plus court qu'une facade de maison. */
export const PAS_TRONCON_M = 8;

export interface Case { x: number; y: number }
export const cleDeCase = (c: Case): string => c.x + '/' + c.y;

/** La case qui contient un point. */
export function caseDuPoint(p: Ll, niveau = NIVEAU_CASES): Case {
  const m = versMonde(p), n = 2 ** niveau;
  return { x: Math.floor(m.x * n), y: Math.floor(m.y * n) };
}

/** Les cases que touche une emprise. */
export function casesDeLEmprise(e: Emprise, niveau = NIVEAU_CASES): Case[] {
  const a = caseDuPoint({ lat: e.nord, lon: e.ouest }, niveau), b = caseDuPoint({ lat: e.sud, lon: e.est }, niveau), out: Case[] = [];
  for (let y = a.y; y <= b.y; y++) for (let x = a.x; x <= b.x; x++) out.push({ x, y });
  return out;
}

/** L'emprise d'une case, agrandie de `margeM` metres de chaque cote : ce qu'on lit de la BD TOPO pour elle. */
export function empriseDeLaCase(c: Case, margeM = MARGE_CASE_M, niveau = NIVEAU_CASES): Emprise {
  const n = 2 ** niveau, no = duMonde({ x: c.x / n, y: c.y / n }), se = duMonde({ x: (c.x + 1) / n, y: (c.y + 1) / n });
  const dLat = margeM / 111320, dLon = dLat / Math.cos((((no.lat + se.lat) / 2) * Math.PI) / 180);
  return { sud: se.lat - dLat, ouest: no.lon - dLon, nord: no.lat + dLat, est: se.lon + dLon };
}

/** Le coin d'une tuile et ce que vaut une de ses unites : de quoi passer des unites de la tuile (son etendue) aux degres. */
export function versLlDeLaTuile(z: number, x: number, y: number, etendue: number): (ux: number, uy: number) => Ll {
  const n = 2 ** z;
  return (ux, uy) => duMonde({ x: (x + ux / etendue) / n, y: (y + uy / etendue) / n });
}

/** Les metres d'une unite d'une tuile, a sa latitude. */
export function metresParUnite(z: number, y: number, etendue: number): number {
  const lat = duMonde({ x: 0, y: (y + 0.5) / 2 ** z }).lat;
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / 2 ** z / etendue;
}

export interface Partage { orange: Float32Array[]; gris: Float32Array[] }

/**
 * Partage un trace (x0, y0, x1, y1… en unites de sa tuile) en troncons orange et gris, par pas de `pasUnites`. `juger` dit d'un point
 * s'il a une facade a portee : `true` (orange), `false` (gris), ou `null` quand on ne sait pas (orange : jamais de gris sur une panne).
 * Les troncons voisins de meme couleur se rejoignent en une seule ligne.
 */
export function partagerLeTrace(ligne: Float32Array, juger: (ux: number, uy: number) => boolean | null, pasUnites: number): Partage {
  const out: Partage = { orange: [], gris: [] };
  let courant: number[] = [], gris = false;
  const fermer = () => { if (courant.length >= 4) (gris ? out.gris : out.orange).push(Float32Array.from(courant)); courant = []; };
  if (ligne.length === 2) { (juger(ligne[0] as number, ligne[1] as number) === false ? out.gris : out.orange).push(Float32Array.from(ligne)); return out; }
  for (let i = 2; i < ligne.length; i += 2) {
    const x0 = ligne[i - 2] as number, y0 = ligne[i - 1] as number, x1 = ligne[i] as number, y1 = ligne[i + 1] as number;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / pasUnites));
    for (let k = 0; k < n; k++) {
      const ax = x0 + ((x1 - x0) * k) / n, ay = y0 + ((y1 - y0) * k) / n, bx = x0 + ((x1 - x0) * (k + 1)) / n, by = y0 + ((y1 - y0) * (k + 1)) / n;
      const g = juger((ax + bx) / 2, (ay + by) / 2) === false;
      if (courant.length && g !== gris) fermer();
      if (!courant.length) { courant.push(ax, ay); gris = g; }
      courant.push(bx, by);
    }
  }
  fermer();
  return out;
}

/**
 * Un juge qui ne regarde qu'une fois chaque maille de `maille` unites : dans une tuile de ville, des dizaines de sequences repassent
 * par la meme rue.
 */
export function jugeParMailles(juger: (ux: number, uy: number) => boolean | null, maille: number): (ux: number, uy: number) => boolean | null {
  const vus = new Map<number, boolean | null>();
  return (ux, uy) => {
    const i = Math.floor(ux / maille), j = Math.floor(uy / maille), cle = (i + 4096) * 16384 + (j + 4096);
    let v = vus.get(cle);
    if (v === undefined) { v = juger((i + 0.5) * maille, (j + 0.5) * maille); vus.set(cle, v); }
    return v;
  };
}

export type EtatFacadesCouverture = 'eteinte' | 'loin' | 'lecture' | 'oui' | 'panne';

/** Ce que la legende de la carte dit de la couverture grise ; null quand il n'y a rien a dire (trop loin, eteinte, ou en cours). */
export function legendeDesFacades(etat: EtatFacadesCouverture): string | null {
  if (etat === 'oui') return 'rues photographiées sans façade à portée';
  if (etat === 'panne') return 'bâtiments de l’IGN indisponibles : toute la couverture reste orange, avec ou sans façade';
  return null;
}
