// Le photomontage dans la Vue 3D (demande du proprietaire, 20 novembre 2026) : la photo du jardin derriere la scene, qui ne dessine
// plus que ce que le projet ajoute, vue par une camera posee comme l'appareil qui a pris la photo (core/photomontage.ts).
//
// Rien n'est rebati : le mode masque ce que la photo montre deja (terrain, gazon, ciel, voisinage, arbres), remplace le materiau du
// sol par un materiau qui ne recoit que l'ombre, et pose la photo en fond de l'image. La sortie remet chaque chose ou elle etait :
// ce module tient lui-meme ce qu'il a masque ou remplace, et ne rend que cela.
//
// Les batiments de la parcelle ne se dessinent pas, mais ils cachent : leurs mailles n'ecrivent que la profondeur, et ce que le
// projet a derriere un mur de la maison ne passe pas devant elle sur la photo (verifie contre un rendu complet de la Vue 3D : sans
// cela, une terrasse a l'angle de la maison debordait sur sa facade). « Montrer la maison en transparence » les teinte, pour caler.
//
// La photo est un quadrilatere plein ecran DANS la scene, et non une image derriere un canevas transparent : le rendu de la Vue 3D
// n'a pas de couche alpha (le ciel y ecrit une opacite de travail, three/rendu.ts), et l'image exportee est ainsi exactement celle
// qu'on voit, rendue une fois a la taille de la photo. Le quadrilatere echappe a la courbe de film (`toneMapped: false`) : les
// pixels de la photo sortent tels qu'ils sont entres. En Soignee, la scene se rend sans la passe d'occlusion, qui appliquerait la
// courbe a la photo.

import { vue3d, rendre3d, reglerVue3d, type SceneVue3d } from './etat3d.js';
import { poserFiltre3d, sceneRetenue } from './sceneVivante.js';
import { rafraichirArbres } from './sceneObjets.js';
import { estLumiere, estMesh } from './gardes.js';
import { COUCHES_SOL, HORS_EXPORT, SANS_OMBRE, poserEnCouche } from './primitives.js';
import { regardDe, type PosePhoto, type Taille } from '../core/photomontage.js';
import type * as THREE_NS from 'three';

/** Ce qu'un objet du plan est pour le photomontage : ce que le projet ajoute, un batiment de la parcelle (il cache, et aide a caler), ou le reste. */
export type Role3d = 'projet' | 'bati' | 'autre';

/** Ce que le mode montre, regle par l'ecran (app/photomontage/session.ts). */
export interface ReglagesPhotomontage3d {
  /** La photo ramenee, telle qu'elle sera exportee. */
  image: HTMLCanvasElement;
  classer: (cle: string) => Role3d;
  pose: PosePhoto;
  /** L'opacite de la scene sur la photo, de 0 a 1 : pour comparer l'une a l'autre. */
  opacite: number;
  /** Les batiments teintes en transparence, le temps du calage ; sinon ils cachent sans se dessiner. */
  maison: boolean;
}

/** L'ombre portee du projet sur le sol de la photo : assez pour l'asseoir, sans noircir l'herbe. */
const OPACITE_OMBRE = 0.38;
/** Les batiments en transparence : l'orange de la surbrillance, qu'aucun mur ni aucune herbe ne portent. */
const COULEUR_FANTOME = 0xff7a1a;
const OPACITE_FANTOME = 0.3;
/** Les batiments se rendent avant le projet (et apres la photo) : leur profondeur est ecrite quand il se dessine. */
const ORDRE_BATI = -1000;

const SOMMETS_PHOTO = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 1.0, 1.0 ); }';
const FRAGMENTS_PHOTO = 'uniform sampler2D carte; uniform float opacite; varying vec2 vUv; void main() { gl_FragColor = vec4( texture2D( carte, vUv ).rgb, opacite ); }';

interface Vue { x: number; y: number; z: number }
/** La camera d'avant le mode : la sortie la remet, meme si la scene a ete rebatie entre-temps. */
let avant: { position: Vue; cible: Vue; champ: number; focaleBloquee: boolean } | null = null;
let reglages: ReglagesPhotomontage3d | null = null;

