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

import { au } from '../util/tableaux.js';
import { niceStep } from '../util/format.js';
import { dist, centroid, angleInterieurDeg, shoelace } from '../geometry/basic.js';
import { geometrieMesure, ancrageHorsContour, type Mesure } from '../render/measures.js';
import type { ObjetPlan, ObjetPolygone, ObjetChemin, ObjetCercle, PtBrut } from '../model/types.js';
import { enPoints } from '../model/formes.js';
import { trousDeTerrasse, surfaceNetteTerrasse } from '../engine/structure.js';
import { estTerrasse } from '../model/fonctions.js';
import { etiquetteComposee, longueurEnMetres, angleEnDegres, SEP_EXPORT, DEGRE_EXPORT } from '../model/etiquettes.js';
import { pdfEscape, horodatagePdfInfo, hexToRgb01 } from './pdf/writer.js';
/** Ce que la mise en page doit savoir en plus des objets : de quoi remplir le cartouche. */
export interface MetaPdf {
  appVersion: string;
  buildAt: string;
  montrerNord: boolean;
}

/** La mise en page du plan : ce que chaque morceau dessine doit savoir pour placer un point. */
interface MisePage {
  /** Un point du plan en points PDF, a l'echelle demandee. */
  toPdf: (p: PtBrut) => { x: number; y: number };
  ptsPerMeter: number;
  /** Le nom de l'ExtGState d'une opacite de remplissage. */
  gsName: (v: number) => string;
}

type MesurePdf = Mesure & { show?: boolean; displayMode?: string };

/**
 * L'emprise a dessiner : tous les objets, et les etiquettes des cotes affichees — posees hors de la
 * parcelle, elles tomberaient sinon hors de la page (coupees).
 */
function emprise(objets: ObjetPlan[], mesures: MesurePdf[]) {
  const allPts: PtBrut[] = [];
  objets.forEach(o=>{
    if(o.type==='polygon'||o.type==='path') (o.pts||[]).forEach(p=>allPts.push(p));
    else { allPts.push({x:o.center.x-o.r,y:o.center.y-o.r}); allPts.push({x:o.center.x+o.r,y:o.center.y+o.r}); }
  });
  const pcObjForBBox = objets.find(o=>o.key==='parcelle');
  if(pcObjForBBox){
    mesures.forEach(m=>{
      if(!m.show) return;
      const g = geometrieMesure(objets, m);
      if(!g) return;
      const anchor = ancrageHorsContour(g.p, enPoints(pcObjForBBox).pts, 2, {x:g.B.x-g.A.x, y:g.B.y-g.A.y});
      // un peu de marge, pour que le TEXTE de l'etiquette (pas seulement son ancrage) reste sur la page
      allPts.push({x:anchor.x+anchor.dirX*0.6, y:anchor.y+anchor.dirY*0.6});
      allPts.push({x:g.p.x, y:g.p.y});
    });
  }
  const xs=allPts.map(p=>p.x).filter(Number.isFinite), ys=allPts.map(p=>p.y).filter(Number.isFinite);
  if(!xs.length) throw new Error('Rien a exporter');
  return { minx:Math.min(...xs), maxx:Math.max(...xs), miny:Math.min(...ys), maxy:Math.max(...ys) };
}

/** Le trace d'un chemin, comme `pathD` a l'ecran : des segments, ou Catmull-Rom -> Bezier cubique. */
function pdfPathD(m: MisePage, pts: PtBrut[], curve?: boolean): string {
  const s = pts.map(m.toPdf);
  const cmds: string[] = [];
  if(!curve || s.length<3){
    s.forEach((p,i)=>{ cmds.push(p.x.toFixed(2)+' '+p.y.toFixed(2)+' '+(i===0?'m':'l')); });
    return cmds.join('\n')+'\n';
  }
  cmds.push(au(s, 0).x.toFixed(2)+' '+au(s, 0).y.toFixed(2)+' m');
  for(let i=0;i<s.length-1;i++){
    const p0=au(s, Math.max(0,i-1)), p1=au(s, i), p2=au(s, i+1), p3=au(s, Math.min(s.length-1,i+2));
    const c1 = {x:p1.x+(p2.x-p0.x)/6, y:p1.y+(p2.y-p0.y)/6};
    const c2 = {x:p2.x-(p3.x-p1.x)/6, y:p2.y-(p3.y-p1.y)/6};
    cmds.push(c1.x.toFixed(2)+' '+c1.y.toFixed(2)+' '+c2.x.toFixed(2)+' '+c2.y.toFixed(2)+' '+p2.x.toFixed(2)+' '+p2.y.toFixed(2)+' c');
  }
  return cmds.join('\n')+'\n';
}

