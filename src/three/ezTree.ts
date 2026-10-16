// Les arbres generes par EZ-tree (MD/spec-arbres-3d.md).
//
// Plan ne dessine plus d'arbre lui-meme : une essence de la bibliotheque du serveur
// (model/especesArbre.ts) donne les reglages d'EZ-tree, et ce module en tire un **modele** — la
// geometrie des branches et celle des feuilles, avec leurs materiaux — que les arbres de la scene se
// partagent (three/arbre3d.ts les pose en `InstancedMesh`).
//
// - **Une generation par essence et par variante** (trois graines autour de celle de l'essence) : un
//   plan de cent arbres du meme nom coute trois generations, pas cent. Le cache est a ce module, pas
//   aux scenes : leur demolition ne le vide pas.
// - **Les materiaux sont refaits ici.** Ceux d'EZ-tree portent un code de vent (`onBeforeCompile`)
//   qui n'a rien a faire dans une maquette fixe ; on garde ses cartes (ecorce, feuille), on laisse
//   le reste.
// - **Rien n'est charge sans essence** : EZ-tree pese plus de 4 Mo, il ne se telecharge que si la
//   bibliotheque n'est pas vide.

import type * as THREE_NS from 'three';
import type { Tree } from '@dgreenheck/ez-tree';
import { chargerEzTree } from './bibliotheque.js';
import { especesChargees, type EspeceArbre, type ReglagesEz } from '../model/especesArbre.js';
import { chargerEspecesServeur } from '../io/arbresServeur.js';

/** Combien de graines differentes par essence : de quoi ne pas voir deux fois le meme arbre cote a cote. */
export const NB_VARIANTES = 3;
/** L'ecart de graine entre deux variantes : premier, pour que les arbres ne se ressemblent pas. */
const PAS_GRAINE = 7919;

/** Ce qu'un arbre generé donne a la scene : de quoi en poser autant d'exemplaires qu'on veut. */
export interface ModeleArbre {
  branches: THREE_NS.BufferGeometry;
  feuilles: THREE_NS.BufferGeometry;
  matBois: THREE_NS.Material;
  matFeuilles: THREE_NS.Material;
  /** Largeur (le plus grand des deux cotes de la boite, XZ) et hauteur du modele, en unites d'EZ-tree. */
  largeur: number;
  hauteur: number;
  triangles: number;
}

let module_: typeof import('@dgreenheck/ez-tree') | null = null;
const modeles = new Map<string, ModeleArbre>();

/** Pour les tests : pose un faux module EZ-tree (le vrai ne se charge pas sans navigateur) ; `null` l'oublie. */
export function poserModuleEzTreePourTest(m: typeof import('@dgreenheck/ez-tree') | null): void {
  module_ = m;
  modeles.clear();
}

/** EZ-tree est-il charge ? Sans lui, les arbres se dessinent en repli (three/arbre3d.ts). */
export function ezPret(): boolean { return module_ !== null; }

/**
 * Charge EZ-tree s'il y a des essences a dessiner. Ne leve jamais : hors ligne, les arbres restent
 * en repli et la Vue 3D s'ouvre quand meme. Rend vrai quand EZ-tree est la.
 */
export async function preparerEzTree(): Promise<boolean> {
  await chargerEspecesServeur();
  if (module_) return true;
  if (!especesChargees().length) return false;
  try {
    module_ = await chargerEzTree();
    return true;
  } catch {
    return false;
  }
}

/** Pour l'ecran admin, qui charge EZ-tree sans attendre d'essence. */
export async function chargerEzTreeAdmin(): Promise<typeof import('@dgreenheck/ez-tree')> {
  module_ = await chargerEzTree();
  return module_;
}

/** Les reglages d'EZ-tree par defaut (`new Tree().options`), en copie simple. */
export function reglagesParDefaut(): ReglagesEz {
  if (!module_) return {};
  return JSON.parse(JSON.stringify(new module_.Tree().options)) as ReglagesEz;
}

/** Les presets d'EZ-tree (« Oak Medium »…), par nom, en copie. */
export function presetsEz(): Record<string, ReglagesEz> {
  if (!module_) return {};
  return JSON.parse(JSON.stringify(module_.TreePreset)) as Record<string, ReglagesEz>;
}