/** Ce que le mode a pose et change dans UNE scene : une scene rebatie repart d'un etat neuf. */
interface Lien {
  sc: SceneVue3d;
  texture: THREE_NS.Texture;
  fond: THREE_NS.Mesh;
  voile: THREE_NS.Mesh;
  /** Ce que le mode a masque lui-meme : seuls ceux-la reviennent a la sortie. */
  masques: Set<THREE_NS.Object3D>;
  /** Les mailles des batiments, qui cachent sans se dessiner (ou se teintent), avec ce qu'elles portaient. */
  batis: Map<THREE_NS.Mesh, { racine: THREE_NS.Object3D; materiau: THREE_NS.Mesh['material']; sansOmbre: unknown; ombre: boolean; ordre: number }>;
  /** Le materiau qui n'ecrit que la profondeur, et celui qui teinte en plus. */
  cache: THREE_NS.Material;
  fantome: THREE_NS.Material;
  sol: { maille: THREE_NS.Mesh; materiau: THREE_NS.Mesh['material']; ombre: THREE_NS.Material };
  /** Le rendu direct pose a la place de celui de l'occlusion, et celui qu'il remplace. */
  direct: () => void;
  rendre: (() => void) | undefined;
  controles: boolean;
}
let lien: Lien | null = null;

function quadPhoto(texture: THREE_NS.Texture, devant: boolean): THREE_NS.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: { carte: { value: texture }, opacite: { value: 1 } },
    vertexShader: SOMMETS_PHOTO, fragmentShader: FRAGMENTS_PHOTO,
    depthTest: false, depthWrite: false, fog: false, toneMapped: false, transparent: devant,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  m.name = devant ? 'photomontage-voile' : 'photomontage-fond';
  m.frustumCulled = false;
  // Le fond avant tout, le voile apres tout : ni l'un ni l'autre ne lit la profondeur.
  m.renderOrder = devant ? 2000 : -2000;
  m.userData[HORS_EXPORT] = true;
  m.userData[SANS_OMBRE] = true;
  m.castShadow = false;
  m.raycast = () => {};
  return m;
}

/** Lie le mode a la scene retenue : la photo, le voile, le materiau d'ombre du sol, le rendu direct. */
function lier(d: NonNullable<ReturnType<typeof sceneRetenue>>, r: ReglagesPhotomontage3d): Lien {
  const texture = new THREE.CanvasTexture(r.image);
  // Les pixels de la photo tels quels : ni conversion de couleur (voir three/bibliotheque.ts), ni mipmaps.
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  const fond = quadPhoto(texture, false), voile = quadPhoto(texture, true);
  d.sc.scene.add(fond, voile);
  const ombre = new THREE.ShadowMaterial({ opacity: OPACITE_OMBRE });
  // Le sol reste la couche la plus basse (three/scene.ts) : une dalle posee dessus ne scintille pas contre son ombre.
  poserEnCouche(ombre, COUCHES_SOL.fond);
  const cache = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  // La teinte se melange a la photo SANS etre « transparente » pour three : rangee avec les opaques, elle se rend avant le projet
  // et ecrit sa profondeur, comme le cache. Le projet derriere la maison reste donc cache, teinte ou non.
  const fantome = new THREE.MeshBasicMaterial({
    color: COULEUR_FANTOME, toneMapped: false, side: THREE.DoubleSide,
    // Un materiau opaque ecrit une opacite de 1 : le melange prend la sienne d'une constante.
    blending: THREE.CustomBlending, blendSrc: THREE.ConstantAlphaFactor, blendDst: THREE.OneMinusConstantAlphaFactor, blendAlpha: OPACITE_FANTOME,
  });
  const sc = d.sc;
  const l: Lien = {
    sc, texture, fond, voile, masques: new Set(), batis: new Map(), cache, fantome,
    sol: { maille: d.ground, materiau: d.ground.material, ombre },
    direct: () => { sc.renderer.render(sc.scene, sc.camera); },
    rendre: undefined, controles: sc.controls.enabled,
  };
  d.ground.material = ombre;
  sc.controls.enabled = false;
  return l;
}

/** Libere ce que le mode a cree pour une scene. */
function liberer(l: Lien): void {
  l.texture.dispose();
  for (const m of [l.fond, l.voile]) { m.geometry.dispose(); (m.material as THREE_NS.Material).dispose(); }
  l.sol.ombre.dispose();
  l.fantome.dispose();
  l.cache.dispose();
}

/** Rend son materiau, son rang et ses ombres a une maille de batiment. */
function rendreMaille(l: Lien, m: THREE_NS.Mesh): void {
  const f = l.batis.get(m);
  if (!f) return;
  m.material = f.materiau;
  m.renderOrder = f.ordre;
  if (f.sansOmbre === undefined) delete m.userData[SANS_OMBRE]; else m.userData[SANS_OMBRE] = f.sansOmbre;
  m.castShadow = f.ombre;
  l.batis.delete(m);
}

