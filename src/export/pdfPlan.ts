// Export PDF du plan (spec §3.2, export/).
//
// Un PDF ecrit a la main, sans bibliotheque : le fichier doit tenir dans un seul HTML et une
// dependance de plusieurs centaines de kilo-octets ne se justifiait pas pour ce qu'on ecrit ici -
// des traits, des remplissages et du texte Helvetica.
//
// Le plan sort a une echelle DEMANDEE (1:200 par defaut) : c'est un document qu'on imprime et sur
// lequel on mesure a la regle. Toute la geometrie passe donc par `ptsPerMeter`, et jamais par la
// transformation de la vue a l'ecran.
//
// Les primitives d'ecriture (echappement, assemblage, table xref) vivent dans `pdf/writer.ts` ;
// ici, la mise en page.

import { niceStep } from '../util/format.js';
import { dist, centroid, angleInterieurDeg, shoelace } from '../geometry/basic.js';
import { geometrieMesure, ancrageHorsContour, type Mesure } from '../render/measures.js';
import type { ObjetPlan, PtBrut } from '../model/types.js';
import { enPoints } from '../model/formes.js';
import { etiquetteComposee, longueurEnMetres, angleEnDegres, SEP_EXPORT, DEGRE_EXPORT } from '../model/etiquettes.js';
import { pdfEscape, horodatagePdfInfo, hexToRgb01 } from './pdf/writer.js';
/** Ce que la mise en page doit savoir en plus des objets : de quoi remplir le cartouche. */
export interface MetaPdf {
  appVersion: string;
  buildAt: string;
  montrerNord: boolean;
}

