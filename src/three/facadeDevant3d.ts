// La facade devant laquelle vous etes, surlignee dans la Vue 3D (mode audit, MD/spec-audit.md §6.1).
//
// Un voile translucide pose juste devant le mur, du sol a l'egout, et son contour, qui passe devant
// tout le reste pour ne jamais se perdre derriere un arbre. Comme le point de la position GPS
// (three/positionGps3d.ts), il ne fait que changer de mur : rien n'est reconstruit, et une scene
// rebatie reprend la derniere facade connue (`reposerFacadeDevant`, appele en fin de construction).
// Le nom de la facade s'ecrit dans la barre de l'audit : la couleur ne porte pas seule l'information.

import { vue3d } from './etat3d.js';
import { versLocalDepuis, HORS_EXPORT } from './primitives.js';
import type * as THREE_NS from 'three';
import type { PtBrut } from '../model/types.js';

/** Le nom du groupe dans la scene : il n'y en a jamais qu'un. */
export const NOM_FACADE_DEVANT = 'facadeDevant';
/** Le voile est decolle du mur : pose dessus, il clignoterait avec lui (meme profondeur). */
const DECOLLEMENT_M = 0.15;
/** Ambre : ni le bleu de la position, ni le rouge des batiments marques. */
const AMBRE = 0xf5a623;

/** Le mur a surligner : ses deux bouts au sol, sa normale sortante et sa hauteur a l'egout. */
export interface MurSurligne { gauche: PtBrut; droite: PtBrut; normale: PtBrut; hauteur: number }

let courant: MurSurligne | null = null;
let hauteurSol: ((p: PtBrut) => number) | undefined;

/** Les quatre coins du voile, dans le repere de la scene : bas gauche, bas droite, haut droite, haut gauche. */
function coins(m: MurSurligne, cen: PtBrut): number[] {
  const local = versLocalDepuis(cen);
  const decale = (p: PtBrut) => ({ x: p.x + m.normale.x * DECOLLEMENT_M, y: p.y + m.normale.y * DECOLLEMENT_M });
  const g = local(decale(m.gauche)), d = local(decale(m.droite));
  const sg = hauteurSol ? hauteurSol(m.gauche) : 0, sd = hauteurSol ? hauteurSol(m.droite) : 0;
  return [g.x, sg, g.z, d.x, sd, d.z, d.x, sd + m.hauteur, d.z, g.x, sg + m.hauteur, g.z];
}

function creerGroupe(m: MurSurligne, cen: PtBrut): THREE_NS.Group {
  const groupe = new THREE.Group();
  groupe.name = NOM_FACADE_DEVANT;
  groupe.userData[HORS_EXPORT] = true;
  const sommets = coins(m, cen);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(sommets, 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const voile = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: AMBRE, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  voile.name = 'voile';
  voile.renderOrder = 997;
  const geoContour = new THREE.BufferGeometry();
  geoContour.setAttribute('position', new THREE.Float32BufferAttribute(sommets, 3));
  const contour = new THREE.LineLoop(geoContour, new THREE.LineBasicMaterial({ color: AMBRE, depthTest: false, transparent: true }));
  contour.name = 'contour';
  contour.renderOrder = 997;
  groupe.add(voile, contour);
  return groupe;
}

/** Retire le groupe de la scene ouverte, et libere ce qu'il tenait sur la carte graphique. */
function retirerDeLaScene(): void {
  const sc = vue3d.scene;
  const groupe = sc?.scene.getObjectByName(NOM_FACADE_DEVANT);
  if (!sc || !groupe) return;
  sc.scene.remove(groupe);
  groupe.traverse?.((o) => {
    const m = o as THREE_NS.Mesh;
    m.geometry?.dispose?.();
    (m.material as THREE_NS.Material | undefined)?.dispose?.();
  });
}

function placer(): void {
  retirerDeLaScene();
  const sc = vue3d.scene;
  if (!sc || !courant) return;
  sc.scene.add(creerGroupe(courant, sc.cen));
}

/** La facade devant vous change (ou disparait, avec null) : le surlignage la suit. */
export function poserFacadeDevant(m: MurSurligne | null): void {
  courant = m ? { gauche: { ...m.gauche }, droite: { ...m.droite }, normale: { ...m.normale }, hauteur: m.hauteur } : null;
  placer();
}

/** Fin de construction d'une scene : le sol de cette scene, et la derniere facade reposee. */
export function reposerFacadeDevant(sol?: (p: PtBrut) => number): void {
  hauteurSol = sol;
  placer();
}

/** La facade surlignee, pour les tests. */
export function facadeDevantSurlignee(): MurSurligne | null {
  return courant;
}