/** Pose la camera comme l'appareil photo : elle tourne sur elle-meme, la cible un metre devant l'objectif. */
function poserCamera(l: Lien, p: PosePhoto): void {
  const { camera, controls, cen } = l.sc;
  const sol = l.sc.hauteurSol ? l.sc.hauteurSol({ x: p.x, y: p.y }) : 0;
  camera.position.set(p.x - cen.x, (Number.isFinite(sol) ? sol : 0) + p.hauteurM, cen.y - p.y);
  const r = regardDe(p);
  // Le nord du plan est -Z dans la scene (three/primitives.ts).
  controls.target.set(camera.position.x + r.est, camera.position.y + r.haut, camera.position.z - r.nord);
  camera.fov = p.champDeg;
  camera.updateProjectionMatrix();
  controls.update();
}

/**
 * Applique le mode a la scene retenue : ce que le projet ajoute reste, les batiments de la parcelle cachent sans se dessiner (ou se
 * teintent si on le demande), tout le reste est masque. Rejoue a chaque pose de la scene (three/sceneVivante.ts, `poserFiltre3d`) :
 * sans effet quand rien n'a change.
 */
function appliquer(): void {
  const r = reglages, d = sceneRetenue();
  if (!r || !d) return;
  if (lien && lien.sc !== d.sc) { liberer(lien); lien = null; }
  const neuf = !lien;
  // La premiere scene liee donne la camera d'avant le mode ; une scene rebatie ensuite garde celle-la.
  if (!avant) {
    const p = d.sc.camera.position, c = d.sc.controls.target;
    avant = { position: { x: p.x, y: p.y, z: p.z }, cible: { x: c.x, y: c.y, z: c.z }, champ: d.sc.camera.fov, focaleBloquee: vue3d.focaleBloquee };
    // La focale ne suit plus la hauteur de la camera (three/presentation.ts) : c'est celle de la photo.
    reglerVue3d({ focaleBloquee: true });
  }
  const l = (lien ??= lier(d, r));
  // L'occlusion (Soignee) arrive apres la scene et pose son rendu : le rendu direct reprend la main, et retient ce qu'il remplace.
  if (l.sc.rendre !== l.direct) { l.rendre = l.sc.rendre; l.sc.rendre = l.direct; }
  const garder = new Set<THREE_NS.Object3D>([l.fond, l.voile]);
  // Sans ombres (case « Ombres » decochee), le sol n'a rien a montrer.
  if (vue3d.ombres) garder.add(l.sol.maille);
  const batis = new Set<THREE_NS.Object3D>();
  for (const [cle, racines] of d.parObjet) {
    const role = r.classer(cle);
    if (role === 'projet') racines.forEach((x) => garder.add(x));
    else if (role === 'bati') racines.forEach((x) => { garder.add(x); batis.add(x); });
  }
  let change = neuf;
  for (const x of l.sc.scene.children) {
    if (estLumiere(x)) continue;
    if (garder.has(x) || d.duProjet(x)) {
      if (l.masques.delete(x)) { x.visible = true; change = true; }
    } else if (x.visible) { x.visible = false; l.masques.add(x); change = true; }
  }
  // Les batiments de la parcelle : leurs mailles cachent le projet qu'elles ont derriere elles, teintees ou non, et ne portent pas
  // d'ombre (la leur est deja sur la photo, le sol la recevrait une seconde fois). Leurs traits et leurs etiquettes sont masques.
  for (const [m, f] of [...l.batis]) if (!batis.has(f.racine)) { rendreMaille(l, m); change = true; }
  const voulu = r.maison ? l.fantome : l.cache;
  for (const racine of batis) racine.traverse((m) => {
    if (!estMesh(m)) {
      const trace = m as THREE_NS.Object3D & { isLine?: boolean; isPoints?: boolean; isSprite?: boolean };
      if ((trace.isLine || trace.isPoints || trace.isSprite) && m.visible) { m.visible = false; l.masques.add(m); change = true; }
      return;
    }
    if (!l.batis.has(m)) {
      l.batis.set(m, { racine, materiau: m.material, sansOmbre: m.userData[SANS_OMBRE], ombre: m.castShadow, ordre: m.renderOrder });
      m.userData[SANS_OMBRE] = true;
      m.castShadow = false;
      m.renderOrder = ORDRE_BATI;
      change = true;
    }
    if (m.material !== voulu) { m.material = voulu; change = true; }
  });
  const voile = (l.voile.material as THREE_NS.ShaderMaterial).uniforms as unknown as { opacite: { value: number } };
  voile.opacite.value = 1 - r.opacite;
  l.voile.visible = r.opacite < 1;
  poserCamera(l, r.pose);
  // Un arbre masque quitte son lot, un arbre remontre y rentre (decision « Arbres », CLAUDE.md) ; le rendu suit.
  if (change) rafraichirArbres(l.sc.scene, l.sol.maille);
  rendre3d(l.sc);
}

