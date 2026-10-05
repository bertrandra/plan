// La pergola ou le carport en 3D, piece par piece (three/).
//
// Le moteur (engine/pergola.ts) rend des axes et des sections ; chaque piece devient une boite
// orientee sur son axe. La hauteur de la section est tenue dans le plan vertical de la piece : une
// poutre et un chevron sont poses sur chant, un aretier suit la pente. La couverture (toile ou pans)
// est un maillage triangule sur sa projection au sol, qui n'est jamais degeneree : aucun pan n'est
// vertical.

import { calculerPergola, dimsPergola, type Pt3 } from '../engine/pergola.js';
import type * as THREE_NS from 'three';
import type { ObjetPlan } from '../model/types.js';
import type { VersLocal } from './primitives.js';

/** Une piece : une boite de section `b x h`, de `a` a `b`. */
function boite(a: THREE_NS.Vector3, b: THREE_NS.Vector3, larg: number, haut: number, horizontale: THREE_NS.Vector3, mat: THREE_NS.Material): THREE_NS.Mesh {
  const d = new THREE.Vector3().subVectors(b, a);
  const L = d.length();
  d.normalize();
  // Repere de la piece : `d` son axe, `w` sa largeur (horizontale), `h` sa hauteur (dans le plan
  // vertical de l'axe). Une piece verticale (poteau) prend la direction horizontale donnee.
  const w = Math.abs(d.y) > 0.999 ? horizontale.clone() : new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize();
  const h = new THREE.Vector3().crossVectors(d, w).normalize();
  const m = new THREE.Mesh(new THREE.BoxGeometry(larg, haut, L), mat);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(w, h, d));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  return m;
}

/** Un pan plan, triangule sur sa projection au sol. */
function pan(sommets: Pt3[], versLocal: VersLocal, mat: THREE_NS.Material): THREE_NS.Mesh {
  const contour = sommets.map(p => new THREE.Vector2(p.x, p.y));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  const positions: number[] = [];
  sommets.forEach(p => { const l = versLocal(p); positions.push(l.x, p.z, l.z); });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(triangles.flat());
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

export function ajouterPergola3d(scene: THREE_NS.Scene, o: ObjetPlan, versLocal: VersLocal): void {
  const calc = calculerPergola(o);
  if (!calc) return;
  const r = calc.reglages;
  const bois = new THREE.MeshStandardMaterial({ color: r.couleurBois });
  const v3 = (p: Pt3) => { const l = versLocal(p); return new THREE.Vector3(l.x, p.z, l.z); };
  // Les poteaux s'alignent sur le cote de reference, comme le cadre.
  const pts = o.type === 'polygon' ? o.pts : [];
  const ra = pts[r.coteReference], rb = pts[(r.coteReference + 1) % pts.length];
  const horizontale = ra && rb ? new THREE.Vector3().subVectors(v3({ ...rb, z: 0 }), v3({ ...ra, z: 0 })).normalize() : new THREE.Vector3(1, 0, 0);
  const groupe = new THREE.Group();
  groupe.name = 'abri:' + o.key;
  calc.pieces.forEach(p => {
    const s = dimsPergola(p.section);
    // Un poteau est carre ou presque : sa « hauteur » de section est sa seconde largeur.
    groupe.add(boite(v3(p.a), v3(p.b), s.b, s.h, horizontale, bois));
  });
  const toile = r.toit === 'toile';
  const matCouverture = new THREE.MeshStandardMaterial({ color: toile ? r.couleurToile : r.couleurCouverture, side: THREE.DoubleSide });
  // Une toile laisse passer un peu de jour ; une couverture non.
  if (toile) { matCouverture.transparent = true; matCouverture.opacity = 0.85; }
  calc.pans.forEach(sommets => groupe.add(pan(sommets, versLocal, matCouverture)));
  scene.add(groupe);
}
