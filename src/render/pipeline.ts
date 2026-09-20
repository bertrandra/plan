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
  renderAttrTable: () => void;
  renderDispTable: () => void;
  drawScaleBar: () => void;
  drawNorthArrow: () => void;
  drawMeasures: () => void;
  renderMeasureResults: () => void;
  renderTerrasseLayerView: (obj: ObjetPlan) => void;
  estTerrain: (obj: ObjetRendu) => boolean;
}

export function rendreScene(etat: EtatApp, ctx: ContexteRendu): void {
  placerOrthophoto(ctx);
  ctx.drawGrid();
  ctx.renderParasolOverlay();
  // In Mode Terrasse the plan is a backdrop for the layer overlay, not something being edited:
  // the selection handles and vertex labels would sit on top of the vis and solives and make
  // the canevas unreadable. The choice made in Mode Plan is kept, just not drawn here.
  const activeSel = (etat.appMode==='terrasse') ? null : etat.selectedKey;
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
      ortho: { actif: ortho.actif, parcelleOpacite: ortho.parcelleOpacite },
      estTerrain: ctx.estTerrain,
      pointageSommets: !!(mesure.pointage && mesure.pointage.mode === 'target'),
      pointageCotes: !!(mesure.pointage && mesure.pointage.mode === 'ref'),
      reconstruirePoignees: ctx.rebuildHandles
    });
  });

  // ---- surfaces: computed on demand in the "Objet" tab (see renderAttrTable) ----

  ctx.renderAttrTable();
  ctx.renderDispTable();
  ctx.drawScaleBar();
  ctx.drawNorthArrow();
  ctx.drawMeasures();
  if(etat.panelTab==='mesure') ctx.renderMeasureResults();

  // show the "fit to selection" button only when an object is selected
  const fitBtn = document.getElementById('fitBtn');
  if(fitBtn) fitBtn.style.display = etat.selectedKey ? 'block' : 'none';

  // Mode Terrasse's construction overlay is drawn in screen space (toScreen), same as
  // everything else here: without this, panning/zooming the plan moves the real shapes
  // but leaves the vis/solives/lambourdes/lames overlay stuck at its old screen position.
  if(etat.appMode==='terrasse'){
    const terrasseObj = etat.objects.find(o=>o.key===etat.terrasseSelectedKey);
    if(terrasseObj) ctx.renderTerrasseLayerView(terrasseObj);
  }
}
