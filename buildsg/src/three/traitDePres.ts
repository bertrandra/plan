// Le trait renforce de la facade devant vous, de pres (audit de la parcelle, MD/spec-audit.md §12.2 ;
// demande de l'utilisateur du 15 octobre 2026).
//
// A trois metres d'un mur, la facade remplit l'ecran : sous le voile rouge ou vert et la texture, on
// ne reconnait plus ce qu'on a devant soi. Les aretes du batiment vise (angles, bas et haut des
// murs, contours des ouvertures, rives et faitage du toit) se dessinent alors en traits epais et
// sombres, par-dessus le voile sans le cacher ; le trait s'attenue quand on recule
// (app/audit/parcelle/vuePrise.ts::forceDuTrait) et disparait de loin.
//
// Les aretes sont celles des mailles deja posees pour le batiment (EdgesGeometry : une arete ne
// compte que si ses deux faces font un angle franc), calculees une fois par batiment et par scene ;
// seules l'epaisseur et l'opacite suivent la distance. L'epaisseur est en pixels grace aux lignes
// epaisses des exemples de three.js r128 (LineSegments2, LineMaterial), chargees a la demande comme
// l'occlusion ; hors ligne, un trait d'un pixel les remplace. La couleur est le jeton `--trait-3d`.

import { chargerExemple } from './bibliotheque.js';
import { vue3d } from './etat3d.js';
import { HORS_EXPORT } from './primitives.js';
import { racinesDe3d } from './scene.js';
import { JETONS } from '../styles/jetons.js';
import type * as THREE_NS from 'three';

/** Le nom de l'objet dans la scene : il n'y en a jamais qu'un. */
export const NOM_TRAIT_DE_PRES = 'traitDePres';
/** L'epaisseur du trait, en pixels : pleine de pres, fine au moment ou il va disparaitre. */
export const TRAIT_MAX_PX = 3.5;
export const TRAIT_MIN_PX = 1.2;
/** Deux faces qui font moins que cet angle sont un meme plan : leur arete commune ne se dessine pas. */
const ANGLE_ARETE_DEG = 25;
/** Au-dessous de cette force, le trait est retire. */
const FORCE_MIN = 0.02;
/** Une maille plus lourde (des milliers de briques dessinees) n'est pas parcourue : elle figerait l'ecran. */
const SOMMETS_MAX_PAR_MAILLE = 120_000;

/** L'epaisseur (pixels) et l'opacite du trait pour une force de 0 a 1. */
export function apparenceDuTrait(force: number): { largeurPx: number; opacite: number } {
  const f = Math.min(1, Math.max(0, force));
  return { largeurPx: TRAIT_MIN_PX + (TRAIT_MAX_PX - TRAIT_MIN_PX) * f, opacite: 0.3 + 0.65 * f };
}

type MateriauLignes = THREE_NS.ShaderMaterial & { linewidth: number; resolution: THREE_NS.Vector2 };
type ExemplesLignes = {
  LineSegmentsGeometry: new () => THREE_NS.InstancedBufferGeometry & { setPositions(p: Float32Array): unknown };
  LineMaterial: new (p: Record<string, unknown>) => MateriauLignes;
  LineSegments2: new (g: unknown, m: MateriauLignes) => THREE_NS.Mesh;
};

let lignesChargees: Promise<boolean> | null = null;

/** Les lignes epaisses de three.js, chargees une fois, a la demande (comme l'occlusion). */
function chargerLignes(): Promise<boolean> {
  if (lignesChargees) return lignesChargees;
  if (typeof document === 'undefined') return Promise.resolve(false);
  lignesChargees = Promise.all([
    chargerExemple('lines/LineSegmentsGeometry.js', ['LineSegmentsGeometry']),
    chargerExemple('lines/LineMaterial.js', ['LineMaterial']),
    chargerExemple('lines/LineSegments2.js', ['LineSegments2'])
  ]).then(() => true, () => {
    // Hors ligne : un trait fin d'ici la, un nouvel essai au prochain batiment.
    lignesChargees = null;
    return false;
  });
  return lignesChargees;
}

const exemples = (): Partial<ExemplesLignes> => THREE as unknown as Partial<ExemplesLignes>;

/** La couleur du trait : le jeton `--trait-3d` de la page (la palette de l'admin comprise). */
function couleurDuTrait(): string {
  const sombre = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const lue = typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue('--trait-3d').trim() : '';
  return lue || JETONS[sombre ? 'sombre' : 'clair']['trait-3d'];
}

