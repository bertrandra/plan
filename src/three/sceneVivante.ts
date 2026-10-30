// Ce que l'on fait d'une Vue 3D deja batie, sans la rebatir (three/scene.ts la construit) : y remplacer un objet relu, montrer
// l'avant et l'apres d'un audit, surligner ce que vise une proposition, l'epurer pour l'audit de la parcelle, trouver l'objet sous
// le pointeur. L'etat qu'il faut pour cela (ce que chaque objet a pose, la derniere scene) vit ici, et seulement ici.

import { arbreDeLInstance } from './arbre3d.js';
import { vue3d, rendre3d, cameraDeVue, type SceneVue3d } from './etat3d.js';
import { COUCHE_APRES, COUCHE_AVANT, activerDeuxVues, couperDeuxVues } from './comparaison3d.js';
import { estMesh } from './gardes.js';
import type * as THREE_NS from 'three';
import type { ObjetPlan, PtBrut } from '../model/types.js';
import type { PlanVuDeLa3d } from './etat3d.js';
import type { ContexteObjets } from './typesScene.js';
import { appliquerOmbres, ajouterUnObjet, ajouterCloture, rafraichirArbres, visibleDansLaScene } from './sceneObjets.js';

/**
 * Ce que chaque objet du plan a pose dans la scene, par cle : la Vue 3D remplace ceux d'un batiment
 * relu (la lecture des toits en tache de fond, app/toits/toitsFond.ts) sans se rebatir - une scene de
 * milliers de batiments figeait l'ecran plusieurs secondes a chaque lot. Une table a part, et non
 * `userData` : l'export GLB recopierait ce dernier dans le fichier.
 */
const poseParObjet = new Map<string, THREE_NS.Object3D[]>();
/** Ce que la cloture de la parcelle du projet a pose : l'apres d'un audit peut la remplacer. */
let poseCloture: THREE_NS.Object3D[] = [];
/**
 * L'avant et l'apres d'un audit (three/comparaison3d.ts) : les copies posees en plus, par cle, et ce
 * qui, du plan, ne se voit plus que dans « Avant ».
 */
const comparaison = { apres: new Map<string, THREE_NS.Object3D[]>(), avant: new Set<THREE_NS.Object3D>() };
/** La derniere scene batie et ce qu'il faut pour y reposer un objet. */
let derniere: { sc: SceneVue3d; co: ContexteObjets; obj: ObjetPlan | null; ground: THREE_NS.Mesh } | null = null;
/**
 * Ce que la scene pose sans qu'un objet du plan le porte, et qu'une vue epuree retire : la cloture de
 * la parcelle, celles du voisinage, les objets d'echelle, la terrasse courante et ses piscines.
 */
let horsObjets: THREE_NS.Object3D[] = [];
/**
 * La vue epuree de l'audit de la parcelle (MD/spec-audit.md §12.2) : seuls les objets dont la cle est
 * retenue restent visibles, plus rien de ce qui n'appartient a aucun objet. `null` : tout se voit.
 * Gardee ici, et non dans la scene : une scene rebatie pendant l'audit s'epure de meme.
 */
let garderSeulement: ((cle: string) => boolean) | null = null;

/** Range tout ce qu'un objet a pose sur une seule couche (les couches ne s'heritent pas en three.js). */
function surLaCouche(racine: THREE_NS.Object3D, couche: number): void {
  racine.traverse((x) => { x.layers.set(couche); });
}

/** Retire de la scene ce qu'un objet y avait pose ; les geometries lui sont propres, pas les materiaux. */
function retirerPose(scene: THREE_NS.Object3D, racines: readonly THREE_NS.Object3D[]): void {
  for (const m of racines) {
    scene.remove(m);
    m.traverse((x) => { (x as { geometry?: { dispose?: () => void } }).geometry?.dispose?.(); });
  }
}

