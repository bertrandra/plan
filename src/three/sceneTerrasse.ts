// La terrasse courante dans la scene 3D (three/scene.ts) : son contour au sol, la photo aerienne sous elle, sa structure et ses
// lames, avec la part du ciel qui eclaire les joints et le dessous du platelage.

import { vue3d } from './etat3d.js';
import { estPlots, PLOT_ASSISE_MIN_CM2 } from '../engine/constantes.js';
import { appuisEnHauteur, decaissementPoseMm } from '../engine/hauteurs.js';
import { zReferenceOuvrage, type Sol } from '../engine/sol.js';
import { dimsSection, sectionLambourde } from '../engine/bois/portees.js';
import {
  creerPrimitives, poserEnCouche, percerSol, COUCHES_SOL, 
  type Primitives, type VersLocal
} from './primitives.js';
import type * as THREE_NS from 'three';
import type { ObjetPlan, PtBrut, Construction } from '../model/types.js';
import { enPoints } from '../model/formes.js';
import type { TuileOrtho } from '../render/ortho.js';
import { ajouterAssise3d } from './assise3d.js';
import { peindreOrthoSurSol, type SolRelief } from './relief3d.js';
import type { Emprise } from '../model/relief.js';
import { intersectionEmprises } from '../model/calque.js';
import type { ContexteScene3d, Couches } from './typesScene.js';

/**
 * Le contour reel de la terrasse au sol : on y verifie d'un coup d'oeil le sens des lames. Sur un
 * sol en pente, il monte au point haut du sol sous la terrasse (`yHaut`), la ou la structure se pose.
 */
export function ajouterContourTerrasse(scene: THREE_NS.Scene, obj: ObjetPlan, versLocal: VersLocal, yHaut = 0): void {
  const pts = enPoints(obj).pts.map((p: PtBrut) => { const l = versLocal(p); return new THREE.Vector3(l.x, yHaut + 0.01, l.z); });
  const premier = pts[0];
  if (premier) pts.push(premier.clone());
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a2a2a })));
}

/** Un plan de la taille du cadre, dont les `uv` ne gardent que la part de la tuile qu'il couvre. */
function dalleCoupee(t: TuileOrtho, cadre: Emprise): THREE_NS.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(cadre.xMax - cadre.xMin, cadre.yMax - cadre.yMin);
  const u0 = (cadre.xMin - t.xMin) / t.largeur, u1 = (cadre.xMax - t.xMin) / t.largeur;
  const v0 = (cadre.yMin - t.yMin) / t.hauteur, v1 = (cadre.yMax - t.yMin) / t.hauteur;
  // Sommets d'un PlaneGeometry : haut-gauche, haut-droit, bas-gauche, bas-droit.
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2));
  return geo;
}

/**
 * Le calque orthophoto du plan sert aussi de sol a la 3D. Sur un sol plat : une dalle par tuile,
 * juste au-dessus du sol vert. Sur un sol en relief : la photo est peinte sur le maillage du sol
 * lui-meme (three/relief3d.ts, `peindreOrthoSurSol`) — une seconde surface posee dessus passait par
 * taches sous le sol vert, deux maillages du meme terrain ne l'interpolant pas pareil. Dans les deux
 * cas, materiau eclaire pour que la photo suive le soleil — une image en pleine lumiere sur une
 * scene de nuit trahirait l'heure choisie.
 */
