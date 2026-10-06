// Portees admissibles, grille d appuis, ossature (spec §3.2, engine/structure.ts)
//
// Deplace depuis legacy.ts sans retouche : l ordre des operations est conserve tel quel, y compris
// la ou il produit des artefacts de flottants. Ce sont eux qui prouvent que l arithmetique n a pas
// bouge (spec-migration-typescript.md §10.2) - les "nettoyer" serait un changement de comportement.

import { au } from '../util/tableaux.js';
import { centroid, dist, pointInPolygon, shoelace, signedArea } from '../geometry/basic.js';
import { clipLineToPolygon, offsetZone, polygonOffset, ringSegments } from '../geometry/polygon.js';
import { angleOfSegment } from '../geometry/segments.js';
import { DALLE_DEBORD_M, estPlots, PLOT_ASSISE_MIN_CM2, supportDe } from './constantes.js';
import { decaissementPoseMm } from './hauteurs.js';
import { ensureConstruction } from './construction.js';
import { dimsSection, maxEntraxeLameCm, porteeAppuiM, porteeVisSpaM, sectionLambourde } from './portees.js';
import { calculerPiscine } from './piscine.js';
import { estPiscine, estTerrasse, estTrou } from '../model/fonctions.js';
import type { PtBrut, Segment, ObjetPlan, Construction } from '../model/types.js';

/**
 * Ce qu'une etude de structure a besoin de connaitre d'une terrasse : son contour et ses parametres.
 *
 * L'exigence est nommee parce que le module s'en sert deja : `evaluerStructure` (`optimisation.ts`) mesure des
 * configurations candidates sur un objet fabrique pour l'occasion — `{ pts, construction }` — qui
 * n'est pas un `ObjetPlan` et n'a pas a l'etre. Exiger l'objet complet aurait force soit un mensonge
 * de type, soit une clef et un nom inventes pour satisfaire le compilateur.
 */
