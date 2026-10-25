// Construction de la scene Three.js (spec §6.4, three/).
//
// Le plan est en metres, Y vers le nord ; la 3D est en metres, Y vers le HAUT et Z vers le sud.
// Toute la conversion tient dans les quelques lignes qui posent les sommets : `{x, y}` du plan
// devient `{x, hauteur, -y}`. C'est la seule chose a garder en tete en lisant ce qui suit.
//
// La fonction reconstruit tout a chaque appel - cocher une case rebatit la scene entiere. C'est
// assume : la scene est petite, et une reconstruction complete evite toute une classe de bugs
// d'etat residuel. Un seul detail y resiste, et il est traite en tete : si on reconstruit la MEME
// terrasse, la camera reste ou l'utilisateur l'avait laissee.

import { ECHELLE_LUMIERE } from './bibliotheque.js';
import { animerMateriaux } from './materiauxVivants.js';
import { reposerPositionGps } from './positionGps3d.js';
import { reposerFacadeDevant } from './facadeDevant3d.js';
import { procheDuProjet, type ObjetMitoyen } from '../model/mitoyennete.js';
import { ajouterNomsDesRues3d } from './rues3d.js';
import { vue3d, cleDeVue, hotes3d, signalerSceneBatie, rendre3d, type SceneVue3d } from './etat3d.js';
import { cadreOmbres, monterRendu } from './rendu.js';
import { imageAttendue } from './comparaison3d.js';
import { placeEchelle, poserObjetsEchelle } from './objetsEchelle.js';
import { accorderFocale } from './presentation.js';
import { parametresQualite } from './qualite.js';
import { centroid, dist } from '../geometry/basic.js';
import { solDuProjet, zReferenceOuvrage } from '../engine/sol.js';
import { computeTerrasseLayers } from '../engine/layers.js';
import { ensureConstruction } from '../engine/construction.js';
import { showErrBanner } from '../shell/dialogs.js';
import { ajouterClotureVoisinage, limitesDuVoisinage } from './clotureVoisinage.js';
import { voisinage3dDe } from '../model/voisinage3d.js';
import {
  creerPrimitives, versLocalDepuis, poserEnCouche, percerSol, COUCHES_SOL, 
  type VersLocal
} from './primitives.js';
import type * as THREE_NS from 'three';
import type { ObjetPlan, ObjetCercle, PtBrut, Relief } from '../model/types.js';
import { aDesSommets, enPoints } from '../model/formes.js';
import type { PlanVuDeLa3d } from './etat3d.js';
import { visibleEnIsolement } from '../model/fonctions.js';
import { solDeLaScene, geometrieSol, bornesCarre, type SolRelief } from './relief3d.js';
import { empriseGrille, type Emprise } from '../model/relief.js';
import { empriseDuCalque, MARGE_CALQUE_M } from '../model/calque.js';
import type { ContexteScene3d, ContexteObjets } from './typesScene.js';
import { oublierLaScene, retenirCloture, retenirLaScene, epurerSiBesoin, retenirHorsObjets, ajouterObjetsDuPlan } from './sceneVivante.js';
import { ajouterContourTerrasse, ajouterOrtho, construireStructureTerrasse } from './sceneTerrasse.js';
import { ajouterPiscinesSeules, ajouterCloture, appliquerOmbres, rafraichirArbres } from './sceneObjets.js';
export type { ContexteScene3d } from './typesScene.js';
export { PART_CIEL_JOINTS, PART_CIEL_SOUS_PLATELAGE, ombrerSousLePlatelage, OPACITE_LAMES_ISOLEMENT, OPACITE_LAMES_TRANSLUCIDES } from './sceneTerrasse.js';
export { DECALAGE_CHEMIN_M } from './sceneObjets.js';
export { comparerObjets3d, surlignerDans3d, epurerVue3d, epurerLeTemps, visibilite3d, racinesDe3d, objetSousLePointeur, remplacerObjets3d, type Apres3d, type FormeSurlignee3d, type Surbrillance3d } from './sceneVivante.js';