/** Remplissage et trait d'un objet plein, avec son opacite. */
function couleursPleines(m: MisePage, obj: ObjetPlan): string {
  const [fr,fg,fb] = hexToRgb01(obj.fill);
  const [sr,sg,sb] = hexToRgb01(obj.stroke);
  return '/'+m.gsName(obj.fillOpacity!=null?obj.fillOpacity:1)+' gs\n'
    + fr.toFixed(3)+' '+fg.toFixed(3)+' '+fb.toFixed(3)+' rg\n'
    + sr.toFixed(3)+' '+sg.toFixed(3)+' '+sb.toFixed(3)+' RG\n';
}

/** L'etiquette d'un cote, a son milieu. */
function etiquetteCote(pa: { x: number; y: number }, pb: { x: number; y: number }, texte: string): string {
  if(!texte) return '';
  const mx=(pa.x+pb.x)/2, my=(pa.y+pb.y)/2;
  return 'BT /F1 7 Tf 0.07 0.13 0.06 rg '+mx.toFixed(2)+' '+my.toFixed(2)+' Td ('+pdfEscape(texte)+') Tj ET\n';
}

function dessinerPolygone(m: MisePage, obj: ObjetPolygone, trous: PtBrut[][]): string {
  let c = couleursPleines(m, obj);
  // Une terrasse percee (bassin, tremie) : chaque trou est un sous-chemin, rempli en pair-impair.
  [obj.pts, ...trous].forEach((anneau, k)=>{
    if(k > 0) c += 'h\n';
    anneau.forEach((p,i)=>{
      const pp = m.toPdf(p);
      c += pp.x.toFixed(2)+' '+pp.y.toFixed(2)+' '+(i===0?'m':'l')+'\n';
    });
  });
  c += trous.length ? 'h B*\n' : 'h B\n';
  c += '/'+m.gsName(1)+' gs\n';
  const n = obj.pts.length;
  for(let i=0;i<n;i++){
    const a=au(obj.pts, i), b=au(obj.pts, (i+1)%n);
    const pa=m.toPdf(a), pb=m.toPdf(b);
    c += etiquetteCote(pa, pb, etiquetteComposee(obj.segmentNames?.[i] ?? '', longueurEnMetres(dist(a,b)), obj.showSegNames, obj.showDims, SEP_EXPORT));
    const vName = obj.vertexNames?.[i]||'';
    const angleTxt = obj.showAngles ? angleEnDegres(angleInterieurDeg(obj.pts,i), DEGRE_EXPORT) : '';
    const vertTxt = etiquetteComposee(vName, angleTxt, obj.showVertNames, obj.showAngles, SEP_EXPORT);
    if(vertTxt){
      c += 'BT /F1 6.5 Tf 0.2 0.2 0.2 rg '+(pa.x+3).toFixed(2)+' '+(pa.y+3).toFixed(2)+' Td ('+pdfEscape(vertTxt)+') Tj ET\n';
    }
  }
  return c;
}

function dessinerChemin(m: MisePage, obj: ObjetChemin): string {
  const [sr,sg,sb] = hexToRgb01(obj.stroke);
  let c = sr.toFixed(3)+' '+sg.toFixed(3)+' '+sb.toFixed(3)+' RG\n';
  c += Math.max(0.5,(obj.width||1)*m.ptsPerMeter).toFixed(2)+' w\n';
  c += pdfPathD(m, obj.pts, !!obj.curve);
  c += 'S\n1 w\n';
  for(let i=0;i<obj.pts.length-1;i++){
    const a=au(obj.pts, i), b=au(obj.pts, i+1);
    c += etiquetteCote(m.toPdf(a), m.toPdf(b), etiquetteComposee(obj.segmentNames?.[i]||('Cote '+(i+1)), longueurEnMetres(dist(a,b)), obj.showSegNames, obj.showDims, SEP_EXPORT));
  }
  if(obj.showVertNames){
    obj.pts.forEach((p,i)=>{
      const pp = m.toPdf(p);
      c += 'BT /F1 6.5 Tf 0.2 0.2 0.2 rg '+(pp.x+3).toFixed(2)+' '+(pp.y+3).toFixed(2)+' Td ('+pdfEscape(obj.vertexNames?.[i]||'')+') Tj ET\n';
    });
  }
  return c;
}

