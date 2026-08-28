// Ombre portee des parasols
//
// Deplace depuis legacy.ts sans retouche : l ordre des operations est conserve tel quel, y compris
// la ou il produit des artefacts de flottants. Ce sont eux qui prouvent que l arithmetique n a pas
// bouge (spec-migration-typescript.md §10.2) - les "nettoyer" serait un changement de comportement.

import { positionSoleil } from '../geo/soleil.js';
import { pointInPolygon, shoelace } from '../geometry/basic.js';

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

export function ombreInstantanee(par, ctx: ContexteSoleil){
  const [annee, mois, jour] = ctx.dateStr.split('-').map(Number);
  const lieu = ctx.lieu;
  const { elevRad, azRad } = positionSoleil(annee, mois, jour, ctx.minutes/60, lieu.latitude, lieu.longitude);
  if(elevRad*180/Math.PI < PARASOL_ELEV_MIN_DEG) return null;
  return geometrieOmbre(par, {
    ux: -Math.sin(azRad), uy: -Math.cos(azRad),
    decalageParMetre: 1/Math.tan(elevRad), etirement: 1/Math.sin(elevRad)
  });
}
// Quadrillage regulier des points interieurs a un polygone - sert deux fois : les points de la
// terrasse dont on mesure l'ombrage, et les positions candidates testees par la recherche.
export function grillePolygone(poly, pas){
  const xs = poly.map(p=>p.x), ys = poly.map(p=>p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pts = [];
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
export function calculerCartesOmbre(ctx: ContexteSoleil, objets){
  const parasols = objets.filter(o=>o.fonction==='parasol' && !o.hidden);
  if(!parasols.length) return [];
  const ech = echantillonsSoleilParasol(ctx);
  if(!ech.length) return [];
  const parTerrasse = new Map();
  parasols.forEach(p=>{
    const t = terrasseDuParasol(p, objets);
    if(!t) return;
    if(!parTerrasse.has(t.key)) parTerrasse.set(t.key, { terr:t, liste:[] });
    parTerrasse.get(t.key).liste.push(p);
  });
  const cartes = [];
  parTerrasse.forEach(({terr, liste})=>{
    const aire = Math.abs(shoelace(terr.pts));
    const pas = Math.max(0.15, Math.sqrt(aire/400));
    const pts = grillePolygone(terr.pts, pas);
    const geos = ech.map(e=>liste.map(p=>geometrieOmbre(p, e)));
    const cells = pts.map(p=>{
      let n = 0;
      for(let i=0;i<geos.length;i++){
        for(let j=0;j<geos[i].length;j++){
          if(pointDansOmbre(p.x, p.y, geos[i][j])){ n++; break; }
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
export function chercherMeilleurePositionParasol(par, ctx: ContexteSoleil, objets){
  const terr = terrasseDuParasol(par, objets);
  if(!terr) return null;
  const ech = echantillonsSoleilParasol(ctx);
  if(!ech.length) return null;
  const aire = Math.abs(shoelace(terr.pts));
  const cibles = grillePolygone(terr.pts, Math.max(0.2, Math.sqrt(aire/250)));
  // Positions candidates du PIED : le pourtour seul si le mat doit y rester, sinon toute la
  // surface. Un deporte ajoute une seconde dimension de recherche (l'orientation du bras), d'ou
  // des quadrillages plus larges pour que le produit des deux reste calculable en ~1 s.
  const deporte = !!par.matDeporte;
  const angles = deporte ? Array.from({length:12}, (_,i)=>i*30) : [matAngleDe(par)];
  const candidats = par.matSurPerimetre
    ? pointsPerimetre(terr.pts, Math.max(0.25, Math.sqrt(aire)/6))
    : grillePolygone(terr.pts, Math.max(0.25, Math.sqrt(aire/(deporte ? 90 : 150))));
  if(!cibles.length || !candidats.length) return null;
  const h = hauteurParasolDe(par), r = par.r;
  let best = null;
  candidats.forEach(pied=>{
    angles.forEach(angDeg=>{
      // `pied` est la position du mat ; la toile (donc l'ombre) est decalee du bras pour un deporte.
      const a = angDeg*Math.PI/180;
      const toileX = deporte ? pied.x - r*Math.cos(a) : pied.x;
      const toileY = deporte ? pied.y - r*Math.sin(a) : pied.y;
      let score = 0;
      for(let i=0;i<ech.length;i++){
        const e = ech[i];
        const cx = toileX + h*e.decalageParMetre*e.ux, cy = toileY + h*e.decalageParMetre*e.uy;
        const aa = r*e.etirement, a2 = aa*aa, r2 = r*r;
        for(let k=0;k<cibles.length;k++){
          const dx = cibles[k].x-cx, dy = cibles[k].y-cy;
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

export function hauteurParasolDe(par){
  return (par.hauteurParasol !== undefined && par.hauteurParasol !== null) ? par.hauteurParasol : 2.2;
}

export function geometrieOmbre(par, ech){
  const h = hauteurParasolDe(par);
  return {
    cx: par.center.x + h*ech.decalageParMetre*ech.ux,
    cy: par.center.y + h*ech.decalageParMetre*ech.uy,
    ux: ech.ux, uy: ech.uy,
    demiGrand: par.r * ech.etirement,
    demiPetit: par.r
  };
}

// Parasol deporte : le mat n'est pas au centre de la toile mais sur son bord, a `matAngleDeg` du
// centre (0 = Est, 90 = Nord, comme partout ailleurs dans le plan). `center` reste TOUJOURS le
// centre de la toile - c'est lui qui porte l'ombre, la surface et le cercle dessine ; seul le pied
// se deplace. Garder cette convention evite de recalculer l'ombre differemment selon le modele.
export function matAngleDe(par){
  return (par.matAngleDeg !== undefined && par.matAngleDeg !== null) ? par.matAngleDeg : 0;
}

// Points regulierement repartis le long du pourtour d'un polygone (positions candidates du pied
// quand il doit rester en bordure).
export function pointsPerimetre(poly, pas){
  const out = [];
  for(let i=0, j=poly.length-1; i<poly.length; j=i++){
    const ax=poly[j].x, ay=poly[j].y, bx=poly[i].x, by=poly[i].y;
    const L = Math.hypot(bx-ax, by-ay);
    const n = Math.max(1, Math.round(L/pas));
    for(let k=0;k<n;k++){
      const t = k/n;
      out.push({ x: ax+(bx-ax)*t, y: ay+(by-ay)*t });
    }
  }
  return out;
}

export function pointDansOmbre(px, py, g){
  const dx = px-g.cx, dy = py-g.cy;
  const le = dx*g.ux + dy*g.uy, tr = -dx*g.uy + dy*g.ux;
  return (le*le)/(g.demiGrand*g.demiGrand) + (tr*tr)/(g.demiPetit*g.demiPetit) <= 1;
}

// Chaque parasol est rattache a UNE terrasse : c'est elle dont on mesure l'ombrage et sur laquelle
// la recherche de position cherche. Sans ce lien, un jardin a plusieurs terrasses verrait tous ses
// parasols optimises sur la meme (la premiere trouvee), ce qui n'a aucun sens.
export function terrasseDuParasol(par, objets, terrasseSelectionnee?){
  if(par && par.terrasseLieeKey){
    const t = objets.find(o=>o.key===par.terrasseLieeKey && o.fonction==='terrasse');
    if(t) return t;
  }
  // Lien absent (projet enregistre avant cette option) ou terrasse supprimee / passee a une autre
  // fonction : on retombe sur celle qui contient physiquement le parasol, puis sur la premiere.
  if(par && par.center){
    const dessous = objets.find(o=>o.fonction==='terrasse' && o.pts && pointInPolygon(par.center, o.pts));
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
export function echantillonsSoleilParasol(ctx: ContexteSoleil){
  const annee = parseInt(ctx.dateStr.slice(0,4),10) || new Date().getFullYear();
  const lieu = ctx.lieu;
  const out = [];
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
