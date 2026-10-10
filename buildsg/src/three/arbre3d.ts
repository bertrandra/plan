// Un arbre en 3D (MD/spec-arbres-3d.md) : un tronc, des branches, un houppier en lobes.
//
// Le plan donne le tronc (son cercle, sa hauteur) et le houppier vient de model/arbre.ts : des
// ellipsoides qui se chevauchent, selon le port de l'arbre, tires de sa cle. Ici, chaque lobe
// devient une sphere deformee - un bruit radial lui ote sa rondeur de ballon - et coloree sommet
// par sommet en deux tons, le dessus clair et le dessous sombre, pour que le volume se lise meme
// sans ombre. Un conifere est un cone. Le feuillage d'un caduc est masque de novembre a mars, a la
// date de l'etude d'ensoleillement (`actualiserSaison`) : l'ombre portee sur la terrasse change avec
// la saison, et c'est bien pour cela qu'on dessine l'arbre.
//
// Rien n'est charge : pas d'image, pas de modele. L'export GLB emporte l'arbre tel qu'il est vu.

import type * as THREE_NS from 'three';
import { arbreNu, essenceDe, houppierDe, portDe, feuillesDuHouppier, tonDuSommet, COULEUR_FEUILLAGE_DEFAUT, COULEUR_TRONC_DEFAUT, type EssenceArbre } from '../model/arbre.js';
import { ajouterFeuilles } from './feuilles.js';

export { tonDuSommet, TON_CLAIR, TON_SOMBRE } from '../model/arbre.js';
import { graineDe, tirage } from '../model/voisinage3d.js';
import { appliquerOpacite, urlTexture, type VersLocal } from './primitives.js';
import type { ObjetPlan } from '../model/types.js';

export const NOM_ARBRE = 'arbre';
export const NOM_TRONC = 'arbre-tronc';
export const NOM_BRANCHE = 'arbre-branche';
export const NOM_FEUILLAGE = 'arbre-feuillage';
export const NOM_LOBE = 'arbre-lobe';
/** Amplitude du bruit radial des lobes, en part du rayon. */
export const BRUIT_LOBE = 0.07;
export interface ContexteArbre {
  /** La scene, ou un groupe pose sur le sol en relief. */
  scene: THREE_NS.Object3D;
  toLocal: VersLocal;
  textures: boolean;
  chargerTexture?: (url: string) => THREE_NS.Texture;
  /** La date de l'etude d'ensoleillement (AAAA-MM-JJ) : un caduc y est nu de novembre a mars. */
  dateStr: string | null;
  opacite?: number | undefined;
}

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m?.[1] ? parseInt(m[1], 16) : 0x4a7c3a;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Deforme une sphere unite par un bruit radial reproductible et la colore en deux tons. */
function habillerLobe(geo: THREE_NS.BufferGeometry, base: [number, number, number], graine: number): void {
  const pos = geo.attributes.position as THREE_NS.BufferAttribute;
  const nor = geo.attributes.normal as THREE_NS.BufferAttribute;
  const alea = tirage(graine);
  const p = pos.array as Float32Array;
  const n = nor.array as Float32Array;
  const couleurs: number[] = [];
  for (let i = 0; i < p.length; i += 3) {
    const k = 1 + (alea() * 2 - 1) * BRUIT_LOBE;
    p[i] = (p[i] ?? 0) * k;
    p[i + 1] = (p[i + 1] ?? 0) * k;
    p[i + 2] = (p[i + 2] ?? 0) * k;
    couleurs.push(...tonDuSommet(base, n[i + 1] ?? 0));
  }
  pos.needsUpdate = true;
  geo.setAttribute('color', new THREE.Float32BufferAttribute(couleurs, 3));
}

/** Oriente un cylindre vertical (axe y) le long de `d` (unitaire). */
function orienterSelon(mesh: THREE_NS.Object3D, d: { x: number; y: number; z: number }): void {
  // Le quaternion qui amene (0,1,0) sur d : axe = up x d, w = 1 + up . d.
  const w = 1 + d.y;
  if (w < 1e-6) { mesh.quaternion.set(1, 0, 0, 0); return; }
  const x = -d.z, y = 0, z = d.x;
  const l = Math.hypot(x, y, z, w);
  mesh.quaternion.set(x / l, y / l, z / l, w / l);
}

