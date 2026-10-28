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
import type { ObjetPlan, PtBrut } from '../model/types.js';
import { largeurChemin } from '../model/ouvrages/index.js';
import { traceAuPlan } from './ouvrages/index.js';
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
    v.el.setAttribute('stroke',obj.stroke); v.el.setAttribute('stroke-width', String(largeurChemin(obj)*scene.scale));
    v.el.setAttribute('stroke-linecap','butt'); v.el.setAttribute('stroke-linejoin','round');
    v.el.setAttribute('pointer-events','stroke');
    v.el.dataset.role='obj'; v.el.dataset.key=obj.key;
    v.el.style.cursor='pointer';
    titreInerte(v.el, 'Double-clic : reculer cet objet dans la superposition');
    // L'habit du trace vient du registre du plan : la fleche et le marqueur d'un point de vue, le pointille d'une limite interne.
    const habit = traceAuPlan(obj.fonction);
    if(habit.pointDeVue){ v.el.setAttribute('marker-end', 'url(#flecheVue)'); }
    if(habit.pointille){ v.el.setAttribute('stroke-dasharray', habit.pointille); }
    racine.appendChild(v.el);
    if(habit.pointDeVue){
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
  v.sommetsCaches = false;
}

export function reconstruirePoignees(obj: ObjetRendu, ctx: ContextePoignees): void {
  const v = vue(obj);
  const racine = ctx.racine;
  v.pointEls.forEach(e=>e.remove()); v.ptLabelEls.forEach(e=>e.remove());
  v.edgeEls.forEach(e=>e.remove()); v.segLabelEls.forEach(e=>e.remove());
  v.pointEls=[]; v.ptLabelEls=[]; v.edgeEls=[]; v.segLabelEls=[];
  v.sommetsCaches = false;
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

/**
 * Perce le contour d'une terrasse de ses trous. Un `<polygon>` ne peut pas avoir de trou : il est
 * tondu par un gabarit pair-impair (un tres grand rectangle et les anneaux des trous), qui retire
 * son remplissage et son trait la ou est le trou. Sans trou, le gabarit est retire : l'element est
 * exactement celui d'avant.
 */
function percerContour(v: ReturnType<typeof vue>, el: SVGElement, cle: string, trous: PtBrut[][], scene: EtatScene): void {
  if (!trous.length) {
    if (el.hasAttribute('clip-path')) el.removeAttribute('clip-path');
    if (v.clipEl) { v.clipEl.remove(); v.clipEl = null; }
    return;
  }
  const id = 'trous-' + cle.replace(/[^A-Za-z0-9_-]/g, '_');
  if (!v.clipEl) {
    v.clipEl = creerSvg('clipPath');
    v.clipEl.setAttribute('id', id);
    v.clipEl.appendChild(creerSvg('path'));
    el.parentNode?.insertBefore(v.clipEl, el);
  }
  const chemin = v.clipEl.firstChild as SVGElement | null;
  if (!chemin) return;
  const anneau = (pts: PtBrut[]) => pts.map((p, i) => { const e = versEcran(scene, p); return (i ? 'L' : 'M') + e.x.toFixed(1) + ' ' + e.y.toFixed(1); }).join(' ') + ' Z';
  chemin.setAttribute('clip-rule', 'evenodd');
  chemin.setAttribute('d', 'M-100000 -100000 H100000 V100000 H-100000 Z ' + trous.map(anneau).join(' '));
  el.setAttribute('clip-path', 'url(#' + id + ')');
}

// Un rendu repose chaque attribut de chaque objet, le plus souvent a l'identique : chaque element garde ce qui lui a ete ecrit, et une
// valeur egale ne repasse pas par le DOM (feuille de route, etape 2.2 ; au telephone, ces ecritures pesaient autant que les calculs).
// Seul ce module ecrit ces attributs sur les elements d'un objet ; un element recree (creerDomObjet, reconstruirePoignees) repart
// sans memoire, et sa premiere valeur s'ecrit.
const ecrits = new WeakMap<Element, Record<string, string>>();
function poser(e: Element, nom: string, valeur: string): void {
  let m = ecrits.get(e);
  if (!m) { m = {}; ecrits.set(e, m); }
  if (m[nom] === valeur) return;
  verification?.(nom);
  m[nom] = valeur;
  e.setAttribute(nom, valeur);
}
function texte(e: Element, valeur: string): void {
  if (e.textContent === valeur) return;
  verification?.('texte');
  e.textContent = valeur;
}

// La verification des cles de version (render/pipeline.ts) : un objet dont la cle n'a pas bouge est repositionne quand meme, et
// chaque valeur qui change le dit. Hors verification, rien.
let verification: ((attribut: string) => void) | null = null;

/** Repositionne un objet que sa cle disait inchange, en signalant chaque attribut qui change pourtant. */
export function positionnerEnVerifiant(obj: ObjetRendu, ctx: ContextePositionnement, signaler: (attribut: string) => void): void {
  verification = signaler;
  try { positionnerObjet(obj, ctx); } finally { verification = null; }
}

/** Cache un element s'il ne l'est pas deja : lire le style coute moins que l'ecrire. */
function cacher(e: SVGElement): void {
  if(e.style.display !== 'none') e.style.display = 'none';
}

/** Les poignees, etiquettes et cotes d'un objet, caches ; les cotes ne captent plus le pointeur. */
function cacherSommets(v: ReturnType<typeof vue>): void {
  // Un plan de voisinage a des milliers de sommets caches : les relire tous a chaque rendu coutait
  // autant que de placer les objets visibles, au telephone (banc de rendu, octobre 2026).
  if(v.sommetsCaches) return;
  v.sommetsCaches = true;
  v.pointEls.forEach(cacher);
  v.ptLabelEls.forEach(cacher);
  v.segLabelEls.forEach(cacher);
  v.edgeEls.forEach((e) => { cacher(e); if(e.style.pointerEvents !== 'none') e.style.pointerEvents = 'none'; });
}

/** La marge autour de la vue, en part de sa taille : un objet qui y entre est deja place. */
const MARGE_VUE = 0.1;

/** L'objet est-il entierement hors de la vue (marge comprise) ? Calcule sur son emprise, dans le repere du plan. */
export function horsDeLaVue(obj: ObjetRendu, scene: EtatScene): boolean {
  const s = scene.scale;
  if(!(s > 0) || !scene.W || !scene.H) return false;
  const mx = scene.W * MARGE_VUE / s, my = scene.H * MARGE_VUE / s;
  const x0 = -scene.origine.x / s - mx, x1 = (scene.W - scene.origine.x) / s + mx;
  const y0 = (scene.origine.y - scene.H) / s - my, y1 = scene.origine.y / s + my;
  let ox0: number, ox1: number, oy0: number, oy1: number;
  if(obj.type === 'circle'){
    ox0 = obj.center.x - obj.r; ox1 = obj.center.x + obj.r; oy0 = obj.center.y - obj.r; oy1 = obj.center.y + obj.r;
  } else {
    if(!obj.pts.length) return false;
    ox0 = Infinity; ox1 = -Infinity; oy0 = Infinity; oy1 = -Infinity;
    for(const p of obj.pts){ ox0 = Math.min(ox0, p.x); ox1 = Math.max(ox1, p.x); oy0 = Math.min(oy0, p.y); oy1 = Math.max(oy1, p.y); }
  }
  return ox1 < x0 || ox0 > x1 || oy1 < y0 || oy0 > y1;
}

/**
 * Place les poignees, etiquettes, cotes et pastilles des sommets d'un contour ou d'un chemin, et les
 * montre ou les cache selon la selection, le pointage et ce que l'objet demande d'afficher.
 */
function placerSommets(obj: ObjetRendu & { pts: PtBrut[] }, v: ReturnType<typeof vue>, el: SVGElement, ctx: ContextePositionnement): void {
  const n = obj.pts.length;
  const edgeCount = obj.type==='path' ? Math.max(0,n-1) : n;
  if(v.pointEls.length !== n) ctx.reconstruirePoignees(obj);
  v.sommetsCaches = false;
  // (const objCenter = cen : variable morte dans le fichier d'origine, retiree - cen est
  // deja calcule au-dessus et utilise pour l'etiquette.)
  obj.pts.forEach((pt, i) => {
    // Reconstruites juste au-dessus si leur nombre ne suivait plus celui des sommets.
    const poignee = v.pointEls[i], etiquette = v.ptLabelEls[i];
    if(!poignee || !etiquette) return;
    const p = versEcran(ctx.scene, pt);
    poser(poignee, 'cx', String(p.x)); poser(poignee, 'cy', String(p.y));
    const showPtForPick = ctx.pointageSommets;
    poignee.style.display = (ctx.selectionnee || showPtForPick) ? '' : 'none';
    const isFrozen = obj.type==='polygon' && obj.frozenVertices && obj.frozenVertices[i];
    poser(poignee, 'fill', isFrozen ? SVG_POIGNEE : SVG_POIGNEE_FOND);
    poser(poignee, 'r', String(isFrozen ? 7.5 : 6.5));

    // offset vertex label: exterior bisector for closed polygons, simple perpendicular for open paths
    let ext;
    if(obj.type==='polygon'){
      ext = exteriorBisector({ pts: obj.pts }, i);
    } else {
      const nb = sommetDe(obj.pts, Math.min(i+1,n-1)), pb2 = sommetDe(obj.pts, Math.max(i-1,0));
      const dx = nb.x-pb2.x, dy = nb.y-pb2.y; const L=Math.hypot(dx,dy)||1;
      ext = {x:-dy/L, y:dx/L};
    }
    poser(etiquette, 'x', String(p.x + ext.x*13));
    poser(etiquette, 'y', String(p.y - ext.y*13 + 3));
    poser(etiquette, 'text-anchor','middle');
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
      poser(cote, 'x1', String(pa.x)); poser(cote, 'y1', String(pa.y));
      poser(cote, 'x2', String(pb.x)); poser(cote, 'y2', String(pb.y));
      const showEdgeForPick = ctx.pointageCotes;
      cote.style.display = (ctx.selectionnee || showEdgeForPick) ? '' : 'none';
      cote.style.pointerEvents = (ctx.selectionnee || showEdgeForPick) ? 'all' : 'none';

      const mid = {x:(pa.x+pb.x)/2, y:(pa.y+pb.y)/2};
      poser(etiquetteCote, 'x', String(mid.x)); poser(etiquetteCote, 'y', String(mid.y));
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
}

/** Ce que positionner un objet demande de savoir, en plus de l'objet lui-meme. */
export interface ContextePositionnement {
  scene: EtatScene;
  /** L'objet est-il celui qu'on edite ? Change l'epaisseur du trait et l'affichage des poignees. */
  selectionnee: boolean;
  /** Objet masque : rien ne se dessine, poignees comprises. */
  masque: boolean;
  /** Les trous d'une terrasse (bassin, trou), en anneaux interieurs : le contour en est perce. */
  trous?: PtBrut[][];
  /** La terrasse isolee se dessine en transparence, pour laisser voir sa structure (app/isolement.ts). */
  transparent?: boolean;
  /** Fond orthophoto : la transparence du terrain est appliquee A L'AFFICHAGE, pas dans l'objet. */
  ortho: { actif: boolean; parcelleOpacite: number };
  estTerrain: (obj: ObjetRendu) => boolean;
  /** Un pointage de cote/sommet est en cours : les poignees des AUTRES objets deviennent visibles. */
  pointageSommets: boolean;
  pointageCotes: boolean;
  reconstruirePoignees: (obj: ObjetRendu) => void;
  /** Un mode de diagnostic (app/diagnostic.ts) : la couleur d'affichage qui remplace la sienne, sans la toucher. */
  couleurDiagnostic?: string | null;
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
  poser(nameEl, 'stroke', SVG_LABEL_HALO);

    // Masque : rien de cet objet ne se dessine, y compris ses poignees s'il se trouve etre
    // l'objet selectionne - un contour invisible avec des coins bien visibles serait plus
    // deroutant qu'utile. Il reste choisissable depuis la barre laterale pour le demasquer.
    // Hors de la vue (et pas selectionne) : rien ne se dessine non plus, sans rien recalculer ; il
    // reprend sa place des qu'il revient dans la vue. Un voisinage d'un kilometre zoome sur la
    // parcelle n'a que quelques dizaines d'objets a placer, au lieu de 9 000.
    if(!ctx.masque && !ctx.selectionnee && horsDeLaVue(obj, ctx.scene)){
      cacher(el); cacher(nameEl); if(v.camMarkerEl) cacher(v.camMarkerEl); if(v.radiusHandle) cacher(v.radiusHandle);
      cacherSommets(v);
      return;
    }
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
      poser(el, 'points', polyStr(ctx.scene, obj.pts));
      percerContour(v, el, obj.key, ctx.trous ?? [], ctx.scene);
    } else if(obj.type==='path'){
      poser(el, 'd', pathD(ctx.scene, obj.pts, !!obj.curve));
      poser(el, 'stroke-width', String(Math.max(1, largeurChemin(obj)*ctx.scene.scale)));
      if(v.camMarkerEl){
        const p0 = versEcran(ctx.scene, sommetDe(obj.pts, 0));
        poser(v.camMarkerEl, 'cx', String(p0.x)); poser(v.camMarkerEl, 'cy', String(p0.y));
      }
    } else {
      const c = versEcran(ctx.scene, obj.center);
      poser(el, 'cx', String(c.x)); poser(el, 'cy', String(c.y)); poser(el, 'r', String(obj.r*ctx.scene.scale));
    }
    if(obj.type!=='path') poser(el, 'stroke-width', String(ctx.selectionnee ? '3' : (obj.type==='circle'?'0.08':'1.8')));
    else poser(el, 'stroke-opacity', ctx.selectionnee ? '1' : '0.85');

    // Avec le fond orthophoto, un terrain rempli a 100 % masque exactement ce qu'on est venu
    // voir. La transparence est appliquee A L'AFFICHAGE, sans toucher au fillOpacity de l'objet :
    // le projet n'est pas modifie, rien a re-enregistrer, et decocher le fond rend au terrain son
    // remplissage d'origine. Le contour, lui, ne bouge pas : c'est lui qui porte l'information.
    if(obj.type==='polygon' && ctx.estTerrain(obj)){
      poser(el, 'fill-opacity', String(ctx.ortho.actif ? ctx.ortho.parcelleOpacite : obj.fillOpacity));
    } else if(obj.type==='polygon'){
      // Meme regle pour la terrasse isolee : transparente A L'AFFICHAGE, son fillOpacity intact.
      poser(el, 'fill-opacity', String(ctx.transparent ? OPACITE_ISOLEMENT : obj.fillOpacity));
    }
    // Le diagnostic peint par-dessus la couleur de l'objet, a l'affichage seulement ; hors diagnostic,
    // la sienne revient (elle n'est posee qu'a la creation de l'element).
    if(obj.type==='polygon' && ctx.couleurDiagnostic){
      poser(el, 'fill', ctx.couleurDiagnostic);
      poser(el, 'fill-opacity', '0.85');
    } else if(obj.type==='polygon' && el.getAttribute('fill') !== obj.fill){
      poser(el, 'fill', obj.fill);
    }

    const cen = obj.type==='polygon' ? centroid(obj.pts) : (obj.type==='path' ? centroid(obj.pts) : obj.center);
    const cs = versEcran(ctx.scene, cen);
    poser(nameEl, 'x', String(cs.x)); poser(nameEl, 'y', String(cs.y));
    poser(nameEl, 'font-size', String(obj.key==='parcelle'||obj.key==='maison' ? 14 : 10));
    texte(nameEl, obj.showName ? obj.name : '');

    // Rien des sommets ne se voit (ni selection, ni pointage, ni noms, angles ou cotes) : on les cache
    // une fois et on ne les place pas. C'etait l'essentiel d'un rendu de voisinage : dix attributs par
    // sommet de chaque batiment, pour des elements invisibles (profil d'octobre 2026).
    const sommetsUtiles = ctx.selectionnee || ctx.pointageSommets || ctx.pointageCotes
      || !!obj.showVertNames || !!obj.showAngles || !!obj.showSegNames || !!obj.showDims;
    if((obj.type==='polygon' || obj.type==='path') && !sommetsUtiles){
      cacherSommets(v);
      el.style.cursor = obj.locked ? 'not-allowed' : 'pointer';
    } else if(obj.type==='polygon' || obj.type==='path'){
      placerSommets(obj, v, el, ctx);
    } else {
      const rp = versEcran(ctx.scene, {x:obj.center.x+obj.r, y:obj.center.y});
      if(v.radiusHandle){
        poser(v.radiusHandle, 'cx', String(rp.x)); poser(v.radiusHandle, 'cy', String(rp.y));
        v.radiusHandle.style.display = ctx.selectionnee ? '' : 'none';
      }
      el.style.cursor = obj.locked ? 'not-allowed' : (ctx.selectionnee ? 'move' : 'pointer');
    }

}


