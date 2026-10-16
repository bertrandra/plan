// Le rendu photographique de la Vue 3D (MD/roadmap-realisme-3d.md, R1) : la courbe de film, le
// ciel, la brume, l'eclairage par le ciel et l'occlusion ambiante.
//
// **Rien de ceci n'entre dans un export.** Les couleurs des materiaux ne sont pas touchees : la
// courbe de film agit au moment du rendu (`CustomToneMapping`), le ciel est marque `HORS_EXPORT`, la
// brume et l'environnement sont des reglages de la scene que l'exporteur glTF ignore. Le .glb, le
// dossier et les empreintes golden restent ceux d'avant.
//
// Pourquoi une courbe « sur mesure » plutot que le couple sRGB + ACES de three.js : celui-ci veut des
// couleurs de materiaux lineaires, alors que celles du plan sont des valeurs d'ecran (#c8b89a), et
// que le .glb les exporte telles quelles. Les convertir aurait change l'export, ou demande de les
// reconvertir le temps de chaque export. La courbe les prend comme elles sont : elle repasse en
// lineaire, applique ACES (les blancs ne brulent plus, les ombres gardent du detail), et revient
// en valeurs d'ecran.

import type * as THREE_NS from 'three';
import { chargerExemple } from './bibliotheque.js';
import { HORS_EXPORT } from './primitives.js';
import type { ParametresQualite } from './qualite.js';
import { rendre3d, type SceneVue3d } from './etat3d.js';

/** L'exposition de la courbe de film : reglee a l'oeil sur le banc d'AE 101 (scripts/banc-visuel.mjs). */
export const EXPOSITION = 1.15;

const COURBE_FILM = `
vec3 CustomToneMapping( vec3 color ) {
  // Les couleurs du plan sont des valeurs d'ecran : lineaire, ACES, puis retour a l'ecran.
  vec3 lineaire = pow( max( color, vec3( 0.0 ) ), vec3( 2.2 ) );
  return pow( ACESFilmicToneMapping( lineaire ), vec3( 1.0 / 2.2 ) );
}`;

let courbeInstallee = false;

/**
 * Remplace, une fois, la courbe « sur mesure » de three.js par la courbe de film. Elle ne sert qu'aux
 * rendus qui la demandent (`toneMapping = CustomToneMapping`) : la visionneuse GLB n'en change pas.
 */
export function installerCourbeDeFilm(): void {
  if (courbeInstallee) return;
  const morceaux = THREE.ShaderChunk as unknown as Record<string, string>;
  const pars = morceaux.tonemapping_pars_fragment ?? '';
  morceaux.tonemapping_pars_fragment = pars.replace(/vec3 CustomToneMapping\( vec3 color \) \{[^}]*\}/, COURBE_FILM.trim());
  courbeInstallee = true;
}

/** Pose la courbe de film sur le rendu de la Vue 3D. */
export function reglerRendu(renderer: THREE_NS.WebGLRenderer): void {
  installerCourbeDeFilm();
  // Sortie lineaire : la courbe de film rend elle-meme des valeurs d'ecran (voir bibliotheque.ts).
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.CustomToneMapping;
  renderer.toneMappingExposure = EXPOSITION;
}

// ---- Le ciel -----------------------------------------------------------------------------------

/** Les couleurs du ciel a une hauteur de soleil, en valeurs d'ecran. */
export interface CouleursCiel {
  zenith: number;
  horizon: number;
  /** La lueur autour du soleil. */
  lueur: number;
  /** Combien la lueur compte, de 0 (nuit) a 1. */
  forceLueur: number;
}

// Quatre etats, du jour a la nuit : le plein jour au-dessus de 20°, le soleil bas de 20° a 6°, le
// couchant de 6° a -2°, la nuit au-dela de -8°. Entre deux, on interpole.
const JOUR = { zenith: 0x4f86c6, horizon: 0xd6e6ef, lueur: 0xfff4dc };
const BAS = { zenith: 0x5b86bd, horizon: 0xe8e2d2, lueur: 0xffe3b0 };
const COUCHANT = { zenith: 0x4a5f8f, horizon: 0xf0b07a, lueur: 0xff9a52 };
const NUIT = { zenith: 0x0d1630, horizon: 0x26314d, lueur: 0x3a4466 };

