// Les fenetres d'un batiment du projet en 3D (MD/spec-toit-ign.md §6.3) : une dimension pour
// toutes (disposition automatique), ou une liste reglee une par une. Ce module lit et ecrit
// `fenetres3d` sur le batiment ; la disposition automatique est dans facade/ouvertures.ts.

import type { Fenetre3d, Fenetres3d, ObjetPlan } from './types.js';
import { REGLAGES_FACADES as R, valeursFacadesDe, type ValeursFacades } from './reglagesFacades.js';

/**
 * Les ouvertures dessinees par defaut : une fenetre par entraxe, une porte au milieu du plus long mur.
 * Les valeurs sont celles du profil par defaut de regles/facades/reglages.json.
 */
export const FENETRE: { l: number; h: number; appui: number } = { l: R.FENETRE_LARGEUR_M, h: R.FENETRE_HAUTEUR_M, appui: R.FENETRE_APPUI_M };
export const PORTE: { l: number; h: number } = { l: R.PORTE_LARGEUR_M, h: R.PORTE_HAUTEUR_M };
export const ENTRAXE_FENETRES_M = R.ENTRAXE_FENETRES_M;

/** Les dimensions communes que donne un profil de facades. */
export function fenetres3dDuProfil(v: ValeursFacades): Fenetres3d {
  return { mode: 'toutes', largeur: v.FENETRE_LARGEUR_M, hauteur: v.FENETRE_HAUTEUR_M, appui: v.FENETRE_APPUI_M, entraxe: v.ENTRAXE_FENETRES_M };
}

export const FENETRES_3D_DEFAUT: Fenetres3d = fenetres3dDuProfil(R);

/**
 * Les fenetres du batiment, completees des dimensions de son profil de facades (le profil par defaut
 * tant qu'aucun n'est retenu). Un reglage ecrit sur le batiment l'emporte sur le profil.
 */
export function fenetres3dDe(o: ObjetPlan): Fenetres3d {
  return { ...fenetres3dDuProfil(valeursFacadesDe(o)), ...(o.fenetres3d ?? {}) };
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
