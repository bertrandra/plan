// Portees admissibles, grille d appuis, ossature (spec §3.2, engine/structure.ts)
//
// Deplace depuis legacy.ts sans retouche : l ordre des operations est conserve tel quel, y compris
// la ou il produit des artefacts de flottants. Ce sont eux qui prouvent que l arithmetique n a pas
// bouge (spec-migration-typescript.md §10.2) - les "nettoyer" serait un changement de comportement.

import { centroid, dist, pointInPolygon, shoelace, signedArea } from '../geometry/basic.js';
import { clipLineToPolygon, offsetZone, polygonOffset, ringSegments } from '../geometry/polygon.js';
import { angleOfSegment } from '../geometry/segments.js';
import { coutDebit, prixPlotUnite, prixVisUnite } from './bom.js';
import { PLOT_ENTRAXE_MAX_M, SOLIVE_PRICE, SOLIVE_SECTIONS, estPlots } from './constantes.js';
import { ensureConstruction } from './construction.js';
import { computeDebitsBois } from './debit.js';
import { computeTerrasseLayers } from './layers.js';
import type { PtBrut, Segment, ObjetPlan, Construction } from '../model/types.js';

/**
 * Ce qu'une etude de structure a besoin de connaitre d'une terrasse : son contour et ses parametres.
 *
 * L'exigence est nommee parce que le module s'en sert deja : `evaluerStructure` mesure des
 * configurations candidates sur un objet fabrique pour l'occasion — `{ pts, construction }` — qui
 * n'est pas un `ObjetPlan` et n'a pas a l'etre. Exiger l'objet complet aurait force soit un mensonge
 * de type, soit une clef et un nom inventes pour satisfaire le compilateur.
 */
export interface TerrasseEtudiee {
  pts?: PtBrut[] | undefined;
  construction?: Construction;
}

/** Ce qu'un appui porte. Le vocabulaire est celui des projets enregistres : `spa` vaut equipement. */
export type RoleAppui = 'spa' | 'rive' | 'courant';

/** Un appui pose : ou il est, et ce qu'il porte. */
export interface Appui extends PtBrut { role: RoleAppui }

/** Une zone d'equipement, elargie de sa marge, telle qu'elle resserre les appuis. */
export interface ZoneEquipement {
  nom: string;
  key: string;
  poly: PtBrut[];
  center: PtBrut;
}

/** Un intervalle le long d'une piece : distance de debut, distance de fin. */
export type Intervalle = [number, number];

/** Une fourchette de prix indicative. */
export interface Fourchette { bas: number; haut: number }

/**
 * Une configuration de structure mesuree et chiffree, telle que l'optimiseur les classe.
 *
 * `topologie` n'existe qu'en pose sur plots, ou la question devient « pose simple ou structure
 * double » — sur vis elle n'aurait aucun sens, et c'est pourquoi elle est facultative plutot que
 * remplie d'une valeur neutre.
 */
export interface CandidatStructure {
  section: string;
  avecLambourde: boolean;
  soliveEntraxe: number;
  lambourdeEntraxe: number;
  /** Nombre d'appuis qu'elle demande. */
  vis: number;
  /** Metres lineaires de bois, toutes familles confondues. */
  ml: number;
  /** Appuis par m². */
  densite: number;
  /** Portee entre appuis, en centimetres. */
  portee: number;
  cout: number;
  topologie?: string;
}