function melanger(a: number, b: number, t: number): number {
  const u = Math.max(0, Math.min(1, t));
  const c = (k: number, x: number) => (x >> k) & 0xff;
  const m = (k: number) => Math.round(c(k, a) + (c(k, b) - c(k, a)) * u);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

function entre(a: typeof JOUR, b: typeof JOUR, t: number) {
  return { zenith: melanger(a.zenith, b.zenith, t), horizon: melanger(a.horizon, b.horizon, t), lueur: melanger(a.lueur, b.lueur, t) };
}

export function couleursDuCiel(elevRad: number): CouleursCiel {
  const deg = elevRad * 180 / Math.PI;
  let c: typeof JOUR;
  if (deg >= 20) c = JOUR;
  else if (deg >= 6) c = entre(BAS, JOUR, (deg - 6) / 14);
  else if (deg >= -2) c = entre(COUCHANT, BAS, (deg + 2) / 8);
  else c = entre(NUIT, COUCHANT, (deg + 8) / 6);
  const forceLueur = deg >= 0 ? 1 : Math.max(0, 1 + deg / 8);
  return { ...c, forceLueur };
}

const SOMMETS_CIEL = `
varying vec3 vDirection;
void main() {
  vDirection = normalize( position );
  vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  // Toujours au plus loin : le ciel passe derriere tout, meme si la camera recule au bord du dome.
  gl_Position = p.xyww;
}`;

const FRAGMENTS_CIEL = `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 lueur;
uniform vec3 soleil;
uniform float forceLueur;
uniform float gain;
varying vec3 vDirection;
void main() {
  vec3 d = normalize( vDirection );
  float h = clamp( d.y, 0.0, 1.0 );
  vec3 c = mix( horizon, zenith, pow( h, 0.55 ) );
  float s = max( dot( d, normalize( soleil ) ), 0.0 );
  c += lueur * ( pow( s, 6.0 ) * 0.22 + pow( s, 90.0 ) * 0.6 ) * forceLueur;
  gl_FragColor = vec4( c * gain, 1.0 );
  // L'encodage de la cible : sans effet a l'ecran (sortie lineaire), indispensable quand le ciel est
  // rendu dans la carte d'environnement, encodee RGBE — sans lui, la scene entiere virait au noir.
  #include <colorspace_fragment>
}`;

const NOM_CIEL = 'ciel';

interface UniformesCiel {
  zenith: { value: THREE_NS.Color };
  horizon: { value: THREE_NS.Color };
  lueur: { value: THREE_NS.Color };
  soleil: { value: THREE_NS.Vector3 };
  forceLueur: { value: number };
  gain: { value: number };
}

/**
 * Le ciel : une sphere qui suit la camera, peinte d'un degrade horizon-zenith et d'une lueur autour
 * du soleil. Ni ombre, ni brume, ni export ; elle ne touche pas le tampon de profondeur.
 */
export function poserCiel(scene: THREE_NS.Scene, rayon: number): THREE_NS.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color(JOUR.zenith) },
      horizon: { value: new THREE.Color(JOUR.horizon) },
      lueur: { value: new THREE.Color(JOUR.lueur) },
      soleil: { value: new THREE.Vector3(0, 1, 0) },
      forceLueur: { value: 1 },
      gain: { value: 1 }
    },
    vertexShader: SOMMETS_CIEL,
    fragmentShader: FRAGMENTS_CIEL,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false
  });
  const ciel = new THREE.Mesh(new THREE.SphereGeometry(rayon, 32, 16), mat);
  ciel.name = NOM_CIEL;
  ciel.frustumCulled = false;
  ciel.renderOrder = -1000;
  ciel.castShadow = false;
  ciel.receiveShadow = false;
  ciel.userData[HORS_EXPORT] = true;
  // Transparent aux rayons : la molette vise ce qui est sous le pointeur, et « le ciel » doit y rester
  // « rien a viser » (three/navigation.ts).
  ciel.raycast = () => {};
  ciel.onBeforeRender = (_r, _s, camera) => { ciel.position.copy(camera.position); ciel.updateMatrixWorld(); };
  scene.add(ciel);
  return ciel;
}

/**
 * Accorde le ciel, la brume et le fond a la hauteur et a l'azimut du soleil. Le repere est celui de
 * la scene : X a l'est, Y en haut, le nord vers -Z (three/lumiere.ts).
 */
