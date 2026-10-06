// Ecrivain PDF fait main (spec §3.2, export/pdf/writer.ts).
//
// Aucune bibliotheque PDF n'est chargeable ici : le fichier est assemble a la main, objet par
// objet, avec sa table xref calculee. C'est fragile par nature - ajouter un objet sans recalculer
// les decalages produit un PDF que les lecteurs refusent - donc rien n'est retouche au deplacement.
//
// Les producteurs (export/pdfPlan.ts, export/dossierPdf.ts) lisent l'etat du plan. Seules les
// primitives d'ecriture, qui ne lisent que leurs arguments, sont ici.

import { au } from '../../util/tableaux.js';
import { APP_VERSION, BUILD_AT } from '../../model/version.js';
import { niceStep } from '../../util/format.js';

/** Page prete a assembler : dimensions en points PostScript et flux de contenu. */
export interface PagePdf {
  l: number;
  h: number;
  contenu: string;
}

/** Une couleur en composantes 0..1, l'unite des operateurs `rg` et `RG` du PDF. */
export type Rgb01 = [number, number, number];

/** A4 portrait, en points PostScript, et marge commune aux pages du dossier. */
export const A4_L = 595.28;
export const A4_H = 841.89;
export const PT_PAR_METRE = 2834.645;
export const MARGE_PDF = 42;
export const ECHELLES_DOSSIER = [10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000, 2000];

// ================= PDF export (hand-written minimal PDF, no external library available) =================
export function pdfEscape(s: unknown): string {
  const accentMap = {'À':'A','Á':'A','Â':'A','Ä':'A','à':'a','á':'a','â':'a','ä':'a',
    'É':'E','È':'E','Ê':'E','Ë':'E','é':'e','è':'e','ê':'e','ë':'e',
    'Î':'I','Ï':'I','î':'i','ï':'i','Ô':'O','Ö':'O','ô':'o','ö':'o',
    'Ù':'U','Û':'U','Ü':'U','ù':'u','û':'u','ü':'u','Ç':'C','ç':'c','œ':'oe','Œ':'OE','°':'deg'};
  let out = String(s).split('').map(c=>accentMap[c as keyof typeof accentMap]||c).join('');
  return out.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
}

// Date au format attendu par le dictionnaire /Info d'un PDF : D:AAAAMMJJHHMMSS, heure locale.
export function horodatagePdfInfo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2,'0');
  return 'D:' + d.getFullYear() + p(d.getMonth()+1) + p(d.getDate())
    + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

export function assemblerPDF(pages: PagePdf[]): string {
  // Numerotation : 1 Catalog, 2 Pages, 3 Font, puis (Page, Contenu) par page, puis les etats
  // graphiques d'opacite. Tout est calcule, rien n'est fige : le nombre de pages varie.
  const opacites = [1, 0.5, 0.35, 0.9, 0.75];
  const numPremierePage = 4;
  const kids = pages.map((_,i)=>(numPremierePage + i*2) + ' 0 R').join(' ');
  const numPremierGs = numPremierePage + pages.length*2;
  const dictGs = '<< ' + opacites.map((_v,i)=>'/GS' + i + ' ' + (numPremierGs+i) + ' 0 R').join(' ') + ' >>';
  const ressources = '<< /Font << /F1 3 0 R >> /ExtGState ' + dictGs + ' >>';
  const objs = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [' + kids + '] /Count ' + pages.length + ' >>');
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  pages.forEach((p, i)=>{
    const numContenu = numPremierePage + i*2 + 1;
    objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + p.l.toFixed(2) + ' ' + p.h.toFixed(2) + '] /Resources ' + ressources + ' /Contents ' + numContenu + ' 0 R >>');
    objs.push('<< /Length ' + p.contenu.length + ' >>\nstream\n' + p.contenu + '\nendstream');
  });
  opacites.forEach(v=>{ objs.push('<< /Type /ExtGState /ca ' + v.toFixed(3) + ' /CA ' + v.toFixed(3) + ' >>'); });
  // Dictionnaire /Info : un PDF finit imprime chez un artisan, sans la page qui l'a produit. La
  // version doit voyager avec le fichier (RELEASE.md 5.2). Ajoute en dernier pour ne decaler
  // aucune des numerotations calculees plus haut. Chaines en ASCII pur : un PDF sans encodage
  // declare rend le reste illisible.
  const numInfo = objs.length + 1;
  objs.push('<< /Producer (Plan interactif ' + APP_VERSION + ') /Creator (plan.html build ' + BUILD_AT
    + ') /CreationDate (' + horodatagePdfInfo() + ') >>');
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objs.forEach((corps,i)=>{ offsets.push(pdf.length); pdf += (i+1) + ' 0 obj\n' + corps + '\nendobj\n'; });
  const xref = pdf.length;
  pdf += 'xref\n0 ' + (objs.length+1) + '\n0000000000 65535 f \n';
  for(let i=1;i<=objs.length;i++) pdf += String(offsets[i]).padStart(10,'0') + ' 00000 n \n';
  pdf += 'trailer\n<< /Size ' + (objs.length+1) + ' /Root 1 0 R /Info ' + numInfo + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return pdf;
}