/**
 * Le centre de la scene : la terrasse ; a defaut la parcelle, sinon le premier objet a sommets — la
 * camera doit regarder quelque chose dans tous les cas.
 */
function centreDeLaScene(obj: ObjetPlan | null, etat: PlanVuDeLa3d, ctx: ContexteScene3d): PtBrut {
  // Un objet isole est le centre de la scene, terrasse ou non.
  const isole = etat.isolement ? etat.objects.find(o => o.key === etat.isolement) : undefined;
  const objetCentre = isole || obj || ctx.trouverParcelleCloture() || etat.objects.find((o: ObjetPlan) => aDesSommets(o) && o.pts.length);
  if (!objetCentre) return { x: 0, y: 0 };
  return objetCentre.type === 'circle' ? { x: objetCentre.center.x, y: objetCentre.center.y } : centroid(objetCentre.pts);
}

/**
 * L'etendue que la camera et le sol doivent couvrir. En mode « tous les objets » — et toujours sans
 * terrasse, ou ils sont la seule chose a montrer —, c'est tout le plan : sinon la maison ou la
 * parcelle se retrouveraient hors champ ou sous un sol trop petit. Du voisinage importe, seules les
 * parcelles mitoyennes et leurs maisons comptent (model/mitoyennete.ts) : un voisinage de 100 m
 * reculait la camera au point de ne plus voir la maison ; le reste se voit en reculant.
 */
function etendueDeLaScene(obj: ObjetPlan | null, etat: PlanVuDeLa3d, cen: PtBrut): number {
  const cercle = (o: ObjetCercle) => [
    { x: o.center.x - o.r, y: o.center.y }, { x: o.center.x + o.r, y: o.center.y },
    { x: o.center.x, y: o.center.y - o.r }, { x: o.center.x, y: o.center.y + o.r }
  ];
  const sommets = (o: ObjetPlan): PtBrut[] => o.type === 'circle' ? cercle(o) : o.pts ? o.pts : [];
  const pts = obj ? sommets(obj).slice() : [];
  if (etat.isolement) {
    // Isole, un objet est seul dans la scene avec ses associes : la camera et le sol se reglent sur eux.
    etat.objects.forEach((o: ObjetPlan) => { if (o !== obj && visibleEnIsolement(o, etat.objects, etat.isolement)) pts.push(...sommets(o)); });
  } else if (vue3d.tousLesObjets || !obj) {
    const proche = procheDuProjet(etat.objects as ObjetMitoyen[]);
    etat.objects.forEach((o: ObjetPlan) => { if (o !== obj && proche(o as ObjetMitoyen)) pts.push(...sommets(o)); });
  }
  const maxRadius = pts.reduce((m: number, p: PtBrut) => Math.max(m, dist(p, cen)), 0);
  return Math.max(3, maxRadius * 2);
}

/** Le relief sans son paysage : le sol d'un plan dont le voisinage est masque. */
function sansPaysage(r: Relief): Relief {
  const reste = { ...r };
  delete reste.paysage;
  return reste;
}

/** La marge du sol autour des parcelles affichees : celle du calque (model/calque.ts). */
export const MARGE_SOL_M = MARGE_CALQUE_M;

/**
 * Les bornes du sol, en coordonnees du plan : le calque — l'emprise des parcelles affichees, la
 * parcelle et son voisinage visible, plus `MARGE_SOL_M` de chaque cote. Sans parcelle affichee
 * (plan dessine a la main), ou un objet isole, le carre de la camera (`2 × extent` autour du
 * centre), comme avant.
 */
export function bornesDuSol(etat: PlanVuDeLa3d, ctx: ContexteScene3d, cen: PtBrut, extent: number): Emprise {
  const calque = etat.isolement ? null : empriseDuCalque(etat.objects, ctx.objetMasque);
  return calque ?? bornesCarre(cen, extent * 2);
}

