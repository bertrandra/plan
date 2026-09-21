// Export SVG du plan (spec §3.2, export/).
//
// Ce SVG a deux lecteurs. Un humain, qui l'ouvre dans un navigateur ou l'imprime ; et
// l'application elle-meme, qui doit pouvoir le **reimporter** sans rien perdre. D'ou les
// attributs `data-*` portes par chaque forme : les coordonnees en metres a quatre decimales, les
// noms de sommets et de cotes, la fonction, la matiere. Le dessin, lui, est en metres a l'echelle
// de la vue.
//
// Consequence a garder en tete : tout ce qui touche a ces `data-*` casse la reimportation d'un
// fichier deja exporte. C'est arrive une fois pendant la migration (`data-measures` renomme par un
// remplacement trop large), et seuls les golden files l'ont vu.

import { escapeXml } from '../util/escape.js';
import { niceStep } from '../util/format.js';
import { dist, centroid, angleInterieurDeg } from '../geometry/basic.js';
import { geometrieMesure, ancrageHorsContour } from '../render/measures.js';
import { etiquetteComposee, longueurEnMetres, angleEnDegres, SEP_EXPORT, DEGRE_EXPORT } from '../model/etiquettes.js';
import { NAME_SEP } from './separateurs.js';
import type { ObjetPlan, PtBrut, Mesure } from '../model/types.js';
import { sommetsDe } from '../model/formes.js';

/** Ce que l'export SVG doit savoir en plus des objets : de quoi remplir les attributs data-*. */
export interface MetaSvg {
  appVersion: string;
  schemaVersion: number;
}