/** Les aretes franches des mailles posees pour ce batiment, dans le repere de la scene. */
export function aretesDe(racines: readonly THREE_NS.Object3D[]): Float32Array {
  const morceaux: Float32Array[] = [];
  let n = 0;
  const v = new THREE.Vector3();
  for (const r of racines) {
    r.updateMatrixWorld(true);
    r.traverse((o) => {
      const m = o as THREE_NS.Mesh;
      if (!(m as { isMesh?: boolean }).isMesh || !m.geometry) return;
      const nb = m.geometry.getAttribute('position')?.count ?? 0;
      if (!nb || nb > SOMMETS_MAX_PAR_MAILLE) return;
      const aretes = new THREE.EdgesGeometry(m.geometry, ANGLE_ARETE_DEG);
      const p = aretes.getAttribute('position');
      const out = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        out[3 * i] = v.x; out[3 * i + 1] = v.y; out[3 * i + 2] = v.z;
      }
      aretes.dispose();
      morceaux.push(out);
      n += out.length;
    });
  }
  const tout = new Float32Array(n);
  let k = 0;
  for (const m of morceaux) { tout.set(m, k); k += m.length; }
  return tout;
}

/** Ce qui est pose : le batiment, la scene, l'objet du trait et sa force, et s'il est epais. */
let pose: { cle: string; scene: THREE_NS.Scene; objet: THREE_NS.Object3D; epais: boolean } | null = null;
let voulu: { cle: string; force: number } | null = null;

function retirer(): void {
  if (!pose) return;
  pose.scene.remove(pose.objet);
  const m = pose.objet as THREE_NS.Mesh;
  m.geometry?.dispose?.();
  (m.material as THREE_NS.Material | undefined)?.dispose?.();
  pose = null;
}

function construire(sc: NonNullable<typeof vue3d.scene>, cle: string): void {
  const positions = aretesDe(racinesDe3d(cle));
  if (!positions.length) return;
  const T = exemples();
  const couleur = new THREE.Color(couleurDuTrait());
  let objet: THREE_NS.Object3D, epais = false;
  if (T.LineSegmentsGeometry && T.LineMaterial && T.LineSegments2) {
    const geo = new T.LineSegmentsGeometry();
    geo.setPositions(positions);
    // Le trait passe juste devant les faces qu'il borde (decalage de profondeur) : sans cela, il se
    // battait avec elles et pointillait. Les aretes cachees par le batiment restent cachees.
    const mat = new T.LineMaterial({ color: couleur, linewidth: TRAIT_MAX_PX, transparent: true, depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    objet = new T.LineSegments2(geo, mat);
    epais = true;
  } else {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    objet = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: couleur, transparent: true, depthTest: true, depthWrite: false }));
    void chargerLignes().then((ok) => {
      // Les lignes epaisses arrivent : le trait se refait, s'il est toujours voulu sur ce batiment.
      if (ok && voulu && pose && !pose.epais && pose.cle === voulu.cle) { const v = voulu; retirer(); poserTraitDePres(v.cle, v.force); }
    });
  }
  objet.name = NOM_TRAIT_DE_PRES;
  objet.userData[HORS_EXPORT] = true;
  // Apres le voile de la facade (997) : le trait reste net, le voile reste visible autour de lui.
  objet.renderOrder = 998;
  objet.frustumCulled = false;
  sc.scene.add(objet);
  pose = { cle, scene: sc.scene, objet, epais };
}

/**
 * Pose, regle ou retire le trait renforce : sur le batiment `cle`, a cette force (0 a 1). `null`, ou
 * une force nulle, le retire. Les aretes ne sont recalculees que si le batiment ou la scene change.
 */
export function poserTraitDePres(cle: string | null, force: number): void {
  const sc = vue3d.scene;
  voulu = cle && force > FORCE_MIN ? { cle, force } : null;
  if (!sc || !voulu || !cle) { retirer(); return; }
  if (!pose || pose.cle !== cle || pose.scene !== sc.scene || !pose.objet.parent) { retirer(); construire(sc, cle); }
  if (!pose) return;
  const { largeurPx, opacite } = apparenceDuTrait(force);
  const mat = (pose.objet as THREE_NS.Mesh).material as THREE_NS.Material & Partial<MateriauLignes>;
  mat.opacity = opacite;
  if (pose.epais && mat.resolution) {
    mat.linewidth = largeurPx;
    const el = sc.renderer.domElement;
    mat.resolution.set(el.clientWidth || 1, el.clientHeight || 1);
  }
}

/** Le trait pose, pour les tests et la fumee : son batiment, sa force et s'il est epais. */
export function traitDePresPose(): { cle: string; force: number; epais: boolean } | null {
  return pose && voulu ? { cle: pose.cle, force: voulu.force, epais: pose.epais } : null;
}
