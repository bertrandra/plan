// Elements SVG d'un objet du plan (spec §3.2, render/objects.ts).
//
// Deux fonctions, deux moments : `creerDomObjet` fabrique la forme et son etiquette une fois pour
// toutes ; `reconstruirePoignees` refait les poignees d'edition, qui changent avec le nombre de
// sommets. Les elements sont ranges dans la carte des vues (render/vues.ts), jamais sur l'objet
// lui-meme - c'est la separation donnee/vue de la §5.2.
//
// La racine SVG est recue en parametre, et le double-clic sur un cote est delegue a l'appelant :
// ce module ne connait ni la selection courante, ni la transformation de la vue.

import { vue } from './vues.js';
import { creerSvg } from './svg.js';
import { SVG_INK, SVG_LABEL_HALO } from './theme.js';
import { versEcran } from '../geometry/vue.js';
import { polyStr, pathD } from '../geometry/path.js';
import { centroid, dist, angleInterieurDeg } from '../geometry/basic.js';
import { exteriorBisector } from '../geometry/polygon.js';
import { etiquetteComposee, longueurEnMetres, angleEnDegres, SEP_ECRAN, DEGRE_ECRAN } from '../model/etiquettes.js';
import type { PtBrut } from '../model/types.js';
import type { EtatScene } from '../geometry/vue.js';

export interface ObjetPlan {
  curve?: boolean;
  center?: PtBrut;
  r?: number;
  locked?: boolean;
  name?: string;
  showName?: boolean;
  showSegNames?: boolean;
  showVertNames?: boolean;
  showDims?: boolean;
  showAngles?: boolean;
  vertexNames?: string[];
  segmentNames?: string[];
  frozenVertices?: boolean[];
  key: string;
  type: string;
  fill: string;
  fillOpacity: number;
  stroke: string;
  fonction?: string;
  width?: number;
  pts?: PtBrut[];
}

export interface ContextePoignees {
  racine: SVGElement;
  /**
   * Double-clic sur un cote. L'appelant decide quoi en faire (inserer un point) : lui seul sait
   * si l'objet est selectionne et comment convertir des pixels en metres.
   */
  surDoubleClicCote?: (obj: ObjetPlan, index: number, ev: MouseEvent) => void;
}

/**
 * Pose `.title` sur un element SVG, exactement comme le faisait le fichier d'origine.
 *
 * A noter, sans le corriger ici (spec §10.3) : sur un element SVG, `title` n'est PAS un attribut
 * standard. L'affectation cree une simple propriete JavaScript et **n'affiche aucune infobulle** -
 * il faudrait un enfant `<title>`. Le comportement est conserve tel quel ; l'anomalie est
 * consignee dans MD/MIGRATION-JOURNAL.md pour apres la migration.
 */
function titreInerte(el: SVGElement | null, texte: string): void {
  if (el) (el as unknown as { title: string }).title = texte;
}


