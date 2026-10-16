// La facade devant laquelle vous etes, surlignee dans la Vue 3D (mode audit, MD/spec-audit.md §6.1).
//
// Un voile translucide pose juste devant le mur, du sol a l'egout, et son contour, qui passe devant
// tout le reste pour ne jamais se perdre derriere un arbre. Comme le point de la position GPS
// (three/positionGps3d.ts), il ne fait que changer de mur : rien n'est reconstruit, et une scene
// rebatie reprend la derniere facade connue (`reposerFacadeDevant`, appele en fin de construction).
// Le nom de la facade s'ecrit dans la barre de l'audit : la couleur ne porte pas seule l'information.

import { vue3d } from './etat3d.js';
import { versLocalDepuis, HORS_EXPORT } from './primitives.js';
import { au } from '../util/tableaux.js';
import type * as THREE_NS from 'three';
import type { PtBrut } from '../model/types.js';

/** Le nom du groupe dans la scene : il n'y en a jamais qu'un. */
export const NOM_FACADE_DEVANT = 'facadeDevant';
/** Le voile est decolle du mur : pose dessus, il clignoterait avec lui (meme profondeur). */
const DECOLLEMENT_M = 0.15;
/** Ambre : ni le bleu de la position, ni le rouge des batiments marques de la promenade. */
export const AMBRE = 0xf5a623;
/**
 * Rouge : la facade a photographier de l'audit de la parcelle (demande de l'utilisateur), ou rien
 * d'autre n'est rouge ; la promenade garde l'ambre, son rouge est celui des batiments marques.
 */
export const ROUGE_FACADE = 0xe0301e;
/** Vert : les facades deja photographiees de l'audit de la parcelle (on peut toujours les reprendre). */
export const VERT_FACADE = 0x2e9e4f;
/** Le nom du groupe des facades photographiees : sous la facade visee, qui l'emporte quand c'est la meme. */
export const NOM_FACADES_FAITES = 'facadesFaites';

/**
 * Le mur a surligner : ses deux bouts au sol, sa normale sortante et sa hauteur a l'egout ; et, quand
 * il change de hauteur le long de sa longueur (une aile basse, puis un etage), son haut par morceaux,
 * `de` et `a` en metres depuis sa gauche : le voile suit alors le mur, sans couvrir le ciel.
 */
export interface MurSurligne { gauche: PtBrut; droite: PtBrut; normale: PtBrut; hauteur: number; profil?: readonly { de: number; a: number; h: number }[] }

let courant: MurSurligne | null = null;
let couleur = AMBRE;
let faites: MurSurligne[] = [];
let hauteurSol: ((p: PtBrut) => number) | undefined;

/**
 * Les morceaux du voile, dans le repere de la scene : pour chacun, bas gauche, bas droite, haut
 * droite, haut gauche ; et le contour, du bas gauche au bas droit puis par le haut, de droite a gauche.
 */
function morceaux(m: MurSurligne, cen: PtBrut): { quads: number[]; contour: number[] } {
  const local = versLocalDepuis(cen);
  const lx = m.droite.x - m.gauche.x, ly = m.droite.y - m.gauche.y, l = Math.hypot(lx, ly) || 1;
  const profil = m.profil?.length ? m.profil : [{ de: 0, a: l, h: m.hauteur }];
  /** Le point a `s` metres de la gauche, decolle du mur, et son sol. */
  const point = (s: number) => {
    const p = { x: m.gauche.x + (lx * s) / l + m.normale.x * DECOLLEMENT_M, y: m.gauche.y + (ly * s) / l + m.normale.y * DECOLLEMENT_M };
    return { ...local(p), sol: hauteurSol ? hauteurSol({ x: m.gauche.x + (lx * s) / l, y: m.gauche.y + (ly * s) / l }) : 0 };
  };
  const quads: number[] = [];
  const haut: number[] = [];
  for (const q of profil) {
    const a = point(q.de), b = point(q.a);
    quads.push(a.x, a.sol, a.z, b.x, b.sol, b.z, b.x, b.sol + q.h, b.z, a.x, a.sol + q.h, a.z);
    haut.push(a.x, a.sol + q.h, a.z, b.x, b.sol + q.h, b.z);
  }
  const g = point(0), d = point(l);
  // Le contour : le bas, puis le haut parcouru de droite a gauche, marches comprises.
  const retour: number[] = [];
  for (let i = haut.length - 3; i >= 0; i -= 3) retour.push(au(haut, i), au(haut, i + 1), au(haut, i + 2));
  return { quads, contour: [g.x, g.sol, g.z, d.x, d.sol, d.z, ...retour] };
}