// Nominal section of a solive in mm, laid on edge: b = width, h = height.
/** Les dimensions d'une section de bois, en millimetres : base et hauteur. */
export interface DimsSection { b: number; h: number }
export const SOLIVE_SECTION_DIMS: Record<string, DimsSection> = {
  '40x60':{b:40,h:60}, '45x45':{b:45,h:45},
  '45x70':{b:45,h:70}, '45x95':{b:45,h:95}, '63x175':{b:63,h:175}
};
// Lambourdes carry only the lames over a short span, so the range starts smaller than for the
// solives; the bigger sections stay available for a build where they share one section.
export const LAMBOURDE_SECTIONS = ['40x60','45x45','45x70','45x95','63x175'];
export function dimsSection(sec: string | undefined): DimsSection { return SOLIVE_SECTION_DIMS[sec!] || SOLIVE_SECTION_DIMS['45x70']!; }
export function sectionLambourde(c: Construction): string { return c.lambourdeSection || c.soliveSection || '45x70'; }
// Bending deflection makes the admissible span of a beam vary as (E*I/charge)^(1/3); with
// I = b*h^3/12 and the load carried proportional to the entraxe, that collapses to
//     portee = K * h * (b/entraxe)^(1/3)
// K is calibrated against trade practice rather than derived, so that the two reference cases
// come out right: a 45x70 at 70 cm entraxe lands on the 70 cm between supports that NF DTU
// 51.4 caps lambourdes at, and a 45x145 at 70 cm lands on the ~1.50 m used for solives borne
// on foundation screws. Both give K = 25.8 with lengths in mm.
// This is a pre-dimensioning aid on a 250 kg/m2 basis, not a substitute for a design note.
export const PORTEE_VIS_K = 25.8;
// The load K was calibrated against. Asking for more than this shortens the admissible span by
// the cube root of the ratio, which is the same exponent the rest of the formula runs on.
export const CHARGE_REF = 250;
export const CHARGE_NORMALE_DEFAUT = 250;
export const CHARGE_SPA_DEFAUT = 500;   // spa rempli + occupe : ~1,5 a 2 t sur 3 a 4 m2
export function maxPorteeVisM(c: Construction): number {
  const dims = SOLIVE_SECTION_DIMS[c.soliveSection!] || SOLIVE_SECTION_DIMS['45x70']!;
  const entraxeMm = Math.max(200, (c.soliveEntraxe||40)*10);
  const k = c.kPortee || PORTEE_VIS_K;
  const q = Math.max(50, c.chargeNormale || CHARGE_NORMALE_DEFAUT);
  const mm = k * dims.h * Math.cbrt(dims.b/entraxeMm) * Math.cbrt(CHARGE_REF/q);
  return Math.max(0.5, Math.min(2.5, mm/1000));
}
// Distance allowed between two screws along one solive: derived from the section by default,
// or forced by hand when the user knows better than the table.
export function porteeVisM(c: Construction): number {
  return c.visModeAuto===false ? Math.max(0.3, (c.visEntraxe||100)/100) : maxPorteeVisM(c);
}
// Distance entre deux appuis, quel que soit le mode de fondation. Sur vis, la section decide.
// Sur plots, le NF DTU 51.4 plafonne a 70 cm sous lambourdes quoi qu'en dise la section : un
// plot ne se compare pas a une vis, c'est l'appui du platelage lui-meme.
export function porteeAppuiM(c: Construction): number {
  if(!estPlots(c)) return porteeVisM(c);
  if(c.plotEntraxeAuto === false){
    return Math.max(0.2, Math.min(PLOT_ENTRAXE_MAX_M, (c.plotEntraxe||65)/100));
  }
  // La piece posee sur les plots est la solive en structure double, la lambourde sinon.
  const sec = c.plotAvecSolives ? c.soliveSection! : sectionLambourde(c);
  const ent = c.plotAvecSolives ? (c.soliveEntraxe||40) : maxEntraxeLameCm(c);
  return Math.min(PLOT_ENTRAXE_MAX_M, maxPorteeVisM({ ...c, soliveSection:sec, soliveEntraxe:ent }));
}
// Nom du poste d'appui, pour les libelles partages entre les deux modes.
export function libelleAppui(c: Construction, pluriel: boolean): string {
  return estPlots(c) ? (pluriel ? 'plots' : 'plot') : (pluriel ? 'vis' : 'vis');
}
// Spacing under a spa. Rather than a bare number, it is the same span shortened for the heavier
// load it has to carry - so raising the target load tightens the grid on its own.
export function porteeVisSpaM(c: Construction): number {
  const span = porteeVisM(c);
  if(c.visModeAuto===false) return Math.min(span, Math.max(0.2, (c.visEntraxeZoneSpa||60)/100));
  const qN = Math.max(50, c.chargeNormale || CHARGE_NORMALE_DEFAUT);
  const qS = Math.max(qN, c.chargeSpa || CHARGE_SPA_DEFAUT);
  return Math.max(0.2, Math.min(span, span * Math.cbrt(qN/qS)));
}
// NF DTU 51.4 sets the spacing of the supports under a lame from its thickness, width and
// class. Across the usual range the table collapses to a near-constant ratio - 22 mm goes with
// 40 cm, 24 mm with 45 cm, 27 mm with 50 cm - that is, about 18.5 times the thickness.
export const ENTRAXE_LAME_K = 18.5;
// Composite creeps a great deal more than timber; dense tropicals rather less.
// Meme raison que pour ESSENCE_PRICES : la clef vient du projet, et la lecture porte son repli.
export const LAME_RAIDEUR: Record<string, number> = { 'pin-classe4':1.00, 'douglas':1.00, 'exotique':1.05, 'composite':0.80, 'autre':1.00 };
// Furthest apart the supports carrying the lames may sit - the lambourdes when there are any,
// otherwise the solives themselves. Rounded to 5 cm because that is how a deck gets set out.
export function coefRaideurLame(c: Construction): number {
  return (c.coefRaideurLame !== undefined && c.coefRaideurLame !== null)
    ? c.coefRaideurLame : (LAME_RAIDEUR[c.essenceBois!] !== undefined ? LAME_RAIDEUR[c.essenceBois!]! : 1);
}
export function maxEntraxeLameCm(c: Construction): number {
  const ep = Math.max(15, c.epaisseurLame||25);
  const k = Math.max(0.3, Math.min(2, coefRaideurLame(c)));
  const K = c.kEntraxeLame || ENTRAXE_LAME_K;
  return Math.max(30, Math.min(55, Math.round(ep*K*k/10/5)*5));
}
// Unit price for a poste: the real price once the user has entered one in the BOM, otherwise
// the middle of the indicative range.
export function prixUnitaire(c: Construction, poste: string, range: Fourchette): number {
  const line = (c.bom||[]).find(l=>l.poste===poste);
  // prixReel is the total for the line, not a rate: divide it back down before using it as one.
  if(line && line.prixReel!>0 && line.qte>0) return line.prixReel!/line.qte;
  return (range.bas+range.haut)/2;
}
// Walks the configurations that satisfy both rules at once - the lames must not span further
// than their thickness allows, and every beam must reach from one support to the next - and
// ranks them by what the structure they imply would cost. Quantities are measured with the
// same functions that draw the plan, so a figure quoted here is the figure you would read off
// the drawing, not a parallel estimate that can drift away from it.
// Measures one candidate structure: real line lengths and a real screw layout, priced. Shared
// by the optimiser and by the "where do I stand today" comparison, so the two can never be
// computed on different bases.
// `prixBois` est le tarif au ml de la section de reference 45x70. Le prix reel suit le volume :
// une 63x175 fait 3,5 fois la matiere d'une 40x60 et ne peut pas etre comparee au meme tarif,
// sinon l'optimiseur choisit systematiquement la plus grosse section « gratuitement ».
export const SECTION_REF_AIRE = 45*70;
export function tarifSection(prixBoisRef: number, sec: string | undefined): number {
  const d = dimsSection(sec);
  return prixBoisRef * (d.b*d.h) / SECTION_REF_AIRE;
}
export function evaluerStructure(obj: TerrasseEtudiee, trial: Construction, prixVis: number, prixBois: number, _lamesAngle: number, surf: number, objets: ObjetPlan[]): CandidatStructure {
  const probe = { pts:obj.pts, construction:trial };
  const S = computeStructure(probe, objets);
  const vis = buildVisGrid(probe, S, objets);
  const ml = (a: Segment[]) => a.reduce((s,l)=>s+dist(l.a,l.b),0);
  // Every load-bearing piece counts towards the timber: the frame is part of the structure,
  // and the spa reinforcement is real wood that has to be bought. Chaque famille est chiffree
  // au tarif de sa propre section.
  const secCadre = S.plotSimple ? sectionLambourde(trial) : trial.soliveSection;
  const mlPorteur = ml(S.solives) + ml(S.solivesSpa);
  const mlCadre = ml(S.cadre);
  const mlLamb = ml(S.lambourdes);
  const coutBois = mlPorteur*tarifSection(prixBois, trial.soliveSection)
                 + mlCadre  *tarifSection(prixBois, secCadre)
                 + mlLamb   *tarifSection(prixBois, sectionLambourde(trial));
  return { section:trial.soliveSection!, avecLambourde:!!trial.avecLambourde,
           soliveEntraxe:trial.soliveEntraxe!, lambourdeEntraxe:trial.lambourdeEntraxe!,
           vis:vis.length, ml:+(mlPorteur+mlCadre+mlLamb).toFixed(1),
           densite:+(vis.length/surf).toFixed(2),
           portee:Math.round(porteeAppuiM(trial)*100),
           cout:Math.round(vis.length*prixVis + coutBois) };
}
export function optimiserParametres(obj: ObjetPlan, objets: ObjetPlan[]): CandidatStructure[] {
  const c = ensureConstruction(obj);
  const surf = shoelace(obj.pts!) || 1;
  // Rates for the comparison: the screw price as entered, and an effective per-ml wood rate taken
  // from the current cut-list, so the waste a real cut-list carries is already inside the figure.
  // Re-running a cut-list for each of the 63 candidates would be exact but far slower, and the
  // ranking does not turn on it.
  const prixVis = estPlots(c) ? prixPlotUnite(c) : prixVisUnite(c);
  // Averaged over every timber group, so a build whose lambourdes are a separate product is
  // compared on what its wood really costs rather than on the solives' rate alone.
  // Ramene au tarif de la section de reference, en divisant par le volume : c'est ce tarif-la
  // que evaluerStructure redimensionne ensuite pour chaque section candidate.
  const groupesRef = computeDebitsBois(obj, computeTerrasseLayers(obj, objets));
  let refCout = 0, refMlAire = 0;
  groupesRef.forEach(g=>{
    const d = dimsSection(g.section);
    refCout += coutDebit(c, g.debit, g.cle);
    refMlAire += g.debit.reelMl * d.b * d.h;
  });
  const prixBois = refMlAire > 0
    ? refCout/refMlAire*SECTION_REF_AIRE
    : (SOLIVE_PRICE.bas+SOLIVE_PRICE.haut)/2;
  const entraxeLame = maxEntraxeLameCm(c);
  const lamesAngle = lamesAngleOf(obj);

  const evaluate = (section: string, avecLambourde: boolean, soliveEntraxe: number) => evaluerStructure(obj,
    { ...c, soliveSection:section, avecLambourde, soliveEntraxe,
      lambourdeEntraxe:entraxeLame, visModeAuto:true },
    prixVis, prixBois, lamesAngle, surf, objets);

  const out: CandidatStructure[] = [];
  // Sur plots, l'arbitrage n'est pas le meme : l'appui coute cinq a dix fois moins cher que la
  // vis, et son entraxe est plafonne par le DTU quoi qu'on fasse. La question devient donc
  // « pose simple ou structure double », et non « quelle section de solive porte le plus loin ».
  if(estPlots(c)){
    // Pose simple : les lambourdes portent les lames, plots dessous. Une entree par section de
    // lambourde, puisque c'est elle qui travaille.
    LAMBOURDE_SECTIONS.forEach(section=>{
      out.push(Object.assign(
        evaluerStructure(obj, { ...c, lambourdeSection:section, plotAvecSolives:false,
                                avecLambourde:true, lambourdeEntraxe:entraxeLame, plotEntraxeAuto:true },
          prixVis, prixBois, lamesAngle, surf, objets),
        { section, avecLambourde:false, topologie:'simple', soliveEntraxe:entraxeLame }));
    });
    // Structure double : plots sous solives, lambourdes au-dessus. Plus de bois, moins de plots.
    SOLIVE_SECTIONS.forEach(section=>{
      const porteeLamb = maxPorteeVisM({ ...c, soliveSection:sectionLambourde(c), soliveEntraxe:entraxeLame });
      const maxSolive = Math.floor(porteeLamb*100/5)*5;
      for(let se=entraxeLame; se<=maxSolive; se+=5){
        out.push(Object.assign(
          evaluerStructure(obj, { ...c, soliveSection:section, plotAvecSolives:true,
                                  avecLambourde:true, soliveEntraxe:se,
                                  lambourdeEntraxe:entraxeLame, plotEntraxeAuto:true },
            prixVis, prixBois, lamesAngle, surf, objets),
          { section, avecLambourde:true, topologie:'double', soliveEntraxe:se }));
      }
    });
    return out.sort((a,b)=>a.cout-b.cout);
  }
  // Without lambourdes the solives carry the lames themselves, so their spacing is pinned by
  // the lame thickness and the section is the only free variable.
  SOLIVE_SECTIONS.forEach(section=>out.push(evaluate(section, false, entraxeLame)));
  // With lambourdes the lames rest on the lambourdes instead, which frees the solives to
  // spread out as far as a lambourde of that section will reach between them. Same span
  // formula, applied one storey down: here the tributary width is the lambourde entraxe.
  SOLIVE_SECTIONS.forEach(section=>{
    // How far the solives may spread is set by what a LAMBOURDE of its own section can reach
    // between them, not by the solive's section.
    const porteeLambourde = maxPorteeVisM({ ...c, soliveSection:sectionLambourde(c), soliveEntraxe:entraxeLame });
    const maxSolive = Math.floor(porteeLambourde*100/5)*5;
    for(let se=entraxeLame; se<=maxSolive; se+=5) out.push(evaluate(section, true, se));
  });
  return out.sort((a,b)=>a.cout-b.cout);
}
// Breaks a-b up so no gap exceeds maxGap. The start point is always emitted (it is a corner
// of the ring, where two edge beams meet); the end belongs to the next segment.
export function subdivideSegment(a: PtBrut, b: PtBrut, maxGap: number, includeEnd: boolean): PtBrut[] {
  const L = dist(a,b);
  const out: PtBrut[] = [{x:a.x, y:a.y}];
  if(L>1e-6){
    const n = Math.max(1, Math.ceil(L/maxGap));
    for(let i=1;i<n;i++) out.push({ x:a.x+(b.x-a.x)*i/n, y:a.y+(b.y-a.y)*i/n });
  }
  if(includeEnd) out.push({x:b.x, y:b.y});
  return out;
}
// Signed area: the sign carries the winding direction, which is what tells a shrunk outline
// apart from one that has folded through itself. (Defined once, near renderAttrTable() above -
// removed the duplicate that used to live here, same implementation under a different param name.)
// Insetting by more than a shape can take folds it inside out. Sometimes it comes back with
// the winding reversed, which is easy to spot - but on a very narrow shape it can wrap right
// around and return a polygon LARGER than the original, which looks perfectly plausible and
// silently poisons everything clipped against it. Both are caught here by comparing signed
// areas, and the raw outline is used instead.
export function safeOffset(poly: PtBrut[], distM: number): PtBrut[] {
  if(Math.abs(distM) < 1e-9) return poly.map(p=>({...p}));
  const off = polygonOffset(poly, distM);
  const a0 = signedArea(poly), a1 = signedArea(off);
  const grew = Math.abs(a1) > Math.abs(a0);
  const ok = off.length>=3
          && off.every(p=>isFinite(p.x)&&isFinite(p.y))
          && Math.sign(a1)===Math.sign(a0)
          && (distM>0 ? (!grew && Math.abs(a1) > 0.02*Math.abs(a0))
                      : ( grew && Math.abs(a1) < 25*Math.abs(a0)));
  return ok ? off : poly.map(p=>({...p}));
}
export const VIS_ROLE_RANK: Record<string, number> = { spa:3, rive:2, courant:1 };
// Two screws a handspan apart are one screw once you are on site: keep whichever carries the
// more demanding role, so a perimeter screw is never dropped in favour of a field one.
export function dedupeVis(pts: Appui[], minDist: number): Appui[] {
  const kept: Appui[] = [];
  // Two frame screws are only ever the same screw at a mitred corner, where the two runs meet
  // at a shared point. On a narrow strip the opposite runs of the frame can pass within the
  // normal merge distance of each other, and merging them there would leave one whole side of
  // the frame bearing on nothing - so they get a much tighter threshold of their own.
  const RIVE_MERGE = 0.10;
  pts.slice()
     .sort((a,b)=>(VIS_ROLE_RANK[b.role]||0)-(VIS_ROLE_RANK[a.role]||0))
     .forEach(p=>{
       const merged = kept.some(q=>{
         const lim = (p.role==='rive' && q.role==='rive') ? Math.min(minDist, RIVE_MERGE) : minDist;
         return dist(p,q) < lim;
       });
       if(!merged) kept.push(p);
     });
  return kept;
}
// Une charge concentree, ce n'est ni un nom ni une forme ronde : c'est ce qu'on pose sur la
// terrasse. Tout objet dont la fonction est "equipement" en est une - spa, jacuzzi, cuve, bac
// maconne, barbecue, bain nordique - quelle que soit sa geometrie. La zone renforcee est son
// emprise reelle elargie de la marge, et non plus un disque centre sur lui.
export function empriseEquipement(o: ObjetPlan): PtBrut[] | null {
  if(o.type==='circle'){
    // Un polygone inscrit rognerait le disque entre deux sommets ; on prend le rayon circonscrit,
    // de sorte que l'emprise couvre le cercle au lieu de le sous-estimer.
    const N = 32, rc = (o.r||0)/Math.cos(Math.PI/N), pts: PtBrut[] = [];
    if(rc <= 0) return null;
    for(let i=0;i<N;i++){
      const a = 2*Math.PI*i/N;
      pts.push({ x:o.center!.x + rc*Math.cos(a), y:o.center!.y + rc*Math.sin(a) });
    }
    return pts;
  }
  return (o.pts && o.pts.length >= 3) ? o.pts.map(p=>({...p})) : null;
}
// Le nom de la fonction, des champs de reglage et du role des vis reste "spa" : c'est le
// vocabulaire des projets deja enregistres, et le renommer les casserait. Ce n'est plus le spa
// seul qu'il designe, mais toute zone d'equipement.
// Phase 3 : `objets` etait lu dans la fermeture de boot(). Le passer explicitement est ce qui rend
// le moteur testable hors navigateur (spec §4, phase 3).
export function findSpaZones(margeCm: number | undefined, objets: ObjetPlan[]): ZoneEquipement[] {
  const marge = (margeCm||0)/100;
  const zones: ZoneEquipement[] = [];
  objets.forEach(o=>{
    if(o.fonction !== 'equipement') return;
    const fp = empriseEquipement(o);
    if(!fp) return;
    const poly = offsetZone(fp, marge);
    zones.push({ nom:o.name || 'Equipement', key:o.key, poly, center:centroid(poly) });
  });
  return zones;
}
// Une zone ne compte que si elle mord vraiment sur la terrasse : un equipement pose a cote ne
// doit resserrer aucun appui. Tester le seul centre laisserait passer un equipement en L dont le
// centroide tombe hors de son propre contour, ou a cheval sur le bord.
export function zoneToucheTerrasse(zone: ZoneEquipement, poly: PtBrut[]): boolean {
  return pointInPolygon(zone.center, poly)
      || zone.poly.some(p=>pointInPolygon(p, poly))
      || poly.some(p=>pointInPolygon(p, zone.poly));
}
// A screw only carries what sits on top of it, so the screws are set out along the solives
// rather than on a lattice floating free of the structure - a screw between two solives holds
// up nothing. The border gets its own ring of them: the outer solive and the lame de rive have
// to land on something, and NF DTU 51.4 practice is to set the end supports back 15-20 cm from
// the edge, leaving a short porte-a-faux. An edge-exclusion margin does the exact opposite,
// stripping support from the one line that carries the most concentrated load.
// Beams spanning from one side of the frame to the other: the width is divided into whole
// bays no wider than maxSpacing, and the two extremes are left out because the cadre already
// occupies them. This is how a deck is actually set out - equal bays, edge to edge - where
// anchoring a family of lines on the centroid leaves the outermost beam wherever it happens to
// fall (up to 42 cm inside the edge on this terrasse, measured).
export function generateSpanningLines(poly: PtBrut[], angleDeg: number, maxSpacingM: number, clipPoly?: PtBrut[] | null): Segment[] {
  if(maxSpacingM<=0.01) return [];
  const rad = angleDeg*Math.PI/180;
  const dir = {x:Math.cos(rad), y:Math.sin(rad)};
  const perp = {x:-dir.y, y:dir.x};
  const c = centroid(poly);
  const target = clipPoly || poly;
  const projs = poly.map(p=>(p.x-c.x)*perp.x+(p.y-c.y)*perp.y);
  const minP = Math.min(...projs), maxP = Math.max(...projs);
  const W = maxP - minP;
  const n = Math.max(1, Math.ceil(W/maxSpacingM));
  const lines: Segment[] = [];
  for(let k=1;k<n;k++){
    const off = minP + W*k/n;
    clipLineToPolygon({x:c.x+perp.x*off, y:c.y+perp.y*off}, dir, target).forEach(s=>lines.push(s));
  }
  return lines;
}