/** Ce qu'ajoute un geste a la scene : les enfants directs poses entre avant et apres lui. */
function poseePar(scene: THREE_NS.Object3D, poser: () => void): THREE_NS.Object3D[] {
  const n0 = scene.children.length;
  poser();
  return scene.children.slice(n0);
}

/** Defait l'apres pose : les copies quittent la scene, le plan revient sur la couche commune. */
function oublierComparaison(scene: THREE_NS.Object3D): void {
  for (const racines of comparaison.apres.values()) retirerPose(scene, racines);
  comparaison.apres.clear();
  for (const m of comparaison.avant) surLaCouche(m, 0);
  comparaison.avant.clear();
}

/** Ce que montre l'apres d'un audit : les batiments copies, et la parcelle copiee si sa cloture change. */
export interface Apres3d {
  /** Les batiments dont les copies remplacent, dans « Après », ceux du plan. */
  cles: readonly string[];
  /** Le plan avec ces copies a la place des originaux : c'est sur lui qu'elles se posent. */
  etat: PlanVuDeLa3d;
  /** La parcelle du projet avec la cloture proposee, ou null si la cloture ne change pas. */
  parcelle: ObjetPlan | null;
}

/**
 * L'avant et l'apres d'un audit en deux vues de la Vue 3D ouverte, sans la rebatir : les batiments
 * touches passent sur la couche « Avant », leurs copies sont posees sur la couche « Après », de
 * meme pour la cloture ; le reste de la scene est commun aux deux vues. Un nouvel appel remplace le
 * precedent ; `null` revient a la vue unique. Faux quand la scene n'est plus celle qui a ete batie.
 */
export function comparerObjets3d(apres: Apres3d | null): boolean {
  const d = derniere;
  if (!d || !vue3d.scene || d.sc !== vue3d.scene) return false;
  oublierComparaison(d.co.scene);
  if (!apres) {
    couperDeuxVues(d.sc);
    // Un arbre propose (lecture du jardin) quitte la scene avec sa comparaison : ses lots se refont.
    rafraichirArbres(d.co.scene as THREE_NS.Scene, d.ground);
    appliquerOmbres(d.co.scene, d.ground);
    rendre3d(d.sc);
    return true;
  }
  const co: ContexteObjets = { ...d.co, objets: apres.etat.objects };
  // La scene ne montre que la terrasse (et ses piscines) : aucun batiment a comparer, la cloture si.
  if (vue3d.tousLesObjets || !d.obj) {
    for (const cle of apres.cles) {
      for (const m of poseParObjet.get(cle) ?? []) { surLaCouche(m, COUCHE_AVANT); comparaison.avant.add(m); }
      const o = apres.etat.objects.find((x) => x.key === cle);
      if (!o) continue;
      const neufs = poseePar(co.scene, () => ajouterUnObjet(o, d.obj, apres.etat, co));
      neufs.forEach((m) => surLaCouche(m, COUCHE_APRES));
      comparaison.apres.set(cle, neufs);
    }
  }
  // La cloture n'est posee qu'avec le reste du plan (pas d'objet isole) : sans elle, rien a comparer.
  const parcelle = apres.parcelle;
  if (parcelle && poseCloture.length) {
    for (const m of poseCloture) { surLaCouche(m, COUCHE_AVANT); comparaison.avant.add(m); }
    const neufs = poseePar(co.scene, () => ajouterCloture(co.prim, co.scene, co.versLocal, { ...co.ctx, trouverParcelleCloture: () => parcelle }, co.sol));
    neufs.forEach((m) => surLaCouche(m, COUCHE_APRES));
    // Sous une cle qu'aucun objet du plan ne porte : la cloture n'est pas un objet.
    comparaison.apres.set('', neufs);
  }
  // Les arbres poses de chaque cote (un arbre propose n'est que dans « Après ») : leurs lots se refont, couche par couche.
  rafraichirArbres(co.scene as THREE_NS.Scene, d.ground);
  appliquerOmbres(co.scene, d.ground);
  activerDeuxVues(d.sc);
  rendre3d(d.sc);
  return true;
}

