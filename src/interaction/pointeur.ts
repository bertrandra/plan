// Evenements de pointeur sur le plan (spec §3.2, interaction/).
//
// Tout ce qui se declenche au doigt ou a la souris passe par ici : selection, glisser-deposer,
// double-clic, molette, pincement a deux doigts, deplacement a trois. Le CALCUL de chacun de ces
// gestes vit ailleurs - `interaction/drag.ts` pour le glisser, `interaction/navigation.ts` pour la
// vue - et la DECISION de celui qui s'applique a l'appui, dans `interaction/choixGeste.ts` : un
// glisser deplace la vue, sauf sur l'objet deja choisi ; un toucher bref choisit. Ce module cable.
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

import { confirmerSelection } from '../core/selectionAccueil.js';
import { parcelleDuProjet } from '../model/fonctions.js';
import { toucherForme } from '../core/controleurObjets.js';
import { apresDeformation } from '../core/deformation.js';
import { clotureDe, poserAcces, synchroniserAnciensChamps, coteLePlusProche } from '../model/cloture.js';
import { facadesDuContour } from '../geometry/cotesVusDeDehors.js';
import { appliquerGlisser, type GlisserEnCours } from './drag.js';
import { decalageDeSaisie, glisserAcces } from './glisserAcces.js';
import type { DebutPincement } from './navigation.js';
import { contourDeContrainte } from './editing.js';
import { zoomMolette, debutPincement, pincer, deplacer, milieuDe } from './navigation.js';
import { estRectangle } from '../geometry/rect.js';
import { mesure } from './outilMesure.js';
import { definirCibleAlignement } from './outilAlignement.js';
import { aGlisse, cibleDuRole, corpsMobile, deciderGeste, formeModifiable } from './choixGeste.js';
import { avecAccordDeRetouche, MESSAGE_RETOUCHE_PERMISE } from './retoucheTerrain.js';
import { retoucheADemander } from '../model/retouche.js';
import type { EtatApp } from '../core/state.js';
import type { ObjetPlan, PtBrut, PtEcran } from '../model/types.js';
import { aDesSommets } from '../model/formes.js';
import { sommetDe } from '../geometry/anneau.js';

/**
 * Un appui qui sera un toucher ou un glisser : tant que le pointeur reste sous le seuil
 * (interaction/choixGeste.ts), rien ne bouge ; lache la, c'est un toucher, qui choisit l'objet
 * (`choisir`) ou ne fait rien de plus (l'objet est deja choisi, et fixe). L'appui garde sa date et sa
 * place : un double-clic se reconnait depuis elles, comme quand l'appui choisissait aussitot.
 */
interface ToucherEnAttente { key: string; choisir: boolean; typePointeur: string; time: number; x: number; y: number; client: PtEcran }

/**
 * Le geste en cours vu par ce module : celui de `drag.ts`, plus le deplacement de la vue (pan a un
 * doigt), qui n'a ni objet ni position monde — il ecrit dans la scene, pas dans le plan. `toucher` :
 * le pan n'a pas encore passe le seuil, et un lacher maintenant est un toucher sur cet objet.
 */
type Geste = GlisserEnCours | { type: 'pan'; startScreen: PtEcran; startOrigin: PtBrut; toucher?: ToucherEnAttente }
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
  /** Prend le pas d'annulation ; `objets` : ceux que l'ecriture qui suit modifie sur place (core/controleurObjets.ts). */
  pushHistory: (...objets: object[]) => void;
  sendObjectBackward: (obj: ObjetPlan) => void;
  insertPointOnSegment: (obj: ObjetPlan, segIndex: number, clickWorld: PtBrut) => void;
  /** Le projet a change (pose d'un acces de la cloture par clic). */
  markDirty: (...objets: object[]) => void;
  /** Apres la pose d'un acces : la Vue 3D se reconstruit si elle est ouverte. */
  apresAcces: () => void;
  /**
   * Le cote cible de l'outil « Aligner » est designe : l'objet selectionne pivote aussitot pour lui
   * devenir parallele. Absent : la cible est seulement retenue.
   */
  aligner?: () => void;
  /** Dit a la personne pourquoi un geste n'a pas lieu. */
  signaler?: (message: string) => void;
  /** La question avant de retoucher un objet venu du cadastre ou de l'IGN (interaction/retoucheTerrain.ts) ; par defaut le dialogue Z8. */
  confirmer?: (message: string, oui: () => void) => void;
  /**
   * La vue a change (zoom, deplacement) depuis `avant` : sur un grand plan, un apercu tout de suite et
   * un rendu au repos (render/apercuVue.ts). Absent : un rendu complet.
   */
  vueChangee?: (avant: EtatApp['scene']) => void;
}

