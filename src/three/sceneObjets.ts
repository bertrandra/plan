// Les objets du plan dans la scene 3D (three/scene.ts), en contexte : chacun pose sur le sol a sa hauteur, selon ce qu'il est —
// batiment, chemin, parasol, arbre, parcelle et gazon, piscine, cloture —, et les ombres de l'ensemble.
//
// Ce module aiguille ; le parasol, la terrasse (quand elle n'est pas la courante) et le bati ont chacun leur module sous
// three/ouvrages/ (MD/spec-ouvrages.md, etape 6.6), qui partagent la pose sur le sol (three/ouvrages/pose.ts).

import { ajouterArbre3d, synchroniserArbres } from './arbre3d.js';
import { vue3d, soleilVue3d } from './etat3d.js';
import { centroid } from '../geometry/basic.js';
import { estMesh } from './gardes.js';
import { geometrieGazon, materiauGazon, empreintesAuSol } from './gazon.js';
import { ajouterCloture3d } from './cloture3d.js';
import {
  cerclePoly, poserEnCouche, percerSol, COUCHES_SOL, SANS_OMBRE, HORS_EXPORT, EXPORT_SEULEMENT,
  type Primitives, type VersLocal
} from './primitives.js';
import type * as THREE_NS from 'three';
import { echantillonnerTrace } from '../geometry/courbe.js';
import { ribbonChemin } from '../geometry/ruban.js';
import { largeurChemin } from '../model/ouvrages/index.js';
import type { ObjetPlan, PtBrut } from '../model/types.js';
import { aDesSommets } from '../model/formes.js';
import type { PlanVuDeLa3d } from './etat3d.js';
import { estParasol, estAbri, estPiscine, estBatiment } from '../model/fonctions.js';
import { ajouterPergola3d } from './pergola3d.js';
import { ajouterPiscine3d } from './piscine3d.js';
import { traitSurSol, type SolRelief } from './relief3d.js';
import type { ContexteScene3d, ContexteObjets } from './typesScene.js';
import { centreDe, groupeAuSol, opaciteDe, primitivesDans, texturesDe } from './ouvrages/pose.js';
import { ajouterParasol } from './ouvrages/parasol.js';
import { dessusDeTerrasse, piecesDeTerrasse } from './ouvrages/terrasse.js';
import { habillerLeBati, volumesEnBati } from './ouvrages/bati.js';

/**
 * Ou poser un objet sur le sol : sa base au point le plus bas du sol sous son contour, son haut a la
 * hauteur du sol en son centre plus sa hauteur propre — il n'est ni enterre, ni en l'air (spec §5.5).
 * Sur sol plat : de 0 a `h`, comme avant.
 */
function poseSurSol(sol: SolRelief | null, contour: readonly PtBrut[], centre: PtBrut, h: number): { yBase: number; hauteur: number } {
  if (!sol) return { yBase: 0, hauteur: h };
  const yBase = sol.basSous(contour);
  return { yBase, hauteur: sol.hauteur(centre) + h - yBase };
}

/**
 * La hauteur d'un chemin drape au-dessus du sol en relief : au-dessus du gazon (4 mm), assez pour
 * qu'une maille du sol un peu plus bombee que la sienne ne le traverse pas.
 */
export const DECALAGE_CHEMIN_M = 0.02;

/**
 * Un chemin a sa largeur reelle (le meme champ que le trait du plan 2D), pas son seul axe, et suit
 * le reglage « Point / Courbe » comme en 2D.
 */
