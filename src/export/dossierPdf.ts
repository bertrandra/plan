// Dossier PDF des terrasses (spec §3.2, export/).
//
// Ce document-la n'est pas le plan : c'est le dossier qu'on donne a l'artisan. Une page de plan de
// masse pour situer, puis une page par terrasse, cotee et avec ses equipements. Chaque page choisit
// son echelle pour tenir dans la feuille - un plan d'execution se lit a la regle, il ne se recadre
// pas au jugé.
//
// La cotation reporte ses lignes A L'EXTERIEUR du contour, et la normale sortante se deduit du SENS
// DE PARCOURS (aire signee), jamais d'une comparaison au centroide : sur une forme concave, le
// centroide peut tomber du mauvais cote d'un cote rentrant, et la cote partait alors vers
// l'interieur, par-dessus le trait.

import { dist, centroid, pointInPolygon, shoelace, signedArea } from '../geometry/basic.js';
import { FONCTIONS_HORS_EQUIPEMENT } from '../model/defaults.js';
import {
  A4_L, A4_H, MARGE_PDF, PT_PAR_METRE, assemblerPDF, pdfTexte, pdfPolygone, pdfCercle,
  pdfFlecheNord, pdfEchelleGraphique, echelleQuiTient, hexToRgb01
} from './pdf/writer.js';
import type { ObjetPlan, PtBrut } from '../model/types.js';
import type { PagePdf } from './pdf/writer.js';

/** Ce que le dossier PDF doit savoir en plus des objets : de quoi remplir titres et cartouches. */
export interface MetaDossier {
  appVersion: string;
  nomProjet?: string | null | undefined;
}

/** Point du plan avec de quoi calculer une projection PDF : `P(p)` rend des points en pt PostScript. */
type Projeteur = (p: PtBrut) => { x: number; y: number };

/** Reglages de `cotationPolygone`, tous facultatifs. */
interface OptionsCotation { decalage?: number; taille?: number; longueurMin?: number }

/** Reglages d'`anglesPolygone`, tous facultatifs. */
interface OptionsAngles { taille?: number }

function dimensionsObjet(o: ObjetPlan){
  if(o.type === 'circle'){
    return { libelle: 'diametre ' + (o.r!*2).toFixed(2).replace('.',',') + ' m',
             surface: Math.PI*o.r!*o.r!, largeur: o.r!*2, longueur: o.r!*2 };
  }
  const xs = (o.pts||[]).map(p=>p.x), ys = (o.pts||[]).map(p=>p.y);
  const l = Math.max(...xs)-Math.min(...xs), h = Math.max(...ys)-Math.min(...ys);
  if(o.type === 'path'){
    let L = 0;
    for(let i=0;i<(o.pts||[]).length-1;i++) L += dist(o.pts![i]!, o.pts![i+1]!);
    return { libelle: 'longueur ' + L.toFixed(2).replace('.',',') + ' m x ' + (o.width||0.5).toFixed(2).replace('.',',') + ' m',
             surface: L*(o.width||0.5), largeur:o.width||0.5, longueur:L };
  }
  return { libelle: 'emprise ' + Math.max(l,h).toFixed(2).replace('.',',') + ' x ' + Math.min(l,h).toFixed(2).replace('.',',') + ' m',
           surface: shoelace(o.pts||[]), largeur: Math.min(l,h), longueur: Math.max(l,h) };
}
// Equipements poses SUR une terrasse : centre a l'interieur du polygone. Les reperes (points de
// vue, limites cadastrales) et le terrain n'en sont pas. Le parasol non plus : sa toile n'est pas
// une emprise au sol, la coter sur un plan d'execution induirait en erreur.
// Angle interieur au sommet i, en degres.
function angleSommetDeg(pts: PtBrut[], i: number): number | null {
  const n = pts.length;
  const a = pts[(i-1+n)%n]!, b = pts[i]!, c = pts[(i+1)%n]!;
  const u = {x:a.x-b.x, y:a.y-b.y}, v = {x:c.x-b.x, y:c.y-b.y};
  const nu = Math.hypot(u.x,u.y), nv = Math.hypot(v.x,v.y);
  if(nu < 1e-9 || nv < 1e-9) return null;
  return Math.acos(Math.max(-1, Math.min(1, (u.x*v.x + u.y*v.y)/(nu*nv))))*180/Math.PI;
}
// Largeur approchee d'un texte Helvetica, pour centrer une cote sur sa ligne. Le PDF n'expose pas
// les metriques de la police ici : 0,5 em par caractere est l'ordre de grandeur usuel.
function largeurTexte(txt: unknown, taille: number): number { return String(txt).length * taille * 0.5; }

