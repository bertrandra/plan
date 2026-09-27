// Evenements de pointeur sur le plan (spec §3.2, interaction/).
//
// Tout ce qui se declenche au doigt ou a la souris passe par ici : selection, glisser-deposer,
// double-clic, molette, pincement a deux doigts, deplacement a trois. Le CALCUL de chacun de ces
// gestes vit ailleurs - `interaction/drag.ts` pour le glisser, `interaction/navigation.ts` pour la
// vue - et ce module ne fait que decider lequel s'applique.
//
// Deux details qui expliquent la forme du code, et qui viennent du terrain :
//
// - **Un double-tap au doigt n'est pas un double-clic a la souris.** Le doigt couvre plusieurs
//   dizaines de pixels, il se leve et se repose plus lentement, et il saute d'un tap a l'autre.
//   D'ou une fenetre plus large au toucher (600 ms contre 400) et un test de proximite : deux taps
//   eloignes sur la meme forme sont deux intentions, pas un double-tap.
// - **Le second tap d'un double-tap atterrit rarement au meme endroit que le premier.** Il tombe
//   souvent sur une arete ou une poignee plutot que sur le corps de la forme, si bien que le
//   double-tap objet ne se declenchait jamais au doigt. On l'accepte donc quel que soit l'element
//   touche, a condition que le tap precedent ait vise le meme objet, au meme endroit.

import { appliquerGlisser, type GlisserEnCours } from './drag.js';
import type { DebutPincement } from './navigation.js';
import { contourDeContrainte } from './editing.js';
import { zoomMolette, debutPincement, pincer, deplacer, milieuDe } from './navigation.js';
import { estRectangle } from '../geometry/rect.js';
import { mesure } from './outilMesure.js';
import { definirCibleAlignement } from './outilAlignement.js';
import type { EtatApp } from '../core/state.js';
import type { ObjetPlan, PtBrut, PtEcran } from '../model/types.js';
import { aDesSommets } from '../model/formes.js';
import { sommetDe } from '../geometry/anneau.js';

/**
 * Le geste en cours vu par ce module : celui de `drag.ts`, plus le deplacement de la vue (pan a un
 * doigt), qui n'a ni objet ni position monde — il ecrit dans la scene, pas dans le plan.
 *
 * `GlisserEnCours` admet `'pan'` dans son propre champ `type` (une imprecision restee de son
 * ecriture initiale), ce qui rendrait le discriminant ambigu ici : sans l'intersection ci-dessous,
 * `activeDrag.type === 'pan'` ne suffirait pas a exclure la branche `GlisserEnCours` du narrowing,
 * et `startOrigin`/`startScreen` resteraient inaccessibles apres le test.
 */
type Geste =
  | (GlisserEnCours & { type: 'shapeMove' | 'circleMove' | 'point' | 'edge' | 'radius' })
  | { type: 'pan'; startScreen: PtEcran; startOrigin: PtBrut };

/** Le dernier clic sur un cote, un sommet, ou un objet — pour reconnaitre un double-tap. */
interface DernierClic { key: string | null; index: number | null; time: number }
interface DernierClicObjet { key: string | null; time: number; x: number; y: number }

/** Ce que le cablage des evenements de pointeur demande au reste de l'application. */
/**
 * Un objet a coins : ce que `drag.ts` et `estRectangle` demandent (`pts` garanti), quand `ObjetPlan`
 * le laisse facultatif. Chaque branche ci-dessous ne l'utilise qu'apres avoir teste `obj.type`, donc
 * la garantie est reelle a cet endroit — seul le type ne le sait pas encore.
 */
type ObjetAPoints = ObjetPlan & { pts: PtBrut[] };

export interface ContextePointeur {
  toWorld: (p: PtEcran) => PtBrut;
  render: () => void;
  rebuildSelector: () => void;
  pushHistory: () => void;
  sendObjectBackward: (obj: ObjetPlan) => void;
  insertPointOnSegment: (obj: ObjetPlan, segIndex: number, clickWorld: PtBrut) => void;
}

