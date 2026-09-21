// Le resume texte du plan (spec §3.2, export/).
//
// C'est le plus modeste des six exports, et le seul qu'on lise vraiment : un artisan a qui l'on
// envoie ce texte doit pouvoir replacer le plan sur le terrain sans ouvrir le fichier. D'ou l'en-tete
// qui dit ou est l'origine et vers ou pointent les axes — sans lui, une liste de coordonnees ne veut
// rien dire.
//
// Trois sections, dans cet ordre : le recapitulatif des surfaces, le detail objet par objet, puis les
// cotes s'il y en a. Les nombres sont ceux du plan, arrondis pour la lecture : deux decimales pour
// les surfaces et les longueurs, trois pour les coordonnees — un millimetre, ce qui est la precision
// au-dela de laquelle un releve de terrain ne veut plus rien dire.

import { dist, shoelace } from '../geometry/basic.js';
import { interiorAngleDeg } from '../geometry/angles.js';
import type { ObjetPlan, Mesure, PtBrut } from '../model/types.js';
import { sommetsDe } from '../model/formes.js';

/**
 * Ce que `surfaceDe` lit, et rien de plus : les tests l'appellent sur des objets partiels. Forme
 * structurelle plutot qu'un `Pick` sur l'union : chaque membre d'`ObjetPlan` y reste assignable
 * alors qu'un `Pick` exige que chaque cle existe sur chacun d'eux.
 */
export type ObjetASurface = { type?: string; pts?: readonly PtBrut[]; r?: number; width?: number };

/** Ce que le resume doit pouvoir demander au reste du programme. */
export interface ContexteResume {
  /** Version de l'application, portee par l'en-tete. */
  appVersion: string;
  /** Geometrie d'une cote : `null` quand ses objets de reference n'existent plus. */
  computeMeasureGeom: (m: Mesure) => { perp: number; along: number } | null;
  /** Libelle du cote de reference d'une cote. */
  refLabel: (ref: { objKey: string; segIndex: number }) => string;
  /** Libelle du point vise par une cote. */
  targetLabel: (t: { objKey: string; ptIndex: number }) => string;
  /** La date du jour, en toutes lettres. Injectable pour qu'un test ne depende pas du calendrier. */
  dateDuJour?: () => string;
}

/**
 * Surface d'un objet, en metres carres.
 *
 * Un chemin n'a pas de surface au sens strict : on retient longueur × largeur, ce que le texte dit
 * explicitement en face du nombre. C'est l'emprise au sol, la seule grandeur comparable aux autres.
 */
export function surfaceDe(obj: ObjetASurface): number {
  if (obj.type === 'polygon') return shoelace(obj.pts!);
  if (obj.type === 'circle') return Math.PI * obj.r! * obj.r!;
  let L = 0;
  const pts = obj.pts || [];
  for (let i = 0; i < pts.length - 1; i++) L += dist(pts[i]!, pts[i + 1]!);
  return L * (obj.width || 1);
}

