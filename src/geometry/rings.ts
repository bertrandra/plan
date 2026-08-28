// Anneaux : fusion de parcelles mitoyennes par annulation des cotes partages
// (spec §3.2, geometry/rings.ts). Deplace depuis legacy.ts sans retouche.

import type { PtBrut } from '../model/types.js';
import { distancePointSegment } from './segments.js';

/** Resultat d'une fusion : le contour exterieur, et les limites internes devenues invisibles. */
export interface AnneauxFusionnes {
  contour: PtBrut[];
  limites: { a: PtBrut; b: PtBrut }[];
}

export function memePoint(a: PtBrut, b: PtBrut, tol: number): boolean { return Math.hypot(a.x-b.x, a.y-b.y) <= tol; }

// Une limite commune n'est pas forcement decoupee pareil des deux cotes : le voisin peut avoir un
// sommet au milieu de mon arete. Sans ce redecoupage, les deux aretes ne se reconnaissent pas et
// la limite interne resterait dans le contour.
export function decouperAnneau(anneau: PtBrut[], sommetsAutres: PtBrut[], tol: number): PtBrut[] {
  const out = [];
  for(let i=0;i<anneau.length;i++){
    const a = anneau[i], b = anneau[(i+1)%anneau.length];
    out.push(a);
    const len = Math.hypot(b.x-a.x, b.y-a.y);
    if(len < tol) continue;
    const inseres = [];
    sommetsAutres.forEach(s=>{
      if(memePoint(s,a,tol) || memePoint(s,b,tol)) return;
      if(distancePointSegment(s, a, b) > tol) return;
      const t = ((s.x-a.x)*(b.x-a.x) + (s.y-a.y)*(b.y-a.y))/(len*len);
      if(t > 0 && t < 1) inseres.push({ t, p:{x:s.x, y:s.y} });
    });
    inseres.sort((u,v)=>u.t-v.t);
    inseres.forEach((u,k)=>{ if(k===0 || u.t - inseres[k-1].t > 1e-9) out.push(u.p); });
  }
  return out;
}

// Recolle les aretes internes bout a bout : une limite entre deux parcelles arrive en plusieurs
// segments (un par arete cadastrale), un seul trait est plus lisible et plus manipulable.
export function chainerSegments(segments: { a: PtBrut; b: PtBrut }[], tol: number): PtBrut[][] {
  const restants = segments.map(s=>({a:s[0], b:s[1], pris:false}));
  const chaines = [];
  restants.forEach(seg=>{
    if(seg.pris) return;
    seg.pris = true;
    const chaine = [seg.a, seg.b];
    let avance = true;
    while(avance){
      avance = false;
      for(const autre of restants){
        if(autre.pris) continue;
        const fin = chaine[chaine.length-1], debut = chaine[0];
        if(memePoint(autre.a, fin, tol)){ chaine.push(autre.b); autre.pris = true; avance = true; }
        else if(memePoint(autre.b, fin, tol)){ chaine.push(autre.a); autre.pris = true; avance = true; }
        else if(memePoint(autre.b, debut, tol)){ chaine.unshift(autre.a); autre.pris = true; avance = true; }
        else if(memePoint(autre.a, debut, tol)){ chaine.unshift(autre.b); autre.pris = true; avance = true; }
      }
    }
    chaines.push(chaine.map(p=>({x:p.x, y:p.y})));
  });
  return chaines;
}

export function fusionnerAnneaux(anneaux: PtBrut[][], tol: number): AnneauxFusionnes | null {
  if(anneaux.length === 1) return { contour: anneaux[0].map(p=>({x:p.x,y:p.y})), limites: [] };
  const tousSommets = [].concat(...anneaux);
  const decoupes = anneaux.map(a=>decouperAnneau(a, tousSommets, tol));
  const aretes = [];
  decoupes.forEach((anneau, idx)=>{
    for(let i=0;i<anneau.length;i++){
      aretes.push({ a: anneau[i], b: anneau[(i+1)%anneau.length], anneau: idx, interne:false, utilisee:false });
    }
  });
  // Deux anneaux voisins parcourus dans le meme sens traversent leur limite commune en sens
  // OPPOSE : une arete qui trouve sa jumelle inversee dans un autre anneau est donc interne.
  const limites = [];
  aretes.forEach(e1=>{
    if(e1.interne) return;
    const jumelle = aretes.find(e2=>!e2.interne && e2.anneau !== e1.anneau &&
      memePoint(e2.a, e1.b, tol) && memePoint(e2.b, e1.a, tol));
    if(jumelle){
      e1.interne = true; jumelle.interne = true;
      limites.push([{x:e1.a.x, y:e1.a.y}, {x:e1.b.x, y:e1.b.y}]);
    }
  });
  const restantes = aretes.filter(e=>!e.interne);
  if(!restantes.length) return null;
  // Chainage du contour exterieur.
  const contour = [];
  let courante = restantes[0];
  courante.utilisee = true;
  contour.push({x:courante.a.x, y:courante.a.y});
  const depart = courante.a;
  for(let garde=0; garde < restantes.length + 2; garde++){
    contour.push({x:courante.b.x, y:courante.b.y});
    if(memePoint(courante.b, depart, tol)){
      contour.pop();   // le dernier point rejoint le premier : anneau implicitement ferme
      break;
    }
    const suivante = restantes.find(e=>!e.utilisee && memePoint(e.a, courante.b, tol));
    if(!suivante) return null;     // chaine rompue : on ne fusionne pas plutot que de sortir un contour faux
    suivante.utilisee = true;
    courante = suivante;
  }
  // Toutes les aretes exterieures doivent avoir servi : s'il en reste, l'union n'est pas d'un
  // seul tenant (parcelles non contigues, ou trou) et une fusion serait un mensonge geometrique.
  if(restantes.some(e=>!e.utilisee)) return null;
  if(contour.length < 3) return null;
  // Les sommets ajoutes par le redecoupage laissent des points parfaitement alignes : inutile de
  // les garder, ils alourdissent le tableau des cotes sans rien decrire.
  const propre = simplifierContour(contour, 0.01);
  return { contour: propre.length >= 3 ? propre : contour, limites };
}

export function simplifierContour(pts: PtBrut[], seuil: number): PtBrut[] {
  if(pts.length <= 4) return pts;
  const out = [];
  for(let i=0;i<pts.length;i++){
    const prec = out.length ? out[out.length-1] : pts[(i-1+pts.length)%pts.length];
    const suiv = pts[(i+1)%pts.length];
    if(distancePointSegment(pts[i], prec, suiv) >= seuil) out.push(pts[i]);
  }
  return out.length >= 3 ? out : pts;
}