export function accorderCiel(scene: THREE_NS.Scene, soleil: { elevRad: number; azRad: number }): CouleursCiel | null {
  const ciel = scene.getObjectByName(NOM_CIEL) as THREE_NS.Mesh | undefined;
  if (!ciel) return null;
  const c = couleursDuCiel(soleil.elevRad);
  const u = (ciel.material as THREE_NS.ShaderMaterial).uniforms as unknown as UniformesCiel;
  u.zenith.value.set(c.zenith);
  u.horizon.value.set(c.horizon);
  u.lueur.value.set(c.lueur);
  u.forceLueur.value = c.forceLueur;
  const e = Math.max(soleil.elevRad, -0.05);
  u.soleil.value.set(Math.sin(soleil.azRad) * Math.cos(e), Math.sin(e), -Math.cos(soleil.azRad) * Math.cos(e));
  // La brume prend la couleur de l'horizon : le lointain s'y fond au lieu de s'arreter net.
  if (scene.fog) scene.fog.color.set(c.horizon);
  if (scene.background && (scene.background as THREE_NS.Color).isColor) (scene.background as THREE_NS.Color).set(c.horizon);
  return c;
}

/**
 * La brume du lointain : rien sur la parcelle et ses abords, le voisinage au-dela s'estompe, l'horizon
 * se confond avec le ciel. `proche` est le rayon de la parcelle et de ses mitoyens, `loin` le plan
 * lointain de la camera.
 */
export function poserBrume(scene: THREE_NS.Scene, proche: number, loin: number): void {
  const debut = Math.max(150, proche * 5);
  scene.fog = new THREE.Fog(JOUR.horizon, debut, Math.max(debut * 4, loin * 0.9));
}

// ---- L'eclairage par le ciel -------------------------------------------------------------------

/**
 * L'image du ciel comme lumiere d'ambiance (`scene.environment`) : les faces tournees vers le ciel
 * s'eclairent de son bleu, celles vers l'horizon de sa clarte, et les vitres le refleteront (R2).
 * Calculee sur une scene a part qui ne contient que le ciel. Rend le nouvel environnement, a liberer
 * au suivant.
 */
export function eclairerParLeCiel(renderer: THREE_NS.WebGLRenderer, scene: THREE_NS.Scene, precedent: THREE_NS.WebGLRenderTarget | null): THREE_NS.WebGLRenderTarget | null {
  const ciel = scene.getObjectByName(NOM_CIEL) as THREE_NS.Mesh | undefined;
  if (!ciel) return precedent;
  const seul = new THREE.Scene();
  // Le meme ciel, assombri : vu comme une lumiere, le ciel entier eclairerait trop une scene deja
  // eclairee par le soleil (reglage a l'oeil sur le banc).
  const materiau = (ciel.material as THREE_NS.ShaderMaterial).clone();
  (materiau.uniforms as unknown as UniformesCiel).gain.value = GAIN_ENVIRONNEMENT;
  const copie = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), materiau);
  copie.onBeforeRender = () => {};
  seul.add(copie);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const cible = pmrem.fromScene(seul, 0, 0.1, 100);
  pmrem.dispose();
  copie.geometry.dispose();
  materiau.dispose();
  scene.environment = cible.texture;
  precedent?.dispose();
  return cible;
}

/**
 * Ce que l'eclairage par le ciel retire aux deux lumieres d'appoint : il apporte deja la lumiere
 * diffuse qu'elles imitaient. Sans cela, la scene serait plus claire, pas plus juste.
 */
export const PART_AMBIANTE_AVEC_CIEL = 0.55;
export const PART_APPOINT_AVEC_CIEL = 0.6;
/** La clarte du ciel vu comme une lumiere, rapportee a celle du ciel vu a l'ecran. */
export const GAIN_ENVIRONNEMENT = 0.45;

// ---- Ombres ------------------------------------------------------------------------------------

/**
 * Le demi-cote du cadre de la carte d'ombre : resserre sur la parcelle du projet et ses abords,
 * pour que l'ombre soit nette au pied des murs, et jamais plus large que l'ancien cadre (1,8 fois
 * l'etendue de la scene). `rayonParcelle` est la plus grande distance d'un sommet de la parcelle au
 * centre de la scene ; `null` sans parcelle : l'ancien cadre.
 */
export function cadreOmbres(rayonParcelle: number | null, extent: number): number {
  const ancien = extent * 1.8;
  if (rayonParcelle === null || !(rayonParcelle > 0)) return ancien;
  return Math.min(ancien, Math.max(20, rayonParcelle * 1.5 + 10));
}

// ---- Occlusion ambiante (Soignee) --------------------------------------------------------------

let occlusionChargee: Promise<boolean> | null = null;