type CameraConservee = { pos: THREE_NS.Vector3; cible: THREE_NS.Vector3 } | null;

/** L'ouverture verticale de la camera de la Vue 3D, en degres. */
const FOV_VUE3D_DEG = 45;
/** La marge autour du disque cadre : le bord proche, vu en perspective, parait plus grand. */
const MARGE_CADRAGE = 1.25;

/**
 * La distance ou poser la camera, sur la diagonale (en plongee de 35°), pour que le disque au sol de
 * `rayon` tienne dans l'image. En plongee, le disque parait ecrase en hauteur (sa profondeur vaut
 * `sin 35°` de sa largeur) : l'ancien recul de 1,56 diametre le laissait au quart de l'image. Jamais
 * plus loin que cet ancien recul : sur un ecran en hauteur, il coupait les cotes, comme avant.
 */
export function distanceDeCadrage(rayon: number, aspect: number): number {
  const plongee = Math.atan(1 / Math.SQRT2);
  const tv = Math.tan((FOV_VUE3D_DEG * Math.PI) / 360), th = tv * aspect;
  const ajuste = Math.max((rayon * Math.sin(plongee)) / tv, rayon / th) * MARGE_CADRAGE;
  return Math.min(ajuste, 0.9 * Math.sqrt(3) * 2 * rayon);
}

/**
 * La scene, sa camera, son rendu et ses lumieres, le sol. `null` si le navigateur refuse le
 * contexte WebGL : sur iOS Safari, passe le plafond de contextes vivants, le constructeur reussit
 * mais rend un contexte deja perdu — sans ce test, la compilation du premier shader plantait sur
 * « Argument 1 ('shader') ... must be an instance of WebGLShader » au lieu d'un message clair.
 */
