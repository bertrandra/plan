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
 * 2. **Une parcelle issue du cadastre porte l'orientation reelle du terrain.** La faire tourner
 *    decale le nord du plan — donc l'ombre des parasols et la Vue 3D — sans que rien ne le signale.
 *    On previent, mais on laisse faire : c'est peut-etre exactement ce qu'on veut.
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
  if (obj.cadastre) ctx.showToast('Attention : cette parcelle vient du cadastre. La faire tourner desaligne le plan du nord reel (ombres, Vue 3D).');
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
  forme.pts = newPts;
  ctx.rebuildHandles(obj);
  ctx.render();
}
