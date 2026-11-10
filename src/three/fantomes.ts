// Les batiments qui cachent le batiment choisi (mode Toit de la Vue 3D) : ils perdent leur volume et ne gardent que leur contour en
// pointillé. La transparence seule etait illisible — les volumes se melangent ; le contour dit ou est le voisin sans cacher ce qu'on edite.
//
// Des rayons partent de la camera vers des points du batiment choisi ; le premier autre batiment touche devient « fantome » : ses mailles
// sont masquees, et un trait pointille en reprend les aretes. Le batiment choisi reste touchable a travers (un maillage masque ne se touche
// pas : three/scene.ts::objetSousLePointeur ne regarde que ce qui est visible). Recalcule quand la camera bouge.

import type * as THREE_NS from 'three';
import type { SceneVue3d } from './etat3d.js';

interface Fantome { maille: THREE_NS.Mesh; trait: THREE_NS.LineSegments }

const fantomes: Fantome[] = [];
/** Un angle d'arete plus faible n'est pas une arete : le pointille ne dessine que les contours nets. */
const ANGLE_ARETE_DEG = 28;
const COULEUR_TRAIT = 0x555555;

/** Rend leur volume aux batiments masques et retire leurs contours. */
export function viderFantomes(): void {
  for (const f of fantomes.splice(0)) {
    f.maille.visible = true;
    f.trait.parent?.remove(f.trait);
    f.trait.geometry.dispose();
    (f.trait.material as THREE_NS.Material).dispose();
  }
}

const visible = (o: THREE_NS.Object3D): boolean => { for (let x: THREE_NS.Object3D | null = o; x; x = x.parent) if (!x.visible) return false; return true; };

/** Les points du volume du batiment que l'on veut voir : trois colonnes, deux hauteurs, deux profondeurs, comme la maquette. */
function pointsVises(boite: THREE_NS.Box3): THREE_NS.Vector3[] {
  const c = boite.getCenter(new THREE.Vector3()), t = boite.getSize(new THREE.Vector3()), pts: THREE_NS.Vector3[] = [];
  for (const a of [-0.35, 0, 0.35]) for (const b of [0.15, 0.55]) for (const d of [-0.35, 0.35]) pts.push(new THREE.Vector3(c.x + a * t.x, boite.min.y + b * t.y, c.z + d * t.z));
  return pts;
}

/**
 * Recalcule les fantomes : ceux de `autres` (cle -> racines posees par la scene) qui cachent le batiment `cle`. `actif` faux : tout est rendu.
 * Les mailles instanciees (les arbres) ne sont jamais des fantomes.
 */
export function majFantomes(sc: SceneVue3d, racinesVisees: readonly THREE_NS.Object3D[], autres: ReadonlyMap<string, readonly THREE_NS.Object3D[]>, actif: boolean): string[] {
  viderFantomes();
  if (!actif || !racinesVisees.length) return [];
  const boite = new THREE.Box3();
  racinesVisees.forEach((r) => boite.expandByObject(r));
  if (boite.isEmpty()) return [];
  const proprietaire = new Map<THREE_NS.Object3D, string>();
  for (const [cle, racines] of autres) for (const r of racines) proprietaire.set(r, cle);
  const visees = new Set<THREE_NS.Object3D>(racinesVisees);
  /** Le batiment auquel appartient une maille : 'cible' pour le batiment choisi, la cle d'un autre batiment, ou null (sol, cloture, arbre…). */
  const de = (m: THREE_NS.Object3D): string | null => {
    for (let o: THREE_NS.Object3D | null = m; o; o = o.parent) { if (visees.has(o)) return '\0cible'; const cle = proprietaire.get(o); if (cle) return cle; }
    return null;
  };
  const cacheurs = new Set<string>();
  const rayon = new THREE.Raycaster();
  const oeil = sc.camera.position;
  for (const p of pointsVises(boite)) {
    rayon.set(oeil, p.clone().sub(oeil).normalize());
    for (const t of rayon.intersectObjects(sc.scene.children, true)) {
      const m = t.object as THREE_NS.Mesh;
      if (!m.isMesh || (m as THREE_NS.InstancedMesh).isInstancedMesh || !visible(m)) continue;
      const cle = de(m);
      // Le premier batiment touche decide : le choisi (rien ne le cache) ou un autre (il le cache). Le reste (cloture, sol) ne compte pas.
      if (cle === null) continue;
      if (cle !== '\0cible') cacheurs.add(cle);
      break;
    }
  }
  for (const cle of cacheurs) {
    for (const racine of autres.get(cle) ?? []) {
      racine.traverse((o) => {
        const m = o as THREE_NS.Mesh;
        if (!m.isMesh || (m as THREE_NS.InstancedMesh).isInstancedMesh || !m.visible || !m.parent) return;
        const trait = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, ANGLE_ARETE_DEG), new THREE.LineDashedMaterial({ color: COULEUR_TRAIT, dashSize: 0.4, gapSize: 0.3 }));
        trait.computeLineDistances();
        trait.matrixAutoUpdate = false;
        m.updateMatrix();
        trait.matrix.copy(m.matrix);
        m.parent.add(trait);
        m.visible = false;
        fantomes.push({ maille: m, trait });
      });
    }
  }
  return [...cacheurs];
}
