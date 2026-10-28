// Cote de reference de l'outil d'alignement (spec §3.2, interaction/).
//
// Une seule donnee, mais partagee par trois endroits qui ne se connaissent pas : le panneau
// d'attributs l'affiche et active son bouton, le `pointerdown` du plan l'ecrit quand on designe un
// cote, et l'alignement la lit pour calculer la rotation.
//
// Elle vit donc ici plutot que dans une variable de module partagee de fait : trois lecteurs et un
// ecrivain, c'est exactement ce qui merite une frontiere explicite.

import type { PtBrut, ObjetPlan } from '../model/types.js';
import { enPoints } from '../model/formes.js';
import type { CoteCible } from '../geometry/alignement.js';
import { suivreLeContour } from '../model/ouvrages/index.js';
import { estPoseSurLeTerrain } from '../model/fonctions.js';

/** Le refus de deplacer ou de tourner ce qui est pose sur le terrain reel, dit a la personne. */
export const MESSAGE_TERRAIN_REEL = 'Cet objet vient du cadastre ou de l’IGN : il reste à sa place réelle (IGN, LiDAR, photo aérienne, relief, soleil). Il ne se déplace ni ne tourne.';

/** Un cote designe sur le plan : la cle de l'objet et l'indice du cote. */
export interface CoteDesigne {
  objKey: string;
  segIndex: number;
}

let cible: CoteDesigne | null = null;

/** Le cote de reference en cours, ou `null` si l'utilisateur n'en a pas encore designe. */
export function cibleAlignement(): CoteDesigne | null {
  return cible;
}

export function definirCibleAlignement(v: CoteDesigne | null): void {
  cible = v;
}

// La distance au trait que l'outil « Aligner » doit laisser, telle que saisie dans son bandeau (zones/Surimpression.tsx) : le
// brouillon d'un geste, pas une donnee du plan. Vide : l'objet tourne sans se deplacer.
let distanceSaisie = '';

/** La distance saisie pour le prochain alignement, en metres, comme tapee. */
export function distanceAlignement(): string {
  return distanceSaisie;
}

export function definirDistanceAlignement(v: string): void {
  distanceSaisie = v;
}

/** Ce dont l'alignement a besoin du reste du programme. */
export interface ContexteAlignement {
  /** Coordonnees du cote de reference designe. */
  measureSegCoords: (ref: CoteDesigne) => CoteCible | null;
  /** Le contour dans lequel l'objet doit rester, ou `null` s'il est libre. */
  contourDeContrainte: (obj: ObjetPlan) => PtBrut[] | null;
  nearestSegmentIndex: (obj: ObjetPlan, cible: CoteCible) => number;
  alignerSurCote: (pts: PtBrut[], idx: number, cible: CoteCible, distance: number | null) => PtBrut[];
  pointInPolygon: (p: PtBrut, poly: PtBrut[]) => boolean;
  pushHistory: () => void;
  rebuildHandles: (obj: ObjetPlan) => void;
  render: () => void;
  showToast: (message: string) => void;
}

/**
 * Fait tourner un objet pour aligner l'un de ses cotes sur le cote de reference, et le pose
 * eventuellement a une distance donnee de celui-ci.
 *
 * Trois garde-fous, dans cet ordre, et chacun pour une raison differente :
 *
 * 1. **Un objet verrouille ne bouge pas.** Le verrou existe pour ca.
 * 2. **Ce qui vient du cadastre ou de l'IGN ne tourne pas** (`estPoseSurLeTerrain`). Une parcelle porte l'orientation reelle du terrain, et tout ce qui est pose sur
 *    le terrain la lit a sa place : l'actualisation IGN (qui la remettrait), la lecture des toits au LiDAR, la photo aerienne,
 *    le relief, les rues, le PLU, le soleil (le nord reel), le voisinage, l'audit sur place. On refuse, en le disant
 *    (decision du 27 octobre 2026, MD/spec-ouvrages.md).
 * 3. **Le resultat doit rester dans le contour de contrainte.** On calcule d'abord, on verifie
 *    ensuite, et on n'enregistre dans l'historique **qu'apres** : un alignement refuse ne doit pas
 *    laisser un pas d'annulation vide derriere lui.
 *
 * Une distance laissee vide ne fait que tourner, sans deplacer la forme.
 */
// `_etat` n'est lu nulle part dans le corps (verifie a l'occasion du typage, spec §10.3) : un
// parametre mort, garde en position pour ne pas toucher a la signature de l'appelant hors de propos.
export function alignerObjetParRotation(obj: ObjetPlan, _etat: unknown, distanceSaisie: string, ctx: ContexteAlignement): void {
  const ref = cibleAlignement();
  if (!ref) return;
  if (obj.locked) { ctx.showToast('Objet verrouille.'); return; }
  if (estPoseSurLeTerrain(obj)) { ctx.showToast(MESSAGE_TERRAIN_REEL); return; }
  const target = ctx.measureSegCoords(ref);
  if (!target) return;
  const idx = ctx.nearestSegmentIndex(obj, target);
  if (idx < 0) return;
  const distance = distanceSaisie.trim() === '' ? null : parseFloat(distanceSaisie);
  const forme = enPoints(obj);
  const newPts = ctx.alignerSurCote(forme.pts, idx, target, distance);

  const bound = ctx.contourDeContrainte(obj);
  if (bound && !newPts.every(p => ctx.pointInPolygon(p, bound))) {
    ctx.showToast('Le resultat sortirait de la parcelle - alignement annule.');
    return;
  }
  ctx.pushHistory();
  suivreLeContour(obj, forme.pts, newPts);
  forme.pts = newPts;
  ctx.rebuildHandles(obj);
  ctx.render();
}