// Cotation d'un contour ferme : ligne de cote reportee a l'exterieur, lignes d'attache, valeur
// centree au-dessus de la ligne. La normale sortante se deduit du SENS DE PARCOURS du polygone
// (aire signee), pas d'une comparaison au centroide : sur une forme concave, le centroide peut
// tomber du mauvais cote d'un cote rentrant et la cote partait alors vers l'interieur, par-dessus
// le trait - exactement le defaut constate.
function cotationPolygone(pts: PtBrut[], P: Projeteur, opts?: OptionsCotation): string {
  const o = opts || {};
  const decalage = o.decalage || 17;
  const taille = o.taille || 7.5;
  const sens = signedArea(pts) > 0 ? 1 : -1;   // +1 = sens trigonometrique
  let c = '';
  pts.forEach((a, i)=>{
    const b = pts[(i+1) % pts.length]!;
    const lon = dist(a,b);
    if(lon < (o.longueurMin || 0.05)) return;
    const dx = (b.x-a.x)/lon, dy = (b.y-a.y)/lon;
    const nx = sens * dy, ny = sens * -dx;     // normale sortante
    const pa = P(a), pb = P(b);
    const ex = nx*decalage, ey = ny*decalage;
    const la = {x:pa.x+ex, y:pa.y+ey}, lb = {x:pb.x+ex, y:pb.y+ey};
    c += '0.45 0.38 0.30 RG 0.5 w [] 0 d\n';
    c += pa.x.toFixed(2)+' '+pa.y.toFixed(2)+' m '+(pa.x+ex*1.14).toFixed(2)+' '+(pa.y+ey*1.14).toFixed(2)+' l S\n';
    c += pb.x.toFixed(2)+' '+pb.y.toFixed(2)+' m '+(pb.x+ex*1.14).toFixed(2)+' '+(pb.y+ey*1.14).toFixed(2)+' l S\n';
    c += '0.7 w\n' + la.x.toFixed(2)+' '+la.y.toFixed(2)+' m '+lb.x.toFixed(2)+' '+lb.y.toFixed(2)+' l S\n';
    const txt = lon.toFixed(2).replace('.',',') + ' m';
    let ang = Math.atan2(b.y-a.y, b.x-a.x)*180/Math.PI;
    let ux = (lb.x-la.x), uy = (lb.y-la.y);
    const nu = Math.hypot(ux,uy) || 1; ux/=nu; uy/=nu;
    if(ang > 90 || ang < -90){ ang += 180; ux = -ux; uy = -uy; }   // jamais de texte a l'envers
    const larg = largeurTexte(txt, taille);
    const mid = {x:(la.x+lb.x)/2, y:(la.y+lb.y)/2};
    // 5 pt au-dessus de la ligne de cote : la ligne de base du texte ne doit pas la toucher.
    c += pdfTexte(mid.x - ux*larg/2 + nx*5, mid.y - uy*larg/2 + ny*5, taille, txt, [0.23,0.18,0.12], ang);
  });
  return c;
}
function anglesPolygone(pts: PtBrut[], P: Projeteur, opts?: OptionsAngles): string {
  const o = opts || {};
  const taille = o.taille || 6.5;
  let c = '';
  pts.forEach((s, i)=>{
    const ang = angleSommetDeg(pts, i);
    if(ang === null) return;
    const n = pts.length;
    const a = pts[(i-1+n)%n]!, b = pts[(i+1)%n]!;
    const u = {x:a.x-s.x, y:a.y-s.y}, v = {x:b.x-s.x, y:b.y-s.y};
    const nu = Math.hypot(u.x,u.y) || 1, nv = Math.hypot(v.x,v.y) || 1;
    let bx = u.x/nu + v.x/nv, by = u.y/nu + v.y/nv;
    const nb = Math.hypot(bx,by);
    if(nb < 1e-6){ bx = -(v.y/nv); by = v.x/nv; } else { bx/=nb; by/=nb; }
    const q = P(s);
    const txt = Math.round(ang) + ' deg';
    c += pdfTexte(q.x + bx*15 - largeurTexte(txt, taille)/2, q.y + by*15 - 2, taille, txt, [0.35,0.30,0.24]);
  });
  return c;
}
export function equipementsSurTerrasse(objets: ObjetPlan[], terrasse: ObjetPlan): ObjetPlan[] {
  return objets.filter(o=>{
    if(o === terrasse || o.hidden) return false;
    if(FONCTIONS_HORS_EQUIPEMENT.indexOf(o.fonction as string) >= 0) return false;
    const c = o.type === 'circle' ? o.center! : centroid(o.pts||[]);
    return pointInPolygon(c, terrasse.pts||[]);
  });
}

