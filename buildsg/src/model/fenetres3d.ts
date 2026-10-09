// Les fenetres d'un batiment du projet en 3D (MD/spec-toit-ign.md §6.3) : une dimension pour
// toutes (disposition automatique), ou une liste reglee une par une. Ce module lit et ecrit
// `fenetres3d` sur le batiment ; la disposition automatique est dans facade/ouvertures.ts.

import type { Fenetre3d, Fenetres3d, ObjetPlan } from './types.js';

/** Les ouvertures dessinees par defaut : une fenetre par entraxe, une porte au milieu du plus long mur. */
export const FENETRE: { l: number; h: number; appui: number } = { l: 1.0, h: 1.2, appui: 0.9 };
export const PORTE: { l: number; h: number } = { l: 0.9, h: 2.1 };
export const ENTRAXE_FENETRES_M = 2.4;

export const FENETRES_3D_DEFAUT: Fenetres3d = { mode: 'toutes', largeur: FENETRE.l, hauteur: FENETRE.h, appui: FENETRE.appui, entraxe: ENTRAXE_FENETRES_M };

/** Les fenetres du batiment, completees des defauts (les defauts seuls sans reglage). */
export function fenetres3dDe(o: ObjetPlan): Fenetres3d {
  return { ...FENETRES_3D_DEFAUT, ...(o.fenetres3d ?? {}) };
}

/** Ecrit un reglage sur le batiment : la structure complete y est posee a la premiere ecriture. */
export function reglerFenetres3d(o: ObjetPlan, f: (r: Fenetres3d) => void): void {
  const r = fenetres3dDe(o);
  f(r);
  o.fenetres3d = r;
}

/** Une fenetre neuve sur un cote, posee a `x`, des dimensions communes. */
export function nouvelleFenetre(r: Fenetres3d, cote: number, x: number): Fenetre3d {
  return { cote, type: 'fenetre', x, y: r.appui, l: r.largeur, h: r.hauteur };
}