// Petites briques de dessin, en points PDF (origine en bas a gauche, Y vers le haut - c'est
// deja la convention du plan, donc pas d'inversion a faire).
export function pdfTexte(x: number, y: number, taille: number, txt: unknown, couleur?: Rgb01, angleDeg?: number): string {
  const c = couleur || [0.15,0.12,0.08];
  let s = 'BT /F1 ' + taille + ' Tf ' + c[0].toFixed(3) + ' ' + c[1].toFixed(3) + ' ' + c[2].toFixed(3) + ' rg ';
  if(angleDeg){
    const a = angleDeg*Math.PI/180, co = Math.cos(a), si = Math.sin(a);
    s += co.toFixed(4) + ' ' + si.toFixed(4) + ' ' + (-si).toFixed(4) + ' ' + co.toFixed(4) + ' ' + x.toFixed(2) + ' ' + y.toFixed(2) + ' Tm ';
  } else {
    s += x.toFixed(2) + ' ' + y.toFixed(2) + ' Td ';
  }
  return s + '(' + pdfEscape(txt) + ') Tj ET\n';
}

/**
 * Un gabarit de decoupe : tout le plan sauf les `trous` (en points PDF), en regle pair-impair
 * (`W* n`). Ce qui est peint ensuite, jusqu'au `Q` qui le leve, ne se dessine pas dans les trous —
 * qu'ils soient tout entiers dans la forme ou a cheval sur son bord. Vide sans trou.
 */
export function pdfDecoupeTrous(trous: { x: number; y: number }[][]): string {
  if(!trous.length) return '';
  let s = 'q\n-100000 -100000 m 100000 -100000 l 100000 100000 l -100000 100000 l h\n';
  trous.forEach(t=>{
    t.forEach((p,i)=>{ s += p.x.toFixed(2) + ' ' + p.y.toFixed(2) + ' ' + (i===0 ? 'm' : 'l') + '\n'; });
    s += 'h\n';
  });
  return s + 'W* n\n';
}

/** Un polygone ferme. `trous` (en points PDF) le percent : voir `pdfDecoupeTrous`. */
export function pdfPolygone(ptsPdf: { x: number; y: number }[], remplissage?: Rgb01 | null, contour?: Rgb01 | null, epaisseur?: number, opacite?: number, trous: { x: number; y: number }[][] = []): string {
  let s = pdfDecoupeTrous(trous);
  if(opacite !== undefined && opacite < 1) s += '/GS' + (opacite <= 0.4 ? 2 : (opacite <= 0.55 ? 1 : (opacite <= 0.8 ? 4 : 3))) + ' gs\n';
  if(remplissage) s += remplissage[0].toFixed(3) + ' ' + remplissage[1].toFixed(3) + ' ' + remplissage[2].toFixed(3) + ' rg\n';
  if(contour) s += contour[0].toFixed(3) + ' ' + contour[1].toFixed(3) + ' ' + contour[2].toFixed(3) + ' RG\n';
  s += (epaisseur || 0.8).toFixed(2) + ' w\n';
  ptsPdf.forEach((p,i)=>{ s += p.x.toFixed(2) + ' ' + p.y.toFixed(2) + ' ' + (i===0 ? 'm' : 'l') + '\n'; });
  s += 'h ' + (remplissage && contour ? 'B' : (remplissage ? 'f' : 'S')) + '\n';
  if(opacite !== undefined && opacite < 1) s += '/GS0 gs\n';
  // Le `Q` leve le gabarit et rend aussi l'etat graphique d'avant (couleurs, opacite).
  if(trous.length) s += 'Q\n';
  return s;
}

