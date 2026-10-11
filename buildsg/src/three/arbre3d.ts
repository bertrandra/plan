// Un arbre en 3D (MD/spec-arbres-3d.md) : un tronc et un houppier, dans l'un des cinq dessins
// (three/houppiers3d.ts) choisis pour tous les arbres du plan ; ci-dessous, le dessin en lobes.
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
import { arbreNu, essenceDe, houppierDe, portDe, diametreDe, feuillesDuHouppier, COULEUR_FEUILLAGE_DEFAUT, COULEUR_TRONC_DEFAUT, STYLE_ARBRE_DEFAUT, type EssenceArbre, type StyleArbre } from '../model/arbre.js';
import { lobesOrigine, lobesDome, touffes, volumesTailles, volumeArchitecte } from './houppiers3d.js';
import { ajouterFeuilles } from './feuilles.js';

export { tonDuSommet, TON_CLAIR, TON_SOMBRE } from '../model/arbre.js';
import { graineDe } from '../model/voisinage3d.js';
import { appliquerOpacite, urlTexture, type VersLocal } from './primitives.js';
import type { ObjetPlan } from '../model/types.js';

export const NOM_ARBRE = 'arbre';
export const NOM_TRONC = 'arbre-tronc';
export const NOM_BRANCHE = 'arbre-branche';
export const NOM_FEUILLAGE = 'arbre-feuillage';
export const NOM_LOBE = 'arbre-lobe';
/** Amplitude du bruit radial des lobes, en part du rayon. */
export const BRUIT_LOBE = 0.07;
/** Le tronc gris-brun d'un arbre de maquette (dessin E). */
export const COULEUR_TRONC_MAQUETTE = '#8a7a64';
export interface ContexteArbre {
  /** La scene, ou un groupe pose sur le sol en relief. */
  scene: THREE_NS.Object3D;
  toLocal: VersLocal;
  textures: boolean;
  chargerTexture?: (url: string) => THREE_NS.Texture;
  /** La date de l'etude d'ensoleillement (AAAA-MM-JJ) : un caduc y est nu de novembre a mars. */
  dateStr: string | null;
  opacite?: number | undefined;
  /** Le dessin des arbres du plan (model/arbre.ts::styleDesArbres) ; absent : le dome (STYLE_ARBRE_DEFAUT). */
  style?: StyleArbre;
}

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m?.[1] ? parseInt(m[1], 16) : 0x4a7c3a;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
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
 * Le tronc des dessins B a E, a l'echelle du houppier : 9 % de son diametre en rayon (5 % pour une
 * maquette), jamais plus que le cercle du plan, qui est le tronc (sauf pour un arbre estime, ou il
 * est le houppier). Moitie moins epais, il paraissait trop fin a cote du houppier.
 */
const rayonTroncFin = (rayonTronc: number, diametre: number, style: StyleArbre) =>
  Math.max(0.05, Math.min(rayonTronc, diametre * (style === 'architecte' ? 0.05 : 0.09)));

/**
 * Pose un arbre : le tronc de `hTronc` metres et de `rayonTronc` metres au pied, puis le houppier
 * au-dessus, dans le dessin `ctx.style` (le meme pour tous les arbres du plan). Rend le groupe, nomme
 * `arbre`, qui porte l'essence dans `userData` pour la saison.
 */
export function ajouterArbre3d(ctx: ContexteArbre, o: ObjetPlan, hTronc: number, rayonTronc: number): THREE_NS.Group {
  const style: StyleArbre = ctx.style ?? STYLE_ARBRE_DEFAUT;
  const centre = o.type === 'circle' ? o.center : { x: 0, y: 0 };
  const pl = ctx.toLocal(centre);
  const groupe = new THREE.Group();
  groupe.name = NOM_ARBRE;
  groupe.position.set(pl.x, 0, pl.z);
  const essence: EssenceArbre = essenceDe(o);
  groupe.userData.essence = essence;
  groupe.userData.style = style;
  const graine = graineDe(o.key);
  const port = portDe(o), diametre = diametreDe(o);
  const h = houppierDe(o, style === 'dome' || style === 'taille');
  const origine = style === 'actuel';

  const matBois = new THREE.MeshStandardMaterial({ color: style === 'architecte' ? COULEUR_TRONC_MAQUETTE : COULEUR_TRONC_DEFAUT, roughness: 0.95 });
  appliquerOpacite(matBois, ctx.opacite);
  const rt = origine ? Math.max(0.04, rayonTronc) : rayonTroncFin(rayonTronc, diametre, style);
  // Le tronc d'une maquette entre dans le houppier : sans feuilles autour, il ne s'arrete pas net dessous.
  const hFut = Math.max(0.05, hTronc + (style === 'architecte' ? h.hauteur * 0.3 : 0));
  const tronc = new THREE.Mesh(new THREE.CylinderGeometry(rt * (origine ? 0.7 : 0.55), rt, hFut, 10), matBois);
  tronc.name = NOM_TRONC;
  tronc.position.set(0, hFut / 2, 0);
  groupe.add(tronc);
  // Les branches vont aux lobes satellites : seuls les dessins en lobes (A, B) en ont.
  if (style === 'actuel' || style === 'dome') {
    for (const b of h.branches) {
      const dx = b.a.x - b.de.x, dy = b.a.y - b.de.y, dz = b.a.z - b.de.z;
      const l = Math.hypot(dx, dy, dz);
      if (l < 0.05) continue;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(b.rayon * (origine ? 0.6 : 0.35), b.rayon, l, 6), matBois);
      m.name = NOM_BRANCHE;
      m.position.set((b.de.x + b.a.x) / 2, hTronc + (b.de.y + b.a.y) / 2, (b.de.z + b.a.z) / 2);
      orienterSelon(m, { x: dx / l, y: dy / l, z: dz / l });
      groupe.add(m);
    }
  }

  const feuillage = new THREE.Group();
  feuillage.name = NOM_FEUILLAGE;
  feuillage.position.set(0, hTronc, 0);
  feuillage.visible = !arbreNu(essence, ctx.dateStr);
  const base = rgb(o.couleurArbre || COULEUR_FEUILLAGE_DEFAUT);
  const matFeuille = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: style === 'architecte' ? 0.95 : 0.85, ...(style === 'taille' ? { flatShading: true } : {}) });
  appliquerOpacite(matFeuille, ctx.opacite);
  const url = ctx.textures ? urlTexture(o.textureArbre) : undefined;
  if (url && ctx.chargerTexture) matFeuille.map = ctx.chargerTexture(url);
  if (style === 'actuel') lobesOrigine(feuillage, h, port, base, graine, matFeuille, NOM_LOBE, BRUIT_LOBE);
  else if (style === 'dome') lobesDome(feuillage, h, port, base, graine, matFeuille, NOM_LOBE);
  else if (style === 'touffes') touffes(feuillage, port, diametre, base, graine, matFeuille, NOM_LOBE);
  else if (style === 'taille') volumesTailles(feuillage, h, port, base, graine, matFeuille, NOM_LOBE);
  else volumeArchitecte(feuillage, h, port, diametre, base, graine, matFeuille, NOM_LOBE);
  // De pres, des feuilles sur la surface des lobes (three/feuilles.ts) : seulement pour les dessins
  // en lobes, ou elles se posent. Dans le feuillage, elles tombent avec lui en hiver.
  if (style === 'actuel' || style === 'dome') ajouterFeuilles(feuillage, feuillesDuHouppier(h, port, graine), base);
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