export function ajouterChemin(o: ObjetPlan, { prim, ctx, sol, scene, versLocal }: ContexteObjets): void {
  if (!aDesSommets(o) || o.pts.length < 2) return;
  const trace = echantillonnerTrace(o.pts, o.curve);
  const poly = ribbonChemin(trace, largeurChemin(o));
  const h = ctx.elevationOf(o);
  const couleur = o.fill || o.stroke || '#888888';
  if (poly && h > 0) {
    const pose = poseSurSol(sol, poly, centroid(poly), h);
    prim.addPrism(poly, pose.yBase, pose.hauteur, couleur, false, opaciteDe(o), texturesDe(o));
  }
  else if (poly && sol) {
    // Sur un sol en relief, le ruban plat ne tient le sol qu'a ses sommets : entre deux, sur une
    // bosse, la pelouse passait par-dessus. A l'ecran, un ruban drape sur le sol par mailles d'un
    // demi-metre, un peu au-dessus de l'herbe ; le .glb garde le ruban d'avant (EXPORT_SEULEMENT).
    const tex = vue3d.textures ? o.textureHorizontale : null;
    const drape = prim.addRubanDrape(trace, largeurChemin(o), couleur, DECALAGE_CHEMIN_M, opaciteDe(o), tex, COUCHES_SOL.chemin, sol.hauteur);
    if (drape) drape.userData[HORS_EXPORT] = true;
    const modele = prim.addRibbonFlat(poly, couleur, 0.006, opaciteDe(o), tex, COUCHES_SOL.chemin, sol.hauteur);
    if (modele && drape) { modele.userData[EXPORT_SEULEMENT] = true; modele.visible = false; }
  }
  else if (poly) prim.addRibbonFlat(poly, couleur, 0.006, opaciteDe(o), vue3d.textures ? o.textureHorizontale : null, COUCHES_SOL.chemin);
  else if (sol) scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(traitSurSol(trace, sol, versLocal, 0.008, false)), new THREE.LineBasicMaterial({ color: o.stroke || couleur })));
  else prim.addGroundOutline(trace, o.stroke || couleur, false);
}

/**
 * Un arbre (three/arbre3d.ts) : un groupe pose sur le sol en son centre, a la hauteur de l'objet
 * (sinon celle de son essence) ; les arbres d'une meme essence se dessinent ensemble, en instances
 * (`rafraichirArbres`). Le feuillage d'un caduc suit la date de l'etude d'ensoleillement.
 */
function ajouterArbreDuPlan(o: ObjetPlan, co: ContexteObjets): void {
  const h = co.ctx.elevationOf(o);
  const centre = centreDe(o);
  const cible = groupeAuSol(co.scene, co.sol, centre);
  ajouterArbre3d({ scene: cible, toLocal: co.versLocal, dateStr: soleilVue3d.dateStr, opacite: opaciteDe(o) }, o, h > 0 ? h : 0);
}

/** Vrai si l'objet et tous ses parents sont visibles : un groupe masque cache ses mailles. */
export function visibleDansLaScene(o: THREE_NS.Object3D): boolean {
  for (let x: THREE_NS.Object3D | null = o; x; x = x.parent) if (!x.visible) return false;
  return true;
}

/**
 * Refait les lots d'instances des arbres d'apres ce que la scene montre (three/arbre3d.ts) : a
 * rappeler des qu'un arbre est pose, retire ou masque. Les lots neufs recoivent leurs ombres.
 */
export function rafraichirArbres(scene: THREE_NS.Scene, ground: THREE_NS.Mesh): void {
  synchroniserArbres(scene, soleilVue3d.dateStr, visibleDansLaScene);
  appliquerOmbres(scene, ground);
}

/**
 * La parcelle sur un sol en relief : son ruban plat passerait sous le sol des que celui-ci monte ;
 * son contour devient un trait qui suit le sol, un point par metre, juste au-dessus de lui.
 */
function ajouterContourParcelle(o: ObjetPlan, { scene, versLocal, sol }: ContexteObjets): void {
  if (!sol || !aDesSommets(o) || o.pts.length < 2) return;
  const trait = new THREE.Line(new THREE.BufferGeometry().setFromPoints(traitSurSol(o.pts, sol, versLocal)), new THREE.LineBasicMaterial({ color: o.stroke || 0x8a7d5a }));
  trait.name = 'parcelle-contour';
  scene.add(trait);
}

/**
 * Le gazon de la parcelle : pose sur le sol, dans la couche du terrain, perce de l'empreinte de
 * chaque objet qui occupe le sol (three/gazon.ts, `empreintesAuSol`) — l'herbe ne passe plus dans
 * le bassin, sous la terrasse ni au travers d'un chemin.
 *
 * A l'ecran seulement : le .glb garde le gazon d'avant, entier (`EXPORT_SEULEMENT`), et son
 * empreinte golden ne bouge pas. Il porte toujours le nom `gazon` dans le modele ; celui de l'ecran
 * s'appelle `gazon-ecran`.
 */