function monterScene(host: HTMLElement, extent: number, conservee: CameraConservee, terrain: { sol: SolRelief | null; cen: PtBrut; versLocal: VersLocal; bornes: Emprise; serre: boolean; rayonParcelle: number | null }) {
  const w = host.clientWidth || 600, h = host.clientHeight || 420;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe7ea);
  // Le plan lointain suit le sol : a 500 m, un voisinage de 200 m etait coupe en reculant la camera.
  const b = terrain.bornes;
  const loin = Math.max(Math.abs(b.xMin - terrain.cen.x), Math.abs(b.xMax - terrain.cen.x), Math.abs(b.yMin - terrain.cen.y), Math.abs(b.yMax - terrain.cen.y));
  // Le paysage du relief va jusqu'a l'horizon d'un voisinage etendu (1,5 km), bien au-dela des
  // parcelles affichees : vu d'un coin, son coin oppose doit rester dans le champ.
  const q = terrain.sol?.relief.paysage ? empriseGrille(terrain.sol.relief.paysage) : null;
  const loinSol = q ? Math.hypot(Math.max(Math.abs(q.xMin - terrain.cen.x), Math.abs(q.xMax - terrain.cen.x)), Math.max(Math.abs(q.yMin - terrain.cen.y), Math.abs(q.yMax - terrain.cen.y))) : 0;
  const camera = new THREE.PerspectiveCamera(FOV_VUE3D_DEG, w / h, 0.05, Math.max(500, loin * 4, loinSol * 2));
  // Sur un sol en relief, la camera vise le centre du plan a la hauteur du sol : la terrasse, elle,
  // reste a la hauteur finie au-dessus du zero du plan, et le sol passe dessous ou au-dessus.
  const hCible = terrain.sol ? terrain.sol.hauteur(terrain.cen) : 0;
  // Le plan entier (la parcelle et ses mitoyennes) est cadre au plus juste ; une terrasse ou un objet
  // isole gardent leur recul, qui laisse voir la maison autour.
  const recul = terrain.serre ? distanceDeCadrage(extent / 2, w / h) / Math.sqrt(3) : extent * 0.9;
  camera.position.set(recul, recul + hCible, recul);
  const niveau = parametresQualite(vue3d.qualite);
  const renderer = new THREE.WebGLRenderer({ antialias: niveau.anticrenelage, preserveDrawingBuffer: true });
  const glCtx3d = renderer.getContext && renderer.getContext();
  if (!glCtx3d || (glCtx3d.isContextLost && glCtx3d.isContextLost())) {
    showErrBanner('Vue 3D : le navigateur a refuse de creer un contexte 3D (trop d\'onglets/vues 3D ouverts ?). Ferme quelques onglets ou recharge la page, puis reessaie.');
    return null;
  }
  // Le rapport de pixels suit l'ecran jusqu'au plafond du niveau : a 1 (Normale), le cout d'avant.
  renderer.setPixelRatio(Math.min(niveau.pixelRatioMax, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
  renderer.setSize(w, h);
  // Sortie lineaire, comme a la r128 (voir three/bibliotheque.ts) ; reglerRendu la maintient.
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.shadowMap.enabled = vue3d.ombres;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  // Le pincement a deux doigts zoome deux fois plus que par defaut, comme la molette et les boutons
  // (three/navigation.ts) : a la vitesse d'origine, traverser un grand voisinage demandait des dizaines
  // de gestes. La molette, elle, ne passe plus par OrbitControls.
  controls.zoomSpeed = 2;
  controls.target.set(0, hCible, 0);
  controls.update();
  // Meme terrasse reconstruite (une case a cocher) : la camera reste ou l'utilisateur l'avait laissee.
  if (conservee) {
    camera.position.copy(conservee.pos);
    controls.target.copy(conservee.cible);
    controls.update();
  }
  const { hemiLight, dirLight, dirFill } = poserLumieres(scene, extent, cadreOmbres(terrain.rayonParcelle, extent));

  const matSol = new THREE.MeshStandardMaterial({ color: 0x9fb98c });
  // Le sol est la couche la plus basse : on le recule plutot que de tirer vers la camera ce qui est
  // pose dessus (COUCHES_SOL).
  poserEnCouche(matSol, COUCHES_SOL.fond);
  percerSol(matSol);
  // Avec un relief (et la preference « Sol en relief »), le plan vert devient le maillage de la grille
  // d'altitudes, prolonge plat jusqu'au meme carre (three/relief3d.ts) ; il garde son materiau, sa
  // couche et son gabarit. Sans relief, rien ne change.
  let ground: THREE_NS.Mesh;
  if (terrain.sol) {
    ground = new THREE.Mesh(geometrieSol(terrain.sol, b, terrain.versLocal), matSol);
    ground.name = 'sol-relief';
  } else {
    // Le plan vert couvre les bornes, qui ne sont pas centrees sur la scene : il est pose en leur milieu.
    ground = new THREE.Mesh(new THREE.PlaneGeometry(b.xMax - b.xMin, b.yMax - b.yMin), matSol);
    ground.rotation.x = -Math.PI / 2;
    const milieu = terrain.versLocal({ x: (b.xMin + b.xMax) / 2, y: (b.yMin + b.yMax) / 2 });
    ground.position.set(milieu.x, 0, milieu.z);
  }
  ground.receiveShadow = vue3d.ombres;
  scene.add(ground);
  return { scene, camera, renderer, controls, hemiLight, dirLight, dirFill, ground };
}

/**
 * Une seule lumiere directionnelle laisse tout ce qui lui tourne le dos eclaire par l'ambiante
 * plate : un angle rentrant se lit alors comme une seule tache. HemisphereLight (ciel/sol, degrade
 * selon que la face regarde vers le haut ou le bas) remplace l'ambiante, et une seconde
 * directionnelle plus faible, a l'oppose, degrade meme les faces que le soleil n'atteint pas.
 * Position, intensite et couleur sont posees ensuite par `appliquerLumiereVue3d`, d'apres la date,
 * l'heure et le lieu : les valeurs d'ici ne servent qu'a exister.
 */
function poserLumieres(scene: THREE_NS.Scene, extent: number, cadre: number) {
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x4a3c2a, 0.5 * ECHELLE_LUMIERE);
  scene.add(hemiLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.75 * ECHELLE_LUMIERE);
  dirLight.position.set(extent, extent * 1.5, extent * 0.6);
  if (vue3d.ombres) {
    // Le cadrage de la shadow map est resserre sur la parcelle du projet et ses abords (R1,
    // three/rendu.ts) : sur l'etendue entiere d'un voisinage, ses 2 048 pixels faisaient des ombres
    // floues au pied des murs. Sans parcelle, il suit l'etendue de la scene, comme avant. Seule la
    // lumiere principale projette — une deuxieme direction d'ombres ajouterait de la confusion.
    dirLight.castShadow = true;
    const carte = parametresQualite(vue3d.qualite).carteOmbre;
    dirLight.shadow.mapSize.set(carte, carte);
    const d = cadre;
    dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = extent * 9;
    dirLight.shadow.bias = -0.0005;
    // Le cadre resserre affine la carte : un decalage selon la normale evite les stries sur les murs.
    dirLight.shadow.normalBias = 0.02;
  }
  scene.add(dirLight);
  const dirFill = new THREE.DirectionalLight(0xffffff, 0.3 * ECHELLE_LUMIERE);
  dirFill.position.set(-extent * 0.8, extent * 1.1, -extent * 0.5);
  scene.add(dirFill);
  return { hemiLight, dirLight, dirFill };
}