/**
 * La cle de l'objet et l'indice du sommet ou du cote qu'un element du plan porte dans son dataset
 * (render/objects.ts les pose sur chaque poignee et chaque cote) ; `null` s'il en manque un.
 */
function repere(ds: DOMStringMap): { key: string; index: number } | null {
  const index = parseInt(ds.index ?? '', 10);
  return ds.key && Number.isInteger(index) ? { key: ds.key, index } : null;
}

/**
 * Un clic pendant le pointage de l'outil de cotation ou d'alignement : il designe le cote de
 * reference ou un point cible. Un clic ailleurs (le fond) est avale par l'appelant, sans tomber dans
 * l'edition ou le deplacement de la vue.
 */
function pointerPourLaMesure(ds: DOMStringMap, etat: EtatApp, ctx: ContextePointeur): void {
  const pointage = mesure.pointage;
  if(!pointage) return;
  const r = repere(ds);
  if(pointage.mode==='ref' && ds.role==='edge' && r){
    const picked = {objKey:r.key, segIndex:r.index};
    if(pointage.purpose==='align'){
      definirCibleAlignement(picked);
      mesure.pointage = null;
      ctx.render();
    } else {
      mesure.ref = picked;
      mesure.pointage = null;
      ctx.render();
    }
    return;
  }
  if(pointage.mode==='target'){
    let t = null;
    if(ds.role==='point' && r){
      t = {objKey:r.key, ptIndex:r.index};
    } else if(ds.role==='obj'){
      const tobj = etat.objects.find(o=>o.key===ds.key);
      if(tobj && tobj.type==='circle') t = {objKey:tobj.key, ptIndex:0};
    }
    if(t){
      if(pointage.multi){
        const i = mesure.cibles.findIndex(x=>x.objKey===t.objKey && x.ptIndex===t.ptIndex);
        if(i>=0) mesure.cibles.splice(i,1); else mesure.cibles.push(t);
        ctx.render();
      } else {
        mesure.cibles = [t];
        mesure.pointage = null;
        ctx.render();
      }
      return;
    }
  }
}

/**
 * Branche tous les evenements de pointeur sur le plan.
 *
 * svg recoit les gestes qui visent un objet, stage ceux qui visent la vue (multi-touch) : c'est
 * la meme distinction que dans le DOM, et elle evite qu'un pincement soit pris pour un glisser.
 */
