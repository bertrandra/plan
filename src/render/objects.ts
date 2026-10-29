// Elements SVG d'un objet du plan (spec §3.2, render/objects.ts).
//
// Deux fonctions, deux moments : `creerDomObjet` fabrique la forme et son etiquette une fois pour
// toutes ; `reconstruirePoignees` refait les poignees d'edition, qui changent avec le nombre de
// sommets. Les elements sont ranges dans la carte des vues (render/vues.ts), jamais sur l'objet
// lui-meme - c'est la separation donnee/vue de la §5.2.
//
// La racine SVG est recue en parametre, et le double-clic sur un cote est delegue a l'appelant :
// ce module ne connait ni la selection courante, ni la transformation de la vue.
//
// Le zoom (MD/roadmap-architecture.md, etape 2.3). Les objets vivent dans un calque (`groupe`, app/assemblage/surface.ts) qui porte
// la transformation du repere du dessin (render/repere.ts, `matriceDuRepere`) : la forme d'un objet (le contour d'un polygone, un
// cercle) s'y dessine en metres, et un zoom ne change que cette transformation, une seule pour tout le plan. Son trait garde son
// epaisseur a l'ecran (`vector-effect: non-scaling-stroke`). Ce qui se mesure en pixels (le nom, les poignees, les etiquettes et
// les cotes des sommets, un chemin : sa largeur d'au moins un pixel, ses tirets, sa fleche, son trace arrondi au dixieme de pixel)
// garde ses coordonnees dans le repere et porte la transformation inverse : un zoom ne deplace que le nom d'un objet qui en montre
// un et le trace d'un chemin (`replacerObjet`), et refait ce qu'un objet montre a ses sommets (`dependDeLEchelle`) ; les autres
// objets ne sont pas touches. Un element que l'empilement sort du calque (les parasols, devant leurs ombres ; les poignees de la
// selection, devant tout) porte lui-meme ce qui lui manque : la transformation du repere s'il est en metres, rien s'il est en
// pixels (`accorder`).

import { sommetDe } from '../geometry/anneau.js';
import { vue } from './vues.js';
import { creerSvg } from './svg.js';
import { SVG_LABEL_HALO, SVG_POIGNEE, SVG_POIGNEE_FOND, SVG_PASTILLE, SVG_PASTILLE_TEXTE, aLaVirgule } from './theme.js';
import { versEcran } from '../geometry/vue.js';
import { pathD } from '../geometry/path.js';
import { centroid, dist, angleInterieurDeg } from '../geometry/basic.js';
import { exteriorBisector } from '../geometry/polygon.js';
import { etiquetteComposee, longueurEnMetres, angleEnDegres, SEP_ECRAN, DEGRE_ECRAN } from '../model/etiquettes.js';
import type { ObjetPlan, PtBrut } from '../model/types.js';
import { largeurChemin } from '../model/ouvrages/index.js';
import { traceAuPlan } from './ouvrages/index.js';
import type { EtatScene } from '../geometry/vue.js';
import { versionObjet } from '../core/controleurObjets.js';

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


/** La transformation qui mene un point du plan (metres, y vers le haut) dans le repere du dessin (pixels, y vers le bas). */
export function matriceDuRepere(scene: Pick<EtatScene, 'scale' | 'origine'>): string {
  return matrices(scene).directe;
}
/** Son inverse : ce qui ramene en pixels du repere un element pose dans le calque des objets. */
function inverseDuRepere(scene: Pick<EtatScene, 'scale' | 'origine'>): string {
  return matrices(scene).inverse;
}
// Les memes pour tous les objets d'un rendu : composees une fois.
let derniereMatrice = { s: NaN, x: NaN, y: NaN, directe: '', inverse: '' };
function matrices(scene: Pick<EtatScene, 'scale' | 'origine'>): typeof derniereMatrice {
  const s = scene.scale, x = scene.origine.x, y = scene.origine.y;
  if (s !== derniereMatrice.s || x !== derniereMatrice.x || y !== derniereMatrice.y) {
    derniereMatrice = { s, x, y, directe: `matrix(${s},0,0,${-s},${x},${y})`, inverse: `matrix(${1 / s},0,0,${-1 / s},${-x / s},${y / s})` };
  }
  return derniereMatrice;
}

