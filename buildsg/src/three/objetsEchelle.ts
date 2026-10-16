// Les objets d'echelle de la Vue 3D (MD/roadmap-realisme-3d.md, R5) : une voiture cote rue, une
// silhouette devant la maison. Ils donnent la taille des choses d'un coup d'oeil — un pignon de
// neuf metres, une terrasse de trente metres carres.
//
// Decoches par defaut (decision V5), a l'ecran seulement : jamais dans le .glb (V6). Dessines en
// volumes simples et d'un gris doux, ils ne volent pas la vedette au projet.

import type * as THREE_NS from 'three';
import type { PtBrut } from '../model/types.js';
import { HORS_EXPORT, type VersLocal } from './primitives.js';

/** Une voiture compacte : longueur, largeur, hauteur de caisse et de toit, en metres. */
export const VOITURE = { longueur: 4.3, largeur: 1.78, garde: 0.18, caisse: 0.72, cabine: 0.58, roue: 0.32 } as const;
/** Une personne de taille moyenne. */
export const SILHOUETTE_M = 1.75;

/** Ou poser les objets : le bord de la parcelle cote rue, et le point de la parcelle devant lui. */
export interface PlaceEchelle {
  /** Le milieu du bord cote rue, sa direction (unitaire) et la normale vers la rue. */
  milieu: PtBrut;
  direction: PtBrut;
  versRue: PtBrut;
}

const dans = (p: PtBrut, pts: readonly PtBrut[]): boolean => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i] as PtBrut, b = pts[j] as PtBrut;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};

/**
 * Le bord cote rue : le plus long dont l'exterieur, a deux metres, ne tombe dans aucune parcelle
 * voisine ; a defaut (pas de voisinage importe), le plus long bord de la parcelle.
 */
export function placeEchelle(parcelle: readonly PtBrut[], voisines: readonly (readonly PtBrut[])[]): PlaceEchelle | null {
  if (parcelle.length < 3) return null;
  const c = { x: parcelle.reduce((s, p) => s + p.x, 0) / parcelle.length, y: parcelle.reduce((s, p) => s + p.y, 0) / parcelle.length };
  let libre: (PlaceEchelle & { l: number }) | null = null, plusLong: (PlaceEchelle & { l: number }) | null = null;
  parcelle.forEach((a, i) => {
    const b = parcelle[(i + 1) % parcelle.length] as PtBrut;
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < 1e-6) return;
    const d = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let n = { x: d.y, y: -d.x };
    if ((m.x + n.x - c.x) ** 2 + (m.y + n.y - c.y) ** 2 < (m.x - c.x) ** 2 + (m.y - c.y) ** 2) n = { x: -n.x, y: -n.y };
    const bord = { milieu: m, direction: d, versRue: n, l };
    if (!plusLong || l > plusLong.l) plusLong = bord;
    const dehors = { x: m.x + n.x * 2, y: m.y + n.y * 2 };
    if (!voisines.some((v) => v.length >= 3 && dans(dehors, v)) && (!libre || l > libre.l)) libre = bord;
  });
  const choisi = (libre ?? plusLong) as (PlaceEchelle & { l: number }) | null;
  return choisi ? { milieu: choisi.milieu, direction: choisi.direction, versRue: choisi.versRue } : null;
}

/**
 * Pose la voiture dans la rue, garee le long du bord, et la silhouette dans la parcelle, deux metres
 * en retrait. `sol` donne la hauteur du sol en un point du plan (absente : sol plat).
 */
export function poserObjetsEchelle(scene: THREE_NS.Object3D, versLocal: VersLocal, place: PlaceEchelle, sol?: (p: PtBrut) => number): THREE_NS.Group {
  const g = new THREE.Group();
  g.name = 'objets-echelle';
  g.userData[HORS_EXPORT] = true;
  // Le plan a Y au nord, la scene Z au sud : l'axe X de la voiture tourne vers (dx, -dy).
  const angle = Math.atan2(place.direction.y, place.direction.x);
  // La voiture : deux metres dans la rue, decalee d'un metre le long du bord.
  const pv = { x: place.milieu.x + place.versRue.x * 2 + place.direction.x, y: place.milieu.y + place.versRue.y * 2 + place.direction.y };
  const voiture = dessinerVoiture();
  const lv = versLocal(pv);
  voiture.position.set(lv.x, sol ? sol(pv) : 0, lv.z);
  voiture.rotation.y = angle;
  g.add(voiture);
  // La silhouette : deux metres dans la parcelle, deux metres a cote de la voiture.
  const ps = { x: place.milieu.x - place.versRue.x * 2 - place.direction.x * 2, y: place.milieu.y - place.versRue.y * 2 - place.direction.y * 2 };
  const personne = dessinerSilhouette();
  const ls = versLocal(ps);
  personne.position.set(ls.x, sol ? sol(ps) : 0, ls.z);
  personne.rotation.y = angle + Math.PI / 2;
  g.add(personne);
  scene.add(g);
  return g;
}

function dessinerVoiture(): THREE_NS.Group {
  const v = VOITURE;
  const caisse = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.35, metalness: 0.4 });
  const vitre = new THREE.MeshStandardMaterial({ color: 0x2f3a44, roughness: 0.1, metalness: 0.5 });
  const pneu = new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.9 });
  const g = new THREE.Group();
  g.name = 'echelle-voiture';
  const bas = new THREE.Mesh(new THREE.BoxGeometry(v.longueur, v.caisse, v.largeur), caisse);
  bas.position.y = v.garde + v.caisse / 2;
  g.add(bas);
  // La cabine, en retrait de l'avant, ses vitres d'un ton sombre.
  const cabine = new THREE.Mesh(new THREE.BoxGeometry(v.longueur * 0.52, v.cabine, v.largeur * 0.9), vitre);
  cabine.position.set(-v.longueur * 0.06, v.garde + v.caisse + v.cabine / 2, 0);
  g.add(cabine);
  const toit = new THREE.Mesh(new THREE.BoxGeometry(v.longueur * 0.46, 0.05, v.largeur * 0.86), caisse);
  toit.position.set(-v.longueur * 0.06, v.garde + v.caisse + v.cabine + 0.025, 0);
  g.add(toit);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const roue = new THREE.Mesh(new THREE.CylinderGeometry(v.roue, v.roue, 0.22, 16), pneu);
    roue.rotation.x = Math.PI / 2;
    roue.position.set(sx * v.longueur * 0.33, v.roue, sz * (v.largeur / 2 - 0.08));
    g.add(roue);
  }
  return g;
}

function dessinerSilhouette(): THREE_NS.Group {
  const mat = new THREE.MeshStandardMaterial({ color: 0x8794a0, roughness: 0.8 });
  const g = new THREE.Group();
  g.name = 'echelle-silhouette';
  const tete = 0.23, corps = SILHOUETTE_M - tete - 0.82;
  const jambes = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.82, 12), mat);
  jambes.position.y = 0.41;
  g.add(jambes);
  const torse = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, corps, 12), mat);
  torse.position.y = 0.82 + corps / 2;
  g.add(torse);
  const t = new THREE.Mesh(new THREE.SphereGeometry(tete / 2, 16, 12), mat);
  t.position.y = SILHOUETTE_M - tete / 2;
  g.add(t);
  return g;
}