function pagePlanDeMasse(objets: ObjetPlan[], terrasses: ObjetPlan[], equipementsParTerrasse: Map<string, ObjetPlan[]>, avecEquipements: boolean, meta: MetaDossier): PagePdf {
  const parcelle = objets.find(o=>o.key==='parcelle') || objets.find(o=>o.fonction==='terrain');
  // Un plan de masse ne montre QUE la propriete : ni les parcelles voisines - seule la parcelle
  // principale est tracee -, ni le bati qui leur appartient. Trois marqueurs distinguent ce bati
  // secondaire, selon la facon dont il est entre dans le plan :
  //   - `voisinage` : import de voisinage depuis « Actualiser IGN » ;
  //   - `bdtopo.surParcellePrincipale === false` : import cadastre initial avec des voisines ;
  //   - a defaut, son centre tombe hors de la parcelle principale (batiment dessine a la main).
  const surPropriete = (o: ObjetPlan) => {
    if(o.voisinage) return false;
    const bdtopo = o.bdtopo as { surParcellePrincipale?: boolean } | undefined;
    if(bdtopo && bdtopo.surParcellePrincipale === false) return false;
    if(!parcelle) return true;
    return pointInPolygon(o.type === 'circle' ? o.center! : centroid(o.pts||[]), parcelle.pts||[]);
  };
  const batiments = objets.filter(o=>(o.fonction === 'batiment' || o.fonction === 'annexe') && !o.hidden && surPropriete(o));
  const aDessiner: ObjetPlan[] = [];
  if(parcelle) aDessiner.push(parcelle);
  batiments.forEach(b=>aDessiner.push(b));
  terrasses.forEach(t=>aDessiner.push(t));
  if(avecEquipements) terrasses.forEach(t=>(equipementsParTerrasse.get(t.key)||[]).forEach(e=>aDessiner.push(e)));
  const pts: PtBrut[] = [];
  aDessiner.forEach(o=>{
    if(o.type === 'circle'){ pts.push({x:o.center!.x-o.r!,y:o.center!.y-o.r!}, {x:o.center!.x+o.r!,y:o.center!.y+o.r!}); }
    else (o.pts||[]).forEach(p=>pts.push(p));
  });
  if(!pts.length) throw new Error('rien a dessiner');
  const minx = Math.min(...pts.map(p=>p.x)), maxx = Math.max(...pts.map(p=>p.x));
  const miny = Math.min(...pts.map(p=>p.y)), maxy = Math.max(...pts.map(p=>p.y));
  const hautTitre = 96, basCartouche = 54;
  const dispoL = A4_L - MARGE_PDF*2, dispoH = A4_H - MARGE_PDF*2 - hautTitre - basCartouche;
  // Les cotes de la parcelle sont reportees a l'exterieur de son contour : la place qu'elles
  // prennent doit etre reservee avant de choisir l'echelle, sinon elles sortent de la feuille.
  const MARGE_COTATION_MASSE = 30;
  const denom = echelleQuiTient(maxx-minx, maxy-miny,
    Math.max(40, dispoL - MARGE_COTATION_MASSE*2), Math.max(40, dispoH - MARGE_COTATION_MASSE*2));
  const k = PT_PAR_METRE/denom;
  const decX = MARGE_PDF + (dispoL - (maxx-minx)*k)/2;
  const decY = MARGE_PDF + basCartouche + (dispoH - (maxy-miny)*k)/2;
  const P: Projeteur = p => ({ x: decX + (p.x-minx)*k, y: decY + (p.y-miny)*k });

  let c = '';
  aDessiner.forEach(o=>{
    const fond = hexToRgb01(o.fill!), trait = hexToRgb01(o.stroke!);
    if(o.type === 'circle'){
      const q = P(o.center!);
      c += pdfCercle(q.x, q.y, o.r!*k, fond, trait, 0.9);
    } else if(o.type === 'path'){
      c += pdfPolygone((o.pts||[]).map(P), null, trait, Math.max(0.6, (o.width||0.5)*k), 1);
    } else {
      const estParcelle = (o === parcelle);
      c += pdfPolygone((o.pts||[]).map(P), estParcelle ? null : fond, trait, estParcelle ? 1.4 : 0.8, estParcelle ? 1 : 0.9);
    }
  });
  // Dimensions des cotes de la parcelle : c'est la cotation attendue sur un plan de masse.
  if(parcelle) c += cotationPolygone(parcelle.pts||[], P, {decalage:20, taille:7.5});
  // Reperes de section : le lecteur doit pouvoir relier une terrasse du plan de masse a sa page.
  terrasses.forEach((t, i)=>{
    const q = P(centroid(t.pts||[]));
    c += pdfCercle(q.x, q.y, 9, [1,1,1], [0.23,0.18,0.12], 1);
    c += pdfTexte(q.x-5, q.y-3, 9, 'S' + (i+1), [0.23,0.18,0.12]);
  });
  c += pdfFlecheNord(A4_L - MARGE_PDF - 20, A4_H - MARGE_PDF - hautTitre + 24);
  c += pdfEchelleGraphique(MARGE_PDF, MARGE_PDF + 26, k, denom);

  const nomProjet: string = meta.nomProjet || (parcelle && parcelle.name) || 'Plan';
  c += pdfTexte(MARGE_PDF, A4_H - MARGE_PDF - 14, 16, 'Plan de masse');
  c += pdfTexte(MARGE_PDF, A4_H - MARGE_PDF - 32, 10, nomProjet, [0.35,0.3,0.24]);
  const lieu = (parcelle && parcelle.nomLieu) ? parcelle.nomLieu : '';
  const cad = parcelle && parcelle.cadastre as { section?: string; numero?: string } | undefined;
  const ligneCad = cad ? ('Parcelle ' + (cad.section||'') + ' ' + String(cad.numero||'').replace(/^0+/,'') + (lieu ? ' - ' + lieu : '')) : lieu;
  if(ligneCad) c += pdfTexte(MARGE_PDF, A4_H - MARGE_PDF - 46, 9, ligneCad, [0.35,0.3,0.24]);
  if(parcelle) c += pdfTexte(MARGE_PDF, A4_H - MARGE_PDF - 60, 9, 'Surface parcelle : ' + shoelace(parcelle.pts||[]).toFixed(1).replace('.',',') + ' m2', [0.35,0.3,0.24]);
  c += pdfTexte(MARGE_PDF, A4_H - MARGE_PDF - 74, 9,
    terrasses.length + ' terrasse(s) au dossier : ' + terrasses.map((t,i)=>'S' + (i+1) + ' ' + t.name).join(', '), [0.35,0.3,0.24]);
  c += pdfTexte(MARGE_PDF, MARGE_PDF - 8, 7,
    'Genere le ' + new Date().toLocaleDateString('fr-FR') + ' - dimensions en metres, X+ = Est, Y+ = Nord - Plan interactif v' + meta.appVersion, [0.5,0.45,0.4]);
  return { l:A4_L, h:A4_H, contenu:c };
}