// ---- structure -------------------------------------------------------------------------
// The beam network is built first and the screws are derived from it afterwards. That order is
// what guarantees a screw always lands under something: buildVisGrid can only place screws on
// pieces this function returned. Two genuinely different ouvrages are modelled.
//
//   Sans lambourdes - the solives carry the lames themselves, so they run perpendicular to them
//     at the spacing the lame thickness allows. Numerous and close together.
//   Avec lambourdes - the solives become primary beams parallel to the lames, spread as wide as
//     a lambourde will reach between them, with a second lit of lambourdes crossing at the lame
//     spacing. Far fewer beams underneath, hence far fewer screws.
//
// Both are closed by a cadre - a solive de rive following the outline. Without it the border of
// the deck rests on nothing and the perimeter screws carry thin air.
export function computeStructure(obj: TerrasseEtudiee, objets: ObjetPlan[]) {
  const c = ensureConstruction(obj);
  const poly = obj.pts!;
  const n = poly.length;
  const lamesAngle = lamesAngleOf(obj);
  const dims = SOLIVE_SECTION_DIMS[c.soliveSection!] || SOLIVE_SECTION_DIMS['45x70']!;
  const soliveW = dims.b/1000;

  // Centreline pulled in half a section so the outer face of the frame sits flush with the
  // outline, the same way the perimeter trim boards are handled. On a shape thinner than the
  // section itself the two opposite runs would swap sides and the frame would come out wider
  // than the terrasse, so the offset is capped by the shape's own thickness (2·aire/perimetre
  // is the inscribed radius of a rectangle and a fair proxy on anything else).
  // Pose sur plots, topologie simple : les lambourdes reposent directement sur les plots et il
  // n'y a pas de solive. Le cadre devient une lambourde de rive, donc de la section des
  // lambourdes. Topologie double (plots sous solives) : identique au mode vis.
  const plotSimple = estPlots(c) && !c.plotAvecSolives;
  const cadreW = plotSimple ? dimsSection(sectionLambourde(c)).b/1000 : soliveW;
  const perim = poly.reduce((s,p,i)=>s+dist(p, poly[(i+1)%n]!), 0) || 1;
  const cadreOff = Math.min(cadreW/2, 0.4 * 2*shoelace(poly)/perim);
  const cadre = ringSegments(safeOffset(poly, cadreOff));

  // Avec des plots sans solives, la couche qui porte les lames est un lit de lambourdes a
  // l'entraxe dicte par l'epaisseur de lame, et c'est elle qui repose sur les appuis.
  // Sur plots il y a toujours des lambourdes : posees sur les plots en structure simple, sur les
  // solives en structure double. C'est la couche qui recoit les lames dans les deux cas.
  const avecLamb = estPlots(c) ? true : c.avecLambourde;
  const soliveAngle = avecLamb ? lamesAngle : (lamesAngle+90);
  const solives = plotSimple
    ? []
    : generateSpanningLines(poly, soliveAngle, Math.max(0.1,(c.soliveEntraxe||40)/100));
  const entraxeLamb = plotSimple ? maxEntraxeLameCm(c) : (c.lambourdeEntraxe||40);
  const lambourdes = avecLamb
    ? generateSpanningLines(poly, lamesAngle+90, Math.max(0.1, entraxeLamb/100))
    : [];

  // A spa is a tonne or more standing on a couple of square metres. Where the solives are
  // already close together, that load is answered by tightening the screws along them - the
  // beams are there already. Where they are primary beams metres apart, no amount of screwing
  // between them helps: the zone needs beams of its own, run from frame to frame like any
  // other solive so their ends are carried.
  // En pose simple sur plots, les lambourdes sont deja au pas de la lame : la zone spa se traite
  // en resserrant les appuis, pas en ajoutant des pieces. Voir aussi l'avertissement du §spa.
  const solivesSpa: Segment[] = [];
  if(c.avecLambourde && !plotSimple){
    const dense = porteeVisSpaM(c);
    const rad = soliveAngle*Math.PI/180;
    const dir = {x:Math.cos(rad), y:Math.sin(rad)};
    const perp = {x:-dir.y, y:dir.x};
    findSpaZones(c.visMargeZoneSpa, objets).forEach(zone=>{
      if(!zoneToucheTerrasse(zone, poly)) return;
      // Le balayage couvre l'etendue reelle de la zone en travers des solives, et non plus un
      // rayon : une emprise allongee doit etre renforcee sur toute sa longueur.
      const projs = zone.poly.map(p=>(p.x-zone.center.x)*perp.x + (p.y-zone.center.y)*perp.y);
      const kMin = Math.ceil(Math.min(...projs)/dense), kMax = Math.floor(Math.max(...projs)/dense);
      for(let k=kMin;k<=kMax;k++){
        const origin = {x:zone.center.x+perp.x*k*dense, y:zone.center.y+perp.y*k*dense};
        // Skip one that would land on a solive already there. On a concave shape the line can
        // come back in several pieces; only the ones actually crossing the zone are of use.
        if(solives.some(s=>distPointToLine(origin, s) < dense*0.5)) continue;
        clipLineToPolygon(origin, dir, poly)
          .filter(s=>segmentZoneRanges(s, zone).length > 0)
          .forEach(s=>solivesSpa.push(s));
      }
    });
  }
  // Les pieces qui reposent sur les appuis : les solives quand il y en a, les lambourdes en
  // pose simple sur plots. buildVisGrid n'a pas a savoir laquelle des deux c'est.
  const portees = plotSimple ? lambourdes : solives;
  return { cadre, solives, lambourdes, solivesSpa, portees, plotSimple,
           soliveAngle, lamesAngle, cadreOff, soliveW:cadreW };
}
// Perpendicular distance from a point to the infinite line carrying a segment.
export function distPointToLine(p: PtBrut, seg: Segment): number {
  const ex = seg.b.x-seg.a.x, ey = seg.b.y-seg.a.y;
  const L = Math.hypot(ex,ey) || 1;
  return Math.abs((p.x-seg.a.x)*(-ey/L) + (p.y-seg.a.y)*(ex/L));
}
// Ou une piece traverse une zone d'equipement, en distances le long d'elle. Un disque se
// traverse en un seul morceau ; une emprise quelconque peut etre concave - un bac en L, un
// muret en U - et la meme piece y entre et en ressort alors plusieurs fois. On rend donc une
// liste d'intervalles, dont le cercle du spa n'etait que le cas a un seul element.
export function segmentZoneRanges(seg: Segment, zone: ZoneEquipement | null | undefined): Intervalle[] {
  const poly = zone && zone.poly;
  const L = dist(seg.a, seg.b);
  if(L < 1e-6 || !poly || poly.length < 3) return [];
  const dx = (seg.b.x-seg.a.x)/L, dy = (seg.b.y-seg.a.y)/L;
  const ts = [0, L];
  for(let i=0;i<poly.length;i++){
    const p = poly[i]!, q = poly[(i+1)%poly.length]!;
    const ex = q.x-p.x, ey = q.y-p.y;
    const den = dx*ey - dy*ex;
    if(Math.abs(den) < 1e-12) continue;   // piece parallele a l'arete : pas de franchissement
    const t = ((p.x-seg.a.x)*ey - (p.y-seg.a.y)*ex)/den;   // distance le long de la piece
    const u = ((p.x-seg.a.x)*dy - (p.y-seg.a.y)*dx)/den;   // position sur l'arete, 0 a 1
    if(u >= -1e-9 && u <= 1+1e-9 && t > 0 && t < L) ts.push(t);
  }
  ts.sort((a,b)=>a-b);
  const out: Intervalle[] = [];
  for(let i=0;i<ts.length-1;i++){
    const d0 = ts[i]!, d1 = ts[i+1]!;
    if(d1-d0 < 1e-6) continue;
    const mid = { x:seg.a.x+dx*(d0+d1)/2, y:seg.a.y+dy*(d0+d1)/2 };
    if(!pointInPolygon(mid, poly)) continue;
    // Deux intervalles jointifs n'en font qu'un : une arete effleuree ne doit pas couper la
    // traversee en deux, ce qui doublerait la vis a la jonction.
    const last = out[out.length-1];
    if(last && d0 - last[1] < 1e-6) last[1] = d1; else out.push([d0, d1]);
  }
  return out;
}