export function ajouterOrtho(scene: THREE_NS.Scene, versLocal: VersLocal, ctx: ContexteScene3d, sol: SolRelief | null, bornes: Emprise, ground: THREE_NS.Mesh): void {
  if (!ctx.orthoActif() || !ctx.orthoTuiles().length) return;
  if (sol) {
    peindreOrthoSurSol(ctx.orthoTuiles(), bornes, sol.relief, ground.material as THREE_NS.MeshStandardMaterial);
    return;
  }
  const chargeurOrtho = new THREE.TextureLoader();
  ctx.orthoTuiles().forEach((t: TuileOrtho) => {
    // `orthoTuiles()` ne rend que les tuiles dont l'image est arrivee (voir `TuileOrtho`). Les tuiles
    // du paysage ne vont qu'au sol en relief : sur un sol plat, coupees au calque, elles doubleraient les fines.
    if (!t.dataUri || t.large) return;
    // La photo couvre le sol, et pas au-dela : chaque tuile est coupee aux bornes du sol (le calque).
    const cadre = intersectionEmprises({ xMin: t.xMin, xMax: t.xMin + t.largeur, yMin: t.yMin, yMax: t.yMin + t.hauteur }, bornes);
    if (!cadre) return;
    const tex = chargeurOrtho.load(t.dataUri);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 });
    // Au-dessus du terrain, sous les chemins : une couche, pas seulement un millimetre (COUCHES_SOL).
    // Aucun decalage : c'est le sol vert, dessous, qui est recule (COUCHES_SOL). Tiree vers la
    // camera, la photo passait devant les objets bas vus de loin et de biais — les massifs de 20 cm
    // scintillaient (2.2.1).
    poserEnCouche(mat, COUCHES_SOL.ortho);
    percerSol(mat);
    const dalle = new THREE.Mesh(dalleCoupee(t, cadre), mat);
    dalle.rotation.x = -Math.PI / 2;   // le haut de l'image (nord) part alors sur -Z, comme le plan
    const l = versLocal({ x: (cadre.xMin + cadre.xMax) / 2, y: (cadre.yMin + cadre.yMax) / 2 });
    dalle.position.set(l.x, 0.004, l.z);
    dalle.receiveShadow = vue3d.ombres;
    scene.add(dalle);
  });
}

/** Ou la structure se pose : la scene, le repere, et le sol que lit le moteur (`null` : plat). */
interface CibleStructure { scene: THREE_NS.Scene; versLocal: VersLocal; sol: Sol | null }

/**
 * Le groupe dans lequel la terrasse se construit : eleve de `yHaut` (le point haut du sol sous elle,
 * sur un sol en pente), puis abaisse du decaissement. A zero et sans decaissement, c'est la scene
 * elle-meme — la scene d'un projet sans relief ne gagne aucun groupe (export GLB inchange).
 */
function groupeDeLaTerrasse(scene: THREE_NS.Scene, yHaut: number, decaisseM: number): { terrasse: THREE_NS.Object3D; structure: THREE_NS.Object3D } {
  let terrasse: THREE_NS.Object3D = scene;
  if (yHaut !== 0) {
    const g = new THREE.Group();
    g.name = 'terrasse-point-haut';
    g.position.y = yHaut;
    scene.add(g);
    terrasse = g;
  }
  let structure = terrasse;
  if (decaisseM > 0) {
    const g = new THREE.Group();
    g.position.y = -decaisseM;
    terrasse.add(g);
    structure = g;
  }
  return { terrasse, structure };
}

/**
 * Le pied de chaque appui, compte depuis le niveau de la structure : zero sur un sol plat ; sur un
 * sol en pente, le sol sous l'appui moins le point haut (engine/hauteurs.ts) — negatif en aval, la
 * ou le plot ou la tete de vis s'allonge. Dans l'ordre de `layers.vis`.
 */
function piedsDesAppuis(obj: ObjetPlan, layers: Couches, sol: Sol | null): number[] {
  const enHauteur = appuisEnHauteur(obj, layers.vis, sol);
  return enHauteur ? enHauteur.appuis.map(a => a.zSol - enHauteur.zHaut) : layers.vis.map(() => 0);
}

/**
 * Toute la structure de la terrasse (appuis, solives, lambourdes, lames). Executee APRES la premiere
 * image : c'est le morceau le plus long (~360 ms sur une terrasse de 35 m², une piece de bois = un
 * mesh), et le terrain, les batiments et la camera sont prets avant — on navigue deja pendant que
 * le platelage se pose. Chaque piece est coupee au contour ou elle s'arrete : un bord oblique se
 * lit comme une diagonale, pas comme un escalier.
 *
 * Sur un sol en pente (MD/spec-relief.md §6), la structure est de niveau au point le plus HAUT du
 * sol sous la terrasse : tout se pose dans un groupe eleve d'autant, et chaque plot ou vis descend
 * jusqu'a SON sol. Le haut des appuis reste commun (la hauteur reglee) : c'est leur pied qui change.
 */
