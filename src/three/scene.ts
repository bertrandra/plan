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

import { volumesActifs, toitDuVolume } from '../model/volumesToit.js';
import { modeToitActif, hauteurMurMesuree } from '../model/toitMesure.js';
import { ajouterToitMesure3d } from './toitMesure3d.js';
import { ajouterToitCorps3d } from './toitCorps3d.js';
import { hauteursMursCorps } from '../facade/toitCorps.js';
import { ajouterArbre3d } from './arbre3d.js';
import { ajouterNomsDesRues3d } from './rues3d.js';
import { actualiserFeuillesProches } from './feuilles.js';
import { vue3d, cleDeVue, hotes3d, type SceneVue3d, soleilVue3d } from './etat3d.js';
import { centroid, dist } from '../geometry/basic.js';
import { estPlots, PLOT_ASSISE_MIN_CM2 } from '../engine/constantes.js';
import { appuisEnHauteur, decaissementPoseMm, dessusTerrasseM } from '../engine/hauteurs.js';
import { solDuProjet, zReferenceOuvrage, type Sol } from '../engine/sol.js';
import { computeTerrasseLayers } from '../engine/layers.js';
import { formeDeTerrasse, trousDeTerrasse } from '../engine/structure.js';
import { ensureConstruction } from '../engine/construction.js';
import { dimsSection, sectionLambourde } from '../engine/portees.js';
import { hauteurParasolDe } from '../engine/parasol.js';
import { showErrBanner } from '../shell/dialogs.js';
import { estMesh } from './gardes.js';
import { ajouterReleve3d } from './releve3d.js';
import { ajouterDetailsBatiment } from './detailsBatiment.js';
import { ajouterClotureVoisinage, limitesDuVoisinage } from './clotureVoisinage.js';
import { voisinage3dDe, apparenceVoisin } from '../model/voisinage3d.js';
import { fenetres3dDe } from '../model/fenetres3d.js';
import { ajouterCloture3d } from './cloture3d.js';
import { volumesDuBatiment } from '../facade/profil.js';
import {
  creerPrimitives, versLocalDepuis, courbePolyligne, ribbonChemin, cerclePoly, urlTexture, appliquerOpacite, poserEnCouche, percerSol, COUCHES_SOL, SANS_OMBRE,
  type Primitives, type VersLocal
} from './primitives.js';
import type * as THREE_NS from 'three';
import type { ObjetPlan, ObjetCercle, PtBrut, Construction, ReglagesVoisinage3d, VolumeToit, Toit } from '../model/types.js';
import { aDesSommets, enPoints } from '../model/formes.js';
import type { ObjetMesurable } from '../engine/hauteurs.js';
import type { TuileOrtho } from '../render/ortho.js';
import type { PlanVuDeLa3d } from './etat3d.js';
import { estParasol, estAbri, estPiscine, estTerrasse, estBatiment, visibleEnIsolement } from '../model/fonctions.js';
import { ajouterPergola3d } from './pergola3d.js';
import { ajouterPiscine3d } from './piscine3d.js';
import { ajouterAssise3d } from './assise3d.js';
import { solDeLaScene, geometrieSol, peindreOrthoSurSol, traitSurSol, bornesCarre, type SolRelief } from './relief3d.js';
import type { Emprise } from '../model/relief.js';
import { empriseDuCalque, intersectionEmprises, MARGE_CALQUE_M } from '../model/calque.js';

/** La couleur d'un `MeshStandardMaterial` a qui l'on n'en donne pas. */
const BLANC_PAR_DEFAUT = 0xffffff;

/** Ce que la construction de la scene 3D demande au reste du programme. */
export interface ContexteScene3d {
  /** La parcelle qui porte la cloture, s'il y en a une. */
  trouverParcelleCloture: () => ObjetPlan | null | undefined;
  /** Hauteur de ce sur quoi la structure repose, en millimetres. */
  hauteurAppuiMm: (c: Construction) => number;
  /** Altitude d'un objet du plan, en metres. */
  elevationOf: (o: ObjetMesurable) => number;
  /** Un objet masque ne se modelise pas. */
  objetMasque: (o: ObjetPlan) => boolean;
  /** Position du mat d'un parasol, en coordonnees du plan. */
  positionMat: (par: ObjetPlan) => PtBrut;
  /** Le fond orthophoto sert aussi de sol a la 3D. */
  orthoActif: () => boolean;
  orthoTuiles: () => TuileOrtho[];
  /** Une texture Poly Haven, partagee par URL et repetition (three/chargeurs.ts). */
  chargerTexturePolyhaven: (url: string, repetition?: number) => THREE_NS.Texture;
  /** Demonte la scene precedente avant d'en construire une nouvelle. */
  disposeThreeScene: () => void;
  /** Repose le soleil une fois la scene batie. */
  appliquerLumiereVue3d: () => void;
  applyMode3D: () => void;
  syncControlesSoleilVue3d: () => void;
}

