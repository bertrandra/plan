// Import d'un SVG dans le plan (spec §3.2, io/).
//
// Deux sources tres differentes arrivent ici. Un SVG **exporte par l'application** porte ses
// attributs `data-*` : coordonnees en metres a quatre decimales, noms de sommets et de cotes,
// fonction, matiere. On le relit tel quel, sans perte. Un SVG **etranger** n'a que sa geometrie :
// ses unites sont alors traitees comme des metres et son axe Y retourne (l'ecran descend, le plan
// monte).
//
// C'est le pendant exact de `export/svgPlan.ts` : les deux modules partagent le meme separateur de
// noms, et toucher aux `data-*` d'un cote casse l'autre.

import { NAME_SEP } from '../export/separateurs.js';
import { cleObjet } from '../model/cles.js';
import { referencesDeCote } from '../model/mesures.js';
import { detruireVue } from '../render/vues.js';
import { parseSvgPathPoints } from '../geometry/path.js';
import { showToast } from '../shell/dialogs.js';
import type { EtatApp } from '../core/state.js';
import type { ObjetPlan, Mesure, PtBrut } from '../model/types.js';

/** Ce que l'import SVG declenche : construire le DOM d'un objet neuf, puis remettre le plan a jour. */
export interface ContexteImportSvg {
  pushHistory: () => void;
  createObjectDOM: (obj: ObjetPlan) => void;
  rebuildHandles: (obj: ObjetPlan) => void;
  reapplyStackingOrder: () => void;
  rebuildSelector: () => void;
  render: () => void;
}

// Un SVG exporte par l'application transporte ses cotes dans un noeud cache. Sa presence dit s'il
// faut remplacer les cotes en memoire ou les laisser tranquilles.
function mesuresDansLeFichier(doc: Document): boolean {
  const el = doc.getElementById('measures-data');
  return !!(el && el.getAttribute('data-measures'));
}
// Les lectures d'un SVG, qui peut venir d'ailleurs : un attribut absent y est la regle, pas
// l'exception. Chacune dit ce qu'elle rend quand il manque, au lieu d'un `!` qui passait le `null`
// tel quel a `parseFloat`.

