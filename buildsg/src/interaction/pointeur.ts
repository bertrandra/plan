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

import { parcelleDuProjet } from '../model/fonctions.js';
import { clotureDe, poserAcces, synchroniserAnciensChamps, coteLePlusProche } from '../model/cloture.js';
import { facadesDuContour } from '../facade/geometrie.js';
import { appliquerGlisser, type GlisserEnCours } from './drag.js';
import { decalageDeSaisie, glisserAcces } from './glisserAcces.js';
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
 */
type Geste = GlisserEnCours | { type: 'pan'; startScreen: PtEcran; startOrigin: PtBrut }
  /** Un portail ou un portillon qu'on fait glisser le long de la cloture (interaction/glisserAcces.ts). */
  | { type: 'acces'; indice: number; decalage: number; moved: boolean };

/** Le dernier clic sur un cote, un sommet, ou un objet — pour reconnaitre un double-tap. */
interface DernierClic { key: string | null; index: number | null; time: number }
interface DernierClicObjet { key: string | null; time: number; x: number; y: number }

/** Ce que le cablage des evenements de pointeur demande au reste de l'application. */
export interface ContextePointeur {
  toWorld: (p: PtEcran) => PtBrut;
  render: () => void;
  rebuildSelector: () => void;
  pushHistory: () => void;
  sendObjectBackward: (obj: ObjetPlan) => void;
  insertPointOnSegment: (obj: ObjetPlan, segIndex: number, clickWorld: PtBrut) => void;
  /** Le projet a change (pose d'un acces de la cloture par clic). */
  markDirty: () => void;
  /** Apres la pose d'un acces : la Vue 3D se reconstruit si elle est ouverte. */
  apresAcces: () => void;
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
function pointerPourLaMesure(ds: DOMStringMap, etat: EtatApp, ctx: ContextePointeur, w: PtBrut): void {
  const pointage = mesure.pointage;
  if(!pointage) return;
  const r = repere(ds);
  if(pointage.purpose==='acces'){
    // Le cote de la parcelle du projet le plus proche du clic, a 12 px pres : l'acces en cours s'y
    // pose, centre sur le point clique. On ne regarde pas l'element touche : un objet qui chevauche
    // la limite (massif, voisine) prendrait le clic a sa place.
    if(etat.lectureSeule) return;
    const parcelle = parcelleDuProjet(etat.objects);
    if(!parcelle || !aDesSommets(parcelle)) return;
    const proche = coteLePlusProche(parcelle.pts, w);
    if(proche.distance > Math.max(0.3, 12 / etat.scene.scale)) return;
    const a = clotureDe(parcelle).portails[pointage.indice ?? -1];
    const f = facadesDuContour(parcelle.pts, 0).find(x=>x.cote===proche.cote);
    if(!a || !f) return;
    ctx.pushHistory();
    poserAcces(a, f, w);
    synchroniserAnciensChamps(parcelle);
    mesure.pointage = null;
    ctx.markDirty();
    ctx.render();
    ctx.apresAcces();
    return;
  }
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

/** Ce que le pointeur retient d'un evenement a l'autre : le geste en cours et les derniers clics. */
interface EtatPointeur {
  etat: EtatApp;
  ctx: ContextePointeur;
  geste: Geste | null;
  clicCote: DernierClic;
  clicSommet: DernierClic;
  clicObjet: DernierClicObjet;
}

const CLIC_VIDE: DernierClic = {key:null, index:null, time:0};
const CLIC_OBJET_VIDE: DernierClicObjet = {key:null, time:0, x:0, y:0};

/**
 * Ce qu'un `pointerdown` sur une poignee fait ensuite : rien de plus (`rien`), avaler l'evenement
 * (`avale`), ou poursuivre — un glisser a peut-etre commence, et le plan se redessine (`suite`).
 */
type Issue = 'rien' | 'avale' | 'suite';

const objetDe = (etat: EtatApp, key: string | null | undefined): ObjetPlan | undefined => etat.objects.find(o=>o.key===key);

/** Le corps d'un objet : le selectionner, le reculer au double-clic, ou commencer a le deplacer. */
function surObjet(p: EtatPointeur, e: PointerEvent, ds: DOMStringMap, w: PtBrut): Issue {
  const { etat, ctx } = p;
  const key = ds.key;
  if(!key) return 'rien';
  const nowObj = Date.now();
  // Un double-tap au doigt est plus lent qu'un double-clic de souris (lever, reposer le doigt) :
  // une fenetre reglee pour la souris le manquerait souvent.
  const dblWindow = e.pointerType==='touch' ? 600 : 400;
  // Au doigt, deux taps eloignes sur la meme forme ne sont pas un double-tap : c'est un
  // deplacement d'intention. La souris, elle, ne saute pas entre deux clics.
  const memeEndroit = e.pointerType!=='touch' ||
    Math.hypot(e.clientX-p.clicObjet.x, e.clientY-p.clicObjet.y) < 35;
  if(p.clicObjet.key===key && (nowObj-p.clicObjet.time)<dblWindow && memeEndroit){
    // Second clic rapide sur le meme objet : il recule d'un plan au lieu d'etre selectionne ou
    // deplace (le `dblclick` natif est inutilisable, le preventDefault plus bas le supprime).
    p.clicObjet = CLIC_OBJET_VIDE;
    const objDbl = objetDe(etat, key);
    if(!objDbl) return 'avale';
    // Reculer un objet change l'ordre d'empilement, qui fait partie du projet : c'est une
    // modification comme une autre, et la lecture seule la refuse comme les autres.
    if(!etat.lectureSeule) ctx.sendObjectBackward(objDbl);
    return 'avale';
  }
  p.clicObjet = {key, time:nowObj, x:e.clientX, y:e.clientY};
  if(key !== etat.selectedKey){
    etat.selectedKey = key; etat.highlight = {type:null, index:null}; ctx.rebuildSelector(); ctx.render();
    return 'avale';
  }
  const obj = objetDe(etat, key);
  if(!obj || obj.locked) return 'rien'; // verrouille : se selectionne et se lit, mais ne bouge pas
  // Lecture seule : on selectionne, on regarde, on exporte — on ne deplace rien. Le refus est ici,
  // avant l'historique, pour qu'aucun pas d'annulation ne soit empile pour un geste qui n'aura pas lieu.
  if(etat.lectureSeule) return 'rien';
  etat.highlight = {type:null, index:null};
  ctx.pushHistory();
  p.geste = obj.type==='circle'
    ? {type:'circleMove', obj, startWorld:w, startCenter:{...obj.center}, moved:false}
    : {type:'shapeMove', obj, startWorld:w, startPts: obj.pts.map(q=>({...q})), moved:false};
  return 'suite';
}

/**
 * Un portail ou un portillon : commencer a le faire glisser le long de la cloture. L'historique
 * n'est empile qu'au premier mouvement : un simple clic ne laisse pas de pas d'annulation vide.
 */
function surAcces(p: EtatPointeur, ds: DOMStringMap, w: PtBrut): Issue {
  const { etat } = p;
  if(etat.lectureSeule) return 'rien';
  const parcelle = parcelleDuProjet(etat.objects);
  const indice = parseInt(ds.index ?? '', 10);
  const a = parcelle && aDesSommets(parcelle) ? clotureDe(parcelle).portails[indice] : undefined;
  if(!parcelle || !aDesSommets(parcelle) || !a) return 'rien';
  p.geste = { type:'acces', indice, decalage: decalageDeSaisie(a, parcelle.pts, w), moved:false };
  return 'suite';
}

/** Un sommet : le geler au double-clic, ou commencer a le tirer. */
function surSommet(p: EtatPointeur, ds: DOMStringMap, w: PtBrut): Issue {
  const { etat, ctx } = p;
  if(ds.key !== etat.selectedKey) return 'rien';
  const r = repere(ds), obj = r && objetDe(etat, r.key);
  if(!r || !obj || !aDesSommets(obj) || obj.locked) return 'rien';
  const idx = r.index;
  if(etat.lectureSeule) return 'rien';
  const nowTp = Date.now();
  if(p.clicSommet.key===ds.key && p.clicSommet.index===idx && (nowTp-p.clicSommet.time)<400){
    p.clicSommet = CLIC_VIDE;
    const gel = obj.frozenVertices;
    if(gel){ ctx.pushHistory(); gel[idx] = !gel[idx]; ctx.render(); }
    return 'avale';
  }
  p.clicSommet = {key:ds.key, index:idx, time:nowTp};
  // Un coin gele ne bouge pas, SAUF en mode rectangle ou il redimensionne la forme entiere.
  if(obj.frozenVertices?.[idx] && !estRectangle(obj)) return 'rien';
  etat.highlight = {type:'vertex', index:idx};
  ctx.pushHistory();
  p.geste = {type:'point', obj, idx, startWorld:w, startPt:{...sommetDe(obj.pts, idx)}};
  return 'suite';
}

/** Un cote : y inserer un sommet au double-clic, ou commencer a le translater. */
function surCote(p: EtatPointeur, ds: DOMStringMap, w: PtBrut): Issue {
  const { etat, ctx } = p;
  if(ds.key !== etat.selectedKey) return 'rien';
  const r = repere(ds), obj = r && objetDe(etat, r.key);
  if(!r || !obj || !aDesSommets(obj) || obj.locked) return 'rien';
  const i = r.index, j = (i+1)%obj.pts.length;
  if(etat.lectureSeule) return 'rien';
  const nowT = Date.now();
  if(p.clicCote.key===ds.key && p.clicCote.index===i && (nowT-p.clicCote.time)<400){
    p.clicCote = CLIC_VIDE;
    ctx.insertPointOnSegment(obj, i, w);
    return 'avale';
  }
  p.clicCote = {key:ds.key, index:i, time:nowT};
  // Idem pour un cote : gele = fixe, sauf en mode rectangle ou il se translate.
  if((obj.frozenVertices?.[i] || obj.frozenVertices?.[j]) && !estRectangle(obj)) return 'rien';
  etat.highlight = {type:'segment', index:i};
  ctx.pushHistory();
  p.geste = {type:'edge', obj, i, j, startWorld:w, startA:{...sommetDe(obj.pts, i)}, startB:{...sommetDe(obj.pts, j)}};
  return 'suite';
}

/** La poignee de rayon d'un cercle. */
function surRayon(p: EtatPointeur, ds: DOMStringMap, w: PtBrut): Issue {
  const { etat, ctx } = p;
  if(ds.key !== etat.selectedKey) return 'rien';
  const obj = objetDe(etat, ds.key);
  if(!obj || obj.type !== 'circle' || obj.locked) return 'rien';
  if(etat.lectureSeule) return 'rien';
  etat.highlight = {type:null, index:null};
  ctx.pushHistory();
  p.geste = {type:'radius', obj, startWorld:w};
  return 'suite';
}

/**
 * Sur tactile, le doigt couvre plusieurs dizaines de pixels et les zones de capture des aretes
 * font 16 px : le second tap d'un double-tap atterrit souvent sur une arete ou une poignee de la
 * meme forme, jamais sur son interieur. On l'accepte donc quel que soit l'element touche, si le tap
 * precedent a vise le corps du MEME objet et au meme endroit — c'est ce test de proximite qui
 * evite de le confondre avec un double-tap d'arete (insertion de sommet).
 */
function doubleTapObjet(p: EtatPointeur, e: PointerEvent, ds: DOMStringMap): boolean {
  if(!(e.pointerType === 'touch' && ds.key && ds.key === p.clicObjet.key &&
       (Date.now() - p.clicObjet.time) < 600 &&
       Math.hypot(e.clientX - p.clicObjet.x, e.clientY - p.clicObjet.y) < 35)) return false;
  p.clicObjet = CLIC_OBJET_VIDE;
  p.clicCote = CLIC_VIDE;
  p.clicSommet = CLIC_VIDE;
  const recule = objetDe(p.etat, ds.key);
  if(recule && !p.etat.lectureSeule) p.ctx.sendObjectBackward(recule); // la lecture seule refuse le recul (D-18)
  return true;
}

/** Le point de depart d'un pan a trois doigts : la moyenne des positions, et l'origine de la scene. */
interface DebutPan { avg0: PtEcran; origin0: PtEcran }

/**
 * Les gestes de la vue elle-meme : la molette, le pincement a deux doigts, le pan a trois. Un geste
 * a plusieurs doigts annule le glisser d'objet en cours (`annulerGlisser`).
 */
function brancherGestesDeVue(svg: SVGElement, stage: HTMLElement, etat: EtatApp, ctx: ContextePointeur, annulerGlisser: () => void): void {
  // Filet pour le mobile : `touch-action:none` en CSS n'est pas toujours respecte, on bloque donc
  // aussi le geste natif a l'evenement — le schema habituel des applications de dessin. Sauf sur un
  // vrai bouton du plan : le preventDefault d'un toucher y supprimerait le clic synthetique d'iOS,
  // et le bouton ne ferait silencieusement rien sur iPhone ou iPad.
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

  const activePointers = new Map<number, PtEcran>();
  let pinchState: DebutPincement | null = null;
  let panState: DebutPan | null = null;
  const stageRel = (e: PointerEvent): PtEcran => { const r=stage.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; };
  stage.addEventListener('pointerdown', e=>{
    activePointers.set(e.pointerId, stageRel(e));
    if(activePointers.size===2){
      annulerGlisser();
      const [a, b] = [...activePointers.values()];
      if(a && b) pinchState = debutPincement(etat.scene, a, b);
      panState=null;
    } else if(activePointers.size===3){
      annulerGlisser(); pinchState=null;
      panState = { avg0: milieuDe([...activePointers.values()]), origin0: { ...etat.scene.origine } };
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
      etat.scene = deplacer(etat.scene, panState.origin0, panState.avg0, milieuDe([...activePointers.values()]));
      ctx.render();
    }
  });
  const clearMulti = (e: PointerEvent): void => {
    activePointers.delete(e.pointerId);
    if(activePointers.size<2) pinchState=null;
    if(activePointers.size<3) panState=null;
  };
  window.addEventListener('pointerup', clearMulti);
  window.addEventListener('pointercancel', clearMulti);
}

/**
 * Branche tous les evenements de pointeur sur le plan.
 *
 * svg recoit les gestes qui visent un objet, stage ceux qui visent la vue (multi-touch) : c'est
 * la meme distinction que dans le DOM, et elle evite qu'un pincement soit pris pour un glisser.
 */
export function brancherPointeur(svg: SVGElement, stage: HTMLElement, etat: EtatApp, ctx: ContextePointeur): void {
  const p: EtatPointeur = { etat, ctx, geste: null, clicCote: CLIC_VIDE, clicSommet: CLIC_VIDE, clicObjet: CLIC_OBJET_VIDE };
  const worldFromEvent = (e: PointerEvent): PtBrut => {
    const rect = stage.getBoundingClientRect();
    return ctx.toWorld({x:e.clientX-rect.left, y:e.clientY-rect.top});
  };

  svg.addEventListener('pointerdown', e=>{
    const ds = (e.target as HTMLElement).dataset;
    // ---- Outil de cotation / d'alignement : tant qu'on designe un cote ou un point, le clic lui revient
    if(mesure.pointage){ pointerPourLaMesure(ds, etat, ctx, worldFromEvent(e)); e.preventDefault(); return; }
    if(!ds || !ds.role){
      // Un clic ou un glisser sur le fond (grille, plan vide) deplace la vue.
      const rect = stage.getBoundingClientRect();
      p.geste = {type:'pan', startScreen:{x:e.clientX-rect.left, y:e.clientY-rect.top}, startOrigin:{...etat.scene.origine}};
      e.preventDefault();
      return;
    }
    const w = worldFromEvent(e);
    if(doubleTapObjet(p, e, ds)){ e.preventDefault(); return; }
    const issue: Issue =
      ds.role === 'obj' ? surObjet(p, e, ds, w)
      : ds.role === 'point' ? surSommet(p, ds, w)
      : ds.role === 'edge' ? surCote(p, ds, w)
      : ds.role === 'radius' ? surRayon(p, ds, w)
      : ds.role === 'acces' ? surAcces(p, ds, w)
      : 'suite';
    if(issue === 'rien') return;
    if(issue === 'avale'){ e.preventDefault(); return; }
    if(p.geste) e.preventDefault();
    ctx.render();
  });

  window.addEventListener('pointermove', e=>{
    const geste = p.geste;
    if(!geste) return;
    // Le deplacement de la vue n'est pas un glisser d'objet : il ecrit dans la scene, pas dans le
    // plan, et passe donc par interaction/navigation.ts.
    if(geste.type === 'pan'){
      const rect = stage.getBoundingClientRect();
      const cur = {x:e.clientX-rect.left, y:e.clientY-rect.top};
      etat.scene = deplacer(etat.scene, geste.startOrigin, geste.startScreen, cur);
      ctx.render();
      return;
    }
    if(geste.type === 'acces'){
      // Garde redoublee : la lecture seule a pu tomber pendant le geste (droits recharges).
      if(etat.lectureSeule) return;
      const parcelle = parcelleDuProjet(etat.objects);
      const a = parcelle && aDesSommets(parcelle) ? clotureDe(parcelle).portails[geste.indice] : undefined;
      if(!parcelle || !aDesSommets(parcelle) || !a) return;
      // Le pas d'annulation se prend juste avant la premiere modification, sur l'etat d'avant.
      const avant = { cote: a.cote, x: a.x };
      const essai = { ...a };
      if(!glisserAcces(essai, parcelle.pts, worldFromEvent(e), geste.decalage)) return;
      if(!geste.moved){ ctx.pushHistory(); geste.moved = true; }
      a.cote = essai.cote; a.x = essai.x;
      if(a.cote !== avant.cote || a.x !== avant.x){ ctx.markDirty(); ctx.render(); }
      return;
    }
    // Tout le calcul du glisser vit dans interaction/drag.ts ; ici, la position du pointeur en
    // metres et le contour dans lequel l'objet doit rester.
    appliquerGlisser(geste, worldFromEvent(e), contourDeContrainte(etat.objects, geste.obj));
    ctx.render();
  });
  window.addEventListener('pointerup', ()=>{
    const geste = p.geste;
    if(geste && geste.type === 'acces'){
      // La 3D et l'inspecteur suivent une fois le geste fini, pas a chaque image.
      if(geste.moved){
        const parcelle = parcelleDuProjet(etat.objects);
        if(parcelle) synchroniserAnciensChamps(parcelle);
        ctx.apresAcces();
      }
      p.geste = null;
      return;
    }
    if(geste && (geste.type==='shapeMove' || geste.type==='circleMove') && !geste.moved){
      // Un simple clic (sans glisser) sur l'objet deja selectionne : il se deselectionne.
      etat.selectedKey = null;
      ctx.rebuildSelector();
      ctx.render();
    }
    p.geste = null;
  });
  window.addEventListener('pointercancel', ()=>{ p.geste = null; });

  brancherGestesDeVue(svg, stage, etat, ctx, () => { p.geste = null; });
}