export function pdfCercle(cx: number, cy: number, r: number, remplissage?: Rgb01 | null, contour?: Rgb01 | null, opacite?: number): string {
  const k = 0.5523*r;
  let s = '';
  if(opacite !== undefined && opacite < 1) s += '/GS' + (opacite <= 0.4 ? 2 : (opacite <= 0.55 ? 1 : (opacite <= 0.8 ? 4 : 3))) + ' gs\n';
  if(remplissage) s += remplissage[0].toFixed(3) + ' ' + remplissage[1].toFixed(3) + ' ' + remplissage[2].toFixed(3) + ' rg\n';
  if(contour) s += contour[0].toFixed(3) + ' ' + contour[1].toFixed(3) + ' ' + contour[2].toFixed(3) + ' RG\n';
  s += '0.8 w\n' + (cx+r).toFixed(2) + ' ' + cy.toFixed(2) + ' m\n';
  s += (cx+r).toFixed(2)+' '+(cy+k).toFixed(2)+' '+(cx+k).toFixed(2)+' '+(cy+r).toFixed(2)+' '+cx.toFixed(2)+' '+(cy+r).toFixed(2)+' c\n';
  s += (cx-k).toFixed(2)+' '+(cy+r).toFixed(2)+' '+(cx-r).toFixed(2)+' '+(cy+k).toFixed(2)+' '+(cx-r).toFixed(2)+' '+cy.toFixed(2)+' c\n';
  s += (cx-r).toFixed(2)+' '+(cy-k).toFixed(2)+' '+(cx-k).toFixed(2)+' '+(cy-r).toFixed(2)+' '+cx.toFixed(2)+' '+(cy-r).toFixed(2)+' c\n';
  s += (cx+k).toFixed(2)+' '+(cy-r).toFixed(2)+' '+(cx+r).toFixed(2)+' '+(cy-k).toFixed(2)+' '+(cx+r).toFixed(2)+' '+cy.toFixed(2)+' c\n';
  s += 'h ' + (remplissage && contour ? 'B' : (remplissage ? 'f' : 'S')) + '\n';
  if(opacite !== undefined && opacite < 1) s += '/GS0 gs\n';
  return s;
}

export function pdfFlecheNord(x: number, y: number): string {
  let s = '0.23 0.18 0.12 RG 0.23 0.18 0.12 rg 1.4 w [] 0 d\n';
  s += x.toFixed(2)+' '+(y-4).toFixed(2)+' m '+x.toFixed(2)+' '+(y+16).toFixed(2)+' l S\n';
  s += (x-5).toFixed(2)+' '+(y+12).toFixed(2)+' m '+x.toFixed(2)+' '+(y+22).toFixed(2)+' l '+(x+5).toFixed(2)+' '+(y+12).toFixed(2)+' l h f\n';
  return s + pdfTexte(x+7, y+8, 10, 'N');
}

export function echelleQuiTient(largeurM: number, hauteurM: number, dispoL: number, dispoH: number): number {
  for(const d of ECHELLES_DOSSIER){
    const k = PT_PAR_METRE/d;
    if(largeurM*k <= dispoL && hauteurM*k <= dispoH) return d;
  }
  return au(ECHELLES_DOSSIER, ECHELLES_DOSSIER.length-1);
}

export function pdfEchelleGraphique(x: number, y: number, ptsParMetre: number, denom: number): string {
  const metres = niceStep(110/ptsParMetre);
  const longueur = metres*ptsParMetre;
  let s = '0.23 0.18 0.12 RG 1.2 w [] 0 d\n';
  s += x.toFixed(2)+' '+y.toFixed(2)+' m '+(x+longueur).toFixed(2)+' '+y.toFixed(2)+' l S\n';
  s += x.toFixed(2)+' '+(y-3).toFixed(2)+' m '+x.toFixed(2)+' '+(y+3).toFixed(2)+' l S\n';
  s += (x+longueur).toFixed(2)+' '+(y-3).toFixed(2)+' m '+(x+longueur).toFixed(2)+' '+(y+3).toFixed(2)+' l S\n';
  s += pdfTexte(x, y-11, 8, '0');
  s += pdfTexte(x+longueur-12, y-11, 8, metres + ' m');
  s += pdfTexte(x, y+8, 8, 'Echelle 1/' + denom);
  return s;
}

/**
 * Convertit une couleur `#rrggbb` en triplet 0..1, l'unite des operateurs `rg` et `RG` du PDF.
 *
 * Accepte la forme courte `#abc`, et retombe sur un gris moyen plutot que sur du noir quand la
 * couleur est absente : un objet sans couleur reste visible sans se faire passer pour un trait.
 */
export function hexToRgb01(hex: string | undefined): Rgb01 {
  hex = (hex || '#888888').replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const r = parseInt(hex.substr(0, 2), 16) / 255 || 0;
  const g = parseInt(hex.substr(2, 2), 16) / 255 || 0;
  const b = parseInt(hex.substr(4, 2), 16) / 255 || 0;
  return [r, g, b];
}