/** Les exemples de three.js qui font l'occlusion, charges une fois, a la demande. */
export function chargerOcclusion(): Promise<boolean> {
  if (occlusionChargee) return occlusionChargee;
  // Demandes en parallele : les modules se resolvent entre eux par leurs adresses relatives.
  occlusionChargee = Promise.all([
    chargerExemple('postprocessing/EffectComposer.js', ['EffectComposer']),
    chargerExemple('postprocessing/RenderPass.js', ['RenderPass']),
    chargerExemple('postprocessing/OutputPass.js', ['OutputPass']),
    chargerExemple('postprocessing/SSAOPass.js', ['SSAOPass']),
    chargerExemple('shaders/SSAOShader.js', ['SSAOShader'])
  ]).then(() => true, () => {
    // Un echec (hors ligne) se retente a la prochaine scene ; d'ici la, la scene se rend sans occlusion.
    occlusionChargee = null;
    return false;
  });
  return occlusionChargee;
}

/** Ce que l'occlusion ajoute a la scene : un enchainement de passes a rendre a la place du rendu simple. */
export interface Occlusion {
  render(): void;
  setSize(w: number, h: number): void;
  setPixelRatio(r: number): void;
  dispose(): void;
}

type ExemplesOcclusion = {
  EffectComposer: new (r: THREE_NS.WebGLRenderer, cible?: THREE_NS.WebGLRenderTarget) => { addPass(p: unknown): void; render(): void; setSize(w: number, h: number): void; setPixelRatio(r: number): void; renderTarget1: THREE_NS.WebGLRenderTarget; renderTarget2: THREE_NS.WebGLRenderTarget };
  RenderPass: new (s: THREE_NS.Scene, c: THREE_NS.Camera) => unknown;
  OutputPass: new () => { dispose?(): void };
  SSAOPass: new (s: THREE_NS.Scene, c: THREE_NS.Camera, w: number, h: number) => { kernelRadius: number; minDistance: number; maxDistance: number; setSize(w: number, h: number): void; dispose?(): void };
};

/** Au-dela de ces distances a la camera, en metres, l'occlusion s'estompe puis disparait. */
export const OCCLUSION_PLEINE_M = 25;
export const OCCLUSION_NULLE_M = 60;

let occlusionEstompee = false;

/**
 * Le tampon de profondeur va de 5 cm a plusieurs centaines de metres : au loin, sa precision ne
 * suffit plus a l'occlusion, qui dessinait des stries sur le sol. Elle donne du volume de pres (le
 * pied des murs, le dessous des debords) : on l'estompe avec la distance, dans le shader lui-meme.
 */
function estomperOcclusionAuLoin(): void {
  if (occlusionEstompee) return;
  const shader = (THREE as unknown as { SSAOShader?: { fragmentShader: string } }).SSAOShader;
  if (!shader) return;
  const fin = 'occlusion = clamp( occlusion / float( KERNEL_SIZE ), 0.0, 1.0 );';
  shader.fragmentShader = shader.fragmentShader.replace(fin,
    fin + ' occlusion *= 1.0 - smoothstep( ' + OCCLUSION_PLEINE_M.toFixed(1) + ', ' + OCCLUSION_NULLE_M.toFixed(1) + ', - viewZ );');
  occlusionEstompee = true;
}

/**
 * L'occlusion ambiante a l'ecran (SSAO) : les coins, le pied des murs et le dessous des debords
 * s'assombrissent, ce qui donne du volume. Les distances se disent en profondeur normalisee par
 * le plan lointain : on les ramene a des metres.
 */
export function brancherOcclusion(renderer: THREE_NS.WebGLRenderer, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, w: number, h: number): Occlusion | null {
  const T = THREE as unknown as Partial<ExemplesOcclusion>;
  if (!T.EffectComposer || !T.SSAOPass || !T.RenderPass || !T.OutputPass) return null;
  estomperOcclusionAuLoin();
  // L'image de la scene se rend dans une cible a elle, avec un tampon de gabarit : le sol,
  // l'orthophoto et les chemins ne s'effacaient plus du bassin d'une piscine (`gabaritSol`,
  // three/primitives.ts), et la pelouse remplissait l'eau en Soignee. Demi-flottant : la lumiere
  // reste lineaire jusqu'a la passe de sortie, qui y applique la courbe de film.
  const cible = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, stencilBuffer: true });
  const composer = new T.EffectComposer(renderer, cible);
  composer.setPixelRatio(renderer.getPixelRatio());
  const passe = new T.SSAOPass(scene, camera, w, h);
  const profondeur = camera.far - camera.near;
  passe.kernelRadius = 0.8;
  passe.minDistance = 0.02 / profondeur;
  passe.maxDistance = 1.2 / profondeur;
  const sortie = new T.OutputPass();
  composer.addPass(new T.RenderPass(scene, camera));
  composer.addPass(passe);
  composer.addPass(sortie);
  composer.setSize(w, h);
  return {
    render: () => composer.render(),
    // Le compositeur redimensionne ses passes lui-meme, a la definition du rendu.
    setSize: (l, ht) => composer.setSize(l, ht),
    setPixelRatio: (r) => composer.setPixelRatio(r),
    dispose: () => { passe.dispose?.(); sortie.dispose?.(); composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); }
  };
}

