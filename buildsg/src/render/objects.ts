// Elements SVG d'un objet du plan (spec §3.2, render/objects.ts).
//
// Deux fonctions, deux moments : `creerDomObjet` fabrique la forme et son etiquette une fois pour
// toutes ; `reconstruirePoignees` refait les poignees d'edition, qui changent avec le nombre de
// sommets. Les elements sont ranges dans la carte des vues (render/vues.ts), jamais sur l'objet
// lui-meme - c'est la separation donnee/vue de la §5.2.
//
// La racine SVG est recue en parametre, et le double-clic sur un cote est delegue a l'appelant :
// ce module ne connait ni la selection courante, ni la transformation de la vue.

import { sommetDe } from '../geometry/anneau.js';
import { vue } from './vues.js';
import { creerSvg } from './svg.js';
import { SVG_LABEL_HALO, SVG_POIGNEE, SVG_POIGNEE_FOND, SVG_PASTILLE, SVG_PASTILLE_TEXTE, aLaVirgule } from './theme.js';
import { versEcran } from '../geometry/vue.js';
import { polyStr, pathD } from '../geometry/path.js';
import { centroid, dist, angleInterieurDeg } from '../geometry/basic.js';
import { exteriorBisector } from '../geometry/polygon.js';
import { etiquetteComposee, longueurEnMetres, angleEnDegres, SEP_ECRAN, DEGRE_ECRAN } from '../model/etiquettes.js';
import type { ObjetPlan } from '../model/types.js';
import type { EtatScene } from '../geometry/vue.js';

/**
 * Un objet du plan, tel que le rendu le suppose : posé, donc pourvu de sa forme et de ses couleurs.
 *
 * `ObjetPlan` (model/types.ts) laisse `type`, `fill`, `fillOpacity` et `stroke` facultatifs — c'est
 * le chantier du durcissement (spec §12), pas de la migration : trois formes cohabitent sous une
 * seule interface tant qu'un type discriminé ne les sépare pas. Ce module, lui, ne s'exécute que sur
 * des objets déjà insérés dans le plan par `creation.ts` ou `normalisation.ts`, qui posent toujours
 * ces quatre champs. `Required<Pick<...>>` dit cette garantie sans la dupliquer : le reste de la
 * forme reste celui du modèle.
 *
 * Ce fichier déclarait auparavant sa propre interface `ObjetPlan`, homonyme et incompatible de celle
 * du modèle — la même erreur que `render/measures.ts` et `render/parasolOverlay.ts` avaient déjà
 * montrée pendant la phase 7.
 */
export type ObjetRendu = ObjetPlan & Required<Pick<ObjetPlan, 'type' | 'fill' | 'fillOpacity' | 'stroke'>>;

export interface ContextePoignees {
  racine: SVGElement;
  /**
   * Double-clic sur un cote. L'appelant decide quoi en faire (inserer un point) : lui seul sait
   * si l'objet est selectionne et comment convertir des pixels en metres.
   */
  surDoubleClicCote?: (obj: ObjetRendu, index: number, ev: MouseEvent) => void;
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
  if (el) Object.assign(el, { title: texte });
}