export function construireResume(objets: ObjetPlan[], mesures: Mesure[], ctx: ContexteResume): string {
  const dateDuJour = ctx.dateDuJour || (() => new Date().toLocaleDateString('fr-FR'));
  let out = 'Plan interactif ' + ctx.appVersion + ' - export (repere local, metres) - ' + dateDuJour() + '\n';
  out += 'Origine (0,0) = Apex, le sommet Coin Nord de la parcelle (le point le plus au nord).\n';
  out += 'Axe X+ = Est ; Axe Y+ = Nord (correspond au "haut" de l\'affichage a l\'ecran).\n';
  out += 'Pour reimporter/recaler ce plan ailleurs, aligner Apex sur Coin Nord et orienter Y+ vers le nord.\n\n';

  // La parcelle est exclue du total : c'est le denominateur, pas un objet pose dessus. Le
  // pourcentage qui suit n'aurait sinon aucun sens.
  const parcelle = objets.find((o: ObjetPlan) => o.key === 'parcelle');
  const sParcelle = parcelle ? shoelace(sommetsDe(parcelle)) : 0;
  let total = 0;
  objets.forEach((obj: ObjetPlan) => {
    const s = surfaceDe(obj);
    if (obj.key !== 'parcelle') total += s;
    out += obj.name + ' (' + obj.key + '): ' + s.toFixed(2) + ' m2' + (obj.type === 'path' ? ' (longueur x largeur)' : '') + '\n';
  });
  out += 'Emprise totale (hors parcelle): ' + total.toFixed(1) + ' m2' + (sParcelle > 0 ? (' (' + (total / sParcelle * 100).toFixed(1) + ' %)') : '') + '\n\n';

  objets.forEach((obj: ObjetPlan) => {
    out += '--- ' + obj.name + ' (' + obj.key + ') ---\n';
    if (obj.type === 'circle') {
      out += '  Centre: X=' + obj.center.x.toFixed(3) + ' Y=' + obj.center.y.toFixed(3) + '  Rayon=' + obj.r.toFixed(2) + ' m\n\n';
    } else if (obj.type === 'path') {
      const ptsC = obj.pts || [], vnC = obj.vertexNames || [], snC = obj.segmentNames || [];
      out += '  Largeur: ' + (obj.width || 1).toFixed(2) + ' m' + (obj.curve ? ' (courbe)' : ' (droit)') + '\n';
      ptsC.forEach((p, i) => {
        out += '  ' + vnC[i] + ': X=' + p.x.toFixed(3) + ' Y=' + p.y.toFixed(3) + '\n';
      });
      // Un chemin est ouvert : ses segments s'arretent au dernier point, sans refermer.
      let totalLen = 0;
      for (let i = 0; i < ptsC.length - 1; i++) {
        const L = dist(ptsC[i]!, ptsC[i + 1]!); totalLen += L;
        out += '  ' + (snC[i] || ('Cote ' + (i + 1))) + ' (' + vnC[i] + ' -> ' + vnC[i + 1] + '): ' + L.toFixed(2) + ' m\n';
      }
      out += '  Longueur totale: ' + totalLen.toFixed(2) + ' m\n\n';
    } else {
      // Un polygone est ferme : le dernier segment revient au premier point, d'ou le modulo.
      const ptsP = obj.pts || [], vnP = obj.vertexNames || [], snP = obj.segmentNames || [];
      const n = ptsP.length;
      ptsP.forEach((p, i) => {
        out += '  ' + vnP[i] + ': X=' + p.x.toFixed(3) + ' Y=' + p.y.toFixed(3) + '  Angle=' + interiorAngleDeg(obj, i).toFixed(1) + ' deg\n';
      });
      for (let i = 0; i < n; i++) {
        out += '  ' + snP[i] + ' (' + vnP[i] + ' -> ' + vnP[(i + 1) % n] + '): ' + dist(ptsP[i]!, ptsP[(i + 1) % n]!).toFixed(2) + ' m\n';
      }
      out += '\n';
    }
  });

  if (mesures.length) {
    out += '=== Mesures ===\n';
    mesures.forEach((m: Mesure) => {
      const g = ctx.computeMeasureGeom(m);
      out += '  ' + ctx.refLabel({ objKey: m.refObjKey, segIndex: m.refSegIndex }) + ' -> ' + ctx.targetLabel({ objKey: m.targetObjKey, ptIndex: m.targetPtIndex })
           + '  origine=' + m.startEnd
           + (g ? ('  perpendiculaire=' + g.perp.toFixed(2) + ' m  le_long=' + g.along.toFixed(2) + ' m') : '  (non calculable)')
           + '  affichage_sur_plan=' + (m.displayMode === 'along' ? 'le_long' : 'perpendiculaire')
           + '  affiche=' + (m.show ? 'oui' : 'non') + '\n';
    });
    out += '\n';
  }
  return out;
}
