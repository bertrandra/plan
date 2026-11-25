// Le nom des rues au sol de la Vue 3D (MD/spec-rues.md).
//
// Les memes etiquettes que le plan (model/rues.ts), peintes sur des plaques couchees au ras du sol,
// dans le sens de la voie : on les lit en survolant le quartier comme sur un plan. Une image par nom,
// partagee par toutes ses etiquettes. Elles ne portent ni ne recoivent d'ombre, et ne cachent rien :
// elles ne s'ecrivent pas dans le tampon de profondeur.

import type * as THREE_NS from 'three';
import { etiquettesDesRues } from '../model/rues.js';
import { SANS_OMBRE, poserEnCouche, COUCHES_SOL, type VersLocal } from './primitives.js';
import { DECALAGE_CHAUSSEE_M } from './chaussees3d.js';
import type { RueVoisine, PtBrut } from '../model/types.js';
import type { Emprise } from '../model/relief.js';

export const NOM_RUE_3D = 'rue-nom';
/** La hauteur d'un nom au sol, en metres, et sa hauteur au-dessus du sol. */
export const HAUTEUR_NOM_RUE_3D_M = 3.2;
const AU_DESSUS_DU_SOL_M = 0.08;
/** La hauteur de l'image d'un nom, en pixels. */
const HAUTEUR_IMAGE_PX = 64;

/** L'image d'un nom : le texte clair cerne de sombre, lisible sur l'enrobe comme sur l'orthophoto. */
function imageDuNom(doc: Document, nom: string): { canvas: HTMLCanvasElement; rapport: number } | null {
  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const police = 'italic 600 ' + Math.round(HAUTEUR_IMAGE_PX * 0.62) + 'px system-ui, sans-serif';
  ctx.font = police;
  const largeur = Math.ceil(ctx.measureText(nom).width) + 24;
  canvas.width = largeur;
  canvas.height = HAUTEUR_IMAGE_PX;
  ctx.font = police;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(40,34,26,0.7)';
  ctx.strokeText(nom, largeur / 2, HAUTEUR_IMAGE_PX / 2);
  ctx.fillStyle = 'rgba(255,253,246,0.95)';
  ctx.fillText(nom, largeur / 2, HAUTEUR_IMAGE_PX / 2);
  return { canvas, rapport: largeur / HAUTEUR_IMAGE_PX };
}

/** Ce que la pose demande en plus des rues. */
export interface OptionsRues3d {
  /** Le sol en relief en un point du plan ; sans lui, le sol est a zero. */
  hauteurSol?: ((p: PtBrut) => number) | undefined;
  /** Le sol dessine, dans le repere du plan : les rues y sont decoupees, un nom hors du sol flotterait dans le vide. */
  cadre?: Emprise | undefined;
  doc?: Document;
  /**
   * Les rues sont dessinees (option « Rues », three/chaussees3d.ts) : chaque plaque se couche sur le ruban, inclinee dans le sens de
   * la pente (le sol lu aux deux bouts du nom), au-dessus de lui et devant lui au test de profondeur.
   */
  surChaussees?: boolean;
}

/** La couche de profondeur des noms poses sur les rues dessinees : juste au-dessus de celle des chemins, ou est le ruban. */
const COUCHE_NOM_SUR_CHAUSSEE = COUCHES_SOL.chemin + 1;

/** Pose le nom des rues dans `scene`. Rend le nombre d'etiquettes posees. */
export function ajouterNomsDesRues3d(scene: THREE_NS.Object3D, versLocal: VersLocal, rues: readonly RueVoisine[], options: OptionsRues3d = {}): number {
  const { hauteurSol, cadre, surChaussees } = options;
  const doc = options.doc ?? document;
  const images = new Map<string, { materiau: THREE_NS.MeshBasicMaterial; rapport: number } | null>();
  let posees = 0;
  for (const e of etiquettesDesRues(rues, cadre)) {
    if (!images.has(e.nom)) {
      const img = imageDuNom(doc, e.nom);
      const materiau = img ? new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(img.canvas), transparent: true, depthWrite: false }) : null;
      if (materiau && surChaussees) poserEnCouche(materiau, COUCHE_NOM_SUR_CHAUSSEE);
      images.set(e.nom, img && materiau ? { materiau, rapport: img.rapport } : null);
    }
    const im = images.get(e.nom);
    if (!im) continue;
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(HAUTEUR_NOM_RUE_3D_M * im.rapport, HAUTEUR_NOM_RUE_3D_M), im.materiau);
    plaque.name = NOM_RUE_3D;
    plaque.userData[SANS_OMBRE] = true;
    const l = versLocal(e);
    const longueur = HAUTEUR_NOM_RUE_3D_M * im.rapport;
    if (surChaussees && hauteurSol) {
      // Sur le ruban : la plaque suit la pente de la voie, le sol lu aux deux bouts du nom, et passe au-dessus du ruban.
      const a = (e.angleDeg * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a);
      const h0 = hauteurSol({ x: e.x - ux * longueur / 2, y: e.y - uy * longueur / 2 }), h1 = hauteurSol({ x: e.x + ux * longueur / 2, y: e.y + uy * longueur / 2 });
      plaque.position.set(l.x, (h0 + h1) / 2 + DECALAGE_CHAUSSEE_M + AU_DESSUS_DU_SOL_M, l.z);
      // Les axes de la plaque dans la scene : x le long de la voie (montant avec elle), z sa normale, y en travers.
      const u = new THREE.Vector3(ux * longueur, h1 - h0, -uy * longueur).normalize();
      const n = new THREE.Vector3(0, 1, 0).addScaledVector(u, -u.y).normalize();
      const v = new THREE.Vector3().crossVectors(n, u);
      plaque.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n));
    } else {
      plaque.position.set(l.x, (hauteurSol ? hauteurSol(e) : 0) + AU_DESSUS_DU_SOL_M, l.z);
      // Couchee face au ciel, puis tournee dans le sens de la voie (le plan a son y vers le nord, la scene son z vers le sud).
      plaque.rotation.set(-Math.PI / 2, 0, (e.angleDeg * Math.PI) / 180);
    }
    plaque.renderOrder = 2;
    scene.add(plaque);
    posees++;
  }
  return posees;
}