function ajouterGazon(pts: PtBrut[], { scene, versLocal, sol, objets, ctx }: ContexteObjets): void {
  const hauteur = sol ? sol.hauteur : undefined, grille = sol ? sol.relief : undefined;
  const poser = (geo: THREE_NS.BufferGeometry, nom: string): THREE_NS.Mesh => {
    const mat = materiauGazon();
    poserEnCouche(mat, COUCHES_SOL.terrain);
    percerSol(mat);
    const m = new THREE.Mesh(geo, mat);
    m.name = nom;
    m.receiveShadow = vue3d.ombres;
    scene.add(m);
    return m;
  };
  const ecran = poser(geometrieGazon(pts, versLocal, hauteur, undefined, grille, empreintesAuSol(objets, ctx.objetMasque)), 'gazon-ecran');
  ecran.userData[HORS_EXPORT] = true;
  const modele = poser(geometrieGazon(pts, versLocal, hauteur, undefined, grille), 'gazon');
  modele.userData[EXPORT_SEULEMENT] = true;
  modele.visible = false;
}

/**
 * Le reste du plan, en contexte : chaque objet devient un bloc simple a sa hauteur — ni toit ni
 * ouvertures, de quoi juger l'implantation. Une AUTRE terrasse recoit sa hauteur, pas sa structure.
 * La parcelle n'a pas de volume : un ruban au sol suffit a la situer.
 */
/** Un objet du plan dans la scene, selon ce qu'il est : rien s'il est masque, la terrasse courante, un point de vue. */
export function ajouterUnObjet(objet: ObjetPlan, obj: ObjetPlan | null, etat: PlanVuDeLa3d, co: ContexteObjets): void {
  const { prim, ctx } = co;
  if (objet === obj) return;
  if (ctx.objetMasque(objet)) return; // masque dans le plan = masque partout, voisinage compris
  // Un mode de diagnostic peint le batiment, murs et toit : une copie a sa couleur, sans texture ni
  // couleur de murs lue, que le reste de la pose prend comme un batiment ordinaire.
  const diag = estBatiment(objet) ? ctx.couleurDiagnostic?.(objet) ?? null : null;
  const o: ObjetPlan = diag ? { ...objet, fill: diag, textureVerticale: null, batiment: { ...objet.batiment, couleurMurs: { ...(objet.batiment?.couleurMurs ?? {}), source: 'plan' },
    ...(objet.batiment?.toit ? { toit: { ...objet.batiment.toit, couleur: diag } } : {}) } } as ObjetPlan : objet;
  // La parcelle du projet en gazon, par defaut : au-dessus de la photo aerienne, qu'elle remplace
  // sur la parcelle. Une texture choisie dans l'inspecteur, ou le gazon decoche, la laissent voir.
  if (o.key === 'parcelle' && o.gazon3d !== false && !o.textureHorizontale && aDesSommets(o) && o.pts.length >= 3) {
    ajouterGazon(o.pts, co);
    if (co.sol) ajouterContourParcelle(o, co);
    return;
  }
  if (o.key === 'parcelle' || o.fonction === 'terrain') {
    // Sous la photo aerienne, le terrain ne se verrait pas : il ne ferait que la disputer au
    // tampon de profondeur, et imposer a la photo un decalage qui la fait passer devant le reste.
    if (ctx.orthoActif() && ctx.orthoTuiles().length) return;
    if (co.sol) ajouterContourParcelle(o, co);
    else if (aDesSommets(o)) prim.addRibbonFlat(o.pts, o.fill || '#FBF3D9', 0.003, opaciteDe(o), vue3d.textures ? o.textureHorizontale : null, COUCHES_SOL.terrain);
    return;
  }
  // Un point de vue pilote la camera, une limite cadastrale interne est une information de plan :
  // ni l'un ni l'autre n'est un ouvrage a construire.
  if (o.fonction === 'camera' || o.fonction === 'limite') return;
  if (o.type === 'path') { ajouterChemin(o, co); return; }
  // Un parasol est un cercle (DEFAUTS D-14) : un polygone dit « parasol » s'extrude comme les autres.
  if (o.type === 'circle' && estParasol(o)) { ajouterParasol(o, co); return; }
  // Une pergola ou un carport n'est pas un prisme : sa charpente, piece par piece, et son toit.
  // Sur un sol en pente, le moteur compte ses `z` depuis le zero du plan (chaque poteau jusqu'a
  // son sol) : elle va dans la scene telle quelle ; sinon dans un groupe pose sur le sol en son centre.
  if (estAbri(o)) { ajouterPergola3d(co.solMoteur ? co.scene : groupeAuSol(co.scene, co.sol, centreDe(o)), o, co.versLocal, co.solMoteur); return; }
  // Une piscine n'est pas un prisme : son eau, ses parois quand elles depassent, ses margelles, sa plage.
  if (estPiscine(o)) { ajouterPiscineAuSol(o, co); return; }
  // Un arbre n'est pas un prisme : un tronc et un houppier (three/arbre3d.ts).
  if (o.fonction === 'arbre') { ajouterArbreDuPlan(o, co); return; }
  const h = ctx.elevationOf(o);
  if (h <= 0) return;
  const footprint = o.type === 'circle' ? cerclePoly(o.center, o.r) : o.pts;
  // La pose sur le sol : du point le plus bas sous l'emprise jusqu'au sol au centre plus la hauteur.
  const centre = centreDe(o);
  const ySol = co.sol ? co.sol.hauteur(centre) : 0;
  const yBase = co.sol ? co.sol.basSous(footprint) : 0;
  const bati = volumesEnBati(o, !!diag, h, footprint, co);
  const pieces = piecesDeTerrasse(o, bati.volumes, h, etat.objects);
  const dessusTerrasse = dessusDeTerrasse(o, co.solMoteur);
  pieces.forEach((v) => prim.addPrism(v.pts, yBase, (dessusTerrasse ?? ySol + v.hauteur) - yBase, bati.couleurMur, false, opaciteDe(o), texturesDe(o), v.trous));
  habillerLeBati(o, bati, h, centre, ySol, yBase, co);
}

