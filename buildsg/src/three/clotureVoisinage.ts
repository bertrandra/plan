// Les clotures du voisinage en 3D : une option d'affichage de la Vue 3D, decochee par defaut.
//
// La cloture detaillee (three/cloture3d.ts) appartient a la parcelle du projet, avec ses acces et
// ses matieres (decision produit : une parcelle voisine ne porte ni cloture ni lieu). Pour situer
// le projet dans sa rue, l'option pose un grillage leger, generique, sur les limites des parcelles
// voisines : une seule maille pour tout le voisinage — deux mille parcelles en panneaux separes
// ne tiendraient pas — et rien n'est ecrit dans le projet.
//
// Une limite commune a deux voisines n'est posee qu'une fois. Une limite commune avec la parcelle
// du projet ne l'est pas quand celle-ci a sa propre cloture : les deux se disputeraient le meme mur.

import type * as THREE_NS from 'three';
import type { ObjetPlan, PtBrut } from '../model/types.js';
import { aDesSommets } from '../model/formes.js';
import { parcelleDuProjet } from '../model/fonctions.js';
import { clotureDe, DEFAUTS_PAR_TYPE } from '../model/cloture.js';
import { distancePointContour } from '../geometry/proximite.js';
import { sommetDe } from '../geometry/anneau.js';
import { SANS_OMBRE, type VersLocal } from './primitives.js';

/** La hauteur du grillage, en metres : celle d'un grillage de jardin. */
export const HAUTEUR_CLOTURE_VOISINAGE_M = DEFAUTS_PAR_TYPE.grillage.hauteur;
/**
 * Sa couleur : un gris vert clair. Le gris du grillage de la parcelle, sur l'orthophoto sombre et
 * vu de loin, faisait de chaque limite un trait noir — encore des lignes de bande dessinee.
 */
const COULEUR = '#a9b2a6';
/** Un grillage se voit au travers : le panneau est translucide, a peine. */
const OPACITE = 0.3;
/** Deux sommets plus proches que cela sont le meme : les parcelles voisines partagent leurs sommets cadastraux. */
const ARRONDI_M = 0.2;
/** Une limite a moins de cela du contour de la parcelle du projet lui est commune. */
const TOLERANCE_COMMUNE_M = 0.5;
/** Sur un sol en relief, un panneau ne depasse pas cette longueur : il suit la pente. */
export const PAS_RELIEF_M = 3;

/** Un troncon de limite, dans le plan. */
export interface Limite { a: PtBrut; b: PtBrut }

/**
 * Les limites a cloturer : les cotes des parcelles voisines visibles, chacun une fois (dans un sens
 * fixe, pour que deux panneaux confondus soient eclaires pareil), sans ceux qui longent la parcelle
 * du projet quand elle est cloturee.
 */
export function limitesDuVoisinage(objets: readonly ObjetPlan[], masque: (o: ObjetPlan) => boolean): Limite[] {
  const projet = parcelleDuProjet(objets as ObjetPlan[]);
  const contourProjet = projet && aDesSommets(projet) && clotureDe(projet).active ? projet.pts : null;
  const vues = new Set<string>();
  const cle = (p: PtBrut) => Math.round(p.x / ARRONDI_M) + ':' + Math.round(p.y / ARRONDI_M);
  const out: Limite[] = [];
  for (const o of objets) {
    if (o === projet || o.fonction !== 'terrain' || masque(o) || !aDesSommets(o) || o.pts.length < 3) continue;
    o.pts.forEach((p, i) => {
      const q = sommetDe(o.pts, i + 1);
      if (Math.hypot(q.x - p.x, q.y - p.y) < 0.05) return;
      const [a, b] = p.x < q.x || (p.x === q.x && p.y < q.y) ? [p, q] : [q, p];
      const k = cle(a) + '|' + cle(b);
      if (vues.has(k)) return;
      vues.add(k);
      if (contourProjet && distancePointContour(a, contourProjet) < TOLERANCE_COMMUNE_M && distancePointContour(b, contourProjet) < TOLERANCE_COMMUNE_M) return;
      out.push({ a, b });
    });
  }
  return out;
}

/**
 * Pose le grillage sur ces limites, en une maille. `sol` : la hauteur du sol en un point du plan
 * (relief) ; absent, le grillage part de zero.
 */
export function ajouterClotureVoisinage(scene: THREE_NS.Object3D, versLocal: VersLocal, limites: readonly Limite[], sol?: (p: PtBrut) => number): THREE_NS.Mesh | null {
  if (!limites.length) return null;
  const pos: number[] = [];
  const idx: number[] = [];
  const h = HAUTEUR_CLOTURE_VOISINAGE_M;
  for (const { a, b } of limites) {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const n = sol ? Math.max(1, Math.ceil(L / PAS_RELIEF_M)) : 1;
    for (let k = 0; k < n; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
      const q = { x: a.x + ((b.x - a.x) * (k + 1)) / n, y: a.y + ((b.y - a.y) * (k + 1)) / n };
      const yp = sol ? sol(p) : 0,
        yq = sol ? sol(q) : 0;
      const lp = versLocal(p),
        lq = versLocal(q);
      const i0 = pos.length / 3;
      pos.push(lp.x, yp, lp.z, lq.x, yq, lq.z, lq.x, yq + h, lq.z, lp.x, yp + h, lp.z);
      idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Translucide et sans ecriture de profondeur : vu d'en haut, les grillages se croisent sans se trouer.
  const mat = new THREE.MeshStandardMaterial({ color: COULEUR, roughness: 0.6, metalness: 0.3, transparent: true, opacity: OPACITE, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'cloture-voisinage';
  // Un grillage ne porte pas d'ombre pleine : sans cela, chaque parcelle serait cernee d'un mur d'ombre.
  m.userData[SANS_OMBRE] = true;
  scene.add(m);
  return m;
}