export function construireStructureTerrasse(obj: ObjetPlan, layers: Couches, c: Construction, primSol: Primitives, ctx: ContexteScene3d, isolee: boolean, cible: CibleStructure): void {
  const contour = enPoints(obj).pts;
  // Un niveau fini impose plus bas que la structure : toute la terrasse descend dans son
  // decaissement (engine/hauteurs.ts). Ses pieces sont posees dans un groupe abaisse d'autant.
  const decaisseM = decaissementPoseMm(obj) / 1000;
  const yHaut = zReferenceOuvrage(cible.sol, contour);
  const groupes = groupeDeLaTerrasse(cible.scene, yHaut, decaisseM);
  const primitivesDans = (g: THREE_NS.Object3D) => g === cible.scene ? primSol : creerPrimitives({ scene: g, versLocal: cible.versLocal, chargerTexture: ctx.chargerTexturePolyhaven });
  const prim = primitivesDans(groupes.structure);
  // Ce sur quoi la structure repose au-dessus du sol : la hauteur du plot, ou le seul depassement
  // de tete pour une vis, dont le fut est enterre et dessine sous le plan de sol.
  const hauteurVisM = ctx.hauteurAppuiMm(c) / 1000;
  const enterreM = estPlots(c) ? 0 : (c.hauteurVis || 40) / 100;
  const soliveDims = (c.soliveSection || '45x70').split('x').map(n => parseInt(n, 10) || 0);
  const soliveH = (soliveDims[1] || 70) / 1000, soliveW = (soliveDims[0] || 45) / 1000;
  const lambDims = dimsSection(sectionLambourde(c));
  // Sur plots il y a toujours des lambourdes (engine/structure.ts, engine/hauteurs.ts) : en structure
  // simple ce sont elles qui portent les lames, et le cadre a leur section.
  const lambH = (c.avecLambourde || estPlots(c)) ? lambDims.h / 1000 : 0;
  const lambW = lambDims.b / 1000;
  const lameH = (c.epaisseurLame || 25) / 1000;
  const lameW = (c.largeurLame || 140) / 1000;
  // En pose simple sur plots il n'y a pas de solive : les lambourdes reposent sur les plots, et le
  // cadre est une lambourde de rive. L'empilement perd une couche au milieu.
  const plotSimple = estPlots(c) && !c.plotAvecSolives;
  const pieds = piedsDesAppuis(obj, layers, cible.sol);
  const g = groupes.structure;
  const debutDessous = g.children.length;
  if (estPlots(c)) layers.vis.forEach((p, i) => prim.addPlot(p, hauteurVisM, 0x6E7A84, c.plotSurfaceAssise || PLOT_ASSISE_MIN_CM2, pieds[i] ?? 0));
  else layers.vis.forEach((p, i) => prim.addPost(p, enterreM, hauteurVisM, 0.03, 0x8a96a8, pieds[i] ?? 0));
  layers.solives.forEach(seg => prim.addBeam(seg.a, seg.b, hauteurVisM, soliveH, soliveW, 0x6b4a2a, contour));
  const dessous = g.children.slice(debutDessous);
  // Le cadre est au niveau des pieces auxquelles il appartient, et suit le contour.
  prim.addBande(layers.bandes.cadre, hauteurVisM, plotSimple ? lambH : soliveH, 0x4a2f18);
  const debutLambourdes = g.children.length;
  // Le chevetre d'un bassin : des pieces de la section du cadre, autour de l'ouverture (engine/structure.ts).
  layers.chevetres?.forEach(seg => prim.addBeam(seg.a, seg.b, hauteurVisM, plotSimple ? lambH : soliveH, soliveW, 0x4a2f18, contour));
  let lameBase = hauteurVisM + (plotSimple ? 0 : soliveH);
  if (layers.lambourdes.length) {
    layers.lambourdes.forEach(seg => prim.addBeam(seg.a, seg.b, lameBase, lambH, lambW, 0xb45a2a, contour));
    lameBase += lambH;
  }
  dessous.push(...g.children.slice(debutLambourdes));
  const debutLames = g.children.length;
  // En filaire, les lames ne sont plus qu'un contour : on voit l'implantation des appuis et le sens
  // des solives, que le platelage plein masque.
  const lamesFilaire = !!c.lames3dFilaire;
  // Les deux textures de la terrasse : le dessus sur le platelage, le vertical sur la lame de rive —
  // les seules surfaces qu'on regarde vraiment.
  const texturesTerrasse = vue3d.textures ? { horizontale: obj.textureHorizontale, vertical: obj.textureVerticale } : null;
  // Par defaut le platelage est plein. « Platelage translucide » coche, il devient presque
  // transparent : la structure, les plots et leur assise se voient dessous. Isolee, la terrasse
  // montre sa structure a travers un platelage translucide (app/isolement.ts).
  const opaciteLames = vue3d.platelageTranslucide ? OPACITE_LAMES_TRANSLUCIDES : isolee ? OPACITE_LAMES_ISOLEMENT : undefined;
  // Autour d'un bassin ou d'une tremie, chaque lame est coupee a la forme du trou.
  layers.lames.forEach(seg => prim.addBeam(seg.a, seg.b, lameBase, lameH, lameW,
    lamesFilaire ? 0x7a5c2e : 0xc9a15a, layers.lamesFieldPoly, lamesFilaire, texturesTerrasse, opaciteLames, layers.trous ?? []));
  ombrerSousLePlatelage(dessous, g.children.slice(debutLames));
  if (c.avecLameRive) {
    // Pend sous les lames et couvre la structure : son haut est au dessous des lames.
    const riveH = (c.hauteurLameRive || 200) / 1000;
    prim.addBande(layers.bandes.lameRive, lameBase - riveH, riveH, 0x5c3a1e, texturesTerrasse);
    layers.bandes.rivesOuvertures?.forEach(b => prim.addBande(b, lameBase - riveH, riveH, 0x5c3a1e, texturesTerrasse));
  }
  if (c.avecLamePlat) prim.addBande(layers.bandes.lamePlat, lameBase, lameH, 0xd8b06a);
  // L'assise : une dalle se voit toujours (son debord) ; sol en coupe, tout ce qui est sous le sol
  // fini — herisson, massifs, futs de vis — se voit aussi. Elle est de niveau au point haut, dans le
  // groupe de la terrasse ; seuls les massifs suivent chaque plot a son sol (three/assise3d.ts).
  ajouterAssise3d({ prim: primitivesDans(groupes.terrasse), scene: groupes.terrasse, versLocal: cible.versLocal }, contour, layers, c, vue3d.solEnCoupe, decaisseM, vue3d.platelageTranslucide, pieds);
}

