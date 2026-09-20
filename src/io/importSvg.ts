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
import { elOpt } from '../shell/dom.js';
import type { EtatApp } from '../core/state.js';
import type { ObjetPlan, Mesure } from '../model/types.js';

/** Ce que l'import SVG declenche : construire le DOM d'un objet neuf, puis remettre le plan a jour. */
export interface ContexteImportSvg {
  pushHistory: () => void;
  createObjectDOM: (obj: ObjetPlan) => void;
  rebuildHandles: (obj: ObjetPlan) => void;
  reapplyStackingOrder: () => void;
  rebuildSelector: () => void;
  renderMeasureResults: () => void;
  render: () => void;
}

// Un SVG exporte par l'application transporte ses cotes dans un noeud cache. Sa presence dit s'il
// faut remplacer les cotes en memoire ou les laisser tranquilles.
function mesuresDansLeFichier(doc: Document): boolean {
  const el = doc.getElementById('measures-data');
  return !!(el && el.getAttribute('data-measures'));
}
export function importSVGString(svgText: string, etat: EtatApp, ctx: ContexteImportSvg): void {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const perr = doc.querySelector('parsererror');
  if(perr) throw new Error('SVG invalide ou mal forme');
  const root = doc.documentElement;
  const isOwn = root.getAttribute('data-plan-interactif') === '1';
  // `getAttribute` rend `null` quand l'attribut manque, et `parseFloat(null)` vaut NaN : c'est
  // exactement ce que les `Number.isFinite` et les `||` en aval attendent d'un SVG etranger. Les
  // `!` poses sur ces lectures numeriques, ici et plus bas, passent ce `null` tel quel a `parseFloat`.
  const minx = parseFloat(root.getAttribute('data-minx')!);
  const pad = parseFloat(root.getAttribute('data-pad')!);
  const maxy = parseFloat(root.getAttribute('data-maxy')!);
  const replaceMode = !!elOpt<HTMLInputElement>('chkReplaceOnImport')?.checked;

  function svgToWorld(x: number, y: number): { x: number; y: number } {
    if(isOwn && Number.isFinite(minx) && Number.isFinite(pad) && Number.isFinite(maxy)){
      return {x: x + (minx-pad), y: (maxy+pad) - y};
    }
    // fallback for external SVGs: treat user units as meters, flip Y (SVG y-down -> world y-up)
    return {x: x, y: -y};
  }

  ctx.pushHistory();

  if(replaceMode){
    // remove every current object and its DOM elements, and any stored measures (they
    // reference object keys that are about to disappear)
    etat.objects.slice().forEach(detruireVue);
    etat.objects.length = 0;
    etat.measures.length = 0;
    etat.selectedKey = null;
  }

  let imported = 0;
  etat.newObjCounter += 1;

  doc.querySelectorAll('polygon').forEach(el=>{
    const dataPts = el.getAttribute('data-points');
    let pts;
    if(isOwn && dataPts){
      pts = dataPts.trim().split(' ').map(s=>{ const [x,y]=s.split(',').map(Number); return {x:x!,y:y!}; });
    } else {
      const raw = (el.getAttribute('points')||'').trim().split(/\s+/).filter(Boolean);
      pts = raw.map(s=>{ const [x,y]=s.split(',').map(Number); return svgToWorld(x!,y!); });
    }
    if(pts.length<3) return;
    const origKey = el.getAttribute('data-objkey');
    const key = (replaceMode && isOwn && origKey) ? origKey : cleObjet('imp', etat);
    const name = isOwn ? (el.getAttribute('data-name')||'Objet importe') : ('Objet importe '+imported);
    const vNames = isOwn && el.getAttribute('data-vertex-names') ? el.getAttribute('data-vertex-names')!.split(NAME_SEP) : pts.map((_,i)=>'Coin '+(i+1));
    const sNames = isOwn && el.getAttribute('data-segment-names') ? el.getAttribute('data-segment-names')!.split(NAME_SEP) : pts.map((_,i)=>'Cote '+(i+1));
    const newObj = {
      key, type:'polygon', name,
      fill: el.getAttribute('fill')||'#8fb3d9', fillOpacity: parseFloat(el.getAttribute('fill-opacity')!)||0.75,
      stroke: el.getAttribute('stroke')||'#2a4d6e',
      pts, vertexNames:vNames, segmentNames:sNames, frozenVertices: pts.map(()=>false),
      showName:true, showSegNames:false, showVertNames:false, showDims:true, showAngles:false,
      constrained:false,
      fonction: isOwn ? (el.getAttribute('data-fonction')||'autre') : 'autre',
      matiere: isOwn ? (el.getAttribute('data-matiere')||'') : '',
      priority: isOwn ? (parseInt(el.getAttribute('data-priority')!,10)||2) : 2,
      locked: isOwn ? (el.getAttribute('data-locked')==='true') : false
    };
    etat.objects.push(newObj); ctx.createObjectDOM(newObj); ctx.rebuildHandles(newObj); imported++;
  });

  doc.querySelectorAll('path').forEach(el=>{
    const dataPts = el.getAttribute('data-points');
    let pts;
    if(isOwn && dataPts){
      pts = dataPts.trim().split(' ').map(s=>{ const [x,y]=s.split(',').map(Number); return {x:x!,y:y!}; });
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
    const vNames = isOwn && el.getAttribute('data-vertex-names') ? el.getAttribute('data-vertex-names')!.split(NAME_SEP) : pts.map((_,i)=>'Point '+(i+1));
    const sNames = isOwn && el.getAttribute('data-segment-names') ? el.getAttribute('data-segment-names')!.split(NAME_SEP) : pts.map((_,i)=>'Cote '+(i+1));
    const width = isOwn ? (parseFloat(el.getAttribute('data-width')!)||1) : (parseFloat(el.getAttribute('stroke-width')!)||1);
    const curve = isOwn ? (el.getAttribute('data-curve')==='true') : false;
    const newObj = {
      key, type:'path', name,
      fill: el.getAttribute('stroke')||'#c9a15a', fillOpacity:1, stroke: el.getAttribute('stroke')||'#c9a15a',
      pts, vertexNames:vNames, segmentNames:sNames, frozenVertices: pts.map(()=>false),
      width, curve,
      showName:true, showSegNames:false, showVertNames:false, showDims:true, showAngles:false,
      constrained:false,
      fonction: isOwn ? (el.getAttribute('data-fonction')||'chemin') : 'chemin',
      matiere: isOwn ? (el.getAttribute('data-matiere')||'') : '',
      priority: isOwn ? (parseInt(el.getAttribute('data-priority')!,10)||2) : 2,
      locked: isOwn ? (el.getAttribute('data-locked')==='true') : false
    };
    etat.objects.push(newObj); ctx.createObjectDOM(newObj); ctx.rebuildHandles(newObj); imported++;
  });

  doc.querySelectorAll('circle').forEach(el=>{
    let center, r;
    if(isOwn && el.getAttribute('data-center')){
      const [cx,cy] = el.getAttribute('data-center')!.split(',').map(Number);
      center = {x:cx!,y:cy!}; r = parseFloat(el.getAttribute('data-radius')!);
    } else {
      const cx = parseFloat(el.getAttribute('cx')!), cy = parseFloat(el.getAttribute('cy')!);
      center = svgToWorld(cx,cy); r = parseFloat(el.getAttribute('r')!);
    }
    if(!Number.isFinite(r) || r<=0) return;
    const origKey = el.getAttribute('data-objkey');
    const key = (replaceMode && isOwn && origKey) ? origKey : cleObjet('imp', etat);
    const name = isOwn ? (el.getAttribute('data-name')||'Cercle importe') : ('Cercle importe '+imported);
    const newObj = {
      key, type:'circle', name,
      fill: el.getAttribute('fill')||'#5bc8f5', fillOpacity: parseFloat(el.getAttribute('fill-opacity')!)||0.9,
      stroke: el.getAttribute('stroke')||'#0a3d5c',
      center, r,
      showName:true, showSegNames:false, showVertNames:false, showDims:true, showAngles:false,
      constrained:false,
      fonction: isOwn ? (el.getAttribute('data-fonction')||'equipement') : 'equipement',
      matiere: isOwn ? (el.getAttribute('data-matiere')||'') : '',
      priority: isOwn ? (parseInt(el.getAttribute('data-priority')!,10)||3) : 3,
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
  ctx.renderMeasureResults();
  ctx.render();
  let msg = imported + ' objet(s) importe(s).';
  if(!isOwn) msg += ' (SVG externe : noms/attributs par defaut, verifie les proportions.)';
  if(importedMeasures) msg += ' ' + importedMeasures + ' mesure(s) restauree(s).';
  else if(!replaceMode && mesuresDansLeFichier(doc)) msg += ' (Les mesures du fichier ne sont restaurees qu\'en mode "remplacement".)';
  if(!etat.objects.find(o=>o.key==='parcelle')) msg += ' ATTENTION: aucun objet "parcelle" dans le resultat - certaines fonctions (mesures, alignement, contrainte a la parcelle) seront limitees tant qu\'une parcelle n\'existe pas.';
  showToast(msg);
}