/** La vue vient de changer : l'apercu du contexte, sinon un rendu complet. */
const vueChangee = (ctx: ContextePointeur, avant: EtatApp['scene']): void => { if (ctx.vueChangee) ctx.vueChangee(avant); else ctx.render(); };

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
    ctx.pushHistory(parcelle);
    poserAcces(a, f, w);
    synchroniserAnciensChamps(parcelle);
    mesure.pointage = null;
    ctx.markDirty(parcelle);
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
      if(ctx.aligner) ctx.aligner();
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
  /** Le contour au debut d'un glisser de sommet ou de cote : a la fin, ce qui en depend suit (core/deformation.ts). */
  contourAvant: PtBrut[] | null;
  /**
   * Le second appui d'un double-clic sur le corps d'un objet, tant qu'il n'est pas lache : lache sur place, l'objet recule ; s'il
   * glisse, c'est le geste ordinaire (deplacer la vue ou l'objet choisi). Toucher un objet puis le faire glisser aussitot est le
   * geste de la regle (interaction/choixGeste.ts) : il ne doit pas reculer l'objet.
   */
  double: { key: string; client: PtEcran; typePointeur: string } | null;
}

const CLIC_VIDE: DernierClic = {key:null, index:null, time:0};
const CLIC_OBJET_VIDE: DernierClicObjet = {key:null, time:0, x:0, y:0};

/**
 * Ce qu'un `pointerdown` sur une poignee fait ensuite : rien de plus (`rien`), avaler l'evenement
 * (`avale`), ou poursuivre — un glisser a peut-etre commence, et le plan se redessine (`suite`).
 */
type Issue = 'rien' | 'avale' | 'suite';

const objetDe = (etat: EtatApp, key: string | null | undefined): ObjetPlan | undefined => etat.objects.find(o=>o.key===key);

/**
 * Le double-clic sur le corps d'un objet (le double-tap au doigt, ou qu'il tombe) : l'objet recule d'un plan au lieu d'etre choisi ou
 * deplace (le `dblclick` natif est inutilisable, le preventDefault de l'appui le supprime).
 *
 * Sur tactile, le doigt couvre plusieurs dizaines de pixels et les zones de capture des aretes font 16 px : le second tap atterrit
 * souvent sur une arete ou une poignee de la meme forme, jamais sur son interieur. On l'accepte donc quel que soit l'element touche,
 * si le tap precedent a vise le corps du MEME objet et au meme endroit — c'est ce test de proximite qui evite de le confondre avec un
 * double-tap d'arete (insertion de sommet). A la souris, seul le corps compte : un double-clic sur un cote y insere un sommet.
 */