/** Un attribut numerique ; `NaN` s'il manque, que les `||` et les `Number.isFinite` en aval ecartent. */
function nombre(el: Element, nom: string): number { return parseFloat(el.getAttribute(nom) ?? ''); }
function entier(el: Element, nom: string): number { return parseInt(el.getAttribute(nom) ?? '', 10); }
/** Des noms separes par NAME_SEP ; `null` si l'attribut manque ou est vide. */
function noms(el: Element, nom: string): string[] | null {
  const v = el.getAttribute(nom);
  return v ? v.split(NAME_SEP) : null;
}
/** Une paire « x,y » ; `null` si l'un des deux manque ou n'est pas un nombre — le point est ecarte. */
function paire(texte: string): PtBrut | null {
  const [x, y] = texte.split(',').map(Number);
  return x !== undefined && y !== undefined && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
const estPoint = (p: PtBrut | null): p is PtBrut => p !== null;

/** Le mode « remplacer » : les objets, leurs elements SVG, et les cotes, qui visent des cles qui vont disparaitre. */
function viderLePlan(etat: EtatApp): void {
  etat.objects.slice().forEach(detruireVue);
  etat.objects.length = 0;
  etat.measures.length = 0;
  etat.selectedKey = null;
}

/** `remplacer` : supprimer les objets existants avant d'importer (option du menu Fichier). */
export function importSVGString(svgText: string, etat: EtatApp, ctx: ContexteImportSvg, remplacer: boolean): void {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const perr = doc.querySelector('parsererror');
  if(perr) throw new Error('SVG invalide ou mal forme');
  const root = doc.documentElement;
  const isOwn = root.getAttribute('data-plan-interactif') === '1';
  const minx = nombre(root, 'data-minx');
  const pad = nombre(root, 'data-pad');
  const maxy = nombre(root, 'data-maxy');
  const replaceMode = remplacer;

  function svgToWorld(x: number, y: number): { x: number; y: number } {
    if(isOwn && Number.isFinite(minx) && Number.isFinite(pad) && Number.isFinite(maxy)){
      return {x: x + (minx-pad), y: (maxy+pad) - y};
    }
    // fallback for external SVGs: treat user units as meters, flip Y (SVG y-down -> world y-up)
    return {x: x, y: -y};
  }

  ctx.pushHistory();

  if(replaceMode) viderLePlan(etat);

  let imported = 0;
  etat.newObjCounter += 1;

  doc.querySelectorAll('polygon').forEach(el=>{
    const dataPts = el.getAttribute('data-points');
    let pts;
    if(isOwn && dataPts){
      pts = dataPts.trim().split(' ').map(paire).filter(estPoint);
    } else {
      const raw = (el.getAttribute('points')||'').trim().split(/\s+/).filter(Boolean);
      pts = raw.map(paire).filter(estPoint).map(p=>svgToWorld(p.x,p.y));
    }
    if(pts.length<3) return;
    const origKey = el.getAttribute('data-objkey');
    const key = (replaceMode && isOwn && origKey) ? origKey : cleObjet('imp', etat);
    const name = isOwn ? (el.getAttribute('data-name')||'Objet importe') : ('Objet importe '+imported);
    const vNames = (isOwn && noms(el, 'data-vertex-names')) || pts.map((_,i)=>'Coin '+(i+1));
    const sNames = (isOwn && noms(el, 'data-segment-names')) || pts.map((_,i)=>'Cote '+(i+1));
    const newObj = {
      key, type:'polygon' as const, name,
      fill: el.getAttribute('fill')||'#8fb3d9', fillOpacity: nombre(el, 'fill-opacity')||0.75,
      stroke: el.getAttribute('stroke')||'#2a4d6e',
      pts, vertexNames:vNames, segmentNames:sNames, frozenVertices: pts.map(()=>false),
      showName:true, showSegNames:false, showVertNames:false, showDims:true, showAngles:false,
      constrained:false,
      fonction: isOwn ? (el.getAttribute('data-fonction')||'autre') : 'autre',
      matiere: isOwn ? (el.getAttribute('data-matiere')||'') : '',
      priority: isOwn ? (entier(el, 'data-priority')||2) : 2,
      locked: isOwn ? (el.getAttribute('data-locked')==='true') : false
    };
    etat.objects.push(newObj); ctx.createObjectDOM(newObj); ctx.rebuildHandles(newObj); imported++;
  });

  doc.querySelectorAll('path').forEach(el=>{
    const dataPts = el.getAttribute('data-points');
    let pts;
    if(isOwn && dataPts){
      pts = dataPts.trim().split(' ').map(paire).filter(estPoint);
    } else {
      // best-effort: extract endpoint coordinates for every path command, not just M/L/C - see
      // parseSvgPathPoints() below.
      const d = el.getAttribute('d')||'';
      pts = parseSvgPathPoints(d).map(p=>svgToWorld(p.x,p.y));
    }
    if(pts.length<2) return;
    const origKey = el.getAttribute('data-objkey');
    const key = (replaceMode && isOwn && origKey) ? origKey : cleObjet('imp', etat);
    const name = isOwn ? (el.getAttribute('data-name')||'Chemin importe') : ('Chemin importe '+imported);
    const vNames = (isOwn && noms(el, 'data-vertex-names')) || pts.map((_,i)=>'Point '+(i+1));
    const sNames = (isOwn && noms(el, 'data-segment-names')) || pts.map((_,i)=>'Cote '+(i+1));
    const width = nombre(el, isOwn ? 'data-width' : 'stroke-width')||1;
    const curve = isOwn ? (el.getAttribute('data-curve')==='true') : false;
    const newObj = {
      key, type:'path' as const, name,
      fill: el.getAttribute('stroke')||'#c9a15a', fillOpacity:1, stroke: el.getAttribute('stroke')||'#c9a15a',
      pts, vertexNames:vNames, segmentNames:sNames, frozenVertices: pts.map(()=>false),
      width, curve,
      showName:true, showSegNames:false, showVertNames:false, showDims:true, showAngles:false,
      constrained:false,
      fonction: isOwn ? (el.getAttribute('data-fonction')||'chemin') : 'chemin',
      matiere: isOwn ? (el.getAttribute('data-matiere')||'') : '',
      priority: isOwn ? (entier(el, 'data-priority')||2) : 2,
      locked: isOwn ? (el.getAttribute('data-locked')==='true') : false
    };
    etat.objects.push(newObj); ctx.createObjectDOM(newObj); ctx.rebuildHandles(newObj); imported++;
  });

  doc.querySelectorAll('circle').forEach(el=>{
    const centrePropre = isOwn ? el.getAttribute('data-center') : null;
    const center = centrePropre ? paire(centrePropre) : svgToWorld(nombre(el, 'cx'), nombre(el, 'cy'));
    const r = nombre(el, centrePropre ? 'data-radius' : 'r');
    if(!center || !Number.isFinite(r) || r<=0) return;
    const origKey = el.getAttribute('data-objkey');
    const key = (replaceMode && isOwn && origKey) ? origKey : cleObjet('imp', etat);
    const name = isOwn ? (el.getAttribute('data-name')||'Cercle importe') : ('Cercle importe '+imported);
    const newObj = {
      key, type:'circle' as const, name,
      fill: el.getAttribute('fill')||'#5bc8f5', fillOpacity: nombre(el, 'fill-opacity')||0.9,
      stroke: el.getAttribute('stroke')||'#0a3d5c',
      center, r,
      showName:true, showSegNames:false, showVertNames:false, showDims:true, showAngles:false,
      constrained:false,
      fonction: isOwn ? (el.getAttribute('data-fonction')||'equipement') : 'equipement',
      matiere: isOwn ? (el.getAttribute('data-matiere')||'') : '',
      priority: isOwn ? (entier(el, 'data-priority')||3) : 3,
      locked: isOwn ? (el.getAttribute('data-locked')==='true') : false
    };
    etat.objects.push(newObj); ctx.createObjectDOM(newObj); ctx.rebuildHandles(newObj); imported++;
  });

  let importedMeasures = 0;
  if(replaceMode && isOwn){
    const mdEl = doc.getElementById("measures-data");
    const mdRaw = mdEl ? mdEl.getAttribute('data-measures') : null;
    if(mdRaw){
      try {
        // Ce que le fichier porte n'est pas garanti : c'est du JSON arbitraire. Chaque cote passe
        // par `referencesDeCote`, qui verifie ce que le rendu lira — objets presents, indices dans
        // les polygones — et ecarte le reste. Longtemps, seule l'existence des deux objets etait
        // verifiee, et les indices entraient tels quels.
        const parsed: unknown = JSON.parse(mdRaw);
        (Array.isArray(parsed) ? parsed : []).forEach((brut: unknown)=>{
          const refs = referencesDeCote(brut, etat.objects);
          if(!refs) return;
          const m = brut as Partial<Mesure>;
          etat.measures.push({
            id:'m'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
            ...refs, show:!!m.show,
            displayMode: m.displayMode==='along' ? 'along' : 'perp'
          });
          importedMeasures++;
        });
      } catch { /* ignore malformed etat.measures data, geometry import already succeeded */ }
    }
  }

  ctx.reapplyStackingOrder();
  ctx.rebuildSelector();
  ctx.render();
  let msg = imported + ' objet(s) importe(s).';
  if(!isOwn) msg += ' (SVG externe : noms/attributs par defaut, verifie les proportions.)';
  if(importedMeasures) msg += ' ' + importedMeasures + ' mesure(s) restauree(s).';
  else if(!replaceMode && mesuresDansLeFichier(doc)) msg += ' (Les mesures du fichier ne sont restaurees qu\'en mode "remplacement".)';
  if(!etat.objects.find(o=>o.key==='parcelle')) msg += ' ATTENTION: aucun objet "parcelle" dans le resultat - certaines fonctions (mesures, alignement, contrainte a la parcelle) seront limitees tant qu\'une parcelle n\'existe pas.';
  showToast(msg);
}
