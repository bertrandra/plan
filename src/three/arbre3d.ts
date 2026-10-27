// Un arbre en 3D (MD/spec-arbres-3d.md).
//
// Le plan donne le pied de l'arbre, son essence, sa hauteur et le diametre de son feuillage ;
// l'arbre lui-meme vient d'EZ-tree (three/ezTree.ts), a partir des reglages de l'essence que
// l'administrateur a enregistres. Pour la vitesse, **les arbres d'une meme essence et d'une meme
// variante se partagent une `InstancedMesh`** (une pour les branches, une pour les feuilles) : cent
// chenes, deux maillages, deux appels de dessin.
//
// Chaque arbre du plan reste donc un objet de la scene, un groupe `arbre` **sans maille** : il porte
// le pied, l'echelle et la cle, et les lots d'instances en sont deduits (`synchroniserArbres`) — on
// les refait quand la scene change (un objet pose, masque ou retire), ce qui ne coute que des
// matrices. Le plan reste la source de verite, la scene un reflet.
//
// Sans EZ-tree (hors ligne) ou sans essence, l'arbre se dessine en **repli** : un tronc et une
// boule, ce qu'il faut pour voir ou il est et projeter une ombre.
//
// Le feuillage d'un caduc est masque de novembre a mars, a la date de l'etude d'ensoleillement
// (`actualiserSaison`) : l'ombre portee sur la terrasse change avec la saison. L'export GLB emporte
// les lots tels qu'ils sont vus (extension EXT_mesh_gpu_instancing).

import type * as THREE_NS from 'three';
import { arbreNu, diametreDe, especeDe, especeParId, especesChargees, COULEUR_FEUILLAGE_DEFAUT, HAUTEUR_DEFAUT_M, type EspeceArbre } from '../model/especesArbre.js';
import { graineDe } from '../model/voisinage3d.js';
import { modeleArbre, NB_VARIANTES, type ModeleArbre } from './ezTree.js';
import { appliquerOpacite, type VersLocal } from './primitives.js';
import type { ObjetPlan } from '../model/types.js';

export const NOM_ARBRE = 'arbre';
export const NOM_TRONC = 'arbre-tronc';
export const NOM_FEUILLAGE = 'arbre-feuillage';
export const NOM_LOTS = 'arbres-lots';
export const NOM_LOT_BRANCHES = 'arbres-branches';
export const NOM_LOT_FEUILLES = 'arbres-feuilles';

/** Le tronc du repli : couleur d'ecorce, et un vert de feuillage quand l'objet n'en dit pas. */
const COULEUR_TRONC_REPLI = '#6b5236';
const COULEUR_REPLI = '#4a7c3a';

export interface ContexteArbre {
  /** La scene, ou un groupe pose sur le sol en relief. */
  scene: THREE_NS.Object3D;
  toLocal: VersLocal;
  /** La date de l'etude d'ensoleillement (AAAA-MM-JJ) : un caduc y est nu de novembre a mars. */
  dateStr: string | null;
  opacite?: number | undefined;
}

/** Ce que le groupe `arbre` retient pour que les lots se refassent : tout vient du plan, rien n'est a deviner. */
export interface DonneesArbre {
  /** Vrai : un lot d'instances le dessine ; faux : il porte son propre repli. */
  lot: boolean;
  espece: string;
  caduc: boolean;
  diametre: number;
  hauteur: number;
  variante: number;
  /** La teinte des feuilles (`#RRGGBB`), blanche sans reglage. */
  teinte: string;
}

const estArbre = (o: THREE_NS.Object3D): boolean => o.name === NOM_ARBRE && !!o.userData.arbre;
export const donneesDe = (o: THREE_NS.Object3D): DonneesArbre | undefined => o.userData.arbre as DonneesArbre | undefined;

/** Le repli : un tronc et une boule a la taille de l'arbre. */
function poserRepli(groupe: THREE_NS.Group, d: DonneesArbre, opacite: number | undefined, dateStr: string | null): void {
  const hTronc = Math.max(0.3, d.hauteur * 0.35);
  const rTronc = Math.max(0.06, d.diametre * 0.04);
  const matBois = new THREE.MeshStandardMaterial({ color: COULEUR_TRONC_REPLI, roughness: 0.95 });
  appliquerOpacite(matBois, opacite);
  const tronc = new THREE.Mesh(new THREE.CylinderGeometry(rTronc * 0.7, rTronc, hTronc, 8), matBois);
  tronc.name = NOM_TRONC;
  tronc.position.set(0, hTronc / 2, 0);
  groupe.add(tronc);
  const feuillage = new THREE.Group();
  feuillage.name = NOM_FEUILLAGE;
  const hHouppier = Math.max(0.3, d.hauteur - hTronc * 0.8);
  const matFeuille = new THREE.MeshStandardMaterial({ color: d.teinte === COULEUR_FEUILLAGE_DEFAUT ? COULEUR_REPLI : d.teinte, roughness: 0.9 });
  appliquerOpacite(matFeuille, opacite);
  const boule = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), matFeuille);
  boule.scale.set(d.diametre, hHouppier, d.diametre);
  boule.position.set(0, hTronc * 0.8 + hHouppier / 2, 0);
  feuillage.add(boule);
  feuillage.visible = !arbreNu(d.caduc, dateStr);
  groupe.add(feuillage);
}

