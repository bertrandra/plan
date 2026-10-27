// Les objets du plan dans la scene 3D (three/scene.ts), en contexte : chacun pose sur le sol a sa hauteur, selon ce qu'il est —
// batiment, chemin, parasol, arbre, parcelle et gazon, piscine, cloture —, et les ombres de l'ensemble.

import { couleurMursRetenue, textureDesMurs } from '../model/couleurMur.js';
import { textureMur } from './textureMur.js';
import { volumesActifs, toitDuVolume, rectanglesDuContour, penteDuToit } from '../model/volumesToit.js';
import { modeToitActif, hauteurMurMesuree } from '../model/toitMesure.js';
import { ajouterToitMesure3d } from './toitMesure3d.js';
import { ajouterBowWindows3d, ajouterToitCorps3d, ajouterToitCorpsSurContour3d, estAppentisOuvert, facettesSurContour } from './toitCorps3d.js';
import { separerBowWindows } from '../facade/modeToit/saillies.js';
import { corpsVisibles } from '../facade/modeToit/facadesDesCorps.js';
import { ajouterCheminees3d } from './cheminees3d.js';
import { ajouterTerrasses3d } from './terrasse3d.js';
import { hauteursMursCorps } from '../facade/toits/toitCorps.js';
import { ajouterArbre3d, synchroniserArbres } from './arbre3d.js';
import { vue3d, soleilVue3d } from './etat3d.js';
import { RELIEF_FENETRES_M, anneeDe } from './fenetresRelief.js';
import { parametresQualite } from './qualite.js';
import { centroid, dist } from '../geometry/basic.js';
import { dessusTerrasseM } from '../engine/hauteurs.js';
import { formeDeTerrasse, trousDeTerrasse } from '../engine/structure.js';
import { hauteurParasolDe } from '../engine/parasol.js';
import { estMesh } from './gardes.js';
import { ajouterReleve3d } from './releve3d.js';
import { ajouterDetailsBatiment } from './detailsBatiment.js';
import { geometrieGazon, materiauGazon, empreintesAuSol } from './gazon.js';
import { apparenceVoisin, fenetresDuVoisin } from '../model/voisinage3d.js';
import { valeursFacadesDe } from '../regles/facades/reglages.js';
import { fenetres3dDe } from '../model/fenetres3d.js';
import { ajouterCloture3d } from './cloture3d.js';
import { volumesDuBatiment } from '../facade/profil.js';
import {
  creerPrimitives, courbePolyligne, ribbonChemin, cerclePoly, urlTexture, appliquerOpacite, poserEnCouche, percerSol, COUCHES_SOL, SANS_OMBRE, HORS_EXPORT, EXPORT_SEULEMENT,
  type Primitives, type VersLocal
} from './primitives.js';
import type * as THREE_NS from 'three';
import type { ObjetPlan, ObjetCercle, PtBrut, VolumeToit, Toit } from '../model/types.js';
import { aDesSommets } from '../model/formes.js';
import type { PlanVuDeLa3d } from './etat3d.js';
import { estParasol, estAbri, estPiscine, estTerrasse, estBatiment, surParcelleDuProjet } from '../model/fonctions.js';
import { ajouterPergola3d } from './pergola3d.js';
import { ajouterPiscine3d } from './piscine3d.js';
import { traitSurSol, type SolRelief } from './relief3d.js';
import type { ContexteScene3d, ContexteObjets } from './typesScene.js';

/** La couleur d'un `MeshStandardMaterial` a qui l'on n'en donne pas. */
const BLANC_PAR_DEFAUT = 0xffffff;

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
 * Un groupe pose sur le sol en `p` : ce qu'on y met compte ses hauteurs depuis le sol local, sans
 * que chaque module (pergola, piscine, parasol, releve de facade) ait a connaitre le relief. Sur
 * sol plat, c'est la scene elle-meme.
 */
function groupeAuSol(scene: THREE_NS.Object3D, sol: SolRelief | null, p: PtBrut): THREE_NS.Object3D {
  if (!sol) return scene;
  const groupe = new THREE.Group();
  groupe.position.y = sol.hauteur(p);
  scene.add(groupe);
  return groupe;
}

/** Des primitives qui posent dans `cible` : la scene, ou un groupe pose sur le sol. */
export function primitivesDans(cible: THREE_NS.Object3D, co: ContexteObjets): Primitives {
  return cible === co.scene ? co.prim : creerPrimitives({ scene: cible, versLocal: co.versLocal, chargerTexture: co.ctx.chargerTexturePolyhaven });
}