function doubleClicObjet(p: EtatPointeur, e: PointerEvent, ds: DOMStringMap): 'non' | 'recule' | 'enAttente' {
  const auDoigt = e.pointerType === 'touch';
  if(!ds.key || ds.key !== p.clicObjet.key || !(auDoigt || ds.role === 'obj')) return 'non';
  // Un double-tap au doigt est plus lent qu'un double-clic de souris (lever, reposer le doigt) : une fenetre reglee pour la souris le
  // manquerait souvent. Et deux taps eloignes sur la meme forme ne sont pas un double-tap : c'est un deplacement d'intention. La
  // souris, elle, ne saute pas entre deux clics.
  if(Date.now() - p.clicObjet.time >= (auDoigt ? 600 : 400)) return 'non';
  if(auDoigt && Math.hypot(e.clientX - p.clicObjet.x, e.clientY - p.clicObjet.y) >= 35) return 'non';
  p.clicObjet = CLIC_OBJET_VIDE;
  p.clicCote = CLIC_VIDE;
  p.clicSommet = CLIC_VIDE;
  // Sur le corps, la decision attend le lacher (`double`) ; sur une arete ou une poignee (le second tap du doigt y tombe), tout de suite.
  if(ds.role === 'obj'){ p.double = { key: ds.key, client: {x:e.clientX, y:e.clientY}, typePointeur: e.pointerType }; return 'enAttente'; }
  reculer(p, ds.key);
  return 'recule';
}

/** Reculer un objet d'un plan. Cela change l'ordre d'empilement, qui fait partie du projet : la lecture seule le refuse (D-18). */
function reculer(p: EtatPointeur, key: string): void {
  const recule = objetDe(p.etat, key);
  if(recule && !p.etat.lectureSeule) p.ctx.sendObjectBackward(recule);
}

/** Le corps de l'objet choisi, qui peut bouger (interaction/choixGeste.ts l'a dit) : commencer a le deplacer. */
function surObjet(p: EtatPointeur, e: PointerEvent, ds: DOMStringMap, w: PtBrut): Issue {
  const { etat, ctx } = p;
  const key = ds.key;
  if(!key) return 'rien';
  // Le second appui d'un double-clic ne compte pas pour un troisieme.
  if(!p.double) p.clicObjet = {key, time:Date.now(), x:e.clientX, y:e.clientY};
  const obj = objetDe(etat, key);
  // Lecture seule : on selectionne, on regarde, on exporte — on ne deplace rien. Garde redoublee (choixGeste.ts l'a deja dit), avant
  // l'historique, pour qu'aucun pas d'annulation ne soit empile pour un geste qui n'aura pas lieu.
  if(etat.lectureSeule) return 'rien';
  if(!obj || !corpsMobile(obj, etat.lectureSeule)) return 'rien';
  etat.highlight = {type:null, index:null};
  // Le pas d'annulation se prend a l'appui, comme avant : un clic sans glisser deselectionne l'objet, sans rien ecrire.
  ctx.pushHistory(obj);
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

/**
 * Un glisser qui deformerait un objet venu du cadastre ou de l'IGN, pas encore retouche : la question se pose a l'appui, avant le
 * geste (une confirmation asynchrone ne peut pas interrompre un glisser en route). Rend `true` quand le glisser peut commencer ;
 * sinon l'appui est avale, et apres « Confirmer » la personne tire de nouveau.
 */
function glisserPermis(p: EtatPointeur, obj: ObjetPlan): boolean {
  const { ctx } = p;
  if(!retoucheADemander(obj)) return true;
  // L'appui qui pose la question n'est pas le premier clic d'un double-clic : le suivant, apres la reponse, commence un glisser.
  p.clicSommet = CLIC_VIDE; p.clicCote = CLIC_VIDE;
  avecAccordDeRetouche(obj, { markDirty: ctx.markDirty, confirmer: ctx.confirmer }, () => {
    ctx.signaler?.(MESSAGE_RETOUCHE_PERMISE);
    ctx.render();
  });
  return false;
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
    if(gel){ ctx.pushHistory(obj); gel[idx] = !gel[idx]; ctx.render(); }
    return 'avale';
  }
  p.clicSommet = {key:ds.key, index:idx, time:nowTp};
  // Un coin gele ne bouge pas, SAUF en mode rectangle ou il redimensionne la forme entiere.
  if(obj.frozenVertices?.[idx] && !estRectangle(obj)) return 'rien';
  if(!glisserPermis(p, obj)) return 'avale';
  etat.highlight = {type:'vertex', index:idx};
  ctx.pushHistory(obj);
  p.geste = {type:'point', obj, idx, startWorld:w, startPt:{...sommetDe(obj.pts, idx)}};
  p.contourAvant = obj.pts.map(q=>({...q}));
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
  if(!glisserPermis(p, obj)) return 'avale';
  etat.highlight = {type:'segment', index:i};
  ctx.pushHistory(obj);
  p.geste = {type:'edge', obj, i, j, startWorld:w, startA:{...sommetDe(obj.pts, i)}, startB:{...sommetDe(obj.pts, j)}};
  p.contourAvant = obj.pts.map(q=>({...q}));
  return 'suite';
}

