// Ombre portee des parasols
//
// Deplace depuis legacy.ts sans retouche : l ordre des operations est conserve tel quel, y compris
// la ou il produit des artefacts de flottants. Ce sont eux qui prouvent que l arithmetique n a pas
// bouge (spec-migration-typescript.md §10.2) - les "nettoyer" serait un changement de comportement.

import { lireDate } from '../util/date.js';
import { positionSoleil } from '../geo/soleil.js';
import { pointInPolygon, shoelace } from '../geometry/basic.js';
import { aDesSommets, enCercle, enPoints, estCercle } from '../model/formes.js';
import type { ObjetPlan, PtBrut } from '../model/types.js';

/**
 * Contexte solaire : ce que les fonctions d'ombre lisaient dans la fermeture de boot() - la date
 * et l'heure choisies aux curseurs, et le lieu de la parcelle. Le passer explicitement est ce qui
 * rend l'ombre calculable hors navigateur (spec §4, phase 3).
 */
export interface ContexteSoleil {
  dateStr: string;
  minutes: number;
  lieu: { latitude: number; longitude: number };
}

/** En dessous de cette hauteur de soleil, l'ombre s'etire a l'infini : on ne la dessine plus. */
export const PARASOL_ELEV_MIN_DEG = 8;

/** Un echantillon de soleil, ramene a **un metre** de hauteur de mat : reutilisable tel quel. */
export interface EchantillonSoleil {
  /** Direction du parasol vers son ombre. */
  ux: number;
  uy: number;
  decalageParMetre: number;
  etirement: number;
}

/** L'ombre d'une toile circulaire : une ellipse, decalee et etiree a l'oppose du soleil. */
export interface GeometrieOmbre {
  cx: number;
  cy: number;
  ux: number;
  uy: number;
  demiGrand: number;
  demiPetit: number;
}

/** Une case de la carte d'ombrage : sa position, et la part du temps ou elle est a l'ombre. */
export interface CelluleOmbre { x: number; y: number; frac: number }

/** La carte d'ombrage d'une terrasse, ombragee par SES parasols et par eux seuls. */
export interface CarteOmbre {
  cells: CelluleOmbre[];
  pas: number;
  nEch: number;
  terrKey: string;
}

/** Une position candidate du parasol, avec son nombre de points-echantillons ombrages. */
interface CandidatPosition { x: number; y: number; angleDeg: number; score: number }