/**
 * EZ-tree declare ses cartes de couleur en sRGB, et three.js les decode alors a la lecture quel que
 * soit `ColorManagement.enabled`. Plan, lui, rend en sortie lineaire avec des couleurs d'ecran
 * (three/bibliotheque.ts) : decodees, l'ecorce et les feuilles paraissaient presque noires. On les
 * lit donc telles quelles, comme les textures du reste de la scene. Les cartes sont celles d'EZ-tree,
 * partagees entre ses arbres : le reglage est le meme a chaque fois.
 */
function neutraliserLaCouleur(arbre: Tree): void {
  for (const maille of [arbre.branchesMesh, arbre.leavesMesh]) {
    const m = maille.material as THREE_NS.MeshPhongMaterial;
    if (m.map && m.map.colorSpace !== THREE.NoColorSpace) { m.map.colorSpace = THREE.NoColorSpace; m.map.needsUpdate = true; }
  }
}

/** Un arbre EZ-tree genere depuis des reglages et une graine. `null` si EZ-tree n'est pas charge. */
export function genererArbre(reglages: ReglagesEz, graine?: number): Tree | null {
  if (!module_) return null;
  const arbre = new module_.Tree();
  // `copy` ne recopie que les cles que `options` possede deja : un reglage inconnu est ignore.
  arbre.options.copy(reglages as never);
  if (graine !== undefined) arbre.options.seed = graine;
  arbre.generate();
  neutraliserLaCouleur(arbre);
  return arbre;
}

/** La signature des reglages : si l'admin les change, le modele en cache n'est plus le bon. */
const signature = (e: EspeceArbre): string => e.id + ':' + JSON.stringify(e.reglages);

/** Les dimensions d'un modele : la boite des deux geometries. */
function mesurer(...geometries: THREE_NS.BufferGeometry[]): { largeur: number; hauteur: number } {
  let xMin = Infinity, xMax = -Infinity, zMin = Infinity, zMax = -Infinity, yMax = 0;
  for (const g of geometries) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (x < xMin) xMin = x; if (x > xMax) xMax = x;
      if (z < zMin) zMin = z; if (z > zMax) zMax = z;
      if (y > yMax) yMax = y;
    }
  }
  return { largeur: Math.max(0.001, xMax - xMin, zMax - zMin), hauteur: Math.max(0.001, yMax) };
}

/**
 * Le modele d'une essence pour une variante, genere au premier appel. `null` sans EZ-tree, ou si la
 * generation echoue (des reglages que l'admin n'aurait pas du enregistrer) : l'arbre est alors en repli.
 */
export function modeleArbre(e: EspeceArbre, variante: number): ModeleArbre | null {
  if (!module_) return null;
  const v = ((variante % NB_VARIANTES) + NB_VARIANTES) % NB_VARIANTES;
  const cle = signature(e) + '#' + v;
  const deja = modeles.get(cle);
  if (deja) return deja;
  try {
    const graineBase = typeof e.reglages.seed === 'number' ? e.reglages.seed : 0;
    const arbre = genererArbre(e.reglages, graineBase + v * PAS_GRAINE);
    if (!arbre) return null;
    const branches = arbre.branchesMesh.geometry, feuilles = arbre.leavesMesh.geometry;
    const bois = arbre.branchesMesh.material as THREE_NS.MeshPhongMaterial;
    const feuille = arbre.leavesMesh.material as THREE_NS.MeshPhongMaterial;
    // Les feuilles : la carte et la teinte d'EZ-tree, sans son code de vent.
    const matFeuilles = new THREE.MeshPhongMaterial({
      name: 'arbre-feuilles', map: feuille.map, color: feuille.color.clone(), side: THREE.DoubleSide, alphaTest: feuille.alphaTest, dithering: true
    });
    feuille.dispose();
    const { largeur, hauteur } = mesurer(branches, feuilles);
    const m: ModeleArbre = { branches, feuilles, matBois: bois, matFeuilles, largeur, hauteur, triangles: arbre.triangleCount };
    modeles.set(cle, m);
    return m;
  } catch {
    return null;
  }
}

/** Vide le cache (la bibliotheque vient de changer, ou la page se ferme). */
export function libererModeles(): void {
  for (const m of modeles.values()) {
    m.branches.dispose(); m.feuilles.dispose(); m.matBois.dispose(); m.matFeuilles.dispose();
  }
  modeles.clear();
}