function pageTerrasse(terrasse: ObjetPlan, equipements: ObjetPlan[], indice: number, total: number, meta: MetaDossier): PagePdf {
  const pts: PtBrut[] = (terrasse.pts||[]).slice();
  equipements.forEach(o=>{
    if(o.type === 'circle'){ pts.push({x:o.center!.x-o.r!,y:o.center!.y-o.r!}, {x:o.center!.x+o.r!,y:o.center!.y+o.r!}); }
    else (o.pts||[]).forEach(p=>pts.push(p));
  });
  const minx = Math.min(...pts.map(p=>p.x)), maxx = Math.max(...pts.map(p=>p.x));
  const miny = Math.min(...pts.map(p=>p.y)), maxy = Math.max(...pts.map(p=>p.y));
  // Le tableau prend le bas de page ; le dessin occupe le reste, cote et donc un peu au large.
  const lignes = (terrasse.pts||[]).length + equipements.length + 6;
  const hautTableau = Math.min(300, 34 + lignes*14);
  const hautTitre = 66;
  const dispoL = A4_L - MARGE_PDF*2 - 40, dispoH = A4_H - MARGE_PDF*2 - hautTitre - hautTableau - 20;
  // La cotation est reportee a l'exterieur du contour (ligne de cote + texte) : elle deborde du
  // polygone d'environ 25 pt de chaque cote. Si l'echelle est choisie sur le seul polygone, ce
  // debord sort de la feuille sur une forme qui remplit deja la zone de dessin.
  const MARGE_COTATION = 26;
  const denom = echelleQuiTient(maxx-minx, maxy-miny,
    Math.max(40, dispoL - MARGE_COTATION*2), Math.max(40, dispoH - MARGE_COTATION*2));
  const k = PT_PAR_METRE/denom;
  const decX = MARGE_PDF + 20 + (dispoL - (maxx-minx)*k)/2;
  const decY = MARGE_PDF + hautTableau + 20 + (dispoH - (maxy-miny)*k)/2;
  const P: Projeteur = p => ({ x: decX + (p.x-minx)*k, y: decY + (p.y-miny)*k });

  let c = '';
  c += pdfPolygone((terrasse.pts||[]).map(P), hexToRgb01(terrasse.fill!), hexToRgb01(terrasse.stroke!), 1.2, 0.9);
  equipements.forEach(o=>{
    const fond = hexToRgb01(o.fill!), trait = hexToRgb01(o.stroke!);
    if(o.type === 'circle'){ const q = P(o.center!); c += pdfCercle(q.x, q.y, o.r!*k, fond, trait, 0.75); }
    else if(o.type === 'path') c += pdfPolygone((o.pts||[]).map(P), null, trait, Math.max(0.6,(o.width||0.5)*k), 1);
    else c += pdfPolygone((o.pts||[]).map(P), fond, trait, 0.8, 0.75);
  });
  // Cotation : la ligne de cote est REPORTEE a l'exterieur du contour, decalee d'une distance
  // fixe en points (donc constante sur le papier quelle que soit l'echelle), avec ses lignes
  // d'attache. Une cote posee sur le segment lui-meme se confond avec le trait de la terrasse et
  // devient illisible des que la forme se complique.
  c += cotationPolygone(terrasse.pts||[], P, {decalage:18, taille:7.5});
  c += anglesPolygone(terrasse.pts||[], P, {taille:6.5});
  equipements.forEach(o=>{
    const q = P(o.type === 'circle' ? o.center! : centroid(o.pts||[]));
    c += pdfTexte(q.x - 14, q.y - 3, 7, o.name, [0.15,0.12,0.08]);
  });
  // Fleche et echelle calees sur la PAGE, pas sur la zone de dessin recentree : avec un petit
  // objet, le decalage de centrage poussait la fleche au-dela du bord de la feuille.
  c += pdfFlecheNord(A4_L - MARGE_PDF - 20, A4_H - MARGE_PDF - hautTitre - 28);
  // Echelle a droite et bien au-dessus du tableau : posee juste au-dessus de lui, sa mention
  // « Echelle 1/x » venait se superposer au titre « Dimensions ».
  c += pdfEchelleGraphique(A4_L - MARGE_PDF - 150, MARGE_PDF + hautTableau + 34, k, denom);

  c += pdfTexte(MARGE_PDF, A4_H - MARGE_PDF - 14, 15, 'Section ' + indice + ' / ' + total + ' - ' + terrasse.name);
  const cons = terrasse.construction;
  const ptsSousTitre = terrasse.pts||[];
  const sousTitre = 'Surface ' + shoelace(ptsSousTitre).toFixed(2).replace('.',',') + ' m2' +
    ' - perimetre ' + ptsSousTitre.reduce((s,p,i)=>s + dist(p, ptsSousTitre[(i+1)%ptsSousTitre.length]!), 0).toFixed(2).replace('.',',') + ' m' +
    (cons && cons.essenceBois ? ' - ' + cons.essenceBois : '');
  c += pdfTexte(MARGE_PDF, A4_H - MARGE_PDF - 30, 9, sousTitre, [0.35,0.3,0.24]);

  // ---- tableau des dimensions ----
  let y = MARGE_PDF + hautTableau - 6;
  const colA = MARGE_PDF, colB = MARGE_PDF + 210, colC = MARGE_PDF + 350, colD = MARGE_PDF + 440;
  c += pdfTexte(colA, y, 10, 'Dimensions');
  y -= 15;
  c += '0.23 0.18 0.12 RG 0.7 w\n' + colA.toFixed(2)+' '+(y+9).toFixed(2)+' m '+(A4_L-MARGE_PDF).toFixed(2)+' '+(y+9).toFixed(2)+' l S\n';
  c += pdfTexte(colA, y, 8, 'Element', [0.4,0.35,0.3]) + pdfTexte(colB, y, 8, 'Cote / emprise', [0.4,0.35,0.3]) +
       pdfTexte(colC, y, 8, 'Surface', [0.4,0.35,0.3]) + pdfTexte(colD, y, 8, 'Angle au depart', [0.4,0.35,0.3]);
  y -= 13;
  const ptsTableau = terrasse.pts||[];
  ptsTableau.forEach((a, i)=>{
    const b = ptsTableau[(i+1) % ptsTableau.length]!;
    const nom =(terrasse.segmentNames && terrasse.segmentNames[i]) || ('Cote ' + (i+1));
    const ang = angleSommetDeg(ptsTableau, i);
    // L'angle porte sur le sommet ou le cote commence : c'est ce qu'on trace en premier sur place.
    c += pdfTexte(colA, y, 8, nom) + pdfTexte(colB, y, 8, dist(a,b).toFixed(2).replace('.',',') + ' m') +
         pdfTexte(colD, y, 8, ang === null ? '-' : (Math.round(ang) + ' deg'));
    y -= 12;
  });
  let perimetre = 0;
  ptsTableau.forEach((a,i)=>{ perimetre += dist(a, ptsTableau[(i+1)%ptsTableau.length]!); });
  c += '0.7 0.65 0.58 RG 0.5 w\n' + colA.toFixed(2)+' '+(y+9).toFixed(2)+' m '+(A4_L-MARGE_PDF).toFixed(2)+' '+(y+9).toFixed(2)+' l S\n';
  c += pdfTexte(colA, y, 8, 'Terrasse ' + terrasse.name) +
       pdfTexte(colB, y, 8, 'perimetre ' + perimetre.toFixed(2).replace('.',',') + ' m') +
       pdfTexte(colC, y, 8, shoelace(ptsTableau).toFixed(2).replace('.',',') + ' m2') +
       pdfTexte(colD, y, 8, ptsTableau.length + ' sommets');
  y -= 14;
  if(equipements.length){
    c += '0.7 0.65 0.58 RG 0.5 w\n' + colA.toFixed(2)+' '+(y+9).toFixed(2)+' m '+(A4_L-MARGE_PDF).toFixed(2)+' '+(y+9).toFixed(2)+' l S\n';
    equipements.forEach(o=>{
      const d = dimensionsObjet(o);
      c += pdfTexte(colA, y, 8, o.name) + pdfTexte(colB, y, 8, d.libelle) +
           pdfTexte(colC, y, 8, d.surface.toFixed(2).replace('.',',') + ' m2');
      y -= 12;
    });
    const empriseEquip = equipements.reduce((s,o)=>s + dimensionsObjet(o).surface, 0);
    const surfT = shoelace(terrasse.pts!);
    c += pdfTexte(colA, y, 8, 'Emprise equipements', [0.35,0.3,0.24]) +
         pdfTexte(colC, y, 8, empriseEquip.toFixed(2).replace('.',',') + ' m2', [0.35,0.3,0.24]) +
         pdfTexte(colD, y, 8, surfT > 0 ? (empriseEquip/surfT*100).toFixed(0) + ' %' : '-', [0.35,0.3,0.24]);
  }
  // Meme pied de page que le plan de masse : une section imprimee seule doit rester rattachable
  // a la version qui l'a produite (RELEASE.md 5.2).
  c += pdfTexte(MARGE_PDF, MARGE_PDF - 8, 7,
    'Genere le ' + new Date().toLocaleDateString('fr-FR') + ' - dimensions en metres - Plan interactif v' + meta.appVersion, [0.5,0.45,0.4]);
  return { l:A4_L, h:A4_H, contenu:c };
}

// Liste des terrasses a inclure, reconstruite a chaque ouverture de l'onglet Export : une
// terrasse ajoutee ou renommee entre-temps doit apparaitre, et les cases deja cochees rester
// cochees.

export function construireDossierPDF(objets: ObjetPlan[], cles: string[], avecEquipements: boolean, meta: MetaDossier) {
  const terrasses = objets.filter(o=>o.fonction === 'terrasse' && o.type === 'polygon' && cles.indexOf(o.key) >= 0);
  if(!terrasses.length) throw new Error('aucune terrasse selectionnee');
  const equipements = new Map<string, ObjetPlan[]>();
  terrasses.forEach(t=>equipements.set(t.key, avecEquipements ? equipementsSurTerrasse(objets, t) : []));
  const pages = [ pagePlanDeMasse(objets, terrasses, equipements, avecEquipements, meta) ];
  terrasses.forEach((t, i)=>pages.push(pageTerrasse(t, equipements.get(t.key)!, i+1, terrasses.length, meta)));
  return { pdf: assemblerPDF(pages), pages: pages.length, terrasses, equipements };
}

