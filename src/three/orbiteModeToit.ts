// L'orbite de la Vue 3D pendant une session du mode Toit (audit de la camera, 6 novembre 2026) : ou l'on peut aller, et autour de quoi
// l'on tourne.
//
// Hors du mode, la Vue 3D garde l'orbite d'OrbitControls telle quelle (un voisinage entier se parcourt). Pendant une session, on travaille
// un batiment : la camera ne passe plus sous l'horizon, ne s'approche pas a moins de `DISTANCE_MIN_M` de ce qu'elle regarde, ne s'eloigne
// pas au-dela de quelques fois le batiment, et la cible (le centre de l'orbite) reste au-dessus du sol, pres de lui. L'image, elle, est
// decalee vers la partie que le panneau laisse libre (`decalageDeLaVue`) : la cible reste le centre du batiment, ou du corps choisi.
//
// Tout se pose sur la scene courante et se rend a la fin de la session ; une scene rebatie pendant la session le reprend (l'appelant
// rappelle `borner`). Les bornes elles-memes sont pures et testees (`bornesDeLOrbite`, `correctionDeLaCible`).

import { decalageDeLaVue, type PointScene, type Reserve } from './poseFacade.js';
import { reglerVue3d, vue3d, type SceneVue3d } from './etat3d.js';

/** La camera ne descend pas sous cet angle depuis la verticale : 85°, juste au-dessus de l'horizon de la cible. */
export const POLAIRE_MAX_RAD = (85 * Math.PI) / 180;
/** Au plus pres de la cible : en deca, la camera traverse le toit, ou se colle dessus sans plus rien montrer. */
export const DISTANCE_MIN_M = 3;
/** Au plus loin, en diametres du batiment (la sphere qui le contient) ; jamais moins de `DISTANCE_MAX_PLANCHER_M`. */
export const DISTANCE_MAX_DIAMETRES = 4;
export const DISTANCE_MAX_PLANCHER_M = 20;
/** La cible ne s'ecarte pas du centre du batiment de plus de ces diametres (et de `RAYON_CIBLE_PLANCHER_M` au moins). */
export const RAYON_CIBLE_DIAMETRES = 2;
export const RAYON_CIBLE_PLANCHER_M = 10;
/**
 * La sensibilite du pincement pendant la session : celle d'origine d'OrbitControls. La Vue 3D la double pour traverser un grand
 * voisinage (three/scene.ts) ; sur un batiment, un pincement ordinaire emmenait de 64 m a 5 m, sous le sol.
 */
export const VITESSE_ZOOM = 1;

/** Ou l'orbite peut aller : le centre du batiment (scene), son sol, et les distances. */
export interface BornesOrbite {
  centre: { x: number; z: number };
  sol: number;
  min: number;
  max: number;
  rayonCible: number;
}

/** Les bornes autour des points du batiment (coordonnees de la scene, pied et haut compris) ; `sol` : l'altitude du sol sous lui. */
export function bornesDeLOrbite(points: readonly PointScene[], sol: number): BornesOrbite {
  const n = points.length || 1;
  const c = points.reduce((t, p) => ({ x: t.x + p.x / n, y: t.y + p.y / n, z: t.z + p.z / n }), { x: 0, y: 0, z: 0 });
  const diametre = 2 * Math.max(1, ...points.map((p) => Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z)));
  return {
    centre: { x: c.x, z: c.z }, sol,
    min: DISTANCE_MIN_M,
    max: Math.max(DISTANCE_MAX_PLANCHER_M, DISTANCE_MAX_DIAMETRES * diametre),
    rayonCible: Math.max(RAYON_CIBLE_PLANCHER_M, RAYON_CIBLE_DIAMETRES * diametre)
  };
}

/**
 * Ce qu'il faut ajouter a la cible (et a la camera, pour garder la vue) pour qu'elle reste dans les bornes : au-dessus du sol du batiment,
 * a `rayonCible` au plus de son centre. Nul quand elle y est.
 */
export function correctionDeLaCible(cible: { x: number; y: number; z: number }, b: BornesOrbite): { x: number; y: number; z: number } {
  const dx = cible.x - b.centre.x, dz = cible.z - b.centre.z, d = Math.hypot(dx, dz);
  const k = d > b.rayonCible ? b.rayonCible / d - 1 : 0;
  return { x: dx * k, y: cible.y < b.sol ? b.sol - cible.y : 0, z: dz * k };
}