/** Le voile et le contour d'un mur, dans cette couleur, devant tout ce qui a un ordre plus petit. */
function voileDe(m: MurSurligne, cen: PtBrut, teinte: number, ordre: number): THREE_NS.Object3D[] {
  const { quads, contour: sommetsContour } = morceaux(m, cen);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(quads, 3));
  const index: number[] = [];
  for (let k = 0; k < quads.length / 12; k++) index.push(4 * k, 4 * k + 1, 4 * k + 2, 4 * k, 4 * k + 2, 4 * k + 3);
  geo.setIndex(index);
  const voile = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: teinte, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  voile.name = 'voile';
  voile.renderOrder = ordre;
  const geoContour = new THREE.BufferGeometry();
  geoContour.setAttribute('position', new THREE.Float32BufferAttribute(sommetsContour, 3));
  const contour = new THREE.LineLoop(geoContour, new THREE.LineBasicMaterial({ color: teinte, depthTest: false, transparent: true }));
  contour.name = 'contour';
  contour.renderOrder = ordre;
  return [voile, contour];
}

function creerGroupe(nom: string, murs: readonly MurSurligne[], cen: PtBrut, teinte: number, ordre: number): THREE_NS.Group {
  const groupe = new THREE.Group();
  groupe.name = nom;
  groupe.userData[HORS_EXPORT] = true;
  for (const m of murs) groupe.add(...voileDe(m, cen, teinte, ordre));
  return groupe;
}

/** Retire le groupe de la scene ouverte, et libere ce qu'il tenait sur la carte graphique. */
function retirerDeLaScene(nom: string): void {
  const sc = vue3d.scene;
  const groupe = sc?.scene.getObjectByName(nom);
  if (!sc || !groupe) return;
  sc.scene.remove(groupe);
  groupe.traverse?.((o) => {
    const m = o as THREE_NS.Mesh;
    m.geometry?.dispose?.();
    (m.material as THREE_NS.Material | undefined)?.dispose?.();
  });
}

function placer(): void {
  retirerDeLaScene(NOM_FACADE_DEVANT);
  const sc = vue3d.scene;
  if (!sc || !courant) return;
  sc.scene.add(creerGroupe(NOM_FACADE_DEVANT, [courant], sc.cen, couleur, 997));
}

function placerFaites(): void {
  retirerDeLaScene(NOM_FACADES_FAITES);
  const sc = vue3d.scene;
  if (!sc || !faites.length) return;
  sc.scene.add(creerGroupe(NOM_FACADES_FAITES, faites, sc.cen, VERT_FACADE, 996));
}

const copie = (m: MurSurligne): MurSurligne => ({
  gauche: { ...m.gauche }, droite: { ...m.droite }, normale: { ...m.normale }, hauteur: m.hauteur,
  ...(m.profil?.length ? { profil: m.profil.map((q) => ({ ...q })) } : {}),
});

/** Les facades deja photographiees (audit de la parcelle), en vert ; une liste vide les retire. */
export function poserFacadesFaites(murs: readonly MurSurligne[]): void {
  faites = murs.map(copie);
  placerFaites();
}

/** La facade devant vous change (ou disparait, avec null) : le surlignage la suit, dans cette couleur. */
export function poserFacadeDevant(m: MurSurligne | null, teinte = AMBRE): void {
  couleur = teinte;
  courant = m ? copie(m) : null;
  placer();
}

/** Fin de construction d'une scene : le sol de cette scene, et la derniere facade reposee. */
export function reposerFacadeDevant(sol?: (p: PtBrut) => number): void {
  hauteurSol = sol;
  placer();
  placerFaites();
}

/** Le sol de la scene ouverte, pour poser une camera a hauteur d'homme (app/audit/parcelle/vuePrise.ts). */
export function solDeLaFacadeDevant(): ((p: PtBrut) => number) | undefined {
  return hauteurSol;
}

/** Les facades photographiees posees, pour les tests. */
export function facadesFaitesSurlignees(): MurSurligne[] {
  return faites;
}

/** La couleur du surlignage, pour les tests. */
export function couleurFacadeDevant(): number {
  return couleur;
}

/** La facade surlignee, pour les tests. */
export function facadeDevantSurlignee(): MurSurligne | null {
  return courant;
}