/** Une forme a surligner : une ligne de points du plan, tracee a deux hauteurs au-dessus du sol et reliee par des verticales. */
export interface FormeSurlignee3d {
  pts: readonly PtBrut[]; bas: number; haut: number; ferme: boolean; epais?: boolean;
  /** Une facade nommee : sa silhouette dans le plan du mur (x le long depuis `pts[0]`, y en hauteur) et ses ouvertures. */
  profil?: readonly { x: number; y: number }[];
  ouvertures?: readonly { x: number; y: number; l: number; h: number }[];
}
/** Ce qu'une ligne de propositions vise (app/audit/parcelle/surbrillance.ts), et d'ou le regarder : devant un mur, sa normale. */
export interface Surbrillance3d { formes: readonly FormeSurlignee3d[]; centre: PtBrut; hautM: number; normale: PtBrut | null }

/** Le contour orange de la ligne choisie : une couleur que ni un mur, ni un toit, ni le gazon ne portent. */
const COULEUR_SURBRILLANCE = 0xff7a1a;
let surbrillance: THREE_NS.Object3D[] = [];

/**
 * Surligne dans la Vue 3D ce que vise la ligne choisie de l'ecran des propositions (demande de l'utilisateur, 18 octobre
 * 2026), dans les deux vues : le trace est sur la couche commune et passe devant le reste (sans test de profondeur), un voile
 * leger remplit un mur. La camera se tourne vers lui : devant un mur, de face ; sinon elle garde son angle et le recentre.
 * `null` efface. Faux quand il n'y a pas de scene.
 */