interface Reglages { min: number; max: number; polaire: number; vitesse: number; ecran: boolean }
interface Pose { reglages: Reglages; ecoute: () => void }
const posees = new WeakMap<SceneVue3d, Pose>();
let bornesCourantes: BornesOrbite | null = null;
/** La focale tenue avant la session (la prise de vue de l'audit la tient aussi) : rendue a la fin. */
let focaleAvant: boolean | null = null;

/** Tient la cible dans les bornes, apres chaque mouvement de l'orbite : la camera suit du meme pas, la vue ne tourne pas. */
function tenir(sc: SceneVue3d): void {
  const b = bornesCourantes;
  if (!b) return;
  const t = sc.controls.target, c = correctionDeLaCible(t, b);
  if (!c.x && !c.y && !c.z) return;
  t.set(t.x + c.x, t.y + c.y, t.z + c.z);
  sc.camera.position.set(sc.camera.position.x + c.x, sc.camera.position.y + c.y, sc.camera.position.z + c.z);
}

/** Pose les bornes `b` sur l'orbite de `sc` (une seule fois par scene : les reglages d'avant sont gardes pour `liberer`). */
export function borner(sc: SceneVue3d, b: BornesOrbite): void {
  // La focale ne suit plus la hauteur de la camera (45° en l'air, 55° pres du sol) : en tournant autour du batiment, l'impression de
  // zoom changeait en descendant.
  if (!bornesCourantes && focaleAvant === null) { focaleAvant = vue3d.focaleBloquee; reglerVue3d({ focaleBloquee: true }); }
  bornesCourantes = b;
  const c = sc.controls;
  if (!posees.has(sc)) {
    const reglages: Reglages = { min: c.minDistance, max: c.maxDistance, polaire: c.maxPolarAngle, vitesse: c.zoomSpeed, ecran: c.screenSpacePanning };
    const h = () => { tenir(sc); };
    c.addEventListener('change', h);
    posees.set(sc, { reglages, ecoute: () => { c.removeEventListener('change', h); } });
  }
  c.minDistance = b.min;
  c.maxDistance = b.max;
  c.maxPolarAngle = POLAIRE_MAX_RAD;
  c.zoomSpeed = VITESSE_ZOOM;
  // Le glisser a deux doigts (ou au bouton droit) translate dans le plan du sol : la cible ne monte ni ne descend.
  c.screenSpacePanning = false;
  tenir(sc);
  c.update();
}

/** Une camera posee par le mode (un cadrage, la vue de dessus) peut demander plus de recul que la borne : elle est admise. */
export function admettreDistance(sc: SceneVue3d, d: number): void {
  if (!bornesCourantes || !posees.has(sc)) return;
  bornesCourantes.max = Math.max(bornesCourantes.max, d * 1.05);
  sc.controls.maxDistance = bornesCourantes.max;
}

/** Rend a l'orbite de `sc` ses reglages d'avant la session, et a la camera une image centree. */
export function liberer(sc: SceneVue3d | null): void {
  bornesCourantes = null;
  if (focaleAvant !== null) { reglerVue3d({ focaleBloquee: focaleAvant }); focaleAvant = null; }
  if (!sc) return;
  const p = posees.get(sc);
  if (p) {
    p.ecoute();
    const c = sc.controls;
    c.minDistance = p.reglages.min; c.maxDistance = p.reglages.max; c.maxPolarAngle = p.reglages.polaire;
    c.zoomSpeed = p.reglages.vitesse; c.screenSpacePanning = p.reglages.ecran;
    posees.delete(sc);
  }
  decentrer(sc, undefined);
}

/** Le decalage pose sur chaque scene, pour ne recalculer la projection que s'il change. */
const decalages = new WeakMap<SceneVue3d, string>();

/**
 * Decale l'image de `sc` vers la partie que le panneau laisse libre (`reserve`), ou la recentre (`undefined`). Vrai si l'image a change.
 * Les rapports, pas les pixels, comptent pour three.js : une capture a une autre definition garde le meme decalage.
 */
export function decentrer(sc: SceneVue3d, reserve: Reserve | undefined): boolean {
  const cam = sc.camera, d = decalageDeLaVue(reserve);
  const l = reserve?.largeur || sc.renderer.domElement.clientWidth || 1, h = reserve?.hauteur || sc.renderer.domElement.clientHeight || 1;
  const cle = d.x || d.y ? [l, h, d.x, d.y].map((v) => v.toFixed(1)).join() : '';
  if ((decalages.get(sc) ?? '') === cle) return false;
  if (cle) { cam.setViewOffset(l, h, d.x, d.y, l, h); decalages.set(sc, cle); }
  else { cam.clearViewOffset(); decalages.delete(sc); }
  cam.updateProjectionMatrix();
  return true;
}