export function creerDomObjet(racine: SVGElement, obj: ObjetRendu, scene: EtatScene): void {
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

export function reconstruirePoignees(obj: ObjetRendu, ctx: ContextePoignees): void {
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
      // Une pastille d'encre, texte clair (maquette) : le trait epais aux jointures rondes, peint sous
      // le texte, dessine le fond arrondi sans element de plus.
      sl.setAttribute('font-size','11'); sl.setAttribute('font-weight','700'); sl.setAttribute('fill',SVG_PASTILLE_TEXTE);
      sl.setAttribute('paint-order','stroke'); sl.setAttribute('stroke',SVG_PASTILLE); sl.setAttribute('stroke-width','12');
      sl.setAttribute('stroke-linejoin','round'); sl.setAttribute('stroke-linecap','round'); sl.setAttribute('dominant-baseline','middle');
      sl.style.pointerEvents = 'none';
      racine.appendChild(sl); v.segLabelEls.push(sl);
    }
    for(let i=0;i<n;i++){
      const c=creerSvg('circle');
      c.setAttribute('r',String(6.5)); c.setAttribute('fill',SVG_POIGNEE_FOND); c.setAttribute('stroke',SVG_POIGNEE); c.setAttribute('stroke-width','2.5');
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
    rh.setAttribute('r',String(6)); rh.setAttribute('fill',SVG_POIGNEE_FOND); rh.setAttribute('stroke',SVG_POIGNEE); rh.setAttribute('stroke-width','2.5');
    rh.setAttribute('pointer-events','all'); rh.style.cursor='ew-resize';
    rh.dataset.role='radius'; rh.dataset.key=obj.key;
    racine.appendChild(rh); v.radiusHandle = rh;
  }
}

/** Le remplissage d'une terrasse isolee : assez pour la situer, assez peu pour voir sa structure. */
export const OPACITE_ISOLEMENT = 0.2;

/** Ce que positionner un objet demande de savoir, en plus de l'objet lui-meme. */
export interface ContextePositionnement {
  scene: EtatScene;
  /** L'objet est-il celui qu'on edite ? Change l'epaisseur du trait et l'affichage des poignees. */
  selectionnee: boolean;
  /** Objet masque : rien ne se dessine, poignees comprises. */
  masque: boolean;
  /** La terrasse isolee se dessine en transparence, pour laisser voir sa structure (app/isolement.ts). */
  transparent?: boolean;
  /** Fond orthophoto : la transparence du terrain est appliquee A L'AFFICHAGE, pas dans l'objet. */
  ortho: { actif: boolean; parcelleOpacite: number };
  estTerrain: (obj: ObjetRendu) => boolean;
  /** Un pointage de cote/sommet est en cours : les poignees des AUTRES objets deviennent visibles. */
  pointageSommets: boolean;
  pointageCotes: boolean;
  reconstruirePoignees: (obj: ObjetRendu) => void;
}

/**
 * Place les elements SVG d'un objet a l'ecran : contour, etiquette, poignees, cotes et angles.
 *
 * Cette fonction ne cree rien - `creerDomObjet` l'a fait - et ne decide rien : elle applique a des
 * elements existants ce que disent l'objet, la scene et le contexte. C'est le corps de la boucle
 * de `render()`, sorti tel quel.
 */