export function surlignerDans3d(s: Surbrillance3d | null, aussi: readonly Surbrillance3d[] = [], viser = true): boolean {
  const d = derniere;
  if (!d || !vue3d.scene || d.sc !== vue3d.scene) return false;
  for (const m of surbrillance) { m.parent?.remove(m); const g = (m as THREE_NS.Mesh).geometry; g?.dispose(); }
  surbrillance = [];
  if (!s && !aussi.length) { rendre3d(d.sc); return true; }
  const { versLocal, sol, scene } = d.co;
  const yDe = (p: PtBrut, h: number) => (sol ? sol.hauteur(p) : 0) + h;
  const trait = new THREE.LineBasicMaterial({ color: COULEUR_SURBRILLANCE, depthTest: false, transparent: true });
  const voile = new THREE.MeshBasicMaterial({ color: COULEUR_SURBRILLANCE, transparent: true, opacity: 0.22, depthTest: false, side: THREE.DoubleSide });
  // Les lignes cochees sont marquees partout (voile et trait seuls) ; la ligne choisie ajoute la camera.
  const formes = [...aussi.flatMap((x) => x.formes), ...(s ? s.formes : [])];
  for (const f of formes) {
    const v = (p: PtBrut, h: number) => { const l = versLocal(p); return new THREE.Vector3(l.x, yDe(p, h), l.z); };
    // Une facade nommee avec sa silhouette : le contour reel du mur (pignon, trapeze, marches...) en gras, un voile sur toute sa surface,
    // et chaque ouverture cernee ; pas le rectangle du pied au haut du mur.
    const profil = f.profil;
    if (profil && profil.length >= 3 && f.pts.length === 2) {
      const [a, b] = f.pts as [PtBrut, PtBrut];
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
      const W = (x: number, y: number) => v({ x: a.x + ux * x, y: a.y + uy * x }, y);
      const bande = (p: { x: number; y: number }, q: { x: number; y: number }, e: number): THREE_NS.Vector3[] => {
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1, nx = (-dy / d) * (e / 2), ny = (dx / d) * (e / 2);
        const [p1, p2, q1, q2] = [W(p.x + nx, p.y + ny), W(p.x - nx, p.y - ny), W(q.x + nx, q.y + ny), W(q.x - nx, q.y - ny)];
        return [p1, p2, q1, p2, q2, q1];
      };
      const pointsDeBandes: THREE_NS.Vector3[] = [];
      profil.forEach((p, i) => pointsDeBandes.push(...bande(p, profil[(i + 1) % profil.length] ?? p, f.epais ? 0.14 : 0.05)));
      for (const o of f.ouvertures ?? []) {
        const c = [{ x: o.x, y: o.y }, { x: o.x + o.l, y: o.y }, { x: o.x + o.l, y: o.y + o.h }, { x: o.x, y: o.y + o.h }];
        c.forEach((p, i) => pointsDeBandes.push(...bande(p, c[(i + 1) % 4] ?? p, 0.05)));
      }
      const gras = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(pointsDeBandes), new THREE.MeshBasicMaterial({ color: COULEUR_SURBRILLANCE, depthTest: false, side: THREE.DoubleSide }));
      gras.renderOrder = 1000;
      const contour = profil.map((q) => new THREE.Vector2(q.x, q.y));
      const tri = THREE.ShapeUtils.triangulateShape(contour, []);
      const surface = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(tri.flat().map((k) => W(profil[k]?.x ?? 0, profil[k]?.y ?? 0))), voile);
      surface.renderOrder = 998;
      scene.add(gras, surface);
      surbrillance.push(gras, surface);
      continue;
    }
    const n = f.pts.length, segs: THREE_NS.Vector3[] = [];
    const bords = f.ferme ? n : n - 1;
    for (let i = 0; i < bords; i++) {
      const a = f.pts[i] as PtBrut, b = f.pts[(i + 1) % n] as PtBrut;
      segs.push(v(a, f.bas), v(b, f.bas), v(a, f.haut), v(b, f.haut));
    }
    for (const p of f.pts) segs.push(v(p, f.bas), v(p, f.haut));
    const lignes = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segs), trait);
    lignes.renderOrder = 999;
    scene.add(lignes);
    surbrillance.push(lignes);
    // Une facade nommee : un cadre en gras (quatre bandes de 12 cm dans le plan du mur), que le trait de 1 px ne donne pas.
    if (f.epais && !f.ferme && n === 2) {
      const [a, b] = f.pts as [PtBrut, PtBrut];
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, e = Math.min(0.12, f.haut - f.bas);
      const dx = ((b.x - a.x) / L) * e, dy = ((b.y - a.y) / L) * e;
      const a2 = { x: a.x + dx, y: a.y + dy }, b2 = { x: b.x - dx, y: b.y - dy };
      const bande = (p1: PtBrut, h1: number, p2: PtBrut, h2: number, p3: PtBrut, h3: number, p4: PtBrut, h4: number) =>
        [v(p1, h1), v(p2, h2), v(p3, h3), v(p1, h1), v(p3, h3), v(p4, h4)];
      const gras = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([
        ...bande(a, f.bas, b, f.bas, b, f.bas + e, a, f.bas + e), ...bande(a, f.haut - e, b, f.haut - e, b, f.haut, a, f.haut),
        ...bande(a, f.bas, a2, f.bas, a2, f.haut, a, f.haut), ...bande(b2, f.bas, b, f.bas, b, f.haut, b2, f.haut),
      ]), new THREE.MeshBasicMaterial({ color: COULEUR_SURBRILLANCE, depthTest: false, side: THREE.DoubleSide }));
      gras.renderOrder = 1000;
      scene.add(gras);
      surbrillance.push(gras);
    }
    // Un mur : un voile sur sa face, pour qu'il se voie aussi de loin.
    if (!f.ferme && n === 2) {
      const [a, b] = f.pts as [PtBrut, PtBrut];
      const g = new THREE.BufferGeometry().setFromPoints([v(a, f.bas), v(b, f.bas), v(b, f.haut), v(a, f.bas), v(b, f.haut), v(a, f.haut)]);
      const m = new THREE.Mesh(g, voile);
      m.renderOrder = 998;
      scene.add(m);
      surbrillance.push(m);
    }
  }
  if (!s || !viser) { rendre3d(d.sc); return true; }
  // La camera vers la cible : meme distance, face au mur ou dans le meme angle.
  const { camera, controls } = d.sc;
  const c = versLocal(s.centre);
  const cible = new THREE.Vector3(c.x, yDe(s.centre, s.hautM / 2), c.z);
  const recul = camera.position.clone().sub(controls.target);
  // Cadrer la zone : la distance suit sa taille (un mur, une souche), pas celle de la vue d'avant.
  const rayon = Math.max(1, ...s.formes.flatMap((f) => f.pts.map((q) => Math.hypot(q.x - s.centre.x, q.y - s.centre.y))), s.hautM / 2);
  const distance = Math.min(80, Math.max(5, rayon * 2.8));
  let dir = recul.normalize();
  if (s.normale) {
    const o = versLocal({ x: s.centre.x + s.normale.x, y: s.centre.y + s.normale.y });
    dir = new THREE.Vector3(o.x - c.x, 0.35, o.z - c.z).normalize();
  }
  controls.target.copy(cible);
  camera.position.copy(cible.clone().add(dir.multiplyScalar(distance)));
  camera.lookAt(cible);
  controls.update();
  rendre3d(d.sc);
  return true;
}

