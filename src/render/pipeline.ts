// Orchestration du dessin du plan (spec §3.2, render/).
//
// `rendreScene` ne dessine rien elle-meme : elle appelle, dans l'ordre, ce qui compose une image du
// plan. L'ordre est le seul contenu de cette fonction, et il compte - le fond orthophoto d'abord,
// la grille ensuite, puis les objets, et enfin ce qui se pose par-dessus (cotes, echelle, nord).
//
// Ce qu'elle sait et que `render/objects.ts` ne peut pas savoir : quel objet est selectionne, ce
// qui est masque, l'etat du fond, et le pointage en cours de l'outil de cotation.
//
// En mode Terrasse, le plan devient un decor : les poignees de selection et les etiquettes de
// sommets se poseraient par-dessus les vis et les solives et rendraient le canevas illisible. Le
// choix fait en mode Plan est garde, simplement pas dessine.

import { positionnerObjet, type ObjetRendu } from './objects.js';
import { ortho, placerOrthophoto, type ContexteOrtho } from './ortho.js';
import { mesure } from '../interaction/outilMesure.js';
import type { EtatApp } from '../core/state.js';
import type { ObjetPlan } from '../model/types.js';

/**
 * Ce que `rendreScene` demande à l'application, en plus de l'état — tout ce qui vit encore dans la
 * fermeture de `boot()` (spec §4, phase 3) et que ce module ne peut pas deviner : la sélection, le
 * masquage, la reconstruction des poignées.
 *
 * Étend `ContexteOrtho` : `rendreScene` place le fond avant de dessiner le reste, donc son contexte
 * doit porter tout ce que `placerOrthophoto` lit.
 */
export interface ContexteRendu extends ContexteOrtho {
  drawGrid: () => void;
  renderParasolOverlay: () => void;
  amenerPoigneesDevant: (obj: ObjetPlan) => void;
  objetMasque: (obj: ObjetPlan) => boolean;
  rebuildHandles: (obj: ObjetRendu) => void;
  drawScaleBar: () => void;
  drawNorthArrow: () => void;
  drawMeasures: () => void;
  renderTerrasseLayerView: (obj: ObjetPlan | null | undefined) => void;
  estTerrain: (obj: ObjetRendu) => boolean;
  /** Les ouvertures relevees sur les facades (render/releve.ts). */
  renderReleves?: () => void;
}

export function rendreScene(etat: EtatApp, ctx: ContexteRendu): void {
  placerOrthophoto(ctx);
  ctx.drawGrid();
  ctx.renderParasolOverlay();
  const activeSel = etat.selectedKey;
  if(activeSel && activeSel !== 'parcelle'){
    const sel = etat.objects.find(o=>o.key===activeSel);
    if(sel) ctx.amenerPoigneesDevant(sel);
  }

  // Le positionnement d'un objet vit dans render/objects.ts. Ce qui reste ici est ce que lui
  // seul ne peut pas savoir : la selection courante, le masquage, l'etat du fond orthophoto et
  // le pointage en cours pour l'outil de mesure.
  //
  // Le cast dit ce que le type de `ObjetPlan` ne dit pas encore : un objet du plan vivant porte
  // toujours forme et couleurs, poses par `creation.ts` ou `normalisation.ts` a son entree dans
  // `etat.objects` (voir la note d'`ObjetRendu` dans render/objects.ts).
  etat.objects.forEach(obj=>{
    positionnerObjet(obj as ObjetRendu, {
      scene: etat.scene,
      selectionnee: obj.key === activeSel,
      masque: ctx.objetMasque(obj),
      transparent: obj.key === etat.isolement,
      ortho: { actif: ortho.actif, parcelleOpacite: ortho.parcelleOpacite },
      estTerrain: ctx.estTerrain,
      pointageSommets: !!(mesure.pointage && mesure.pointage.mode === 'target'),
      pointageCotes: !!(mesure.pointage && mesure.pointage.mode === 'ref'),
      reconstruirePoignees: ctx.rebuildHandles
    });
  });

  ctx.renderReleves?.();
  ctx.drawScaleBar();
  ctx.drawNorthArrow();
  ctx.drawMeasures();

  // Les couches de la terrasse courante (vis, solives, lames…) sont dessinees en coordonnees
  // d'ecran comme tout le reste : sans cela, deplacer ou zoomer le plan laisserait le calque a son
  // ancienne place. Elles ne s'affichent que si l'explorateur les a demandees et tant que la
  // terrasse est selectionnee ; sinon le calque est vide — c'est ce que fait un appel sans objet.
  // Une terrasse isolee montre toujours ses couches : c'est ce que la transparence laisse voir.
  const calques = (etat.calquesVisibles || (etat.isolement !== null && etat.isolement === etat.terrasseSelectedKey)) && etat.selectedKey === etat.terrasseSelectedKey;
  ctx.renderTerrasseLayerView(calques ? etat.objects.find(o=>o.key===etat.terrasseSelectedKey) : null);
}