export function ombreInstantanee(par: ObjetPlan, ctx: ContexteSoleil): GeometrieOmbre | null {
  // Sans date lisible, pas de soleil a placer : pas d'ombre.
  const date = lireDate(ctx.dateStr);
  if(!date) return null;
  const lieu = ctx.lieu;
  const { elevRad, azRad } = positionSoleil(date.annee, date.mois, date.jour, ctx.minutes/60, lieu.latitude, lieu.longitude);
  if(elevRad*180/Math.PI < PARASOL_ELEV_MIN_DEG) return null;
  return geometrieOmbre(par, {
    ux: -Math.sin(azRad), uy: -Math.cos(azRad),
    decalageParMetre: 1/Math.tan(elevRad), etirement: 1/Math.sin(elevRad)
  });
}
// Quadrillage regulier des points interieurs a un polygone - sert deux fois : les points de la
// terrasse dont on mesure l'ombrage, et les positions candidates testees par la recherche.
export function grillePolygone(poly: PtBrut[], pas: number): PtBrut[] {
  const xs = poly.map(p=>p.x), ys = poly.map(p=>p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pts: PtBrut[] = [];
  for(let x=x0+pas/2; x<x1; x+=pas){
    for(let y=y0+pas/2; y<y1; y+=pas){
      if(pointInPolygon({x,y}, poly)) pts.push({x,y});
    }
  }
  return pts;
}
// Part du temps (sur la periode optimisee) ou chaque point de la terrasse est a l'ombre d'au moins
// un parasol. Recalcule a chaque rendu quand la carte est affichee : quelques milliers de tests,
// donc assez leger pour suivre un glisser en direct sans cache a invalider.
// Une carte par terrasse ayant au moins un parasol rattache, chacune ombragee uniquement par SES
// parasols : sur un jardin a plusieurs terrasses, chacune se lit independamment.
export function calculerCartesOmbre(ctx: ContexteSoleil, objets: ObjetPlan[]): CarteOmbre[] {
  // Un parasol est un cercle (DEFAUTS D-14).
  const parasols = objets.filter(o=>o.fonction==='parasol' && o.type==='circle' && !o.hidden);
  if(!parasols.length) return [];
  const ech = echantillonsSoleilParasol(ctx);
  if(!ech.length) return [];
  const parTerrasse = new Map<string, { terr: ObjetPlan; liste: ObjetPlan[] }>();
  parasols.forEach(p=>{
    const t = terrasseDuParasol(p, objets);
    if(!t) return;
    if(!parTerrasse.has(t.key)) parTerrasse.set(t.key, { terr:t, liste:[] });
    parTerrasse.get(t.key)!.liste.push(p);
  });
  const cartes: CarteOmbre[] = [];
  parTerrasse.forEach(({terr, liste})=>{
    const poly = enPoints(terr).pts;
    const aire = Math.abs(shoelace(poly));
    const pas = Math.max(0.15, Math.sqrt(aire/400));
    const pts = grillePolygone(poly, pas);
    const geos = ech.map(e=>liste.map(p=>geometrieOmbre(p, e)));
    const cells = pts.map(p=>{
      let n = 0;
      for(let i=0;i<geos.length;i++){
        for(let j=0;j<geos[i]!.length;j++){
          if(pointDansOmbre(p.x, p.y, geos[i]![j]!)){ n++; break; }
        }
      }
      return { x:p.x, y:p.y, frac: n/ech.length };
    });
    cartes.push({ cells, pas, nEch: ech.length, terrKey: terr.key });
  });
  return cartes;
}
// Teste un quadrillage de positions possibles SUR la terrasse et garde celle qui ombrage le plus
// de surface-heures sur la periode. Les autres parasols ne comptent pas dans le score : on cherche
// ce que celui-ci apporte, pas ce que l'ensemble couvre deja.
export function chercherMeilleurePositionParasol(par: ObjetPlan, ctx: ContexteSoleil, objets: ObjetPlan[]){
  const terr = terrasseDuParasol(par, objets);
  if(!terr) return null;
  const ech = echantillonsSoleilParasol(ctx);
  if(!ech.length) return null;
  const poly = enPoints(terr).pts;
  const aire = Math.abs(shoelace(poly));
  const cibles = grillePolygone(poly, Math.max(0.2, Math.sqrt(aire/250)));
  // Positions candidates du PIED : le pourtour seul si le mat doit y rester, sinon toute la
  // surface. Un deporte ajoute une seconde dimension de recherche (l'orientation du bras), d'ou
  // des quadrillages plus larges pour que le produit des deux reste calculable en ~1 s.
  const deporte = !!par.matDeporte;
  const angles = deporte ? Array.from({length:12}, (_,i)=>i*30) : [matAngleDe(par)];
  const candidats = par.matSurPerimetre
    ? pointsPerimetre(poly, Math.max(0.25, Math.sqrt(aire)/6))
    : grillePolygone(poly, Math.max(0.25, Math.sqrt(aire/(deporte ? 90 : 150))));
  if(!cibles.length || !candidats.length) return null;
  const h = hauteurParasolDe(par), r = enCercle(par).r;
  // `null as ...` : affecte dans une fermeture, que le compilateur ne suit pas — sans cette forme il
  // retrecit `best` a `null` pour de bon.
  let best = null as CandidatPosition | null;
  candidats.forEach(pied=>{
    angles.forEach(angDeg=>{
      // `pied` est la position du mat ; la toile (donc l'ombre) est decalee du bras pour un deporte.
      const a = angDeg*Math.PI/180;
      const toileX = deporte ? pied.x - r*Math.cos(a) : pied.x;
      const toileY = deporte ? pied.y - r*Math.sin(a) : pied.y;
      let score = 0;
      for(let i=0;i<ech.length;i++){
        const e = ech[i]!;
        const cx = toileX + h*e.decalageParMetre*e.ux, cy = toileY + h*e.decalageParMetre*e.uy;
        const aa = r*e.etirement, a2 = aa*aa, r2 = r*r;
        for(let k=0;k<cibles.length;k++){
          const dx = cibles[k]!.x-cx, dy = cibles[k]!.y-cy;
          const le = dx*e.ux + dy*e.uy, tr = -dx*e.uy + dy*e.ux;
          if((le*le)/a2 + (tr*tr)/r2 <= 1) score++;
        }
      }
      if(!best || score > best.score) best = { x:toileX, y:toileY, angleDeg:angDeg, score };
    });
  });
  if(!best) return null;
  return { x:best.x, y:best.y, angleDeg:best.angleDeg, couverture: best.score/(ech.length*cibles.length), nEch: ech.length };
}

export function hauteurParasolDe(par: ObjetPlan): number {
  return (par.hauteurParasol !== undefined && par.hauteurParasol !== null) ? par.hauteurParasol : 2.2;
}

export function geometrieOmbre(par: ObjetPlan, ech: EchantillonSoleil): GeometrieOmbre {
  const h = hauteurParasolDe(par), toile = enCercle(par);
  return {
    cx: toile.center.x + h*ech.decalageParMetre*ech.ux,
    cy: toile.center.y + h*ech.decalageParMetre*ech.uy,
    ux: ech.ux, uy: ech.uy,
    demiGrand: toile.r * ech.etirement,
    demiPetit: toile.r
  };
}

// Parasol deporte : le mat n'est pas au centre de la toile mais sur son bord, a `matAngleDeg` du
// centre (0 = Est, 90 = Nord, comme partout ailleurs dans le plan). `center` reste TOUJOURS le
// centre de la toile - c'est lui qui porte l'ombre, la surface et le cercle dessine ; seul le pied
// se deplace. Garder cette convention evite de recalculer l'ombre differemment selon le modele.
export function matAngleDe(par: ObjetPlan): number {
  return (par.matAngleDeg !== undefined && par.matAngleDeg !== null) ? par.matAngleDeg : 0;
}

/**
 * Position du **pied** du parasol. Sur un parasol droit c'est le centre de la toile ; sur un
 * deporte, un point de son bord.
 */
export function positionMat(par: ObjetPlan): PtBrut {
  const toile = enCercle(par);
  if(!par.matDeporte) return { x: toile.center.x, y: toile.center.y };
  const a = matAngleDe(par) * Math.PI/180;
  return { x: toile.center.x + toile.r*Math.cos(a), y: toile.center.y + toile.r*Math.sin(a) };
}

/** Decalage centre-de-toile → mat, pour replacer la toile a partir d'un pied impose. */
export function decalageMat(par: ObjetPlan): PtBrut {
  if(!par.matDeporte) return { x:0, y:0 };
  const a = matAngleDe(par) * Math.PI/180;
  return { x: enCercle(par).r*Math.cos(a), y: enCercle(par).r*Math.sin(a) };
}

/**
 * Point du bord du polygone le plus proche de `pt` : on projette sur chaque segment et on garde le
 * meilleur. Sert a coller le pied du parasol sur le pourtour de la terrasse.
 */
export function projeterSurPerimetre(pt: PtBrut, poly: PtBrut[]): PtBrut | null {
  let best: PtBrut | null = null, bestD2 = Infinity;
  for(let i=0, j=poly.length-1; i<poly.length; j=i++){
    const ax=poly[j]!.x, ay=poly[j]!.y, bx=poly[i]!.x, by=poly[i]!.y;
    const ex=bx-ax, ey=by-ay;
    const L2 = ex*ex+ey*ey;
    let t = L2 ? ((pt.x-ax)*ex + (pt.y-ay)*ey)/L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px=ax+t*ex, py=ay+t*ey;
    const d2 = (pt.x-px)*(pt.x-px) + (pt.y-py)*(pt.y-py);
    if(d2 < bestD2){ bestD2 = d2; best = {x:px, y:py}; }
  }
  return best;
}

/**
 * Applique la contrainte « pied en bordure » a tous les parasols qui la demandent.
 *
 * C'est le **pied** qu'on projette sur le pourtour, pas le centre de la toile — puis on redonne a la
 * toile la position correspondante. Sur un parasol deporte, projeter le centre collerait la toile au
 * bord et laisserait le pied dans le vide, a l'exterieur de la terrasse.
 *
 * Appelee a chaque rendu, donc la contrainte tient aussi **pendant** un glisser : l'objet suit le
 * curseur en restant colle au bord, au lieu de sauter a la fin du geste.
 */
export function contraindreParasols(objets: ObjetPlan[], terrasseSelectionnee?: string | null): void {
  objets.forEach(par=>{
    if(par.fonction!=='parasol' || !par.matSurPerimetre) return;
    const terr = terrasseDuParasol(par, objets, terrasseSelectionnee);
    if(!terr || !aDesSommets(terr) || terr.pts.length<3) return;
    const mat = positionMat(par);
    const cible = projeterSurPerimetre(mat, terr.pts);
    if(!cible) return;
    const toile = enCercle(par);
    toile.center.x += cible.x - mat.x;
    toile.center.y += cible.y - mat.y;
  });
}

// Points regulierement repartis le long du pourtour d'un polygone (positions candidates du pied
// quand il doit rester en bordure).
export function pointsPerimetre(poly: PtBrut[], pas: number): PtBrut[] {
  const out: PtBrut[] = [];
  for(let i=0, j=poly.length-1; i<poly.length; j=i++){
    const ax=poly[j]!.x, ay=poly[j]!.y, bx=poly[i]!.x, by=poly[i]!.y;
    const L = Math.hypot(bx-ax, by-ay);
    const n = Math.max(1, Math.round(L/pas));
    for(let k=0;k<n;k++){
      const t = k/n;
      out.push({ x: ax+(bx-ax)*t, y: ay+(by-ay)*t });
    }
  }
  return out;
}

export function pointDansOmbre(px: number, py: number, g: GeometrieOmbre): boolean {
  const dx = px-g.cx, dy = py-g.cy;
  const le = dx*g.ux + dy*g.uy, tr = -dx*g.uy + dy*g.ux;
  return (le*le)/(g.demiGrand*g.demiGrand) + (tr*tr)/(g.demiPetit*g.demiPetit) <= 1;
}

// Chaque parasol est rattache a UNE terrasse : c'est elle dont on mesure l'ombrage et sur laquelle
// la recherche de position cherche. Sans ce lien, un jardin a plusieurs terrasses verrait tous ses
// parasols optimises sur la meme (la premiere trouvee), ce qui n'a aucun sens.
export function terrasseDuParasol(par: ObjetPlan, objets: ObjetPlan[], terrasseSelectionnee?: string | null): ObjetPlan | undefined {
  if(par && par.terrasseLieeKey){
    const t = objets.find(o=>o.key===par.terrasseLieeKey && o.fonction==='terrasse');
    if(t) return t;
  }
  // Lien absent (projet enregistre avant cette option) ou terrasse supprimee / passee a une autre
  // fonction : on retombe sur celle qui contient physiquement le parasol, puis sur la premiere.
  if(par && estCercle(par)){
    const dessous = objets.find(o=>o.fonction==='terrasse' && aDesSommets(o) && pointInPolygon(par.center, o.pts));
    if(dessous) return dessous;
  }
  return objets.find(o=>o.key===terrasseSelectionnee && o.fonction==='terrasse')
      || objets.find(o=>o.fonction==='terrasse');
}

// Geometrie de l'ombre d'une toile circulaire horizontale, pour une position de soleil donnee :
// le disque se projette en ellipse, decalee de h/tan(hauteur) a l'oppose du soleil et etiree de
// 1/sin(hauteur) dans cette direction (la perpendiculaire, elle, garde le rayon de la toile).
// Renvoie la geometrie PAR METRE de hauteur de mat, pour pouvoir la reutiliser telle quelle sur
// n'importe quel parasol ou position candidate sans refaire le calcul solaire.
export function echantillonsSoleilParasol(ctx: ContexteSoleil): EchantillonSoleil[] {
  const annee = parseInt(ctx.dateStr.slice(0,4),10) || new Date().getFullYear();
  const lieu = ctx.lieu;
  const out: EchantillonSoleil[] = [];
  PARASOL_MOIS.forEach(m=>{
    PARASOL_HEURES.forEach(hh=>{
      const { elevRad, azRad } = positionSoleil(annee, m, 15, hh, lieu.latitude, lieu.longitude);
      if(elevRad*180/Math.PI < PARASOL_ELEV_MIN_DEG) return;
      const ux = -Math.sin(azRad), uy = -Math.cos(azRad); // du parasol vers son ombre
      out.push({ ux, uy, decalageParMetre: 1/Math.tan(elevRad), etirement: 1/Math.sin(elevRad) });
    });
  });
  return out;
}


export const PARASOL_MOIS = [5,6,7,8,9];
export const PARASOL_HEURES = [12,13,14,15,16,17,18];