/**
 * Entre dans le photomontage, ou en change les reglages. Faux sans scene : le mode s'appliquera a la prochaine scene batie. La
 * premiere scene liee retient la camera de la Vue 3D, que la sortie remettra.
 */
export function reglerPhotomontage3d(r: ReglagesPhotomontage3d): boolean {
  // Une autre photo : la texture se refait avec la scene liee.
  if (lien && reglages && reglages.image !== r.image) {
    lien.texture.dispose();
    lien.texture = new THREE.CanvasTexture(r.image);
    lien.texture.colorSpace = THREE.NoColorSpace;
    lien.texture.generateMipmaps = false;
    lien.texture.minFilter = THREE.LinearFilter;
    for (const m of [lien.fond, lien.voile]) ((m.material as THREE_NS.ShaderMaterial).uniforms as unknown as { carte: { value: THREE_NS.Texture } }).carte.value = lien.texture;
  }
  reglages = r;
  poserFiltre3d(appliquer);
  appliquer();
  return !!lien;
}

/**
 * Sort du photomontage : la scene retrouve ce qu'elle montrait, son sol, son rendu, ses gestes et sa camera. La taille du rendu
 * suit son hote (three/navigation.ts) des que l'ecran lui a rendu la sienne.
 */
export function quitterPhotomontage3d(): void {
  const l = lien, a = avant;
  reglages = null;
  lien = null;
  avant = null;
  poserFiltre3d(null);
  if (a) reglerVue3d({ focaleBloquee: a.focaleBloquee });
  if (!l) return;
  const vivante = vue3d.scene === l.sc;
  if (vivante) {
    for (const m of [...l.batis.keys()]) rendreMaille(l, m);
    for (const x of l.masques) x.visible = true;
    l.sc.scene.remove(l.fond, l.voile);
    l.sol.maille.material = l.sol.materiau;
    if (l.sc.rendre === l.direct) { if (l.rendre) l.sc.rendre = l.rendre; else delete l.sc.rendre; }
    l.sc.controls.enabled = l.controles;
    if (a) {
      l.sc.camera.position.set(a.position.x, a.position.y, a.position.z);
      l.sc.controls.target.set(a.cible.x, a.cible.y, a.cible.z);
      l.sc.camera.fov = a.champ;
      l.sc.camera.updateProjectionMatrix();
      l.sc.controls.update();
    }
    rafraichirArbres(l.sc.scene, l.sol.maille);
    rendre3d(l.sc);
  }
  liberer(l);
}

/**
 * L'image du photomontage a la taille de la photo ramenee (pas celle de l'ecran) : la scene se rend une fois a cette taille, sans le
 * voile de comparaison, et sans les batiments en transparence sauf si `avecMaison` le demande ; puis le canevas revient a sa taille.
 * `null` hors du mode, ou si le navigateur ne rend pas l'image.
 */
export function capturerPhotomontage3d(taille: Taille, type: 'image/png' | 'image/jpeg', avecMaison: boolean): Promise<Blob | null> {
  const l = lien, r = reglages;
  if (!l || !r || vue3d.scene !== l.sc) return Promise.resolve(null);
  const rendu = l.sc.renderer, camera = l.sc.camera;
  const rapport = rendu.getPixelRatio(), avantTaille = rendu.getSize(new THREE.Vector2()), aspect = camera.aspect;
  const regler = (k: number, w: number, h: number, a: number) => {
    rendu.setPixelRatio(k);
    // Le style du canevas ne bouge pas : seule sa memoire change de taille, le temps d'une image.
    rendu.setSize(w, h, false);
    camera.aspect = a;
    camera.updateProjectionMatrix();
  };
  return new Promise((fin) => {
    const remettre = () => {
      reglages = r;
      regler(rapport, avantTaille.x, avantTaille.y, aspect);
      appliquer();
    };
    try {
      reglages = { ...r, opacite: 1, maison: r.maison && avecMaison };
      regler(1, taille.l, taille.h, taille.l / taille.h);
      appliquer();
      // `toBlob` copie l'image a l'appel : le canevas peut revenir aussitot a sa taille.
      rendu.domElement.toBlob((b) => fin(b), type, 0.92);
      remettre();
    } catch {
      remettre();
      fin(null);
    }
  });
}
