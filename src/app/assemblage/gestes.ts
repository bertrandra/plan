// Les gestes qui modifient un objet du plan (app/assemblage/) : editer un cote ou un angle, ajouter
// ou retirer un sommet, reculer un objet, l'aligner, creer, dupliquer, supprimer.
//
// Le calcul vit dans interaction/, model/ et geometry/ ; ces gestes y ajoutent ce que ces modules ne
// connaissent pas : l'historique, les poignees a refaire, le rendu.

import { pointInPolygon } from '../../geometry/basic.js';
import { projectOntoSegment, nearestSegmentIndex } from '../../geometry/segments.js';
import { alignerSurCote } from '../../geometry/alignement.js';
import { editerAngle, editerLongueur, contourDeContrainte } from '../../interaction/editing.js';
import { alignerObjetParRotation } from '../../interaction/outilAlignement.js';
import { insererSommet, supprimerSommet, minimumSommets } from '../../model/sommets.js';
import { creerCreation } from '../../model/creation.js';
import { enPoints } from '../../model/formes.js';
import { reculerObjet } from '../../render/empilement.js';
import { detruireVue } from '../../render/vues.js';
import { serializeObjects } from '../../io/serialisation.js';
import { distanceAlignementSaisie } from '../../ui/champs/objet.js';
import { showConfirm, showToast } from '../../shell/dialogs.js';
import { aPoints, normaliserEnObjetsDuPlan } from './formes.js';
import type { Mesures } from './mesures.js';
import type { EtatApp } from '../../core/state.js';
import type { ObjetPlan, PtBrut } from '../../model/types.js';

export interface DependancesGestes {
  pushHistory: () => void;
  render: () => void;
  rebuildSelector: () => void;
  rebuildHandles: (obj: ObjetPlan) => void;
  createObjectDOM: (obj: ObjetPlan) => void;
  reapplyStackingOrder: () => void;
  mesures: Mesures;
}

export function creerGestes(etat: EtatApp, d: DependancesGestes) {
  const contour = (obj: ObjetPlan) => contourDeContrainte(etat.objects, aPoints(obj));
  // La naissance et la mort d'un objet vivent dans model/creation.ts.
  const creation = () => creerCreation(etat, {
    pushHistory: d.pushHistory, createObjectDOM: d.createObjectDOM, rebuildHandles: d.rebuildHandles,
    reapplyStackingOrder: d.reapplyStackingOrder, rebuildSelector: d.rebuildSelector, render: d.render,
    detruireVue, serializeObjects, showToast, showConfirm, normalizeObjects: normaliserEnObjetsDuPlan
  });
  return {
    applyAngleEdit: (obj: ObjetPlan, i: number, angle: number) => editerAngle(aPoints(obj), i, angle, contour(obj)),
    applyLengthEdit: (obj: ObjetPlan, i: number, longueur: number) => editerLongueur(aPoints(obj), i, longueur, contour(obj)),
    insertPointOnSegment(obj: ObjetPlan, segIndex: number, clic: PtBrut) {
      // Un point de vue a exactement 2 points (position, direction) : un 3e casserait sa lecture.
      if (obj.locked || obj.fonction === 'camera') return;
      const pts = enPoints(obj).pts;
      const nouveau = projectOntoSegment(clic, pts[segIndex]!, pts[(segIndex + 1) % pts.length]!);
      const borne = contour(obj);
      if (borne && !pointInPolygon(nouveau, borne)) return;
      d.pushHistory();
      insererSommet(aPoints(obj), segIndex, clic);
      d.rebuildHandles(obj);
      d.render();
    },
    deleteVertex(obj: ObjetPlan, idx: number) {
      // Une forme garde toujours assez de sommets pour rester valide.
      if (obj.locked || enPoints(obj).pts.length <= minimumSommets(obj.type)) return;
      d.pushHistory();
      supprimerSommet(aPoints(obj), idx);
      d.rebuildHandles(obj);
      d.render();
    },
    // La selection est conservee : le recul reste visible et le geste se repete sans re-selectionner.
    sendObjectBackward(obj: ObjetPlan) {
      if (!reculerObjet(obj, etat.objects)) return;
      d.reapplyStackingOrder();
      d.rebuildSelector();
      d.render();
    },
    alignObjectByRotation(obj: ObjetPlan) {
      alignerObjetParRotation(obj, etat, distanceAlignementSaisie(), {
        measureSegCoords: d.mesures.measureSegCoords, alignerSurCote, pointInPolygon,
        nearestSegmentIndex: (o, cible) => nearestSegmentIndex(aPoints(o), cible),
        contourDeContrainte: contour,
        pushHistory: d.pushHistory, rebuildHandles: d.rebuildHandles, render: d.render, showToast
      });
    },
    addNewObject: (enRectangle: boolean) => creation().ajouterObjet(enRectangle),
    addNewPath: () => creation().ajouterChemin(),
    addNewCircle: () => creation().ajouterCercle(),
    addNewParasol: () => creation().ajouterParasol(),
    addNewViewpoint: () => creation().ajouterPointDeVue(),
    duplicateSelectedObject: () => creation().dupliquer(),
    deleteSelectedObject: () => creation().supprimer()
  };
}

export type Gestes = ReturnType<typeof creerGestes>;

/**
 * Le nom d'un objet pour l'inspecteur : un point de vue est techniquement un chemin a 2 points, mais
 * personne ne le pense comme « un chemin ». La fonction prime sur le type quand elle parle mieux.
 */
export function libelleTypeObjet(obj: ObjetPlan): string {
  if (obj.fonction === 'camera') return 'Point de vue';
  if (obj.fonction === 'parasol') return 'Parasol';
  return obj.type === 'polygon' ? 'Polygone' : (obj.type === 'path' ? 'Chemin' : 'Cercle');
}

/**
 * Un quadrilatere deja d'equerre, meme tourne, est deja un rectangle : le redresser sur les axes
 * n'aurait aucun sens et le ferait souvent sortir de la parcelle.
 */
export function dejaRectangle(pts: PtBrut[] | undefined, tolDeg?: number): boolean {
  if (!pts || pts.length !== 4) return false;
  const tol = tolDeg || 1;
  return pts.every((_, i) => {
    const a = pts[(i - 1 + 4) % 4]!, b = pts[i]!, c = pts[(i + 1) % 4]!;
    const u = { x: a.x - b.x, y: a.y - b.y }, v = { x: c.x - b.x, y: c.y - b.y };
    const n = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
    if (n < 1e-9) return false;
    const ang = Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / n))) * 180 / Math.PI;
    return Math.abs(ang - 90) <= tol;
  });
}