/** La poignee de rayon d'un cercle. */
function surRayon(p: EtatPointeur, ds: DOMStringMap, w: PtBrut): Issue {
  const { etat, ctx } = p;
  if(ds.key !== etat.selectedKey) return 'rien';
  const obj = objetDe(etat, ds.key);
  if(!obj || obj.type !== 'circle' || obj.locked) return 'rien';
  if(etat.lectureSeule) return 'rien';
  if(!glisserPermis(p, obj)) return 'avale';
  etat.highlight = {type:null, index:null};
  ctx.pushHistory(obj);
  p.geste = {type:'radius', obj, startWorld:w};
  return 'suite';
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
    const avant = etat.scene;
    etat.scene = zoomMolette(etat.scene, {x:e.clientX-rect.left, y:e.clientY-rect.top}, e.deltaY);
    vueChangee(ctx, avant);
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
      const avant = etat.scene;
      if(a && b) etat.scene = pincer(etat.scene, pinchState, a, b);
      vueChangee(ctx, avant);
    } else if(activePointers.size===3 && panState){
      const avant = etat.scene;
      etat.scene = deplacer(etat.scene, panState.origin0, panState.avg0, milieuDe([...activePointers.values()]));
      vueChangee(ctx, avant);
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

/** Un champ ou l'espace s'ecrit : la barre d'espace y reste a la saisie. */
const estChampDeSaisie = (el: EventTarget | null): boolean =>
  el instanceof Element && (el.matches('input, textarea, select') || (el as HTMLElement).isContentEditable === true);

/**
 * La barre d'espace tenue : glisser deplace alors la vue, ou que ce soit sur le plan (comme dans les logiciels de dessin). Pas de
 * raccourci global : seulement quand le plan est a l'ecran et que le focus n'est ni dans un champ, ni sur une commande (un bouton
 * focalise s'actionne a l'espace, il garde ce geste).
 */
function brancherEspace(stage: HTMLElement): { tenue: () => boolean } {
  let tenue = false;
  const lacher = (): void => { tenue = false; delete stage.dataset.espace; };
  const pourLePlan = (e: KeyboardEvent): boolean => {
    if(e.code !== 'Space' || e.ctrlKey || e.metaKey || e.altKey) return false;
    if(!stage.getClientRects().length) return false;
    const actif = document.activeElement;
    const libre = !actif || actif === document.body || actif === document.documentElement || stage.contains(actif);
    return libre && !estChampDeSaisie(e.target) && !estChampDeSaisie(actif);
  };
  window.addEventListener('keydown', e=>{
    if(!pourLePlan(e)) return;
    // L'espace ferait defiler la page : le plan le prend, une fois par appui.
    e.preventDefault();
    if(!tenue){ tenue = true; stage.dataset.espace = ''; }
  });
  window.addEventListener('keyup', e=>{ if(e.code === 'Space') lacher(); });
  window.addEventListener('blur', lacher);
  return { tenue: () => tenue };
}

/**
 * Branche tous les evenements de pointeur sur le plan.
 *
 * svg recoit les gestes qui visent un objet, stage ceux qui visent la vue (multi-touch) : c'est
 * la meme distinction que dans le DOM, et elle evite qu'un pincement soit pris pour un glisser.
 */
export function brancherPointeur(svg: SVGElement, stage: HTMLElement, etat: EtatApp, ctx: ContextePointeur): void {
  const p: EtatPointeur = { etat, ctx, geste: null, clicCote: CLIC_VIDE, clicSommet: CLIC_VIDE, clicObjet: CLIC_OBJET_VIDE, contourAvant: null, double: null };
  const worldFromEvent = (e: PointerEvent): PtBrut => {
    const rect = stage.getBoundingClientRect();
    return ctx.toWorld({x:e.clientX-rect.left, y:e.clientY-rect.top});
  };

  const ecran = (e: PointerEvent): PtEcran => { const r = stage.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; };
  /** Deplacer la vue depuis cet appui ; `toucher` : un lacher sous le seuil sera un toucher sur cet objet. */
  const commencerPan = (e: PointerEvent, toucher?: ToucherEnAttente): void => {
    p.geste = {type:'pan', startScreen:ecran(e), startOrigin:{...etat.scene.origine}, ...(toucher ? {toucher} : {})};
    e.preventDefault();
  };
  const espace = brancherEspace(stage);

  svg.addEventListener('pointerdown', e=>{
    const ds = (e.target as HTMLElement).dataset ?? {};
    // Un acces de la cloture ne porte pas de cle : il appartient a la parcelle du projet (render/cloture.ts).
    const obj = ds.role === 'acces' ? parcelleDuProjet(etat.objects) : objetDe(etat, ds.key);
    const decision = deciderGeste({
      cible: obj ? cibleDuRole(ds.role) : 'vide', bouton: e.button ?? 0, espace: espace.tenue(), outilEnCours: !!mesure.pointage,
      lectureSeule: etat.lectureSeule,
      objet: obj ? { choisi: obj.key === etat.selectedKey, corpsMobile: corpsMobile(obj, etat.lectureSeule), formeModifiable: formeModifiable(obj, etat.lectureSeule) } : undefined
    });
    if(decision === 'rien') return;
    // ---- Outil de cotation / d'alignement : tant qu'on designe un cote ou un point, le clic lui revient
    if(decision === 'outil'){ pointerPourLaMesure(ds, etat, ctx, worldFromEvent(e)); e.preventDefault(); return; }
    // Le bouton du milieu, l'espace tenue, le vide : la vue, sans autre effet.
    if(!obj || e.button === 1 || espace.tenue()){ commencerPan(e); return; }
    // Le double-clic (le double-tap) sur un objet le recule, qu'il soit choisi ou non, mobile ou fixe.
    p.double = null;
    if(doubleClicObjet(p, e, ds) === 'recule'){ e.preventDefault(); return; }
    const toucher = (choisir: boolean): ToucherEnAttente =>
      ({ key: obj.key, choisir, typePointeur: e.pointerType, time: Date.now(), x: e.clientX, y: e.clientY, client: {x:e.clientX, y:e.clientY} });
    // Un objet qui n'est pas choisi : un glisser deplace la vue, un toucher le choisit (au lacher).
    if(decision === 'vueOuChoix'){ commencerPan(e, toucher(true)); return; }
    // Un geste sur l'objet deja choisi (le glisser, tirer un sommet) : la personne se sert de la selection posee a l'ouverture, elle
    // est a elle et la Vue 3D la gardera (core/selectionAccueil.ts).
    if(ds.key && ds.key === etat.selectedKey) confirmerSelection(etat);
    // L'objet choisi mais fixe (le terrain, le terrain reel, verrouille, la lecture seule) : la vue ; un toucher n'y change rien.
    if(decision === 'vue'){ commencerPan(e, ds.key ? toucher(false) : undefined); return; }
    const w = worldFromEvent(e);
    const issue: Issue =
      ds.role === 'obj' ? surObjet(p, e, ds, w)
      : ds.role === 'point' ? surSommet(p, ds, w)
      : ds.role === 'edge' ? surCote(p, ds, w)
      : ds.role === 'radius' ? surRayon(p, ds, w)
      : ds.role === 'acces' ? surAcces(p, ds, w)
      : 'suite';
    // Le geste propre n'a pas lieu (un coin gele) : glisser ailleurs que sur ce qui bouge deplace la vue.
    if(issue === 'rien'){ commencerPan(e); return; }
    if(issue === 'avale'){ e.preventDefault(); return; }
    if(p.geste) e.preventDefault();
    ctx.render();
  });
  // Le bouton du milieu : sans cela, Windows ouvre son defilement automatique sur le plan.
  svg.addEventListener('mousedown', e=>{ if(e.button === 1) e.preventDefault(); });

  window.addEventListener('pointermove', e=>{
    const geste = p.geste;
    if(!geste) return;
    // Le deplacement de la vue n'est pas un glisser d'objet : il ecrit dans la scene, pas dans le
    // plan, et passe donc par interaction/navigation.ts.
    if(geste.type === 'pan'){
      const t = geste.toucher;
      if(t){
        // Sous le seuil, c'est peut-etre encore un toucher : la vue ne bouge pas. Au-dela, elle rattrape le pointeur d'un coup.
        if(!aGlisse(e.clientX - t.client.x, e.clientY - t.client.y, t.typePointeur)) return;
        delete geste.toucher;
      }
      const cur = ecran(e);
      const avant = etat.scene;
      etat.scene = deplacer(etat.scene, geste.startOrigin, geste.startScreen, cur);
      vueChangee(ctx, avant);
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
      if(!geste.moved){ ctx.pushHistory(parcelle); geste.moved = true; }
      a.cote = essai.cote; a.x = essai.x;
      if(a.cote !== avant.cote || a.x !== avant.x){ ctx.markDirty(parcelle); ctx.render(); }
      return;
    }
    // Tout le calcul du glisser vit dans interaction/drag.ts ; ici, la position du pointeur en
    // metres et le contour dans lequel l'objet doit rester.
    appliquerGlisser(geste, worldFromEvent(e), contourDeContrainte(etat.objects, geste.obj));
    // A chaque image, seule la forme de l'objet glisse a change : le plan ne redessine que lui, et ce qui ne lit pas sa forme (les
    // attributs des objets : l'explorateur, les barres) garde sa cle (core/controleurObjets.ts).
    toucherForme(geste.obj);
    ctx.render();
  });
  window.addEventListener('pointerup', e=>{
    const geste = p.geste;
    const double = p.double;
    p.double = null;
    // Le second appui d'un double-clic, lache sans avoir glisse : l'objet recule (et rien d'autre : ni choix, ni deselection).
    const doubleSurPlace = !!double && !aGlisse(e.clientX - double.client.x, e.clientY - double.client.y, double.typePointeur);
    if(geste && geste.type === 'pan'){
      p.geste = null;
      const t = geste.toucher;
      if(double && doubleSurPlace && t){ reculer(p, double.key); return; }
      if(!t) return;
      // Un toucher, pas un glisser : il compte pour un double-clic, et choisit l'objet s'il ne l'etait pas.
      p.clicObjet = {key:t.key, time:t.time, x:t.x, y:t.y};
      if(t.choisir && objetDe(etat, t.key)){
        etat.selectedKey = t.key; etat.highlight = {type:null, index:null}; ctx.rebuildSelector(); ctx.render();
      }
      return;
    }
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
    if(geste && (geste.type==='point' || geste.type==='edge') && p.contourAvant){
      // Un sommet ou un cote tire (un rectangle redimensionne) : les releves, les cotes et le toit lu suivent le contour deforme.
      const dire = apresDeformation(etat, geste.obj as ObjetPlan, p.contourAvant);
      if(dire) ctx.signaler?.(dire);
    }
    p.contourAvant = null;
    if(double && doubleSurPlace && geste && (geste.type==='shapeMove' || geste.type==='circleMove')){
      // Le tremblement d'un double-clic n'est pas un deplacement : l'objet revient ou il etait, puis recule.
      appliquerGlisser(geste, geste.startWorld, null);
      toucherForme(geste.obj);
      p.geste = null;
      reculer(p, double.key);
      ctx.render();
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
  window.addEventListener('pointercancel', ()=>{ p.geste = null; p.double = null; });

  brancherGestesDeVue(svg, stage, etat, ctx, () => { p.geste = null; p.double = null; });
}