export function buildThreeScene(terrasse: ObjetPlan | null, etat: PlanVuDeLa3d, ctx: ContexteScene3d){
  // Une piscine, une pergola ou un carport isole : la terrasse courante n'est construite que si elle
  // lui est associee (la plage d'une piscine) ; sinon la scene ne montre que l'objet isole.
  const obj = terrasse && etat.isolement && !visibleEnIsolement(terrasse, etat.objects, etat.isolement) ? null : terrasse;
  // Meme terrasse reconstruite (une case a cocher, pas un changement d'objet) : la camera reste ou
  // l'utilisateur l'avait laissee. Autre terrasse : `cen` change, une position copiee telle quelle
  // viserait ailleurs — la le cadrage par defaut est correct. `obj` peut etre null : la Vue 3D
  // s'ouvre aussi sur un plan SANS terrasse ; seule la structure est alors sautee.
  const cleVue = cleDeVue(obj);
  const conservee = (vue3d.scene && vue3d.dernierObjKey === cleVue)
    ? { pos: vue3d.scene.camera.position.clone(), cible: vue3d.scene.controls.target.clone() }
    : null;
  ctx.disposeThreeScene();
  oublierLaScene();
  // L'hote est enregistre par le panneau de la Vue 3D (zones/vue3d/) : sans lui, rien a dessiner.
  const host = hotes3d.vue3d;
  if(!host) return;
  // Sans terrasse, une construction par defaut jetable garde les constantes de section definies.
  const c = obj ? ensureConstruction(obj) : ensureConstruction({});
  const layers = obj ? computeTerrasseLayers(obj, etat.objects) : null;
  const cen = centreDeLaScene(obj, etat, ctx);
  const extent = etendueDeLaScene(obj, etat, cen);
  const versLocal = versLocalDepuis(cen);
  // Le relief est celui de la parcelle du projet ; `null` sans relief ou si « Sol en relief » est
  // decoche — la scene est alors exactement celle d'avant (three/relief3d.ts). Le voisinage masque
  // emporte le paysage (le relief au-dela de la parcelle) : le sol revient a la grille du projet.
  const reliefProjet = ctx.trouverParcelleCloture()?.relief;
  const sol = solDeLaScene(reliefProjet && etat.voisinageVisible === false ? sansPaysage(reliefProjet) : reliefProjet);
  // Le meme relief, lu par le moteur (engine/sol.ts) : la structure de la terrasse, les poteaux
  // d'une pergola, le bord d'un bassin suivent le sol en pente (MD/spec-relief.md §6). Sol dessine
  // plat (pas de relief, ou « Sol en relief » decoche) : rien ne bouge, la structure est celle d'avant.
  const solMoteur = sol ? solDuProjet(etat.objects) : null;
  const bornes = bornesDuSol(etat, ctx, cen, extent);
  // Le rayon de la parcelle du projet autour du centre de la scene : le cadre des ombres et le debut
  // de la brume s'y accordent (three/rendu.ts).
  const pcl = ctx.trouverParcelleCloture();
  const rayonParcelle = pcl && aDesSommets(pcl) && pcl.pts.length >= 3 ? Math.max(...pcl.pts.map((p: PtBrut) => Math.hypot(p.x - cen.x, p.y - cen.y))) : null;
  const base = monterScene(host, extent, conservee, { sol, cen, versLocal, bornes, serre: !etat.isolement && (vue3d.tousLesObjets || !obj), rayonParcelle });
  if(!base) return;
  vue3d.dernierObjKey = cleVue;
  vue3d.centre = cen;
  const { scene, camera, renderer, controls, ground } = base;
  const prim = creerPrimitives({ scene, versLocal, chargerTexture: ctx.chargerTexturePolyhaven });

  if(obj) retenirHorsObjets(scene, () => ajouterContourTerrasse(scene, obj, versLocal, zReferenceOuvrage(solMoteur, enPoints(obj).pts)));
  ajouterOrtho(scene, versLocal, ctx, sol, bornes, base.ground);
  const voisinage3d = voisinage3dDe(ctx.trouverParcelleCloture());
  const latitude = (ctx.trouverParcelleCloture()?.cadastre as { origineLat?: unknown } | null | undefined)?.origineLat;
  const co: ContexteObjets = { prim, scene, versLocal, ctx, sol, solMoteur, objets: etat.objects, centre: cen, voisinage3d, latitude: typeof latitude === 'number' ? latitude : null };
  if(vue3d.tousLesObjets || !obj) ajouterObjetsDuPlan(obj, etat, co);
  // Une piscine fait partie du projet de terrasse (elle la perce, sa plage la prolonge) : elle se
  // voit meme quand les autres objets du plan sont caches. Isolee, la terrasse reste seule.
  // Les masques d'affichage s'appliquent : un objet isole ne laisse que lui et ses associes.
  else retenirHorsObjets(scene, () => ajouterPiscinesSeules(etat, co));
  // La cloture est celle de la parcelle : masquee avec elle quand un objet est isole.
  // La cloture est retenue deux fois : pour la comparaison avant / apres (poseCloture) et comme pose
  // hors objets, que la vue epuree de l'audit masque (horsObjets).
  if (!etat.isolement) retenirCloture(scene, () => ajouterCloture(prim, scene, versLocal, ctx, sol));
  // Les objets d'echelle (R5), a la demande : une voiture cote rue, une silhouette dans la parcelle.
  if (vue3d.objetsEchelle && !etat.isolement && pcl && aDesSommets(pcl) && pcl.pts.length >= 3) {
    const voisines = etat.objects.filter((o) => o.voisinage && o.fonction === 'terrain' && aDesSommets(o)).map((o) => enPoints(o).pts);
    const place = placeEchelle(pcl.pts, voisines);
    if (place) retenirHorsObjets(scene, () => poserObjetsEchelle(scene, versLocal, place, sol ? (p: PtBrut) => sol.hauteur(p) : undefined));
  }
  // Les clotures du voisinage : un reglage de la parcelle du projet, avec le reste du plan.
  if (voisinage3d.cloture.afficher && !etat.isolement && (vue3d.tousLesObjets || !obj)) {
    retenirHorsObjets(scene, () => ajouterClotureVoisinage(scene, versLocal, limitesDuVoisinage(etat.objects, ctx.objetMasque), sol ? sol.hauteur : undefined, voisinage3d.cloture));
  }
  // Le nom des rues, au sol, avec le reste du plan (three/rues3d.ts).
  const rues = ctx.trouverParcelleCloture()?.ruesVoisinage?.rues;
  if (voisinage3d.rues.afficher && etat.voisinageVisible !== false && rues?.length && !etat.isolement && (vue3d.tousLesObjets || !obj)) {
    ajouterNomsDesRues3d(scene, versLocal, rues, {
      hauteurSol: sol ? sol.hauteur : undefined,
      // Les rues sont decoupees au sol dessine : un nom hors du sol flotterait dans le vide.
      cadre: bornes,
    });
  }
  rafraichirArbres(scene, ground);

  const sc: SceneVue3d = {
    renderer, scene, camera, controls, raf: null,
    dirLight: base.dirLight, dirFill: base.dirFill, hemiLight: base.hemiLight, extent, cen,
    ...(sol ? { hauteurSol: (p: PtBrut) => sol.hauteur(p) } : {})
  };
  vue3d.scene = sc;
  // Courbe de film, ciel, brume, occlusion (R1) ; la vitrine peint son propre ciel (soleilVitrine.ts).
  monterRendu(sc, parametresQualite(vue3d.qualite), rayonParcelle ?? extent, !vue3d.apresSoleil);
  // Le relief des textures dessinees (R3), a l'ecran, hors qualite Econome.
  const animer = () => { if (vue3d.qualite !== 'econome') animerMateriaux(scene); };
  animer();
  // L'audit de la parcelle en cours : la scene neuve ne montre que ce qu'il garde.
  retenirLaScene({ sc, co, obj, ground });
  // La focale suit la hauteur de la camera (R6) : celle de l'oeil a hauteur d'homme, la vue d'ensemble au-dessus.
  const solCentre = sol ? sol.hauteur(cen) : 0;
  const animate = () => { sc.raf = requestAnimationFrame(animate); if (vue3d.pauseRendu) return; controls.update(); if (!vue3d.focaleBloquee) accorderFocale(camera, solCentre); if (imageAttendue(sc)) rendre3d(sc); };
  animate();
  // La position GPS de l'appareil, si elle est suivie : posee sur le sol de cette scene.
  reposerPositionGps(sol ? sol.hauteur : undefined);
  // La facade devant vous (mode audit), si elle est connue : surlignee sur cette scene.
  reposerFacadeDevant(sol ? sol.hauteur : undefined);
  ctx.applyMode3D();
  // Le panneau relit tout, y compris la liste des points de vue.
  ctx.syncControlesSoleilVue3d();
  ctx.appliquerLumiereVue3d();   // pose les lumieres ET rend une premiere image
  // Ce qui pilote la camera (le mode audit) la reprend sur la scene neuve.
  signalerSceneBatie();

  // La structure se construit apres cette premiere image. setTimeout et non requestAnimationFrame :
  // rAF ne se declenche pas quand l'onglet est en arriere-plan, et la terrasse ne serait jamais posee.
  setTimeout(()=>{
    // La scene a pu etre remplacee entre-temps : construire dans une scene morte laisserait des
    // meshes orphelins et un canevas noir.
    if(vue3d.scene !== sc) return;
    if(obj && layers) retenirHorsObjets(scene, () => construireStructureTerrasse(obj, layers, c, prim, ctx, etat.isolement === obj.key, { scene, versLocal, sol: solMoteur }));
    epurerSiBesoin();
    appliquerOmbres(scene, ground);   // les pieces qui viennent d'arriver projettent aussi
    animer();
    rendre3d(sc);
  }, 0);
}