/** Pose un objet et retient ce qu'il a ajoute a la scene. */
function poserEtRetenir(o: ObjetPlan, obj: ObjetPlan | null, etat: PlanVuDeLa3d, co: ContexteObjets): void {
  const n0 = co.scene.children.length;
  ajouterUnObjet(o, obj, etat, co);
  if (co.scene.children.length > n0) poseParObjet.set(o.key, co.scene.children.slice(n0));
}

/** Ce que `poser` ajoute a la scene, retenu comme pose hors objets (masque par la vue epuree). */
export function retenirHorsObjets(scene: THREE_NS.Scene, poser: () => void): void {
  const n0 = scene.children.length;
  poser();
  horsObjets.push(...scene.children.slice(n0));
}

/**
 * Ce que la vue epuree a masque elle-meme. Seuls ceux-la reviennent a la fin de l'audit : une maille
 * deja invisible (le gazon entier et le ruban du chemin que seul l'export montre, EXPORT_SEULEMENT)
 * doit le rester.
 */
let masquesParEpure = new WeakSet<THREE_NS.Object3D>();

/** Masque ou montre ce que la vue epuree ecarte ; un simple drapeau `visible`, rien n'est rebati. */
function appliquerEpure(): void {
  const garder = garderSeulement;
  const masquer = (r: THREE_NS.Object3D, oui: boolean) => {
    if (oui) { if (r.visible) { r.visible = false; masquesParEpure.add(r); } }
    else if (masquesParEpure.has(r)) { masquesParEpure.delete(r); r.visible = true; }
  };
  for (const [cle, racines] of poseParObjet) for (const r of racines) masquer(r, !!garder && !garder(cle));
  for (const r of horsObjets) masquer(r, !!garder);
  // Les arbres masques quittent leurs lots, ceux qui reviennent y rentrent.
  if (derniere && vue3d.scene && derniere.sc === vue3d.scene) rafraichirArbres(derniere.sc.scene, derniere.ground);
}

/**
 * Epure la Vue 3D : seuls les objets du plan que `garder` retient restent visibles (le batiment
 * audite, le sol), et rien de ce que la scene pose d'elle-meme (clotures, terrasse, objets
 * d'echelle). `null` rend tout. Un affichage : ni le projet ni la scene ne sont touches, et une
 * scene rebatie entre-temps s'epure de meme.
 */
export function epurerVue3d(garder: ((cle: string) => boolean) | null): void {
  garderSeulement = garder;
  if (derniere && vue3d.scene && derniere.sc === vue3d.scene) appliquerEpure();
}

/**
 * Epure la scene le temps de `f`, puis rend la vue telle qu'elle etait. Les rendus que Claude recoit
 * (three/renduPrise.ts) l'utilisent : ils ne montrent que les batiments de la parcelle et le sol, sans
 * clotures, arbres ni voisins, que l'ecran de l'audit soit epure ou non (la cloture du premier plan
 * cachait le pied du mur). La Vue 3D de l'ecran ne bouge pas : l'epure revient avant le rendu suivant.
 */