// Screws go on the pieces the structure returned, and nowhere else. A beam running from frame
// to frame is already held at both ends, so it only needs intermediate screws when it is longer
// than its admissible span - which is why a well-proportioned deck takes far fewer screws than
// a grid would suggest.
export function buildVisGrid(obj: TerrasseEtudiee, structure: Structure | null, objets: ObjetPlan[]): Appui[] {
  const c = ensureConstruction(obj);
  if(!obj.pts || obj.pts.length<3) return [];
  const S = structure || computeStructure(obj, objets);
  const span = porteeAppuiM(c);
  const dense = Math.min(span, porteeVisSpaM(c));
  const zones = findSpaZones(c.visMargeZoneSpa, objets);
  const pts: Appui[] = [];

  // 1. Cadre: a screw under every corner, where two rive beams meet and the load concentrates,
  //    then the runs between them broken up to stay inside the span.
  S.cadre.forEach(seg=>{
    subdivideSegment(seg.a, seg.b, span, false).forEach(p=>pts.push({...p, role:'rive'}));
  });

  // 2. Beams: both ends rest on the cadre, so only the interior needs dividing. `portees` is
  //    the layer that actually bears on the supports - solives, or lambourdes when plots carry
  //    the deck directly.
  (S.portees || S.solives).concat(S.solivesSpa).forEach(seg=>{
    const L = dist(seg.a, seg.b);
    if(L < 0.05) return;
    const at = (d: number) => ({ x:seg.a.x+(seg.b.x-seg.a.x)*d/L, y:seg.a.y+(seg.b.y-seg.a.y)*d/L });
    const n = Math.max(1, Math.ceil(L/span));
    for(let k=1;k<n;k++) pts.push({...at(L*k/n), role:'courant'});
    // 3. Then every stretch crossing an equipment zone is re-divided at the tighter spacing.
    zones.forEach(z=>{
      segmentZoneRanges(seg, z).forEach(([d0,d1])=>{
        const m = Math.max(1, Math.ceil((d1-d0)/dense));
        for(let k=0;k<=m;k++) pts.push({...at(d0+(d1-d0)*k/m), role:'spa'});
      });
    });
  });

  return dedupeVis(pts, Math.min(0.35, dense*0.45));
}