export function creerDomObjet(racine: SVGElement, obj: ObjetPlan, scene: EtatScene): void {
  const v = vue(obj);
  if(obj.type==='polygon'){
    v.el = creerSvg('polygon');
    v.el.setAttribute('fill',obj.fill); v.el.setAttribute('fill-opacity',String(obj.fillOpacity));
    v.el.setAttribute('stroke',obj.stroke); v.el.setAttribute('stroke-width','1.8');
    v.el.setAttribute('pointer-events','all');
    v.el.dataset.role='obj'; v.el.dataset.key=obj.key;
    v.el.style.cursor='pointer';
    titreInerte(v.el, 'Double-clic : reculer cet objet dans la superposition');
    racine.appendChild(v.el);
  } else if(obj.type==='path'){
    v.el = creerSvg('path');
    v.el.setAttribute('fill','none');
    v.el.setAttribute('stroke',obj.stroke); v.el.setAttribute('stroke-width', String((obj.width||1)*scene.scale));
    v.el.setAttribute('stroke-linecap','butt'); v.el.setAttribute('stroke-linejoin','round');
    v.el.setAttribute('pointer-events','stroke');
    v.el.dataset.role='obj'; v.el.dataset.key=obj.key;
    v.el.style.cursor='pointer';
    titreInerte(v.el, 'Double-clic : reculer cet objet dans la superposition');
    // Point de vue : point (position) + vecteur (direction), pas un chemin qu'on arpente - le
    // premier point porte un marqueur rond permanent (visible meme non selectionne), le second
    // une pointe de fleche nativement orientee sur le trait (marker-end + orient="auto").
    if(obj.fonction === 'camera'){ v.el.setAttribute('marker-end', 'url(#flecheVue)'); }
    // Limite cadastrale interne a une propriete fusionnee : elle n'est plus une limite de
    // terrain, seulement un reperage. Le pointille dit exactement cela, et la distingue au
    // premier coup d'oeil du contour plein de la parcelle.
    if(obj.fonction === 'limite'){ v.el.setAttribute('stroke-dasharray', '10 7'); }
    racine.appendChild(v.el);
    if(obj.fonction === 'camera'){
      v.camMarkerEl = creerSvg('circle');
      v.camMarkerEl.setAttribute('r','7'); v.camMarkerEl.setAttribute('fill',obj.fill);
      v.camMarkerEl.setAttribute('stroke',obj.stroke); v.camMarkerEl.setAttribute('stroke-width','2');
      v.camMarkerEl.style.pointerEvents = 'none';
      racine.appendChild(v.camMarkerEl);
    }
  } else {
    v.el = creerSvg('circle');
    v.el.setAttribute('fill',obj.fill); v.el.setAttribute('fill-opacity',String(obj.fillOpacity));
    v.el.setAttribute('stroke',obj.stroke); v.el.setAttribute('stroke-width','0.08');
    v.el.setAttribute('pointer-events','all');
    v.el.dataset.role='obj'; v.el.dataset.key=obj.key;
    v.el.style.cursor='pointer';
    titreInerte(v.el, 'Double-clic : reculer cet objet dans la superposition');
    racine.appendChild(v.el);
  }
  v.nameEl = creerSvg('text');
  v.nameEl.setAttribute('text-anchor','middle');
  v.nameEl.setAttribute('font-family','Helvetica Neue, Arial, sans-serif');
  v.nameEl.setAttribute('font-weight','700');
  v.nameEl.setAttribute('paint-order','stroke');
  v.nameEl.setAttribute('stroke',SVG_LABEL_HALO); v.nameEl.setAttribute('stroke-width','3');
  v.nameEl.setAttribute('fill', obj.stroke);
  v.nameEl.style.pointerEvents = 'none';
  racine.appendChild(v.nameEl);
  v.pointEls = []; v.ptLabelEls = []; v.edgeEls = []; v.segLabelEls = [];
  v.radiusHandle = null;
}