/** Les couches calculees de la terrasse (engine/layers.ts). */
type Couches = ReturnType<typeof computeTerrasseLayers>;

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
 * parcelle se retrouveraient hors champ ou sous un sol trop petit.
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
    etat.objects.forEach((o: ObjetPlan) => { if (o !== obj) pts.push(...sommets(o)); });
  }
  const maxRadius = pts.reduce((m: number, p: PtBrut) => Math.max(m, dist(p, cen)), 0);
  return Math.max(3, maxRadius * 2);
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

/**
 * La scene, sa camera, son rendu et ses lumieres, le sol. `null` si le navigateur refuse le
 * contexte WebGL : sur iOS Safari, passe le plafond de contextes vivants, le constructeur reussit
 * mais rend un contexte deja perdu — sans ce test, la compilation du premier shader plantait sur
 * « Argument 1 ('shader') ... must be an instance of WebGLShader » au lieu d'un message clair.
 */
function monterScene(host: HTMLElement, extent: number, conservee: CameraConservee, terrain: { sol: SolRelief | null; cen: PtBrut; versLocal: VersLocal; bornes: Emprise }) {
  const w = host.clientWidth || 600, h = host.clientHeight || 420;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe7ea);
  // Le plan lointain suit le sol : a 500 m, un voisinage de 200 m etait coupe en reculant la camera.
  const b = terrain.bornes;
  const loin = Math.max(Math.abs(b.xMin - terrain.cen.x), Math.abs(b.xMax - terrain.cen.x), Math.abs(b.yMin - terrain.cen.y), Math.abs(b.yMax - terrain.cen.y));
  const camera = new THREE.PerspectiveCamera(45, w / h, 0.05, Math.max(500, loin * 4));
  // Sur un sol en relief, la camera vise le centre du plan a la hauteur du sol : la terrasse, elle,
  // reste a la hauteur finie au-dessus du zero du plan, et le sol passe dessous ou au-dessus.
  const hCible = terrain.sol ? terrain.sol.hauteur(terrain.cen) : 0;
  camera.position.set(extent * 0.9, extent * 0.9 + hCible, extent * 0.9);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  const glCtx3d = renderer.getContext && renderer.getContext();
  if (!glCtx3d || (glCtx3d.isContextLost && glCtx3d.isContextLost())) {
    showErrBanner('Vue 3D : le navigateur a refuse de creer un contexte 3D (trop d\'onglets/vues 3D ouverts ?). Ferme quelques onglets ou recharge la page, puis reessaie.');
    return null;
  }
  renderer.setSize(w, h);
  renderer.shadowMap.enabled = vue3d.ombres;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, hCible, 0);
  controls.update();
  // Meme terrasse reconstruite (une case a cocher) : la camera reste ou l'utilisateur l'avait laissee.
  if (conservee) {
    camera.position.copy(conservee.pos);
    controls.target.copy(conservee.cible);
    controls.update();
  }
  const { hemiLight, dirLight, dirFill } = poserLumieres(scene, extent);

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
function poserLumieres(scene: THREE_NS.Scene, extent: number) {
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x4a3c2a, 0.5);
  scene.add(hemiLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
  dirLight.position.set(extent, extent * 1.5, extent * 0.6);
  if (vue3d.ombres) {
    // Le cadrage de la shadow map suit l'etendue de LA scene affichee, et la depasse : une ombre de
    // fin de journee s'allonge bien au-dela de l'objet qui la projette. Seule la lumiere principale
    // projette — une deuxieme direction d'ombres ajouterait de la confusion pour peu de gain.
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    const d = extent * 1.8;
    dirLight.shadow.camera.left = -d; dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d; dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = extent * 9;
    dirLight.shadow.bias = -0.0005;
  }
  scene.add(dirLight);
  const dirFill = new THREE.DirectionalLight(0xffffff, 0.3);
  dirFill.position.set(-extent * 0.8, extent * 1.1, -extent * 0.5);
  scene.add(dirFill);
  return { hemiLight, dirLight, dirFill };
}

