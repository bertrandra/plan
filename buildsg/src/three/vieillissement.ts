// Le vieillissement des facades (MD/roadmap-realisme-3d.md, R3) : coulures sous les appuis,
// salissure au pied des murs, descentes d'eau pluviale.
//
// Ce qui fait qu'un mur a vecu : l'eau qui ruisselle de l'appui laisse une trainee, le rejaillissement
// de la pluie grise le pied du mur, une descente de zinc court de la gouttiere au sol. Ce sont des
// voiles et des tubes poses sur les murs, a l'ecran seulement (HORS_EXPORT), sur les batiments
// proches, hors qualite Econome.

import type * as THREE_NS from 'three';
import { Batisseur, type S3 } from './batisseur.js';
import type { BaieRelief, Point3 } from './fenetresRelief.js';
import { APPUI, ENCADREMENT } from './fenetresRelief.js';
import { HORS_EXPORT, SANS_OMBRE } from './primitives.js';

/** La trainee sous un appui : sa longueur, sa largeur rapportee a la baie, sa teinte. */
export const COULURE = { longueur: 0.7, largeur: 0.8 } as const;
/** La salissure au pied du mur : jusqu'ou elle monte au-dessus du soubassement. */
export const SALISSURE_M = 0.55;
/** La descente d'eau pluviale : son rayon, son ecart au mur. */
export const DESCENTE = { rayon: 0.045, ecart: 0.12 } as const;
const S_VOILE = 0.006;

/**
 * Un degrade vertical, opaque en haut et transparent en bas (ou l'inverse) : la carte de transparence
 * des voiles. Dessine une fois.
 */
let degrade: THREE_NS.Texture | null = null;
function textureDegrade(): THREE_NS.Texture | null {
  if (degrade) return degrade;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  const d = g.createLinearGradient(0, 0, 0, 64);
  // Le haut de l'image (v = 1) est le haut du voile. `alphaMap` lit le canal vert : le degrade va
  // donc du blanc (opaque) au noir (transparent), pas d'une transparence a l'autre.
  d.addColorStop(0, '#ffffff');
  d.addColorStop(1, '#000000');
  g.fillStyle = d;
  g.fillRect(0, 0, 4, 64);
  degrade = new THREE.CanvasTexture(c);
  return degrade;
}

/** Un voile rectangulaire du mur, de `y0` (transparent) a `y1` (opaque), ou l'inverse si `versLeBas`. */
function voile(b: Batisseur, pt: Point3, x0: number, x1: number, y0: number, y1: number, opaqueEnHaut: boolean): void {
  const [vb, vh] = opaqueEnHaut ? [0, 1] : [1, 0];
  const q = (x: number, y: number): S3 => pt(x, y, S_VOILE);
  b.quad(q(x0, y0), q(x1, y0), q(x1, y1), q(x0, y1), [0, vb, 1, vb, 1, vh, 0, vh]);
}

/** Les coulures sous les appuis d'un mur. */
export function poserCoulures(b: Batisseur, pt: Point3, baies: readonly BaieRelief[]): void {
  baies.forEach((o) => {
    // Une porte n'a pas d'appui : sa baie part du sol.
    if (o.y < 0.3) return;
    const l = o.l * COULURE.largeur, x0 = o.x + (o.l - l) / 2;
    const haut = o.y - APPUI.hauteur, bas = Math.max(0.05, haut - COULURE.longueur);
    voile(b, pt, x0, x0 + l, bas, haut, true);
  });
}

/** La salissure au pied d'un mur : opaque en bas, elle s'efface en montant. */
export function poserSalissure(b: Batisseur, pt: Point3, largeur: number, depuis: number): void {
  voile(b, pt, 0, largeur, depuis, depuis + SALISSURE_M, false);
}

/** Les materiaux des voiles : une teinte sombre, transparente, qui ne masque pas ce qui est derriere. */
export function materiauxVoiles(): { coulure: THREE_NS.MeshStandardMaterial; salissure: THREE_NS.MeshStandardMaterial } {
  const alpha = textureDegrade();
  const faire = (couleur: number, opacite: number) => new THREE.MeshStandardMaterial({
    color: couleur, transparent: true, opacity: opacite, depthWrite: false, roughness: 1,
    ...(alpha ? { alphaMap: alpha } : {}),
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  return { coulure: faire(0x3d3a33, 0.22), salissure: faire(0x4a4337, 0.32) };
}

/** Les maillages des voiles d'un batiment, hors export, sans ombre. */
export function maillageVoiles(coulures: Batisseur, salissure: Batisseur): THREE_NS.Group | null {
  if (coulures.vide && salissure.vide) return null;
  const m = materiauxVoiles();
  const g = new THREE.Group();
  g.name = 'batiment-vieillissement';
  g.userData[HORS_EXPORT] = true;
  for (const [b, mat, nom] of [[coulures, m.coulure, 'coulures'], [salissure, m.salissure, 'salissure']] as const) {
    if (b.vide) continue;
    b.groupe(0);
    const maille = b.maillage([mat], 'vieillissement-' + nom);
    maille.renderOrder = 2;
    maille.userData[SANS_OMBRE] = true;
    g.add(maille);
  }
  return g;
}

/**
 * Les descentes d'eau pluviale : aux deux bouts du plus long mur (la gouttiere y court sous l'egout),
 * un tube de zinc de l'egout au sol, ecarte du mur. `bouts` en coordonnees de la scene, `normale` du
 * mur vers dehors.
 */
export function poserDescentes(groupe: THREE_NS.Object3D, bouts: readonly { x: number; z: number }[], normale: { x: number; z: number }, hauteur: number, base: number): void {
  if (hauteur - base < 1.5) return;
  const mat = new THREE.MeshStandardMaterial({ color: 0x8e9499, roughness: 0.45, metalness: 0.35 });
  const g = new THREE.Group();
  g.name = 'batiment-descentes';
  g.userData[HORS_EXPORT] = true;
  bouts.forEach((p) => {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(DESCENTE.rayon, DESCENTE.rayon, hauteur - base, 8), mat);
    tube.position.set(p.x + normale.x * DESCENTE.ecart, (hauteur + base) / 2, p.z + normale.z * DESCENTE.ecart);
    g.add(tube);
  });
  groupe.add(g);
}

/** La largeur de l'encadrement, pour garder une descente a l'ecart d'une baie posee au bout du mur. */
export const ECART_DESCENTE_BAIE = ENCADREMENT.largeur + 0.1;