/** Un cercle en quatre arcs de Bezier : la constante 0,5523 est celle du quart de cercle. */
function dessinerCercle(m: MisePage, obj: ObjetCercle): string {
  let c = couleursPleines(m, obj);
  c += '0.6 w\n';
  const ce = m.toPdf(obj.center);
  const r = obj.r*m.ptsPerMeter, k = 0.5523;
  c += (ce.x+r).toFixed(2)+' '+ce.y.toFixed(2)+' m\n';
  [[ce.x+r,ce.y+r*k,ce.x+r*k,ce.y+r,ce.x,ce.y+r],
   [ce.x-r*k,ce.y+r,ce.x-r,ce.y+r*k,ce.x-r,ce.y],
   [ce.x-r,ce.y-r*k,ce.x-r*k,ce.y-r,ce.x,ce.y-r],
   [ce.x+r*k,ce.y-r,ce.x+r,ce.y-r*k,ce.x+r,ce.y]].forEach(a=>{
    c += a.map(v=>v.toFixed(2)).join(' ')+' c\n';
  });
  c += 'B\n1 w\n';
  c += '/'+m.gsName(1)+' gs\n';
  return c;
}

function dessinerObjet(m: MisePage, obj: ObjetPlan, objets: ObjetPlan[]): string {
  let c = obj.type==='polygon' ? dessinerPolygone(m, obj, trousDeTerrasse(obj, objets)) : obj.type==='path' ? dessinerChemin(m, obj) : dessinerCercle(m, obj);
  if(obj.showName){
    const cen = (obj.type==='polygon'||obj.type==='path') ? centroid(obj.pts) : obj.center;
    const cp = m.toPdf(cen);
    const [sr,sg,sb] = hexToRgb01(obj.stroke);
    c += 'BT /F1 9 Tf '+sr.toFixed(3)+' '+sg.toFixed(3)+' '+sb.toFixed(3)+' rg '+cp.x.toFixed(2)+' '+cp.y.toFixed(2)+' Td ('+pdfEscape(obj.name)+') Tj ET\n';
  }
  return c;
}

/** Les cotes cochees « Afficher », meme regle que le plan a l'ecran et l'export SVG. */
function dessinerCotes(m: MisePage, objets: ObjetPlan[], mesures: MesurePdf[]): string {
  let c = '';
  const pcObjPdf = objets.find(o=>o.key==='parcelle');
  mesures.forEach(me=>{
    if(!me.show || !pcObjPdf) return;
    const g = geometrieMesure(objets, me);
    if(!g) return;
    const anchor = ancrageHorsContour(g.p, enPoints(pcObjPdf).pts, 2, {x:g.B.x-g.A.x, y:g.B.y-g.A.y});
    const pPt = m.toPdf(g.p), pAnchor = m.toPdf(anchor);
    c += '0.118 0.420 0.549 RG\n0.8 w [3 2] 0 d\n';
    c += pPt.x.toFixed(2)+' '+pPt.y.toFixed(2)+' m '+pAnchor.x.toFixed(2)+' '+pAnchor.y.toFixed(2)+' l S\n';
    c += '[] 0 d\n'; // fin du pointille
    const value = (me.displayMode==='along') ? g.along : g.perp;
    const prefix = (me.displayMode==='along') ? '-> ' : 'T ';
    c += 'BT /F1 8 Tf 0.059 0.298 0.388 rg '+pAnchor.x.toFixed(2)+' '+pAnchor.y.toFixed(2)+' Td ('+prefix+value.toFixed(2)+' m) Tj ET\n';
  });
  return c;
}

