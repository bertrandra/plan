// La piscine en 3D (three/).
//
// Le sol de la scene est un plan opaque. Pour voir dans le bassin, on le perce : le contour du plan
// d'eau est d'abord ecrit dans le tampon de gabarit (stencil), et le sol, le terrain, l'orthophoto
// et les chemins poses a plat ne se dessinent pas la ou il est marque (`gabaritSol`, `percerSol`,
// primitives.ts).
// Dessous, l'interieur du bassin : ses parois et son fond, qui suit le profil (plat, pente, fosse),
// puis le plan d'eau translucide a la revanche sous le haut des parois. Un bassin semi-enterre ou
// hors-sol dresse en plus ses parois exterieures. Les margelles sont posees dessus ; la plage en
// bois calculee (ancien fichier) a sa hauteur, sur ses poutres et ses poteaux quand elle est en
// l'air ; un dallage est une bande au sol. Une plage « terrasse du plan » est un objet a part, que
// la scene construit comme toute terrasse. Tout est tire d'`engine/piscine.ts` : rien n'est
// recalcule ici.

import { calculerPiscine, elargir, interieurBassin, EPAISSEUR_MARGELLE_M, REVANCHE_M, type PiscineCalculee } from '../engine/piscine.js';
import type * as THREE_NS from 'three';
import type { ObjetPlan, PtBrut } from '../model/types.js';
import { gabaritSol, polygoneAPlat, SANS_OMBRE, type Primitives, type VersLocal } from './primitives.js';

/** Epaisseur minimale d'une paroi dessinee : une coque d'un centimetre disparaitrait. */
const PAROI_MIN_M = 0.06;
const COULEUR_PAROI = { coque: '#e8eef0', maconnerie: '#b8b4ac', kit: '#8d6b4a' } as const;
/** L'interieur du bassin : le revetement vu a travers l'eau. */
const COULEUR_INTERIEUR = { gelcoat: '#e9f4f7', liner: '#9fd3e6', 'membrane-armee': '#8cc7dd', carrelage: '#b9dfe9', enduit: '#d7e6e8' } as const;
const LAME_M = 0.027;
const SOLIVE_M = 0.175;
const POUTRE_M = 0.2;

/**
 * Ce que la 3D d'une piscine demande en plus des primitives : la scene, pour l'interieur du bassin.
 * `scene` peut etre un groupe pose sur le sol en relief (three/relief3d.ts) ; `prim` doit alors y
 * poser aussi ses pieces. `primitivesDans` : des primitives qui posent dans un groupe ; avec lui, une
 * piscine sur un sol en pente se pose elle-meme a son point haut (voir `ajouterPiscine3d`).
 */
export interface ContextePiscine3d { prim: Primitives; scene: THREE_NS.Object3D; versLocal: VersLocal; primitivesDans?: (cible: THREE_NS.Object3D) => Primitives }

/**
 * `objets` : le plan, pour que le moteur lise le relief et la terrasse qui sert de plage. Quand le
 * relief est lu (`calc.sol`, MD/spec-relief.md §6), le bord du bassin est de niveau a
 * `hauteurHorsSol` au-dessus du point le plus HAUT du sol sous les parois : tout se pose dans un
 * groupe eleve de `zHaut`, pas au sol du centre — et chaque poteau de la plage descend jusqu'a son sol.
 */