/**
 * Une piscine : son eau et ses margelles comptent depuis le sol. Sur un sol en pente, le moteur
 * la pose lui-meme a son point haut (three/piscine3d.ts) ; sinon dans un groupe pose sur le sol en
 * son centre.
 */
function ajouterPiscineAuSol(o: ObjetPlan, co: ContexteObjets): void {
  const cible = co.solMoteur ? co.scene : groupeAuSol(co.scene, co.sol, centreDe(o));
  ajouterPiscine3d({ prim: primitivesDans(cible, co), scene: cible, versLocal: co.versLocal, primitivesDans: (g) => primitivesDans(g, co) }, o, co.objets);
}

/** Les piscines du plan, quand le reste du plan n'est pas dessine. */
export function ajouterPiscinesSeules(etat: PlanVuDeLa3d, co: ContexteObjets): void {
  etat.objects.forEach(o => { if (estPiscine(o) && !co.ctx.objetMasque(o)) ajouterPiscineAuSol(o, co); });
}

/**
 * La cloture perimetrale, independante de « tous les objets » (elle borne la parcelle) : cote par
 * cote, avec ses acces (three/cloture3d.ts, MD/spec-cloture.md). Sur un sol en relief, chaque
 * panneau se pose sur le sol sous lui.
 */
export function ajouterCloture(prim: Primitives, scene: THREE_NS.Scene, versLocal: VersLocal, ctx: ContexteScene3d, sol: SolRelief | null): void {
  ajouterCloture3d({ scene, toLocal: versLocal, prim, textures: vue3d.textures, chargerTexture: ctx.chargerTexturePolyhaven, sol: sol ? sol.hauteur : undefined }, ctx.trouverParcelleCloture());
}

/**
 * Les ombres, en un seul parcours de la scene complete plutot qu'a travers chaque brique : cela ne
 * peut pas en oublier une. Le sol recoit mais ne projette pas (auto-ombrage aux angles rasants).
 */
export function appliquerOmbres(scene: THREE_NS.Scene, ground: THREE_NS.Mesh): void {
  if (!vue3d.ombres) return;
  // Le gabarit d'un bassin et son eau translucide ne portent pas d'ombre (three/piscine3d.ts).
  scene.traverse(o => { if (estMesh(o)) { o.castShadow = !o.userData[SANS_OMBRE]; o.receiveShadow = true; } });
  ground.castShadow = false;
}