/**
 * Pose un arbre : un groupe `arbre` au pied de l'arbre, de `hauteurM` metres et de `diametre` de
 * feuillage, dans l'essence que porte l'objet. Rend le groupe ; les lots d'instances qui le dessinent
 * se font par `synchroniserArbres`.
 */
export function ajouterArbre3d(ctx: ContexteArbre, o: ObjetPlan, hauteurM: number): THREE_NS.Group {
  const centre = o.type === 'circle' ? o.center : { x: 0, y: 0 };
  const pl = ctx.toLocal(centre);
  const groupe = new THREE.Group();
  groupe.name = NOM_ARBRE;
  groupe.position.set(pl.x, 0, pl.z);
  const graine = graineDe(o.key);
  const espece = especeDe(o);
  const d: DonneesArbre = {
    lot: false, espece: espece?.id ?? '', caduc: espece?.caduc ?? true,
    diametre: diametreDe(o, espece), hauteur: Math.max(0.3, hauteurM > 0 ? hauteurM : espece?.hauteurM ?? HAUTEUR_DEFAUT_M),
    variante: graine % NB_VARIANTES, teinte: o.arbre?.couleur || COULEUR_FEUILLAGE_DEFAUT
  };
  // Un quart de tour au hasard (de la cle) : deux arbres du meme lot ne se tournent pas la meme face.
  groupe.rotation.y = ((graine >>> 3) % 360) * Math.PI / 180;
  const modele = espece ? modeleArbre(espece, d.variante) : null;
  d.lot = modele !== null;
  groupe.userData.arbre = d;
  if (!d.lot) poserRepli(groupe, d, ctx.opacite, ctx.dateStr);
  ctx.scene.add(groupe);
  return groupe;
}

/** Les groupes `arbre` de la scene que `visible` laisse voir, avec leurs donnees. */
function arbresDeLaScene(scene: THREE_NS.Object3D, visible: (o: THREE_NS.Object3D) => boolean): { groupe: THREE_NS.Object3D; d: DonneesArbre }[] {
  const out: { groupe: THREE_NS.Object3D; d: DonneesArbre }[] = [];
  scene.traverse((o) => {
    const d = donneesDe(o);
    if (estArbre(o) && d?.lot && visible(o)) out.push({ groupe: o, d });
  });
  return out;
}