export function positionnerObjet(obj: ObjetRendu, ctx: ContextePositionnement): void {
  const v = vue(obj);
  // `creerDomObjet` pose le contour et le nom avant tout rendu : une vue qui ne les a pas encore n'a
  // rien a placer.
  const { el, nameEl } = v;
  if(!el || !nameEl) return;
  // Le halo suit les encres du plan, qui peuvent changer apres la creation (render/theme.ts).
  nameEl.setAttribute('stroke', SVG_LABEL_HALO);

    // Masque : rien de cet objet ne se dessine, y compris ses poignees s'il se trouve etre
    // l'objet selectionne - un contour invisible avec des coins bien visibles serait plus
    // deroutant qu'utile. Il reste choisissable depuis la barre laterale pour le demasquer.
    if(ctx.masque){
      el.style.display = 'none';
      nameEl.style.display = 'none';
      if(v.camMarkerEl) v.camMarkerEl.style.display = 'none';
      v.pointEls.forEach(e=>e.style.display='none');
      v.ptLabelEls.forEach(e=>e.style.display='none');
      v.edgeEls.forEach(e=>e.style.display='none');
      v.segLabelEls.forEach(e=>e.style.display='none');
      if(v.radiusHandle) v.radiusHandle.style.display='none';
      return;
    }
    el.style.display = '';
    nameEl.style.display = '';
    if(v.camMarkerEl) v.camMarkerEl.style.display = '';

    if(obj.type==='polygon'){
      el.setAttribute('points', polyStr(ctx.scene, obj.pts));
    } else if(obj.type==='path'){
      el.setAttribute('d', pathD(ctx.scene, obj.pts, !!obj.curve));
      el.setAttribute('stroke-width', String(Math.max(1, (obj.width||1)*ctx.scene.scale)));
      if(v.camMarkerEl){
        const p0 = versEcran(ctx.scene, sommetDe(obj.pts, 0));
        v.camMarkerEl.setAttribute('cx', String(p0.x)); v.camMarkerEl.setAttribute('cy', String(p0.y));
      }
    } else {
      const c = versEcran(ctx.scene, obj.center);
      el.setAttribute('cx', String(c.x)); el.setAttribute('cy', String(c.y)); el.setAttribute('r', String(obj.r*ctx.scene.scale));
    }
    if(obj.type!=='path') el.setAttribute('stroke-width', String(ctx.selectionnee ? '3' : (obj.type==='circle'?'0.08':'1.8')));
    else el.setAttribute('stroke-opacity', ctx.selectionnee ? '1' : '0.85');

    // Avec le fond orthophoto, un terrain rempli a 100 % masque exactement ce qu'on est venu
    // voir. La transparence est appliquee A L'AFFICHAGE, sans toucher au fillOpacity de l'objet :
    // le projet n'est pas modifie, rien a re-enregistrer, et decocher le fond rend au terrain son
    // remplissage d'origine. Le contour, lui, ne bouge pas : c'est lui qui porte l'information.
    if(obj.type==='polygon' && ctx.estTerrain(obj)){
      el.setAttribute('fill-opacity', String(ctx.ortho.actif ? ctx.ortho.parcelleOpacite : obj.fillOpacity));
    } else if(obj.type==='polygon'){
      // Meme regle pour la terrasse isolee : transparente A L'AFFICHAGE, son fillOpacity intact.
      el.setAttribute('fill-opacity', String(ctx.transparent ? OPACITE_ISOLEMENT : obj.fillOpacity));
    }

    const cen = obj.type==='polygon' ? centroid(obj.pts) : (obj.type==='path' ? centroid(obj.pts) : obj.center);
    const cs = versEcran(ctx.scene, cen);
    nameEl.setAttribute('x', String(cs.x)); nameEl.setAttribute('y', String(cs.y));
    nameEl.setAttribute('font-size', String(obj.key==='parcelle'||obj.key==='maison' ? 14 : 10));
    nameEl.textContent = obj.showName ? obj.name : '';

    if(obj.type==='polygon' || obj.type==='path'){
      const n = obj.pts.length;
      const edgeCount = obj.type==='path' ? Math.max(0,n-1) : n;
      if(v.pointEls.length !== n) ctx.reconstruirePoignees(obj);
      // (const objCenter = cen : variable morte dans le fichier d'origine, retiree - cen est
      // deja calcule au-dessus et utilise pour l'etiquette.)
      obj.pts.forEach((pt, i) => {
        // Reconstruites juste au-dessus si leur nombre ne suivait plus celui des sommets.
        const poignee = v.pointEls[i], etiquette = v.ptLabelEls[i];
        if(!poignee || !etiquette) return;
        const p = versEcran(ctx.scene, pt);
        poignee.setAttribute('cx', String(p.x)); poignee.setAttribute('cy', String(p.y));
        const showPtForPick = ctx.pointageSommets;
        poignee.style.display = (ctx.selectionnee || showPtForPick) ? '' : 'none';
        const isFrozen = obj.type==='polygon' && obj.frozenVertices && obj.frozenVertices[i];
        poignee.setAttribute('fill', isFrozen ? SVG_POIGNEE : SVG_POIGNEE_FOND);
        poignee.setAttribute('r', String(isFrozen ? 7.5 : 6.5));

        // offset vertex label: exterior bisector for closed polygons, simple perpendicular for open paths
        let ext;
        if(obj.type==='polygon'){
          ext = exteriorBisector({ pts: obj.pts }, i);
        } else {
          const nb = sommetDe(obj.pts, Math.min(i+1,n-1)), pb2 = sommetDe(obj.pts, Math.max(i-1,0));
          const dx = nb.x-pb2.x, dy = nb.y-pb2.y; const L=Math.hypot(dx,dy)||1;
          ext = {x:-dy/L, y:dx/L};
        }
        etiquette.setAttribute('x', String(p.x + ext.x*13));
        etiquette.setAttribute('y', String(p.y - ext.y*13 + 3));
        etiquette.setAttribute('text-anchor','middle');
        const vName = obj.vertexNames?.[i] || ('P'+(i+1));
        // Un chemin ouvert n'a pas d'interieur : parler de son angle interieur n'aurait pas de sens.
        const showAngleHere = obj.showAngles && obj.type==='polygon';
        // L'angle n'est calcule que s'il doit etre affiche : ce rendu passe sur chaque point de
        // chaque objet a chaque image.
        const angleTxt = showAngleHere ? angleEnDegres(angleInterieurDeg(obj.pts,i), DEGRE_ECRAN) : '';
        const vertTxt = etiquetteComposee(vName, angleTxt, obj.showVertNames, showAngleHere, SEP_ECRAN);
        etiquette.textContent = aLaVirgule(vertTxt);
        etiquette.style.display = vertTxt ? '' : 'none';

        const cote = v.edgeEls[i], etiquetteCote = v.segLabelEls[i];
        if(i < edgeCount && cote && etiquetteCote){
          const a=pt, b=sommetDe(obj.pts, i+1);
          const pa=versEcran(ctx.scene, a), pb=versEcran(ctx.scene, b);
          cote.setAttribute('x1', String(pa.x)); cote.setAttribute('y1', String(pa.y));
          cote.setAttribute('x2', String(pb.x)); cote.setAttribute('y2', String(pb.y));
          const showEdgeForPick = ctx.pointageCotes;
          cote.style.display = (ctx.selectionnee || showEdgeForPick) ? '' : 'none';
          cote.style.pointerEvents = (ctx.selectionnee || showEdgeForPick) ? 'all' : 'none';

          const mid = {x:(pa.x+pb.x)/2, y:(pa.y+pb.y)/2};
          etiquetteCote.setAttribute('x', String(mid.x)); etiquetteCote.setAttribute('y', String(mid.y));
          const segTxt = etiquetteComposee(
            obj.segmentNames?.[i] ?? '', longueurEnMetres(dist(a,b)),
            obj.showSegNames, obj.showDims, SEP_ECRAN
          );
          etiquetteCote.textContent = aLaVirgule(segTxt);
          // Une pastille plus longue que son cote a l'ecran chevauche ses voisines et ne se lit plus :
          // elle attend qu'on zoome (Ajuster, pincer). La largeur se compte a ~6,5 px par caractere.
          const tropCourt = Math.hypot(pb.x-pa.x, pb.y-pa.y) < segTxt.length*6.5 + 12;
          etiquetteCote.style.display = segTxt && !tropCourt ? '' : 'none';
        }
      });
      el.style.cursor = obj.locked ? 'not-allowed' : (ctx.selectionnee ? 'move' : 'pointer');
    } else {
      const rp = versEcran(ctx.scene, {x:obj.center.x+obj.r, y:obj.center.y});
      if(v.radiusHandle){
        v.radiusHandle.setAttribute('cx', String(rp.x)); v.radiusHandle.setAttribute('cy', String(rp.y));
        v.radiusHandle.style.display = ctx.selectionnee ? '' : 'none';
      }
      el.style.cursor = obj.locked ? 'not-allowed' : (ctx.selectionnee ? 'move' : 'pointer');
    }

}


