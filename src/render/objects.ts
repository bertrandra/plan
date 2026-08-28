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
import type { PtBrut } from '../model/types.js';
import type { EtatScene } from './scene.js';

export interface ObjetPlan {
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