const tonDe = (hex: string): THREE_NS.Color => {
  const c = new THREE.Color();
  c.set(/^#[0-9a-f]{6}$/i.test(hex) ? hex : COULEUR_FEUILLAGE_DEFAUT);
  return c;
};

/** Un lot : une maille instanciee de `geometrie`, une matrice par arbre. */
function faireLot(nom: string, geometrie: THREE_NS.BufferGeometry, materiau: THREE_NS.Material, arbres: { groupe: THREE_NS.Object3D; d: DonneesArbre }[], modele: ModeleArbre, avecTeinte: boolean): THREE_NS.InstancedMesh {
  const lot = new THREE.InstancedMesh(geometrie, materiau, arbres.length);
  lot.name = nom;
  const m = new THREE.Matrix4(), echelle = new THREE.Matrix4();
  arbres.forEach(({ groupe, d }, i) => {
    groupe.updateWorldMatrix(true, false);
    echelle.makeScale(d.diametre / modele.largeur, d.hauteur / modele.hauteur, d.diametre / modele.largeur);
    lot.setMatrixAt(i, m.multiplyMatrices(groupe.matrixWorld, echelle));
    if (avecTeinte) lot.setColorAt(i, tonDe(d.teinte));
  });
  lot.instanceMatrix.needsUpdate = true;
  if (lot.instanceColor) lot.instanceColor.needsUpdate = true;
  lot.computeBoundingSphere();
  lot.computeBoundingBox();
  // Pour retrouver l'arbre du plan touche : l'instance `i` est le groupe `proprietaires[i]`.
  lot.userData.proprietaires = arbres.map((a) => a.groupe);
  return lot;
}

/**
 * Refait les lots d'instances d'apres les arbres de la scene que `visible` laisse voir : un arbre
 * masque (vue epuree, objet cache dans le plan) n'y est pas. A rappeler des qu'un arbre est pose,
 * retire ou masque, et quand la date change de saison (`dateStr`). Rend le nombre de lots.
 */
export function synchroniserArbres(scene: THREE_NS.Object3D, dateStr: string | null, visible: (o: THREE_NS.Object3D) => boolean = () => true): number {
  const ancien = scene.getObjectByName(NOM_LOTS);
  if (ancien) {
    scene.remove(ancien);
    // Seules les matrices d'instance sont a nous : la geometrie et le materiau sont ceux du modele, partages.
    ancien.traverse((o) => { (o as THREE_NS.InstancedMesh).dispose?.(); });
  }
  const arbres = arbresDeLaScene(scene, visible);
  if (!arbres.length) return 0;
  const parLot = new Map<string, { espece: EspeceArbre; variante: number; arbres: typeof arbres }>();
  for (const a of arbres) {
    const espece = especeParId(a.d.espece, especesChargees());
    if (!espece) continue;
    const cle = espece.id + '#' + a.d.variante;
    const lot = parLot.get(cle) ?? { espece, variante: a.d.variante, arbres: [] };
    lot.arbres.push(a);
    parLot.set(cle, lot);
  }
  const groupe = new THREE.Group();
  groupe.name = NOM_LOTS;
  for (const { espece, variante, arbres: liste } of parLot.values()) {
    const modele = modeleArbre(espece, variante);
    if (!modele) continue;
    const branches = faireLot(NOM_LOT_BRANCHES, modele.branches, modele.matBois, liste, modele, false);
    groupe.add(branches);
    const feuilles = faireLot(NOM_LOT_FEUILLES, modele.feuilles, modele.matFeuilles, liste, modele, true);
    feuilles.userData.caduc = espece.caduc;
    feuilles.visible = !arbreNu(espece.caduc, dateStr);
    groupe.add(feuilles);
  }
  scene.add(groupe);
  return groupe.children.length / 2;
}

/**
 * Le groupe `arbre` que touche le rayon sur une maille de lot (`instanceId` : l'instance touchee), ou
 * rien si cette maille n'est pas un lot. Les objets du plan se retrouvent par ces groupes.
 */
export function arbreDeLInstance(maille: THREE_NS.Object3D, instanceId: number | undefined): THREE_NS.Object3D | null {
  const liste = maille.userData.proprietaires as THREE_NS.Object3D[] | undefined;
  return liste && instanceId !== undefined ? liste[instanceId] ?? null : null;
}

/**
 * Le temps d'un export, l'ecorce des lots ne garde que sa carte de couleur : les cartes de relief et
 * d'occlusion (1 Mo chacune par ecorce) alourdissaient le .glb de plusieurs Mo pour un gain qu'un
 * telephone en realite augmentee ne montre pas. Rend de quoi tout remettre.
 */
export function allegerArbresPourExport(scene: THREE_NS.Object3D): () => void {
  const retirees: { mat: THREE_NS.MeshPhongMaterial; normalMap: THREE_NS.Texture | null; aoMap: THREE_NS.Texture | null }[] = [];
  const vus = new Set<THREE_NS.Material>();
  scene.traverse((o) => {
    if (o.name !== NOM_LOT_BRANCHES) return;
    const mat = (o as THREE_NS.Mesh).material as THREE_NS.MeshPhongMaterial;
    if (vus.has(mat)) return;
    vus.add(mat);
    if (!mat.normalMap && !mat.aoMap) return;
    retirees.push({ mat, normalMap: mat.normalMap, aoMap: mat.aoMap });
    mat.normalMap = null; mat.aoMap = null;
  });
  return () => { for (const r of retirees) { r.mat.normalMap = r.normalMap; r.mat.aoMap = r.aoMap; r.mat.needsUpdate = true; } };
}

/** Montre ou masque le feuillage de chaque arbre de la scene selon la date : un caduc est nu de novembre a mars. */
export function actualiserSaison(scene: THREE_NS.Object3D, dateStr: string | null): number {
  let changes = 0;
  scene.traverse((obj) => {
    let caduc: boolean | undefined;
    if (obj.name === NOM_LOT_FEUILLES) caduc = obj.userData.caduc as boolean | undefined;
    else if (obj.name === NOM_FEUILLAGE && obj.parent) caduc = donneesDe(obj.parent)?.caduc;
    if (caduc === undefined) return;
    const visible = !arbreNu(caduc, dateStr);
    if (obj.visible !== visible) { obj.visible = visible; changes++; }
  });
  return changes;
}