export function construirePDF(
  objets: ObjetPlan[],
  mesures: (Mesure & { show?: boolean; displayMode?: string })[],
  scaleDenom: number,
  meta: MetaPdf
): string {
  scaleDenom = Math.max(1, scaleDenom || 200);
  const allPts: PtBrut[] = [];
  objets.forEach(o=>{
    if(o.type==='polygon'||o.type==='path') (o.pts||[]).forEach(p=>allPts.push(p));
    else { allPts.push({x:o.center.x-o.r,y:o.center.y-o.r}); allPts.push({x:o.center.x+o.r,y:o.center.y+o.r}); }
  });
  // also account for visible measure labels, which are placed outside the parcel and
  // would otherwise fall outside the page's computed bounding box (invisible/clipped)
  const pcObjForBBox = objets.find(o=>o.key==='parcelle');
  if(pcObjForBBox){
    mesures.forEach(m=>{
      if(!m.show) return;
      const g = geometrieMesure(objets, m);
      if(!g) return;
      const anchor = ancrageHorsContour(g.p, enPoints(pcObjForBBox).pts, 2, {x:g.B.x-g.A.x, y:g.B.y-g.A.y});
      // pad a little extra so the label TEXT (not just its anchor point) stays on the page
      allPts.push({x:anchor.x+anchor.dirX*0.6, y:anchor.y+anchor.dirY*0.6});
      allPts.push({x:g.p.x, y:g.p.y});
    });
  }
  const xs=allPts.map(p=>p.x).filter(Number.isFinite), ys=allPts.map(p=>p.y).filter(Number.isFinite);
  if(!xs.length) throw new Error('Rien a exporter');
  const minx=Math.min(...xs), maxx=Math.max(...xs), miny=Math.min(...ys), maxy=Math.max(...ys);

  const ptsPerMeter = 2834.645 / scaleDenom; // 1 point = 1/72 inch ; 1 m = 2834.645 pt at 1:1
  const margin = 36, titleArea = 74;
  const drawW = Math.max(1,(maxx-minx))*ptsPerMeter;
  const drawH = Math.max(1,(maxy-miny))*ptsPerMeter;
  const pageW = drawW + margin*2;
  const pageH = drawH + margin*2 + titleArea;

  function toPdf(p: PtBrut){ return { x: margin + (p.x-minx)*ptsPerMeter, y: margin + (p.y-miny)*ptsPerMeter }; }
  function pdfPathD(pts: PtBrut[], curve?: boolean){
    // mirrors the live pathD(): straight segments, or Catmull-Rom -> cubic Bezier when curve is on
    const s = pts.map(toPdf);
    const cmds: string[] = [];
    if(!curve || s.length<3){
      s.forEach((p,i)=>{ cmds.push(p.x.toFixed(2)+' '+p.y.toFixed(2)+' '+(i===0?'m':'l')); });
      return cmds.join('\n')+'\n';
    }
    cmds.push(s[0]!.x.toFixed(2)+' '+s[0]!.y.toFixed(2)+' m');
    for(let i=0;i<s.length-1;i++){
      const p0=s[Math.max(0,i-1)]!, p1=s[i]!, p2=s[i+1]!, p3=s[Math.min(s.length-1,i+2)]!;
      const c1 = {x:p1.x+(p2.x-p0.x)/6, y:p1.y+(p2.y-p0.y)/6};
      const c2 = {x:p2.x-(p3.x-p1.x)/6, y:p2.y-(p3.y-p1.y)/6};
      cmds.push(c1.x.toFixed(2)+' '+c1.y.toFixed(2)+' '+c2.x.toFixed(2)+' '+c2.y.toFixed(2)+' '+p2.x.toFixed(2)+' '+p2.y.toFixed(2)+' c');
    }
    return cmds.join('\n')+'\n';
  }

  // register one ExtGState per distinct fill-opacity value, so translucent fills
  // (e.g. Terrasse at 0.68) let objects underneath show through, matching the live plan
  const opacityValues: number[] = [...new Set(objets.map(o=>Math.round((o.fillOpacity!=null?o.fillOpacity:1)*100)/100))];
  if(!opacityValues.includes(1)) opacityValues.push(1);
  const gsName = (v: number) => 'GS'+Math.round(v*100);

  let content = '1 w\n';

  objets.forEach(obj=>{
    if(obj.type==='polygon'){
      const [fr,fg,fb] = hexToRgb01(obj.fill);
      const [sr,sg,sb] = hexToRgb01(obj.stroke);
      content += '/'+gsName(obj.fillOpacity!=null?obj.fillOpacity:1)+' gs\n';
      content += fr.toFixed(3)+' '+fg.toFixed(3)+' '+fb.toFixed(3)+' rg\n';
      content += sr.toFixed(3)+' '+sg.toFixed(3)+' '+sb.toFixed(3)+' RG\n';
      obj.pts.forEach((p,i)=>{
        const pp = toPdf(p);
        content += pp.x.toFixed(2)+' '+pp.y.toFixed(2)+' '+(i===0?'m':'l')+'\n';
      });
      content += 'h B\n';
      content += '/'+gsName(1)+' gs\n';
      const n = obj.pts.length;
      for(let i=0;i<n;i++){
        const a=obj.pts[i]!, b=obj.pts[(i+1)%n]!;
        const pa=toPdf(a), pb=toPdf(b);
        const segTxt = etiquetteComposee(obj.segmentNames![i]!, longueurEnMetres(dist(a,b)), obj.showSegNames, obj.showDims, SEP_EXPORT);
        if(segTxt){
          const mx=(pa.x+pb.x)/2, my=(pa.y+pb.y)/2;
          content += 'BT /F1 7 Tf 0.07 0.13 0.06 rg '+mx.toFixed(2)+' '+my.toFixed(2)+' Td ('+pdfEscape(segTxt)+') Tj ET\n';
        }
        const vName = obj.vertexNames![i]||'';
        const angleTxt = obj.showAngles ? angleEnDegres(angleInterieurDeg(obj.pts,i), DEGRE_EXPORT) : '';
        const vertTxt = etiquetteComposee(vName, angleTxt, obj.showVertNames, obj.showAngles, SEP_EXPORT);
        if(vertTxt){
          content += 'BT /F1 6.5 Tf 0.2 0.2 0.2 rg '+(pa.x+3).toFixed(2)+' '+(pa.y+3).toFixed(2)+' Td ('+pdfEscape(vertTxt)+') Tj ET\n';
        }
      }
    } else if(obj.type==='path'){
      const [sr,sg,sb] = hexToRgb01(obj.stroke);
      content += sr.toFixed(3)+' '+sg.toFixed(3)+' '+sb.toFixed(3)+' RG\n';
      content += Math.max(0.5,(obj.width||1)*ptsPerMeter).toFixed(2)+' w\n';
      content += pdfPathD(obj.pts, !!obj.curve);
      content += 'S\n1 w\n';
      for(let i=0;i<obj.pts.length-1;i++){
        const a=obj.pts[i]!, b=obj.pts[i+1]!;
        const pa=toPdf(a), pb=toPdf(b);
        const segTxt = etiquetteComposee(obj.segmentNames![i]||('Cote '+(i+1)), longueurEnMetres(dist(a,b)), obj.showSegNames, obj.showDims, SEP_EXPORT);
        if(segTxt){
          const mx=(pa.x+pb.x)/2, my=(pa.y+pb.y)/2;
          content += 'BT /F1 7 Tf 0.07 0.13 0.06 rg '+mx.toFixed(2)+' '+my.toFixed(2)+' Td ('+pdfEscape(segTxt)+') Tj ET\n';
        }
      }
      if(obj.showVertNames){
        obj.pts.forEach((p,i)=>{
          const pp = toPdf(p);
          content += 'BT /F1 6.5 Tf 0.2 0.2 0.2 rg '+(pp.x+3).toFixed(2)+' '+(pp.y+3).toFixed(2)+' Td ('+pdfEscape(obj.vertexNames![i]||'')+') Tj ET\n';
        });
      }
    } else {
      const [fr,fg,fb] = hexToRgb01(obj.fill);
      const [sr,sg,sb] = hexToRgb01(obj.stroke);
      content += '/'+gsName(obj.fillOpacity!=null?obj.fillOpacity:1)+' gs\n';
      content += fr.toFixed(3)+' '+fg.toFixed(3)+' '+fb.toFixed(3)+' rg\n';
      content += sr.toFixed(3)+' '+sg.toFixed(3)+' '+sb.toFixed(3)+' RG\n';
      content += '0.6 w\n';
      const c = toPdf(obj.center);
      const r = obj.r*ptsPerMeter, k = 0.5523;
      content += (c.x+r).toFixed(2)+' '+c.y.toFixed(2)+' m\n';
      [[c.x+r,c.y+r*k,c.x+r*k,c.y+r,c.x,c.y+r],
       [c.x-r*k,c.y+r,c.x-r,c.y+r*k,c.x-r,c.y],
       [c.x-r,c.y-r*k,c.x-r*k,c.y-r,c.x,c.y-r],
       [c.x+r*k,c.y-r,c.x+r,c.y-r*k,c.x+r,c.y]].forEach(a=>{
        content += a.map(v=>v.toFixed(2)).join(' ')+' c\n';
      });
      content += 'B\n1 w\n';
      content += '/'+gsName(1)+' gs\n';
    }
    if(obj.showName){
      const cen = (obj.type==='polygon'||obj.type==='path') ? centroid(obj.pts) : obj.center;
      const cp = toPdf(cen);
      const [sr,sg,sb] = hexToRgb01(obj.stroke);
      content += 'BT /F1 9 Tf '+sr.toFixed(3)+' '+sg.toFixed(3)+' '+sb.toFixed(3)+' rg '+cp.x.toFixed(2)+' '+cp.y.toFixed(2)+' Td ('+pdfEscape(obj.name)+') Tj ET\n';
    }
  });

  // measures (only those with "Afficher" checked, same rule as the live plan and the SVG export)
  const pcObjPdf = objets.find(o=>o.key==='parcelle');
  mesures.forEach(m=>{
    if(!m.show || !pcObjPdf) return;
    const g = geometrieMesure(objets, m);
    if(!g) return;
    const anchor = ancrageHorsContour(g.p, enPoints(pcObjPdf).pts, 2, {x:g.B.x-g.A.x, y:g.B.y-g.A.y});
    const pPt = toPdf(g.p), pAnchor = toPdf(anchor);
    content += '0.118 0.420 0.549 RG\n0.8 w [3 2] 0 d\n';
    content += pPt.x.toFixed(2)+' '+pPt.y.toFixed(2)+' m '+pAnchor.x.toFixed(2)+' '+pAnchor.y.toFixed(2)+' l S\n';
    content += '[] 0 d\n'; // reset dash pattern
    const value = (m.displayMode==='along') ? g.along : g.perp;
    const prefix = (m.displayMode==='along') ? '-> ' : 'T ';
    content += 'BT /F1 8 Tf 0.059 0.298 0.388 rg '+pAnchor.x.toFixed(2)+' '+pAnchor.y.toFixed(2)+' Td ('+prefix+value.toFixed(2)+' m) Tj ET\n';
  });

  // north arrow (fixed in the top-right corner of the drawing area), respects the same
  // "Afficher la fleche Nord" checkbox as the live plan and the SVG export
  if(meta.montrerNord){
    const nx = margin+drawW-14, ny = margin+drawH-28;
    content += '0.23 0.18 0.12 RG 0.23 0.18 0.12 rg 1.4 w [] 0 d\n';
    content += nx.toFixed(2)+' '+(ny-4).toFixed(2)+' m '+nx.toFixed(2)+' '+(ny+16).toFixed(2)+' l S\n';
    content += (nx-5).toFixed(2)+' '+(ny+12).toFixed(2)+' m '+nx.toFixed(2)+' '+(ny+22).toFixed(2)+' l '+(nx+5).toFixed(2)+' '+(ny+12).toFixed(2)+' l h f\n';
    content += 'BT /F1 10 Tf '+(nx+4).toFixed(2)+' '+(ny+4).toFixed(2)+' Td (N) Tj ET\n';
  }

  // title block
  content += '0.23 0.18 0.12 rg\n';
  content += 'BT /F1 14 Tf '+margin.toFixed(2)+' '+(pageH-margin-16).toFixed(2)+' Td (Plan interactif - Parcelle AE 101) Tj ET\n';
  content += 'BT /F1 9 Tf '+margin.toFixed(2)+' '+(pageH-margin-34).toFixed(2)+' Td (Echelle 1/'+scaleDenom+' - genere le '+new Date().toLocaleDateString('fr-FR')+' - Plan interactif v'+meta.appVersion+') Tj ET\n';

  // scene.scale bar (nice round length, sized to look reasonable on paper regardless of scene.scale)
  const barMeters = niceStep(120/ptsPerMeter);
  const barPts = barMeters*ptsPerMeter;
  const sbX = margin, sbY = pageH-margin-58;
  content += '0.23 0.18 0.12 RG\n1.2 w\n';
  content += sbX.toFixed(2)+' '+sbY.toFixed(2)+' m '+(sbX+barPts).toFixed(2)+' '+sbY.toFixed(2)+' l S\n';
  content += 'BT /F1 8 Tf '+sbX.toFixed(2)+' '+(sbY-11).toFixed(2)+' Td (0) Tj ET\n';
  content += 'BT /F1 8 Tf '+(sbX+barPts-14).toFixed(2)+' '+(sbY-11).toFixed(2)+' Td ('+barMeters+' m) Tj ET\n';

  // ---- second page: surfaces summary table ----
  const pcObjSurf = objets.find(o=>o.key==='parcelle');
  const sParcelleSurf = pcObjSurf ? shoelace(enPoints(pcObjSurf).pts) : 0;
  const surfRows = objets.map(o=>{
    let s;
    if(o.type==='polygon') s = shoelace(o.pts);
    else if(o.type==='circle') s = Math.PI*o.r*o.r;
    else { let L=0; for(let i=0;i<o.pts.length-1;i++) L+=dist(o.pts[i]!,o.pts[i+1]!); s = L*(o.width||1); }
    return {name:o.name, key:o.key, s};
  });
  let totalHors = 0;
  surfRows.forEach(r=>{ if(r.key!=='parcelle') totalHors += r.s; });

  const rowH = 18, tblTop = 40, colName = margin, colSurf = margin+280, colPct = margin+400;
  const tblMargin = 36;
  const page2H = tblTop + margin + rowH*(surfRows.length+3) + 30;
  const page2W = pageW;

  let content2 = '';
  content2 += '0.23 0.18 0.12 rg\n';
  content2 += 'BT /F1 14 Tf '+tblMargin.toFixed(2)+' '+(page2H-tblMargin).toFixed(2)+' Td (Tableau des surfaces) Tj ET\n';
  let ry = page2H - tblMargin - 30;
  content2 += 'BT /F1 9 Tf '+colName.toFixed(2)+' '+ry.toFixed(2)+' Td (Objet) Tj ET\n';
  content2 += 'BT /F1 9 Tf '+colSurf.toFixed(2)+' '+ry.toFixed(2)+' Td (Surface) Tj ET\n';
  content2 += 'BT /F1 9 Tf '+colPct.toFixed(2)+' '+ry.toFixed(2)+' Td (% parcelle) Tj ET\n';
  content2 += '0.6 w 0.23 0.18 0.12 RG\n'+colName.toFixed(2)+' '+(ry-6).toFixed(2)+' m '+(page2W-tblMargin).toFixed(2)+' '+(ry-6).toFixed(2)+' l S\n';
  ry -= rowH;
  surfRows.forEach(r=>{
    const pct = (r.key!=='parcelle' && sParcelleSurf>0) ? (r.s/sParcelleSurf*100).toFixed(1)+' %' : '-';
    content2 += 'BT /F1 9 Tf 0.15 0.12 0.08 rg '+colName.toFixed(2)+' '+ry.toFixed(2)+' Td ('+pdfEscape(r.name)+') Tj ET\n';
    content2 += 'BT /F1 9 Tf '+colSurf.toFixed(2)+' '+ry.toFixed(2)+' Td ('+r.s.toFixed(2)+' m2) Tj ET\n';
    content2 += 'BT /F1 9 Tf '+colPct.toFixed(2)+' '+ry.toFixed(2)+' Td ('+pct+') Tj ET\n';
    ry -= rowH;
  });
  content2 += '0.6 w 0.23 0.18 0.12 RG\n'+colName.toFixed(2)+' '+(ry+8).toFixed(2)+' m '+(page2W-tblMargin).toFixed(2)+' '+(ry+8).toFixed(2)+' l S\n';
  ry -= 4;
  content2 += 'BT /F1 9 Tf 0.23 0.18 0.12 rg '+colName.toFixed(2)+' '+ry.toFixed(2)+' Td (Emprise totale hors parcelle) Tj ET\n';
  content2 += 'BT /F1 9 Tf '+colSurf.toFixed(2)+' '+ry.toFixed(2)+' Td ('+totalHors.toFixed(2)+' m2) Tj ET\n';
  if(sParcelleSurf>0){
    content2 += 'BT /F1 9 Tf '+colPct.toFixed(2)+' '+ry.toFixed(2)+' Td ('+(totalHors/sParcelleSurf*100).toFixed(1)+' %) Tj ET\n';
  }

  const objs = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>');
  const gsStartNum = 8; // objets 1..7 are Catalog/Pages/Page1/Content1/Font/Page2/Content2
  const extGStateDict = '<< ' + opacityValues.map((v,i)=>'/'+gsName(v)+' '+(gsStartNum+i)+' 0 R').join(' ') + ' >>';
  const resourcesDict = '<< /Font << /F1 5 0 R >> /ExtGState '+extGStateDict+' >>';
  objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+pageW.toFixed(2)+' '+pageH.toFixed(2)+'] /Resources '+resourcesDict+' /Contents 4 0 R >>');
  objs.push('<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+page2W.toFixed(2)+' '+page2H.toFixed(2)+'] /Resources '+resourcesDict+' /Contents 7 0 R >>');
  objs.push('<< /Length '+content2.length+' >>\nstream\n'+content2+'\nendstream');
  opacityValues.forEach(v=>{
    objs.push('<< /Type /ExtGState /ca '+v.toFixed(3)+' /CA '+v.toFixed(3)+' >>');
  });

  // Dictionnaire /Info : un PDF finit imprime chez un artisan, sans la page qui l'a produit. La
  // version doit voyager avec le fichier (RELEASE.md 5.2). Ajoute en dernier pour ne decaler
  // aucune des numerotations calculees plus haut. Chaines en ASCII pur : un PDF sans encodage
  // declare rend le reste illisible.
  const numInfo = objs.length + 1;
  objs.push('<< /Producer (Plan interactif ' + meta.appVersion + ') /Creator (plan.html build ' + meta.buildAt
    + ') /CreationDate (' + horodatagePdfInfo() + ') >>');
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objs.forEach((body,i)=>{
    offsets.push(pdf.length);
    pdf += (i+1)+' 0 obj\n'+body+'\nendobj\n';
  });
  const xrefOffset = pdf.length;
  pdf += 'xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n';
  for(let i=1;i<=objs.length;i++) pdf += String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf += 'trailer\n<< /Size '+(objs.length+1)+' /Root 1 0 R /Info '+numInfo+' 0 R >>\nstartxref\n'+xrefOffset+'\n%%EOF';
  return pdf;
}