export function brancherPointeur(svg: SVGElement, stage: HTMLElement, etat: EtatApp, ctx: ContextePointeur): void {
let activeDrag: Geste | null = null;
let lastEdgeClick: DernierClic = {key:null, index:null, time:0};
let lastPointClick: DernierClic = {key:null, index:null, time:0};
let lastObjClick: DernierClicObjet = {key:null, time:0, x:0, y:0};
function worldFromEvent(e: PointerEvent): PtBrut {
  const rect = stage.getBoundingClientRect();
  return ctx.toWorld({x:e.clientX-rect.left, y:e.clientY-rect.top});
}
function objByKey(key: string | null | undefined): ObjetPlan | undefined { return etat.objects.find(o=>o.key===key); }

svg.addEventListener('pointerdown', e=>{
  const ds = (e.target as HTMLElement).dataset;

  // ---- Outil de cotation / d'alignement : tant qu'on designe un cote ou un point, le clic lui revient
  if(mesure.pointage){ pointerPourLaMesure(ds, etat, ctx); e.preventDefault(); return; }

  if(!ds || !ds.role){
    // click/drag on empty background (grid, or blank stage area): pan the view
    const rect = stage.getBoundingClientRect();
    activeDrag = {type:'pan', startScreen:{x:e.clientX-rect.left, y:e.clientY-rect.top}, startOrigin:{...etat.scene.origine}};
    e.preventDefault();
    return;
  }
  const w = worldFromEvent(e);

  // Sur tactile, le doigt couvre plusieurs dizaines de pixels et les zones de capture des aretes
  // font 16 px de large : le second tap d'un double-tap atterrit tres souvent sur une arete ou
  // une poignee de la meme forme, jamais sur son interieur. Le double-tap objet ne se
  // declenchait donc pas du tout au doigt. On l'accepte ici quel que soit l'element touche, a
  // condition que le tap precedent ait vise le corps du MEME objet et au meme endroit - c'est ce
  // test de proximite qui evite de confondre avec un double-tap d'arete (insertion de point).
  if(e.pointerType === 'touch' && ds.key && ds.key === lastObjClick.key &&
     (Date.now() - lastObjClick.time) < 600 &&
     Math.hypot(e.clientX - lastObjClick.x, e.clientY - lastObjClick.y) < 35){
    lastObjClick = {key:null, time:0, x:0, y:0};
    lastEdgeClick = {key:null, index:null, time:0};
    lastPointClick = {key:null, index:null, time:0};
    const recule = objByKey(ds.key);
    if(recule && !etat.lectureSeule) ctx.sendObjectBackward(recule); // la lecture seule refuse le recul (D-18)
    e.preventDefault();
    return;
  }

  if(ds.role === 'obj'){
    const key = ds.key;
    if(!key) return;
    const nowObj = Date.now();
    // A tap-based double-tap is physically slower than a mouse double-click (lift + re-touch
    // the finger vs. a spring-loaded button), so it very often misses a window tuned for mice.
    const dblWindow = e.pointerType==='touch' ? 600 : 400;
    // Au doigt, deux taps eloignes sur la meme forme ne sont pas un double-tap : c'est un
    // deplacement d'intention. La souris, elle, ne saute pas entre deux clics.
    const memeEndroit = e.pointerType!=='touch' ||
      Math.hypot(e.clientX-lastObjClick.x, e.clientY-lastObjClick.y) < 35;
    if(lastObjClick.key===key && (nowObj-lastObjClick.time)<dblWindow && memeEndroit){
      // rapid second click on the same object: send it backward instead of
      // selecting/dragging (native dblclick can't be used here since preventDefault()
      // further down in this same handler, for the drag-start case, suppresses it)
      lastObjClick = {key:null, time:0, x:0, y:0};
      const objDbl = objByKey(key);
      if(!objDbl){ e.preventDefault(); return; }
      // Reculer un objet change l'ordre d'empilement, qui fait partie du projet : c'est une
      // modification comme une autre, et la lecture seule la refuse comme les autres.
      if(!etat.lectureSeule) ctx.sendObjectBackward(objDbl);
      e.preventDefault();
      return;
    }
    lastObjClick = {key, time:nowObj, x:e.clientX, y:e.clientY};
    if(key !== etat.selectedKey){
      etat.selectedKey = key; etat.highlight = {type:null, index:null}; ctx.rebuildSelector(); ctx.render();
      e.preventDefault();
      return;
    }
    const obj = objByKey(key);
    if(!obj || obj.locked) return; // locked: selectable/viewable but not movable
    // Lecture seule : on selectionne, on regarde, on exporte — on ne deplace rien. Le refus est
    // ici plutot que plus bas pour qu'aucun pas d'annulation ne soit empile pour un geste qui
    // n'aura pas lieu.
    if(etat.lectureSeule) return;
    etat.highlight = {type:null, index:null};
    ctx.pushHistory();
    if(obj.type==='circle'){
      // `GlisserEnCours.obj` exige `pts`, meme pour un cercle qui n'en a pas : imprecision
      // preexistante de drag.ts (§10.3), non touchee ici pour ne pas deplacer le probleme.
      //
      // `startScreen` n'a pas suivi : ce champ n'etait lu nulle part pour ces deux gestes (seul
      // le pan le lit, plus bas) - verifie a l'occasion du typage et retire (spec §10.3).
      activeDrag = {type:'circleMove', obj: obj as ObjetAPoints, startWorld:w, startCenter:{...obj.center}, moved:false};
    } else {
      const objP = obj as ObjetAPoints;
      activeDrag = {type:'shapeMove', obj: objP, startWorld:w, startPts: objP.pts.map(p=>({...p})), moved:false};
    }
  } else if(ds.role === 'point'){
    if(ds.key !== etat.selectedKey) return;
    const r = repere(ds), obj = r && objByKey(r.key);
    if(!r || !obj || !aDesSommets(obj) || obj.locked) return;
    const idx = r.index;
    if(etat.lectureSeule) return;
    const nowTp = Date.now();
    if(lastPointClick.key===ds.key && lastPointClick.index===idx && (nowTp-lastPointClick.time)<400){
      lastPointClick = {key:null, index:null, time:0};
      const gel = obj.frozenVertices;
      if(gel){ ctx.pushHistory(); gel[idx] = !gel[idx]; ctx.render(); }
      e.preventDefault();
      return;
    }
    lastPointClick = {key:ds.key, index:idx, time:nowTp};
    // Un coin gele ne bouge pas, SAUF en mode rectangle ou il redimensionne la forme entiere.
    if(obj.frozenVertices?.[idx] && !estRectangle(obj)) return;
    etat.highlight = {type:'vertex', index:idx};
    ctx.pushHistory();
    activeDrag = {type:'point', obj, idx, startWorld:w, startPt:{...sommetDe(obj.pts, idx)}};
  } else if(ds.role === 'edge'){
    if(ds.key !== etat.selectedKey) return;
    const r = repere(ds), obj = r && objByKey(r.key);
    if(!r || !obj || !aDesSommets(obj) || obj.locked) return;
    const i = r.index, j = (i+1)%obj.pts.length;
    if(etat.lectureSeule) return;
    const nowT = Date.now();
    if(lastEdgeClick.key===ds.key && lastEdgeClick.index===i && (nowT-lastEdgeClick.time)<400){
      lastEdgeClick = {key:null, index:null, time:0};
      ctx.insertPointOnSegment(obj, i, w);
      e.preventDefault();
      return;
    }
    lastEdgeClick = {key:ds.key, index:i, time:nowT};
    // Idem pour un cote : gele = fixe, sauf en mode rectangle ou il se translate.
    if((obj.frozenVertices?.[i] || obj.frozenVertices?.[j]) && !estRectangle(obj)) return;
    etat.highlight = {type:'segment', index:i};
    ctx.pushHistory();
    activeDrag = {type:'edge', obj, i, j, startWorld:w, startA:{...sommetDe(obj.pts, i)}, startB:{...sommetDe(obj.pts, j)}};
  } else if(ds.role === 'radius'){
    if(ds.key !== etat.selectedKey) return;
    const obj = objByKey(ds.key) as ObjetAPoints;
    if(obj.locked) return;
    if(etat.lectureSeule) return;
    etat.highlight = {type:null, index:null};
    ctx.pushHistory();
    activeDrag = {type:'radius', obj, startWorld:w};
  }
  if(activeDrag) e.preventDefault();
  ctx.render();
});

window.addEventListener('pointermove', e=>{
  if(!activeDrag) return;

  // Le deplacement de la vue n'est pas un glisser d'objet : il ecrit dans la scene, pas dans le
  // plan, et passe donc par interaction/navigation.ts.
  if(activeDrag.type === 'pan'){
    const rect = stage.getBoundingClientRect();
    const cur = {x:e.clientX-rect.left, y:e.clientY-rect.top};
    etat.scene = deplacer(etat.scene, activeDrag.startOrigin, activeDrag.startScreen, cur);
    ctx.render();
    return;
  }

  // Tout le calcul du glisser vit dans interaction/drag.ts ; ici, la position du pointeur en
  // metres et le contour dans lequel l'objet doit rester.
  appliquerGlisser(activeDrag, worldFromEvent(e), contourDeContrainte(etat.objects, activeDrag.obj));
  ctx.render();
});
window.addEventListener('pointerup', ()=>{
  if(activeDrag && (activeDrag.type==='shapeMove' || activeDrag.type==='circleMove') && !activeDrag.moved){
    // plain click (no drag) on the already-selected object's fill: toggle deselect
    etat.selectedKey = null;
    ctx.rebuildSelector();
    ctx.render();
  }
  activeDrag=null;
});
window.addEventListener('pointercancel', ()=>{ activeDrag=null; });

// ================= Add point (via double-click on an edge; see insertPointOnSegment below) =================



// ================= Zoom & pan =================
// Belt-and-suspenders for mobile: touch-action:none via CSS is not always honored
// reliably by every mobile browser/version, so also block the native touch gesture
// directly at the event level. This is the standard pattern used by drawing/CAD apps.
// Skip this for real controls living inside #stage (e.g. #fitBtn): preventDefault()
// on a touch event suppresses the synthetic click that would normally follow on iOS,
// which otherwise makes those buttons silently do nothing on iPhone/iPad.
const cibleUnBouton = (e: TouchEvent) => (e.target as HTMLElement).closest('button');
stage.addEventListener('touchstart', e=>{ if(cibleUnBouton(e)) return; e.preventDefault(); }, {passive:false});
stage.addEventListener('touchmove', e=>{ if(cibleUnBouton(e)) return; e.preventDefault(); }, {passive:false});
stage.addEventListener('touchend', e=>{ if(cibleUnBouton(e)) return; e.preventDefault(); }, {passive:false});

// Le calcul du zoom vit dans interaction/navigation.ts ; ici, seul le cablage.
svg.addEventListener('wheel', e=>{
  e.preventDefault();
  const rect = stage.getBoundingClientRect();
  etat.scene = zoomMolette(etat.scene, {x:e.clientX-rect.left, y:e.clientY-rect.top}, e.deltaY);
  ctx.render();
}, {passive:false});

/** Le point de depart d'un pan a trois doigts : la moyenne des positions, et l'origine de la scene. */
interface DebutPan { avg0: PtEcran; origin0: PtEcran }

const activePointers = new Map<number, PtEcran>();
let pinchState: DebutPincement | null = null;
let panState: DebutPan | null = null;
function stageRel(e: PointerEvent): PtEcran { const r=stage.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; }
// midOf vit dans interaction/navigation.ts sous le nom milieuDe.
stage.addEventListener('pointerdown', e=>{
  activePointers.set(e.pointerId, stageRel(e));
  if(activePointers.size===2){
    activeDrag=null;
    const [a, b] = [...activePointers.values()];
    if(a && b) pinchState = debutPincement(etat.scene, a, b);
    panState=null;
  } else if(activePointers.size===3){
    activeDrag=null; pinchState=null;
    const arr=[...activePointers.values()];
    panState = { avg0: milieuDe(arr), origin0: { ...etat.scene.origine } };
  } else if(activePointers.size>3){ pinchState=null; panState=null; }
});
window.addEventListener('pointermove', e=>{
  if(!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, stageRel(e));
  if(activePointers.size===2 && pinchState){
    const [a, b] = [...activePointers.values()];
    if(a && b) etat.scene = pincer(etat.scene, pinchState, a, b);

    ctx.render();
  } else if(activePointers.size===3 && panState){
    const arr=[...activePointers.values()];
    const avg=milieuDe(arr);
    etat.scene = deplacer(etat.scene, panState.origin0, panState.avg0, avg);
    ctx.render();
  }
});
function clearMulti(e: PointerEvent): void {
  activePointers.delete(e.pointerId);
  if(activePointers.size<2) pinchState=null;
  if(activePointers.size<3) panState=null;
}
window.addEventListener('pointerup', clearMulti);
window.addEventListener('pointercancel', clearMulti);

}