// ---- La scene entiere ---------------------------------------------------------------------------

/** Ce que le rendu pose sur une scene de la Vue 3D, et qu'il faut liberer avec elle. */
export interface EtatRendu {
  environnement: boolean;
  cible: THREE_NS.WebGLRenderTarget | null;
  minuterie: ReturnType<typeof setTimeout> | null;
  occlusion: Occlusion | null;
  /** La scene a ete demontee : une occlusion arrivee apres coup ne s'y branche pas. */
  libere: boolean;
}

/**
 * Pose le rendu photographique sur une scene qui vient d'etre montee : courbe de film, ciel (sauf
 * dans la vitrine, qui peint le sien), brume, et en Soignee l'occlusion, des que ses scripts sont la.
 * `procheM` : le rayon de la parcelle du projet et de ses abords, ou la brume ne mord pas.
 */
export function monterRendu(sc: SceneVue3d, niveau: ParametresQualite, procheM: number, avecCiel: boolean): EtatRendu {
  const etat: EtatRendu = { environnement: niveau.environnement && avecCiel, cible: null, minuterie: null, occlusion: null, libere: false };
  sc.rendu = etat;
  reglerRendu(sc.renderer);
  if (avecCiel) {
    poserCiel(sc.scene, sc.camera.far * 0.9);
    poserBrume(sc.scene, procheM, sc.camera.far);
  }
  if (niveau.occlusion && typeof document !== 'undefined') {
    void chargerOcclusion().then((ok) => {
      if (!ok || etat.libere) return;
      const host = sc.renderer.domElement;
      const o = brancherOcclusion(sc.renderer, sc.scene, sc.camera, host.clientWidth || 600, host.clientHeight || 420);
      if (!o) return;
      etat.occlusion = o;
      sc.rendre = o.render;
      sc.redimensionner = o.setSize;
      sc.rapportPixels = o.setPixelRatio;
      rendre3d(sc);
    });
  }
  return etat;
}

/**
 * Accorde le rendu au soleil qui vient d'etre pose (three/soleilVue3d.ts) : ciel, brume, part des
 * lumieres d'appoint, et l'environnement recalcule un instant apres le dernier pas du curseur (un
 * calcul par pas ferait ramer le glisser de l'heure).
 */
export function accorderAuSoleil(sc: SceneVue3d, soleil: { elevRad: number; azRad: number }): void {
  const etat = sc.rendu;
  if (!etat) return;
  accorderCiel(sc.scene, soleil);
  if (!etat.environnement) return;
  sc.hemiLight.intensity *= PART_AMBIANTE_AVEC_CIEL;
  sc.dirFill.intensity *= PART_APPOINT_AVEC_CIEL;
  const recalculer = () => {
    etat.minuterie = null;
    if (etat.libere) return;
    try {
      etat.cible = eclairerParLeCiel(sc.renderer, sc.scene, etat.cible);
    } catch {
      // Un contexte sans WebGL complet (tests, contexte perdu) : la scene garde ses lumieres seules.
      etat.environnement = false;
      return;
    }
    // Par rendre3d : en deux vues (three/comparaison3d.ts), l'image doit les montrer toutes deux.
    rendre3d(sc);
  };
  if (!etat.cible) { recalculer(); return; }
  if (etat.minuterie) clearTimeout(etat.minuterie);
  etat.minuterie = setTimeout(recalculer, 150);
}

/** Libere ce que le rendu a pose : l'environnement, l'occlusion, la minuterie. */
export function libererRendu(sc: SceneVue3d): void {
  const etat = sc.rendu;
  if (!etat) return;
  etat.libere = true;
  if (etat.minuterie) clearTimeout(etat.minuterie);
  etat.cible?.dispose();
  etat.occlusion?.dispose();
  sc.scene.environment = null;
}