export function ajouterPiscine3d(ctx: ContextePiscine3d, o: ObjetPlan, objets: ObjetPlan[] = []): void {
  const calc = calculerPiscine(o, objets);
  if (!calc) return;
  const { prim, scene, versLocal } = ctx.primitivesDans && calc.sol ? poserAuPointHaut(ctx, calc.sol.zHaut, o.key) : ctx;
  const r = calc.reglages;
  const H = calc.hauteurHorsSol;
  const eau = H - REVANCHE_M;
  if (calc.profondeurEnterree > 1e-3) gabaritSol(scene, versLocal, calc.contour);
  ajouterInterieur(scene, versLocal, calc, eau);
  const parois = elargir(calc.contour, Math.max(PAROI_MIN_M, calc.parois === calc.contour ? 0 : 0.01));
  if (H > 0.01) prim.addBande({ ext: parois, int: calc.contour }, 0, H, COULEUR_PAROI[r.structure]);
  ajouterEau(scene, versLocal, calc.contour, eau, r.couleurEau);
  if (r.margelle) prim.addBande({ ext: calc.margelleExt, int: calc.contour }, H, EPAISSEUR_MARGELLE_M, r.couleurMargelle);
  if (r.plage === 'dallage') prim.addBande({ ext: calc.plageExt, int: calc.margelleExt }, H, EPAISSEUR_MARGELLE_M, r.couleurPlage);
  const pb = calc.plageBois;
  if (!pb) return;
  // Les lames, affleurant les margelles ; dessous, en l'air, les poutres et leurs poteaux.
  prim.addBande({ ext: calc.plageExt, int: calc.margelleExt }, pb.dessus - LAME_M, LAME_M, r.couleurPlage);
  if (pb.mode === 'poteaux') {
    const basPoutre = pb.dessus - LAME_M - SOLIVE_M - POUTRE_M;
    pb.anneauxPoutres.forEach(anneau => prim.addBande({ ext: elargir(anneau, 0.0375), int: elargir(anneau, -0.0375) }, basPoutre, POUTRE_M, '#6b4a2a'));
    // Sur un sol en pente, chaque poteau descend jusqu'a son sol : le moteur donne sa hauteur (au
    // centimetre), plus longue en aval de ce que le sol descend sous le point haut, et un peu plus
    // courte la ou la plage deborde en amont des parois. Sans sol, les poteaux partent de zero,
    // comme avant : la hauteur arrondie du moteur ne les deplace pas.
    pb.poteauxPositions.forEach((p, i) => {
      const descente = calc.sol ? (pb.hauteursPoteaux[i] ?? pb.hauteurPoteau) - pb.hauteurPoteau : 0;
      prim.addPrism(carre(p, 0.12), -descente, basPoutre + descente, '#6b4a2a');
    });
  } else {
    // Au ras du sol : une bande de structure sous les lames, pour que la plage ait son epaisseur.
    prim.addBande({ ext: calc.plageExt, int: calc.margelleExt }, Math.max(0, pb.dessus - LAME_M - 0.07), 0.07, '#6b4a2a');
  }
}

/** Un groupe eleve de `zHaut` dans la scene donnee, et des primitives qui y posent. */
function poserAuPointHaut(ctx: ContextePiscine3d, zHaut: number, cle: string): ContextePiscine3d {
  if (!ctx.primitivesDans) return ctx;
  const groupe = new THREE.Group();
  groupe.name = 'piscine:' + cle;
  groupe.position.y = zHaut;
  ctx.scene.add(groupe);
  return { prim: ctx.primitivesDans(groupe), scene: groupe, versLocal: ctx.versLocal };
}

/** Les parois interieures et le fond, au revetement du bassin. */
function ajouterInterieur(scene: THREE_NS.Object3D, versLocal: VersLocal, calc: PiscineCalculee, eau: number): void {
  const H = calc.hauteurHorsSol;
  const int = interieurBassin(calc.contour, calc.axe, calc.profil);
  const mat = new THREE.MeshStandardMaterial({ color: COULEUR_INTERIEUR[calc.reglages.revetement], side: THREE.DoubleSide, roughness: 0.6 });
  const positions: number[] = [];
  const tri = (p: [number, number, number][]) => p.forEach(q => positions.push(...q));
  int.parois.forEach(({ a, b, profA, profB }) => {
    const la = versLocal(a), lb = versLocal(b);
    const A0: [number, number, number] = [la.x, eau - profA, la.z], B0: [number, number, number] = [lb.x, eau - profB, lb.z];
    const A1: [number, number, number] = [la.x, H, la.z], B1: [number, number, number] = [lb.x, H, lb.z];
    tri([A0, B0, B1]); tri([A0, B1, A1]);
  });
  int.fond.forEach(({ pts, prof }) => {
    const loc = pts.map(versLocal);
    const triangles = THREE.ShapeUtils.triangulateShape(loc.map(l => new THREE.Vector2(l.x, l.z)), []);
    triangles.forEach(t => t.forEach(i => { const l = loc[i], z = prof[i]; if (l && z !== undefined) positions.push(l.x, eau - z, l.z); }));
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo, mat));
}

/** Le plan d'eau : translucide, pour voir le fond et sa pente. */
function ajouterEau(scene: THREE_NS.Object3D, versLocal: VersLocal, contour: PtBrut[], eau: number, couleur: string): void {
  const mat = new THREE.MeshStandardMaterial({ color: couleur, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, roughness: 0.15, metalness: 0.1 });
  const m = new THREE.Mesh(polygoneAPlat(contour, versLocal), mat);
  m.position.y = eau;
  m.userData[SANS_OMBRE] = true;
  scene.add(m);
}

function carre(c: PtBrut, cote: number): PtBrut[] {
  const d = cote / 2;
  return [{ x: c.x - d, y: c.y - d }, { x: c.x + d, y: c.y - d }, { x: c.x + d, y: c.y + d }, { x: c.x - d, y: c.y + d }];
}