/** La fleche du nord (coin haut droit du dessin), le titre, l'echelle et la barre d'echelle. */
function habillage(m: MisePage, cadre: { margin: number; drawW: number; drawH: number; pageH: number }, scaleDenom: number, meta: MetaPdf): string {
  const { margin, drawW, drawH, pageH } = cadre;
  let c = '';
  if(meta.montrerNord){
    const nx = margin+drawW-14, ny = margin+drawH-28;
    c += '0.23 0.18 0.12 RG 0.23 0.18 0.12 rg 1.4 w [] 0 d\n';
    c += nx.toFixed(2)+' '+(ny-4).toFixed(2)+' m '+nx.toFixed(2)+' '+(ny+16).toFixed(2)+' l S\n';
    c += (nx-5).toFixed(2)+' '+(ny+12).toFixed(2)+' m '+nx.toFixed(2)+' '+(ny+22).toFixed(2)+' l '+(nx+5).toFixed(2)+' '+(ny+12).toFixed(2)+' l h f\n';
    c += 'BT /F1 10 Tf '+(nx+4).toFixed(2)+' '+(ny+4).toFixed(2)+' Td (N) Tj ET\n';
  }
  c += '0.23 0.18 0.12 rg\n';
  c += 'BT /F1 14 Tf '+margin.toFixed(2)+' '+(pageH-margin-16).toFixed(2)+' Td (Plan interactif - Parcelle AE 101) Tj ET\n';
  c += 'BT /F1 9 Tf '+margin.toFixed(2)+' '+(pageH-margin-34).toFixed(2)+' Td (Echelle 1/'+scaleDenom+' - genere le '+new Date().toLocaleDateString('fr-FR')+' - Plan interactif v'+meta.appVersion+') Tj ET\n';
  // Une longueur ronde, de taille raisonnable sur le papier quelle que soit l'echelle.
  const barMeters = niceStep(120/m.ptsPerMeter);
  const barPts = barMeters*m.ptsPerMeter;
  const sbX = margin, sbY = pageH-margin-58;
  c += '0.23 0.18 0.12 RG\n1.2 w\n';
  c += sbX.toFixed(2)+' '+sbY.toFixed(2)+' m '+(sbX+barPts).toFixed(2)+' '+sbY.toFixed(2)+' l S\n';
  c += 'BT /F1 8 Tf '+sbX.toFixed(2)+' '+(sbY-11).toFixed(2)+' Td (0) Tj ET\n';
  c += 'BT /F1 8 Tf '+(sbX+barPts-14).toFixed(2)+' '+(sbY-11).toFixed(2)+' Td ('+barMeters+' m) Tj ET\n';
  return c;
}

/** La seconde page : le tableau des surfaces, et leur part de la parcelle. */
function pageSurfaces(objets: ObjetPlan[], margin: number, pageW: number): { content: string; hauteur: number } {
  const pcObjSurf = objets.find(o=>o.key==='parcelle');
  const sParcelleSurf = pcObjSurf ? shoelace(enPoints(pcObjSurf).pts) : 0;
  const surfRows = objets.map(o=>{
    let s;
    // Une terrasse percee compte sans son trou (bassin, tremie) : c'est la surface qu'on pose.
    if(o.type==='polygon') s = estTerrasse(o) ? surfaceNetteTerrasse(o.pts, objets) : shoelace(o.pts);
    else if(o.type==='circle') s = Math.PI*o.r*o.r;
    else { let L=0; for(let i=0;i<o.pts.length-1;i++) L+=dist(au(o.pts, i),au(o.pts, i+1)); s = L*(o.width||1); }
    return {name:o.name, key:o.key, s};
  });
  let totalHors = 0;
  surfRows.forEach(r=>{ if(r.key!=='parcelle') totalHors += r.s; });

  const rowH = 18, tblTop = 40, colName = margin, colSurf = margin+280, colPct = margin+400;
  const tblMargin = 36;
  const page2H = tblTop + margin + rowH*(surfRows.length+3) + 30;
  let c = '';
  c += '0.23 0.18 0.12 rg\n';
  c += 'BT /F1 14 Tf '+tblMargin.toFixed(2)+' '+(page2H-tblMargin).toFixed(2)+' Td (Tableau des surfaces) Tj ET\n';
  let ry = page2H - tblMargin - 30;
  c += 'BT /F1 9 Tf '+colName.toFixed(2)+' '+ry.toFixed(2)+' Td (Objet) Tj ET\n';
  c += 'BT /F1 9 Tf '+colSurf.toFixed(2)+' '+ry.toFixed(2)+' Td (Surface) Tj ET\n';
  c += 'BT /F1 9 Tf '+colPct.toFixed(2)+' '+ry.toFixed(2)+' Td (% parcelle) Tj ET\n';
  c += '0.6 w 0.23 0.18 0.12 RG\n'+colName.toFixed(2)+' '+(ry-6).toFixed(2)+' m '+(pageW-tblMargin).toFixed(2)+' '+(ry-6).toFixed(2)+' l S\n';
  ry -= rowH;
  surfRows.forEach(r=>{
    const pct = (r.key!=='parcelle' && sParcelleSurf>0) ? (r.s/sParcelleSurf*100).toFixed(1)+' %' : '-';
    c += 'BT /F1 9 Tf 0.15 0.12 0.08 rg '+colName.toFixed(2)+' '+ry.toFixed(2)+' Td ('+pdfEscape(r.name)+') Tj ET\n';
    c += 'BT /F1 9 Tf '+colSurf.toFixed(2)+' '+ry.toFixed(2)+' Td ('+r.s.toFixed(2)+' m2) Tj ET\n';
    c += 'BT /F1 9 Tf '+colPct.toFixed(2)+' '+ry.toFixed(2)+' Td ('+pct+') Tj ET\n';
    ry -= rowH;
  });
  c += '0.6 w 0.23 0.18 0.12 RG\n'+colName.toFixed(2)+' '+(ry+8).toFixed(2)+' m '+(pageW-tblMargin).toFixed(2)+' '+(ry+8).toFixed(2)+' l S\n';
  ry -= 4;
  c += 'BT /F1 9 Tf 0.23 0.18 0.12 rg '+colName.toFixed(2)+' '+ry.toFixed(2)+' Td (Emprise totale hors parcelle) Tj ET\n';
  c += 'BT /F1 9 Tf '+colSurf.toFixed(2)+' '+ry.toFixed(2)+' Td ('+totalHors.toFixed(2)+' m2) Tj ET\n';
  if(sParcelleSurf>0){
    c += 'BT /F1 9 Tf '+colPct.toFixed(2)+' '+ry.toFixed(2)+' Td ('+(totalHors/sParcelleSurf*100).toFixed(1)+' %) Tj ET\n';
  }
  return { content: c, hauteur: page2H };
}