/**
 * La part du ciel qui eclaire les chants des lames (le fond des joints) et la structure sous le
 * platelage. Depuis l'eclairage par le ciel (R1, three/rendu.ts), ces faces recevaient tout le ciel,
 * comme le dessus des lames : un joint de 6 mm sur 25 de profondeur, ou une lambourde sous le
 * platelage, n'en voit presque rien. Les joints s'allumaient aussi clair que les lames, et le
 * platelage se lisait comme une planche unie. Un reglage d'ecran : l'export ne le porte pas.
 */
export const PART_CIEL_JOINTS = 0.1;
export const PART_CIEL_SOUS_PLATELAGE = 0.25;

type MateriauCiel = THREE_NS.Material & { envMapIntensity?: number };
const materiauxDe = (o: THREE_NS.Object3D): MateriauCiel[] => {
  const m = (o as THREE_NS.Object3D & { material?: MateriauCiel | MateriauCiel[] }).material;
  return Array.isArray(m) ? m : m ? [m] : [];
};

/**
 * Retire le ciel du dessous du platelage : toute la structure qu'il couvre, et les chants des lames
 * (le second materiau d'une lame texturee, ses faces verticales, three/primitives.ts). Une lame sans
 * texture n'a qu'un materiau pour toutes ses faces : son dessus garde le ciel, ses joints aussi.
 */
export function ombrerSousLePlatelage(dessous: readonly THREE_NS.Object3D[], lames: readonly THREE_NS.Object3D[]): void {
  const regler = (m: MateriauCiel | undefined, part: number) => { if (m && 'envMapIntensity' in m) m.envMapIntensity = part; };
  dessous.forEach(o => o.traverse(x => materiauxDe(x).forEach(m => regler(m, PART_CIEL_SOUS_PLATELAGE))));
  lames.forEach(o => { const ms = materiauxDe(o); if (ms.length >= 2) regler(ms[1], PART_CIEL_JOINTS); });
}

/** Les lames d'une terrasse isolee : assez pour lire le platelage, assez peu pour voir dessous. */
export const OPACITE_LAMES_ISOLEMENT = 0.35;
/** Les lames quand « Platelage translucide » est coche : presque transparentes (le plancher d'appliquerOpacite), leur dessin se devine. */
export const OPACITE_LAMES_TRANSLUCIDES = 0.15;