export function reconstruirePoignees(obj: ObjetPlan, ctx: ContextePoignees): void {
  const v = vue(obj);
  const racine = ctx.racine;
  v.pointEls.forEach(e=>e.remove()); v.ptLabelEls.forEach(e=>e.remove());
  v.edgeEls.forEach(e=>e.remove()); v.segLabelEls.forEach(e=>e.remove());
  v.pointEls=[]; v.ptLabelEls=[]; v.edgeEls=[]; v.segLabelEls=[];
  if(v.radiusHandle){ v.radiusHandle.remove(); v.radiusHandle=null; }

  if(obj.type==='polygon' || obj.type==='path'){
    const n = obj.pts.length;
    const edgeCount = obj.type==='path' ? Math.max(0,n-1) : n;
    for(let i=0;i<edgeCount;i++){
      const el=creerSvg('line');
      el.setAttribute('stroke','rgba(0,0,0,0.001)'); el.setAttribute('stroke-width','16');
      el.setAttribute('pointer-events','all'); el.style.cursor='ew-resize'; titreInerte(el, 'Modifier ce cote (glisser = deplacer, double-clic = ajouter un point)');
      el.dataset.role='edge'; el.dataset.key=obj.key; el.dataset.index=String(i);
      // Le double-clic est delegue : ce module ne sait pas quel objet est selectionne,
      // ni comment passer des pixels aux metres.
      el.addEventListener('dblclick', (ev) => {
        if (ctx.surDoubleClicCote) ctx.surDoubleClicCote(obj, i, ev);
      });
      racine.appendChild(el); v.edgeEls.push(el);

      const sl=creerSvg('text');
      sl.setAttribute('text-anchor','middle'); sl.setAttribute('font-family','Helvetica Neue, Arial, sans-serif');
      sl.setAttribute('font-size','11'); sl.setAttribute('font-weight','700'); sl.setAttribute('fill',SVG_INK);
      sl.setAttribute('paint-order','stroke'); sl.setAttribute('stroke',SVG_LABEL_HALO); sl.setAttribute('stroke-width','3');
      sl.style.pointerEvents = 'none';
      racine.appendChild(sl); v.segLabelEls.push(sl);
    }
    for(let i=0;i<n;i++){
      const c=creerSvg('circle');
      c.setAttribute('r',String(6.5)); c.setAttribute('fill','#fff'); c.setAttribute('stroke',obj.stroke); c.setAttribute('stroke-width','2');
      c.setAttribute('pointer-events','all'); c.style.cursor='crosshair'; titreInerte(c, 'Modifier ce coin (glisser = deplacer, double-clic = figer/degeler)');
      c.dataset.role='point'; c.dataset.key=obj.key; c.dataset.index=String(i);
      racine.appendChild(c); v.pointEls.push(c);

      const lb=creerSvg('text');
      lb.setAttribute('font-family','Helvetica Neue, Arial, sans-serif'); lb.setAttribute('font-size','10'); lb.setAttribute('fill','#333'); lb.setAttribute('font-weight','700');
      lb.style.pointerEvents = 'none';
      racine.appendChild(lb); v.ptLabelEls.push(lb);
    }
  } else {
    const rh=creerSvg('circle');
    rh.setAttribute('r',String(6)); rh.setAttribute('fill','#fff'); rh.setAttribute('stroke',obj.stroke); rh.setAttribute('stroke-width','2');
    rh.setAttribute('pointer-events','all'); rh.style.cursor='ew-resize';
    rh.dataset.role='radius'; rh.dataset.key=obj.key;
    racine.appendChild(rh); v.radiusHandle = rh;
  }
}

/** Ce que positionner un objet demande de savoir, en plus de l'objet lui-meme. */
export interface ContextePositionnement {
  scene: EtatScene;
  /** L'objet est-il celui qu'on edite ? Change l'epaisseur du trait et l'affichage des poignees. */
  selectionnee: boolean;
  /** Objet masque : rien ne se dessine, poignees comprises. */
  masque: boolean;
  /** Fond orthophoto : la transparence du terrain est appliquee A L'AFFICHAGE, pas dans l'objet. */
  ortho: { actif: boolean; parcelleOpacite: number };
  estTerrain: (obj: ObjetPlan) => boolean;
  /** Un pointage de cote/sommet est en cours : les poignees des AUTRES objets deviennent visibles. */
  pointageSommets: boolean;
  pointageCotes: boolean;
  reconstruirePoignees: (obj: ObjetPlan) => void;
}

/**
 * Place les elements SVG d'un objet a l'ecran : contour, etiquette, poignees, cotes et angles.
 *
 * Cette fonction ne cree rien - `creerDomObjet` l'a fait - et ne decide rien : elle applique a des
 * elements existants ce que disent l'objet, la scene et le contexte. C'est le corps de la boucle
 * de `render()`, sorti tel quel.
 */