/** Deux pages, une police, une ExtGState par opacite, le dictionnaire /Info et la table xref. */
function assemblerPdf(pages: { content: string; w: number; h: number }[], opacityValues: number[], gsName: (v: number) => string, meta: MetaPdf): string {
  const [p1, p2] = pages;
  if(!p1 || !p2) throw new Error('Le PDF du plan a deux pages.');
  const objs = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>');
  const gsStartNum = 8; // les objets 1 a 7 sont Catalog/Pages/Page1/Content1/Font/Page2/Content2
  const extGStateDict = '<< ' + opacityValues.map((v,i)=>'/'+gsName(v)+' '+(gsStartNum+i)+' 0 R').join(' ') + ' >>';
  const resourcesDict = '<< /Font << /F1 5 0 R >> /ExtGState '+extGStateDict+' >>';
  objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+p1.w.toFixed(2)+' '+p1.h.toFixed(2)+'] /Resources '+resourcesDict+' /Contents 4 0 R >>');
  objs.push('<< /Length '+p1.content.length+' >>\nstream\n'+p1.content+'\nendstream');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+p2.w.toFixed(2)+' '+p2.h.toFixed(2)+'] /Resources '+resourcesDict+' /Contents 7 0 R >>');
  objs.push('<< /Length '+p2.content.length+' >>\nstream\n'+p2.content+'\nendstream');
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

export function construirePDF(
  objets: ObjetPlan[],
  mesures: MesurePdf[],
  scaleDenom: number,
  meta: MetaPdf
): string {
  scaleDenom = Math.max(1, scaleDenom || 200);
  const { minx, maxx, miny, maxy } = emprise(objets, mesures);
  const ptsPerMeter = 2834.645 / scaleDenom; // 1 point = 1/72 pouce ; 1 m = 2834,645 pt a 1:1
  const margin = 36, titleArea = 74;
  const drawW = Math.max(1,(maxx-minx))*ptsPerMeter;
  const drawH = Math.max(1,(maxy-miny))*ptsPerMeter;
  const pageW = drawW + margin*2;
  const pageH = drawH + margin*2 + titleArea;

  // Une ExtGState par opacite de remplissage distincte : un remplissage translucide (la terrasse a
  // 0,68) laisse voir ce qu'il recouvre, comme sur le plan a l'ecran.
  const opacityValues: number[] = [...new Set(objets.map(o=>Math.round((o.fillOpacity!=null?o.fillOpacity:1)*100)/100))];
  if(!opacityValues.includes(1)) opacityValues.push(1);
  const mise: MisePage = {
    toPdf: (p) => ({ x: margin + (p.x-minx)*ptsPerMeter, y: margin + (p.y-miny)*ptsPerMeter }),
    ptsPerMeter,
    gsName: (v) => 'GS'+Math.round(v*100)
  };

  const content = '1 w\n'
    + objets.map(o => dessinerObjet(mise, o, objets)).join('')
    + dessinerCotes(mise, objets, mesures)
    + habillage(mise, { margin, drawW, drawH, pageH }, scaleDenom, meta);
  const surfaces = pageSurfaces(objets, margin, pageW);
  return assemblerPdf([{ content, w: pageW, h: pageH }, { content: surfaces.content, w: pageW, h: surfaces.hauteur }],
    opacityValues, mise.gsName, meta);
}