/** Le centre d'un objet du plan, pour lire le sol sous lui. */
export function centreDe(o: ObjetPlan): PtBrut {
  return o.type === 'circle' ? o.center : aDesSommets(o) && o.pts.length ? centroid(o.pts) : { x: 0, y: 0 };
}

// « Objets opaques » ignore l'opacite du plan 2D, souvent < 1 pour voir a travers en mode Plan.
const opaciteDe = (o: ObjetPlan) => vue3d.objetsOpaques ? undefined : o.fillOpacity;
// « Texture » decoche revient a la couleur unie sans retirer la texture de chaque objet.
/**
 * Les textures d'un objet en 3D : celles choisies dans l'inspecteur ; sur les murs d'un batiment qui
 * n'en a pas, celle de son materiau (model/couleurMur.ts, three/textureMur.ts), que sa couleur teinte.
 */
const texturesDe = (o: ObjetPlan) => {
  if (!vue3d.textures) return null;
  const materiau = !o.textureVerticale && o.type === 'polygon' && estBatiment(o) ? textureDesMurs(o) : null;
  return { horizontale: o.textureHorizontale, vertical: o.textureVerticale ?? (materiau ? textureMur(materiau) : undefined) };
};

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
  const trace = courbePolyligne(o.pts, !!o.curve);
  const poly = ribbonChemin(trace, o.width || 1);
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
    const drape = prim.addRubanDrape(trace, o.width || 1, couleur, DECALAGE_CHEMIN_M, opaciteDe(o), tex, COUCHES_SOL.chemin, sol.hauteur);
    if (drape) drape.userData[HORS_EXPORT] = true;
    const modele = prim.addRibbonFlat(poly, couleur, 0.006, opaciteDe(o), tex, COUCHES_SOL.chemin, sol.hauteur);
    if (modele && drape) { modele.userData[EXPORT_SEULEMENT] = true; modele.visible = false; }
  }
  else if (poly) prim.addRibbonFlat(poly, couleur, 0.006, opaciteDe(o), vue3d.textures ? o.textureHorizontale : null, COUCHES_SOL.chemin);
  else if (sol) scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(traitSurSol(trace, sol, versLocal, 0.008, false)), new THREE.LineBasicMaterial({ color: o.stroke || couleur })));
  else prim.addGroundOutline(trace, o.stroke || couleur, false);
}

/**
 * Un parasol n'est pas un volume plein : un mat fin porte une toile a sa hauteur. L'extruder en
 * ferait un cylindre opaque de 3 m au milieu de la terrasse — exactement ce qu'on ne veut pas voir
 * quand on juge son implantation. Le mat se dresse a SA position (le bord de toile pour un
 * deporte) ; la toile reste centree.
 */