export function positionnerObjet(obj: ObjetPlan, ctx: ContextePositionnement): void {
  const v = vue(obj);

    // Masque : rien de cet objet ne se dessine, y compris ses poignees s'il se trouve etre
    // l'objet selectionne - un contour invisible avec des coins bien visibles serait plus
    // deroutant qu'utile. Il reste choisissable depuis la barre laterale pour le demasquer.
    if(ctx.masque){
      v.el.style.display = 'none';
      v.nameEl.style.display = 'none';
      if(v.camMarkerEl) v.camMarkerEl.style.display = 'none';
      v.pointEls.forEach(e=>e.style.display='none');
      v.ptLabelEls.forEach(e=>e.style.display='none');
      v.edgeEls.forEach(e=>e.style.display='none');
      v.segLabelEls.forEach(e=>e.style.display='none');
      if(v.radiusHandle) v.radiusHandle.style.display='none';
      return;
    }
    v.el.style.display = '';
    v.nameEl.style.display = '';
    if(v.camMarkerEl) v.camMarkerEl.style.display = '';

    if(obj.type==='polygon'){
      v.el.setAttribute('points', polyStr(ctx.scene, obj.pts));
    } else if(obj.type==='path'){
      v.el.setAttribute('d', pathD(ctx.scene, obj.pts, !!obj.curve));
      v.el.setAttribute('stroke-width', String(Math.max(1, (obj.width||1)*ctx.scene.scale)));
      if(v.camMarkerEl){
        const p0 = versEcran(ctx.scene, obj.pts[0]);
        v.camMarkerEl.setAttribute('cx', String(p0.x)); v.camMarkerEl.setAttribute('cy', String(p0.y));
      }
    } else {
      const c = versEcran(ctx.scene, obj.center);
      v.el.setAttribute('cx', String(c.x)); v.el.setAttribute('cy', String(c.y)); v.el.setAttribute('r', String(obj.r*ctx.scene.scale));
    }
    if(obj.type!=='path') v.el.setAttribute('stroke-width', String(ctx.selectionnee ? '3' : (obj.type==='circle'?'0.08':'1.8')));
    else v.el.setAttribute('stroke-opacity', ctx.selectionnee ? '1' : '0.85');

    // Avec le fond orthophoto, un terrain rempli a 100 % masque exactement ce qu'on est venu
    // voir. La transparence est appliquee A L'AFFICHAGE, sans toucher au fillOpacity de l'objet :
    // le projet n'est pas modifie, rien a re-enregistrer, et decocher le fond rend au terrain son
    // remplissage d'origine. Le contour, lui, ne bouge pas : c'est lui qui porte l'information.
    if(obj.type==='polygon' && ctx.estTerrain(obj)){
      v.el.setAttribute('fill-opacity', String(ctx.ortho.actif ? ctx.ortho.parcelleOpacite : obj.fillOpacity));
    }

    const cen = obj.type==='polygon' ? centroid(obj.pts) : (obj.type==='path' ? centroid(obj.pts) : obj.center);
    const cs = versEcran(ctx.scene, cen);
    v.nameEl.setAttribute('x', String(cs.x)); v.nameEl.setAttribute('y', String(cs.y));
    v.nameEl.setAttribute('font-size', String(obj.key==='parcelle'||obj.key==='maison' ? 14 : 10));
    v.nameEl.textContent = obj.showName ? obj.name : '';

    if(obj.type==='polygon' || obj.type==='path'){
      const n = obj.pts.length;
      const edgeCount = obj.type==='path' ? Math.max(0,n-1) : n;
      if(v.pointEls.length !== n) ctx.reconstruirePoignees(obj);
      // (const objCenter = cen : variable morte dans le fichier d'origine, retiree - cen est
      // deja calcule au-dessus et utilise pour l'etiquette.)
      for(let i=0;i<n;i++){
        const p = versEcran(ctx.scene, obj.pts[i]);
        v.pointEls[i].setAttribute('cx', String(p.x)); v.pointEls[i].setAttribute('cy', String(p.y));
        const showPtForPick = ctx.pointageSommets;
        v.pointEls[i].style.display = (ctx.selectionnee || showPtForPick) ? '' : 'none';
        const isFrozen = obj.type==='polygon' && obj.frozenVertices && obj.frozenVertices[i];
        v.pointEls[i].setAttribute('fill', isFrozen ? obj.stroke : '#fff');
        v.pointEls[i].setAttribute('r', String(isFrozen ? 7.5 : 6.5));

        // offset vertex label: exterior bisector for closed polygons, simple perpendicular for open paths
        let ext;
        if(obj.type==='polygon'){
          ext = exteriorBisector({ pts: obj.pts }, i);
        } else {
          const nb = obj.pts[Math.min(i+1,n-1)], pb2 = obj.pts[Math.max(i-1,0)];
          const dx = nb.x-pb2.x, dy = nb.y-pb2.y; const L=Math.hypot(dx,dy)||1;
          ext = {x:-dy/L, y:dx/L};
        }
        v.ptLabelEls[i].setAttribute('x', String(p.x + ext.x*13));
        v.ptLabelEls[i].setAttribute('y', String(p.y - ext.y*13 + 3));
        v.ptLabelEls[i].setAttribute('text-anchor','middle');
        const vName = obj.vertexNames[i] || ('P'+(i+1));
        // Un chemin ouvert n'a pas d'interieur : parler de son angle interieur n'aurait pas de sens.
        const showAngleHere = obj.showAngles && obj.type==='polygon';
        // L'angle n'est calcule que s'il doit etre affiche : ce rendu passe sur chaque point de
        // chaque objet a chaque image.
        const angleTxt = showAngleHere ? angleEnDegres(angleInterieurDeg(obj.pts,i), DEGRE_ECRAN) : '';
        const vertTxt = etiquetteComposee(vName, angleTxt, obj.showVertNames, showAngleHere, SEP_ECRAN);
        v.ptLabelEls[i].textContent = vertTxt;
        v.ptLabelEls[i].style.display = vertTxt ? '' : 'none';

        if(i < edgeCount){
          const a=obj.pts[i], b=obj.pts[(i+1)%n];
          const pa=versEcran(ctx.scene, a), pb=versEcran(ctx.scene, b);
          v.edgeEls[i].setAttribute('x1', String(pa.x)); v.edgeEls[i].setAttribute('y1', String(pa.y));
          v.edgeEls[i].setAttribute('x2', String(pb.x)); v.edgeEls[i].setAttribute('y2', String(pb.y));
          const showEdgeForPick = ctx.pointageCotes;
          v.edgeEls[i].style.display = (ctx.selectionnee || showEdgeForPick) ? '' : 'none';
          v.edgeEls[i].style.pointerEvents = (ctx.selectionnee || showEdgeForPick) ? 'all' : 'none';

          const mid = {x:(pa.x+pb.x)/2, y:(pa.y+pb.y)/2};
          v.segLabelEls[i].setAttribute('x', String(mid.x)); v.segLabelEls[i].setAttribute('y', String(mid.y-5));
          const segTxt = etiquetteComposee(
            obj.segmentNames[i], longueurEnMetres(dist(a,b)),
            obj.showSegNames, obj.showDims, SEP_ECRAN
          );
          v.segLabelEls[i].textContent = segTxt;
          v.segLabelEls[i].style.display = segTxt ? '' : 'none';
        }
      }
      v.el.style.cursor = obj.locked ? 'not-allowed' : (ctx.selectionnee ? 'move' : 'pointer');
    } else {
      const rp = versEcran(ctx.scene, {x:obj.center.x+obj.r, y:obj.center.y});
      v.radiusHandle.setAttribute('cx', String(rp.x)); v.radiusHandle.setAttribute('cy', String(rp.y));
      v.radiusHandle.style.display = ctx.selectionnee ? '' : 'none';
      v.el.style.cursor = obj.locked ? 'not-allowed' : (ctx.selectionnee ? 'move' : 'pointer');
    }

}


