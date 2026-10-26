// three.js et ses exemples, en modules ES (MD/spec-migration-typescript.md §8.3, mise a jour vers la
// 0.186.1 le 16 octobre 2026). Servis par la livraison elle-meme depuis l'etape 5.2 de la feuille de
// route (MD/roadmap-architecture.md) : `assets/vendor/three@0.186.1/…`, copies au build depuis
// node_modules (vite.config.ts), les memes octets que jsDelivr. La page ne depend plus du CDN pour
// ouvrir la Vue 3D.
//
// three.js n'a pas de secours au CDN, et c'est voulu : les exemples importent `three` par son nom, et
// la table d'import de la page ne nomme qu'une adresse. Un secours chargerait une seconde instance de
// la bibliotheque, ou rien. Le fichier vient du meme serveur que la page : s'il manque, la livraison
// est incomplete, ce que l'essai du paquet (scripts/essayer-paquet.mjs) voit avant la mise en ligne.
//
// Jusqu'a la r128, la bibliotheque arrivait par des balises <script> (`three.min.js`, puis
// `examples/js/…`) qui se posaient sur `window.THREE`. Ces fichiers n'existent plus : depuis la
// r160, three.js ne se distribue qu'en modules ES. Le contrat du projet ne change pas pour autant :
// la bibliotheque n'est PAS empaquetee (le programme reste leger, et la 3D ne se charge que si l'on
// ouvre la Vue 3D), et tout le code continue de lire `THREE.` comme un global. Ce module en est le
// seul fournisseur : il importe les modules, et pose dessus `window.THREE`.
//
// Les exemples (`OrbitControls`, `GLTFExporter`, …) importent `three` par son nom : la page porte
// donc une table d'import statique (index.html, `<script type="importmap">`) qui dit ou le trouver.
// Elle et `URL_THREE` ci-dessous nomment le MEME fichier — c'est ce qui garde une seule instance de
// la bibliotheque — et un test le verifie (tests/unit/three/bibliotheque.test.ts). Sa politique de
// contenu est celle des scripts : `script-src 'self'` couvre la livraison, et la table, restee en
// ligne, y entre par son empreinte (deploy/scripts-page.mjs).
//
// **Les couleurs.** Depuis la r152, three.js convertit les couleurs sRGB en lineaire a chaque
// `new THREE.Color('#…')`, et applique l'encodage de sortie. Plan fait l'inverse depuis toujours :
// toutes ses couleurs sont des valeurs d'ecran, et la courbe de film (three/rendu.ts) fait elle-meme
// le passage au lineaire puis le retour. `ColorManagement.enabled = false` rend a la bibliotheque
// le comportement de la r128, sans quoi chaque couleur du plan, de chaque texture et de chaque
// sommet changerait.

import { RACINE_CDN, versLocale } from '../util/integriteCdn.js';

/** La version epinglee : celle de `package.json` (types et banc d'essai), celle que la page charge. */
export const VERSION_THREE = '0.186.1';
/** La bibliotheque chez jsDelivr : l'adresse de reference des empreintes (util/integriteCdn.ts). */
export const RACINE_THREE = RACINE_CDN + 'three@' + VERSION_THREE + '/';
/** Le module de la bibliotheque, relatif a la page : le meme que celui de la table d'import de index.html. */
export const URL_THREE = versLocale(RACINE_THREE + 'build/three.module.js');

/** Le fichier d'un exemple (`controls/OrbitControls.js`), sous `examples/jsm/`, dans la livraison. */
export const urlExemple = (chemin: string): string => versLocale(RACINE_THREE + 'examples/jsm/' + chemin);

/**
 * Depuis la r165, les lumieres sont toujours « physiques » : a intensite egale, elles eclairent π
 * fois moins qu'a la r128 (le mode `useLegacyLights` a disparu). Les reglages de Plan sont ceux de
 * la r128 (0,75 pour le soleil…) : on les multiplie par ce facteur en les posant, ce qui garde les
 * images d'avant.
 */
export const ECHELLE_LUMIERE = Math.PI;

type Module = Record<string, unknown>;

/**
 * EZ-tree (@dgreenheck/ez-tree), le generateur d'arbres : un module ES de plus de 4 Mo (ses textures
 * y sont incluses), qui importe `three` par la table d'import de la page. Il n'est charge que si la
 * bibliotheque d'essences du serveur n'est pas vide (three/ezTree.ts) et dans l'ecran admin des arbres.
 */
export const VERSION_EZ_TREE = '1.1.0';
/** EZ-tree chez jsDelivr : le secours, si la copie de la livraison ne se charge pas. */
export const URL_EZ_TREE_CDN = RACINE_CDN + '@dgreenheck/ez-tree@' + VERSION_EZ_TREE + '/build/ez-tree.es.js';
/** EZ-tree dans la livraison, relatif a la page. */
export const URL_EZ_TREE = versLocale(URL_EZ_TREE_CDN);

let ezTree: Promise<typeof import('@dgreenheck/ez-tree')> | null = null;

/** Charge EZ-tree une seule fois, apres three (meme instance : la table d'import). */
export function chargerEzTree(): Promise<typeof import('@dgreenheck/ez-tree')> {
  // La copie de la livraison d'abord, jsDelivr en secours : EZ-tree importe `three` par la table d'import, la meme instance
  // dans les deux cas.
  ezTree ??= chargerThree().then(() => importer(URL_EZ_TREE).catch(() => importer(URL_EZ_TREE_CDN)) as unknown as Promise<typeof import('@dgreenheck/ez-tree')>).catch((e: unknown) => {
    ezTree = null;
    throw e;
  });
  return ezTree;
}

/**
 * Un import dynamique que ni Vite ni Rollup ne cherchent a resoudre au build : l'adresse est une donnee. Une adresse relative se
 * resout contre la page, pas contre le morceau du programme qui l'importe (`assets/plan-….js`) : c'est contre la page que la table
 * d'import resout `three`, et les deux doivent nommer le meme fichier.
 */
const importer = (url: string): Promise<Module> => import(/* @vite-ignore */ new URL(url, document.baseURI).href) as Promise<Module>;

let coeur: Promise<void> | null = null;

/**
 * Charge la bibliotheque, une seule fois, et la pose sur `window.THREE`. L'espace de noms d'un module
 * ne se modifie pas : le global en est une copie, ou les exemples viennent se poser.
 */
export function chargerThree(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('three.js ne se charge que dans un navigateur'));
  if (window.THREE && !coeur) return Promise.resolve();
  coeur ??= importer(URL_THREE).then((m) => {
    (m.ColorManagement as { enabled: boolean }).enabled = false;
    window.THREE = { ...m } as unknown as NonNullable<typeof window.THREE>;
  }).catch((e: unknown) => {
    // Hors ligne : un nouvel essai a la prochaine ouverture de la Vue 3D.
    coeur = null;
    throw e;
  });
  return coeur;
}

/**
 * Charge un exemple de three.js et pose les noms demandes sur `THREE` (`THREE.OrbitControls`…).
 * Plusieurs exemples se demandent ensemble : ils se telechargent en parallele, et ceux qui en
 * importent d'autres (le compositeur et ses passes) les trouvent par leurs adresses relatives.
 */
export async function chargerExemple(chemin: string, noms: readonly string[]): Promise<void> {
  await chargerThree();
  const m = await importer(urlExemple(chemin));
  const T = window.THREE as unknown as Module;
  for (const nom of noms) {
    if (!(nom in m)) throw new Error('three.js ' + VERSION_THREE + ' : ' + chemin + ' n’exporte pas ' + nom);
    T[nom] = m[nom];
  }
}
