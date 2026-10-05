// Le soleil qu'on voit, et le ciel du couchant, dans la vitrine (`?mode=demo`, app/vitrine.ts).
//
// L'eclairage suit deja le vrai soleil (three/lumiere.ts `reglerSoleil`) ; on ne le voyait pas. La
// vitrine pose donc un disque de soleil qui tourne AUTOUR DE LA PARCELLE, a l'azimut du vrai soleil,
// mais plus bas que lui : un soleil de midi en ete monte a 65 degres et sortirait du champ d'une
// camera qui regarde la parcelle d'en haut. Sa hauteur affichee est donc la vraie hauteur reduite
// (`ECRASEMENT_HAUTEUR`), bornee — la course reste lisible, levant a l'est, couchant a l'ouest.
//
// Pres du lever et du coucher, le ciel et la lumiere d'ambiance virent a un beige chaud de savane,
// et le disque passe du jaune pale a l'orange : on voit que le jour finit. Les deux se reglent au
// clic droit (app/menuVitrine.ts) et dans l'adresse (`soleil=n`, `couchant=n`).
//
// Rien de cela n'entre dans les ombres : le disque ne porte pas d'ombre et ne la recoit pas ; c'est
// `dirLight` qui eclaire, a sa vraie place.

import type * as THREE_NS from 'three';

/** La vraie hauteur multipliee par ceci, puis bornee : le soleil reste dans le champ. */
export const ECRASEMENT_HAUTEUR = 0.4;
export const HAUTEUR_AFFICHEE_MAX = 28 * Math.PI / 180;
/** La course passe a cette fois le rayon de la parcelle de son centre. */
export const DISTANCE_COURSE = 1.6;
/** Le ciel par defaut de la scene (three/scene.ts) et celui du couchant : un beige de savane. */
export const CIEL_JOUR = 0xdfe7ea;
export const CIEL_COUCHANT = 0xf2d2a0;
const AMBIANTE_COUCHANT = 0xffd9a8;
const SOL_COUCHANT = 0xb08850;
/** Jaune franc, pour se detacher du sol clair a midi ; orange au couchant. */
const DISQUE_JOUR = 0xffd84a;
const DISQUE_COUCHANT = 0xff8c2a;
/** L'ambiante et l'appoint au plus fort du couchant : la scene reste claire et doree, pas noire. */
const AMBIANTE_COUCHANT_INTENSITE = 1.0;
const APPOINT_COUCHANT_INTENSITE = 0.35;
const APPOINT_COUCHANT = 0xffc27a;

/** Le cercle de la parcelle, dans le repere de la scene (x Est, z Sud), et son rayon en metres. */
export interface CercleParcelle { x: number; z: number; rayon: number }

/**
 * La place du disque : a l'azimut du soleil (0 = Nord, sens horaire), a `DISTANCE_COURSE` rayons du
 * centre de la parcelle, a une hauteur ecrasee. Invisible des que le soleil est sous l'horizon.
 */
export function placeDuSoleil(elevRad: number, azRad: number, c: CercleParcelle): { x: number; y: number; z: number; visible: boolean } {
  const hauteur = Math.min(HAUTEUR_AFFICHEE_MAX, Math.max(0, elevRad) * ECRASEMENT_HAUTEUR);
  const d = Math.max(4, c.rayon * DISTANCE_COURSE);
  const horiz = Math.cos(hauteur) * d;
  return {
    x: c.x + Math.sin(azRad) * horiz,
    y: Math.sin(hauteur) * d,
    z: c.z - Math.cos(azRad) * horiz,
    visible: elevRad > -0.5 * Math.PI / 180
  };
}

/**
 * La part de couchant, de 0 (plein jour) a 1 : elle monte des 12 degres au-dessus de l'horizon,
 * culmine au coucher, puis retombe en six degres de crepuscule — la nuit n'est pas beige.
 */
export function partDeCouchant(elevRad: number): number {
  const deg = elevRad * 180 / Math.PI;
  if (deg >= 12) return 0;
  if (deg >= 0) return (12 - deg) / 12;
  return Math.max(0, 1 + deg / 6);
}

export interface OptionsSoleilVitrine { soleil: boolean; couchant: boolean }

const MARQUE = 'soleilVitrine';

/** Pose le disque et le ciel sur la scene ; a rappeler a chaque pas d'heure et apres une reconstruction. */
export function appliquerSoleilVitrine(
  sc: { scene: THREE_NS.Scene; hemiLight: THREE_NS.HemisphereLight; dirFill: THREE_NS.DirectionalLight },
  soleil: { elevRad: number; azRad: number },
  cercle: CercleParcelle,
  o: OptionsSoleilVitrine
): void {
  const t = o.couchant ? partDeCouchant(soleil.elevRad) : 0;
  // Le ciel et l'ambiante : du jour vers la savane, a proportion. L'eclairage du vrai soleil
  // s'eteint pres de l'horizon (three/lumiere.ts) et la scene virerait au noir : l'ambiante doree
  // la garde claire — c'est la lumiere du couchant qu'on veut montrer, pas la nuit.
  const fond = sc.scene.background;
  if (fond && (fond as THREE_NS.Color).isColor) (fond as THREE_NS.Color).set(CIEL_JOUR).lerp(new THREE.Color(CIEL_COUCHANT), t);
  sc.hemiLight.color.set(0xffffff).lerp(new THREE.Color(AMBIANTE_COUCHANT), t);
  sc.hemiLight.groundColor.set(0x4a3c2a).lerp(new THREE.Color(SOL_COUCHANT), t);
  if (t > 0 && sc.hemiLight.visible) sc.hemiLight.intensity = Math.max(sc.hemiLight.intensity, AMBIANTE_COUCHANT_INTENSITE * t);
  sc.dirFill.color.set(0xffffff).lerp(new THREE.Color(APPOINT_COUCHANT), t);
  if (t > 0 && sc.dirFill.visible) sc.dirFill.intensity = Math.max(sc.dirFill.intensity, APPOINT_COUCHANT_INTENSITE * t);

  let disque = sc.scene.getObjectByName(MARQUE) as THREE_NS.Mesh | undefined;
  if (!o.soleil) { if (disque) disque.visible = false; return; }
  if (!disque) {
    const r = Math.max(0.6, cercle.rayon * 0.05);
    disque = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshBasicMaterial({ color: DISQUE_JOUR }));
    disque.name = MARQUE;
    // Un halo, pour qu'on le voie meme petit, sur un ciel clair.
    const halo = new THREE.Mesh(new THREE.SphereGeometry(r * 2.2, 24, 16), new THREE.MeshBasicMaterial({ color: DISQUE_JOUR, transparent: true, opacity: 0.25, depthWrite: false }));
    disque.add(halo);
    disque.castShadow = false;
    disque.receiveShadow = false;
    sc.scene.add(disque);
  }
  // Ni ombre portee ni recue, a chaque pas : la scene repasse ses maillages en ombre a chaque
  // reglage des ombres (three/scene.ts), le disque et son halo compris.
  disque.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  const p = placeDuSoleil(soleil.elevRad, soleil.azRad, cercle);
  disque.visible = p.visible;
  disque.position.set(p.x, p.y, p.z);
  const couleur = new THREE.Color(DISQUE_JOUR).lerp(new THREE.Color(DISQUE_COUCHANT), partDeCouchant(soleil.elevRad));
  (disque.material as THREE_NS.MeshBasicMaterial).color.copy(couleur);
  ((disque.children[0] as THREE_NS.Mesh).material as THREE_NS.MeshBasicMaterial).color.copy(couleur);
}