/**
 * Pose un arbre : le tronc de `hTronc` metres et de `rayonTronc` metres au pied, puis le houppier
 * au-dessus. Rend le groupe, nomme `arbre`, qui porte l'essence dans `userData` pour la saison.
 */
export function ajouterArbre3d(ctx: ContexteArbre, o: ObjetPlan, hTronc: number, rayonTronc: number): THREE_NS.Group {
  const centre = o.type === 'circle' ? o.center : { x: 0, y: 0 };
  const pl = ctx.toLocal(centre);
  const groupe = new THREE.Group();
  groupe.name = NOM_ARBRE;
  groupe.position.set(pl.x, 0, pl.z);
  const essence: EssenceArbre = essenceDe(o);
  groupe.userData.essence = essence;
  const graine = graineDe(o.key);
  const h = houppierDe(o);
  const rt = Math.max(0.04, rayonTronc);

  const matBois = new THREE.MeshStandardMaterial({ color: COULEUR_TRONC_DEFAUT, roughness: 0.95 });
  appliquerOpacite(matBois, ctx.opacite);
  const tronc = new THREE.Mesh(new THREE.CylinderGeometry(rt * 0.7, rt, Math.max(0.05, hTronc), 10), matBois);
  tronc.name = NOM_TRONC;
  tronc.position.set(0, hTronc / 2, 0);
  groupe.add(tronc);
  for (const b of h.branches) {
    const dx = b.a.x - b.de.x, dy = b.a.y - b.de.y, dz = b.a.z - b.de.z;
    const l = Math.hypot(dx, dy, dz);
    if (l < 0.05) continue;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(b.rayon * 0.6, b.rayon, l, 6), matBois);
    m.name = NOM_BRANCHE;
    m.position.set((b.de.x + b.a.x) / 2, hTronc + (b.de.y + b.a.y) / 2, (b.de.z + b.a.z) / 2);
    orienterSelon(m, { x: dx / l, y: dy / l, z: dz / l });
    groupe.add(m);
  }

  const feuillage = new THREE.Group();
  feuillage.name = NOM_FEUILLAGE;
  feuillage.position.set(0, hTronc, 0);
  feuillage.visible = !arbreNu(essence, ctx.dateStr);
  const base = rgb(o.couleurArbre || COULEUR_FEUILLAGE_DEFAUT);
  const matFeuille = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85 });
  appliquerOpacite(matFeuille, ctx.opacite);
  const url = ctx.textures ? urlTexture(o.textureArbre) : undefined;
  if (url && ctx.chargerTexture) matFeuille.map = ctx.chargerTexture(url);
  if (portDe(o) === 'conique') {
    const lobe = h.lobes[0];
    if (lobe) {
      const geo = new THREE.ConeGeometry(lobe.rx, lobe.ry * 2, 16, 1);
      habillerLobe(geo, base, graine);
      const cone = new THREE.Mesh(geo, matFeuille);
      cone.name = NOM_LOBE;
      cone.position.set(0, lobe.y, 0);
      feuillage.add(cone);
    }
  } else {
    h.lobes.forEach((lobe, i) => {
      const geo = new THREE.SphereGeometry(1, 14, 10);
      habillerLobe(geo, base, graine + i * 7919);
      const m = new THREE.Mesh(geo, matFeuille);
      m.name = NOM_LOBE;
      m.position.set(lobe.x, lobe.y, lobe.z);
      m.scale.set(lobe.rx, lobe.ry, lobe.rz);
      feuillage.add(m);
    });
  }
  // De pres, des feuilles sur la surface des lobes (three/feuilles.ts) ; dans le feuillage, elles
  // tombent avec lui en hiver.
  ajouterFeuilles(feuillage, feuillesDuHouppier(h, portDe(o), graine), base);
  groupe.add(feuillage);
  ctx.scene.add(groupe);
  return groupe;
}

/** Montre ou masque le feuillage de chaque arbre de la scene selon la date : un caduc est nu de novembre a mars. */
export function actualiserSaison(scene: THREE_NS.Object3D, dateStr: string | null): number {
  let changes = 0;
  scene.traverse((obj) => {
    if (obj.name !== NOM_FEUILLAGE || !obj.parent) return;
    const essence = obj.parent.userData.essence as EssenceArbre | undefined;
    if (!essence) return;
    const visible = !arbreNu(essence, dateStr);
    if (obj.visible !== visible) { obj.visible = visible; changes++; }
  });
  return changes;
}