export interface TerrasseEtudiee {
  pts: PtBrut[];
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

// Unit price for a poste: the real price once the user has entered one in the BOM, otherwise
// the middle of the indicative range.
export function prixUnitaire(c: Construction, poste: string, range: Fourchette): number {
  const line = (c.bom||[]).find(l=>l.poste===poste);
  // prixReel is the total for the line, not a rate: divide it back down before using it as one.
  const prixReel = line?.prixReel ?? 0;
  if(line && prixReel>0 && line.qte>0) return prixReel/line.qte;
  return (range.bas+range.haut)/2;
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
      pts.push({ x:o.center.x + rc*Math.cos(a), y:o.center.y + rc*Math.sin(a) });
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
  const poly = obj.pts;
  const n = poly.length;
  const lamesAngle = lamesAngleOf(obj);
  const dims = dimsSection(c.soliveSection);
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
  const perim = poly.reduce((s,p,i)=>s+dist(p, au(poly, (i+1)%n)), 0) || 1;
  // Plots dans l'emprise (terrasse creee depuis la 2.2) : le cadre recule d'un rayon d'embase, pour
  // que l'embase d'un plot de rive ne depasse pas du bord ; les lames debordent d'autant.
  const enRetrait = estPlots(c) && !!c.plotsDansEmprise;
  const rayonEmbase = Math.sqrt((c.plotSurfaceAssise || PLOT_ASSISE_MIN_CM2) / Math.PI) / 100;
  const cadreOff = Math.min(enRetrait ? Math.max(cadreW/2, rayonEmbase) : cadreW/2, 0.4 * 2*shoelace(poly)/perim);
  // En retrait, solives et lambourdes s'arretent sur le cadre, pas au bord des lames.
  const clipStructure = enRetrait ? safeOffset(poly, cadreOff) : null;
  const cadre = ringSegments(safeOffset(poly, cadreOff));

  // Avec des plots sans solives, la couche qui porte les lames est un lit de lambourdes a
  // l'entraxe dicte par l'epaisseur de lame, et c'est elle qui repose sur les appuis.
  // Sur plots il y a toujours des lambourdes : posees sur les plots en structure simple, sur les
  // solives en structure double. C'est la couche qui recoit les lames dans les deux cas.
  const avecLamb = estPlots(c) ? true : c.avecLambourde;
  const soliveAngle = avecLamb ? lamesAngle : (lamesAngle+90);
  const solives = plotSimple
    ? []
    : generateSpanningLines(poly, soliveAngle, Math.max(0.1,(c.soliveEntraxe||40)/100), clipStructure);
  const entraxeLamb = plotSimple ? maxEntraxeLameCm(c) : (c.lambourdeEntraxe||40);
  const lambourdes = avecLamb
    ? generateSpanningLines(poly, lamesAngle+90, Math.max(0.1, entraxeLamb/100), clipStructure)
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
  // Un bassin ou un trou de terrasse (fonction `tremie`) est une ouverture : les pieces s'arretent a son bord, un chevetre
  // en fait le tour (de la section du cadre, dans la liste du cadre pour que les appuis, le debit,
  // l'implantation et le chantier le traitent comme une rive) et les lames s'y coupent (layers.ts).
  // Rien de tout cela n'existe sans bassin : les cles ne sont posees qu'alors, pour que le resultat
  // d'une terrasse sans piscine reste identique a l'oracle (tests/unit/engine/moteur-oracle.test.ts).
  const trous = ouverturesDe(poly, objets);
  // En retrait, les pieces s'arretent aussi sur le chevetre, pas au bord du bassin.
  const trousStructure = enRetrait ? trous.map(t => safeOffset(t, -cadreOff)) : trous;
  const avecTrous = trous.length ? {
    trous,
    // Le chevetre ne borde le bassin que la ou la terrasse existe : un bassin a cheval sur son
    // bord n'a pas de piece dans le vide.
    chevetres: trous.flatMap(t => ringSegments(safeOffset(t, -cadreOff)).flatMap(seg => couperAuContour(seg, poly))),
    solives: retirerOuvertures(solives, trousStructure), lambourdes: retirerOuvertures(lambourdes, trousStructure), solivesSpa: retirerOuvertures(solivesSpa, trousStructure)
  } : null;
  if (avecTrous) avecTrous.chevetres.forEach(s => cadre.push(s));
  // Les pieces qui reposent sur les appuis : les solives quand il y en a, les lambourdes en
  // pose simple sur plots. buildVisGrid n'a pas a savoir laquelle des deux c'est.
  const portees = plotSimple ? (avecTrous ? avecTrous.lambourdes : lambourdes) : (avecTrous ? avecTrous.solives : solives);
  return { cadre, solives, lambourdes, solivesSpa, portees, plotSimple,
           soliveAngle, lamesAngle, cadreOff, soliveW:cadreW, ...(avecTrous ?? {}) };
}

/**
 * Les ouvertures d'une terrasse : les bassins qu'elle contient ou qui la mordent, pris au bord
 * exterieur de leurs margelles (ou de leurs parois sans margelle) — c'est la que le platelage
 * s'arrete.
 */
export function ouverturesDe(poly: PtBrut[], objets: ObjetPlan[]): PtBrut[][] {
  return objetsQuiPercent(poly, objets).map(x => x.contour);
}

/** Les objets (bassins, trous) qui percent la terrasse de contour `poly`, avec le bord ou elle s'arrete. */
export function objetsQuiPercent(poly: PtBrut[], objets: ObjetPlan[]): { objet: ObjetPlan; contour: PtBrut[] }[] {
  const res: { objet: ObjetPlan; contour: PtBrut[] }[] = [];
  objets.forEach(o => {
    const t = contourOuverture(o);
    if(t && (t.some(p => pointInPolygon(p, poly)) || poly.some(p => pointInPolygon(p, t)))) res.push({ objet:o, contour:t });
  });
  return res;
}

/**
 * Le bord ou une terrasse s'arrete autour d'un objet : l'exterieur des margelles d'un bassin, le
 * contour d'un trou de terrasse. `null` pour tout autre objet.
 */
export function contourOuverture(o: ObjetPlan): PtBrut[] | null {
  if(estPiscine(o)) return calculerPiscine(o)?.margelleExt ?? null;
  if(!estTrou(o)) return null;
  if(o.type === 'circle') return o.r > 0.05 ? Array.from({ length:32 }, (_, i) => ({ x:o.center.x + o.r*Math.cos(2*Math.PI*i/32), y:o.center.y + o.r*Math.sin(2*Math.PI*i/32) })) : null;
  return o.type === 'polygon' && o.pts.length >= 3 && Math.abs(shoelace(o.pts)) > 0.01 ? o.pts : null;
}

/**
 * L'aire commune a deux polygones (simples, convexes ou non), par bandes horizontales de 1 cm au
 * plus : de quoi retirer d'une terrasse la part d'un bassin ou d'un trou qui la chevauche.
 */
export function aireCommune(a: PtBrut[], b: PtBrut[]): number {
  const ya = a.map(p => p.y), yb = b.map(p => p.y);
  const y0 = Math.max(Math.min(...ya), Math.min(...yb)), y1 = Math.min(Math.max(...ya), Math.max(...yb));
  if(!(y1 > y0)) return 0;
  const x0 = Math.min(...a.map(p => p.x), ...b.map(p => p.x)) - 1;
  const n = Math.max(50, Math.ceil((y1 - y0) / 0.01)), h = (y1 - y0) / n;
  const dir = { x:1, y:0 };
  let aire = 0;
  for(let i = 0; i < n; i++){
    const o = { x:x0, y:y0 + (i + 0.5) * h };
    const ia = clipLineToPolygon(o, dir, a).map(s => [Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x)] as const);
    const ib = clipLineToPolygon(o, dir, b).map(s => [Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x)] as const);
    ia.forEach(([p0, p1]) => ib.forEach(([q0, q1]) => { aire += Math.max(0, Math.min(p1, q1) - Math.max(p0, q0)) * h; }));
  }
  return aire;
}