/** L'objet montre-t-il quelque chose a ses sommets (poignees, noms, angles, cotes) ? Tout cela se place en pixels. */
function sommetsMontres(obj: ObjetPlan, ctx: Pick<ContextePositionnement, 'selectionnee' | 'pointageSommets' | 'pointageCotes'>): boolean {
  return ctx.selectionnee || ctx.pointageSommets || ctx.pointageCotes
    || !!obj.showVertNames || !!obj.showAngles || !!obj.showSegNames || !!obj.showDims;
}

/**
 * Ce que l'objet dessine depend-il de l'echelle au-dela de ce que `replacerObjet` refait (la transformation de sa forme, le trace
 * d'un chemin, la place de son nom) ? Oui pour ce qu'un objet montre a ses sommets, en pixels (une cote trop longue pour son cote
 * s'y cache selon l'echelle) : un tel objet se replace en entier a chaque zoom ; les autres ne font que suivre le repere.
 */
export function dependDeLEchelle(obj: ObjetRendu, ctx: Pick<ContextePositionnement, 'selectionnee' | 'pointageSommets' | 'pointageCotes'>): boolean {
  if(obj.type === 'circle') return ctx.selectionnee;
  return sommetsMontres(obj, ctx);
}

export function creerDomObjet(racine: SVGElement, obj: ObjetRendu, scene: EtatScene): void {
  const v = vue(obj);
  if(obj.type==='polygon'){
    v.el = creerSvg('polygon');
    v.el.setAttribute('fill',obj.fill); v.el.setAttribute('fill-opacity',String(obj.fillOpacity));
    v.el.setAttribute('stroke',obj.stroke); v.el.setAttribute('stroke-width','1.8');
    // En metres sous la transformation du repere : le trait garde son epaisseur a l'ecran.
    v.el.setAttribute('vector-effect','non-scaling-stroke');
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
    v.el.setAttribute('vector-effect','non-scaling-stroke');
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
function percerContour(v: ReturnType<typeof vue>, el: SVGElement, cle: string, trous: PtBrut[][]): void {
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
  // En metres, comme le contour qu'il tond : le gabarit se lit dans le repere de l'element, sa transformation comprise.
  const anneau = (pts: PtBrut[]) => pts.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' ') + ' Z';
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
/** Retire un attribut que ce module avait pose. */
function retirer(e: Element, nom: string): void {
  const m = ecrits.get(e);
  if (m && nom in m) { verification?.(nom); delete m[nom]; }
  if (e.hasAttribute(nom)) e.removeAttribute(nom);
}
/**
 * Accorde un element a sa place : dans le calque des objets, qui porte le repere, un element en pixels prend la transformation
 * inverse ; hors de lui, un element en metres prend celle du repere. Sans calque (un test, un export), le repere est sur l'element.
 */
function accorder(e: Element, enMetres: boolean, ctx: Pick<ContextePositionnement, 'scene' | 'groupe'>): void {
  const dedans = !!ctx.groupe && e.parentNode === ctx.groupe;
  if (enMetres === dedans) retirer(e, 'transform');
  else poser(e, 'transform', enMetres ? matriceDuRepere(ctx.scene) : inverseDuRepere(ctx.scene));
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

// L'emprise de chaque objet, reprise tant que sa version et sa forme n'ont pas change : chaque rendu se demande, pour chaque objet,
// s'il entre dans la vue ou en sort (un deplacement de la vue ne redessine que ceux-la, render/repere.ts).
const emprises = new WeakMap<object, { version: string; pts: unknown; center: unknown; r: unknown; e: [number, number, number, number] | null }>();
function emprise(obj: ObjetRendu): [number, number, number, number] | null {
  const version = versionObjet(obj);
  const pts = (obj as { pts?: unknown }).pts, center = (obj as { center?: unknown }).center, r = (obj as { r?: unknown }).r;
  const m = emprises.get(obj);
  if(m && m.version === version && m.pts === pts && m.center === center && m.r === r) return m.e;
  let e: [number, number, number, number] | null;
  if(obj.type === 'circle'){
    e = [obj.center.x - obj.r, obj.center.x + obj.r, obj.center.y - obj.r, obj.center.y + obj.r];
  } else if(!obj.pts.length) e = null;
  else {
    let ox0 = Infinity, ox1 = -Infinity, oy0 = Infinity, oy1 = -Infinity;
    for(const p of obj.pts){ ox0 = Math.min(ox0, p.x); ox1 = Math.max(ox1, p.x); oy0 = Math.min(oy0, p.y); oy1 = Math.max(oy1, p.y); }
    e = [ox0, ox1, oy0, oy1];
  }
  emprises.set(obj, { version, pts, center, r, e });
  return e;
}

// Le centre de chaque objet (la place de son nom), repris tant que sa version et sa forme n'ont pas change : un zoom deplace le nom
// de chaque objet montre.
const centres = new WeakMap<object, { version: string; pts: unknown; center: unknown; c: PtBrut }>();
function centreDe(obj: ObjetRendu): PtBrut {
  const version = versionObjet(obj);
  const pts = (obj as { pts?: unknown }).pts, center = (obj as { center?: unknown }).center;
  const m = centres.get(obj);
  if(m && m.version === version && m.pts === pts && m.center === center) return m.c;
  const c = obj.type === 'circle' ? obj.center : centroid(obj.pts);
  centres.set(obj, { version, pts, center, c });
  return c;
}

/** L'objet est-il entierement hors de la vue (marge comprise) ? Calcule sur son emprise, dans le repere du plan. */
export function horsDeLaVue(obj: ObjetRendu, scene: EtatScene): boolean {
  const s = scene.scale;
  if(!(s > 0) || !scene.W || !scene.H) return false;
  const mx = scene.W * MARGE_VUE / s, my = scene.H * MARGE_VUE / s;
  const x0 = -scene.origine.x / s - mx, x1 = (scene.W - scene.origine.x) / s + mx;
  const y0 = (scene.origine.y - scene.H) / s - my, y1 = scene.origine.y / s + my;
  const e = emprise(obj);
  if(!e) return false;
  const [ox0, ox1, oy0, oy1] = e;
  return ox1 < x0 || ox0 > x1 || oy1 < y0 || oy0 > y1;
}

// Ce que les sommets et les cotes d'un objet montrent, en metres et en texte : le decalage de chaque etiquette de sommet, son texte,
// le texte et la longueur de chaque cote. Repris tant que la version et les sommets de l'objet n'ont pas change : un zoom ne fait
// que les replacer.
interface Etiquettes { ext: PtBrut[]; sommets: string[]; cotes: string[]; longueurs: number[] }
const etiquettesMemo = new WeakMap<object, { version: string; pts: unknown; e: Etiquettes }>();
function etiquettesDe(obj: ObjetRendu & { pts: PtBrut[] }): Etiquettes {
  const version = versionObjet(obj), m = etiquettesMemo.get(obj);
  if(m && m.version === version && m.pts === obj.pts) return m.e;
  const n = obj.pts.length;
  const edgeCount = obj.type==='path' ? Math.max(0,n-1) : n;
  const e: Etiquettes = { ext: [], sommets: [], cotes: [], longueurs: [] };
  obj.pts.forEach((pt, i) => {
    // offset vertex label: exterior bisector for closed polygons, simple perpendicular for open paths
    if(obj.type==='polygon'){
      e.ext.push(exteriorBisector({ pts: obj.pts }, i));
    } else {
      const nb = sommetDe(obj.pts, Math.min(i+1,n-1)), pb2 = sommetDe(obj.pts, Math.max(i-1,0));
      const dx = nb.x-pb2.x, dy = nb.y-pb2.y; const L=Math.hypot(dx,dy)||1;
      e.ext.push({x:-dy/L, y:dx/L});
    }
    const vName = obj.vertexNames?.[i] || ('P'+(i+1));
    // Un chemin ouvert n'a pas d'interieur : parler de son angle interieur n'aurait pas de sens.
    const showAngleHere = obj.showAngles && obj.type==='polygon';
    // L'angle n'est calcule que s'il doit etre affiche.
    const angleTxt = showAngleHere ? angleEnDegres(angleInterieurDeg(obj.pts,i), DEGRE_ECRAN) : '';
    e.sommets.push(etiquetteComposee(vName, angleTxt, obj.showVertNames, showAngleHere, SEP_ECRAN));
    if(i < edgeCount){
      const longueur = dist(pt, sommetDe(obj.pts, i+1));
      e.cotes.push(etiquetteComposee(obj.segmentNames?.[i] ?? '', longueurEnMetres(longueur), obj.showSegNames, obj.showDims, SEP_ECRAN));
      e.longueurs.push(longueur);
    }
  });
  etiquettesMemo.set(obj, { version, pts: obj.pts, e });
  return e;
}

/** Montre ou cache un element, sans reecrire un style deja juste. */
function montrer(e: SVGElement, visible: boolean): void {
  const d = visible ? '' : 'none';
  if(e.style.display !== d) e.style.display = d;
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
  const e = etiquettesDe(obj);
  obj.pts.forEach((pt, i) => {
    // Reconstruites juste au-dessus si leur nombre ne suivait plus celui des sommets.
    const poignee = v.pointEls[i], etiquette = v.ptLabelEls[i], ext = e.ext[i];
    if(!poignee || !etiquette || !ext) return;
    const p = versEcran(ctx.scene, pt);
    // Une poignee cachee (ni selection, ni pointage) n'est pas placee : elle le sera quand elle se montrera, l'objet ayant change.
    const showPtForPick = ctx.pointageSommets;
    montrer(poignee, ctx.selectionnee || showPtForPick);
    if(ctx.selectionnee || showPtForPick){
      poser(poignee, 'cx', String(p.x)); poser(poignee, 'cy', String(p.y));
      accorder(poignee, false, ctx);
      const isFrozen = obj.type==='polygon' && obj.frozenVertices && obj.frozenVertices[i];
      poser(poignee, 'fill', isFrozen ? SVG_POIGNEE : SVG_POIGNEE_FOND);
      poser(poignee, 'r', String(isFrozen ? 7.5 : 6.5));
    }
    accorder(etiquette, false, ctx);

    poser(etiquette, 'x', String(p.x + ext.x*13));
    poser(etiquette, 'y', String(p.y - ext.y*13 + 3));
    poser(etiquette, 'text-anchor','middle');
    const vertTxt = e.sommets[i] ?? '';
    texte(etiquette, aLaVirgule(vertTxt));
    montrer(etiquette, !!vertTxt);

    const cote = v.edgeEls[i], etiquetteCote = v.segLabelEls[i];
    if(i < edgeCount && cote && etiquetteCote){
      const pa=p, pb=versEcran(ctx.scene, sommetDe(obj.pts, i+1));
      // Le cote a saisir, comme la poignee : place seulement quand il se montre.
      const showEdgeForPick = ctx.pointageCotes;
      montrer(cote, ctx.selectionnee || showEdgeForPick);
      const pointeur = (ctx.selectionnee || showEdgeForPick) ? 'all' : 'none';
      if(cote.style.pointerEvents !== pointeur) cote.style.pointerEvents = pointeur;
      if(ctx.selectionnee || showEdgeForPick){
        poser(cote, 'x1', String(pa.x)); poser(cote, 'y1', String(pa.y));
        poser(cote, 'x2', String(pb.x)); poser(cote, 'y2', String(pb.y));
        accorder(cote, false, ctx);
      }
      accorder(etiquetteCote, false, ctx);

      const mid = {x:(pa.x+pb.x)/2, y:(pa.y+pb.y)/2};
      poser(etiquetteCote, 'x', String(mid.x)); poser(etiquetteCote, 'y', String(mid.y));
      const segTxt = e.cotes[i] ?? '';
      texte(etiquetteCote, aLaVirgule(segTxt));
      // Une pastille plus longue que son cote a l'ecran chevauche ses voisines et ne se lit plus :
      // elle attend qu'on zoome (Ajuster, pincer). La largeur se compte a ~6,5 px par caractere.
      const tropCourt = Math.hypot(pb.x-pa.x, pb.y-pa.y) < segTxt.length*6.5 + 12;
      montrer(etiquetteCote, !!segTxt && !tropCourt);
    }
  });
  const curseur = obj.locked ? 'not-allowed' : (ctx.selectionnee ? 'move' : 'pointer');
  if(el.style.cursor !== curseur) el.style.cursor = curseur;
}

/**
 * Ce qu'un zoom change a un objet montre dont rien d'autre n'a bouge : la transformation de sa forme (le trace d'un chemin, en
 * pixels), la place de son nom. `positionnerObjet` finit par la ; le rendu l'appelle seule quand seul le repere a change
 * (render/pipeline.ts).
 */
export function replacerObjet(obj: ObjetRendu, ctx: Pick<ContextePositionnement, 'scene' | 'groupe'>): void {
  const v = vue(obj);
  const { el, nameEl } = v;
  if(!el || !nameEl) return;
  // Une forme dans le calque des objets suit sa transformation sans rien porter : sans nom, rien a refaire.
  if(obj.type !== 'path' && !nameEl.textContent && ctx.groupe && el.parentNode === ctx.groupe && !el.hasAttribute('transform')) return;
  accorder(el, obj.type !== 'path', ctx);
  if(obj.type === 'path'){
    poser(el, 'd', pathD(ctx.scene, obj.pts, !!obj.curve));
    poser(el, 'stroke-width', String(Math.max(1, largeurChemin(obj)*ctx.scene.scale)));
    if(v.camMarkerEl){
      const p0 = versEcran(ctx.scene, sommetDe(obj.pts, 0));
      poser(v.camMarkerEl, 'cx', String(p0.x)); poser(v.camMarkerEl, 'cy', String(p0.y));
      accorder(v.camMarkerEl, false, ctx);
    }
  }
  // Un nom vide ne se voit pas : il n'a pas de place a suivre (il la reprend quand son texte revient, l'objet ayant change).
  if(!nameEl.textContent) return;
  const cs = versEcran(ctx.scene, centreDe(obj));
  poser(nameEl, 'x', String(cs.x)); poser(nameEl, 'y', String(cs.y));
  accorder(nameEl, false, ctx);
}

/** Ce que positionner un objet demande de savoir, en plus de l'objet lui-meme. */
export interface ContextePositionnement {
  /** La scene du dessin : le repere (render/repere.ts), ou la vue. */
  scene: EtatScene;
  /**
   * Le calque des objets, qui porte la transformation du repere (`matriceDuRepere`) : ses enfants en metres n'ont rien a porter.
   * Sans lui, chaque element en metres porte le repere.
   */
  groupe?: Element | null;
  /** L'objet est hors de la vue courante (et ni masque ni selectionne) : rien ne se dessine. Sans lui, lu sur `scene`. */
  horsVue?: boolean;
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
    if(!ctx.masque && !ctx.selectionnee && (ctx.horsVue ?? horsDeLaVue(obj, ctx.scene))){
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
      poser(el, 'points', obj.pts.map((p) => p.x + ',' + p.y).join(' '));
      percerContour(v, el, obj.key, ctx.trous ?? []);
    } else if(obj.type==='path'){
      // Le trace du chemin, en pixels : `replacerObjet`, plus bas.
    } else {
      poser(el, 'cx', String(obj.center.x)); poser(el, 'cy', String(obj.center.y)); poser(el, 'r', String(obj.r));
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

    poser(nameEl, 'font-size', String(obj.key==='parcelle'||obj.key==='maison' ? 14 : 10));
    texte(nameEl, obj.showName ? obj.name : '');
    replacerObjet(obj, ctx);

    // Rien des sommets ne se voit (ni selection, ni pointage, ni noms, angles ou cotes) : on les cache
    // une fois et on ne les place pas. C'etait l'essentiel d'un rendu de voisinage : dix attributs par
    // sommet de chaque batiment, pour des elements invisibles (profil d'octobre 2026).
    const sommetsUtiles = sommetsMontres(obj, ctx);
    if((obj.type==='polygon' || obj.type==='path') && !sommetsUtiles){
      cacherSommets(v);
      el.style.cursor = obj.locked ? 'not-allowed' : 'pointer';
    } else if(obj.type==='polygon' || obj.type==='path'){
      placerSommets(obj, v, el, ctx);
    } else {
      // La poignee du rayon, en pixels : placee seulement quand elle se voit (un zoom ne refait pas un cercle qui n'est pas selectionne).
      if(v.radiusHandle && ctx.selectionnee){
        const rp = versEcran(ctx.scene, {x:obj.center.x+obj.r, y:obj.center.y});
        poser(v.radiusHandle, 'cx', String(rp.x)); poser(v.radiusHandle, 'cy', String(rp.y));
        accorder(v.radiusHandle, false, ctx);
        v.radiusHandle.style.display = '';
      } else if(v.radiusHandle) cacher(v.radiusHandle);
      el.style.cursor = obj.locked ? 'not-allowed' : (ctx.selectionnee ? 'move' : 'pointer');
    }

}