// Lames run in `sensPose` (relative to the reference side). With lambourdes: lambourdes sit
// perpendicular to the lames (supporting them directly) and solives sit parallel to the lames
// (supporting the lambourdes). Without lambourdes, solives go straight under the lames,
// perpendicular to them.
// Direction the lames run in: the reference side, turned by the chosen sens de pose.
export function lamesAngleOf(obj: TerrasseEtudiee): number {
  const c = ensureConstruction(obj);
  const n = obj.pts!.length;
  const refIdx = Math.min(c.segmentReference||0, n-1);
  const a = obj.pts![refIdx]!, b = obj.pts![(refIdx+1)%n]!;
  return angleOfSegment(a,b)*180/Math.PI + (c.sensPose||0);
}
// Screw count on its own, for the density readout in the configurator.
/** La structure calculee, telle que computeStructure la produit. Derivee de la fonction, pas decrite deux fois. */
export type Structure = ReturnType<typeof computeStructure>;

/**
 * L'ossature d'un contour qui n'en a pas : moins de trois points, donc rien a porter.
 *
 * Les panneaux en avaient besoin et s'en fabriquaient une a la main, reduite aux quatre familles de
 * pieces qu'ils affichent — les six autres champs valaient alors `undefined`, sans consequence
 * puisque `buildVisGrid`, seul a les lire, n'est de toute facon pas appele dans ce cas.
 *
 * C'est une fonction et non une constante : rendre le meme objet a tout le monde partagerait quatre
 * tableaux mutables entre des appelants qui n'ont rien a voir.
 */
export function structureVide(): Structure {
  return { cadre:[], solives:[], lambourdes:[], solivesSpa:[], portees:[],
           plotSimple:false, soliveAngle:0, lamesAngle:0, cadreOff:0, soliveW:0 };
}

export function buildVisGridCount(obj: TerrasseEtudiee, objets: ObjetPlan[]): number {
  if(!obj.pts || obj.pts.length<3) return 0;
  return buildVisGrid(obj, null, objets).length;
}
