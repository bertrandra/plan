// Les cotes d'un contour vus de dehors : les facades d'un batiment, les cotes d'une parcelle et de sa cloture
// (MD/spec-releve-facade.md §3).
//
// De la geometrie, partagee par deux ouvrages : le bati (releve, facades, toits) et la cloture (ses cotes, ses portails, le
// plan et la 3D). Elle vivait dans facade/geometrie.ts, et la cloture la lisait chez le bati (MD/spec-ouvrages.md, etape 6.6).
//
// Un batiment du plan est un polygone extrude a sa hauteur : chaque cote est un mur, donc une
// facade. Ce module dit, pour chacune, ou est sa gauche vue de dehors, vers ou elle regarde et
// comment l'appeler. Tout le releve s'exprime ensuite dans le repere de la facade : x en metres
// depuis son bord gauche vu de l'exterieur, y en metres depuis le sol.
//
// "Gauche vue de dehors" ne se devine pas sur le sens de saisie : un contour trace dans le sens
// horaire met l'exterieur a gauche du cote, un contour trigonometrique a droite. C'est l'aire
// signee qui tranche, comme pour les cotes du PDF (geometry/basic.ts).

import { au } from '../util/tableaux.js';
import { sommetDe } from './anneau.js';
import type { PtBrut } from '../model/types.js';
import { signedArea } from './basic.js';

/** Une facade : un cote du contour, vu depuis l'exterieur. */
export interface Facade {
  /** Indice du cote dans le contour : de `pts[cote]` a `pts[cote + 1]`. */
  cote: number;
  /** Extremite gauche, vue de dehors face au mur. */
  gauche: PtBrut;
  /** Extremite droite, vue de dehors face au mur. */
  droite: PtBrut;
  /** Longueur du mur, en metres. */
  largeur: number;
  /** Hauteur du mur a l'egout, en metres. */
  hauteur: number;
  /** Normale sortante unitaire, dans le repere du plan (Y vers le nord). */
  normale: PtBrut;
  /** Direction vers laquelle regarde la facade : 0 = nord, 90 = est, sens horaire, en degres. */
  azimut: number;
  /** Nom court du point cardinal : « Sud », « Nord-Est »… */
  orientation: string;
}

const HUIT_VENTS = ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest'];

/** Une facade nommee dans une liste : son point cardinal et le numero de son cote dans le contour (le meme que celui du tiroir), « sud (côté 3) ». */
export const nomFacade = (orientation: string, cote: number): string => orientation.toLowerCase() + ' (côté ' + (cote + 1) + ')';

/** Le point cardinal le plus proche d'un azimut, parmi huit. */
export function nomOrientation(azimut: number): string {
  const a = ((azimut % 360) + 360) % 360;
  return au(HUIT_VENTS, Math.round(a / 45) % 8);
}

/**
 * Les facades d'un contour ferme, une par cote.
 *
 * Un cote de moins de 10 cm n'est pas un mur mais un reliquat de saisie ou d'import : il est
 * ecarte, sans renumeroter les autres - `cote` reste l'indice du cote dans le contour, c'est lui
 * qui rattache un releve a son mur.
 */
export function facadesDuContour(pts: readonly PtBrut[], hauteur: number): Facade[] {
  const n = pts.length;
  if (n < 3) return [];
  const trigo = signedArea(pts) > 0;
  const res: Facade[] = [];
  for (let i = 0; i < n; i++) {
    const a = au(pts, i),
      b = sommetDe(pts, i + 1);
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const largeur = Math.hypot(dx, dy);
    if (largeur < 0.1) continue;
    // Contour trigonometrique : l'exterieur est a droite du parcours, la normale est le cote
    // tourne d'un quart de tour horaire ; et vu de dehors, le parcours va de gauche a droite.
    const normale = trigo ? { x: dy / largeur, y: -dx / largeur } : { x: -dy / largeur, y: dx / largeur };
    const azimut = ((Math.atan2(normale.x, normale.y) * 180) / Math.PI + 360) % 360;
    res.push({
      cote: i,
      gauche: trigo ? { ...a } : { ...b },
      droite: trigo ? { ...b } : { ...a },
      largeur,
      hauteur,
      normale,
      azimut,
      orientation: nomOrientation(azimut),
    });
  }
  return res;
}

/**
 * La facade d'un mur donne par ses deux bouts vus de dehors, de gauche a droite (un mur de corps, MD/spec-facade-calage-audit.md §5 ter) :
 * la normale sortante est le mur tourne d'un quart de tour horaire, comme dans facadesDuContour. Null pour un mur de moins de 10 cm.
 */
export function facadeDuMur(gauche: PtBrut, droite: PtBrut, hauteur: number, cote = 0): Facade | null {
  const dx = droite.x - gauche.x, dy = droite.y - gauche.y, largeur = Math.hypot(dx, dy);
  if (largeur < 0.1) return null;
  const normale = { x: dy / largeur, y: -dx / largeur };
  const azimut = ((Math.atan2(normale.x, normale.y) * 180) / Math.PI + 360) % 360;
  return { cote, gauche: { ...gauche }, droite: { ...droite }, largeur, hauteur, normale, azimut, orientation: nomOrientation(azimut) };
}

/**
 * Un point du mur, donne dans le repere de la facade (x depuis la gauche, y depuis le sol), porte
 * dans le plan : le pied du point au sol, et sa hauteur.
 */
export function pointDeFacade(f: Facade, x: number): PtBrut {
  const t = f.largeur > 0 ? x / f.largeur : 0;
  return { x: f.gauche.x + (f.droite.x - f.gauche.x) * t, y: f.gauche.y + (f.droite.y - f.gauche.y) * t };
}

/** Le point du plan d'ou l'on regarde le milieu de la facade, a `distance` metres devant elle. */
export function stationDevant(f: Facade, distance: number): PtBrut {
  const m = pointDeFacade(f, f.largeur / 2);
  return { x: m.x + f.normale.x * distance, y: m.y + f.normale.y * distance };
}

/**
 * La facade que regarde quelqu'un dont le telephone pointe vers `cap` (boussole, 0 = nord) : celle
 * dont la normale lui fait face, a `tolerance` degres pres. Null quand aucune ne lui fait face.
 */
export function facadeFaceAuCap(facades: readonly Facade[], cap: number, tolerance = 50): Facade | null {
  const regardee = (cap + 180) % 360;
  let meilleure: Facade | null = null, ecartMin = tolerance;
  for (const f of facades) {
    let d = Math.abs(f.azimut - regardee) % 360;
    if (d > 180) d = 360 - d;
    if (d <= ecartMin) { ecartMin = d; meilleure = f; }
  }
  return meilleure;
}

/** Combien un mur (de `a` a `b`, normale `n` vers dehors) se tourne vers un point de vue : 1 de face, 0 de profil, negatif de dos. */
export function tourneVers(a: PtBrut, b: PtBrut, n: PtBrut, oeil: PtBrut): number {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = oeil.x - mx, dy = oeil.y - my;
  return (n.x * dx + n.y * dy) / (Math.hypot(dx, dy) || 1);
}