export function epurerLeTemps<T>(garder: (cle: string) => boolean, f: () => T): T {
  const avant = garderSeulement;
  epurerVue3d(garder);
  try { return f(); } finally { epurerVue3d(avant); }
}

/**
 * Ce que la Vue 3D montre : les cles des objets du plan visibles et masques, et combien de poses hors
 * objets (clotures, terrasse, objets d'echelle) restent visibles. Pour la fumee (scripts/fumee.mjs).
 */
export function visibilite3d(): { visibles: string[]; masques: string[]; horsObjetsVisibles: number } {
  const visibles: string[] = [], masques: string[] = [];
  for (const [cle, racines] of poseParObjet) {
    if (racines.some((r) => masquesParEpure.has(r))) masques.push(cle);
    else if (racines.some((r) => r.visible)) visibles.push(cle);
  }
  return { visibles, masques, horsObjetsVisibles: horsObjets.filter((r) => r.visible).length };
}

/** Ce que la Vue 3D ouverte a pose pour cet objet du plan (le trait renforce de l'audit les parcourt). */
export function racinesDe3d(cle: string): readonly THREE_NS.Object3D[] {
  return derniere && vue3d.scene && derniere.sc === vue3d.scene ? poseParObjet.get(cle) ?? [] : [];
}

/**
 * Le rayon de la camera par un point de l'ecran. `setFromCamera` ne connait que la perspective et l'orthographique droite : la camera
 * oblique de l'editeur de facade (three/vueFacadeToit.ts) se vise par ses deux plans, le proche et le lointain.
 */
function rayonDeVue(ndc: { x: number; y: number }, camera: THREE_NS.Camera): THREE_NS.Raycaster {
  const rayon = new THREE.Raycaster();
  if ((camera as THREE_NS.PerspectiveCamera).isPerspectiveCamera) { rayon.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera); return rayon; }
  const proche = new THREE.Vector3(ndc.x, ndc.y, -1).unproject(camera), loin = new THREE.Vector3(ndc.x, ndc.y, 1).unproject(camera);
  rayon.set(proche, loin.sub(proche).normalize());
  rayon.camera = camera;
  return rayon;
}

/**
 * Ce que montre un point de l'ecran (coordonnees normalisees -1..1) dans la Vue 3D ouverte : la cle
 * de l'objet du plan touche le premier, et le point touche dans le repere du plan (le sol, si aucun
 * objet n'est touche). Le mode audit (app/audit/) s'en sert pour marquer un batiment au doigt.
 */
export function objetSousLePointeur(ndc: { x: number; y: number }, retenir: (cle: string) => boolean = () => true): { cle: string | null; point: PtBrut | null } {
  const sc = vue3d.scene, d = derniere;
  if (!sc || !d || d.sc !== sc) return { cle: null, point: null };
  const rayon = rayonDeVue(ndc, cameraDeVue(sc));
  const versPlan = (v: THREE_NS.Vector3): PtBrut => ({ x: v.x + sc.cen.x, y: sc.cen.y - v.z });
  // Chaque objet pose a ses enfants directs de la scene : on remonte de la maille touchee jusqu'a eux.
  const proprietaire = new Map<THREE_NS.Object3D, string>();
  for (const [cle, racines] of poseParObjet) for (const r of racines) proprietaire.set(r, cle);
  let premierPoint: PtBrut | null = null;
  for (const t of rayon.intersectObjects(sc.scene.children, true)) {
    // Le rayon de three ne regarde pas `visible` : un objet masque (vue epuree) ne se touche pas.
    if (!estMesh(t.object) || !visibleDansLaScene(t.object)) continue;
    premierPoint ??= versPlan(t.point);
    // Un arbre touche par une instance : on remonte de son groupe, pas du lot qui le dessine.
    for (let o: THREE_NS.Object3D | null = arbreDeLInstance(t.object, t.instanceId) ?? t.object; o; o = o.parent) {
      const cle = proprietaire.get(o);
      // `retenir` laisse le rayon traverser ce qui ne compte pas pour l'appelant : un arbre devant
      // la facade a photographier (audit de la parcelle).
      if (cle && retenir(cle)) return { cle, point: versPlan(t.point) };
      if (cle) break;
    }
  }
  const plan = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const sol = new THREE.Vector3();
  return { cle: null, point: premierPoint ?? (rayon.ray.intersectPlane(plan, sol) ? versPlan(sol) : null) };
}