export function construireSVG(objets: ObjetPlan[], mesures: Mesure[], meta: MetaSvg){
  const allPts: PtBrut[] = [];
  objets.forEach((o: ObjetPlan)=>{
    if(o.type==='polygon' || o.type==='path') (o.pts||[]).forEach(p=>allPts.push(p));
    else { allPts.push({x:o.center.x-o.r,y:o.center.y-o.r}); allPts.push({x:o.center.x+o.r,y:o.center.y+o.r}); }
  });
  const xs=allPts.map(p=>p.x).filter(v=>Number.isFinite(v));
  const ys=allPts.map(p=>p.y).filter(v=>Number.isFinite(v));
  if(xs.length===0 || ys.length===0) throw new Error('Aucune coordonnee valide a exporter');
  const minx=Math.min(...xs), maxx=Math.max(...xs), miny=Math.min(...ys), maxy=Math.max(...ys);
  const pad=4;
  const w=(maxx-minx)+2*pad, h=(maxy-miny)+2*pad+3;
  const exScale = 20;
  // Match on-screen HTML font sizes exactly: live render uses fixed pixel sizes
  // (segLabelEls=11px, ptLabelEls=10px, nameEl=14px or 10px). The export viewBox
  // is in meters at exScale px/meter, so divide the live pixel sizes by exScale
  // to get the equivalent font-size in viewBox units.
  const fsSeg = 11/exScale;
  const fsVert = 10/exScale;
  const fsNameBig = 14/exScale;
  const fsNameSmall = 10/exScale;
  function exToSvg(p: PtBrut){ return {x:(p.x-(minx-pad)), y:((maxy+pad)-p.y)}; }

  function exPathD(pts: PtBrut[], curve?: boolean){
    if(pts.length<2) return '';
    const s = pts.map(exToSvg);
    if(!curve || s.length<3){
      return 'M ' + s.map(p=>p.x.toFixed(2)+','+p.y.toFixed(2)).join(' L ');
    }
    let d = 'M ' + s[0]!.x.toFixed(2) + ',' + s[0]!.y.toFixed(2) + ' ';
    for(let i=0;i<s.length-1;i++){
      const p0 = s[Math.max(0,i-1)]!, p1 = s[i]!, p2 = s[i+1]!, p3 = s[Math.min(s.length-1,i+2)]!;
      const c1 = {x:p1.x+(p2.x-p0.x)/6, y:p1.y+(p2.y-p0.y)/6};
      const c2 = {x:p2.x-(p3.x-p1.x)/6, y:p2.y-(p3.y-p1.y)/6};
      d += 'C ' + c1.x.toFixed(2)+','+c1.y.toFixed(2)+' '+c2.x.toFixed(2)+','+c2.y.toFixed(2)+' '+p2.x.toFixed(2)+','+p2.y.toFixed(2)+' ';
    }
    return d;
  }

  let body = '';
  objets.forEach((obj: ObjetPlan)=>{
    if(obj.type==='polygon'){
      const pts = (obj.pts||[]).map((p: PtBrut)=>{const s=exToSvg(p); return s.x.toFixed(2)+','+s.y.toFixed(2);}).join(' ');
      body += '<polygon points="'+pts+'" fill="'+obj.fill+'" fill-opacity="'+obj.fillOpacity+'" stroke="'+obj.stroke+'" stroke-width="0.15" data-objkey="'+escapeXml(obj.key)+'" data-locked="'+(!!obj.locked)+'" data-name="'+escapeXml(obj.name)+'" data-fonction="'+escapeXml(obj.fonction||'')+'" data-matiere="'+escapeXml(obj.matiere||'')+'" data-priority="'+(obj.priority||0)+'" data-points="'+escapeXml((obj.pts||[]).map((p: PtBrut)=>p.x.toFixed(4)+','+p.y.toFixed(4)).join(' '))+'" data-vertex-names="'+escapeXml((obj.vertexNames||[]).join(NAME_SEP))+'" data-segment-names="'+escapeXml((obj.segmentNames||[]).join(NAME_SEP))+'"/>\n';
      const n = (obj.pts||[]).length;
      const ptsPoly = obj.pts || [];
      for(let i=0;i<n;i++){
        const a=ptsPoly[i]!, b=ptsPoly[(i+1)%n]!;
        const pa=exToSvg(a), pb=exToSvg(b);
        const segTxt = etiquetteComposee((obj.segmentNames||[])[i]!, longueurEnMetres(dist(a,b)), obj.showSegNames, obj.showDims, SEP_EXPORT);
        if(segTxt){
          const mx=(pa.x+pb.x)/2, my=(pa.y+pb.y)/2;
          body += '<text x="'+mx.toFixed(2)+'" y="'+(my-0.3).toFixed(2)+'" font-size="'+fsSeg+'" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" fill="#12210f">'+escapeXml(segTxt)+'</text>\n';
        }
        const exVName = (obj.vertexNames||[])[i]||'';
        const exAngleTxt = obj.showAngles ? angleEnDegres(angleInterieurDeg(ptsPoly,i), DEGRE_EXPORT) : '';
        const exVertTxt = etiquetteComposee(exVName, exAngleTxt, obj.showVertNames, obj.showAngles, SEP_EXPORT);
        if(exVertTxt){
          body += '<text x="'+(pa.x+0.4).toFixed(2)+'" y="'+(pa.y-0.4).toFixed(2)+'" font-size="'+fsVert+'" font-family="Helvetica Neue, Arial, sans-serif" fill="#333">'+escapeXml(exVertTxt)+'</text>\n';
        }
      }
    } else if(obj.type==='path'){
      const ptsPath = obj.pts || [];
      body += '<path d="'+exPathD(ptsPath, !!obj.curve)+'" fill="none" stroke="'+obj.stroke+'" stroke-width="'+(obj.width||1)+'" stroke-linecap="butt" stroke-linejoin="round" data-objkey="'+escapeXml(obj.key)+'" data-locked="'+(!!obj.locked)+'" data-name="'+escapeXml(obj.name)+'" data-fonction="'+escapeXml(obj.fonction||'')+'" data-matiere="'+escapeXml(obj.matiere||'')+'" data-priority="'+(obj.priority||0)+'" data-width="'+(obj.width||1)+'" data-curve="'+(!!obj.curve)+'" data-points="'+escapeXml(ptsPath.map((p: PtBrut)=>p.x.toFixed(4)+','+p.y.toFixed(4)).join(' '))+'" data-vertex-names="'+escapeXml((obj.vertexNames||[]).join(NAME_SEP))+'" data-segment-names="'+escapeXml((obj.segmentNames||[]).join(NAME_SEP))+'"/>\n';
      for(let i=0;i<ptsPath.length-1;i++){
        const a=ptsPath[i]!, b=ptsPath[i+1]!;
        const pa=exToSvg(a), pb=exToSvg(b);
        const segTxt = etiquetteComposee((obj.segmentNames||[])[i]||('Cote '+(i+1)), longueurEnMetres(dist(a,b)), obj.showSegNames, obj.showDims, SEP_EXPORT);
        if(segTxt){
          const mx=(pa.x+pb.x)/2, my=(pa.y+pb.y)/2;
          body += '<text x="'+mx.toFixed(2)+'" y="'+(my-0.3).toFixed(2)+'" font-size="'+fsSeg+'" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" fill="#12210f">'+escapeXml(segTxt)+'</text>\n';
        }
      }
      if(obj.showVertNames){
        ptsPath.forEach((p: PtBrut,i: number)=>{
          const ps = exToSvg(p);
          body += '<text x="'+(ps.x+0.4).toFixed(2)+'" y="'+(ps.y-0.4).toFixed(2)+'" font-size="'+fsVert+'" font-family="Helvetica Neue, Arial, sans-serif" fill="#333">'+escapeXml((obj.vertexNames||[])[i]||'')+'</text>\n';
        });
      }
    } else {
      const c = exToSvg(obj.center);
      body += '<circle cx="'+c.x.toFixed(2)+'" cy="'+c.y.toFixed(2)+'" r="'+obj.r.toFixed(2)+'" fill="'+obj.fill+'" fill-opacity="'+obj.fillOpacity+'" stroke="'+obj.stroke+'" stroke-width="0.08" data-objkey="'+escapeXml(obj.key)+'" data-locked="'+(!!obj.locked)+'" data-name="'+escapeXml(obj.name)+'" data-fonction="'+escapeXml(obj.fonction||'')+'" data-matiere="'+escapeXml(obj.matiere||'')+'" data-priority="'+(obj.priority||0)+'" data-center="'+obj.center.x.toFixed(4)+','+obj.center.y.toFixed(4)+'" data-radius="'+obj.r.toFixed(4)+'"/>\n';
    }
    if(obj.showName){
      const cen = (obj.type==='polygon' || obj.type==='path') ? centroid(obj.pts||[]) : obj.center;
      const cs = exToSvg(cen);
      const fs = (obj.key==='parcelle'||obj.key==='maison') ? fsNameBig : fsNameSmall;
      body += '<text x="'+cs.x.toFixed(2)+'" y="'+cs.y.toFixed(2)+'" font-size="'+fs+'" font-weight="700" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif" fill="'+obj.stroke+'">'+escapeXml(obj.name)+'</text>\n';
    }
  });

  // draw visible measures (matches the live plan) + embed a hidden JSON copy for exact re-import
  const pcObjForExport = objets.find((o: ObjetPlan)=>o.key==='parcelle');
  mesures.forEach((m: Mesure)=>{
    if(!m.show || !pcObjForExport) return;
    const g = geometrieMesure(objets, m);
    if(!g) return;
    const anchor = ancrageHorsContour(g.p, sommetsDe(pcObjForExport), 2, {x:g.B.x-g.A.x, y:g.B.y-g.A.y});
    const pPt = exToSvg(g.p), pAnchor = exToSvg(anchor);
    body += '<line x1="'+pPt.x.toFixed(2)+'" y1="'+pPt.y.toFixed(2)+'" x2="'+pAnchor.x.toFixed(2)+'" y2="'+pAnchor.y.toFixed(2)+'" stroke="#1E6B8C" stroke-width="0.05" stroke-dasharray="0.15 0.1"/>\n';
    const value = (m.displayMode==='along') ? g.along : g.perp;
    const prefix = (m.displayMode==='along') ? '-&gt; ' : 'T ';
    body += '<text x="'+pAnchor.x.toFixed(2)+'" y="'+pAnchor.y.toFixed(2)+'" text-anchor="middle" font-size="'+fsVert+'" font-family="Helvetica Neue, Arial, sans-serif" fill="#0F4C63">'+prefix+value.toFixed(2)+' m</text>\n';
  });
  if(mesures.length){
    const measuresJSON = JSON.stringify(mesures.map((m: Mesure)=>({
      refObjKey:m.refObjKey, refSegIndex:m.refSegIndex, startEnd:m.startEnd,
      targetObjKey:m.targetObjKey, targetPtIndex:m.targetPtIndex, show:m.show, displayMode:m.displayMode
    })));
    body += '<g id="measures-data" data-measures="'+escapeXml(measuresJSON)+'" style="display:none"></g>\n';
  }

  const meters = niceStep(2.5);
  const sbX0 = w-meters-3, sbY0 = h-1.5;
  body += '<line x1="'+sbX0+'" y1="'+sbY0+'" x2="'+(sbX0+meters).toFixed(2)+'" y2="'+sbY0+'" stroke="#3B2E1F" stroke-width="0.1"/>\n';
  body += '<text x="'+sbX0+'" y="'+(sbY0+1.1).toFixed(2)+'" font-size="0.6" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif">0</text>\n';
  body += '<text x="'+(sbX0+meters).toFixed(2)+'" y="'+(sbY0+1.1).toFixed(2)+'" font-size="0.6" text-anchor="middle" font-family="Helvetica Neue, Arial, sans-serif">'+meters+' m</text>\n';

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w.toFixed(2)+' '+h.toFixed(2)+'" width="'+Math.round(w*exScale)+'" height="'+Math.round(h*exScale)+'" font-family="Helvetica Neue, Arial, sans-serif" data-plan-interactif="1" data-app-version="'+meta.appVersion+'" data-schema-version="'+meta.schemaVersion+'" data-minx="'+minx+'" data-pad="'+pad+'" data-maxy="'+maxy+'">\n'
    + '<rect width="'+w.toFixed(2)+'" height="'+h.toFixed(2)+'" fill="white"/>\n'
    + body
    + '</svg>';
}