/**
 * La surface d'une terrasse, ses ouvertures (bassins, trous) retirees : celle qu'on platelage, qu'on
 * visse et qu'on declare. Sans ouverture, la surface du contour, au bit pres.
 */
export function surfaceNetteTerrasse(poly: PtBrut[], objets: ObjetPlan[]): number {
  return shoelace(poly) - objetsQuiPercent(poly, objets).reduce((s, x) => s + aireCommune(x.contour, poly), 0);
}

/**
 * Les trous d'une terrasse, en anneaux interieurs : le bord exterieur des margelles d'un bassin, le
 * contour d'un trou de terrasse — ceux qui sont tout entiers dans la terrasse. C'est ce que le plan
 * et les exports dessinent comme un trou dans son contour. Vide pour tout autre objet.
 */
export function trousDeTerrasse(o: ObjetPlan, objets: ObjetPlan[]): PtBrut[][] {
  if(!estTerrasse(o) || o.type !== 'polygon') return [];
  const poly = o.pts;
  return objetsQuiPercent(poly, objets).map(x => x.contour).filter(t => t.every(p => pointInPolygon(p, poly)));
}

/** L'emprise d'une dalle sous la terrasse : son contour, deborde de `DALLE_DEBORD_M` tout autour. */
export function empriseDalle(poly: PtBrut[]): PtBrut[] {
  return safeOffset(poly, -DALLE_DEBORD_M);
}

/** La surface de la dalle : son emprise, moins les bassins et trous qui la percent. */
export function surfaceDalle(poly: PtBrut[], trous: PtBrut[][]): number {
  const e = empriseDalle(poly);
  return shoelace(e) - trous.reduce((s, t) => s + aireCommune(t, e), 0);
}

/**
 * Le volume de terre du decaissement de pose (niveau fini impose, engine/hauteurs.ts), en m³ en
 * place : la profondeur sur l'emprise de la terrasse — celle de la dalle, debord compris, quand il y
 * en a une —, moins les bassins et trous qui la percent.
 */
export function volumeDecaissementPose(obj: { pts: PtBrut[]; construction?: Construction }, trous: PtBrut[][]): number {
  const d = decaissementPoseMm(obj) / 1000;
  if(!(d > 0)) return 0;
  const c = ensureConstruction(obj);
  const t = estPlots(c) ? supportDe(c.supportType) : null;
  const emprise = t && (t.dalleBeton || c.supportType === 'dalle') ? empriseDalle(obj.pts) : obj.pts;
  return (shoelace(emprise) - trous.reduce((s, tr) => s + aireCommune(tr, emprise), 0)) * d;
}

/** La part d'un segment qui est dans le polygone (morceaux de moins de 5 cm ignores). */
export function couperAuContour(seg: Segment, poly: PtBrut[]): Segment[] {
  const L = dist(seg.a, seg.b);
  if(L < 1e-6) return [];
  const dir = { x:(seg.b.x-seg.a.x)/L, y:(seg.b.y-seg.a.y)/L };
  const t = (p: PtBrut) => (p.x-seg.a.x)*dir.x + (p.y-seg.a.y)*dir.y;
  const at = (d: number): PtBrut => ({ x:seg.a.x+dir.x*d, y:seg.a.y+dir.y*d });
  return clipLineToPolygon(seg.a, dir, poly).flatMap(m => {
    const t0 = Math.max(0, Math.min(t(m.a), t(m.b))), t1 = Math.min(L, Math.max(t(m.a), t(m.b)));
    return t1 - t0 > 0.05 ? [{ a:at(t0), b:at(t1) }] : [];
  });
}

/** Retire de chaque piece ce qui traverse une ouverture ; une piece entierement dedans disparait. */
export function retirerOuvertures(segs: Segment[], trous: PtBrut[][]): Segment[] {
  if(!trous.length) return segs;
  let morceaux = segs;
  trous.forEach(t => {
    const zone: ZoneEquipement = { nom:'', key:'', poly:t, center:centroid(t) };
    morceaux = morceaux.flatMap(seg => {
      const L = dist(seg.a, seg.b);
      if(L < 1e-6) return [];
      const dedans = segmentZoneRanges(seg, zone);
      if(!dedans.length) return [seg];
      const at = (d: number): PtBrut => ({ x:seg.a.x+(seg.b.x-seg.a.x)*d/L, y:seg.a.y+(seg.b.y-seg.a.y)*d/L });
      const restes: Segment[] = [];
      let d0 = 0;
      dedans.forEach(([r0, r1]) => { if(r0 - d0 > 0.05) restes.push({ a:at(d0), b:at(r0) }); d0 = r1; });
      if(L - d0 > 0.05) restes.push({ a:at(d0), b:at(L) });
      return restes;
    });
  });
  return morceaux;
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
    const p = au(poly, i), q = au(poly, (i+1)%poly.length);
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
    const d0 = au(ts, i), d1 = au(ts, i+1);
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
  const n = obj.pts.length;
  const refIdx = Math.min(c.segmentReference||0, n-1);
  const a = au(obj.pts, refIdx), b = au(obj.pts, (refIdx+1)%n);
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