export function ajouterObjetsDuPlan(obj: ObjetPlan | null, etat: PlanVuDeLa3d, co: ContexteObjets): void {
  etat.objects.forEach(o => poserEtRetenir(o, obj, etat, co));
}

/**
 * Remplace dans la Vue 3D ouverte ce que ces objets y avaient pose : retire, puis repose d'apres le
 * plan d'aujourd'hui (un objet disparu n'est pas repose). Faux quand la scene n'est plus celle qui
 * a ete batie : a l'appelant de la rebatir s'il le faut.
 */
export function remplacerObjets3d(cles: readonly string[], etat: PlanVuDeLa3d): boolean {
  const d = derniere;
  if (!d || !vue3d.scene || d.sc !== vue3d.scene) return false;
  // La scene ne montre que la terrasse (et ses piscines) : rien du voisinage a remplacer.
  if (!(vue3d.tousLesObjets || !d.obj)) return true;
  const co: ContexteObjets = { ...d.co, objets: etat.objects };
  for (const cle of cles) {
    const anciens = poseParObjet.get(cle) ?? [];
    anciens.forEach((m) => comparaison.avant.delete(m));
    retirerPose(co.scene, anciens);
    poseParObjet.delete(cle);
    const o = etat.objects.find((x) => x.key === cle);
    if (o) poserEtRetenir(o, d.obj, etat, co);
    // Un batiment relu pendant une comparaison (les toits en tache de fond) reste du cote « Avant ».
    if (comparaison.apres.has(cle)) for (const m of poseParObjet.get(cle) ?? []) { surLaCouche(m, COUCHE_AVANT); comparaison.avant.add(m); }
  }
  // Un batiment repose (l'apercu « Après » de l'audit) suit la vue epuree comme les autres.
  if (garderSeulement) appliquerEpure();
  rafraichirArbres(co.scene as THREE_NS.Scene, d.ground);
  return true;
}

/** Une scene va etre rebatie : ce qu'avait pose l'ancienne est oublie, et une comparaison meurt avec elle. */
export function oublierLaScene(): void {
  poseParObjet.clear();
  poseCloture = [];
  horsObjets = [];
  masquesParEpure = new WeakSet();
  // Une comparaison avant / apres meurt avec sa scene : a son auteur de la reposer (signalerSceneBatie).
  comparaison.apres.clear();
  comparaison.avant.clear();
  couperDeuxVues(null);
  derniere = null;
}

/**
 * La cloture de la parcelle du projet, retenue deux fois : pour la comparaison avant / apres et comme pose hors objets, que la vue
 * epuree de l'audit masque.
 */
export function retenirCloture(scene: THREE_NS.Scene, poser: () => void): void {
  poseCloture = poseePar(scene, poser);
  horsObjets.push(...poseCloture);
}

/** La scene vient d'etre batie : on la garde pour y reposer un objet, et l'audit en cours l'epure. */
export function retenirLaScene(d: { sc: SceneVue3d; co: ContexteObjets; obj: ObjetPlan | null; ground: THREE_NS.Mesh }): void {
  derniere = d;
  epurerSiBesoin();
}

/** L'audit de la parcelle en cours : la scene ne montre que ce qu'il garde. */
export function epurerSiBesoin(): void {
  if (garderSeulement) appliquerEpure();
}