/**
 * Le contour reel de la terrasse au sol : on y verifie d'un coup d'oeil le sens des lames. Sur un
 * sol en pente, il monte au point haut du sol sous la terrasse (`yHaut`), la ou la structure se pose.
 */
function ajouterContourTerrasse(scene: THREE_NS.Scene, obj: ObjetPlan, versLocal: VersLocal, yHaut = 0): void {
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
function ajouterOrtho(scene: THREE_NS.Scene, versLocal: VersLocal, ctx: ContexteScene3d, sol: SolRelief | null, bornes: Emprise, ground: THREE_NS.Mesh): void {
  if (!ctx.orthoActif() || !ctx.orthoTuiles().length) return;
  if (sol) {
    peindreOrthoSurSol(ctx.orthoTuiles(), bornes, sol.relief, ground.material as THREE_NS.MeshStandardMaterial);
    return;
  }
  const chargeurOrtho = new THREE.TextureLoader();
  ctx.orthoTuiles().forEach((t: TuileOrtho) => {
    // `orthoTuiles()` ne rend que les tuiles dont l'image est arrivee (voir `TuileOrtho`).
    if (!t.dataUri) return;
    // La photo couvre le sol, et pas au-dela : chaque tuile est coupee aux bornes du sol (le calque).
    const cadre = intersectionEmprises({ xMin: t.xMin, xMax: t.xMin + t.largeur, yMin: t.yMin, yMax: t.yMin + t.hauteur }, bornes);
    if (!cadre) return;
    const tex = chargeurOrtho.load(t.dataUri);
    // `SRGBColorSpace` / `colorSpace` n'existent qu'a partir de la r152 ; le CDN sert la r128, donc
    // cette ligne ne fait rien aujourd'hui. Garde-fou tourne vers l'avenir, ecrit ainsi expres : le
    // remplacer par l'ancien couple `sRGBEncoding`/`encoding` changerait le rendu des tuiles.
    const troisFutur = THREE as typeof THREE & { SRGBColorSpace?: unknown };
    if (troisFutur.SRGBColorSpace) (tex as typeof tex & { colorSpace?: unknown }).colorSpace = troisFutur.SRGBColorSpace;
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
function construireStructureTerrasse(obj: ObjetPlan, layers: Couches, c: Construction, primSol: Primitives, ctx: ContexteScene3d, isolee: boolean, cible: CibleStructure): void {
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
  if (estPlots(c)) layers.vis.forEach((p, i) => prim.addPlot(p, hauteurVisM, 0x6E7A84, c.plotSurfaceAssise || PLOT_ASSISE_MIN_CM2, pieds[i] ?? 0));
  else layers.vis.forEach((p, i) => prim.addPost(p, enterreM, hauteurVisM, 0.03, 0x8a96a8, pieds[i] ?? 0));
  layers.solives.forEach(seg => prim.addBeam(seg.a, seg.b, hauteurVisM, soliveH, soliveW, 0x6b4a2a, contour));
  // Le cadre est au niveau des pieces auxquelles il appartient, et suit le contour.
  prim.addBande(layers.bandes.cadre, hauteurVisM, plotSimple ? lambH : soliveH, 0x4a2f18);
  // Le chevetre d'un bassin : des pieces de la section du cadre, autour de l'ouverture (engine/structure.ts).
  layers.chevetres?.forEach(seg => prim.addBeam(seg.a, seg.b, hauteurVisM, plotSimple ? lambH : soliveH, soliveW, 0x4a2f18, contour));
  let lameBase = hauteurVisM + (plotSimple ? 0 : soliveH);
  if (layers.lambourdes.length) {
    layers.lambourdes.forEach(seg => prim.addBeam(seg.a, seg.b, lameBase, lambH, lambW, 0xb45a2a, contour));
    lameBase += lambH;
  }
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

/** Les lames d'une terrasse isolee : assez pour lire le platelage, assez peu pour voir dessous. */
export const OPACITE_LAMES_ISOLEMENT = 0.35;
/** Les lames quand « Platelage translucide » est coche : presque transparentes (le plancher d'appliquerOpacite), leur dessin se devine. */
export const OPACITE_LAMES_TRANSLUCIDES = 0.15;

/**
 * Ce que chaque objet du plan rendu en contexte recoit. `sol` : le sol en relief dessine, ou `null`
 * (plat) ; `solMoteur` : le meme relief tel que le moteur le lit (engine/sol.ts), pour les hauteurs
 * d'appui, de poteau et de bord de bassin — `null` quand le sol dessine est plat. `objets` : le plan,
 * pour les calculs qui lisent d'autres objets (la plage d'une piscine, son relief).
 */
interface ContexteObjets {
  prim: Primitives; scene: THREE_NS.Scene; versLocal: VersLocal; ctx: ContexteScene3d; sol: SolRelief | null; solMoteur: Sol | null; objets: ObjetPlan[];
  /** Le centre de la scene : les details d'un batiment s'allegent avec la distance. */
  centre: PtBrut;
  /** L'apparence du voisinage (model/voisinage3d.ts), lue sur la parcelle du projet. */
  voisinage3d: ReglagesVoisinage3d;
}

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
function primitivesDans(cible: THREE_NS.Object3D, co: ContexteObjets): Primitives {
  return cible === co.scene ? co.prim : creerPrimitives({ scene: cible, versLocal: co.versLocal, chargerTexture: co.ctx.chargerTexturePolyhaven });
}

/** Le centre d'un objet du plan, pour lire le sol sous lui. */
function centreDe(o: ObjetPlan): PtBrut {
  return o.type === 'circle' ? o.center : aDesSommets(o) && o.pts.length ? centroid(o.pts) : { x: 0, y: 0 };
}

// « Objets opaques » ignore l'opacite du plan 2D, souvent < 1 pour voir a travers en mode Plan.
const opaciteDe = (o: ObjetPlan) => vue3d.objetsOpaques ? undefined : o.fillOpacity;
// « Texture » decoche revient a la couleur unie sans retirer la texture de chaque objet.
const texturesDe = (o: ObjetPlan) => vue3d.textures ? { horizontale: o.textureHorizontale, vertical: o.textureVerticale } : null;

/**
 * Un chemin a sa largeur reelle (le meme champ que le trait du plan 2D), pas son seul axe, et suit
 * le reglage « Point / Courbe » comme en 2D.
 */
function ajouterChemin(o: ObjetPlan, { prim, ctx, sol, scene, versLocal }: ContexteObjets): void {
  if (!aDesSommets(o) || o.pts.length < 2) return;
  const trace = courbePolyligne(o.pts, !!o.curve);
  const poly = ribbonChemin(trace, o.width || 1);
  const h = ctx.elevationOf(o);
  const couleur = o.fill || o.stroke || '#888888';
  if (poly && h > 0) {
    const pose = poseSurSol(sol, poly, centroid(poly), h);
    prim.addPrism(poly, pose.yBase, pose.hauteur, couleur, false, opaciteDe(o), texturesDe(o));
  }
  else if (poly) prim.addRibbonFlat(poly, couleur, 0.006, opaciteDe(o), vue3d.textures ? o.textureHorizontale : null, COUCHES_SOL.chemin, sol ? sol.hauteur : undefined);
  else if (sol) scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(traitSurSol(trace, sol, versLocal, 0.008, false)), new THREE.LineBasicMaterial({ color: o.stroke || couleur })));
  else prim.addGroundOutline(trace, o.stroke || couleur, false);
}

/**
 * Un parasol n'est pas un volume plein : un mat fin porte une toile a sa hauteur. L'extruder en
 * ferait un cylindre opaque de 3 m au milieu de la terrasse — exactement ce qu'on ne veut pas voir
 * quand on juge son implantation. Le mat se dresse a SA position (le bord de toile pour un
 * deporte) ; la toile reste centree.
 */
function ajouterParasol(par: ObjetCercle, co: ContexteObjets): void {
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
  if (par.matDeporte) {
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
 * Un arbre (three/arbre3d.ts) : son tronc a la hauteur de l'objet, son houppier par-dessus, pose sur
 * le sol en son centre. Le feuillage d'un caduc suit la date de l'etude d'ensoleillement.
 */
function ajouterArbreDuPlan(o: ObjetPlan, co: ContexteObjets): void {
  const h = co.ctx.elevationOf(o);
  if (h <= 0) return;
  const centre = centreDe(o);
  const cible = groupeAuSol(co.scene, co.sol, centre);
  ajouterArbre3d(
    { scene: cible, toLocal: co.versLocal, textures: vue3d.textures, chargerTexture: co.ctx.chargerTexturePolyhaven, dateStr: soleilVue3d.dateStr, opacite: opaciteDe(o) },
    o, h, o.type === 'circle' ? o.r : 0.3
  );
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
 * Le reste du plan, en contexte : chaque objet devient un bloc simple a sa hauteur — ni toit ni
 * ouvertures, de quoi juger l'implantation. Une AUTRE terrasse recoit sa hauteur, pas sa structure.
 * La parcelle n'a pas de volume : un ruban au sol suffit a la situer.
 */
function ajouterObjetsDuPlan(obj: ObjetPlan | null, etat: PlanVuDeLa3d, co: ContexteObjets): void {
  const { prim, ctx } = co;
  etat.objects.forEach(o => {
    if (o === obj) return;
    if (ctx.objetMasque(o)) return; // masque dans le plan = masque partout, voisinage compris
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
    const apparence = o.voisinage && o.type === 'polygon' && estBatiment(o) ? apparenceVoisin(co.voisinage3d, o.key) : null;
    const couleurMur = apparence?.couleurMur ?? o.fill ?? BLANC_PAR_DEFAUT;
    // Un batiment de la parcelle du projet en plusieurs corps (model/volumesToit.ts) : un prisme par
    // corps, a son egout ; un batiment dont un mur a ete releve en L se coupe en deux volumes, chacun
    // a sa hauteur (facade/profil.ts) ; tout autre objet reste un seul prisme.
    const toitRecompose = o.type === 'polygon' && estBatiment(o) && !o.facades?.some((r) => r.partieBasse);
    // Les corps et pignons reconstruits sur le LiDAR (facade/toitCorps.ts) : un prisme par corps a son
    // egout le plus bas, ses murs hauts et son toit poses par three/toitCorps3d.ts.
    const modeToit = toitRecompose ? modeToitActif(o) : 'simple';
    const corpsToit = modeToit === 'corps' ? o.corpsToit ?? null : null;
    const volumesToit = modeToit === 'volumes' ? volumesActifs(o) : null;
    // Le toit mesure au LiDAR (model/toitMesure.ts) : un seul prisme, le contour lui-meme, a l'egout
    // le plus bas ; les rehausses montent ses murs jusqu'a la surface. Des prismes par rectangle
    // laissaient la surface pendre dans le vide la ou un rectangle ne couvrait pas le contour.
    const toitMesure = modeToit === 'mesure' ? o.toitMesure ?? null : null;
    const egoutDe = (v: VolumeToit): number => v.egout ?? h;
    const volumes = corpsToit
      ? corpsToit.map((c) => ({ pts: c.pts, hauteur: Math.min(...c.egouts), hauteursMurs: hauteursMursCorps(c) }))
      : toitMesure
      ? [{ pts: footprint, hauteur: toitMesure.egout, hauteursMurs: footprint.map((_, i) => Math.max(toitMesure.egout, hauteurMurMesuree(toitMesure, footprint, i) ?? toitMesure.egout)) }]
      : volumesToit
      ? volumesToit.map((v) => ({ pts: v.pts, hauteur: egoutDe(v) }))
      : o.type === 'polygon' && o.facades?.some((r) => r.partieBasse) ? volumesDuBatiment(o.pts, h, o.facades) : [{ pts: footprint, hauteur: h }];
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
    if (o.type === 'polygon' && (o.facades?.length || o.toit || volumesToit)) {
      ajouterReleve3d({ scene: groupeAuSol(co.scene, co.sol, centre), toLocal: co.versLocal, couleurMur, textures: vue3d.textures }, o, h, volumesToit, !!toitMesure || !!corpsToit);
    }
    if (o.type === 'polygon' && corpsToit) {
      ajouterToitCorps3d({ scene: groupeAuSol(co.scene, co.sol, centre), toLocal: co.versLocal, couleurMur, textures: vue3d.textures }, corpsToit, o.toit, o.pts);
    }
    // La surface mesuree au LiDAR remplace les formes simples (three/toitMesure3d.ts), posee a l'egout de chaque corps.
    if (o.type === 'polygon' && toitMesure) {
      ajouterToitMesure3d({ scene: groupeAuSol(co.scene, co.sol, centre), toLocal: co.versLocal, couleurMur, textures: vue3d.textures }, o.pts, toitMesure, o.toit, [], toitMesure.egout);
    }
    // Un batiment recoit ses details (three/detailsBatiment.ts) : debord et gouttiere, aretes,
    // soubassement, fenetres par niveau, cheminee — moins de loin.
    if (o.type === 'polygon' && estBatiment(o)) {
      const etages = (o.bdtopo as { nombreEtages?: unknown } | null | undefined)?.nombreEtages;
      // Les fenetres : celles que le voisinage tire pour une maison voisine ; pour un batiment du
      // projet, la dimension commune ou la liste reglee une par une (model/fenetres3d.ts).
      const f3d = fenetres3dDe(o);
      const fenetres = apparence ? apparence.fenetres : { largeur: f3d.largeur, hauteur: f3d.hauteur, appui: f3d.appui, entraxe: f3d.entraxe, ...(f3d.couleur ? { couleur: f3d.couleur } : {}) };
      ajouterDetailsBatiment(
        { scene: groupeAuSol(co.scene, co.sol, centre), toLocal: co.versLocal, couleurMur, textures: vue3d.textures, distance: dist(centre, co.centre),
          // Le groupe est pose sur le sol au centre : le soubassement et les angles descendent jusqu'au sol sous chaque mur.
          ...(co.sol ? { sol: (p: PtBrut) => (co.sol as SolRelief).hauteur(p) - ySol, base: yBase - ySol } : {}) },
        o, h, { etages: typeof etages === 'number' ? etages : null, cotesReleves: (o.facades ?? []).map((r) => r.cote), fenetres,
          ...(!apparence && f3d.mode === 'uneParUne' && f3d.liste ? { ouvertures: f3d.liste } : {}),
          // En surface mesuree, chaque mur a sa hauteur (la ou la couverture le rejoint) : les fenetres montent avec lui.
          ...(volumesToit ? { volumes: volumesToit.map((v) => ({ pts: v.pts, hauteur: egoutDe(v), toit: toitDuVolume(v, o.toit) })) } : {}),
          // Corps ou surface mesuree : chaque mur a sa hauteur, les fenetres montent avec lui.
          ...((corpsToit || toitMesure) && o.toit ? { volumes: volumes.map((v) => ({ ...v, toit: o.toit as Toit })) } : {}),
          ...(toitMesure || corpsToit ? { sansToit: true } : {}),
          // Les fenetres sur les murs des corps, a leur hauteur, et dans leurs pignons (facade/ouvertures.ts).
          ...(corpsToit && !apparence && f3d.mode !== 'uneParUne' ? { corps: corpsToit } : {}) }
      );
    }
  });
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
function ajouterPiscinesSeules(etat: PlanVuDeLa3d, co: ContexteObjets): void {
  etat.objects.forEach(o => { if (estPiscine(o) && !co.ctx.objetMasque(o)) ajouterPiscineAuSol(o, co); });
}

/**
 * La cloture perimetrale, independante de « tous les objets » (elle borne la parcelle) : cote par
 * cote, avec ses acces (three/cloture3d.ts, MD/spec-cloture.md). Sur un sol en relief, chaque
 * panneau se pose sur le sol sous lui.
 */
function ajouterCloture(prim: Primitives, scene: THREE_NS.Scene, versLocal: VersLocal, ctx: ContexteScene3d, sol: SolRelief | null): void {
  ajouterCloture3d({ scene, toLocal: versLocal, prim, textures: vue3d.textures, chargerTexture: ctx.chargerTexturePolyhaven, sol: sol ? sol.hauteur : undefined }, ctx.trouverParcelleCloture());
}

/**
 * Les ombres, en un seul parcours de la scene complete plutot qu'a travers chaque brique : cela ne
 * peut pas en oublier une. Le sol recoit mais ne projette pas (auto-ombrage aux angles rasants).
 */
function appliquerOmbres(scene: THREE_NS.Scene, ground: THREE_NS.Mesh): void {
  if (!vue3d.ombres) return;
  // Le gabarit d'un bassin et son eau translucide ne portent pas d'ombre (three/piscine3d.ts).
  scene.traverse(o => { if (estMesh(o)) { o.castShadow = !o.userData[SANS_OMBRE]; o.receiveShadow = true; } });
  ground.castShadow = false;
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
  // decoche — la scene est alors exactement celle d'avant (three/relief3d.ts).
  const sol = solDeLaScene(ctx.trouverParcelleCloture()?.relief);
  // Le meme relief, lu par le moteur (engine/sol.ts) : la structure de la terrasse, les poteaux
  // d'une pergola, le bord d'un bassin suivent le sol en pente (MD/spec-relief.md §6). Sol dessine
  // plat (pas de relief, ou « Sol en relief » decoche) : rien ne bouge, la structure est celle d'avant.
  const solMoteur = sol ? solDuProjet(etat.objects) : null;
  const bornes = bornesDuSol(etat, ctx, cen, extent);
  const base = monterScene(host, extent, conservee, { sol, cen, versLocal, bornes });
  if(!base) return;
  vue3d.dernierObjKey = cleVue;
  vue3d.centre = cen;
  const { scene, camera, renderer, controls, ground } = base;
  const prim = creerPrimitives({ scene, versLocal, chargerTexture: ctx.chargerTexturePolyhaven });

  if(obj) ajouterContourTerrasse(scene, obj, versLocal, zReferenceOuvrage(solMoteur, enPoints(obj).pts));
  ajouterOrtho(scene, versLocal, ctx, sol, bornes, base.ground);
  const voisinage3d = voisinage3dDe(ctx.trouverParcelleCloture());
  const co: ContexteObjets = { prim, scene, versLocal, ctx, sol, solMoteur, objets: etat.objects, centre: cen, voisinage3d };
  if(vue3d.tousLesObjets || !obj) ajouterObjetsDuPlan(obj, etat, co);
  // Une piscine fait partie du projet de terrasse (elle la perce, sa plage la prolonge) : elle se
  // voit meme quand les autres objets du plan sont caches. Isolee, la terrasse reste seule.
  // Les masques d'affichage s'appliquent : un objet isole ne laisse que lui et ses associes.
  else ajouterPiscinesSeules(etat, co);
  // La cloture est celle de la parcelle : masquee avec elle quand un objet est isole.
  if (!etat.isolement) ajouterCloture(prim, scene, versLocal, ctx, sol);
  // Les clotures du voisinage : un reglage de la parcelle du projet, avec le reste du plan.
  if (voisinage3d.cloture.afficher && !etat.isolement && (vue3d.tousLesObjets || !obj)) {
    ajouterClotureVoisinage(scene, versLocal, limitesDuVoisinage(etat.objects, ctx.objetMasque), sol ? sol.hauteur : undefined, voisinage3d.cloture);
  }
  // Le nom des rues, au sol, avec le reste du plan (three/rues3d.ts).
  const rues = ctx.trouverParcelleCloture()?.ruesVoisinage?.rues;
  if (voisinage3d.rues.afficher && rues?.length && !etat.isolement && (vue3d.tousLesObjets || !obj)) {
    ajouterNomsDesRues3d(scene, versLocal, rues, {
      hauteurSol: sol ? sol.hauteur : undefined,
      // Les rues sont decoupees au sol dessine : un nom hors du sol flotterait dans le vide.
      cadre: bornes,
    });
  }
  appliquerOmbres(scene, ground);

  const sc: SceneVue3d = {
    renderer, scene, camera, controls, raf: null,
    dirLight: base.dirLight, dirFill: base.dirFill, hemiLight: base.hemiLight, extent, cen
  };
  vue3d.scene = sc;
  // Les feuilles des arbres ne paraissent que de pres (three/feuilles.ts) : la distance se relit a chaque image.
  const animate = () => { sc.raf = requestAnimationFrame(animate); controls.update(); actualiserFeuillesProches(scene, camera); renderer.render(scene, camera); };
  animate();
  ctx.applyMode3D();
  // Le panneau relit tout, y compris la liste des points de vue.
  ctx.syncControlesSoleilVue3d();
  ctx.appliquerLumiereVue3d();   // pose les lumieres ET rend une premiere image

  // La structure se construit apres cette premiere image. setTimeout et non requestAnimationFrame :
  // rAF ne se declenche pas quand l'onglet est en arriere-plan, et la terrasse ne serait jamais posee.
  setTimeout(()=>{
    // La scene a pu etre remplacee entre-temps : construire dans une scene morte laisserait des
    // meshes orphelins et un canevas noir.
    if(vue3d.scene !== sc) return;
    if(obj && layers) construireStructureTerrasse(obj, layers, c, prim, ctx, etat.isolement === obj.key, { scene, versLocal, sol: solMoteur });
    appliquerOmbres(scene, ground);   // les pieces qui viennent d'arriver projettent aussi
    renderer.render(scene, camera);
  }, 0);
}