export function ajouterParasol(par: ObjetCercle, co: ContexteObjets): void {
  const { versLocal, ctx } = co;
  // Le mat et la toile comptent leurs hauteurs depuis le sol au pied du mat.
  const scene = groupeAuSol(co.scene, co.sol, ctx.positionMat(par));
  const hMat = hauteurParasolDe(par);
  const pl = versLocal(par.center);
  const plMat = versLocal(ctx.positionMat(par));
  const matMat = new THREE.MeshStandardMaterial({ color: 0x6b5a44 });
  const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, hMat, 10), matMat);
  mat.position.set(plMat.x, hMat / 2, plMat.z);
  scene.add(mat);
  if (par.parasol?.matDeporte) {
    // Le bras horizontal qui rattrape le deport, sinon la toile flotte sans lien visible.
    const dx = pl.x - plMat.x, dz = pl.z - plMat.z;
    const L = Math.hypot(dx, dz);
    if (L > 0.01) {
      const bras = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, L, 8), matMat);
      bras.position.set((pl.x + plMat.x) / 2, hMat, (pl.z + plMat.z) / 2);
      bras.rotation.z = Math.PI / 2;
      bras.rotation.y = -Math.atan2(dz, dx);
      scene.add(bras);
    }
  }
  const matToile = new THREE.MeshStandardMaterial({ color: par.fill || '#7a9e6b', side: THREE.DoubleSide });
  appliquerOpacite(matToile, opaciteDe(par));
  const urlToile = urlTexture(vue3d.textures ? (par.textureHorizontale || par.textureVerticale) : null);
  if (urlToile) matToile.map = ctx.chargerTexturePolyhaven(urlToile);
  // Cone tres plat : la silhouette d'un parasol ouvert, et la meme emprise au sol que l'ombre en 2D.
  const hToile = Math.max(0.15, par.r * 0.28);
  const toile = new THREE.Mesh(new THREE.ConeGeometry(par.r, hToile, 24), matToile);
  toile.position.set(pl.x, hMat + hToile / 2, pl.z);
  scene.add(toile);
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
  // `fill` est facultatif : sans couleur, l'objet prend le blanc que Three lui laisserait (D-8).
  // Une maison du voisinage prend la couleur que la section « Voisinage (3D) » lui tire.
  const apparence = !diag && o.voisinage && o.type === 'polygon' && estBatiment(o) ? apparenceVoisin(co.voisinage3d, o.key) : null;
  // Un batiment prend la couleur de ses murs lue sur une photo de rue, ou celle de son materiau
  // (model/couleurMur.ts), sauf choix de la couleur du plan ; un reglage du voisinage l'emporte.
  const reelle = o.type === 'polygon' && estBatiment(o) ? couleurMursRetenue(o)?.couleur : undefined;
  const couleurMur = apparence?.couleurMur ?? reelle ?? o.fill ?? BLANC_PAR_DEFAUT;
  // Un batiment de la parcelle du projet en plusieurs corps (model/volumesToit.ts) : un prisme par
  // corps, a son egout ; un batiment dont un mur a ete releve en L se coupe en deux volumes, chacun
  // a sa hauteur (facade/profil.ts) ; tout autre objet reste un seul prisme.
  const toitRecompose = o.type === 'polygon' && estBatiment(o) && !o.batiment?.facades?.some((r) => r.partieBasse);
  // Les corps et pignons reconstruits sur le LiDAR (facade/toits/toitCorps.ts) : un prisme par corps a son
  // egout le plus bas, ses murs hauts et son toit poses par three/toitCorps3d.ts.
  const modeToit = toitRecompose ? modeToitActif(o.batiment) : 'simple';
  // Une maison voisine ne montre ses corps et pignons que si la section « Voisinage (3D) » le veut (oui par defaut).
  const corpsPermis = surParcelleDuProjet(o) || co.voisinage3d.toits.corps;
  // Un bow-window n'a ni prisme ni fenetres comme un corps : il se dessine a part (ajouterBowWindows3d), a la forme de son plan.
  const { hotes: corpsToit, bows: bowWindows } = separerBowWindows(modeToit === 'corps' && corpsPermis ? corpsVisibles(o.batiment?.corpsToit, vue3d.corpsIsole?.cle === o.key ? vue3d.corpsIsole.rang : null) : null);
  const volumesToit = modeToit === 'volumes' ? volumesActifs(o) : null;
  // Le toit mesure au LiDAR (model/toitMesure.ts) : un seul prisme, le contour lui-meme, a l'egout
  // le plus bas ; les rehausses montent ses murs jusqu'a la surface. Des prismes par rectangle
  // laissaient la surface pendre dans le vide la ou un rectangle ne couvrait pas le contour.
  const toitMesure = modeToit === 'mesure' ? o.batiment?.toitMesure ?? null : null;
  const egoutDe = (v: VolumeToit): number => v.egout ?? h;
  // Des corps lus sur un contour remis a l'equerre (un cote de biais : il ne se decoupe pas tel
  // quel) ne le suivent plus : le batiment garde alors la forme du plan, ses toits decoupes dessus.
  const surContour = corpsToit && o.type === 'polygon' && !rectanglesDuContour(o.pts) ? facettesSurContour(corpsToit, o.pts) : null;
  const volumes = surContour
    ? [{ pts: footprint, hauteur: surContour.bas, hauteursMurs: surContour.hauteursMurs }]
    : corpsToit
    // Un appentis ouvert n'a pas de prisme : des poteaux le portent, et le mur est celui du corps qui le porte.
    ? corpsToit.filter((c) => !estAppentisOuvert(c)).map((c) => ({ pts: c.pts, hauteur: Math.min(...c.egouts), hauteursMurs: hauteursMursCorps(c) }))
    : toitMesure
    ? [{ pts: footprint, hauteur: toitMesure.egout, hauteursMurs: footprint.map((_, i) => Math.max(toitMesure.egout, hauteurMurMesuree(toitMesure, footprint, i) ?? toitMesure.egout)) }]
    : volumesToit
    ? volumesToit.map((v) => ({ pts: v.pts, hauteur: egoutDe(v) }))
    : o.type === 'polygon' && o.batiment?.facades?.some((r) => r.partieBasse) ? volumesDuBatiment(o.pts, h, o.batiment?.facades) : [{ pts: footprint, hauteur: h }];
  // Une terrasse percee (le bassin de sa piscine, un trou) garde son trou : pleine, elle recouvrait
  // le bassin des qu'elle n'etait pas la terrasse courante (vitrine, « tous les objets »). Un
  // bassin a cheval sur son bord l'encoche : elle s'extrude alors morceau par morceau.
  const forme = formeDeTerrasse(o, etat.objects);
  const pieces = forme ? forme.map((m) => ({ pts: m.contour, hauteur: h, trous: m.trous })) : volumes.map((v) => ({ ...v, trous: trousDeTerrasse(o, etat.objects) }));
  // Une autre terrasse est de niveau a sa hauteur finie au-dessus du point HAUT du sol sous elle
  // (engine/hauteurs.ts), comme la terrasse courante : son prisme monte jusque-la.
  const dessusTerrasse = co.solMoteur && estTerrasse(o) ? dessusTerrasseM(o, co.solMoteur) : null;
  pieces.forEach((v) => prim.addPrism(v.pts, yBase, (dessusTerrasse ?? ySol + v.hauteur) - yBase, couleurMur, false, opaciteDe(o), texturesDe(o), v.trous));
  // Un batiment releve (photo de facade, ouvertures, toit) s'habille par-dessus son prisme, depuis
  // le sol en son centre : la photo couvre le mur de la jusqu'au toit, le prisme nu descend dessous.
  // Ce que l'on sait de la couverture en plus de sa couleur : le materiau des fichiers fonciers et la
  // pente, qui choisissent la texture (tuiles plates, canal, ardoise, zinc ; MD/spec-toit-ign.md §6.2).
  const couverture = o.type === 'polygon' ? { materiauxToiture: (o.bdtopo as { materiauxToiture?: unknown } | null | undefined)?.materiauxToiture, pente: o.batiment?.toit ? penteDuToit(o.pts, o.batiment?.toit) : null, latitude: co.latitude, choix: o.batiment?.toit?.couverture ?? null } : undefined;
  if (o.type === 'polygon' && (o.batiment?.facades?.length || o.batiment?.toit || volumesToit)) {
    ajouterReleve3d({ scene: groupeAuSol(co.scene, co.sol, centre), toLocal: co.versLocal, couleurMur, textures: vue3d.textures, sansOmbres: vue3d.facadesSansOmbres, couverture }, o, h, volumesToit, !!toitMesure || !!corpsToit, corpsToit ?? null);
  }
  if (o.type === 'polygon' && corpsToit && surContour) {
    ajouterToitCorpsSurContour3d({ scene: groupeAuSol(co.scene, co.sol, centre), toLocal: co.versLocal, couleurMur, textures: vue3d.textures, textureMur: texturesDe(o)?.vertical, couverture }, corpsToit, o.batiment?.toit, o.pts);
  } else if (o.type === 'polygon' && corpsToit) {
    ajouterToitCorps3d({ scene: groupeAuSol(co.scene, co.sol, centre), toLocal: co.versLocal, couleurMur, textures: vue3d.textures, textureMur: texturesDe(o)?.vertical, couverture }, corpsToit, o.batiment?.toit, o.pts);
  }
  if (o.type === 'polygon' && bowWindows.length) ajouterBowWindows3d({ scene: groupeAuSol(co.scene, co.sol, centre), toLocal: co.versLocal, couleurMur, textures: vue3d.textures, textureMur: texturesDe(o)?.vertical, couverture }, bowWindows, o.batiment?.toit);
  // Les cheminees et toits-terrasses observes (MD/spec-regles-toits.md §2.6, §2.7) : un corps qui n'en porte pas ne pose rien de plus.
  if (o.type === 'polygon' && corpsToit?.some((c) => c.cheminees?.length || c.terrasse)) {
    const sol = co.sol;
    const ctxObs = { scene: groupeAuSol(co.scene, co.sol, centre), toLocal: co.versLocal, couleurMur, textures: vue3d.textures, textureMur: texturesDe(o)?.vertical, couverture,
      // Une souche adossee part du sol sous elle, compte depuis le sol au centre (origine du groupe).
      ...(sol ? { sol: (p: PtBrut) => sol.hauteur(p) - ySol } : {}) };
    ajouterCheminees3d(ctxObs, corpsToit);
    ajouterTerrasses3d(ctxObs, corpsToit, o.batiment?.toit, o.pts);
  }
  // La surface mesuree au LiDAR remplace les formes simples (three/toitMesure3d.ts), posee a l'egout de chaque corps.
  if (o.type === 'polygon' && toitMesure) {
    ajouterToitMesure3d({ scene: groupeAuSol(co.scene, co.sol, centre), toLocal: co.versLocal, couleurMur, textures: vue3d.textures, couverture }, o.pts, toitMesure, o.batiment?.toit, [], toitMesure.egout);
  }
  // Un batiment recoit ses details (three/detailsBatiment.ts) : debord et gouttiere, aretes,
  // soubassement, fenetres par niveau, cheminee — moins de loin.
  if (o.type === 'polygon' && estBatiment(o)) {
    const etages = (o.bdtopo as { nombreEtages?: unknown } | null | undefined)?.nombreEtages;
    // Les fenetres : celles que le voisinage tire pour une maison voisine ; pour un batiment du
    // projet, la dimension commune ou la liste reglee une par une (model/fenetres3d.ts).
    const f3d = fenetres3dDe(o);
    const fenetres = apparence ? fenetresDuVoisin(apparence, co.voisinage3d) : { largeur: f3d.largeur, hauteur: f3d.hauteur, appui: f3d.appui, entraxe: f3d.entraxe, ...(f3d.couleur ? { couleur: f3d.couleur } : {}) };
    ajouterDetailsBatiment(
      { scene: groupeAuSol(co.scene, co.sol, centre), toLocal: co.versLocal, couleurMur, textures: vue3d.textures, couverture, distance: dist(centre, co.centre),
        // Les facades de pres (R2) : baies en creux et maconnerie sur la parcelle et ses abords, hors
        // qualite Econome ; l'epoque (BD TOPO) choisit petits bois et maconnerie.
        relief: vue3d.qualite !== 'econome' && dist(centre, co.centre) <= RELIEF_FENETRES_M,
        annee: anneeDe((o.bdtopo as { dateApparition?: unknown } | null | undefined)?.dateApparition),
        detailFin: parametresQualite(vue3d.qualite).detailFinM,
        // Le groupe est pose sur le sol au centre : le soubassement et les angles descendent jusqu'au sol sous chaque mur.
        ...(co.sol ? { sol: (p: PtBrut) => (co.sol as SolRelief).hauteur(p) - ySol, base: yBase - ySol } : {}) },
      // Le profil de facades retenu pour le batiment (facade/regles/facades/profils.ts) : ses dimensions et ses seuils.
      o, h, { etages: typeof etages === 'number' ? etages : null, cotesReleves: (o.batiment?.facades ?? []).map((r) => r.cote), fenetres, profil: valeursFacadesDe(o.batiment),
        ...(!apparence && f3d.mode === 'uneParUne' && f3d.liste ? { ouvertures: f3d.liste } : {}),
        // En surface mesuree, chaque mur a sa hauteur (la ou la couverture le rejoint) : les fenetres montent avec lui.
        ...(volumesToit ? { volumes: volumesToit.map((v) => ({ pts: v.pts, hauteur: egoutDe(v), toit: toitDuVolume(v, o.batiment?.toit) })) } : {}),
        // Corps ou surface mesuree : chaque mur a sa hauteur, les fenetres montent avec lui.
        ...((corpsToit || toitMesure) && o.batiment?.toit ? { volumes: volumes.map((v) => ({ ...v, toit: o.batiment?.toit as Toit })) } : {}),
        ...(toitMesure || corpsToit ? { sansToit: true } : {}),
        // Les fenetres sur les murs des corps, a leur hauteur, et dans leurs pignons (facade/ouvertures.ts).
        // Sur le contour, les fenetres suivent ses murs, comme en surface mesuree.
        // Un appentis ouvert n'a pas de mur : pas de fenetre non plus.
        ...(corpsToit && !surContour && (apparence || f3d.mode !== 'uneParUne') ? { corps: corpsToit.filter((c) => !estAppentisOuvert(c)) } : {}) }
    );
  }
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
